import { Module } from "@nestjs/common";
import { OverlaysController } from "./overlays.controller.js";
import { OverlaysService } from "./overlays.service.js";
import { RedisModule } from "../redis/redis.module.js";

@Module({
  imports: [RedisModule],
  controllers: [OverlaysController],
  providers: [OverlaysService]
})
export class OverlaysModule {}
