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

  // SQLite allows one writer at a time — process events sequentially so a chat
  // burst queues up instead of exhausting the connection pool with lock errors.
  private static readonly maxPending = 1000;
  private pending = 0;
  private tail: Promise<unknown> = Promise.resolve();

  async processEvent(creatorId: string, eventType: string, payload: Record<string, unknown>) {
    if (this.pending >= LiveEventsService.maxPending) {
      throw new Error(`Live event queue is full (${LiveEventsService.maxPending} pending) — event dropped to stay responsive`);
    }
    this.pending++;
    const result = this.tail.then(() => this.handleEvent(creatorId, eventType, payload));
    this.tail = result.then(
      () => {
        this.pending--;
      },
      () => {
        this.pending--;
      }
    );
    return result;
  }

  private async handleEvent(creatorId: string, eventType: string, payload: Record<string, unknown>) {
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

    await this.publishCreator(creatorId, "event.logged", {
      id: updated.id,
      eventType: updated.eventType,
      payload: updated.payload,
      status: updated.status,
      matchedRuleIds,
      createdAt: updated.createdAt
    });

    return { ...updated, matchedRuleIds };
  }

  private async publishCreator(creatorId: string, event: string, payload: unknown) {
    await this.redis.publish("ezstream:realtime", JSON.stringify({ room: `creator:${creatorId}`, event, payload }));
  }
}
