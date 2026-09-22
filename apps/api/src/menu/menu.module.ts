import { Module } from "@nestjs/common";
import { MongoModule } from "../mongo/mongo.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { MenuController } from "./menu.controller";
import { MenuService } from "./menu.service";

@Module({
  imports: [MongoModule, RealtimeModule],
  controllers: [MenuController],
  providers: [MenuService],
  exports: [MenuService],
})
export class MenuModule {}
