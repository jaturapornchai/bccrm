/**
 * Flex Message templates ภาษาไทยสำหรับ BCCRM
 * ทุก template ควรผ่านการทดสอบใน LINE Flex Message Simulator ก่อน merge
 */
export interface FlexMessage {
    type: "flex";
    altText: string;
    contents: Record<string, unknown>;
}
export interface TicketCardData {
    ticketNumber: string;
    branchName: string;
    serviceName: string;
    /** จำนวนคิวข้างหน้า */
    aheadCount: number;
    /** เวลารอโดยประมาณ (นาที) */
    estimatedWaitMinutes: number;
    /** URL ของ LIFF บัตรคิวสด */
    ticketUrl: string;
}
/** บัตรคิว — ส่งเมื่อจอง/กดคิวสำเร็จ */
export declare function ticketCardFlex(data: TicketCardData): FlexMessage;
/** แจ้งเตือนใกล้ถึงคิว */
export declare function almostThereFlex(data: TicketCardData): FlexMessage;
/** เรียกคิว — ถึงคิวแล้ว */
export declare function calledFlex(ticketNumber: string, counterName: string, ticketUrl: string): FlexMessage;
/** ยกเลิกคิวสำเร็จ */
export declare function cancelledFlex(ticketNumber: string, rebookUrl: string): FlexMessage;
