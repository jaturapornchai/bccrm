import { Body, Controller, Post } from "@nestjs/common";
import { IsOptional, IsString } from "class-validator";
import { LineAiService } from "./line-ai.service";

export class SendChatMessageDto {
  @IsString()
  message!: string;

  @IsOptional()
  @IsString()
  lineUserId?: string;
}

@Controller("chat")
export class ChatController {
  constructor(private readonly ai: LineAiService) {}

  @Post()
  async chat(@Body() dto: SendChatMessageDto) {
    const userId = dto.lineUserId || "Uguest";
    return this.ai.chatWithAi(userId, dto.message);
  }
}
