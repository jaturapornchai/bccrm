import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "./prisma/prisma.module";
import { MongoModule } from "./mongo/mongo.module";
import { HealthController } from "./health/health.controller";
import { QueuesModule } from "./queues/queues.module";
import { LineModule } from "./line/line.module";
import { AuthModule } from "./auth/auth.module";
import { RealtimeModule } from "./realtime/realtime.module";
import { McpModule } from "./mcp/mcp.module";
import { MenuModule } from "./menu/menu.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: "../../.env" }),
    PrismaModule,
    MongoModule,
    RealtimeModule,
    AuthModule,
    QueuesModule,
    LineModule,
    McpModule,
    MenuModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
