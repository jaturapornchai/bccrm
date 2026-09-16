/**
 * BCCRM Queue Engine — ตรรกะคิวแกนกลาง
 *
 * ออกแบบให้เป็น pure functions ไม่ผูกกับ framework
 * ฝั่ง API (NestJS) เป็นคนจัดการ persistence/lock ผ่าน DB transaction + Redis
 */

/** สถานะของตั๋วคิวตลอดวงจรชีวิต */
export enum TicketState {
  Booked = "booked", // จองล่วงหน้า ยังไม่มาถึง
  CheckedIn = "checked_in", // เช็กอินแล้ว (สแกน QR หน้าร้าน / กดยืนยันใน LINE)
  Waiting = "waiting", // รอเรียก (walk-in เข้าสถานะนี้ทันที)
  Called = "called", // กำลังถูกเรียก
  Serving = "serving", // กำลังรับบริการ
  Done = "done", // เสร็จสิ้น
  NoShow = "no_show", // เรียกแล้วไม่มา
  Cancelled = "cancelled", // ยกเลิก
  Transferred = "transferred", // ย้ายไปคิว/เคาน์เตอร์อื่น
}

/** แหล่งที่มาของคิว */
export enum TicketSource {
  LineBooking = "line_booking", // จองผ่าน LINE OA (LIFF)
  WalkInKiosk = "walk_in_kiosk", // กดบัตรคิวหน้าร้าน
  StaffCreated = "staff_created", // พนักงานเปิดคิวให้
}

/** transition ที่อนุญาต — ป้องกันสถานะกระโดดผิด */
const ALLOWED_TRANSITIONS: Record<TicketState, TicketState[]> = {
  [TicketState.Booked]: [TicketState.CheckedIn, TicketState.Cancelled, TicketState.NoShow],
  [TicketState.CheckedIn]: [TicketState.Waiting, TicketState.Cancelled],
  [TicketState.Waiting]: [TicketState.Called, TicketState.Cancelled, TicketState.Transferred],
  [TicketState.Called]: [TicketState.Serving, TicketState.NoShow, TicketState.Waiting],
  [TicketState.Serving]: [TicketState.Done, TicketState.Transferred],
  [TicketState.Done]: [],
  [TicketState.NoShow]: [TicketState.Waiting], // อนุญาตให้ลูกค้ากลับมาต่อคิวได้ (ตามนโยบายร้าน)
  [TicketState.Cancelled]: [],
  [TicketState.Transferred]: [],
};

export function canTransition(from: TicketState, to: TicketState): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: TicketState, to: TicketState): void {
  if (!canTransition(from, to)) {
    throw new Error(`เปลี่ยนสถานะคิวจาก ${from} ไป ${to} ไม่ได้`);
  }
}

/**
 * ออกเลขคิวรูปแบบ "A042" — prefix ตามประเภทบริการ, เลขรันต่อวัน
 * หมายเหตุ: การเพิ่มเลขต้องทำภายใต้ DB transaction/lock ที่ฝั่ง API เท่านั้น
 */
export function formatTicketNumber(prefix: string, sequence: number): string {
  if (!/^[A-Z]{1,3}$/.test(prefix)) {
    throw new Error(`prefix ต้องเป็นตัวอักษร A-Z 1-3 ตัว (รับมา: "${prefix}")`);
  }
  if (sequence < 1 || sequence > 9999) {
    throw new Error(`เลขลำดับคิวต้องอยู่ระหว่าง 1-9999 (รับมา: ${sequence})`);
  }
  return `${prefix}${String(sequence).padStart(3, "0")}`;
}

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

export const DEFAULT_POLICY: QueuePolicyConfig = {
  boostAfterMinutes: 30,
  boostPointsPerMinute: 1,
  vipBaseScore: 1000,
  normalBaseScore: 0,
  bookingGraceMinutes: 15,
};

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
export function priorityScore(entry: QueueEntry, policy: QueuePolicyConfig, now: Date): number {
  const waitedMinutes = Math.max(0, (now.getTime() - entry.waitingSince.getTime()) / 60_000);

  let score = entry.isVip ? policy.vipBaseScore : policy.normalBaseScore;

  // ดันคิวที่รอนานเกินเกณฑ์ ไม่ให้ตกค้าง
  if (policy.boostAfterMinutes > 0 && waitedMinutes > policy.boostAfterMinutes) {
    score += (waitedMinutes - policy.boostAfterMinutes) * policy.boostPointsPerMinute;
  }

  // คิวจอง: ก่อนถึงเวลานัด + grace ให้แพ้ walk-in ที่รออยู่ (ยังไม่ถึงเวลาเขา)
  if (entry.bookedFor) {
    const minutesUntilBooking = (entry.bookedFor.getTime() - now.getTime()) / 60_000;
    if (minutesUntilBooking > policy.bookingGraceMinutes) {
      score -= 500; // ผลักไปท้ายกลุ่ม
    }
  }

  // tie-breaker เล็กน้อยตามเวลาที่รอ — มาก่อนได้ก่อนเสมอเมื่อคะแนนเท่ากัน
  return score + waitedMinutes * 0.001;
}

/** เรียงลำดับคิวที่รออยู่ตามนโยบาย — ตัวแรกคือคิวที่ควรถูกเรียกถัดไป */
export function sortWaitingQueue(
  entries: QueueEntry[],
  policy: QueuePolicyConfig = DEFAULT_POLICY,
  now: Date = new Date(),
): QueueEntry[] {
  return [...entries].sort((a, b) => priorityScore(b, policy, now) - priorityScore(a, policy, now));
}

/** คำนวณเวลารอโดยประมาณของคิวที่อยู่ลำดับ position (0-based) */
export function estimateWaitMinutes(position: number, avgServiceMinutes: number): number {
  return Math.max(0, Math.round(position * avgServiceMinutes));
}
