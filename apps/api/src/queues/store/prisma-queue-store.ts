import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import type {
  CreateTicketData,
  QueueStore,
  ServiceRecord,
  TicketRecord,
} from "./queue-store";

/** QueueStore ที่ใช้ PostgreSQL ผ่าน Prisma — สำหรับ production/self-host */
@Injectable()
export class PrismaQueueStore implements QueueStore {
  constructor(private readonly prisma: PrismaService) {}

  getService(serviceId: string): Promise<ServiceRecord | null> {
    return this.prisma.service.findUnique({ where: { id: serviceId } });
  }

  async nextSequence(branchId: string, serviceId: string, queueDate: Date): Promise<number> {
    const seq = await this.prisma.dailySequence.upsert({
      where: { branchId_serviceId_queueDate: { branchId, serviceId, queueDate } },
      create: { branchId, serviceId, queueDate, lastSeq: 1 },
      update: { lastSeq: { increment: 1 } },
    });
    return seq.lastSeq;
  }

  createTicket(data: CreateTicketData): Promise<TicketRecord> {
    return this.prisma.queueTicket.create({ data: data as never }) as Promise<TicketRecord>;
  }

  findWaiting(branchId: string, queueDate: Date): Promise<TicketRecord[]> {
    return this.prisma.queueTicket.findMany({
      where: { branchId, queueDate, state: "WAITING" },
    }) as Promise<TicketRecord[]>;
  }

  findTicket(id: string): Promise<TicketRecord | null> {
    return this.prisma.queueTicket.findUnique({ where: { id } }) as Promise<TicketRecord | null>;
  }

  updateTicket(id: string, data: Partial<TicketRecord>): Promise<TicketRecord> {
    return this.prisma.queueTicket.update({
      where: { id },
      data: data as never,
    }) as Promise<TicketRecord>;
  }

  async statsByState(branchId: string, queueDate: Date): Promise<Record<string, number>> {
    const grouped = await this.prisma.queueTicket.groupBy({
      by: ["state"],
      where: { branchId, queueDate },
      _count: true,
    });
    return Object.fromEntries(grouped.map((g: { state: string; _count: number }) => [g.state, g._count]));
  }
}
