import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service.js";

export function createOverlayToken() {
  return randomBytes(32).toString("base64url");
}

@Injectable()
export class OverlaysService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

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
    await this.getOwned(id, creatorId);
    return this.prisma.overlay.update({ where: { id }, data });
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
