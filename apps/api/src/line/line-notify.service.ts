import { forwardRef, Inject, Injectable, Logger } from "@nestjs/common";
import {
  almostThereFlex,
  calledFlex,
  cancelledFlex,
  extractUserId,
  parsePostbackData,
  ticketCardFlex,
  type FlexMessage,
  type LineEvent,
} from "@bccrm/line-sdk";
import { TicketState } from "@bccrm/queue-engine";
import { PrismaService } from "../prisma/prisma.service";
import { MongoCustomerStore } from "../mongo/mongo-customer-store";
import { QueuesService } from "../queues/queues.service";

const LINE_PUSH_URL = "https://api.line.me/v2/bot/message/push";
const LINE_REPLY_URL = "https://api.line.me/v2/bot/message/reply";

/**
 * ส่งข้อความหาลูกค้าผ่าน LINE Messaging API
 * หมายเหตุ: push message นับโควต้าค่าใช้จ่าย — ใช้ reply เมื่อทำได้ (ฟรี)
 */
@Injectable()
export class LineNotifyService {
  private readonly logger = new Logger(LineNotifyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mongoCustomer: MongoCustomerStore,
    @Inject(forwardRef(() => QueuesService))
    private readonly queues: QueuesService,
  ) {}

  /** push ข้อความ (นับโควต้า LINE OA — ปิดเป็นค่าเริ่มต้นเพื่อหลีกเลี่ยงการเสียโควต้า) */
  async push(lineUserId: string, messages: FlexMessage[]) {
    // ป้องกันการเสียโควต้า: ถ้าไม่ได้เปิด ENABLE_LINE_PUSH=true หรือเปิด DISABLE_LINE_PUSH=true จะไม่ส่ง push
    if (process.env.ENABLE_LINE_PUSH !== "true" || process.env.DISABLE_LINE_PUSH === "true") {
      this.logger.debug(`LINE push ถูกปิดเพื่อประหยัดโควต้า (ENABLE_LINE_PUSH!=true) — ข้ามการส่งไปยัง ${lineUserId}`);
      return;
    }
    const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    if (!token) {
      this.logger.warn(`ยังไม่ได้ตั้งค่า LINE_CHANNEL_ACCESS_TOKEN — ข้ามการส่ง push ไปยัง ${lineUserId}`);
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
    if (!token) {
      this.logger.warn("ยังไม่ได้ตั้งค่า LINE_CHANNEL_ACCESS_TOKEN — ข้ามการส่ง reply");
      return;
    }
    const res = await fetch(LINE_REPLY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ replyToken, messages }),
    });
    if (!res.ok) this.logger.error(`LINE reply ล้มเหลว: ${res.status} ${await res.text()}`);
  }

  /** ลูกค้าเพิ่มเพื่อน → สร้าง Customer ผูก lineUserId */
  async onFollow(event: LineEvent) {
    const lineUserId = extractUserId(event);
    if (!lineUserId) return;
    if (process.env.DB_MODE !== "prisma") {
      await this.mongoCustomer.upsertByLineUserId(lineUserId);
    } else {
      await this.prisma.customer.upsert({
        where: { lineUserId },
        create: { lineUserId },
        update: {},
      });
    }
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
    const lineUserId = extractUserId(event);
    this.logger.log(`postback from ${lineUserId}: ${JSON.stringify(data)}`);

    const liffBaseUrl = process.env.LIFF_URL ?? "http://localhost:3002";

    if (data.action === "cancel" && data.ticketId) {
      try {
        const ticket = await this.queues.changeState(data.ticketId, TicketState.Cancelled);
        if (event.replyToken) {
          await this.reply(event.replyToken, [cancelledFlex(ticket.number, liffBaseUrl)]);
        }
      } catch (err) {
        this.logger.error(`ยกเลิกคิวจาก postback ไม่สำเร็จ: ${err}`);
      }
    } else if (data.action === "status" && data.ticketId) {
      try {
        const details = await this.queues.getTicketDetails(data.ticketId);
        if (event.replyToken && details) {
          await this.reply(event.replyToken, [
            ticketCardFlex({
              ticketNumber: details.ticket.number,
              branchName: "โซมายด์ (Seoulmind) เชียงใหม่",
              serviceName: details.service?.name ?? "บริการทั่วไป",
              aheadCount: details.aheadCount,
              estimatedWaitMinutes: details.estimatedWaitMinutes,
              ticketUrl: `${liffBaseUrl}?ticketId=${details.ticket.id}`,
            }),
          ]);
        }
      } catch (err) {
        this.logger.error(`เช็กสถานะคิวจาก postback ไม่สำเร็จ: ${err}`);
      }
    }
  }

  /** ส่งบัตรคิวหลังออกเลขสำเร็จ (ปิดเป็นค่าเริ่มต้นเพื่อประหยัดโควต้า — ลูกค้าดูผ่าน LIFF อยู่แล้ว) */
  async sendTicketCard(
    lineUserId: string,
    data: Parameters<typeof ticketCardFlex>[0],
  ) {
    if (process.env.ENABLE_LINE_PUSH_ON_BOOKING !== "true") return;
    await this.push(lineUserId, [ticketCardFlex(data)]);
  }

  /** แจ้งเตือนเมื่อถูกเรียกคิว (ปิดเป็นค่าเริ่มต้นเพื่อประหยัดโควต้า) */
  async sendCalledAlert(
    lineUserId: string,
    ticketNumber: string,
    counterName: string,
    ticketUrl: string,
  ) {
    if (process.env.ENABLE_LINE_PUSH_ON_CALLED !== "true") return;
    await this.push(lineUserId, [calledFlex(ticketNumber, counterName, ticketUrl)]);
  }

  /** แจ้งเตือนเมื่อใกล้ถึงคิว (ปิดเป็นค่าเริ่มต้นเพื่อประหยัดโควต้า) */
  async sendAlmostThereAlert(
    lineUserId: string,
    data: Parameters<typeof almostThereFlex>[0],
  ) {
    if (process.env.ENABLE_LINE_PUSH_ON_ALMOST_THERE !== "true") return;
    await this.push(lineUserId, [almostThereFlex(data)]);
  }
}
