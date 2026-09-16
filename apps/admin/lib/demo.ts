/** ข้อมูลจำลองสำหรับโหมดสาธิต — ใช้เมื่อเชื่อมต่อ API ไม่ได้ */

export interface DemoTicket {
  id: string;
  number: string;
  serviceName: string;
  state: string;
  isVip: boolean;
  source: string;
  createdAt: number; // epoch ms
  counterName: string | null;
}

const now = Date.now();
const min = 60_000;

export const DEMO_TICKETS: DemoTicket[] = [
  { id: "t1", number: "A001", serviceName: "บริการทั่วไป", state: "DONE", isVip: false, source: "WALK_IN_KIOSK", createdAt: now - 95 * min, counterName: "เคาน์เตอร์ 1" },
  { id: "t2", number: "A002", serviceName: "บริการทั่วไป", state: "SERVING", isVip: false, source: "WALK_IN_KIOSK", createdAt: now - 40 * min, counterName: "เคาน์เตอร์ 1" },
  { id: "t3", number: "A003", serviceName: "บริการทั่วไป", state: "WAITING", isVip: false, source: "WALK_IN_KIOSK", createdAt: now - 35 * min, counterName: null },
  { id: "t4", number: "A004", serviceName: "บริการทั่วไป", state: "WAITING", isVip: false, source: "LINE_BOOKING", createdAt: now - 12 * min, counterName: null },
  { id: "t5", number: "V001", serviceName: "บริการพิเศษ (VIP)", state: "WAITING", isVip: true, source: "WALK_IN_KIOSK", createdAt: now - 3 * min, counterName: null },
  { id: "t6", number: "A005", serviceName: "บริการทั่วไป", state: "NO_SHOW", isVip: false, source: "STAFF_CREATED", createdAt: now - 60 * min, counterName: null },
];

export const STATE_LABEL: Record<string, { label: string; color: string }> = {
  BOOKED: { label: "จองไว้", color: "#3B82F6" },
  CHECKED_IN: { label: "เช็กอินแล้ว", color: "#06C755" },
  WAITING: { label: "รอเรียก", color: "#F59E0B" },
  CALLED: { label: "กำลังเรียก", color: "#E02020" },
  SERVING: { label: "กำลังบริการ", color: "#8B5CF6" },
  DONE: { label: "เสร็จสิ้น", color: "#6B7280" },
  NO_SHOW: { label: "ไม่มาตามนัด", color: "#9CA3AF" },
  CANCELLED: { label: "ยกเลิก", color: "#9CA3AF" },
  TRANSFERRED: { label: "ย้ายคิว", color: "#0EA5E9" },
};

export const SOURCE_LABEL: Record<string, string> = {
  LINE_BOOKING: "จองผ่าน LINE",
  WALK_IN_KIOSK: "Kiosk หน้าร้าน",
  STAFF_CREATED: "พนักงานเปิดให้",
};

/** จำลองการเรียกคิวถัดไป: VIP ก่อน แล้วคิวที่รอนานสุด */
export function demoCallNext(tickets: DemoTicket[]): DemoTicket[] {
  const waiting = tickets.filter((t) => t.state === "WAITING");
  if (waiting.length === 0) return tickets;
  const next = waiting.sort((a, b) => {
    if (a.isVip !== b.isVip) return a.isVip ? -1 : 1;
    return a.createdAt - b.createdAt;
  })[0];
  return tickets.map((t) =>
    t.id === next.id ? { ...t, state: "CALLED", counterName: "เคาน์เตอร์ 1" } : t,
  );
}

export function demoStats(tickets: DemoTicket[]): Record<string, number> {
  const stats: Record<string, number> = {};
  for (const t of tickets) stats[t.state] = (stats[t.state] ?? 0) + 1;
  return stats;
}
