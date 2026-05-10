import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";

type RuleInput = {
  overlayId?: string;
  name: string;
  eventType: string;
  priority?: number;
  isEnabled?: boolean;
  conditions?: object[];
  actions?: object[];
  cooldownMs?: number;
};

@Injectable()
export class RulesService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  list(creatorId: string) {
    return this.prisma.rule.findMany({ where: { creatorId }, orderBy: [{ priority: "asc" }, { createdAt: "desc" }] });
  }

  async create(creatorId: string, data: RuleInput) {
    if (!data.name || !data.eventType) {
      throw new BadRequestException("name and eventType are required");
    }
    if (data.overlayId) {
      const overlay = await this.prisma.overlay.findUnique({ where: { id: data.overlayId } });
      if (!overlay || overlay.creatorId !== creatorId) throw new ForbiddenException("Invalid overlay");
    }

    return this.prisma.rule.create({
      data: {
        creatorId,
        overlayId: data.overlayId,
        name: data.name,
        eventType: data.eventType,
        priority: data.priority ?? 100,
        isEnabled: data.isEnabled ?? true,
        conditions: data.conditions ?? [],
        actions: data.actions ?? [],
        cooldownMs: data.cooldownMs ?? 0
      }
    });
  }

  async getOwned(id: string, creatorId: string) {
    const rule = await this.prisma.rule.findUnique({ where: { id } });
    if (!rule) throw new NotFoundException("Rule not found");
    if (rule.creatorId !== creatorId) throw new ForbiddenException("Rule does not belong to creator");
    return rule;
  }

  async update(id: string, creatorId: string, data: Partial<RuleInput>) {
    await this.getOwned(id, creatorId);
    return this.prisma.rule.update({ where: { id }, data });
  }

  async remove(id: string, creatorId: string) {
    await this.getOwned(id, creatorId);
    await this.prisma.rule.delete({ where: { id } });
    return { deleted: true };
  }
}
