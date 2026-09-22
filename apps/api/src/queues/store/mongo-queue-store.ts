import { Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { Collection } from "mongodb";
import { MongoService } from "../../mongo/mongo.service";
import type {
  CreateTicketData,
  QueueStore,
  ServiceRecord,
  TicketRecord,
} from "./queue-store";

/**
 * QueueStore บน MongoDB จริง — production/self-host
 * - ออกเลขคิว atomic ด้วย findOneAndUpdate + $inc + upsert (กันเลขชนระดับ database)
 * - unique index (branchId, queueDate, number) กันตั๋วซ้ำ
 * - seed บริการตัวอย่างของสาขา demo อัตโนมัติถ้ายังว่าง (idempotent, ทำครั้งแรกที่ถูกเรียก)
 */
@Injectable()
export class MongoQueueStore implements QueueStore {
  private readonly logger = new Logger(MongoQueueStore.name);
  private setupOnce: Promise<void> | null = null;

  constructor(private readonly mongo: MongoService) {}

  private async tickets(): Promise<Collection<TicketRecord>> {
    return (await this.mongo.db()).collection<TicketRecord>("queue_tickets");
  }

  private async services(): Promise<Collection<ServiceRecord>> {
    return (await this.mongo.db()).collection<ServiceRecord>("services");
  }

  private async sequences(): Promise<
    Collection<{ branchId: string; serviceId: string; queueDate: Date; lastSeq: number }>
  > {
    return (await this.mongo.db()).collection("daily_sequences");
  }

  /** สร้าง index + seed — idempotent ทำครั้งเดียวต่อ process */
  private ensureSetup(): Promise<void> {
    this.setupOnce ??= this.setup().catch((err) => {
      this.setupOnce = null; // ล้มแล้วให้ลองใหม่รอบหน้า
      throw err;
    });
    return this.setupOnce;
  }

  private async setup(): Promise<void> {
    const tickets = await this.tickets();
    const services = await this.services();
    const sequences = await this.sequences();

    await tickets.createIndex(
      { branchId: 1, queueDate: 1, number: 1 },
      { unique: true, name: "uniq_ticket_number_per_day" },
    );
    await tickets.createIndex({ branchId: 1, queueDate: 1, state: 1 });
    await sequences.createIndex(
      { branchId: 1, serviceId: 1, queueDate: 1 },
      { unique: true, name: "uniq_sequence_per_day" },
    );

    const defaultServices = [
      { id: "svc-table-small", branchId: "demo", name: "โต๊ะ 1-2 ท่าน (โซนคาเฟ่มินิมอล)", ticketPrefix: "A", avgServiceMinutes: 20, isActive: true },
      { id: "svc-table-medium", branchId: "demo", name: "โต๊ะ 3-4 ท่าน (โซนครอบครัว/กลุ่มเพื่อน)", ticketPrefix: "B", avgServiceMinutes: 30, isActive: true },
      { id: "svc-table-large", branchId: "demo", name: "โต๊ะใหญ่ 5-8 ท่าน (โซนปาร์ตี้หม้อไฟ & บิงซู)", ticketPrefix: "C", avgServiceMinutes: 40, isActive: true },
      { id: "svc-takeaway", branchId: "demo", name: "สั่งกลับบ้าน (Takeaway)", ticketPrefix: "T", avgServiceMinutes: 15, isActive: true },
    ];

    // Remove old service seeds and upsert Seoulmind table queues
    await services.deleteMany({ branchId: "demo" });
    for (const svc of defaultServices) {
      await services.updateOne({ id: svc.id }, { $set: svc }, { upsert: true });
    }
    this.logger.log("seed บริการโต๊ะอาหารร้านโซมายด์ เชียงใหม่ สาขา demo ลง MongoDB แล้ว");

    const today = new Date();
    const bangkok = new Date(today.toLocaleString("en-US", { timeZone: "Asia/Bangkok" }));
    const queueDate = new Date(bangkok.getFullYear(), bangkok.getMonth(), bangkok.getDate());

    const ticketCount = await tickets.countDocuments({ branchId: "demo", queueDate });
    if (ticketCount === 0) {
      const makeTicket = (
        number: string,
        serviceId: string,
        sequence: number,
        state: string,
        counterId: string | null,
        minutesAgo: number,
        isVip = false,
      ): TicketRecord => {
        const created = new Date(Date.now() - minutesAgo * 60_000);
        return {
          id: randomUUID(),
          branchId: "demo",
          serviceId,
          counterId,
          customerId: null,
          servedById: null,
          number,
          queueDate,
          sequence,
          source: "WALK_IN_KIOSK",
          state,
          isVip,
          createdAt: created,
          checkedInAt: null,
          calledAt: state === "CALLED" || state === "SERVING" || state === "DONE" ? created : null,
          servedAt: state === "SERVING" || state === "DONE" ? created : null,
          doneAt: state === "DONE" ? new Date(created.getTime() + 45 * 60_000) : null,
          cancelledAt: null,
        };
      };

      await tickets.insertMany([
        makeTicket("A001", "svc-table-small", 1, "DONE", "โต๊ะ A-01 (โซนคาเฟ่)", 90),
        makeTicket("A002", "svc-table-small", 2, "DONE", "โต๊ะ A-02 (โซนคาเฟ่)", 50),
        makeTicket("A003", "svc-table-small", 3, "SERVING", "โต๊ะ A-03 (โซนคาเฟ่)", 15),
        makeTicket("A004", "svc-table-small", 4, "CALLED", "เคาน์เตอร์ต้อนรับหน้าร้านโซมายด์", 2),
        makeTicket("A005", "svc-table-small", 5, "WAITING", null, 12),
        makeTicket("A006", "svc-table-small", 6, "WAITING", null, 6),
        makeTicket("B001", "svc-table-medium", 1, "SERVING", "โต๊ะ B-01 (โซนใน)", 25),
        makeTicket("B002", "svc-table-medium", 2, "WAITING", null, 10),
        makeTicket("C001", "svc-table-large", 1, "WAITING", null, 5),
      ]);

      await sequences.updateOne(
        { branchId: "demo", serviceId: "svc-table-small", queueDate },
        { $set: { lastSeq: 6 } },
        { upsert: true },
      );
      await sequences.updateOne(
        { branchId: "demo", serviceId: "svc-table-medium", queueDate },
        { $set: { lastSeq: 2 } },
        { upsert: true },
      );
      await sequences.updateOne(
        { branchId: "demo", serviceId: "svc-table-large", queueDate },
        { $set: { lastSeq: 1 } },
        { upsert: true },
      );

      this.logger.log("seed คิวโต๊ะอาหารร้านโซมายด์วันนี้ลง MongoDB แล้ว (A001-A006, B001-B002, C001)");
    }
  }

  async getService(serviceId: string): Promise<ServiceRecord | null> {
    await this.ensureSetup();
    return (await this.services()).findOne({ id: serviceId });
  }

  async listServices(branchId: string): Promise<ServiceRecord[]> {
    await this.ensureSetup();
    return (await this.services()).find({ branchId, isActive: true }).toArray();
  }

  /** atomic: $inc + upsert ใน Mongo จุดเดียว — หลาย client ออกเลขพร้อมกันไม่ชน */
  async nextSequence(branchId: string, serviceId: string, queueDate: Date): Promise<number> {
    await this.ensureSetup();
    const result = await (await this.sequences()).findOneAndUpdate(
      { branchId, serviceId, queueDate },
      { $inc: { lastSeq: 1 } },
      { upsert: true, returnDocument: "after" },
    );
    return result!.lastSeq;
  }

  async createTicket(data: CreateTicketData): Promise<TicketRecord> {
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
    await (await this.tickets()).insertOne(ticket);
    return ticket;
  }

  async findWaiting(branchId: string, queueDate: Date): Promise<TicketRecord[]> {
    await this.ensureSetup();
    return (await this.tickets()).find({ branchId, queueDate, state: "WAITING" }).toArray();
  }

  async findCurrentCalling(branchId: string, queueDate: Date): Promise<TicketRecord[]> {
    await this.ensureSetup();
    return (await this.tickets())
      .find({
        branchId,
        queueDate,
        state: { $in: ["CALLED", "SERVING"] },
      })
      .sort({ calledAt: -1, servedAt: -1 })
      .toArray();
  }

  async findTicket(id: string): Promise<TicketRecord | null> {
    await this.ensureSetup();
    return (await this.tickets()).findOne({ id });
  }

  async findActiveCustomerTicket(
    branchId: string,
    customerId: string,
    queueDate: Date,
  ): Promise<TicketRecord | null> {
    await this.ensureSetup();
    return (await this.tickets()).findOne({
      branchId,
      customerId,
      queueDate,
      state: { $in: ["WAITING", "CALLED", "SERVING", "BOOKED"] },
    });
  }

  async updateTicket(id: string, data: Partial<TicketRecord>, expectedState?: string): Promise<TicketRecord | null> {
    return (await this.tickets()).findOneAndUpdate(
      expectedState ? { id, state: expectedState } : { id },
      { $set: data },
      { returnDocument: "after" },
    );
  }

  async statsByState(branchId: string, queueDate: Date): Promise<Record<string, number>> {
    await this.ensureSetup();
    const grouped = await (await this.tickets())
      .aggregate<{ _id: string; count: number }>([
        { $match: { branchId, queueDate } },
        { $group: { _id: "$state", count: { $sum: 1 } } },
      ])
      .toArray();
    return Object.fromEntries(grouped.map((g) => [g._id, g.count]));
  }
}
