import { Controller, Get, Inject, UseGuards } from "@nestjs/common";
import { CurrentUser, type AuthUser } from "../common/current-user.decorator.js";
import { JwtAuthGuard } from "../common/jwt-auth.guard.js";
import { PrismaService } from "../prisma/prisma.service.js";

@Controller("audit-logs")
@UseGuards(JwtAuthGuard)
export class AuditLogsController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.prisma.auditLog.findMany({ where: { creatorId: user.creatorId! }, orderBy: { createdAt: "desc" }, take: 100 });
  }
}
