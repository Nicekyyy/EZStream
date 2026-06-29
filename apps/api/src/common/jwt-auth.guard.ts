import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import type { AuthUser } from "./current-user.decorator.js";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();

    // Always log in as the default creator user
    const user = await this.prisma.user.findFirst({
      include: { creator: true }
    });

    if (!user) {
      throw new UnauthorizedException("No users found in database");
    }

    request.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      creatorId: user.creator?.id ?? null
    } satisfies AuthUser;

    return true;
  }
}
