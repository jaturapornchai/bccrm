import { Logger } from "@nestjs/common";
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import type { Server, Socket } from "socket.io";

/**
 * Realtime gateway — กระจายอัปเดตคิวไปยังจอ TV, kiosk, แอปพนักงาน, LIFF
 * client join ห้องตาม branchId: `branch:<branchId>`
 */
@WebSocketGateway({ cors: { origin: true } })
export class QueueGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(QueueGateway.name);

  @WebSocketServer()
  server!: Server;

  handleConnection(client: Socket) {
    this.logger.debug(`client เชื่อมต่อ: ${client.id}`);
  }

  @SubscribeMessage("join-branch")
  joinBranch(client: Socket, branchId: string) {
    void client.join(`branch:${branchId}`);
    return { joined: branchId };
  }

  /** หน้าจอพนักงาน (admin หลายเครื่อง) — นับเครื่องที่ออนไลน์ให้ทุกเครื่องเห็น */
  @SubscribeMessage("join-staff")
  async joinStaff(client: Socket, branchId: string) {
    client.data.staffBranch = branchId;
    await client.join([`branch:${branchId}`, `staff:${branchId}`]);
    await this.emitStaffCount(branchId);
    return { joined: branchId };
  }

  async handleDisconnect(client: Socket) {
    if (client.data.staffBranch) await this.emitStaffCount(client.data.staffBranch as string);
  }

  private async emitStaffCount(branchId: string) {
    const room = `staff:${branchId}`;
    const count = (await this.server.in(room).fetchSockets()).length;
    this.server.to(room).emit("staff:count", count);
  }

  /** ออเดอร์ล่วงหน้าใหม่ → เฉพาะหน้าจอพนักงาน (LIFF ไม่ต้องโหลดซ้ำ) */
  emitOrder(branchId: string, payload: { orderNumber: string; totalAmount: number; ticketId?: string }) {
    this.server.to(`staff:${branchId}`).emit("order:new", payload);
  }

  /** แจ้งเตือนเมื่อสถานะออเดอร์ในครัวเปลี่ยน (เช่น COOKING -> READY -> SERVED) */
  emitOrderUpdate(branchId: string, payload: { id: string; orderNumber: string; status: string }) {
    this.server.to(`staff:${branchId}`).emit("order:update", payload);
  }

  /** เรียกจาก service อื่นเมื่อคิวเปลี่ยนสถานะ */
  emitQueueUpdate(branchId: string, payload: unknown) {
    this.server.to(`branch:${branchId}`).emit("queue:update", payload);
  }

  /** เรียกคิว — ส่งไปจอแสดงผล + เสียงเรียก */
  emitCall(branchId: string, payload: { number: string; counterName: string }) {
    this.server.to(`branch:${branchId}`).emit("queue:call", payload);
  }
}
