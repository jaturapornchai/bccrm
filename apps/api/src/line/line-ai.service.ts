import { forwardRef, Inject, Injectable, Logger } from "@nestjs/common";
import { QueuesService } from "../queues/queues.service";
import { LineNotifyService } from "./line-notify.service";
import { ticketCardFlex } from "@bccrm/line-sdk";

const DEFAULT_AI_BASE_URL = process.env.AI_BASE_URL || "https://api.deepseek.com";
const DEFAULT_AI_KEY = process.env.AI_API_KEY || process.env.DEEPSEEK_API_KEY || "";
const DEFAULT_AI_MODEL = process.env.AI_MODEL || "deepseek-chat";

export interface ChatResponse {
  reply: string;
  activeTicket?: unknown;
  flexMessage?: unknown;
}

@Injectable()
export class LineAiService {
  private readonly logger = new Logger(LineAiService.name);

  constructor(
    @Inject(forwardRef(() => QueuesService))
    private readonly queues: QueuesService,
    @Inject(forwardRef(() => LineNotifyService))
    private readonly notify: LineNotifyService,
  ) {}

  /**
   * คุยกับ AI โดยตรง (สำหรับ Web Chat / LIFF Chat / REST API)
   */
  async chatWithAi(lineUserId: string, messageText: string): Promise<ChatResponse> {
    this.logger.log(`[DeepSeek] รับข้อความจาก ${lineUserId}: "${messageText}"`);

    const branchId = "demo";
    const activeTicket = await this.queues.getActiveCustomerTicket(branchId, lineUserId);
    const services = await this.queues.listServices(branchId);

    const servicesContext = services
      .map((s) => `- ${s.name} (รหัส ${s.ticketPrefix}): เวลารอเฉลี่ย ~${s.avgServiceMinutes} นาที`)
      .join("\n");

    let ticketContext = "ลูกค้าท่านนี้ยังไม่มีคิวที่กำลังรออยู่ในวันนี้";
    if (activeTicket) {
      ticketContext = `ลูกค้าท่านนี้มีคิวอยู่แล้ว:
- หมายเลขคิว: ${activeTicket.ticket.number}
- บริการ: ${activeTicket.service?.name ?? "บริการทั่วไป"}
- สถานะปัจจุบัน: ${activeTicket.ticket.state}
- จำนวนคิวที่อยู่ข้างหน้า: ${activeTicket.aheadCount} คิว
- เวลารอโดยประมาณ: ~${activeTicket.estimatedWaitMinutes} นาที`;
    }

    const liffUrl = process.env.LIFF_URL ?? "https://liff.line.me/2009920675-GqteXbxD";
    const isBookingOrQueue = /จอง|รับคิว|ออกคิว|ขอคิว|บัตรคิว|สถานะ|เช็กคิว|เช็คคิว|คิว|เวลา|บริการ|ตรวจ|นัด|ราคา|ทำอะไรได้|เปิด|ปิด/.test(
      messageText,
    );

    const systemPrompt = `คุณคือ "น้องบีซี" เจ้าหน้าที่ AI ผู้ช่วยอัจฉริยะประจำคลินิก/ศูนย์บริการ BCCRM (สาขา Demo) ขับเคลื่อนด้วย DeepSeek
บุคลิก: อ่อนหวาน สุภาพ เป็นมิตร มีมารยาท ให้ข้อมูลชัดเจน ใช้ภาษาไทย กระชับ ไม่เยิ่นเย้อ ใช้คำลงท้ายว่า ค่ะ/นะคะ

ข้อมูลบริการของร้าน:
${servicesContext}
เวลาทำการ: 09:00 - 18:00 น. ทุกวัน

ลิงก์เข้าสู่ระบบ LINE LIFF สำหรับลูกค้า (กดแล้วเปิดหน้าระบบทันที):
${liffUrl}

ข้อมูลคิวของลูกค้าท่านนี้:
${ticketContext}

กฎสำคัญ:
1. หากลูกค้าถามถึงการจองคิว, วิธีรับบัตรคิว, ขอลิงก์จองคิว, สนใจบริการ, สอบถามเวลาทำการ หรือถามเรื่องคิว ให้แนบลิงก์ LINE LIFF ในคำตอบเสมอ เพื่อให้ลูกค้าแตะแล้วเปิดหน้าระบบได้ทันที เช่น:
"คุณลูกค้าสามารถกดจองคิวออนไลน์ได้ที่ลิงก์นี้เลยนะคะ 👉 ${liffUrl}"
2. หากลูกค้ามีคิวอยู่แล้ว ให้บอกสถานะคิว จำนวนคิวข้างหน้า และเวลารอ พร้อมแนบลิงก์ตรวจคิวสด:
"ตรวจเช็กสถานะบัตรคิวสดของคุณได้ที่นี่ค่ะ 👉 ${liffUrl}"
3. ตอบสั้น กระชับ ตรงประเด็น ไม่เกิน 3-4 ประโยค เหมาะกับการอ่านบนมือถือ`;

    const reply = await this.callLlm(systemPrompt, messageText);

    let flexMessage: unknown = null;
    if (activeTicket) {
      flexMessage = ticketCardFlex({
        ticketNumber: activeTicket.ticket.number,
        branchName: "สาขาหลัก (Demo)",
        serviceName: activeTicket.service?.name ?? "บริการทั่วไป",
        aheadCount: activeTicket.aheadCount,
        estimatedWaitMinutes: activeTicket.estimatedWaitMinutes,
        ticketUrl: `${liffUrl}?ticketId=${activeTicket.ticket.id}`,
      });
    } else if (isBookingOrQueue) {
      flexMessage = {
        type: "flex",
        altText: "📋 จองคิวออนไลน์ผ่าน LINE LIFF",
        contents: {
          type: "bubble",
          header: {
            type: "box",
            layout: "vertical",
            backgroundColor: "#06C755",
            contents: [
              {
                type: "text",
                text: "📋 จองคิวออนไลน์ (LIFF)",
                color: "#FFFFFF",
                weight: "bold",
                size: "lg",
              },
            ],
          },
          body: {
            type: "box",
            layout: "vertical",
            spacing: "sm",
            contents: [
              {
                type: "text",
                text: "รับบัตรคิวง่ายๆ ไม่ต้องยืนรอ",
                weight: "bold",
                size: "md",
                color: "#0F172A",
              },
              {
                type: "text",
                text: "แตะปุ่มด้านล่างเพื่อเลือกบริการและรับบัตรคิวสดผ่านมือถือได้ทันทีค่ะ",
                size: "sm",
                color: "#64748B",
                wrap: true,
              },
            ],
          },
          footer: {
            type: "box",
            layout: "vertical",
            contents: [
              {
                type: "button",
                style: "primary",
                color: "#06C755",
                action: {
                  type: "uri",
                  label: "👉 กดรับบัตรคิวทันที",
                  uri: liffUrl,
                },
              },
            ],
          },
        },
      };
    }

    return {
      reply,
      activeTicket: activeTicket ?? null,
      flexMessage,
    };
  }

  /**
   * รับข้อความจากลูกค้า LINE OA และประมวลผลด้วย AI เพื่อตอบกลับผ่าน LINE Reply API
   */
  async handleIncomingMessage(
    lineUserId: string,
    messageText: string,
    replyToken?: string,
  ) {
    if (!replyToken) return;

    try {
      const liffUrl = process.env.LIFF_URL ?? "https://liff.line.me/2009920675-GqteXbxD";
      const result = await this.chatWithAi(lineUserId, messageText);

      const replyMessages: unknown[] = [
        {
          type: "text",
          text: result.reply || "สวัสดีค่ะ น้องบีซียินดีให้บริการ มีข้อสงสัยเรื่องคิวหรือบริการสอบถามได้เลยนะคะ",
          quickReply: {
            items: [
              {
                type: "action",
                action: {
                  type: "uri",
                  label: "📋 จองคิวทันที",
                  uri: liffUrl,
                },
              },
              {
                type: "action",
                action: {
                  type: "message",
                  label: "🎫 เช็กคิวของฉัน",
                  text: "คิวของฉันถึงไหนแล้ว",
                },
              },
              {
                type: "action",
                action: {
                  type: "message",
                  label: "🩺 ดูบริการทั้งหมด",
                  text: "มีบริการอะไรบ้าง",
                },
              },
            ],
          },
        },
      ];

      if (result.flexMessage) {
        replyMessages.push(result.flexMessage);
      }

      await this.notify.reply(replyToken, replyMessages as never);
    } catch (err) {
      this.logger.error("AI error processing message:", err);
      await this.notify.reply(replyToken, [
        {
          type: "text",
          text: "สวัสดีค่ะ น้องบีซียินดีให้บริการค่ะ สามารถกดเมนูเพื่อดูสถานะคิวหรือสอบถามบริการได้เลยนะคะ",
        } as never,
      ]);
    }
  }

  private async callLlm(systemPrompt: string, userMessage: string): Promise<string> {
    const url = `${DEFAULT_AI_BASE_URL.replace(/\/+$/, "")}/chat/completions`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${DEFAULT_AI_KEY}`,
      },
      body: JSON.stringify({
        model: DEFAULT_AI_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        temperature: 0.7,
        max_tokens: 350,
      }),
    });

    if (!response.ok) {
      throw new Error(`DeepSeek API returned ${response.status}: ${await response.text()}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return data.choices?.[0]?.message?.content?.trim() ?? "";
  }
}
