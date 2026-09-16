import { Module } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { QueuesController } from "./queues.controller";
import { QueuesService } from "./queues.service";
import { QUEUE_STORE } from "./store/queue-store";
import { PrismaQueueStore } from "./store/prisma-queue-store";
import { MemoryQueueStore } from "./store/memory-queue-store";

@Module({
  controllers: [QueuesController],
  providers: [
    QueuesService,
    {
      provide: QUEUE_STORE,
      useFactory: (prisma: PrismaService) =>
        process.env.DB_MODE === "memory"
          ? new MemoryQueueStore()
          : new PrismaQueueStore(prisma),
      inject: [PrismaService],
    },
  ],
  exports: [QueuesService],
})
export class QueuesModule {}
