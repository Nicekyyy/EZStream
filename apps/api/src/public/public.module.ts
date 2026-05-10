import { Module } from "@nestjs/common";
import { PublicOverlayController } from "./public-overlay.controller.js";

@Module({
  controllers: [PublicOverlayController]
})
export class PublicModule {}
