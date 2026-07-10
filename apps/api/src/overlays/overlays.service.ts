import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service.js";
import { REDIS } from "../redis/redis.module.js";
import type { Redis } from "ioredis";
function createOverlayToken() {
  return randomBytes(32).toString("base64url");
}

@Injectable()
export class OverlaysService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis
  ) {}

  list(creatorId: string) {
    return this.prisma.overlay.findMany({ where: { creatorId }, orderBy: { createdAt: "desc" } });
  }

  create(creatorId: string, data: { name: string; width?: number; height?: number; config?: object }) {
    if (!data.name) {
      throw new BadRequestException("name is required");
    }
    return this.prisma.overlay.create({
      data: {
        creatorId,
        name: data.name,
        token: createOverlayToken(),
        width: data.width ?? 1920,
        height: data.height ?? 1080,
        config: data.config ?? {}
      }
    });
  }

  async getOwned(id: string, creatorId: string) {
    const overlay = await this.prisma.overlay.findUnique({ where: { id }, include: { widgets: true } });
    if (!overlay) throw new NotFoundException("Overlay not found");
    if (overlay.creatorId !== creatorId) throw new ForbiddenException("Overlay does not belong to creator");
    return overlay;
  }

  async update(id: string, creatorId: string, data: { name?: string; width?: number; height?: number; isActive?: boolean; config?: object }) {
    const overlay = await this.getOwned(id, creatorId);
    const updated = await this.prisma.overlay.update({ where: { id }, data });

    if (data.width !== undefined || data.height !== undefined) {
      const widgets = await this.prisma.widget.findMany({ where: { overlayId: id } });
      for (const widget of widgets) {
        let updateNeeded = false;
        const updates: any = {};
        
        if (data.width !== undefined && widget.width > data.width) {
          updates.width = data.width;
          updateNeeded = true;
        }
        if (data.height !== undefined && widget.height > data.height) {
          updates.height = data.height;
          updateNeeded = true;
        }
        
        if (updateNeeded) {
          await this.prisma.widget.update({ where: { id: widget.id }, data: updates });
          await this.redis.publish(
            "ezstream:realtime",
            JSON.stringify({ room: `widget:${widget.id}`, event: "widget.updated", payload: { widgetId: widget.id } })
          );
          await this.redis.publish(
            "ezstream:realtime",
            JSON.stringify({ room: `overlay-token:${overlay.token}`, event: "widget.updated", payload: { widgetId: widget.id } })
          );
        }
      }
    }

    return updated;
  }

  async remove(id: string, creatorId: string) {
    await this.getOwned(id, creatorId);
    await this.prisma.overlay.delete({ where: { id } });
    return { deleted: true };
  }

  async regenerateToken(id: string, creatorId: string) {
    await this.getOwned(id, creatorId);
    return this.prisma.overlay.update({ where: { id }, data: { token: createOverlayToken() } });
  }
}
