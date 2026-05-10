import { Module } from "@nestjs/common";
import { WidgetsController } from "./widgets.controller.js";
import { WidgetsService } from "./widgets.service.js";

@Module({
  controllers: [WidgetsController],
  providers: [WidgetsService]
})
export class WidgetsModule {}
