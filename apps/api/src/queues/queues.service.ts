import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { defaultGoogleTtsVoiceName, googleTtsVoiceLanguageCode, resolveGoogleTtsVoiceName, sanitizeTtsText } from "@ezstream/shared";
import { Prisma, TtsJobStatus, WidgetActionStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service.js";
import { REDIS } from "../redis/redis.module.js";
import { createSign } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { EventEmitter } from "node:events";

class InMemoryQueue extends EventEmitter {
  private queue: Array<{ id: string; name: string; data: any }> = [];
  private processing = false;
  private processor?: (job: { id: string; name: string; data: any }) => Promise<void>;

  constructor(
    public name: string,
    private readonly maxSize = 1000
  ) {
    super();
  }

  async add(name: string, data: any): Promise<{ id: string; name: string; data: any }> {
    const job = { id: Math.random().toString(36).substring(7), name, data };
    this.queue.push(job);
    // Shed the oldest job when full so a chat burst can't grow memory unboundedly.
    if (this.queue.length > this.maxSize) {
      const dropped = this.queue.shift();
      if (dropped) {
        console.warn(`[queues] ${this.name} queue full (${this.maxSize}); dropping oldest job ${dropped.id}`);
        this.emit("dropped", dropped);
      }
    }
    void this.processNext();
    return job;
  }

  process(processor: (job: { id: string; name: string; data: any }) => Promise<void>) {
    this.processor = processor;
    void this.processNext();
  }

  private async processNext() {
    if (this.processing || !this.processor || this.queue.length === 0) return;
    this.processing = true;
    const job = this.queue.shift();
    if (job) {
      try {
        await this.processor(job);
      } catch (error: any) {
        console.error(`Error processing job in ${this.name}:`, error);
        this.emit("failed", job, error);
      }
    }
    this.processing = false;
    void this.processNext();
  }

  async close() {
    this.queue = [];
  }
}

@Injectable()
export class QueuesService implements OnModuleInit, OnModuleDestroy {
  readonly liveEvents = new InMemoryQueue("live-events", 1000);
  readonly widgetActions = new InMemoryQueue("widget-actions", 500);
  // TTS is the slowest consumer (Google API call + per-creator cooldown), keep it tight.
  readonly ttsJobs = new InMemoryQueue("tts-jobs", 200);

  private readonly lastTtsByCreator = new Map<string, number>();
  private googleAccessToken?: { token: string; expiresAt: number };
  private googleTtsVoice!: string;
  private googleTtsEndpoint = "https://texttospeech.googleapis.com/v1/text:synthesize";

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: any,
    @Inject(ConfigService) private readonly config: ConfigService
  ) {
    console.log("[QUEUES_SERVICE_DEBUG] Constructor args:", { prisma: !!prisma, redis: !!redis, config: !!config });
  }

  onModuleInit() {
    this.googleTtsVoice = resolveGoogleTtsVoiceName(this.config.get<string>("GOOGLE_TTS_VOICE"), defaultGoogleTtsVoiceName);
    
    // Start worker loops
    this.widgetActions.process(async (job) => {
      try {
        await this.processWidgetAction(String(job.data.widgetActionId));
      } catch (error: any) {
        await this.prisma.widgetAction.update({
          where: { id: String(job.data.widgetActionId) },
          data: { status: WidgetActionStatus.FAILED, errorMessage: error.message }
        }).catch(() => undefined);
        throw error;
      }
    });

    this.ttsJobs.process(async (job) => {
      try {
        await this.processTtsJob(String(job.data.ttsJobId));
      } catch (error: any) {
        await this.prisma.ttsJob.update({
          where: { id: String(job.data.ttsJobId) },
          data: { status: TtsJobStatus.FAILED, errorMessage: error.message }
        }).catch(() => undefined);
        throw error;
      }
    });

    // Jobs shed by the bounded queues would otherwise stay QUEUED in the DB forever.
    this.widgetActions.on("dropped", (job: { data: { widgetActionId?: unknown } }) => {
      void this.prisma.widgetAction.update({
        where: { id: String(job.data.widgetActionId) },
        data: { status: WidgetActionStatus.FAILED, errorMessage: "Dropped: widget action queue overloaded" }
      }).catch(() => undefined);
    });
    this.ttsJobs.on("dropped", (job: { data: { ttsJobId?: unknown } }) => {
      void this.prisma.ttsJob.update({
        where: { id: String(job.data.ttsJobId) },
        data: { status: TtsJobStatus.FAILED, errorMessage: "Dropped: TTS queue overloaded" }
      }).catch(() => undefined);
    });
  }

  async onModuleDestroy() {
    await Promise.all([this.liveEvents.close(), this.widgetActions.close(), this.ttsJobs.close()]);
  }

  // ─── Worker Logic ──────────────────────────────────────────────────────────

  private async processWidgetAction(widgetActionId: string) {
    const action = await this.prisma.widgetAction.update({
      where: { id: widgetActionId },
      data: { status: WidgetActionStatus.PROCESSING },
      include: { widget: { include: { state: true } } }
    });

    const currentState = action.widget.state?.state && typeof action.widget.state.state === "object" ? action.widget.state.state : {};
    const payload = action.payload && typeof action.payload === "object" ? (action.payload as Record<string, unknown>) : {};
    let nextState: Record<string, unknown> = { ...(currentState as Record<string, unknown>) };

    if (action.actionType === "UPDATE_GOAL") {
      const amount = Number(payload.amount ?? 1);
      const current = Number(nextState.current ?? 0);
      nextState = { ...nextState, current: current + (Number.isFinite(amount) ? amount : 1) };
    } else if (action.actionType === "APPEND_EVENT_LIST") {
      const items = Array.isArray(nextState.items) ? nextState.items : [];
      nextState = { ...nextState, items: [payload, ...items].slice(0, 20) };
    } else if (action.actionType === "PLAY_SOUND") {
      const mediaUrl = typeof payload.mediaUrl === "string" && payload.mediaUrl ? payload.mediaUrl : undefined;
      nextState = {
        ...nextState,
        playing: true,
        src: mediaUrl ?? nextState.src,
        lastAction: payload,
        lastTriggeredAt: new Date().toISOString()
      };
    } else if (action.actionType === "UPDATE_TEXT") {
      nextState = { ...nextState, text: payload.renderedText ?? payload.text ?? "" };
    } else if (action.actionType === "SHOW_IMAGE") {
      const mediaUrl = typeof payload.mediaUrl === "string" && payload.mediaUrl ? payload.mediaUrl : undefined;
      nextState = {
        ...nextState,
        visible: true,
        src: mediaUrl ?? nextState.src,
        lastAction: payload,
        lastTriggeredAt: new Date().toISOString()
      };
    } else {
      nextState = { ...nextState, visible: true, lastAction: payload, lastTriggeredAt: new Date().toISOString() };
    }

    await this.prisma.widgetState.upsert({
      where: { widgetId: action.widgetId },
      update: { state: nextState as Prisma.InputJsonValue, version: { increment: 1 } },
      create: { widgetId: action.widgetId, state: nextState as Prisma.InputJsonValue }
    });

    const completed = await this.prisma.widgetAction.update({
      where: { id: widgetActionId },
      data: { status: WidgetActionStatus.COMPLETED, completedAt: new Date() },
      include: { widget: { include: { overlay: true } } }
    });

    const eventName = action.actionType === "UPDATE_GOAL" ? "goal.updated" : action.actionType === "APPEND_EVENT_LIST" ? "event.list.appended" : "widget.completed";
    const eventPayload = { widgetActionId, widgetId: action.widgetId, actionType: action.actionType, state: nextState };
    
    await this.redis.publish(
      "ezstream:realtime",
      JSON.stringify({
        room: `widget:${completed.widget.id}`,
        event: eventName,
        payload: eventPayload
      })
    );
    if (completed.widget.overlay) {
      await this.redis.publish(
        "ezstream:realtime",
        JSON.stringify({
          room: `overlay-token:${completed.widget.overlay.token}`,
          event: eventName,
          payload: eventPayload
        })
      );
    }
  }

  private async processTtsJob(ttsJobId: string) {
    const job = await this.prisma.ttsJob.update({
      where: { id: ttsJobId },
      data: { status: TtsJobStatus.PROCESSING },
      include: { creator: true, widget: { include: { overlay: true } } }
    });

    const bannedWords = this.creatorBannedWords(job.creator.settings);
    const cooldownMs = this.creatorCooldownMs(job.creator.settings);
    const lastRunAt = this.lastTtsByCreator.get(job.creatorId) ?? 0;
    const waitMs = Math.max(0, cooldownMs - (Date.now() - lastRunAt));
    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }

    const text = this.sanitizeText(sanitizeTtsText(job.text), bannedWords);
    this.lastTtsByCreator.set(job.creatorId, Date.now());
    if (!text) {
      return this.prisma.ttsJob.update({
        where: { id: ttsJobId },
        data: {
          status: TtsJobStatus.FAILED,
          text,
          errorMessage: "TTS text has no readable content"
        }
      });
    }

    if (!job.widget || !job.widget.isEnabled || (job.widget.overlay && !job.widget.overlay.isActive)) {
      return this.prisma.ttsJob.update({
        where: { id: ttsJobId },
        data: {
          status: TtsJobStatus.FAILED,
          text,
          errorMessage: "TTS widget is not available"
        }
      });
    }

    const audio = await this.synthesizeGoogleTts({ text, voice: job.voice, speed: job.speed, pitch: job.pitch, creatorSettings: job.creator.settings });
    // Store the MP3 on disk and publish a small URL — keeping megabytes of
    // base64 in the DB payload bloats SQLite quickly on busy streams.
    let audioUrl: string;
    try {
      audioUrl = await this.storeTtsAudio(ttsJobId, audio.audioContent);
    } catch (error) {
      console.warn(`[queues] Failed to write TTS audio file, falling back to data URI:`, error);
      audioUrl = `data:audio/mpeg;base64,${audio.audioContent}`;
    }
    const payload = {
      type: "tts.audio",
      ttsJobId,
      text,
      provider: "google-cloud",
      audioUrl,
      mimeType: "audio/mpeg",
      voice: audio.voiceName,
      speed: job.speed,
      pitch: job.pitch,
      volume: job.volume
    };

    await this.redis.publish(
      "ezstream:realtime",
      JSON.stringify({
        room: `widget:${job.widget.id}`,
        event: "tts.speak",
        payload: { ...payload, widgetId: job.widgetId }
      })
    );
    await this.redis.publish(
      "ezstream:realtime",
      JSON.stringify({
        room: `widget:${job.widget.id}`,
        event: "tts.completed",
        payload: { ttsJobId, widgetId: job.widgetId, text }
      })
    );
    if (job.widget.overlay) {
      await this.redis.publish(
        "ezstream:realtime",
        JSON.stringify({
          room: `overlay-token:${job.widget.overlay.token}`,
          event: "tts.speak",
          payload: { ...payload, widgetId: job.widgetId }
        })
      );
      await this.redis.publish(
        "ezstream:realtime",
        JSON.stringify({
          room: `overlay-token:${job.widget.overlay.token}`,
          event: "tts.completed",
          payload: { ttsJobId, widgetId: job.widgetId, text }
        })
      );
    }

    await this.prisma.ttsJob.update({
      where: { id: ttsJobId },
      data: {
        status: TtsJobStatus.COMPLETED,
        text,
        payload: payload as Prisma.InputJsonValue,
        completedAt: new Date()
      }
    });
  }

  // ─── Helper Methods ────────────────────────────────────────────────────────

  private sanitizeText(text: string, bannedWords: string[]) {
    const normalized = text.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
    return bannedWords.reduce((value, word) => {
      if (!word) return value;
      return value.replace(new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "***");
    }, normalized);
  }

  private creatorBannedWords(settings: unknown) {
    if (settings && typeof settings === "object" && Array.isArray((settings as { bannedWords?: unknown }).bannedWords)) {
      return (settings as { bannedWords: unknown[] }).bannedWords.filter((word): word is string => typeof word === "string");
    }
    return [];
  }

  private creatorCooldownMs(settings: unknown) {
    if (settings && typeof settings === "object") {
      const value = (settings as { ttsCooldownMs?: unknown }).ttsCooldownMs;
      return typeof value === "number" && Number.isFinite(value) ? value : 0;
    }
    return 0;
  }

  private base64Url(value: string) {
    return Buffer.from(value).toString("base64url");
  }

  private async googleServiceAccount(creatorSettings?: unknown) {
    // Priority 1: Creator settings from database (set via Settings page)
    let raw: string | undefined;
    if (creatorSettings && typeof creatorSettings === "object") {
      const dbJson = (creatorSettings as Record<string, unknown>).googleTtsServiceAccountJson;
      if (typeof dbJson === "string" && dbJson.trim()) {
        raw = dbJson;
      }
    }
    // Priority 2: Environment variables
    if (!raw) {
      raw = this.config.get<string>("GOOGLE_TTS_SERVICE_ACCOUNT_JSON") ?? (this.config.get<string>("GOOGLE_APPLICATION_CREDENTIALS") ? await readFile(resolve(this.config.get<string>("GOOGLE_APPLICATION_CREDENTIALS")!), "utf8") : undefined);
    }
    if (!raw) {
      throw new Error("Google Cloud TTS credentials are missing. กรุณาตั้งค่าที่หน้า Settings หรือ set GOOGLE_APPLICATION_CREDENTIALS ใน .env");
    }
    const parsed = JSON.parse(raw) as { client_email?: string; private_key?: string };
    if (!parsed.client_email || !parsed.private_key) {
      throw new Error("Google Cloud TTS service account must include client_email and private_key.");
    }
    return { clientEmail: parsed.client_email, privateKey: parsed.private_key };
  }

  private async googleAuthToken(creatorSettings?: unknown) {
    const staticToken = this.config.get<string>("GOOGLE_TTS_ACCESS_TOKEN");
    if (staticToken) return staticToken;
    // When using DB credentials, don't cache tokens (different creators may have different credentials)
    if (!creatorSettings && this.googleAccessToken && this.googleAccessToken.expiresAt > Date.now() + 60_000) return this.googleAccessToken.token;

    const serviceAccount = await this.googleServiceAccount(creatorSettings);
    const now = Math.floor(Date.now() / 1000);
    const unsignedJwt = `${this.base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${this.base64Url(
      JSON.stringify({
        iss: serviceAccount.clientEmail,
        scope: "https://www.googleapis.com/auth/cloud-platform",
        aud: "https://oauth2.googleapis.com/token",
        iat: now,
        exp: now + 3600
      })
    )}`;
    const signature = createSign("RSA-SHA256").update(unsignedJwt).sign(serviceAccount.privateKey, "base64url");
    const assertion = `${unsignedJwt}.${signature}`;

    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion })
    });
    const body = (await response.json()) as { access_token?: string; expires_in?: number; error_description?: string; error?: string };
    if (!response.ok || !body.access_token) {
      throw new Error(body.error_description ?? body.error ?? `Google auth failed: ${response.status}`);
    }
    this.googleAccessToken = { token: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 };
    return body.access_token;
  }

  private googleVoiceName(voice: string) {
    return voice === "default" || voice === "female" ? this.googleTtsVoice : resolveGoogleTtsVoiceName(voice, this.googleTtsVoice);
  }

  private async synthesizeGoogleTts(job: { text: string; voice: string; speed: number; pitch: number; creatorSettings?: unknown }) {
    const token = await this.googleAuthToken(job.creatorSettings);
    const voiceName = this.googleVoiceName(job.voice);
    const languageCode = googleTtsVoiceLanguageCode(voiceName);
    const response = await fetch(this.googleTtsEndpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json; charset=utf-8"
      },
      body: JSON.stringify({
        input: { text: job.text },
        voice: { languageCode, name: voiceName },
        audioConfig: {
          audioEncoding: "MP3",
          speakingRate: job.speed,
          pitch: (job.pitch - 1) * 10
        }
      })
    });
    const body = (await response.json()) as { audioContent?: string; error?: { message?: string } };
    if (!response.ok || !body.audioContent) {
      throw new Error(body.error?.message ?? `Google Cloud TTS failed: ${response.status}`);
    }

    return {
      audioContent: body.audioContent,
      voiceName
    };
  }

  private async storeTtsAudio(ttsJobId: string, base64Audio: string): Promise<string> {
    const storageRoot = resolve(this.config.get<string>("LOCAL_STORAGE_ROOT", "./storage"));
    const dir = join(storageRoot, "tts");
    await mkdir(dir, { recursive: true });
    const fileName = `${ttsJobId}.mp3`;
    await writeFile(join(dir, fileName), Buffer.from(base64Audio, "base64"));
    return `/storage/tts/${fileName}`;
  }
}
