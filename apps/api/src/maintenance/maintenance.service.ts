import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service.js";
import { readdir, stat, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";

@Injectable()
export class MaintenanceService implements OnModuleInit, OnModuleDestroy {
  private readonly intervalMs = 6 * 60 * 60 * 1000;
  private startupTimer: NodeJS.Timeout | null = null;
  private interval: NodeJS.Timeout | null = null;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ConfigService) private readonly config: ConfigService
  ) {}

  onModuleInit() {
    // Delay the first pass so cleanup never competes with startup work.
    this.startupTimer = setTimeout(() => {
      void this.cleanup();
    }, 30_000);
    this.interval = setInterval(() => {
      void this.cleanup();
    }, this.intervalMs);
  }

  onModuleDestroy() {
    if (this.startupTimer) clearTimeout(this.startupTimer);
    if (this.interval) clearInterval(this.interval);
  }

  private retentionDays(): number {
    const value = Number(this.config.get<string>("EVENT_LOG_RETENTION_DAYS"));
    return Number.isFinite(value) && value > 0 ? value : 7;
  }

  async cleanup() {
    const cutoff = new Date(Date.now() - this.retentionDays() * 24 * 60 * 60 * 1000);
    // Audio files are played the moment they're published — a day is plenty.
    const audioCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    try {
      // Children first so EventLog deletes don't have to null out their FKs.
      const widgetActions = await this.prisma.widgetAction.deleteMany({ where: { createdAt: { lt: cutoff } } });
      const ttsJobs = await this.prisma.ttsJob.deleteMany({ where: { createdAt: { lt: cutoff } } });
      const eventLogs = await this.prisma.eventLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
      const audioFiles = await this.pruneTtsAudioFiles(audioCutoff);
      const deletedRows = widgetActions.count + ttsJobs.count + eventLogs.count;
      if (deletedRows || audioFiles) {
        console.log(
          `[maintenance] Pruned data older than ${this.retentionDays()}d: ` +
            `${eventLogs.count} event logs, ${widgetActions.count} widget actions, ${ttsJobs.count} TTS jobs; ` +
            `${audioFiles} audio files older than 1d`
        );
      }
      // SQLite never returns freed pages to the OS on its own — after a large
      // prune, compact the file so the DB doesn't stay permanently bloated.
      if (deletedRows > 500) {
        await this.prisma.$executeRawUnsafe("VACUUM;");
        console.log("[maintenance] Database compacted (VACUUM)");
      }
    } catch (error) {
      console.error("[maintenance] Cleanup failed:", error);
    }
  }

  private async pruneTtsAudioFiles(cutoff: Date): Promise<number> {
    const storageRoot = resolve(this.config.get<string>("LOCAL_STORAGE_ROOT", "./storage"));
    const dir = join(storageRoot, "tts");
    let removed = 0;
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      return 0; // directory doesn't exist yet
    }
    for (const entry of entries) {
      const filePath = join(dir, entry);
      try {
        const info = await stat(filePath);
        if (info.isFile() && info.mtimeMs < cutoff.getTime()) {
          await unlink(filePath);
          removed++;
        }
      } catch {
        // file may have been removed concurrently — skip
      }
    }
    return removed;
  }
}
