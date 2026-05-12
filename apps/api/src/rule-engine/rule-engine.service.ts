import { Inject, Injectable } from "@nestjs/common";
import { defaultGoogleTtsVoiceName, resolveGoogleTtsVoiceName, sanitizeTtsText } from "@ezstream/shared";
import type { Prisma, Rule } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service.js";
import { QueuesService } from "../queues/queues.service.js";
import type { Redis } from "ioredis";
import { REDIS } from "../redis/redis.module.js";

const defaultGoogleTtsVoice = resolveGoogleTtsVoiceName(process.env.GOOGLE_TTS_VOICE, defaultGoogleTtsVoiceName);

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

function jsonObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
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
    if (eventType === "live.chat.message" && !matchedRules.some((rule) => this.hasSpeakTtsAction(rule))) {
      await this.createDefaultChatTtsJob(creatorId, eventLog.id, payload);
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

  private hasSpeakTtsAction(rule: Rule) {
    return jsonArray<RuleAction>(rule.actions).some((action) => action.type === "SPEAK_TTS");
  }

  private async createDefaultChatTtsJob(creatorId: string, eventLogId: string, payload: Record<string, unknown>) {
    const overlayId = typeof payload.overlayId === "string" ? payload.overlayId : undefined;
    const sameOverlayWidget = overlayId ? await this.prisma.widget.findFirst({
      where: {
        creatorId,
        overlayId,
        type: "TTS_WIDGET",
        isEnabled: true
      },
      orderBy: { createdAt: "asc" },
      select: { id: true, config: true }
    }) : null;
    const widget = sameOverlayWidget ?? await this.prisma.widget.findFirst({
      where: {
        creatorId,
        type: "TTS_WIDGET",
        isEnabled: true
      },
      orderBy: { createdAt: "asc" },
      select: { id: true, config: true }
    });
    if (!widget) return;
    const widgetConfig = jsonObject(widget.config);
    const textTemplate = widgetConfig.includeSenderName === false ? "{message}" : "{displayName}: {message}";
    await this.createTtsJob(creatorId, eventLogId, undefined, { type: "SPEAK_TTS", widgetId: widget.id, textTemplate }, payload);
  }

  private async createTtsJob(creatorId: string, eventLogId: string, ruleId: string | undefined, action: RuleAction, payload: Record<string, unknown>) {
    const text = sanitizeTtsText(renderTemplate(action.textTemplate ?? "{username} said {message}", payload));
    if (!text) return;
    const widget = action.widgetId ? await this.prisma.widget.findFirst({ where: { id: action.widgetId, creatorId }, select: { config: true } }) : null;
    const widgetConfig = jsonObject(widget?.config);
    const voice = resolveGoogleTtsVoiceName(action.voice ?? widgetConfig.voice, defaultGoogleTtsVoice);
    const speed = typeof widgetConfig.speed === "number" ? widgetConfig.speed : 1;
    const pitch = typeof widgetConfig.pitch === "number" ? widgetConfig.pitch : 1;
    const volume = typeof widgetConfig.volume === "number" ? widgetConfig.volume : 1;
    const job = await this.prisma.ttsJob.create({
      data: {
        creatorId,
        widgetId: action.widgetId,
        eventLogId,
        ruleId,
        text,
        voice,
        speed,
        pitch,
        volume,
        payload: {
          type: "tts.audio",
          text,
          voice,
          speed,
          pitch,
          volume
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
        room: `widget:${widget.id}`,
        event,
        payload
      })
    );
    if (!widget.overlay) return;
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
