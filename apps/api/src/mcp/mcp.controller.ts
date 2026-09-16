import { Controller, Post, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { McpServerFactory } from "./mcp-server.factory";

/**
 * MCP over HTTP (stateless) — ทุก request สร้าง server+transport ใหม่
 * client เรียก POST /mcp ด้วย JSON-RPC (initialize → tools/list → tools/call)
 */
@Controller("mcp")
export class McpController {
  constructor(private readonly factory: McpServerFactory) {}

  @Post()
  async handle(@Req() req: Request, @Res() res: Response) {
    const server = this.factory.create();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless
    });

    res.on("close", () => {
      void transport.close();
      void server.close();
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  }
}
