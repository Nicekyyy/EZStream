import { Body, Controller, Inject, Post, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { IsEnum, IsObject, IsOptional, IsString } from "class-validator";
import { REALTIME_CHANNEL } from "@ezstream/shared";
import type { Redis } from "ioredis";
import { CurrentUser, type AuthUser } from "../common/current-user.decorator.js";
import { JwtAuthGuard } from "../common/jwt-auth.guard.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { REDIS } from "../redis/redis.module.js";
import { LiveEventsService } from "../live-events/live-events.service.js";

class MockPayloadDto {
  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsString()
  message?: string;

  @IsOptional()
  @IsObject()
  payload?: object;
}

class MockChatMessageDto {
  @IsOptional()
  @IsString()
  overlayToken?: string;

  @IsOptional()
  @IsEnum(["tiktok", "youtube", "twitch"])
  platform?: "tiktok" | "youtube" | "twitch";

  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsString()
  message?: string;
}

@Controller("mock-events")
@UseGuards(JwtAuthGuard)
@Throttle({ default: { limit: 30, ttl: 60000 } })
export class MockEventsController {
  constructor(
    @Inject(LiveEventsService) private readonly liveEvents: LiveEventsService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis
  ) {}

  @Post("chat")
  chat(@CurrentUser() user: AuthUser, @Body() dto: MockPayloadDto) {
    return this.create(user.creatorId!, "live.chat.message", {
      username: dto.username ?? "demo_viewer",
      message: sanitizeMessage(dto.message ?? "!hello"),
      ...(dto.payload ?? {})
    });
  }

  @Post("gift")
  gift(@CurrentUser() user: AuthUser, @Body() dto: MockPayloadDto) {
    return this.create(user.creatorId!, "live.gift.received", {
      username: dto.username ?? "demo_viewer",
      displayName: dto.username ?? "demo_viewer",
      giftName: "Rose",
      repeatCount: 1,
      coins: 1,
      ...(dto.payload ?? {})
    });
  }

  @Post("follow")
  follow(@CurrentUser() user: AuthUser, @Body() dto: MockPayloadDto) {
    return this.create(user.creatorId!, "live.follow.received", {
      username: dto.username ?? "demo_viewer",
      displayName: dto.username ?? "demo_viewer",
      ...(dto.payload ?? {})
    });
  }

  @Post("like")
  like(@CurrentUser() user: AuthUser, @Body() dto: MockPayloadDto) {
    return this.create(user.creatorId!, "live.like.received", {
      username: dto.username ?? "demo_viewer",
      displayName: dto.username ?? "demo_viewer",
      likeCount: 1,
      ...(dto.payload ?? {})
    });
  }

  @Post("share")
  share(@CurrentUser() user: AuthUser, @Body() dto: MockPayloadDto) {
    return this.create(user.creatorId!, "live.share.received", {
      username: dto.username ?? "demo_viewer",
      displayName: dto.username ?? "demo_viewer",
      ...(dto.payload ?? {})
    });
  }

  @Post("subscribe")
  subscribe(@CurrentUser() user: AuthUser, @Body() dto: MockPayloadDto) {
    return this.create(user.creatorId!, "live.subscribe.received", {
      username: dto.username ?? "demo_viewer",
      displayName: dto.username ?? "demo_viewer",
      ...(dto.payload ?? {})
    });
  }

  @Post("join")
  join(@CurrentUser() user: AuthUser, @Body() dto: MockPayloadDto) {
    return this.create(user.creatorId!, "live.viewer.joined", {
      username: dto.username ?? "demo_viewer",
      displayName: dto.username ?? "demo_viewer",
      ...(dto.payload ?? {})
    });
  }

  private create(creatorId: string, eventType: string, payload: object) {
    return this.liveEvents.processEvent(creatorId, eventType, payload as Record<string, unknown>);
  }

  @Post("chat-message")
  async chatMessage(@CurrentUser() user: AuthUser, @Body() dto: MockChatMessageDto) {
    const overlay = dto.overlayToken
      ? await this.prisma.overlay.findUnique({ where: { token: dto.overlayToken } })
      : await this.prisma.overlay.findFirst({ where: { creatorId: user.creatorId! } });
    if (!overlay) return { ok: false, error: "No overlay found" };

    const message = {
      id: `mock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      platform: dto.platform ?? "tiktok",
      username: dto.username ?? "mock_user",
      displayName: dto.username ?? "Mock User",
      message: dto.message ?? "สวัสดีครับ! 🎉",
      avatarUrl: undefined,
      badges: [{ label: "Moderator" }, { label: "VIP" }],
      timestamp: Date.now()
    };

    await this.redis.publish(
      REALTIME_CHANNEL,
      JSON.stringify({ room: `overlay-token:${overlay.token}`, event: "chat.message", payload: message })
    );

    await this.liveEvents.processEvent(user.creatorId!, "live.chat.message", {
      ...message,
      overlayId: overlay.id,
      overlayToken: overlay.token
    });

    return { ok: true, message };
  }
}

function sanitizeMessage(message: string) {
  return message.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 500);
}
