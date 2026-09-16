import { forwardRef, Module } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { MongoService } from "../mongo/mongo.service";
import { QueuesController } from "./queues.controller";
import { QueuesService } from "./queues.service";
import { QUEUE_STORE, type QueueStore } from "./store/queue-store";
import { PrismaQueueStore } from "./store/prisma-queue-store";
import { MemoryQueueStore } from "./store/memory-queue-store";
import { MongoQueueStore } from "./store/mongo-queue-store";
import { RealtimeModule } from "../realtime/realtime.module";
import { LineModule } from "../line/line.module";

/**
 * เลือกชั้นเก็บข้อมูลตาม DB_MODE:
 *  - memory → RAM (dev/demo ไม่ต้องมี DB)
 *  - prisma → PostgreSQL (ทางเลือกเดิม)
 *  - อื่น ๆ (ค่าเริ่มต้น) → MongoDB ✅ ฐานข้อมูลหลักของโปรเจกต์
 */
@Module({
  imports: [RealtimeModule, forwardRef(() => LineModule)],
  controllers: [QueuesController],
  providers: [
    QueuesService,
    {
      provide: QUEUE_STORE,
      useFactory: (prisma: PrismaService, mongo: MongoService): QueueStore => {
        const mode = process.env.DB_MODE;
        if (mode === "memory") return new MemoryQueueStore();
        if (mode === "prisma") return new PrismaQueueStore(prisma);
        return new MongoQueueStore(mongo);
      },
      inject: [PrismaService, MongoService],
    },
  ],
  exports: [QueuesService, QUEUE_STORE],
})
export class QueuesModule {}
