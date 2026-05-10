import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { WidgetType } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service.js";
import type { Redis } from "ioredis";
import { QueuesService } from "../queues/queues.service.js";
import { REDIS } from "../redis/redis.module.js";

type WidgetInput = {
  overlayId: string;
  type: WidgetType;
  name: string;
  positionX?: number;
  positionY?: number;
  width?: number;
  height?: number;
  zIndex?: number;
  isEnabled?: boolean;
  visibility?: boolean;
  config?: object;
};

@Injectable()
export class WidgetsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(QueuesService) private readonly queues: QueuesService
  ) {}

  private async publishWidgetUpdate(overlayId: string, widgetId: string) {
    const overlay = await this.prisma.overlay.findUnique({ where: { id: overlayId } });
    if (overlay) {
      await this.redis.publish(
        "ezstream:realtime",
        JSON.stringify({ room: `overlay-token:${overlay.token}`, event: "widget.updated", payload: { widgetId } })
      );
    }
  }

  list(creatorId: string) {
    return this.prisma.widget.findMany({
      where: { creatorId },
      include: { state: true, overlay: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" }
    });
  }

  async create(creatorId: string, data: WidgetInput) {
    if (!data.overlayId || !data.type || !data.name) {
      throw new BadRequestException("overlayId, type and name are required");
    }
    const overlay = await this.prisma.overlay.findUnique({ where: { id: data.overlayId } });
    if (!overlay || overlay.creatorId !== creatorId) throw new ForbiddenException("Invalid overlay");

    const created = await this.prisma.widget.create({
      data: {
        creatorId,
        overlayId: data.overlayId,
        type: data.type,
        name: data.name,
        positionX: data.positionX ?? 0,
        positionY: data.positionY ?? 0,
        width: data.width ?? 400,
        height: data.height ?? 160,
        zIndex: data.zIndex ?? 1,
        isEnabled: data.isEnabled ?? true,
        visibility: data.visibility ?? true,
        config: data.config ?? {},
        state: { create: { state: {} } }
      },
      include: { state: true, overlay: { select: { id: true, name: true } } }
    });
    await this.publishWidgetUpdate(created.overlayId, created.id);
    return created;
  }

  async getOwned(id: string, creatorId: string) {
    const widget = await this.prisma.widget.findUnique({
      where: { id },
      include: { state: true, overlay: { select: { id: true, name: true } } }
    });
    if (!widget) throw new NotFoundException("Widget not found");
    if (widget.creatorId !== creatorId) throw new ForbiddenException("Widget does not belong to creator");
    return widget;
  }

  async update(id: string, creatorId: string, data: Partial<WidgetInput>) {
    await this.getOwned(id, creatorId);
    if (data.overlayId) {
      const overlay = await this.prisma.overlay.findUnique({ where: { id: data.overlayId } });
      if (!overlay || overlay.creatorId !== creatorId) throw new ForbiddenException("Invalid overlay");
    }
    const updated = await this.prisma.widget.update({
      where: { id },
      data,
      include: { state: true, overlay: { select: { id: true, name: true } } }
    });
    await this.publishWidgetUpdate(updated.overlayId, updated.id);
    return updated;
  }

  async remove(id: string, creatorId: string) {
    const widget = await this.getOwned(id, creatorId);
    await this.prisma.widget.delete({ where: { id } });
    await this.publishWidgetUpdate(widget.overlay.id, id);
    return { deleted: true };
  }

  async testTrigger(id: string, creatorId: string) {
    const widget = await this.getOwned(id, creatorId);
    const widgetAction = await this.prisma.widgetAction.create({
      data: {
        creatorId,
        widgetId: widget.id,
        actionType: "TRIGGER_WIDGET",
        payload: { source: "test-trigger" }
      }
    });

    await this.queues.widgetActions.add("widget.action", { widgetActionId: widgetAction.id });
    
    const overlay = await this.prisma.overlay.findUnique({ where: { id: widget.overlayId } });
    if (overlay) {
      await this.redis.publish(
        "ezstream:realtime",
        JSON.stringify({ room: `overlay-token:${overlay.token}`, event: "widget.triggered", payload: { widgetActionId: widgetAction.id, actionType: "TRIGGER_WIDGET", payload: widgetAction.payload } })
      );
    }

    return widgetAction;
  }
}
