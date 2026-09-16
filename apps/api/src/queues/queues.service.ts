import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  TicketState,
  assertTransition,
  estimateWaitMinutes,
  formatTicketNumber,
  sortWaitingQueue,
  TicketSource as EngineSource,
  type QueueEntry,
} from "@bccrm/queue-engine";
import { QUEUE_STORE, type QueueStore, type ServiceRecord, type TicketRecord } from "./store/queue-store";
import { QueueGateway } from "../realtime/queue.gateway";
import { LineNotifyService } from "../line/line-notify.service";
import type { CreateTicketDto } from "./dto/queue.dto";

/** วันที่คิว (ตัดเวลาออก) ตาม timezone ร้าน — Phase 1 ใช้ Asia/Bangkok ตรง ๆ */
export function queueDateOf(date = new Date()): Date {
  const bangkok = new Date(date.toLocaleString("en-US", { timeZone: "Asia/Bangkok" }));
  return new Date(bangkok.getFullYear(), bangkok.getMonth(), bangkok.getDate());
}

@Injectable()
export class QueuesService {
  constructor(
    @Inject(QUEUE_STORE) private readonly store: QueueStore,
    private readonly gateway: QueueGateway,
    @Inject(forwardRef(() => LineNotifyService))
    private readonly lineNotify: LineNotifyService,
  ) {}

  /**
   * ออกเลขคิว — nextSequence ต้อง atomic ที่ชั้น store
   * (memory: ล็อกใน process / prisma: upsert increment ใน transaction)
   * ป้องกันเลขชนกันแม้มีหลายช่องทาง (kiosk/LIFF/พนักงาน/MCP) ออกพร้อมกัน
   */
  async createTicket(dto: CreateTicketDto): Promise<TicketRecord> {
    const service = await this.store.getService(dto.serviceId);
    if (!service || !service.isActive) throw new NotFoundException("ไม่พบบริการนี้");

    const queueDate = queueDateOf();
    const sequence = await this.store.nextSequence(dto.branchId, dto.serviceId, queueDate);
    const number = formatTicketNumber(service.ticketPrefix, sequence);

    const state = dto.state ?? "WAITING";
    const customerId = dto.customerId ?? dto.lineUserId ?? undefined;

    const ticket = await this.store.createTicket({
      branchId: dto.branchId,
      serviceId: dto.serviceId,
      counterId: dto.counterId,
      customerId,
      number,
      queueDate,
      sequence,
      source: dto.source,
      state,
      isVip: dto.isVip ?? false,
    });

    this.gateway.emitQueueUpdate(dto.branchId, { type: "created", ticket });

    // หลีกเลี่ยงการ push ถ้าไม่จำเป็น: ตอนจองคิว ลูกค้าเห็นบัตรคิวบนหน้า LIFF อยู่แล้ว (ไม่เปลืองโควต้า)
    const lineUserId = dto.lineUserId ?? (customerId && customerId.startsWith("U") ? customerId : null);
    const pushOnBooking = process.env.ENABLE_LINE_PUSH_ON_BOOKING === "true";
    if (lineUserId && pushOnBooking) {
      const aheadCount = state === "WAITING" ? (await this.waitingList(dto.branchId)).length - 1 : 0;
      const estimatedWait = estimateWaitMinutes(Math.max(0, aheadCount), service.avgServiceMinutes);
      const liffUrl = process.env.LIFF_URL ?? "http://localhost:3002";
      this.lineNotify.sendTicketCard(lineUserId, {
        ticketNumber: number,
        branchName: "สาขาหลัก (Demo)",
        serviceName: service.name,
        aheadCount: Math.max(0, aheadCount),
        estimatedWaitMinutes: estimatedWait,
        ticketUrl: `${liffUrl}?ticketId=${ticket.id}`,
      }).catch((err) => console.error("Send ticket card error:", err));
    }

    return ticket;
  }

  /** ดึงคิวที่รออยู่ของสาขาในวันนี้ เรียงตามนโยบาย queue-engine */
  async waitingList(branchId: string): Promise<TicketRecord[]> {
    const tickets = await this.store.findWaiting(branchId, queueDateOf());

    const entries: QueueEntry[] = tickets.map((t) => ({
      ticketId: t.id,
      ticketNumber: t.number,
      source: t.source as unknown as EngineSource,
      isVip: t.isVip,
      waitingSince: t.createdAt,
    }));

    const ordered = sortWaitingQueue(entries);
    const rank = new Map(ordered.map((e, i) => [e.ticketId, i]));
    return tickets.sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
  }

  /** เรียกคิวถัดไปเข้าเคาน์เตอร์ */
  async callNext(branchId: string, counterId: string, staffId: string): Promise<TicketRecord> {
    const [next] = await this.waitingList(branchId);
    if (!next) throw new NotFoundException("ไม่มีคิวที่รออยู่");

    const called = await this.changeState(next.id, TicketState.Called, {
      counterId,
      servedById: staffId,
      calledAt: new Date(),
    });
    // แจ้งจอ TV/ลำโพงเรียกคิวแยกจากอัปเดตทั่วไป
    this.gateway.emitCall(branchId, { number: called.number, counterName: counterId });

    // แจ้งเตือนลูกค้าผ่าน LINE ถ้ามี customerId/lineUserId
    if (called.customerId && called.customerId.startsWith("U")) {
      const liffUrl = process.env.LIFF_URL ?? "http://localhost:3002";
      this.lineNotify.sendCalledAlert(
        called.customerId,
        called.number,
        counterId,
        `${liffUrl}?ticketId=${called.id}`,
      ).catch((err) => console.error("Send called alert error:", err));
    }

    return called;
  }

  /** เปลี่ยนสถานะคิวตาม state machine ของ queue-engine (รับได้ทั้ง "serving" และ "Serving") */
  async changeState(
    ticketId: string,
    to: TicketState | string,
    extra: Record<string, unknown> = {},
  ): Promise<TicketRecord> {
    const ticket = await this.store.findTicket(ticketId);
    if (!ticket) throw new NotFoundException("ไม่พบตั๋วคิวนี้");

    const from = ticket.state.toLowerCase() as TicketState;
    const target = (typeof to === "string" ? to.toLowerCase() : to) as TicketState;

    try {
      assertTransition(from, target);
    } catch {
      throw new BadRequestException(`เปลี่ยนสถานะจาก ${ticket.state} ไป ${target} ไม่ได้`);
    }

    const stateField: Record<string, string> = {
      serving: "servedAt",
      done: "doneAt",
      cancelled: "cancelledAt",
    };
    if (stateField[target] && !extra[stateField[target]]) {
      extra[stateField[target]] = new Date();
    }

    const updated = await this.store.updateTicket(ticketId, {
      state: target.toUpperCase(),
      ...extra,
    } as Partial<TicketRecord>);

    this.gateway.emitQueueUpdate(updated.branchId, { type: "state_changed", ticket: updated });
    return updated;
  }

  /** รายการบริการของสาขา */
  async listServices(branchId: string): Promise<ServiceRecord[]> {
    return this.store.listServices(branchId);
  }

  /** บริการเดี่ยว */
  async getService(serviceId: string): Promise<ServiceRecord | null> {
    return this.store.getService(serviceId);
  }

  /** รายละเอียดตั๋วพร้อมคำนวณคิวข้างหน้าและเวลารอ */
  async getTicketDetails(ticketId: string): Promise<{
    ticket: TicketRecord;
    service: ServiceRecord | null;
    aheadCount: number;
    estimatedWaitMinutes: number;
  }> {
    const ticket = await this.store.findTicket(ticketId);
    if (!ticket) throw new NotFoundException("ไม่พบตั๋วคิวนี้");

    const service = await this.store.getService(ticket.serviceId);
    const avgMinutes = service?.avgServiceMinutes ?? 15;

    let aheadCount = 0;
    if (ticket.state === "WAITING") {
      const waiting = await this.waitingList(ticket.branchId);
      const index = waiting.findIndex((t) => t.id === ticket.id);
      aheadCount = index >= 0 ? index : 0;
    }

    const estimatedWaitMinutes = estimateWaitMinutes(aheadCount, avgMinutes);

    return {
      ticket,
      service,
      aheadCount,
      estimatedWaitMinutes,
    };
  }

  /** ตั๋วคิวที่กำลังรอรับบริการอยู่ของลูกค้า */
  async getActiveCustomerTicket(branchId: string, customerId: string) {
    const ticket = await this.store.findActiveCustomerTicket(branchId, customerId, queueDateOf());
    if (!ticket) return null;
    return this.getTicketDetails(ticket.id);
  }

  /** ลูกค้ายกเลิกคิว */
  async cancelTicket(ticketId: string): Promise<TicketRecord> {
    return this.changeState(ticketId, TicketState.Cancelled);
  }

  /** สถิติวันนี้ของสาขา — ใช้บนจอ dashboard */
  async todayStats(branchId: string): Promise<Record<string, number>> {
    return this.store.statsByState(branchId, queueDateOf());
  }
}
