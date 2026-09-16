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
import { verifyLineSignature, type LineWebhookBody } from "@bccrm/line-sdk";
import { LineNotifyService } from "./line-notify.service";

/**
 * รับ webhook จาก LINE Platform
 * URL ที่ตั้งใน LINE Developers Console: https://<domain>/webhooks/line
 */
@Controller("webhooks")
export class LineWebhookController {
  constructor(private readonly notify: LineNotifyService) {}

  @Post("line")
  @HttpCode(200) // LINE ต้องการ 200 เสมอ ไม่อย่างนั้นจะ retry
  async handle(
    @Req() req: RawBodyRequest<Request>,
    @Headers("x-line-signature") signature: string,
  ) {
    const secret = process.env.LINE_CHANNEL_SECRET;
    if (!secret) throw new BadRequestException("ยังไม่ได้ตั้งค่า LINE channel");

    const rawBody = req.rawBody?.toString("utf8") ?? "";
    if (!signature || !verifyLineSignature(secret, rawBody, signature)) {
      throw new BadRequestException("ลายเซ็น LINE ไม่ถูกต้อง");
    }

    const body = JSON.parse(rawBody) as LineWebhookBody;

    // ประมวลผล async — ตอบ 200 ก่อนเพื่อไม่ให้ LINE timeout
    setImmediate(() => this.dispatch(body).catch((err) => console.error("LINE webhook error:", err)));

    return { ok: true };
  }

  private async dispatch(body: LineWebhookBody) {
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
          // Phase 1: chatbot พื้นฐาน (เช็กคิวด้วยการพิมพ์) — เพิ่มทีหลัง
          break;
      }
    }
  }
}
