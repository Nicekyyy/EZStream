import { defaultGoogleTtsVoiceName, googleTtsVoiceLanguageCode, resolveGoogleTtsVoiceName, sanitizeTtsText, CHAT_COMMANDS_CHANNEL, REALTIME_CHANNEL } from "@ezstream/shared";
import type { UnifiedChatMessage } from "@ezstream/shared";
import { Prisma, PrismaClient, TtsJobStatus, WidgetActionStatus, type Rule } from "@prisma/client";
import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import { createSign } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:56379";
const concurrency = Number(process.env.WORKER_CONCURRENCY ?? 5);
const storageRoot = resolve(process.env.LOCAL_STORAGE_ROOT ?? "./storage");
const apiPublicUrl = (process.env.API_PUBLIC_URL ?? `http://localhost:${process.env.API_PORT ?? 4000}`).replace(/\/$/, "");
const googleTtsVoice = resolveGoogleTtsVoiceName(process.env.GOOGLE_TTS_VOICE, defaultGoogleTtsVoiceName);
const googleTtsEndpoint = "https://texttospeech.googleapis.com/v1/text:synthesize";
const prisma = new PrismaClient();
const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
const ttsJobsQueue = new Queue("tts-jobs", { connection });
const widgetActionsQueue = new Queue("widget-actions", { connection });
const lastTtsByCreator = new Map<string, number>();
let googleAccessToken: { token: string; expiresAt: number } | undefined;

function sanitizeText(text: string, bannedWords: string[]) {
  const normalized = text.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return bannedWords.reduce((value, word) => {
    if (!word) return value;
    return value.replace(new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "***");
  }, normalized);
}

function creatorBannedWords(settings: unknown) {
  if (settings && typeof settings === "object" && Array.isArray((settings as { bannedWords?: unknown }).bannedWords)) {
    return (settings as { bannedWords: unknown[] }).bannedWords.filter((word): word is string => typeof word === "string");
  }
  return [];
}

function creatorCooldownMs(settings: unknown) {
  if (settings && typeof settings === "object") {
    const value = (settings as { ttsCooldownMs?: unknown }).ttsCooldownMs;
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
  }
  return 0;
}

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

function base64Url(value: string) {
  return Buffer.from(value).toString("base64url");
}

async function googleServiceAccount() {
  const raw = process.env.GOOGLE_TTS_SERVICE_ACCOUNT_JSON ?? (process.env.GOOGLE_APPLICATION_CREDENTIALS ? await readFile(process.env.GOOGLE_APPLICATION_CREDENTIALS, "utf8") : undefined);
  if (!raw) {
    throw new Error("Google Cloud TTS credentials are missing. Set GOOGLE_TTS_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS.");
  }
  const parsed = JSON.parse(raw) as { client_email?: string; private_key?: string };
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error("Google Cloud TTS service account must include client_email and private_key.");
  }
  return { clientEmail: parsed.client_email, privateKey: parsed.private_key };
}

async function googleAuthToken() {
  const staticToken = process.env.GOOGLE_TTS_ACCESS_TOKEN;
  if (staticToken) return staticToken;
  if (googleAccessToken && googleAccessToken.expiresAt > Date.now() + 60_000) return googleAccessToken.token;

  const serviceAccount = await googleServiceAccount();
  const now = Math.floor(Date.now() / 1000);
  const unsignedJwt = `${base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${base64Url(
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
  googleAccessToken = { token: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 };
  return body.access_token;
}

function googleVoiceName(voice: string) {
  return voice === "default" || voice === "female" ? googleTtsVoice : resolveGoogleTtsVoiceName(voice, googleTtsVoice);
}

async function synthesizeGoogleTts(job: { id: string; text: string; voice: string; speed: number; pitch: number }) {
  const token = await googleAuthToken();
  const voiceName = googleVoiceName(job.voice);
  const languageCode = googleTtsVoiceLanguageCode(voiceName);
  const response = await fetch(googleTtsEndpoint, {
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
import { defaultGoogleTtsVoiceName, googleTtsVoiceLanguageCode, resolveGoogleTtsVoiceName, sanitizeTtsText, CHAT_COMMANDS_CHANNEL, REALTIME_CHANNEL } from "@ezstream/shared";
import type { UnifiedChatMessage } from "@ezstream/shared";
import { Prisma, PrismaClient, TtsJobStatus, WidgetActionStatus, type Rule } from "@prisma/client";
import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import { createSign } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:56379";
const concurrency = Number(process.env.WORKER_CONCURRENCY ?? 5);
const storageRoot = resolve(process.env.LOCAL_STORAGE_ROOT ?? "./storage");
const apiPublicUrl = (process.env.API_PUBLIC_URL ?? `http://localhost:${process.env.API_PORT ?? 4000}`).replace(/\/$/, "");
const googleTtsVoice = resolveGoogleTtsVoiceName(process.env.GOOGLE_TTS_VOICE, defaultGoogleTtsVoiceName);
const googleTtsEndpoint = "https://texttospeech.googleapis.com/v1/text:synthesize";
const prisma = new PrismaClient();
const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
const ttsJobsQueue = new Queue("tts-jobs", { connection });
const widgetActionsQueue = new Queue("widget-actions", { connection });
const lastTtsByCreator = new Map<string, number>();
let googleAccessToken: { token: string; expiresAt: number } | undefined;

function sanitizeText(text: string, bannedWords: string[]) {
  const normalized = text.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return bannedWords.reduce((value, word) => {
    if (!word) return value;
    return value.replace(new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "***");
  }, normalized);
}

function creatorBannedWords(settings: unknown) {
  if (settings && typeof settings === "object" && Array.isArray((settings as { bannedWords?: unknown }).bannedWords)) {
    return (settings as { bannedWords: unknown[] }).bannedWords.filter((word): word is string => typeof word === "string");
  }
  return [];
}

function creatorCooldownMs(settings: unknown) {
  if (settings && typeof settings === "object") {
    const value = (settings as { ttsCooldownMs?: unknown }).ttsCooldownMs;
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
  }
  return 0;
}

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

function base64Url(value: string) {
  return Buffer.from(value).toString("base64url");
}

async function googleServiceAccount() {
  const raw = process.env.GOOGLE_TTS_SERVICE_ACCOUNT_JSON ?? (process.env.GOOGLE_APPLICATION_CREDENTIALS ? await readFile(process.env.GOOGLE_APPLICATION_CREDENTIALS, "utf8") : undefined);
  if (!raw) {
    throw new Error("Google Cloud TTS credentials are missing. Set GOOGLE_TTS_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS.");
  }
  const parsed = JSON.parse(raw) as { client_email?: string; private_key?: string };
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error("Google Cloud TTS service account must include client_email and private_key.");
  }
  return { clientEmail: parsed.client_email, privateKey: parsed.private_key };
}

async function googleAuthToken() {
  const staticToken = process.env.GOOGLE_TTS_ACCESS_TOKEN;
  if (staticToken) return staticToken;
  if (googleAccessToken && googleAccessToken.expiresAt > Date.now() + 60_000) return googleAccessToken.token;

  const serviceAccount = await googleServiceAccount();
  const now = Math.floor(Date.now() / 1000);
  const unsignedJwt = `${base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${base64Url(
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
  googleAccessToken = { token: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 };
  return body.access_token;
}

function googleVoiceName(voice: string) {
  return voice === "default" || voice === "female" ? googleTtsVoice : resolveGoogleTtsVoiceName(voice, googleTtsVoice);
}

async function synthesizeGoogleTts(job: { id: string; text: string; voice: string; speed: number; pitch: number }) {
  const token = await googleAuthToken();
  const voiceName = googleVoiceName(job.voice);
  const languageCode = googleTtsVoiceLanguageCode(voiceName);
  const response = await fetch(googleTtsEndpoint, {
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

  // We skip writing to disk since we return the Base64 data directly to the client via WebSockets.

  return {
    audioUrl: `data:audio/mpeg;base64,${body.audioContent}`,
    voiceName
  };
}

async function processWidgetAction(widgetActionId: string) {
  const action = await prisma.widgetAction.update({
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
    nextState = { ...nextState, playing: true, lastAction: payload, lastTriggeredAt: new Date().toISOString() };
  } else if (action.actionType === "UPDATE_TEXT") {
    nextState = { ...nextState, text: payload.renderedText ?? payload.text ?? "" };
  } else {
    nextState = { ...nextState, visible: true, lastAction: payload, lastTriggeredAt: new Date().toISOString() };
  }

  await prisma.widgetState.upsert({
    where: { widgetId: action.widgetId },
    update: { state: nextState as Prisma.InputJsonValue, version: { increment: 1 } },
    create: { widgetId: action.widgetId, state: nextState as Prisma.InputJsonValue }
  });

  const completed = await prisma.widgetAction.update({
    where: { id: widgetActionId },
    data: { status: WidgetActionStatus.COMPLETED, completedAt: new Date() },
    include: { widget: { include: { overlay: true } } }
  });

  const eventName = action.actionType === "UPDATE_GOAL" ? "goal.updated" : action.actionType === "APPEND_EVENT_LIST" ? "event.list.appended" : "widget.completed";
  const eventPayload = { widgetActionId, widgetId: action.widgetId, actionType: action.actionType, state: nextState };
  await connection.publish(
    "ezstream:realtime",
    JSON.stringify({
      room: `widget:${completed.widget.id}`,
      event: eventName,
      payload: eventPayload
    })
  );
  if (completed.widget.overlay) {
    await connection.publish(
      "ezstream:realtime",
      JSON.stringify({
        room: `overlay-token:${completed.widget.overlay.token}`,
        event: eventName,
        payload: eventPayload
      })
    );
  }

  return completed;
}

async function processTtsJob(ttsJobId: string) {
  const job = await prisma.ttsJob.update({
    where: { id: ttsJobId },
    data: { status: TtsJobStatus.PROCESSING },
    include: { creator: true, widget: { include: { overlay: true } } }
  });

  const bannedWords = creatorBannedWords(job.creator.settings);
  const cooldownMs = creatorCooldownMs(job.creator.settings);
  const lastRunAt = lastTtsByCreator.get(job.creatorId) ?? 0;
  const waitMs = Math.max(0, cooldownMs - (Date.now() - lastRunAt));
  if (waitMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  const text = sanitizeText(sanitizeTtsText(job.text), bannedWords);
  lastTtsByCreator.set(job.creatorId, Date.now());
  if (!text) {
    return prisma.ttsJob.update({
      where: { id: ttsJobId },
      data: {
        status: TtsJobStatus.FAILED,
        text,
        errorMessage: "TTS text has no readable content"
      }
    });
  }

  if (!job.widget || !job.widget.isEnabled || (job.widget.overlay && !job.widget.overlay.isActive)) {
    return prisma.ttsJob.update({
      where: { id: ttsJobId },
      data: {
        status: TtsJobStatus.FAILED,
        text,
        errorMessage: "TTS widget is not available"
      }
    });
  }

  const audio = await synthesizeGoogleTts({ id: ttsJobId, text, voice: job.voice, speed: job.speed, pitch: job.pitch });
  const payload = {
    type: "tts.audio",
    ttsJobId,
    text,
    provider: "google-cloud",
    audioUrl: audio.audioUrl,
    mimeType: "audio/mpeg",
    voice: audio.voiceName,
    speed: job.speed,
    pitch: job.pitch,
    volume: job.volume
  };

  await connection.publish(
    "ezstream:realtime",
    JSON.stringify({
      room: `widget:${job.widget.id}`,
      event: "tts.speak",
      payload: { ...payload, widgetId: job.widgetId }
    })
  );
  await connection.publish(
    "ezstream:realtime",
    JSON.stringify({
      room: `widget:${job.widget.id}`,
      event: "tts.completed",
      payload: { ttsJobId, widgetId: job.widgetId, text }
    })
  );
  if (job.widget.overlay) {
    await connection.publish(
      "ezstream:realtime",
      JSON.stringify({
        room: `overlay-token:${job.widget.overlay.token}`,
        event: "tts.speak",
        payload: { ...payload, widgetId: job.widgetId }
      })
    );
    await connection.publish(
      "ezstream:realtime",
      JSON.stringify({
        room: `overlay-token:${job.widget.overlay.token}`,
        event: "tts.completed",
        payload: { ttsJobId, widgetId: job.widgetId, text }
      })
    );
  }

  const completed = await prisma.ttsJob.update({
    where: { id: ttsJobId },
    data: {
      status: TtsJobStatus.COMPLETED,
      text,
      payload,
      completedAt: new Date()
    }
  });

  return completed;
}

// ─── Chat Connector Manager ──────────────────────────────────────────────────

function ruleMatches(rule: Rule, payload: Record<string, unknown>) {
  const conditions = jsonArray<Condition>(rule.conditions);
  return conditions.every((condition) => matchesCondition(payload, condition));
}

async function publishWidget(widgetId: string, event: string, payload: unknown) {
  const widget = await prisma.widget.findUnique({ where: { id: widgetId }, include: { overlay: true } });
  if (!widget) return;
  await connection.publish(
    REALTIME_CHANNEL,
    JSON.stringify({
      room: `widget:${widget.id}`,
      event,
      payload
    })
  );
  if (!widget.overlay) return;
  await connection.publish(
    REALTIME_CHANNEL,
    JSON.stringify({
      room: `overlay-token:${widget.overlay.token}`,
      event,
      payload
    })
  );
}

async function createTtsJobFromRule(creatorId: string, eventLogId: string, ruleId: string | undefined, action: RuleAction, payload: Record<string, unknown>) {
  const text = sanitizeTtsText(renderTemplate(action.textTemplate ?? "{username} said {message}", payload));
  if (!text) return;
  const widget = action.widgetId
    ? await prisma.widget.findFirst({ where: { id: action.widgetId, creatorId }, select: { config: true } })
    : null;
  const widgetConfig = jsonObject(widget?.config);
  const voice = resolveGoogleTtsVoiceName(action.voice ?? widgetConfig.voice, googleTtsVoice);
  const speed = typeof widgetConfig.speed === "number" ? widgetConfig.speed : 1;
  const pitch = typeof widgetConfig.pitch === "number" ? widgetConfig.pitch : 1;
  const volume = typeof widgetConfig.volume === "number" ? widgetConfig.volume : 1;
  const job = await prisma.ttsJob.create({
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
      } as Prisma.InputJsonValue
    }
  });

  await ttsJobsQueue.add("tts.speak", { ttsJobId: job.id });
  if (action.widgetId) {
    await publishWidget(action.widgetId, "tts.queued", { ttsJobId: job.id, widgetId: action.widgetId, text });
  }
}

function hasSpeakTtsAction(rule: Rule) {
  return jsonArray<RuleAction>(rule.actions).some((action) => action.type === "SPEAK_TTS");
}

async function createDefaultChatTtsJob(creatorId: string, overlayId: string, eventLogId: string, payload: Record<string, unknown>) {
  const widget = await prisma.widget.findFirst({
    where: {
      creatorId,
      type: "TTS_WIDGET",
      isEnabled: true
    },
    orderBy: [{ overlayId: "asc" }, { createdAt: "asc" }],
    select: { id: true, config: true }
  });
  const sameOverlayWidget = await prisma.widget.findFirst({
    where: {
      creatorId,
      overlayId,
      type: "TTS_WIDGET",
      isEnabled: true
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, config: true }
  });
  const targetWidget = sameOverlayWidget ?? widget;
  if (!targetWidget) return;
  const widgetConfig = jsonObject(targetWidget.config);
  const textTemplate = widgetConfig.includeSenderName === false ? "{message}" : "{displayName}: {message}";

  await createTtsJobFromRule(
    creatorId,
    eventLogId,
    undefined,
    { type: "SPEAK_TTS", widgetId: targetWidget.id, textTemplate },
    payload
  );
}

async function applyChatRule(creatorId: string, eventLogId: string, rule: Rule, payload: Record<string, unknown>) {
  const actions = jsonArray<RuleAction>(rule.actions);

  for (const action of actions) {
    if (action.type === "SPEAK_TTS") {
      await createTtsJobFromRule(creatorId, eventLogId, rule.id, action, payload);
      continue;
    }

    if (!action.widgetId) continue;

    const widgetAction = await prisma.widgetAction.create({
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

    await widgetActionsQueue.add("widget.action", { widgetActionId: widgetAction.id });
    await publishWidget(action.widgetId, "widget.triggered", {
      widgetActionId: widgetAction.id,
      actionType: action.type,
      payload: widgetAction.payload
    });
  }
}

async function triggerChatRules(chatSourceId: string, message: UnifiedChatMessage) {
  const source = await prisma.chatSource.findUnique({
    where: { id: chatSourceId },
    include: { overlay: true }
  });
  if (!source || !source.isEnabled || !source.overlay.isActive) return;

  const payload = {
    id: message.id,
    platform: message.platform,
    username: message.username,
    displayName: message.displayName,
    message: message.message,
    avatarUrl: message.avatarUrl,
    badges: message.badges ?? [],
    timestamp: message.timestamp,
    chatSourceId,
    overlayId: source.overlayId,
    overlayToken: source.overlay.token
  };

  const eventLog = await prisma.eventLog.create({
    data: {
      creatorId: source.creatorId,
      eventType: "live.chat.message",
      payload: payload as Prisma.InputJsonValue,
      status: "RECEIVED"
    }
  });

  await connection.publish(
    REALTIME_CHANNEL,
    JSON.stringify({
      room: `creator:${source.creatorId}`,
      event: "event.received",
      payload: { eventLogId: eventLog.id, eventType: "live.chat.message", payload }
    })
  );

  const rules = await prisma.rule.findMany({
    where: {
      creatorId: source.creatorId,
      eventType: "live.chat.message",
      isEnabled: true,
      OR: [{ overlayId: null }, { overlayId: source.overlayId }]
    },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }]
  });

  const matchedRules = rules.filter((rule) => ruleMatches(rule, payload));
  for (const rule of matchedRules) {
    await applyChatRule(source.creatorId, eventLog.id, rule, payload);
  }
  if (!matchedRules.some(hasSpeakTtsAction)) {
    await createDefaultChatTtsJob(source.creatorId, source.overlayId, eventLog.id, payload);
  }

  await prisma.eventLog.update({
    where: { id: eventLog.id },
    data: {
      status: matchedRules.length > 0 ? "MATCHED" : "PROCESSED",
      matchedRuleIds: matchedRules.map((rule) => rule.id)
    }
  });
}

type ChatConnection = { connectionId: string; disconnect: () => void | Promise<void> };
const activeChats = new Map<string, ChatConnection>();
let youtubeParserErrorHandlerInstalled = false;

function isActiveChatConnection(chatSourceId: string, connectionId: string) {
  return activeChats.get(chatSourceId)?.connectionId === connectionId;
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function installYouTubeParserErrorHandler(Parser: { setParserErrorHandler: (handler: (error: any) => void) => void }) {
  if (youtubeParserErrorHandlerInstalled) return;
  youtubeParserErrorHandlerInstalled = true;

  Parser.setParserErrorHandler((error: any) => {
    if (error?.error_type === "typecheck" && error?.classname === "HypeFanCreditsSectionView") return;

    const errorType = typeof error?.error_type === "string" ? error.error_type : "unknown";
    const classname = typeof error?.classname === "string" ? error.classname : "unknown";
    const cause = error?.error instanceof Error ? `: ${error.error.message}` : "";
    console.warn(`[chat] YouTube parser warning (${errorType}/${classname})${cause}`);
  });
}

function normalizeAvatarUrl(url: unknown) {
  if (typeof url !== "string" || !url.trim()) return undefined;
  const trimmed = url.trim();
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  return undefined;
}

function firstImageUrl(image: unknown) {
  if (!image || typeof image !== "object") return undefined;
  const value = image as { url?: unknown; urls?: unknown; mUrls?: unknown; urlList?: unknown; imageUrl?: unknown; thumbnails?: unknown };
  // Check thumbnails array first (YouTube emoji format: { thumbnails: [{url, width, height}] })
  if (Array.isArray(value.thumbnails)) {
    const sorted = [...value.thumbnails].sort((a: any, b: any) => Number(b?.width ?? 0) - Number(a?.width ?? 0));
    const url = normalizeAvatarUrl(sorted[0]?.url);
    if (url) return url;
  }
  const candidates = [value.imageUrl, value.url, value.urls, value.mUrls, value.urlList];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      const url = candidate.map(normalizeAvatarUrl).find(Boolean);
      if (url) return url;
    } else {
      const url = normalizeAvatarUrl(candidate);
      if (url) return url;
    }
  }
  return undefined;
}

function resolveTikTokAvatarUrl(user: unknown) {
  if (!user || typeof user !== "object") return undefined;
  const value = user as {
    profilePictureUrl?: unknown;
    profilePicture?: unknown;
    profilePictureMedium?: unknown;
    profilePictureLarge?: unknown;
    avatarThumb?: unknown;
  };

  return (
    normalizeAvatarUrl(value.profilePictureUrl) ??
    firstImageUrl(value.profilePictureMedium) ??
    firstImageUrl(value.profilePicture) ??
    firstImageUrl(value.profilePictureLarge) ??
    firstImageUrl(value.avatarThumb)
  );
}

async function updateChatSourceStatus(id: string, status: string, overlayToken: string, errorMessage: string | null = null) {
  await prisma.chatSource.update({
    where: { id },
    data: { status: status as any, errorMessage, ...(status === "CONNECTED" ? { lastConnectedAt: new Date() } : {}) }
  }).catch(() => undefined);

  await connection.publish(
    REALTIME_CHANNEL,
    JSON.stringify({
      room: `overlay-token:${overlayToken}`,
      event: "chat-source.status",
      payload: { id, status, errorMessage }
    })
  );
}

async function publishChatMessage(chatSourceId: string, overlayToken: string, message: UnifiedChatMessage) {
  await connection.publish(
    REALTIME_CHANNEL,
    JSON.stringify({ room: `overlay-token:${overlayToken}`, event: "chat.message", payload: message })
  );
  await triggerChatRules(chatSourceId, message).catch((error) => {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[chat] Rule trigger error: ${msg}`);
  });
}

function youtubeMessageText(message: any) {
  if (typeof message === "string") return message;
  if (Array.isArray(message?.runs)) {
    return message.runs
      .map((run: any) => {
        // YouTube emoji structure: run.emoji.image.thumbnails = [{url, width, height}, ...]
        const emojiImage = run?.emoji?.image;
        const thumbnails = Array.isArray(emojiImage?.thumbnails) ? emojiImage.thumbnails : [];
        // Also handle the case where image itself is the array (legacy fallback)
        const images = thumbnails.length > 0 ? thumbnails : (Array.isArray(emojiImage) ? emojiImage : []);
        const bestImage = [...images].sort((a: any, b: any) => Number(b?.width ?? 0) - Number(a?.width ?? 0))[0];
        const emojiUrl = bestImage?.url ?? bestImage?.url_private ?? bestImage?.urlPrivate;
        // Also try direct url from the image object as fallback
        const resolvedUrl = emojiUrl ?? normalizeAvatarUrl(emojiImage?.url) ?? firstImageUrl(emojiImage);
        return resolvedUrl ? ` ${String(resolvedUrl)} ` : String(run?.text ?? "");
      })
      .join("")
      .replace(/\s+/g, " ")
      .trim();
  }
  return message?.text ? String(message.text) : message?.toString?.() ?? "";
}

function tiktokEmoteUrl(emote: any) {
  // TikTok emote image can be in various formats:
  // emote.image.urlList, emote.image.imageUrl, emote.emote.image.urlList, etc.
  const urlListUrl = (list: unknown) => {
    if (!Array.isArray(list)) return undefined;
    return list.map(normalizeAvatarUrl).find(Boolean);
  };
  return (
    normalizeAvatarUrl(emote?.image?.imageUrl) ??
    urlListUrl(emote?.image?.urlList) ??
    firstImageUrl(emote?.image) ??
    normalizeAvatarUrl(emote?.emote?.image?.imageUrl) ??
    urlListUrl(emote?.emote?.image?.urlList) ??
    firstImageUrl(emote?.emote?.image)
  );
}

function tiktokMessageText(data: any) {
  let message = typeof data?.comment === "string" ? data.comment : "";
  const emotes = Array.isArray(data?.emotes) ? data.emotes : [];
  for (const item of [...emotes].sort((a, b) => Number(b?.placeInComment ?? 0) - Number(a?.placeInComment ?? 0))) {
    const url = tiktokEmoteUrl(item);
    if (!url) continue;
    const index = Math.max(0, Math.min(message.length, Number(item?.placeInComment ?? message.length)));
    message = `${message.slice(0, index)} ${url} ${message.slice(index)}`.replace(/\s+/g, " ").trim();
  }
  return message;
}

async function connectTikTok(chatSourceId: string, target: string, overlayToken: string) {
  const requestId = Math.random().toString(36).slice(2);
  let lastError: unknown = null;
  activeChats.set(chatSourceId, { connectionId: requestId, disconnect: () => undefined });
  try {
    const { TikTokLiveConnection, WebcastEvent, ControlEvent } = await import("tiktok-live-connector");
    if (!isActiveChatConnection(chatSourceId, requestId)) return;
    const username = target.replace(/^@/, "");

    for (const attempt of [
      { connectionId: `${requestId}:room`, connectWithUniqueId: false },
      { connectionId: `${requestId}:unique`, connectWithUniqueId: true }
    ]) {
      if (!activeChats.has(chatSourceId)) return;

      const tiktok = new TikTokLiveConnection(username, {
        processInitialData: false,
        fetchRoomInfoOnConnect: false,
        enableExtendedGiftInfo: false,
        connectWithUniqueId: attempt.connectWithUniqueId,
        wsClientHeaders: {
          Origin: "https://www.tiktok.com"
        }
      });

      activeChats.set(chatSourceId, {
        connectionId: attempt.connectionId,
        disconnect: async () => {
          await Promise.resolve(tiktok.disconnect()).catch(() => undefined);
          await wait(1500);
        }
      });

      tiktok.on(WebcastEvent.CHAT, (data: { msgId?: string; user?: { uniqueId?: string; nickname?: string; profilePictureUrl?: string }; comment?: string; emotes?: unknown[] }) => {
        if (!isActiveChatConnection(chatSourceId, attempt.connectionId)) return;
        const msgText = tiktokMessageText(data);
        if (!msgText) return;
        const message: UnifiedChatMessage = {
          id: `tiktok-${data.msgId || `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`}`,
          platform: "tiktok",
          username: data.user?.uniqueId ?? "unknown",
          displayName: data.user?.nickname ?? data.user?.uniqueId ?? "unknown",
          message: msgText,
          avatarUrl: resolveTikTokAvatarUrl(data.user),
          badges: [],
          timestamp: Date.now()
        };
        void publishChatMessage(chatSourceId, overlayToken, message);
      });

      tiktok.on(WebcastEvent.EMOTE, (data: { common?: { msgId?: string }; user?: { uniqueId?: string; nickname?: string; profilePictureUrl?: string }; emoteList?: unknown[] }) => {
        if (!isActiveChatConnection(chatSourceId, attempt.connectionId)) return;
        const msgText = (Array.isArray(data.emoteList) ? data.emoteList : []).map(tiktokEmoteUrl).filter(Boolean).join(" ");
        if (!msgText) return;
        const message: UnifiedChatMessage = {
          id: `tiktok-emote-${data.common?.msgId || `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`}`,
          platform: "tiktok",
          username: data.user?.uniqueId ?? "unknown",
          displayName: data.user?.nickname ?? data.user?.uniqueId ?? "unknown",
          message: msgText,
          avatarUrl: resolveTikTokAvatarUrl(data.user),
          badges: [],
          timestamp: Date.now()
        };
        void publishChatMessage(chatSourceId, overlayToken, message);
      });

      tiktok.on(ControlEvent.DISCONNECTED, () => {
        if (!isActiveChatConnection(chatSourceId, attempt.connectionId)) return;
        console.log(`[chat] TikTok disconnected: @${username}`);
        activeChats.delete(chatSourceId);
        void updateChatSourceStatus(chatSourceId, "DISCONNECTED", overlayToken);
      });

      try {
        await tiktok.connect();
        if (!isActiveChatConnection(chatSourceId, attempt.connectionId)) {
          await Promise.resolve(tiktok.disconnect()).catch(() => undefined);
          return;
        }
        console.log(`[chat] TikTok connected: @${username} (${attempt.connectionId})`);

        await updateChatSourceStatus(chatSourceId, "CONNECTED", overlayToken);
        return;
      } catch (error) {
        lastError = error;
        const msg = error instanceof Error ? error.message : String(error);
        if (!isActiveChatConnection(chatSourceId, attempt.connectionId)) return;
        if (!attempt.connectWithUniqueId && msg.includes("Unexpected server response: 200")) {
          activeChats.set(chatSourceId, { connectionId: `${requestId}:retry`, disconnect: () => undefined });
          await Promise.resolve(tiktok.disconnect()).catch(() => undefined);
          await wait(1500);
          continue;
        }
        break;
      }
    }
  } catch (error) {
    lastError = error;
  }

  if (!activeChats.has(chatSourceId)) return;
  const msg = lastError instanceof Error ? lastError.message : String(lastError ?? "Unknown TikTok connection error");
  console.error(`[chat] TikTok connect error: ${msg}`);
  activeChats.delete(chatSourceId);
  await updateChatSourceStatus(chatSourceId, "ERROR", overlayToken, msg);
}

async function connectYouTube(chatSourceId: string, target: string, overlayToken: string) {
  try {
    const connectionId = Math.random().toString(36).slice(2);
    const { Innertube, Parser } = await import("youtubei.js");
    installYouTubeParserErrorHandler(Parser);
    const yt = await Innertube.create();

    let liveVideoId: string | null = null;
    const normalizedTarget = target.trim();

    async function resolveChannelId(input: string) {
      const channelHandle = input.replace(/^@/, "").replace(/https?:\/\/(www\.)?youtube\.com\/(@)?/i, "").split("/")[0].split("?")[0];
      if (channelHandle.startsWith("UC")) return channelHandle;

      const resolved = await yt.resolveURL(`https://www.youtube.com/@${channelHandle}`).catch(() => null);
      if (resolved?.payload?.browseId) return String(resolved.payload.browseId);

      const search = await yt.search(input, { type: "channel" }).catch(() => null);
      const channelResult = (search?.results as any[] | undefined)?.find((item) => item?.type === "Channel" && item?.id);
      return channelResult?.id ? String(channelResult.id) : null;
    }

    async function findLiveVideoIdForChannel(channelId: string) {
      const channelPage = await yt.getChannel(channelId);
      const liveTab = await channelPage.getLiveStreams().catch(() => null);
      const videos = liveTab?.videos || [];

      const liveVideo = (videos as any[]).find((video) => video?.is_live);
      if (liveVideo?.id) return String(liveVideo.id);
      if (videos.length > 0 && (videos[0] as any)?.id) return String((videos[0] as any).id);
      return null;
    }

    async function findLiveVideoIdBySearch(query: string) {
      const search = await yt.search(query, { type: "video", features: ["live"] }).catch(() => null);
      const liveVideo = (search?.results as any[] | undefined)?.find((item) => {
        const id = item?.video_id ?? item?.id;
        return id && (item?.is_live || item?.style === "VIDEO_STYLE_TYPE_LIVE_POST");
      });
      const id = liveVideo?.video_id ?? liveVideo?.id;
      return id ? String(id) : null;
    }

    // Check if target is a video URL or video ID
    const videoMatch = normalizedTarget.match(/(?:v=|live\/|youtu\.be\/)([A-Za-z0-9_-]{11})/);
    if (videoMatch) {
      liveVideoId = videoMatch[1];
    } else if (/^[A-Za-z0-9_-]{11}$/.test(normalizedTarget)) {
      liveVideoId = normalizedTarget;
    } else {
      // It's a channel handle or URL
      const channelId = await resolveChannelId(normalizedTarget);
      if (channelId) liveVideoId = await findLiveVideoIdForChannel(channelId);
      if (!liveVideoId) liveVideoId = await findLiveVideoIdBySearch(normalizedTarget);
    }

    if (!liveVideoId) throw new Error(`ไม่พบไลฟ์สตรีมที่กำลังออกอากาศสำหรับ: ${target} (ถ้าไลฟ์อยู่ แนะนำให้ใส่ URL ของไลฟ์โดยตรง)`);

    const videoInfo = await yt.getInfo(liveVideoId);
    let livechat: ReturnType<typeof videoInfo.getLiveChat>;
    try {
      livechat = videoInfo.getLiveChat();
    } catch (error) {
      const isLiveLike = videoInfo.basic_info.is_live || videoInfo.basic_info.is_live_content || videoInfo.basic_info.is_upcoming;
      if (!isLiveLike) throw new Error(`วิดีโอนี้ไม่ได้กำลังไลฟ์อยู่: ${liveVideoId}`);
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`ไม่สามารถเปิด YouTube Live Chat ได้: ${msg}`);
      await prisma.eventLog.update({ where: { id: eventLogId }, data: { status: "PROCESSED" } });
    },
    { connection, concurrency }
  ),
  new Worker(
    "widget-actions",
    async (job) => {
      await processWidgetAction(String(job.data.widgetActionId));
    },
    { connection, concurrency }
  ),
  new Worker(
    "tts-jobs",
    async (job) => {
      await processTtsJob(String(job.data.ttsJobId));
    },
    { connection, concurrency }
  )
];

for (const worker of workers) {
  worker.on("failed", async (job, error) => {
    console.error(`Job failed in ${worker.name}: ${job?.id}`, error);
    const id = job?.data?.widgetActionId as string | undefined;
    const ttsId = job?.data?.ttsJobId as string | undefined;
    if (id) {
      await prisma.widgetAction.update({ where: { id }, data: { status: "FAILED", errorMessage: error.message } }).catch(() => undefined);
    }
    if (ttsId) {
      await prisma.ttsJob.update({ where: { id: ttsId }, data: { status: "FAILED", errorMessage: error.message } }).catch(() => undefined);
    }
  });
}

async function shutdown() {
  for (const [id] of activeChats) await disconnectChat(id);
  await chatCommandSub.quit();
  await Promise.all([ttsJobsQueue.close(), widgetActionsQueue.close()]);
  await Promise.all(workers.map((worker) => worker.close()));
  await connection.quit();
  await prisma.$disconnect();
}

process.on("SIGINT", () => void shutdown().then(() => process.exit(0)));
process.on("SIGTERM", () => void shutdown().then(() => process.exit(0)));

console.log("EZStream worker ready");
console.log(`Redis URL: ${redisUrl}`);
