import { Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type {
  CreateTicketData,
  QueueStore,
  ServiceRecord,
  TicketRecord,
} from "./queue-store";

/**
 * QueueStore ใน RAM — สำหรับ dev/demo ไม่ต้องมี PostgreSQL
 * มาพร้อมข้อมูลตัวอย่าง: สาขา "demo", บริการ A (ทั่วไป) / V (VIP),
 * เคาน์เตอร์ 1-2 และคิวตัวอย่างหลายสถานะ
 * ⚠️ ข้อมูลหายเมื่อรีสตาร์ท — ห้ามใช้ production
 */
@Injectable()
export class MemoryQueueStore implements QueueStore {
  private readonly logger = new Logger(MemoryQueueStore.name);
  private readonly services = new Map<string, ServiceRecord>();
  private readonly tickets = new Map<string, TicketRecord>();
  private readonly sequences = new Map<string, number>(); // key: branch|service|date

  constructor() {
    this.seedDemoData();
  }

  getService(serviceId: string): Promise<ServiceRecord | null> {
    return Promise.resolve(this.services.get(serviceId) ?? null);
  }

  listServices(branchId: string): Promise<ServiceRecord[]> {
    return Promise.resolve(
      [...this.services.values()].filter((s) => s.branchId === branchId && s.isActive),
    );
  }

  nextSequence(branchId: string, serviceId: string, queueDate: Date): Promise<number> {
    const key = `${branchId}|${serviceId}|${queueDate.toISOString()}`;
    const next = (this.sequences.get(key) ?? 0) + 1;
    this.sequences.set(key, next);
    return Promise.resolve(next);
  }

  createTicket(data: CreateTicketData): Promise<TicketRecord> {
    const ticket: TicketRecord = {
      id: randomUUID(),
      counterId: data.counterId ?? null,
      customerId: data.customerId ?? null,
      servedById: null,
      checkedInAt: null,
      calledAt: null,
      servedAt: null,
      doneAt: null,
      cancelledAt: null,
      createdAt: new Date(),
      ...data,
    };
    this.tickets.set(ticket.id, ticket);
    return Promise.resolve(ticket);
  }

  findWaiting(branchId: string, queueDate: Date): Promise<TicketRecord[]> {
    const day = queueDate.getTime();
    return Promise.resolve(
      [...this.tickets.values()].filter(
        (t) => t.branchId === branchId && t.queueDate.getTime() === day && t.state === "WAITING",
      ),
    );
  }

  findTicket(id: string): Promise<TicketRecord | null> {
    return Promise.resolve(this.tickets.get(id) ?? null);
  }

  findActiveCustomerTicket(
    branchId: string,
    customerId: string,
    queueDate: Date,
  ): Promise<TicketRecord | null> {
    const day = queueDate.getTime();
    const activeStates = new Set(["WAITING", "CALLED", "SERVING", "BOOKED"]);
    const found = [...this.tickets.values()].find(
      (t) =>
        t.branchId === branchId &&
        t.customerId === customerId &&
        t.queueDate.getTime() === day &&
        activeStates.has(t.state),
    );
    return Promise.resolve(found ?? null);
  }

  updateTicket(id: string, data: Partial<TicketRecord>): Promise<TicketRecord> {
    const ticket = this.tickets.get(id);
    if (!ticket) throw new Error(`ไม่พบตั๋ว ${id}`);
    const updated = { ...ticket, ...data, id: ticket.id };
    this.tickets.set(id, updated);
    return Promise.resolve(updated);
  }

  statsByState(branchId: string, queueDate: Date): Promise<Record<string, number>> {
    const day = queueDate.getTime();
    const stats: Record<string, number> = {};
    for (const t of this.tickets.values()) {
      if (t.branchId === branchId && t.queueDate.getTime() === day) {
        stats[t.state] = (stats[t.state] ?? 0) + 1;
      }
    }
    return Promise.resolve(stats);
  }

  /** ข้อมูลตัวอย่างให้ demo ใช้งานได้ทันที */
  private seedDemoData() {
    const today = new Date();
    const queueDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    this.services.set("svc-general", {
      id: "svc-general",
      branchId: "demo",
      name: "บริการทั่วไป",
      ticketPrefix: "A",
      avgServiceMinutes: 15,
      isActive: true,
    });
    this.services.set("svc-vip", {
      id: "svc-vip",
      branchId: "demo",
      name: "บริการพิเศษ (VIP)",
      ticketPrefix: "V",
      avgServiceMinutes: 30,
      isActive: true,
    });

    const seedTicket = (
      number: string,
      serviceId: string,
      sequence: number,
      state: string,
      isVip: boolean,
      minutesAgo: number,
      source = "WALK_IN_KIOSK",
    ) => {
      const created = new Date(Date.now() - minutesAgo * 60_000);
      const ticket: TicketRecord = {
        id: randomUUID(),
        branchId: "demo",
        serviceId,
        counterId: state === "SERVING" || state === "DONE" ? "counter-1" : null,
        customerId: null,
        servedById: null,
        number,
        queueDate,
        sequence,
        source,
        state,
        isVip,
        createdAt: created,
        checkedInAt: null,
        calledAt: state === "SERVING" || state === "DONE" ? created : null,
        servedAt: state === "SERVING" || state === "DONE" ? created : null,
        doneAt: state === "DONE" ? new Date(created.getTime() + 12 * 60_000) : null,
        cancelledAt: null,
      };
      this.tickets.set(ticket.id, ticket);
      this.sequences.set(`demo|${serviceId}|${queueDate.toISOString()}`, sequence);
    };

    seedTicket("A001", "svc-general", 1, "DONE", false, 95);
    seedTicket("A002", "svc-general", 2, "SERVING", false, 40);
    seedTicket("A003", "svc-general", 3, "WAITING", false, 35);
    seedTicket("A004", "svc-general", 4, "WAITING", false, 12, "LINE_BOOKING");
    seedTicket("V001", "svc-vip", 1, "WAITING", true, 3);
    seedTicket("A005", "svc-general", 5, "NO_SHOW", false, 60, "STAFF_CREATED");

    this.logger.log("โหมดหน่วยความจำ: โหลดข้อมูลตัวอย่างสาขา demo แล้ว (A001-A005, V001)");
  }
}
