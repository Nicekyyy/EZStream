import { Module } from "@nestjs/common";
import { PublicOverlayController } from "./public-overlay.controller.js";
import { PublicWidgetController } from "./public-widget.controller.js";

@Module({
  controllers: [PublicOverlayController, PublicWidgetController]
})
export class PublicModule {}
