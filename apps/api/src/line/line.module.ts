import { Module } from "@nestjs/common";
import { LineWebhookController } from "./line-webhook.controller";
import { LineNotifyService } from "./line-notify.service";
import { QueuesModule } from "../queues/queues.module";

@Module({
  imports: [QueuesModule],
  controllers: [LineWebhookController],
  providers: [LineNotifyService],
  exports: [LineNotifyService],
})
export class LineModule {}
