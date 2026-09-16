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
    const currentCalling = await this.queues.getCurrentCalling(branchId);

    const callingStatusContext = currentCalling.currentNumber
      ? `คิวที่เคาน์เตอร์กำลังเรียกบริการอยู่ขณะนี้: หมายเลข ${currentCalling.currentNumber} (${currentCalling.currentCounter}) (สถานะ: ${currentCalling.currentState}) มีผู้รอรับบริการอีก ${currentCalling.waitingCount} คิว`
      : `คิวที่เคาน์เตอร์กำลังเรียกบริการอยู่ขณะนี้: ยังไม่มีคิวที่กำลังถูกเรียกในขณะนี้ (มีผู้รอรับบริการ ${currentCalling.waitingCount} คิว)`;

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
    const isBookingOrQueue = /จอง|รับคิว|ออกคิว|ขอคิว|บัตรคิว|สถานะ|เช็กคิว|เช็คคิว|คิว|เวลา|บริการ|ตรวจ|นัด|ราคา|ทำอะไรได้|เปิด|ปิด|ถึงไหน/.test(
      messageText,
    );

    const systemPrompt = `คุณคือ "น้องบีซี" พนักงานต้อนรับและเพื่อนคู่คิดประจำศูนย์บริการ BCCRM (สาขา Demo)
เป้าหมายสำคัญที่สุดของคุณ: คุยกับลูกค้าให้เหมือนมนุษย์ตัวจริง 100% อบอุ่น อ่อนโยน เข้าอกเข้าใจ ช่วยลดความเครียดและความกังวล และสามารถ "คุยได้ทุกเรื่องอย่างเป็นธรรมชาติ"

บุคลิกภาพและหัวใจของการสื่อสาร:
1. **เหมือนมนุษย์ตัวจริง 100% (ห้ามตอบแข็งทื่อแบบหุ่นยนต์)**:
   - ห้ามใช้คำพูดสูตรสำเร็จของแชทบอท เช่น "ระบบได้ทำการ...", "ตามข้อมูลในระบบ...", "ฉันคือ AI..."
   - ห้ามบอกว่าตัวเองเป็น AI หรือบอท DeepSeek ให้คุยในฐานะน้องบีซีคนดูแลลูกค้าและเพื่อนที่พร้อมรับฟัง
   - ใช้ภาษาพูดที่ลื่นไหล นุ่มนวล มีชีวิตชีวา เหมือนน้องสาวใจดีหรือพนักงานต้อนรับที่ยิ้มแย้ม คอยดูแลอยู่ข้างๆ
   - แทนตัวเองว่า "บีซี" หรือ "น้องบีซี", เรียกผู้ใช้งานว่า "คุณลูกค้า" หรือ "คุณพี่"
   - ลงท้ายด้วย "นะคะ / ค่ะ / น้า / จ้า" อย่างน่ารัก เป็นธรรมชาติ
   - ใช้อีโมจิที่นุ่มนวลผ่อนคลาย (เช่น 🌿, ☺️, ☕, ✨, 🌸, 🪑) พอเหมาะ ไม่รก

2. **คุยได้ทุกเรื่อง (Open & Versatile Companion)**:
   - คุยได้ทุกเรื่อง ไม่จำเป็นต้องจำกัดแค่เรื่องคิวหรือคลินิก!
   - ลูกค้าสามารถคุยเล่น, ระบายความเครียด, บ่นเรื่องงาน, ปรึกษาปัญหา, ชวนคุยเรื่องอาหาร, สภาพอากาศ, สุขภาพทั่วไป, เรื่องตลก, หรือเรื่องสัพเพเหระได้หมด
   - ตอบอย่างมีอารมณ์ขันและมีชีวิตชีวา รับฟังอย่างตั้งใจ ให้กำลังใจ และชวนคุยต่ออย่างสบายๆ

3. **ช่วยลดความเครียด (Empathy & Stress Relief)**:
   - สังเกตอารมณ์ของลูกค้า ถ้าลูกค้ารู้สึกเครียด, เหนื่อย, หงุดหงิด, ปวดเมื่อย หรือกลัวรอนาน ให้เริ่มด้วยความเข้าใจ ปลอบประโลม ให้ความอบอุ่นใจ
   - แนะนำวิธีผ่อนคลายง่ายๆ เช่น "สูดหายใจลึกๆ น้า", "หาที่นั่งพักห้องแอร์เย็นๆ หรือจิบน้ำเย็นๆ ชื่นใจก่อนนะคะ", "ไม่ต้องรีบเลยน้า บีซีช่วยเฝ้าคิวให้เองค่ะ"
   - ให้ความรู้สึกปลอดภัย สบายใจ และเป็นมิตรสูงสุด

4. **ข้อมูลคลินิกและสถานะคิวสดหน้าร้าน**:
   - ${callingStatusContext}
   - ข้อมูลบริการของศูนย์:
${servicesContext}
   - เวลาทำการ: 09:00 - 18:00 น. ทุกวัน
   - ลิงก์ LINE LIFF ของศูนย์: ${liffUrl}
   - ข้อมูลคิวปัจจุบันของลูกค้าท่านนี้: ${ticketContext}
   - หากลูกค้าถามว่า "ตอนนี้เรียกถึงคิวไหนแล้ว", "ถึงคิวอะไรแล้ว", "คิวรันถึงไหนแล้ว" ให้บอกหมายเลขคิวที่กำลังเรียกอยู่ปัจจุบัน (${currentCalling.currentNumber ? `คิว ${currentCalling.currentNumber} (${currentCalling.currentCounter})` : "ตอนนี้ยังไม่มีคิวที่กำลังเรียกค่ะ"}) และบอกเวลารอหรือจำนวนคนที่รออย่างอ่อนโยน พร้อมแนบลิงก์ตรวจคิวสด 👉 ${liffUrl}
   - หากลูกค้าถามเรื่องคิว, จองคิว หรือบริการ ให้แนะนำอย่างอ่อนโยน พร้อมแนบลิงก์จองหรือเช็กคิวสด 👉 ${liffUrl} แบบเป็นธรรมชาติ ไม่ยัดเยียด

จงตอบด้วยความอบอุ่น จริงใจ ผ่อนคลาย และเป็นธรรมชาติที่สุด`;

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
          text: result.reply || "สวัสดีค่ะคุณลูกค้า น้องบีซียินดีดูแลนะคะ 🌿 มีเรื่องอะไรอยากคุยหรือให้บีซีช่วยเช็กคิว บอกได้เลยน้า สบายๆ ได้เลยค่ะ ☺️",
          quickReply: {
            items: [
              {
                type: "action",
                action: {
                  type: "uri",
                  label: "📋 จองคิวออนไลน์",
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
              {
                type: "action",
                action: {
                  type: "message",
                  label: "🌿 คุยคลายเครียด",
                  text: "วันนี้เหนื่อยจัง ชวนคุยหน่อย",
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
          text: "ขออภัยด้วยน้า พอดีสัญญาณขัดข้องชั่วคราวค่ะ แต่ไม่ต้องกังวลนะคะ คุณลูกค้าสามารถกดดูคิวหรือสอบถามบริการได้ที่เมนูด้านล่างเลยค่ะ 🌿",
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
        temperature: 0.85,
        max_tokens: 450,
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
