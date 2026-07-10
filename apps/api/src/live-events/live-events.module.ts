import { Module } from "@nestjs/common";
import { LiveEventsService } from "./live-events.service.js";
import { PrismaModule } from "../prisma/prisma.module.js";
import { RedisModule } from "../redis/redis.module.js";
import { RulesModule } from "../rules/rules.module.js";

@Module({
  imports: [PrismaModule, RedisModule, RulesModule],
  providers: [LiveEventsService],
  exports: [LiveEventsService]
})
export class LiveEventsModule {}
