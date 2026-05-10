import { Inject, Injectable, OnModuleDestroy } from "@nestjs/common";
import { Queue } from "bullmq";
import type { Redis } from "ioredis";
import { REDIS } from "../redis/redis.module.js";

@Injectable()
export class QueuesService implements OnModuleDestroy {
  readonly liveEvents: Queue;
  readonly widgetActions: Queue;
  readonly ttsJobs: Queue;

  constructor(@Inject(REDIS) private readonly redis: Redis) {
    const defaultJobOptions = {
      attempts: 3,
      backoff: { type: "exponential", delay: 1000 },
      removeOnComplete: 1000,
      removeOnFail: 1000
    };
    this.liveEvents = new Queue("live-events", { connection: this.redis, defaultJobOptions });
    this.widgetActions = new Queue("widget-actions", { connection: this.redis, defaultJobOptions });
    this.ttsJobs = new Queue("tts-jobs", { connection: this.redis, defaultJobOptions });
  }

  async onModuleDestroy() {
    await Promise.all([this.liveEvents.close(), this.widgetActions.close(), this.ttsJobs.close()]);
  }
}
