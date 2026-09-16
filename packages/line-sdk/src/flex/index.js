"use strict";
/**
 * Flex Message templates ภาษาไทยสำหรับ BCCRM
 * ทุก template ควรผ่านการทดสอบใน LINE Flex Message Simulator ก่อน merge
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ticketCardFlex = ticketCardFlex;
exports.almostThereFlex = almostThereFlex;
exports.calledFlex = calledFlex;
exports.cancelledFlex = cancelledFlex;
const bubble = (headerText, headerColor, bodyContents, footerUrl, footerLabel) => ({
    type: "bubble",
    header: {
        type: "box",
        layout: "vertical",
        backgroundColor: headerColor,
        contents: [{ type: "text", text: headerText, color: "#FFFFFF", weight: "bold", size: "lg" }],
    },
    body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: bodyContents,
    },
    footer: {
        type: "box",
        layout: "vertical",
        contents: [
            {
                type: "button",
                style: "primary",
                action: { type: "uri", label: footerLabel, uri: footerUrl },
            },
        ],
    },
});
const row = (label, value) => ({
    type: "box",
    layout: "baseline",
    contents: [
        { type: "text", text: label, color: "#8C8C8C", size: "sm", flex: 2 },
        { type: "text", text: value, size: "sm", flex: 4, wrap: true },
    ],
});
/** บัตรคิว — ส่งเมื่อจอง/กดคิวสำเร็จ */
function ticketCardFlex(data) {
    return {
        type: "flex",
        altText: `บัตรคิว ${data.ticketNumber} — เหลืออีก ${data.aheadCount} คิว`,
        contents: bubble(`🎫 บัตรคิว ${data.ticketNumber}`, "#06C755", [
            { type: "text", text: data.ticketNumber, size: "3xl", weight: "bold", align: "center" },
            { type: "separator" },
            row("สาขา", data.branchName),
            row("บริการ", data.serviceName),
            row("คิวข้างหน้า", `${data.aheadCount} คิว`),
            row("รอประมาณ", `${data.estimatedWaitMinutes} นาที`),
        ], data.ticketUrl, "ดูสถานะคิวสด"),
    };
}
/** แจ้งเตือนใกล้ถึงคิว */
function almostThereFlex(data) {
    return {
        type: "flex",
        altText: `ใกล้ถึงคิว ${data.ticketNumber} แล้ว เหลืออีก ${data.aheadCount} คิว`,
        contents: bubble("⏰ ใกล้ถึงคิวของคุณแล้ว", "#FF9500", [
            { type: "text", text: `เหลืออีก ${data.aheadCount} คิว`, size: "xl", weight: "bold", align: "center" },
            { type: "text", text: `เลขคิวของคุณ: ${data.ticketNumber}`, align: "center", color: "#555555" },
            { type: "text", text: "กรุณาเตรียมตัวให้พร้อม", align: "center", size: "sm", color: "#8C8C8C" },
        ], data.ticketUrl, "ดูสถานะคิวสด"),
    };
}
/** เรียกคิว — ถึงคิวแล้ว */
function calledFlex(ticketNumber, counterName, ticketUrl) {
    return {
        type: "flex",
        altText: `ถึงคิว ${ticketNumber} แล้ว! กรุณาไปที่ ${counterName}`,
        contents: bubble("📢 ถึงคิวของคุณแล้ว!", "#E02020", [
            { type: "text", text: ticketNumber, size: "3xl", weight: "bold", align: "center" },
            { type: "text", text: `กรุณาไปที่ ${counterName}`, align: "center", size: "lg" },
        ], ticketUrl, "ดูบัตรคิว"),
    };
}
/** ยกเลิกคิวสำเร็จ */
function cancelledFlex(ticketNumber, rebookUrl) {
    return {
        type: "flex",
        altText: `ยกเลิกคิว ${ticketNumber} เรียบร้อยแล้ว`,
        contents: bubble("❌ ยกเลิกคิวเรียบร้อย", "#8C8C8C", [
            { type: "text", text: `คิว ${ticketNumber} ถูกยกเลิกแล้ว`, align: "center", wrap: true },
            { type: "text", text: "หวังว่าจะได้บริการคุณในครั้งหน้า", align: "center", size: "sm", color: "#8C8C8C" },
        ], rebookUrl, "จองคิวใหม่"),
    };
}
//# sourceMappingURL=index.js.map