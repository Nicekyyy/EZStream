import { Controller, ForbiddenException, Get, Inject, NotFoundException, Param, UseGuards } from "@nestjs/common";
import { CurrentUser, type AuthUser } from "../common/current-user.decorator.js";
import { JwtAuthGuard } from "../common/jwt-auth.guard.js";
import { PrismaService } from "../prisma/prisma.service.js";

@Controller("events")
@UseGuards(JwtAuthGuard)
export class EventsController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Get()
  async list(@CurrentUser() user: AuthUser) {
    const logs = await this.prisma.eventLog.findMany({
      where: { creatorId: user.creatorId! },
      orderBy: { createdAt: "desc" },
      take: 100
    });
    return logs.map(log => ({
      ...log,
      matchedRuleIds: JSON.parse(log.matchedRuleIds as string) as string[]
    }));
  }

  @Get(":id")
  async get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    const event = await this.prisma.eventLog.findUnique({ where: { id } });
    if (!event) throw new NotFoundException("Event not found");
    if (event.creatorId !== user.creatorId) throw new ForbiddenException("Event does not belong to creator");
    return {
      ...event,
      matchedRuleIds: JSON.parse(event.matchedRuleIds as string) as string[]
    };
  }
}
