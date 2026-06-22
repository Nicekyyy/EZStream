import { Module } from "@nestjs/common";
import { LiveEventsService } from "./live-events.service.js";
import { PrismaModule } from "../prisma/prisma.module.js";
import { QueuesModule } from "../queues/queues.module.js";
import { RedisModule } from "../redis/redis.module.js";

@Module({
  imports: [PrismaModule, QueuesModule, RedisModule],
  providers: [LiveEventsService],
  exports: [LiveEventsService]
})
export class LiveEventsModule {}
