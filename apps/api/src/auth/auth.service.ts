import { ConflictException, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import bcrypt from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service.js";
import { redactCreatorSettings } from "../common/redact-creator-settings.js";
import { LoginDto, RegisterDto } from "./dto.js";

function slugFromEmail(email: string) {
  return email.split("@")[0].toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(JwtService) private readonly jwt: JwtService
  ) {}

  async register(dto: RegisterDto) {
    const email = dto.email.toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException("Email already registered");
    }

    const baseSlug = slugFromEmail(email) || "creator";
    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash: bcrypt.hashSync(dto.password, 10),
        creator: {
          create: {
            displayName: dto.displayName ?? baseSlug,
            slug: `${baseSlug}-${Math.random().toString(36).slice(2, 8)}`
          }
        }
      },
      include: { creator: true }
    });

    return this.session(user.id);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      include: { creator: true }
    });

    if (!user || !bcrypt.compareSync(dto.password, user.passwordHash)) {
      throw new UnauthorizedException("Invalid email or password");
    }

    return this.session(user.id);
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { creator: true }
    });
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      creator: user.creator ? redactCreatorSettings(user.creator) : null
    };
  }

  private async session(userId: string) {
    const user = await this.me(userId);
    return {
      accessToken: await this.jwt.signAsync({ sub: user.id }),
      user
    };
  }
}
