/**
 * Webhook helpers — ตรวจลายเซ็นและแปลง event จาก LINE Platform
 * ใช้ Node.js crypto ล้วน ไม่มี dependency ภายนอก
 */
/** ตรวจสอบ X-Line-Signature ตามเอกสาร LINE Messaging API */
export declare function verifyLineSignature(channelSecret: string, rawBody: string | Buffer, signature: string): boolean;
/** event types จาก LINE ที่ระบบใช้ */
export type LineEventType = "follow" | "unfollow" | "message" | "postback" | "join" | "leave" | (string & {});
export interface LineEvent {
    type: LineEventType;
    replyToken?: string;
    source?: {
        type: string;
        userId?: string;
        groupId?: string;
    };
    timestamp: number;
    message?: {
        type: string;
        id: string;
        text?: string;
    };
    postback?: {
        data: string;
        params?: Record<string, string>;
    };
}
export interface LineWebhookBody {
    destination: string;
    events: LineEvent[];
}
/** ดึง LINE userId จาก event — null ถ้าไม่มี (เช่น event จาก group ที่ไม่เปิดเผย) */
export declare function extractUserId(event: LineEvent): string | null;
/**
 * แปลง postback data รูปแบบ "action=cancel&ticketId=xxx" เป็น object
 * ใช้ร่วมกับปุ่ม postback ใน Flex/Rich Menu
 */
export declare function parsePostbackData(data: string): Record<string, string>;
