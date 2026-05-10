import { Module } from "@nestjs/common";
import { OverlaysController } from "./overlays.controller.js";
import { OverlaysService } from "./overlays.service.js";

@Module({
  controllers: [OverlaysController],
  providers: [OverlaysService]
})
export class OverlaysModule {}
