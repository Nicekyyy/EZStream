import { Inject, Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service.js";
import { REDIS } from "../redis/redis.module.js";
import type { Redis } from "ioredis";
import { RuleEngineService } from "../rules/rule-engine.service.js";

@Injectable()
export class LiveEventsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RuleEngineService) private readonly ruleEngine: RuleEngineService,
    @Inject(REDIS) private readonly redis: Redis
  ) {}

  async processEvent(creatorId: string, eventType: string, payload: Record<string, unknown>) {
    const eventLog = await this.prisma.eventLog.create({
      data: {
        creatorId,
        eventType,
        payload: payload as Prisma.InputJsonValue,
        status: "RECEIVED"
      }
    });

    await this.publishCreator(creatorId, "event.received", { eventLogId: eventLog.id, eventType, payload });

    const matchedRuleIds = await this.ruleEngine.evaluate(creatorId, eventType, payload, eventLog.id);

    const updated = await this.prisma.eventLog.update({
      where: { id: eventLog.id },
      data: {
        status: matchedRuleIds.length ? "MATCHED" : "PROCESSED",
        matchedRuleIds: JSON.stringify(matchedRuleIds)
      }
    });

    return { ...updated, matchedRuleIds };
  }

  private async publishCreator(creatorId: string, event: string, payload: unknown) {
    await this.redis.publish("ezstream:realtime", JSON.stringify({ room: `creator:${creatorId}`, event, payload }));
  }
}
