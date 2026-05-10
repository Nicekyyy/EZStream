import { Prisma, PrismaClient, TtsJobStatus, WidgetActionStatus } from "@prisma/client";
import { Worker } from "bullmq";
import { Redis } from "ioredis";

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:56379";
const concurrency = Number(process.env.WORKER_CONCURRENCY ?? 5);
const prisma = new PrismaClient();
const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
const lastTtsByCreator = new Map<string, number>();

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
    include: { creator: true }
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

  const completed = await prisma.ttsJob.update({
    where: { id: ttsJobId },
    data: {
      status: TtsJobStatus.COMPLETED,
      text,
      payload: {
        type: "tts.speak",
        text,
        voice: job.voice,
        speed: job.speed,
        pitch: job.pitch,
        volume: job.volume
      },
      completedAt: new Date()
    }
  });

  if (completed.widgetId) {
    const widget = await prisma.widget.findUnique({ where: { id: completed.widgetId }, include: { overlay: true } });
    if (widget) {
      await connection.publish(
        "ezstream:realtime",
        JSON.stringify({
          room: `overlay-token:${widget.overlay.token}`,
          event: "tts.speak",
          payload: completed.payload
        })
      );
      await connection.publish(
        "ezstream:realtime",
        JSON.stringify({
          room: `overlay-token:${widget.overlay.token}`,
          event: "tts.completed",
          payload: { ttsJobId, text }
        })
      );
    }
  }

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
