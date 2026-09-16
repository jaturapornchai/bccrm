/**
 * BCCRM Queue Engine — ตรรกะคิวแกนกลาง
 *
 * ออกแบบให้เป็น pure functions ไม่ผูกกับ framework
 * ฝั่ง API (NestJS) เป็นคนจัดการ persistence/lock ผ่าน DB transaction + Redis
 */
/** สถานะของตั๋วคิวตลอดวงจรชีวิต */
export declare enum TicketState {
    Booked = "booked",// จองล่วงหน้า ยังไม่มาถึง
    CheckedIn = "checked_in",// เช็กอินแล้ว (สแกน QR หน้าร้าน / กดยืนยันใน LINE)
    Waiting = "waiting",// รอเรียก (walk-in เข้าสถานะนี้ทันที)
    Called = "called",// กำลังถูกเรียก
    Serving = "serving",// กำลังรับบริการ
    Done = "done",// เสร็จสิ้น
    NoShow = "no_show",// เรียกแล้วไม่มา
    Cancelled = "cancelled",// ยกเลิก
    Transferred = "transferred"
}
/** แหล่งที่มาของคิว */
export declare enum TicketSource {
    LineBooking = "line_booking",// จองผ่าน LINE OA (LIFF)
    WalkInKiosk = "walk_in_kiosk",// กดบัตรคิวหน้าร้าน
    StaffCreated = "staff_created"
}
export declare function canTransition(from: TicketState, to: TicketState): boolean;
export declare function assertTransition(from: TicketState, to: TicketState): void;
/**
 * ออกเลขคิวรูปแบบ "A042" — prefix ตามประเภทบริการ, เลขรันต่อวัน
 * หมายเหตุ: การเพิ่มเลขต้องทำภายใต้ DB transaction/lock ที่ฝั่ง API เท่านั้น
 */
export declare function formatTicketNumber(prefix: string, sequence: number): string;
export interface QueuePolicyConfig {
    /** ดันคิวที่รอนานเกินกี่นาทีให้ priority เพิ่ม (0 = ปิด) */
    boostAfterMinutes: number;
    /** คะแนนเพิ่มต่อนาทีที่รอเกินเกณฑ์ */
    boostPointsPerMinute: number;
    /** คะแนนพื้นฐานของคิว VIP/ด่วน */
    vipBaseScore: number;
    /** คะแนนพื้นฐานของคิวปกติ */
    normalBaseScore: number;
    /** คิวจองล่วงหน้าได้เวลา grace กี่นาทีก่อนถูกเลื่อน */
    bookingGraceMinutes: number;
}
export declare const DEFAULT_POLICY: QueuePolicyConfig;
export interface QueueEntry {
    ticketId: string;
    ticketNumber: string;
    source: TicketSource;
    isVip: boolean;
    waitingSince: Date;
    /** เวลานัดหมาย (เฉพาะคิวจอง) */
    bookedFor?: Date;
}
/**
 * คำนวณคะแนนจัดลำดับคิว — ยิ่งสูงยิ่งถูกเรียกก่อน
 * หลักการ: VIP มาก่อน, คนที่รอนานได้รับความเป็นธรรม (anti-starvation),
 * คิวจองถูกยึดตามเวลานัดภายใต้ grace period
 */
export declare function priorityScore(entry: QueueEntry, policy: QueuePolicyConfig, now: Date): number;
/** เรียงลำดับคิวที่รออยู่ตามนโยบาย — ตัวแรกคือคิวที่ควรถูกเรียกถัดไป */
export declare function sortWaitingQueue(entries: QueueEntry[], policy?: QueuePolicyConfig, now?: Date): QueueEntry[];
/** คำนวณเวลารอโดยประมาณของคิวที่อยู่ลำดับ position (0-based) */
export declare function estimateWaitMinutes(position: number, avgServiceMinutes: number): number;
