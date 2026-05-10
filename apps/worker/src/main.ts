import { defaultGoogleTtsVoiceName, googleTtsVoiceLanguageCode, resolveGoogleTtsVoiceName } from "@ezstream/shared";
import { Prisma, PrismaClient, TtsJobStatus, WidgetActionStatus } from "@prisma/client";
import { Worker } from "bullmq";
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

  const ttsDir = join(storageRoot, "tts");
  await mkdir(ttsDir, { recursive: true });
  await writeFile(join(ttsDir, `${job.id}.mp3`), Buffer.from(body.audioContent, "base64"));

  return {
    audioUrl: `${apiPublicUrl}/storage/tts/${job.id}.mp3`,
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
  await connection.publish(
    "ezstream:realtime",
    JSON.stringify({
      room: `overlay-token:${completed.widget.overlay.token}`,
      event: eventName,
      payload: { widgetActionId, widgetId: action.widgetId, actionType: action.actionType, state: nextState }
    })
  );

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

  const text = sanitizeText(job.text, bannedWords);
  lastTtsByCreator.set(job.creatorId, Date.now());

  if (!job.widget || !job.widget.overlay || !job.widget.isEnabled || !job.widget.overlay.isActive) {
    return prisma.ttsJob.update({
      where: { id: ttsJobId },
      data: {
        status: TtsJobStatus.FAILED,
        text,
        errorMessage: "TTS widget or overlay is not available"
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
      room: `overlay-token:${job.widget.overlay.token}`,
      event: "tts.speak",
      payload
    })
  );
  await connection.publish(
    "ezstream:realtime",
    JSON.stringify({
      room: `overlay-token:${job.widget.overlay.token}`,
      event: "tts.completed",
      payload: { ttsJobId, text }
    })
  );

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

const workers = [
  new Worker(
    "live-events",
    async (job) => {
      const eventLogId = String(job.data.eventLogId);
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
  await Promise.all(workers.map((worker) => worker.close()));
  await connection.quit();
  await prisma.$disconnect();
}

process.on("SIGINT", () => void shutdown().then(() => process.exit(0)));
process.on("SIGTERM", () => void shutdown().then(() => process.exit(0)));

console.log("EZStream worker ready");
console.log(`Redis URL: ${redisUrl}`);
