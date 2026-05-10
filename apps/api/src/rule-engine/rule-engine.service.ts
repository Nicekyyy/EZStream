import { Inject, Injectable } from "@nestjs/common";
import type { Prisma, Rule } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service.js";
import { QueuesService } from "../queues/queues.service.js";
import type { Redis } from "ioredis";
import { REDIS } from "../redis/redis.module.js";

const defaultGoogleTtsVoice = process.env.GOOGLE_TTS_VOICE ?? "th-TH-Neural2-C";

type Condition = {
  field: string;
  operator: string;
  value?: unknown;
};

type RuleAction = {
  type: string;
  widgetId?: string;
  textTemplate?: string;
  amountTemplate?: string;
  [key: string]: unknown;
};

function getPathValue(payload: Record<string, unknown>, path: string) {
  return path.split(".").reduce<unknown>((value, key) => {
    if (value && typeof value === "object" && key in value) {
      return (value as Record<string, unknown>)[key];
    }
    return undefined;
  }, payload);
}

function compareNumber(left: unknown, right: unknown, comparer: (a: number, b: number) => boolean) {
  const a = Number(left);
  const b = Number(right);
  return Number.isFinite(a) && Number.isFinite(b) && comparer(a, b);
}

function matchesCondition(payload: Record<string, unknown>, condition: Condition) {
  const actual = getPathValue(payload, condition.field);
  const expected = condition.value;

  switch (condition.operator) {
    case "equals":
      return actual === expected;
    case "notEquals":
      return actual !== expected;
    case "contains":
      return String(actual ?? "").includes(String(expected ?? ""));
    case "notContains":
      return !String(actual ?? "").includes(String(expected ?? ""));
    case "greaterThan":
      return compareNumber(actual, expected, (a, b) => a > b);
    case "greaterThanOrEqual":
      return compareNumber(actual, expected, (a, b) => a >= b);
    case "lessThan":
      return compareNumber(actual, expected, (a, b) => a < b);
    case "lessThanOrEqual":
      return compareNumber(actual, expected, (a, b) => a <= b);
    case "exists":
      return actual !== undefined && actual !== null;
    case "in":
      return Array.isArray(expected) && expected.includes(actual);
    default:
      return false;
  }
}

function renderTemplate(template: string, payload: Record<string, unknown>) {
  return template.replace(/\{([a-zA-Z0-9_.]+)\}/g, (_match, path: string) => {
    const value = getPathValue(payload, path);
    return value === undefined || value === null ? "" : String(value);
  });
}

function jsonArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

@Injectable()
export class RuleEngineService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(QueuesService) private readonly queues: QueuesService,
    @Inject(REDIS) private readonly redis: Redis
  ) {}

  async handleMockEvent(creatorId: string, eventType: string, payload: Record<string, unknown>) {
    const eventLog = await this.prisma.eventLog.create({
      data: {
        creatorId,
        eventType,
        payload: payload as Prisma.InputJsonValue,
        status: "RECEIVED"
      }
    });

    await this.queues.liveEvents.add("event.received", { eventLogId: eventLog.id, creatorId, eventType, payload });
    await this.publishCreator(creatorId, "event.received", { eventLogId: eventLog.id, eventType, payload });

    const rules = await this.prisma.rule.findMany({
      where: { creatorId, eventType, isEnabled: true },
      orderBy: [{ priority: "asc" }, { createdAt: "asc" }]
    });

    const matchedRules = rules.filter((rule) => this.ruleMatches(rule, payload));
    const matchedRuleIds = matchedRules.map((rule) => rule.id);

    for (const rule of matchedRules) {
      await this.applyRule(creatorId, eventLog.id, rule, payload);
    }

    return this.prisma.eventLog.update({
      where: { id: eventLog.id },
      data: {
        status: matchedRuleIds.length > 0 ? "MATCHED" : "PROCESSED",
        matchedRuleIds
      }
    });
  }

  private ruleMatches(rule: Rule, payload: Record<string, unknown>) {
    const conditions = jsonArray<Condition>(rule.conditions);
    return conditions.every((condition) => matchesCondition(payload, condition));
  }

  private async applyRule(creatorId: string, eventLogId: string, rule: Rule, payload: Record<string, unknown>) {
    const actions = jsonArray<RuleAction>(rule.actions);

    for (const action of actions) {
      if (action.type === "SPEAK_TTS") {
        await this.createTtsJob(creatorId, eventLogId, rule.id, action, payload);
        continue;
      }

      if (!action.widgetId) continue;

      const widgetAction = await this.prisma.widgetAction.create({
        data: {
          creatorId,
          widgetId: action.widgetId,
          eventLogId,
          ruleId: rule.id,
          actionType: action.type,
          payload: {
            ...action,
            renderedText: action.textTemplate ? renderTemplate(action.textTemplate, payload) : undefined,
            amount: action.amountTemplate ? Number(renderTemplate(action.amountTemplate, payload)) : undefined,
            eventPayload: payload
          } as Prisma.InputJsonValue
        }
      });

      await this.queues.widgetActions.add("widget.action", { widgetActionId: widgetAction.id });
      await this.publishWidget(action.widgetId, "widget.triggered", { widgetActionId: widgetAction.id, actionType: action.type, payload: widgetAction.payload });
    }
  }

  private async createTtsJob(creatorId: string, eventLogId: string, ruleId: string, action: RuleAction, payload: Record<string, unknown>) {
    const text = renderTemplate(action.textTemplate ?? "{username} said {message}", payload);
    const job = await this.prisma.ttsJob.create({
      data: {
        creatorId,
        widgetId: action.widgetId,
        eventLogId,
        ruleId,
        text,
        payload: {
          type: "tts.audio",
          text,
          voice: defaultGoogleTtsVoice,
          speed: 1,
          pitch: 1,
          volume: 1
        }
      }
    });

    await this.queues.ttsJobs.add("tts.speak", { ttsJobId: job.id });
    if (action.widgetId) {
      await this.publishWidget(action.widgetId, "tts.queued", { ttsJobId: job.id, text });
    }
  }

  private async publishWidget(widgetId: string, event: string, payload: unknown) {
    const widget = await this.prisma.widget.findUnique({ where: { id: widgetId }, include: { overlay: true } });
    if (!widget) return;
    await this.redis.publish(
      "ezstream:realtime",
      JSON.stringify({
        room: `overlay-token:${widget.overlay.token}`,
        event,
        payload
      })
    );
  }

  private async publishCreator(creatorId: string, event: string, payload: unknown) {
    await this.redis.publish("ezstream:realtime", JSON.stringify({ room: `creator:${creatorId}`, event, payload }));
  }
}
