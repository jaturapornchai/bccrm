import { forwardRef, Module } from "@nestjs/common";
import { LineWebhookController } from "./line-webhook.controller";
import { LineNotifyService } from "./line-notify.service";
import { CustomerController } from "./customer.controller";
import { QueuesModule } from "../queues/queues.module";

import { LineAiService } from "./line-ai.service";

import { ChatController } from "./chat.controller";

@Module({
  imports: [forwardRef(() => QueuesModule)],
  controllers: [LineWebhookController, CustomerController, ChatController],
  providers: [LineNotifyService, LineAiService],
  exports: [LineNotifyService, LineAiService],
})
export class LineModule {}
