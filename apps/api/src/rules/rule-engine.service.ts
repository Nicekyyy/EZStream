import { Inject, Injectable } from "@nestjs/common";
import type { Prisma, Rule } from "@prisma/client";
import type { Redis } from "ioredis";
import {
  defaultGoogleTtsVoiceName,
  renderTemplate,
  resolveGoogleTtsVoiceName,
  sanitizeTtsText,
  type RuleAction
} from "@ezstream/shared";
import { PrismaService } from "../prisma/prisma.service.js";
import { QueuesService } from "../queues/queues.service.js";
import { REDIS } from "../redis/redis.module.js";
import { evaluateConditions, pickRandom, type ConditionNode } from "./rule-evaluator.js";

const defaultGoogleTtsVoice = resolveGoogleTtsVoiceName(process.env.GOOGLE_TTS_VOICE, defaultGoogleTtsVoiceName);

type CacheEntry = { rules: Rule[]; expiresAt: number };

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function isWithinActiveWindow(activeFrom: string | null, activeTo: string | null, now = new Date()): boolean {
  if (!activeFrom || !activeTo) return true;
  const minutes = now.getHours() * 60 + now.getMinutes();
  const [fromH, fromM] = activeFrom.split(":").map(Number);
  const [toH, toM] = activeTo.split(":").map(Number);
  const from = fromH * 60 + fromM;
  const to = toH * 60 + toM;
  // Malformed times would make every comparison NaN and silently disable the rule.
  if (!Number.isFinite(from) || !Number.isFinite(to)) return true;
  if (from === to) return true;
  if (from < to) return minutes >= from && minutes < to;
  return minutes >= from || minutes < to;
}

@Injectable()
export class RuleEngineService {
  private cache = new Map<string, CacheEntry>();
  private cooldowns = new Map<string, number>();
  private readonly cacheTtlMs = 5000;
  private readonly maxCooldownEntries = 10000;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(QueuesService) private readonly queues: QueuesService,
    @Inject(REDIS) private readonly redis: Redis
  ) {}

  invalidate(creatorId: string) {
    this.cache.delete(creatorId);
  }

  async evaluate(creatorId: string, eventType: string, payload: Record<string, unknown>, eventLogId: string): Promise<string[]> {
    const rules = await this.loadRules(creatorId);
    const matchedIds: string[] = [];

    for (const rule of rules) {
      try {
        if (!this.appliesTo(rule, eventType)) continue;
        if (!isWithinActiveWindow(rule.activeFrom, rule.activeTo)) continue;
        if (this.isCoolingDown(rule, payload)) continue;

        const conditions = (rule.conditions ?? { all: [] }) as ConditionNode;
        if (!evaluateConditions(conditions, payload)) continue;

        matchedIds.push(rule.id);
        this.markFired(rule, payload);
        await this.runActions(creatorId, rule, payload, eventLogId);

        if (rule.stopOnMatch) break;
      } catch (error) {
        console.error(`[rules] Rule ${rule.id} failed:`, error);
        await this.prisma.eventLog
          .update({
            where: { id: eventLogId },
            data: { errorMessage: `Rule "${rule.name}" failed: ${error instanceof Error ? error.message : String(error)}` }
          })
          .catch(() => undefined);
      }
    }

    if (matchedIds.length) {
      await this.prisma.rule
        .updateMany({ where: { id: { in: matchedIds } }, data: { lastFiredAt: new Date() } })
        .catch(() => undefined);
    }

    return matchedIds;
  }

  private async loadRules(creatorId: string): Promise<Rule[]> {
    const cached = this.cache.get(creatorId);
    if (cached && cached.expiresAt > Date.now()) return cached.rules;
    const rules = await this.prisma.rule.findMany({
      where: { creatorId, isEnabled: true },
      orderBy: [{ priority: "asc" }, { createdAt: "asc" }]
    });
    this.cache.set(creatorId, { rules, expiresAt: Date.now() + this.cacheTtlMs });
    return rules;
  }

  private appliesTo(rule: Rule, eventType: string): boolean {
    const types = Array.isArray(rule.eventTypes) ? (rule.eventTypes as unknown[]) : [];
    return types.includes(eventType);
  }

  private cooldownKey(rule: Rule, payload: Record<string, unknown>): string {
    if (rule.cooldownScope === "user") {
      const username = typeof payload.username === "string" ? payload.username : "unknown";
      return `${rule.id}:${username}`;
    }
    return rule.id;
  }

  private isCoolingDown(rule: Rule, payload: Record<string, unknown>): boolean {
    if (rule.cooldownSeconds <= 0) return false;
    const key = this.cooldownKey(rule, payload);
    const lastFired = this.cooldowns.get(key) ?? (rule.cooldownScope === "rule" ? rule.lastFiredAt?.getTime() ?? 0 : 0);
    return Date.now() - lastFired < rule.cooldownSeconds * 1000;
  }

  private markFired(rule: Rule, payload: Record<string, unknown>) {
    if (rule.cooldownSeconds <= 0) return;
    this.pruneCooldowns();
    this.cooldowns.set(this.cooldownKey(rule, payload), Date.now());
  }

  private pruneCooldowns() {
    if (this.cooldowns.size < this.maxCooldownEntries) return;
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    for (const [key, timestamp] of this.cooldowns) {
      if (timestamp < cutoff) this.cooldowns.delete(key);
    }
    // Age-based pruning is a no-op when every entry is recent (busy chat with
    // per-user cooldowns) — evict oldest-inserted entries to keep the map bounded.
    let toEvict = this.cooldowns.size - Math.floor(this.maxCooldownEntries / 2);
    if (toEvict <= 0) return;
    for (const key of this.cooldowns.keys()) {
      if (toEvict-- <= 0) break;
      this.cooldowns.delete(key);
    }
  }

  private async runActions(creatorId: string, rule: Rule, payload: Record<string, unknown>, eventLogId: string) {
    const actions = Array.isArray(rule.actions) ? (rule.actions as unknown as RuleAction[]) : [];
    for (const action of actions) {
      await this.runAction(creatorId, action, payload, eventLogId);
    }
  }

  private async runAction(creatorId: string, action: RuleAction, payload: Record<string, unknown>, eventLogId: string) {
    if (action.type === "RANDOM") {
      const chosen = pickRandom(action.actions ?? [], action.pick ?? 1);
      for (const child of chosen) await this.runAction(creatorId, child, payload, eventLogId);
      return;
    }
    if (action.type === "SPEAK_TTS") {
      await this.speakTts(creatorId, action, payload, eventLogId);
      return;
    }
    if (!action.widgetId) return;
    await this.dispatchWidgetAction(creatorId, action, payload);
  }

  private resolveAmount(amount: RuleAction["amount"], payload: Record<string, unknown>): number | undefined {
    if (amount === undefined) return undefined;
    if (typeof amount === "number") return amount;
    const numeric = Number(renderTemplate(amount, payload));
    return Number.isFinite(numeric) ? numeric : 1;
  }

  private async resolveMediaUrl(creatorId: string, mediaAssetId: string | undefined): Promise<string | undefined> {
    if (!mediaAssetId) return undefined;
    const asset = await this.prisma.mediaAsset.findFirst({ where: { id: mediaAssetId, creatorId } });
    return asset?.publicPath;
  }

  private async dispatchWidgetAction(creatorId: string, action: RuleAction, payload: Record<string, unknown>) {
    const widget = await this.prisma.widget.findFirst({ where: { id: action.widgetId, creatorId } });
    if (!widget) return;

    const renderedText = action.textTemplate ? renderTemplate(action.textTemplate, payload) : undefined;
    const mediaUrl = await this.resolveMediaUrl(creatorId, action.mediaAssetId);
    const amount = this.resolveAmount(action.amount, payload);

    const actionPayload: Record<string, unknown> = {
      ...payload,
      renderedText,
      mediaUrl,
      durationMs: action.durationMs,
      amount
    };

    const widgetAction = await this.prisma.widgetAction.create({
      data: {
        creatorId,
        widgetId: widget.id,
        actionType: action.type,
        payload: actionPayload as Prisma.InputJsonValue
      }
    });

    await this.queues.widgetActions.add("widget.action", { widgetActionId: widgetAction.id });
  }

  private async speakTts(creatorId: string, action: RuleAction, payload: Record<string, unknown>, eventLogId: string) {
    if (!action.widgetId) return;
    const widget = await this.prisma.widget.findFirst({
      where: { id: action.widgetId, creatorId, type: "TTS_WIDGET" },
      select: { id: true, config: true }
    });
    if (!widget) return;

    const widgetConfig = jsonObject(widget.config);
    const message = typeof payload.message === "string" ? payload.message : "";

    if (widgetConfig.ignoreCommands !== false && (message.startsWith("!") || message.startsWith("/"))) {
      return;
    }

    let filteredMessage = message;
    if (typeof widgetConfig.bannedWords === "string" && widgetConfig.bannedWords.trim()) {
      const words = widgetConfig.bannedWords.split(",").map((w) => w.trim()).filter(Boolean);
      for (const word of words) {
        const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        filteredMessage = filteredMessage.replace(new RegExp(escaped, "gi"), "");
      }
    }

    const maxLen = typeof widgetConfig.maxMessageLength === "number" ? widgetConfig.maxMessageLength : 300;
    if (filteredMessage.length > maxLen) {
      filteredMessage = filteredMessage.slice(0, maxLen);
    }

    const nextPayload = { ...payload, message: filteredMessage };
    const template = action.textTemplate ?? (widgetConfig.includeSenderName === false ? "{message}" : "{displayName}: {message}");
    const text = sanitizeTtsText(renderTemplate(template, nextPayload));
    if (!text) return;

    const voice = resolveGoogleTtsVoiceName(widgetConfig.voice, defaultGoogleTtsVoice);
    const speed = typeof widgetConfig.speed === "number" ? widgetConfig.speed : 1;
    const pitch = typeof widgetConfig.pitch === "number" ? widgetConfig.pitch : 1;
    const volume = typeof widgetConfig.volume === "number" ? widgetConfig.volume : 1;

    const job = await this.prisma.ttsJob.create({
      data: {
        creatorId,
        widgetId: action.widgetId,
        eventLogId,
        text,
        voice,
        speed,
        pitch,
        volume,
        payload: { type: "tts.audio", text, voice, speed, pitch, volume }
      }
    });

    await this.queues.ttsJobs.add("tts.speak", { ttsJobId: job.id });
    await this.publishWidget(action.widgetId, "tts.queued", { ttsJobId: job.id, text });
  }

  private async publishWidget(widgetId: string, event: string, payload: unknown) {
    const widget = await this.prisma.widget.findUnique({ where: { id: widgetId }, include: { overlay: true } });
    if (!widget) return;
    await this.redis.publish("ezstream:realtime", JSON.stringify({ room: `widget:${widget.id}`, event, payload }));
    if (!widget.overlay) return;
    await this.redis.publish(
      "ezstream:realtime",
      JSON.stringify({ room: `overlay-token:${widget.overlay.token}`, event, payload })
    );
  }
}
