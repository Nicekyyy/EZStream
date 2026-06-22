import { Inject, Injectable } from "@nestjs/common";
import { defaultGoogleTtsVoiceName, resolveGoogleTtsVoiceName, sanitizeTtsText } from "@ezstream/shared";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service.js";
import { QueuesService } from "../queues/queues.service.js";
import type { Redis } from "ioredis";
import { REDIS } from "../redis/redis.module.js";

const defaultGoogleTtsVoice = resolveGoogleTtsVoiceName(process.env.GOOGLE_TTS_VOICE, defaultGoogleTtsVoiceName);

function getPathValue(payload: Record<string, unknown>, path: string) {
  return path.split(".").reduce<unknown>((value, key) => {
    if (value && typeof value === "object" && key in value) {
      return (value as Record<string, unknown>)[key];
    }
    return undefined;
  }, payload);
}

function renderTemplate(template: string, payload: Record<string, unknown>) {
  return template.replace(/\{([a-zA-Z0-9_.]+)\}/g, (_match, path: string) => {
    const value = getPathValue(payload, path);
    return value === undefined || value === null ? "" : String(value);
  });
}

function jsonObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

@Injectable()
export class LiveEventsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(QueuesService) private readonly queues: QueuesService,
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

    if (eventType === "live.chat.message") {
      await this.createDefaultChatTtsJob(creatorId, eventLog.id, payload);
    }

    const updated = await this.prisma.eventLog.update({
      where: { id: eventLog.id },
      data: {
        status: "PROCESSED"
      }
    });

    return {
      ...updated,
      matchedRuleIds: []
    };
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
    await this.createTtsJob(creatorId, eventLogId, { widgetId: widget.id, textTemplate }, payload);
  }

  private async createTtsJob(creatorId: string, eventLogId: string, action: { widgetId: string; textTemplate: string }, payload: Record<string, unknown>) {
    const text = sanitizeTtsText(renderTemplate(action.textTemplate ?? "{username} said {message}", payload));
    if (!text) return;
    const widget = await this.prisma.widget.findFirst({ where: { id: action.widgetId, creatorId }, select: { config: true } });
    const widgetConfig = jsonObject(widget?.config);
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
    await this.publishWidget(action.widgetId, "tts.queued", { ttsJobId: job.id, text });
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
