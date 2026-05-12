import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { WidgetType } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service.js";
import type { Redis } from "ioredis";
import { QueuesService } from "../queues/queues.service.js";
import { REDIS } from "../redis/redis.module.js";

type WidgetInput = {
  overlayId?: string | null;
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

  private async publishWidgetUpdate(overlayId: string | null | undefined, widgetId: string) {
    await this.redis.publish(
      "ezstream:realtime",
      JSON.stringify({ room: `widget:${widgetId}`, event: "widget.updated", payload: { widgetId } })
    );
    if (!overlayId) return;
    const overlay = await this.prisma.overlay.findUnique({ where: { id: overlayId } });
    if (!overlay) return;
    await this.redis.publish(
      "ezstream:realtime",
      JSON.stringify({ room: `overlay-token:${overlay.token}`, event: "widget.updated", payload: { widgetId } })
    );
  }

  list(creatorId: string) {
    return this.prisma.widget.findMany({
      where: { creatorId },
      include: { state: true, overlay: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" }
    });
  }

  async create(creatorId: string, data: WidgetInput) {
    if (!data.type || !data.name) {
      throw new BadRequestException("type and name are required");
    }
    if (data.overlayId) {
      const overlay = await this.prisma.overlay.findUnique({ where: { id: data.overlayId } });
      if (!overlay || overlay.creatorId !== creatorId) throw new ForbiddenException("Invalid overlay");
    }

    const created = await this.prisma.widget.create({
      data: {
        creatorId,
        overlayId: data.overlayId ?? null,
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
    const current = await this.getOwned(id, creatorId);
    if (data.overlayId) {
      const overlay = await this.prisma.overlay.findUnique({ where: { id: data.overlayId } });
      if (!overlay || overlay.creatorId !== creatorId) throw new ForbiddenException("Invalid overlay");
    }
    const updated = await this.prisma.widget.update({
      where: { id },
      data,
      include: { state: true, overlay: { select: { id: true, name: true } } }
    });
    if (current.overlayId && current.overlayId !== updated.overlayId) {
      await this.publishWidgetUpdate(current.overlayId, updated.id);
    }
    await this.publishWidgetUpdate(updated.overlayId, updated.id);
    return updated;
  }

  async remove(id: string, creatorId: string) {
    const widget = await this.getOwned(id, creatorId);
    await this.prisma.widget.delete({ where: { id } });
    await this.publishWidgetUpdate(widget.overlayId, id);
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
    
    await this.redis.publish(
      "ezstream:realtime",
      JSON.stringify({ room: `widget:${widget.id}`, event: "widget.triggered", payload: { widgetActionId: widgetAction.id, actionType: "TRIGGER_WIDGET", payload: widgetAction.payload } })
    );

    const overlay = widget.overlayId ? await this.prisma.overlay.findUnique({ where: { id: widget.overlayId } }) : null;
    if (overlay) {
      await this.redis.publish(
        "ezstream:realtime",
        JSON.stringify({ room: `overlay-token:${overlay.token}`, event: "widget.triggered", payload: { widgetActionId: widgetAction.id, actionType: "TRIGGER_WIDGET", payload: widgetAction.payload } })
      );
    }

    return widgetAction;
  }
}
