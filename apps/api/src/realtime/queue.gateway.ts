import { Logger } from "@nestjs/common";
import {
  OnGatewayConnection,
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
export class QueueGateway implements OnGatewayConnection {
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

  /** เรียกจาก service อื่นเมื่อคิวเปลี่ยนสถานะ */
  emitQueueUpdate(branchId: string, payload: unknown) {
    this.server.to(`branch:${branchId}`).emit("queue:update", payload);
  }

  /** เรียกคิว — ส่งไปจอแสดงผล + เสียงเรียก */
  emitCall(branchId: string, payload: { number: string; counterName: string }) {
    this.server.to(`branch:${branchId}`).emit("queue:call", payload);
  }
}
