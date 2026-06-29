import { Inject, Injectable, ForbiddenException, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { Redis } from "ioredis";
import { PrismaService } from "../prisma/prisma.service.js";
import { REDIS } from "../redis/redis.module.js";
import { CHAT_COMMANDS_CHANNEL, REALTIME_CHANNEL } from "@ezstream/shared";

@Injectable()
export class ChatSourcesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis
  ) {}

  list(creatorId: string) {
    return this.prisma.chatSource.findMany({
      where: { creatorId },
      include: { overlay: { select: { id: true, name: true, token: true } } },
      orderBy: { createdAt: "desc" }
    });
  }

  async create(creatorId: string, data: { overlayId: string; platform: "TIKTOK" | "YOUTUBE" | "TWITCH"; target: string; label?: string }) {
    const overlay = await this.prisma.overlay.findUnique({ where: { id: data.overlayId } });
    if (!overlay || overlay.creatorId !== creatorId) throw new ForbiddenException("Overlay not found");
    return this.prisma.chatSource.create({
      data: {
        creatorId,
        overlayId: data.overlayId,
        platform: data.platform,
        target: data.target.trim(),
        label: data.label?.trim() || null
      }
    });
  }

  async update(id: string, creatorId: string, data: { target?: string; label?: string; isEnabled?: boolean }) {
    const source = await this.getOwned(id, creatorId);
    return this.prisma.chatSource.update({
      where: { id: source.id },
      data: {
        ...(data.target !== undefined ? { target: data.target.trim() } : {}),
        ...(data.label !== undefined ? { label: data.label.trim() || null } : {}),
        ...(data.isEnabled !== undefined ? { isEnabled: data.isEnabled } : {})
      }
    });
  }

  async remove(id: string, creatorId: string) {
    const source = await this.getOwned(id, creatorId);
    await this.publishCommand("disconnect", source);
    return this.prisma.chatSource.delete({ where: { id: source.id } });
  }

  async connect(id: string, creatorId: string) {
    const source = await this.getOwned(id, creatorId);
    const overlay = await this.prisma.overlay.findUnique({ where: { id: source.overlayId } });
    if (!overlay) throw new NotFoundException("Overlay not found");
    await this.prisma.chatSource.update({ where: { id }, data: { status: "CONNECTING" } });
    await this.publishCommand("connect", { ...source, overlayToken: overlay.token });
    await this.redis.publish(
      REALTIME_CHANNEL,
      JSON.stringify({
        room: `overlay-token:${overlay.token}`,
        event: "chat-source.status",
        payload: { id, status: "CONNECTING", errorMessage: null }
      })
    );
    return { ok: true, status: "CONNECTING" };
  }

  async disconnect(id: string, creatorId: string) {
    const source = await this.getOwned(id, creatorId);
    const overlay = await this.prisma.overlay.findUnique({ where: { id: source.overlayId } });
    await this.publishCommand("disconnect", source);
    await this.prisma.chatSource.update({ where: { id }, data: { status: "DISCONNECTED" } });
    if (overlay) {
      await this.redis.publish(
        REALTIME_CHANNEL,
        JSON.stringify({
          room: `overlay-token:${overlay.token}`,
          event: "chat-source.status",
          payload: { id, status: "DISCONNECTED", errorMessage: null }
        })
      );
    }
    return { ok: true, status: "DISCONNECTED" };
  }

  async getOwned(id: string, creatorId: string) {
    const source = await this.prisma.chatSource.findUnique({ where: { id } });
    if (!source) throw new NotFoundException("ChatSource not found");
    if (source.creatorId !== creatorId) throw new ForbiddenException("Not your ChatSource");
    return source;
  }

  private async publishCommand(action: string, source: Record<string, unknown>) {
    await this.redis.publish(
      CHAT_COMMANDS_CHANNEL,
      JSON.stringify({ action, chatSourceId: source.id, platform: source.platform, target: source.target, overlayToken: source.overlayToken ?? null })
    );
  }
}
