"use strict";
/**
 * BCCRM Queue Engine — ตรรกะคิวแกนกลาง
 *
 * ออกแบบให้เป็น pure functions ไม่ผูกกับ framework
 * ฝั่ง API (NestJS) เป็นคนจัดการ persistence/lock ผ่าน DB transaction + Redis
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_POLICY = exports.TicketSource = exports.TicketState = void 0;
exports.canTransition = canTransition;
exports.assertTransition = assertTransition;
exports.formatTicketNumber = formatTicketNumber;
exports.priorityScore = priorityScore;
exports.sortWaitingQueue = sortWaitingQueue;
exports.estimateWaitMinutes = estimateWaitMinutes;
/** สถานะของตั๋วคิวตลอดวงจรชีวิต */
var TicketState;
(function (TicketState) {
    TicketState["Booked"] = "booked";
    TicketState["CheckedIn"] = "checked_in";
    TicketState["Waiting"] = "waiting";
    TicketState["Called"] = "called";
    TicketState["Serving"] = "serving";
    TicketState["Done"] = "done";
    TicketState["NoShow"] = "no_show";
    TicketState["Cancelled"] = "cancelled";
    TicketState["Transferred"] = "transferred";
})(TicketState || (exports.TicketState = TicketState = {}));
/** แหล่งที่มาของคิว */
var TicketSource;
(function (TicketSource) {
    TicketSource["LineBooking"] = "line_booking";
    TicketSource["WalkInKiosk"] = "walk_in_kiosk";
    TicketSource["StaffCreated"] = "staff_created";
})(TicketSource || (exports.TicketSource = TicketSource = {}));
/** transition ที่อนุญาต — ป้องกันสถานะกระโดดผิด */
const ALLOWED_TRANSITIONS = {
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
function canTransition(from, to) {
    return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}
function assertTransition(from, to) {
    if (!canTransition(from, to)) {
        throw new Error(`เปลี่ยนสถานะคิวจาก ${from} ไป ${to} ไม่ได้`);
    }
}
/**
 * ออกเลขคิวรูปแบบ "A042" — prefix ตามประเภทบริการ, เลขรันต่อวัน
 * หมายเหตุ: การเพิ่มเลขต้องทำภายใต้ DB transaction/lock ที่ฝั่ง API เท่านั้น
 */
function formatTicketNumber(prefix, sequence) {
    if (!/^[A-Z]{1,3}$/.test(prefix)) {
        throw new Error(`prefix ต้องเป็นตัวอักษร A-Z 1-3 ตัว (รับมา: "${prefix}")`);
    }
    if (sequence < 1 || sequence > 9999) {
        throw new Error(`เลขลำดับคิวต้องอยู่ระหว่าง 1-9999 (รับมา: ${sequence})`);
    }
    return `${prefix}${String(sequence).padStart(3, "0")}`;
}
exports.DEFAULT_POLICY = {
    boostAfterMinutes: 30,
    boostPointsPerMinute: 1,
    vipBaseScore: 1000,
    normalBaseScore: 0,
    bookingGraceMinutes: 15,
};
/**
 * คำนวณคะแนนจัดลำดับคิว — ยิ่งสูงยิ่งถูกเรียกก่อน
 * หลักการ: VIP มาก่อน, คนที่รอนานได้รับความเป็นธรรม (anti-starvation),
 * คิวจองถูกยึดตามเวลานัดภายใต้ grace period
 */
function priorityScore(entry, policy, now) {
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
function sortWaitingQueue(entries, policy = exports.DEFAULT_POLICY, now = new Date()) {
    return [...entries].sort((a, b) => priorityScore(b, policy, now) - priorityScore(a, policy, now));
}
/** คำนวณเวลารอโดยประมาณของคิวที่อยู่ลำดับ position (0-based) */
function estimateWaitMinutes(position, avgServiceMinutes) {
    return Math.max(0, Math.round(position * avgServiceMinutes));
}
//# sourceMappingURL=index.js.map