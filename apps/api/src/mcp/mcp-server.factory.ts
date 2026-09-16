import { Injectable } from "@nestjs/common";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { QueuesService } from "../queues/queues.service";

const json = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
});

/**
 * สร้าง MCP server ต่อ request (stateless — ไม่ต้องจัดการ session)
 * เครื่องมือทั้งหมด wrap QueuesService ตัวเดียวกับ REST API
 *
 * หมายเหตุ: cast เป็น any เพื่อเลี่ยง TS2589 (type instantiation ลึกเกิน)
 * จากการผสาน generic ของ MCP SDK + zod — ความถูกต้องบังคับด้วย zod ตอน runtime อยู่แล้ว
 */
@Injectable()
export class McpServerFactory {
  constructor(private readonly queues: QueuesService) {}

  create(): McpServer {
    const server = new McpServer(
      { name: "bccrm", version: "0.1.0" },
      { instructions: "ระบบคิวและ CRM ของ BCCRM — ใช้เครื่องมือนี้จัดการคิวของสาขา (demo branchId = \"demo\")" },
    );

    /* eslint-disable @typescript-eslint/no-explicit-any */
    const register = server.registerTool.bind(server) as (
      name: string,
      config: any,
      handler: (args: any) => Promise<unknown>,
    ) => void;

    register(
      "bccrm_list_waiting",
      {
        title: "ดูคิวที่รออยู่",
        description: "ดึงรายการคิวที่รอเรียกของสาขาในวันนี้ เรียงตามนโยบาย (VIP ก่อน, ดันคิวรอนาน)",
        inputSchema: { branchId: z.string().describe("รหัสสาขา เช่น \"demo\"") },
      },
      async ({ branchId }) => json(await this.queues.waitingList(branchId)),
    );

    register(
      "bccrm_create_ticket",
      {
        title: "ออกคิวใหม่",
        description: "ออกเลขคิวใหม่ให้ลูกค้า (walk-in kiosk / staff / LINE booking)",
        inputSchema: {
          branchId: z.string(),
          serviceId: z.string().describe("รหัสบริการ เช่น svc-general หรือ svc-vip"),
          source: z.enum(["LINE_BOOKING", "WALK_IN_KIOSK", "STAFF_CREATED"]),
          isVip: z.boolean().optional(),
        },
      },
      async (input) => json(await this.queues.createTicket(input)),
    );

    register(
      "bccrm_call_next",
      {
        title: "เรียกคิวถัดไป",
        description: "เรียกคิวที่ควรได้รับบริการถัดไปเข้าเคาน์เตอร์",
        inputSchema: {
          branchId: z.string(),
          counterId: z.string().describe("เช่น counter-1"),
          staffId: z.string().describe("รหัสพนักงานที่เรียก"),
        },
      },
      async ({ branchId, counterId, staffId }) =>
        json(await this.queues.callNext(branchId, counterId, staffId)),
    );

    register(
      "bccrm_change_state",
      {
        title: "เปลี่ยนสถานะคิว",
        description: "เปลี่ยนสถานะตั๋วคิว: serving / done / no_show / cancelled (ตาม state machine)",
        inputSchema: {
          ticketId: z.string(),
          state: z.enum(["serving", "done", "no_show", "cancelled", "waiting"]),
        },
      },
      async ({ ticketId, state }) => json(await this.queues.changeState(ticketId, state)),
    );

    register(
      "bccrm_today_stats",
      {
        title: "สถิติคิววันนี้",
        description: "จำนวนตั๋วคิวแยกตามสถานะของสาขาในวันนี้",
        inputSchema: { branchId: z.string() },
      },
      async ({ branchId }) => json(await this.queues.todayStats(branchId)),
    );

    return server;
  }
}
