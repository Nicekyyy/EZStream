import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { WidgetType } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service.js";

type WidgetInput = {
  overlayId: string;
  type: WidgetType;
  name: string;
  positionX?: number;
  positionY?: number;
  width?: number;
  height?: number;
  zIndex?: number;
  visibility?: boolean;
  config?: object;
};

@Injectable()
export class WidgetsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  list(creatorId: string) {
    return this.prisma.widget.findMany({ where: { creatorId }, include: { state: true }, orderBy: { createdAt: "desc" } });
  }

  async create(creatorId: string, data: WidgetInput) {
    if (!data.overlayId || !data.type || !data.name) {
      throw new BadRequestException("overlayId, type and name are required");
    }
    const overlay = await this.prisma.overlay.findUnique({ where: { id: data.overlayId } });
    if (!overlay || overlay.creatorId !== creatorId) throw new ForbiddenException("Invalid overlay");

    return this.prisma.widget.create({
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
        visibility: data.visibility ?? true,
        config: data.config ?? {},
        state: { create: { state: {} } }
      },
      include: { state: true }
    });
  }

  async getOwned(id: string, creatorId: string) {
    const widget = await this.prisma.widget.findUnique({ where: { id }, include: { state: true } });
    if (!widget) throw new NotFoundException("Widget not found");
    if (widget.creatorId !== creatorId) throw new ForbiddenException("Widget does not belong to creator");
    return widget;
  }

  async update(id: string, creatorId: string, data: Partial<WidgetInput>) {
    await this.getOwned(id, creatorId);
    return this.prisma.widget.update({ where: { id }, data, include: { state: true } });
  }

  async remove(id: string, creatorId: string) {
    await this.getOwned(id, creatorId);
    await this.prisma.widget.delete({ where: { id } });
    return { deleted: true };
  }

  async testTrigger(id: string, creatorId: string) {
    const widget = await this.getOwned(id, creatorId);
    return this.prisma.widgetAction.create({
      data: {
        creatorId,
        widgetId: widget.id,
        actionType: "TRIGGER_WIDGET",
        payload: { source: "test-trigger" }
      }
    });
  }
}
