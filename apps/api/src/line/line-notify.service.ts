import { Injectable, Logger } from "@nestjs/common";
import {
  extractUserId,
  parsePostbackData,
  ticketCardFlex,
  type FlexMessage,
  type LineEvent,
} from "@bccrm/line-sdk";
import { PrismaService } from "../prisma/prisma.service";

const LINE_PUSH_URL = "https://api.line.me/v2/bot/message/push";
const LINE_REPLY_URL = "https://api.line.me/v2/bot/message/reply";

/**
 * ส่งข้อความหาลูกค้าผ่าน LINE Messaging API
 * หมายเหตุ: push message นับโควต้าค่าใช้จ่าย — ใช้ reply เมื่อทำได้ (ฟรี)
 */
@Injectable()
export class LineNotifyService {
  private readonly logger = new Logger(LineNotifyService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** push ข้อความ (นับโควต้า) */
  async push(lineUserId: string, messages: FlexMessage[]) {
    const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    if (!token) {
      this.logger.warn("ยังไม่ได้ตั้งค่า LINE_CHANNEL_ACCESS_TOKEN — ข้ามการส่ง");
      return;
    }
    const res = await fetch(LINE_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ to: lineUserId, messages }),
    });
    if (!res.ok) this.logger.error(`LINE push ล้มเหลว: ${res.status} ${await res.text()}`);
  }

  /** reply ด้วย replyToken (ไม่นับโควต้า ใช้ได้ครั้งเดียวต่อ event) */
  async reply(replyToken: string, messages: FlexMessage[]) {
    const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    if (!token) return;
    await fetch(LINE_REPLY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ replyToken, messages }),
    });
  }

  /** ลูกค้าเพิ่มเพื่อน → สร้าง Customer ผูก lineUserId */
  async onFollow(event: LineEvent) {
    const lineUserId = extractUserId(event);
    if (!lineUserId) return;
    await this.prisma.customer.upsert({
      where: { lineUserId },
      create: { lineUserId },
      update: {},
    });
    this.logger.log(`ลูกค้าใหม่ follow: ${lineUserId}`);
  }

  async onUnfollow(event: LineEvent) {
    const lineUserId = extractUserId(event);
    if (!lineUserId) return;
    // ไม่ลบข้อมูล — เก็บประวัติไว้ตาม PDPA (ลบเมื่อลูกค้าร้องขอ)
    this.logger.log(`ลูกค้า unfollow: ${lineUserId}`);
  }

  /** ปุ่ม postback เช่น ยกเลิกคิว / เช็กคิว */
  async onPostback(event: LineEvent) {
    const data = parsePostbackData(event.postback?.data ?? "");
    this.logger.log(`postback: ${JSON.stringify(data)}`);
    // TODO(phase-1): action=cancel → ยกเลิกคิว, action=status → reply บัตรคิวสด
  }

  /** ส่งบัตรคิวหลังออกเลขสำเร็จ (เรียกจาก QueuesService) */
  async sendTicketCard(
    lineUserId: string,
    data: Parameters<typeof ticketCardFlex>[0],
  ) {
    await this.push(lineUserId, [ticketCardFlex(data)]);
  }
}
