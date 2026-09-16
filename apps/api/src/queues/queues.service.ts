import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import {
  TicketState,
  assertTransition,
  formatTicketNumber,
  sortWaitingQueue,
  TicketSource as EngineSource,
  type QueueEntry,
} from "@bccrm/queue-engine";
import type { CreateTicketDto } from "./dto/queue.dto";

/** วันที่คิว (ตัดเวลาออก) ตาม timezone ร้าน — Phase 1 ใช้ Asia/Bangkok ตรง ๆ */
function queueDateOf(date = new Date()): Date {
  const bangkok = new Date(date.toLocaleString("en-US", { timeZone: "Asia/Bangkok" }));
  return new Date(bangkok.getFullYear(), bangkok.getMonth(), bangkok.getDate());
}

@Injectable()
export class QueuesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * ออกเลขคิว — ทำใน transaction เดียว: อัปเดต DailySequence แล้วสร้างตั๋ว
   * ป้องกันเลขชนกันแม้มีหลายช่องทาง (kiosk/LIFF/พนักงาน) ออกพร้อมกัน
   */
  async createTicket(dto: CreateTicketDto) {
    const service = await this.prisma.service.findUnique({ where: { id: dto.serviceId } });
    if (!service || !service.isActive) throw new NotFoundException("ไม่พบบริการนี้");

    const queueDate = queueDateOf();

    return this.prisma.$transaction(async (tx) => {
      const seq = await tx.dailySequence.upsert({
        where: {
          branchId_serviceId_queueDate: {
            branchId: dto.branchId,
            serviceId: dto.serviceId,
            queueDate,
          },
        },
        create: { branchId: dto.branchId, serviceId: dto.serviceId, queueDate, lastSeq: 1 },
        update: { lastSeq: { increment: 1 } },
      });

      const number = formatTicketNumber(service.ticketPrefix, seq.lastSeq);

      return tx.queueTicket.create({
        data: {
          branchId: dto.branchId,
          serviceId: dto.serviceId,
          counterId: dto.counterId,
          customerId: dto.customerId,
          number,
          queueDate,
          sequence: seq.lastSeq,
          source: dto.source,
          state: dto.source === "LINE_BOOKING" ? "BOOKED" : "WAITING",
          isVip: dto.isVip ?? false,
        },
        include: { service: true, customer: true },
      });
    });
  }

  /** ดึงคิวที่รออยู่ของสาขาในวันนี้ เรียงตามนโยบาย queue-engine */
  async waitingList(branchId: string) {
    const tickets = await this.prisma.queueTicket.findMany({
      where: { branchId, queueDate: queueDateOf(), state: "WAITING" },
      include: { service: true, customer: true },
    });

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
  async callNext(branchId: string, counterId: string, staffId: string) {
    const [next] = await this.waitingList(branchId);
    if (!next) throw new NotFoundException("ไม่มีคิวที่รออยู่");

    return this.changeState(next.id, "CALLED", { counterId, servedById: staffId, calledAt: new Date() });
  }

  /** เปลี่ยนสถานะคิวตาม state machine ของ queue-engine */
  async changeState(
    ticketId: string,
    to: keyof typeof TicketState | TicketState,
    extra: Record<string, unknown> = {},
  ) {
    const ticket = await this.prisma.queueTicket.findUnique({ where: { id: ticketId } });
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

    return this.prisma.queueTicket.update({
      where: { id: ticketId },
      data: { state: target.toUpperCase() as never, ...extra },
      include: { service: true, customer: true, counter: true },
    });
  }

  /** สถิติวันนี้ของสาขา — ใช้บนจอ dashboard */
  async todayStats(branchId: string) {
    const queueDate = queueDateOf();
    const grouped = await this.prisma.queueTicket.groupBy({
      by: ["state"],
      where: { branchId, queueDate },
      _count: true,
    });
    return Object.fromEntries(grouped.map((g) => [g.state, g._count]));
  }
}
