import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  Post,
  Req,
} from "@nestjs/common";
import type { RawBodyRequest } from "@nestjs/common";
import type { Request } from "express";
import { extractUserId, verifyLineSignature, type LineWebhookBody } from "@bccrm/line-sdk";
import { LineNotifyService } from "./line-notify.service";
import { LineAiService } from "./line-ai.service";

/**
 * รับ webhook จาก LINE Platform
 * URL ที่ตั้งใน LINE Developers Console: https://<domain>/webhooks/line
 */
@Controller("webhooks")
export class LineWebhookController {
  constructor(
    private readonly notify: LineNotifyService,
    private readonly ai: LineAiService,
  ) {}

  @Post("line")
  @HttpCode(200) // LINE ต้องการ 200 เสมอ ไม่อย่างนั้นจะ retry
  async handle(
    @Req() req: RawBodyRequest<Request>,
    @Headers("x-line-signature") signature?: string,
  ) {
    const secret = process.env.LINE_CHANNEL_SECRET;
    const rawBody = req.rawBody?.toString("utf8") ?? (typeof req.body === "string" ? req.body : JSON.stringify(req.body));

    // ตรวจสอบ signature ถ้ามีการตั้งค่า secret
    if (secret) {
      if (!signature || !verifyLineSignature(secret, rawBody, signature)) {
        throw new BadRequestException("ลายเซ็น LINE ไม่ถูกต้อง");
      }
    }

    let body: LineWebhookBody;
    try {
      body = typeof req.body === "object" && req.body && "events" in req.body
        ? (req.body as LineWebhookBody)
        : (JSON.parse(rawBody) as LineWebhookBody);
    } catch {
      throw new BadRequestException("รูปแบบข้อมูล JSON ไม่ถูกต้อง");
    }

    // ประมวลผล async — ตอบ 200 ก่อนเพื่อไม่ให้ LINE timeout
    setImmediate(() => this.dispatch(body).catch((err) => console.error("LINE webhook error:", err)));

    return { ok: true };
  }

  private async dispatch(body: LineWebhookBody) {
    if (!body?.events) return;
    for (const event of body.events) {
      switch (event.type) {
        case "follow":
          // ลูกค้าเพิ่มเพื่อน → สร้าง/อัปเดต Customer + ส่งข้อความต้อนรับ
          await this.notify.onFollow(event);
          break;
        case "unfollow":
          await this.notify.onUnfollow(event);
          break;
        case "postback":
          // ปุ่มจาก Flex/Rich Menu เช่น action=cancel&ticketId=...
          await this.notify.onPostback(event);
          break;
        case "message":
          // AI Chatbot คุยตอบลูกค้า
          if (event.message?.type === "text" && event.message.text) {
            const userId = extractUserId(event);
            if (userId) {
              await this.ai.handleIncomingMessage(userId, event.message.text, event.replyToken);
            }
          }
          break;
      }
    }
  }
}
