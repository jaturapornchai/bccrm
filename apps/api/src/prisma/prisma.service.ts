import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    if (process.env.DB_MODE !== "prisma") {
      this.logger.log(`DB_MODE=${process.env.DB_MODE ?? "mongo"} — ข้ามการเชื่อมต่อ PostgreSQL`);
      return;
    }
    await this.$connect();
  }

  async onModuleDestroy() {
    if (process.env.DB_MODE !== "prisma") return;
    await this.$disconnect();
  }
}
