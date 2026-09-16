"use strict";
/**
 * Webhook helpers — ตรวจลายเซ็นและแปลง event จาก LINE Platform
 * ใช้ Node.js crypto ล้วน ไม่มี dependency ภายนอก
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyLineSignature = verifyLineSignature;
exports.extractUserId = extractUserId;
exports.parsePostbackData = parsePostbackData;
const node_crypto_1 = require("node:crypto");
/** ตรวจสอบ X-Line-Signature ตามเอกสาร LINE Messaging API */
function verifyLineSignature(channelSecret, rawBody, signature) {
    const body = typeof rawBody === "string" ? Buffer.from(rawBody, "utf8") : rawBody;
    const digest = (0, node_crypto_1.createHmac)("SHA256", channelSecret).update(body).digest();
    const given = Buffer.from(signature, "base64");
    if (digest.length !== given.length)
        return false;
    return (0, node_crypto_1.timingSafeEqual)(digest, given);
}
/** ดึง LINE userId จาก event — null ถ้าไม่มี (เช่น event จาก group ที่ไม่เปิดเผย) */
function extractUserId(event) {
    return event.source?.userId ?? null;
}
/**
 * แปลง postback data รูปแบบ "action=cancel&ticketId=xxx" เป็น object
 * ใช้ร่วมกับปุ่ม postback ใน Flex/Rich Menu
 */
function parsePostbackData(data) {
    const params = new URLSearchParams(data);
    const out = {};
    for (const [k, v] of params.entries())
        out[k] = v;
    return out;
}
//# sourceMappingURL=index.js.map