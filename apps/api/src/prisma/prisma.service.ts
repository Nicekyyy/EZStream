import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
    // WAL lets readers proceed while a write is in flight (persists in the db file);
    // busy_timeout makes contending writers wait instead of failing with SQLITE_BUSY.
    try {
      await this.$queryRawUnsafe("PRAGMA journal_mode=WAL;");
      await this.$queryRawUnsafe("PRAGMA busy_timeout=5000;");
      await this.$queryRawUnsafe("PRAGMA synchronous=NORMAL;");
    } catch (error) {
      console.warn("[prisma] Failed to apply SQLite pragmas:", error);
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
