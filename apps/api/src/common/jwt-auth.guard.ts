import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { PrismaService } from "../prisma/prisma.service.js";
import type { AuthUser } from "./current-user.decorator.js";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(PrismaService) private readonly prisma: PrismaService
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const header = request.headers.authorization as string | undefined;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : null;

    if (!token) {
      throw new UnauthorizedException("Missing bearer token");
    }

    try {
      const payload = await this.jwt.verifyAsync<{ sub: string }>(token);
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        include: { creator: true }
      });

      if (!user) {
        throw new UnauthorizedException("Invalid token");
      }

      request.user = {
        id: user.id,
        email: user.email,
        role: user.role,
        creatorId: user.creator?.id ?? null
      } satisfies AuthUser;

      return true;
    } catch {
      throw new UnauthorizedException("Invalid token");
    }
  }
}
