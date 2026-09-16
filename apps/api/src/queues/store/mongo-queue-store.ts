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

    const count = await services.countDocuments({ branchId: "demo" });
    if (count === 0) {
      await services.insertMany([
        { id: "svc-general", branchId: "demo", name: "บริการทั่วไป", ticketPrefix: "A", avgServiceMinutes: 15, isActive: true },
        { id: "svc-vip", branchId: "demo", name: "บริการพิเศษ (VIP)", ticketPrefix: "V", avgServiceMinutes: 30, isActive: true },
      ]);
      this.logger.log("seed บริการตัวอย่างสาขา demo ลง MongoDB แล้ว");
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

  async updateTicket(id: string, data: Partial<TicketRecord>): Promise<TicketRecord> {
    const result = await (await this.tickets()).findOneAndUpdate(
      { id },
      { $set: data },
      { returnDocument: "after" },
    );
    if (!result) throw new Error(`ไม่พบตั๋ว ${id}`);
    return result;
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
