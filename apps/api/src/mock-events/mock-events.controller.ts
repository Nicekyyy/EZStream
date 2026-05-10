import { Body, Controller, Inject, Post, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { IsObject, IsOptional, IsString } from "class-validator";
import { CurrentUser, type AuthUser } from "../common/current-user.decorator.js";
import { JwtAuthGuard } from "../common/jwt-auth.guard.js";
import { RuleEngineService } from "../rule-engine/rule-engine.service.js";

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

@Controller("mock-events")
@UseGuards(JwtAuthGuard)
@Throttle({ default: { limit: 30, ttl: 60000 } })
export class MockEventsController {
  constructor(@Inject(RuleEngineService) private readonly ruleEngine: RuleEngineService) {}

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
      giftName: "Rose",
      giftCount: 1,
      ...(dto.payload ?? {})
    });
  }

  @Post("follow")
  follow(@CurrentUser() user: AuthUser, @Body() dto: MockPayloadDto) {
    return this.create(user.creatorId!, "live.follow.received", {
      username: dto.username ?? "demo_viewer",
      ...(dto.payload ?? {})
    });
  }

  @Post("like")
  like(@CurrentUser() user: AuthUser, @Body() dto: MockPayloadDto) {
    return this.create(user.creatorId!, "live.like.received", {
      username: dto.username ?? "demo_viewer",
      likeCount: 1,
      ...(dto.payload ?? {})
    });
  }

  @Post("share")
  share(@CurrentUser() user: AuthUser, @Body() dto: MockPayloadDto) {
    return this.create(user.creatorId!, "live.share.received", {
      username: dto.username ?? "demo_viewer",
      ...(dto.payload ?? {})
    });
  }

  @Post("join")
  join(@CurrentUser() user: AuthUser, @Body() dto: MockPayloadDto) {
    return this.create(user.creatorId!, "live.viewer.joined", {
      username: dto.username ?? "demo_viewer",
      ...(dto.payload ?? {})
    });
  }

  private create(creatorId: string, eventType: string, payload: object) {
    return this.ruleEngine.handleMockEvent(creatorId, eventType, payload as Record<string, unknown>);
  }
}

function sanitizeMessage(message: string) {
  return message.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 500);
}
