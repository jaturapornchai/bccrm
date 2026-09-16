import { Module } from "@nestjs/common";
import { QueueGateway } from "./queue.gateway";

@Module({
  providers: [QueueGateway],
  exports: [QueueGateway],
})
export class RealtimeModule {}
