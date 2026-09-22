import { Module } from "@nestjs/common";
import { QueuesModule } from "../queues/queues.module";
import { McpController } from "./mcp.controller";
import { McpServerFactory } from "./mcp-server.factory";

/**
 * MCP (Model Context Protocol) — เปิดเครื่องมือระบบคิวให้ AI agent
 * เรียกใช้ผ่าน HTTP endpoint เดียวกับ REST API: POST /mcp
 * Web admin / agent / automation ต่างเชื่อม backend เดียวกัน
 */
@Module({
  imports: [QueuesModule],
  controllers: [McpController],
  providers: [McpServerFactory],
})
export class McpModule {}
