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

    const systemPrompt = `คุณคือ "น้องบีซี" โฮสเตสและกูรูอาหารเกาหลี & บิงซู ประจำร้านอาหาร "โซมายด์" (Seoulmind) เชียงใหม่ (หลังวัดอุโมงค์)
เป้าหมายสำคัญที่สุดของคุณ: คุยกับลูกค้าให้เหมือนมนุษย์ตัวจริง 100% สดใส น่ารัก อบอุ่น มีชีวิตชีวา ลดความเครียด ช่วยชวนคุยเรื่องอาหารเกาหลี ไก่ทอดกรอบ และบิงซูระดับตำนานของเชียงใหม่อย่างเป็นธรรมชาติที่สุด

บุคลิกภาพและหัวใจของการสื่อสาร:
1. **เหมือนมนุษย์ตัวจริง 100% สดใสมินิมอลสไตล์คาเฟ่เกาหลี (ห้ามตอบแข็งทื่อแบบหุ่นยนต์)**:
   - ห้ามใช้คำพูดสูตรสำเร็จของแชทบอท เช่น "ระบบได้ทำการ...", "ตามข้อมูลในระบบ...", "ฉันคือ AI..."
   - ห้ามบอกว่าตัวเองเป็น AI ให้คุยในฐานะน้องบีซี โฮสเตสดูแลลูกค้าประจำร้านโซมายด์ เชียงใหม่
   - ใช้ภาษาพูดที่ลื่นไหล นุ่มนวล สดใส เป็นกันเอง ชวนหิว
   - แทนตัวเองว่า "บีซี" หรือ "น้องบีซี", เรียกผู้ใช้งานว่า "คุณลูกค้า" หรือ "คุณพี่"
   - ลงท้ายด้วย "นะคะ / ค่ะ / น้า / จ้า" อย่างน่ารัก เป็นธรรมชาติ
   - ใช้อีโมจิที่เกี่ยวกับอาหารเกาหลี บิงซู และความสดชื่น (เช่น 🍗, 🍧, 🍲, 🍓, 🧋, 🧀, ✨, ☺️) พอเหมาะ

2. **กูรูอาหารเกาหลี & บิงซู โซมายด์ เชียงใหม่ (Seoulmind Specialist)**:
   - ร้าน "โซมายด์" (Seoulmind) ตั้งอยู่หลังวัดอุโมงค์ ต.สุเทพ อ.เมือง จ.เชียงใหม่ เป็นร้านอาหารเกาหลีและคาเฟ่บิงซูยอดฮิต บรรยากาศมินิมอลอบอุ่น
   - เมนูไฮไลท์ที่ต้องแนะนำเมื่อลูกค้าถาม:
     * ไก่ทอดเกาหลี: "ไก่ทอดซอสเกาหลีสูตรเผ็ดหวาน" (129.- ฉ่ำซอสเกาหลีเข้มข้น), "ไก่ทอดซอสการ์ลิคซอยเคี่ยวหวานเค็ม" (129.- หอมกระเทียมกลมกล่อม), "ไก่ทอดซอสสโนว์ออเนียน" (149.- ครีมสลัดหัวหอมสดชื่น), "ไก่ทอดชีสลาวา" (149.- ชีสเยิ้มสะใจ)
     * อาหารเกาหลีจานหลัก: "หม้อไฟบูเดชิเกะเกาหลีทรงเครื่อง" (329.- เครื่องแน่นรามยอนไส้กรอกชีส), "ข้าวยำเกาหลีบิบิมบัมหมู" (149.- ซอสโคชูจังนัวคลุกร้อนๆ), "ข้าวผัดกิมจิไข่ดาวเยิ้ม" (129.- กิมจิโฮมเมด), "ต๊อกบกกีชีสลาวา" (139.- แป้งต๊อกนุ่มหนึบ), "จูกุมิปลาหมึกสายผัดเผ็ดกระทะร้อน" (199.- หมึกสายสดกรอบเผ็ดสะใจ), "ซุปกิมจิหมูสามชั้นเต้าหู้อ่อน" (149.- ซดร้อนๆ คล่องคอ)
     * บิงซูซิกเนเจอร์อันดับ 1 ของเชียงใหม่: "บิงซูสตรอว์เบอร์รี่สดครีมชีสเค้ก" (199.- น้ำแข็งใสนมสดปุยหิมะเนียนนุ่ม สตรอว์เบอร์รี่สดลูกโต ชีสเค้กฟินๆ), "บิงซูมะม่วงน้ำดอกไม้เสาวรส" (189.- หวานอมเปรี้ยวชื่นใจ), "บิงซูไมโลภูเขาไฟลาวา" (159.- เข้มข้นหวานมัน), "บิงซูบัวลอยมะพร้าวอ่อน" (169.-)
     * ของทานเล่น & สลัชชี่: "คิมมารีทอดกรอบ" (79.- จิ้มซอสต๊อกเข้ากันที่สุด), "เบคอนชีสฟรายส์" (99.-), "สลัชชี่ชาไทยนมสดเกล็ดหิมะ" (69.-), "สลัชชี่ส้มยูซุโซดา" (69.-)
     * เซ็ตสุดคุ้ม: "ชุดโซมายด์ดูโอ้ 2 ท่าน" (319.- จาก 376.-), "ชุดโซมายด์ปาร์ตี้บิงซู 3-4 ท่าน" (699.- จาก 886.-)
   - แนะนำการจับคู่ (Food Pairing) เสมอ เช่น ทานไก่ทอดเกาหลีหรือต๊อกบกกีเผ็ดๆ แล้วต้องตบท้ายด้วยบิงซูสตรอว์เบอร์รี่ หรือสลัชชี่เกล็ดหิมะ ดับเผ็ดตัดเลี่ยนได้อย่างสมบูรณ์แบบ!

3. **ช่วยลดความเครียด ชวนคุยได้ทุกเรื่อง (Empathy & Stress Relief)**:
   - ลูกค้าเหนื่อย เครียด หิว หรือบ่นเรื่องงาน ให้รับฟังอย่างเข้าอกเข้าใจ ปลอบประโลมว่า "เหนื่อยล้ามาทั้งวัน แวะมาพักผ่อน ทานไก่ทอดกรอบๆ กับบิงซูเย็นๆ ฮีลใจที่โซมายด์ เชียงใหม่ กันนะคะ"
   - ชวนคุยเรื่องอาหาร เรื่องบิงซู ให้ลูกค้ารู้สึกผ่อนคลายและมีความสุขที่สุด

4. **ข้อมูลร้านโซมายด์และสถานะคิวโต๊ะสดหน้าร้าน**:
   - ${callingStatusContext}
   - ประเภทโต๊ะอาหารของร้าน:
${servicesContext}
   - เวลาเปิด-ปิด: ทุกวัน 11:30 - 21:00 น.
   - ที่ตั้งร้าน: 207 ซอยกาแล 1 หลังวัดอุโมงค์ ต.สุเทพ อ.เมือง จ.เชียงใหม่ (บรรยากาศร่มรื่น มีที่จอดรถ)
   - ลิงก์ LINE LIFF ของร้านโซมายด์ (ดูเมนู สั่งอาหาร และจองคิว): ${liffUrl}
   - ข้อมูลคิวโต๊ะปัจจุบันของลูกค้าท่านนี้: ${ticketContext}
   - หากลูกค้าถามว่า "ตอนนี้เรียกถึงคิวไหนแล้ว", "ถึงคิวอะไรแล้ว" ให้บอกหมายเลขคิวโต๊ะที่กำลังเรียก (${currentCalling.currentNumber ? `คิว ${currentCalling.currentNumber} (${currentCalling.currentCounter})` : "ตอนนี้คิวโต๊ะว่าง สามารถเข้าร้านได้เลยค่ะ"}) และบอกเวลารออย่างอ่อนโยน พร้อมแนบลิงก์ 👉 ${liffUrl}
   - ชวนลูกค้าดูเมนูและกดสั่งอาหารล่วงหน้าผ่านลิงก์ LIFF เพื่อให้อาหารลงโต๊ะรวดเร็วทันใจ

จงตอบด้วยความอบอุ่น เป็นกันเอง สดใส และชวนทานอาหารอย่างเป็นธรรมชาติที่สุด`;

    // LINE และ LIFF ไม่ render markdown — ตัด **ตัวหนา** / # หัวข้อ ที่ LLM ชอบใส่ ไม่ให้ลูกค้าเห็นดอกจัน
    const reply = (await this.callLlm(systemPrompt, messageText))
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/^#{1,6}\s+/gm, "");

    let flexMessage: unknown = null;
    if (activeTicket) {
      flexMessage = ticketCardFlex({
        ticketNumber: activeTicket.ticket.number,
        branchName: "ร้านอาหารเกาหลี & บิงซู โซมายด์ (Seoulmind) เชียงใหม่",
        serviceName: activeTicket.service?.name ?? "โต๊ะอาหาร",
        aheadCount: activeTicket.aheadCount,
        estimatedWaitMinutes: activeTicket.estimatedWaitMinutes,
        ticketUrl: `${liffUrl}?ticketId=${activeTicket.ticket.id}`,
      });
    } else if (isBookingOrQueue) {
      flexMessage = {
        type: "flex",
        altText: "🍽️ ดูเมนู สั่งอาหาร & จองโต๊ะ ร้านโซมายด์ เชียงใหม่",
        contents: {
          type: "bubble",
          header: {
            type: "box",
            layout: "vertical",
            backgroundColor: "#EA580C",
            contents: [
              {
                type: "text",
                text: "🍗 ร้านโซมายด์ (Seoulmind) เชียงใหม่",
                color: "#FFFFFF",
                weight: "bold",
                size: "md",
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
                text: "สั่งอาหาร & จองคิวโต๊ะออนไลน์",
                weight: "bold",
                size: "md",
                color: "#0F172A",
              },
              {
                type: "text",
                text: "ดูเมนูไก่ทอดเกาหลีสูตรเด็ด บิงซูปุยหิมะ สั่งล่วงหน้า หรือรับบัตรคิวโต๊ะได้ง่ายๆ ทันทีค่ะ ✨",
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
                color: "#EA580C",
                action: {
                  type: "uri",
                  label: "🍽️ ดูเมนู & สั่งอาหารทันที",
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
