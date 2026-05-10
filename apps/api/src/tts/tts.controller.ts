import { Body, Controller, Get, Inject, Post, UseGuards } from "@nestjs/common";
import { IsNumber, IsOptional, IsString, Max, Min } from "class-validator";
import { CurrentUser, type AuthUser } from "../common/current-user.decorator.js";
import { JwtAuthGuard } from "../common/jwt-auth.guard.js";
import { PrismaService } from "../prisma/prisma.service.js";

class TestTtsDto {
  @IsString()
  text!: string;

  @IsOptional()
  @IsString()
  voice?: string;

  @IsOptional()
  @IsNumber()
  @Min(0.5)
  @Max(2)
  speed?: number;
}

@Controller("tts")
@UseGuards(JwtAuthGuard)
export class TtsController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Get("jobs")
  jobs(@CurrentUser() user: AuthUser) {
    return this.prisma.ttsJob.findMany({ where: { creatorId: user.creatorId! }, orderBy: { createdAt: "desc" }, take: 100 });
  }

  @Post("test")
  test(@CurrentUser() user: AuthUser, @Body() dto: TestTtsDto) {
    return this.prisma.ttsJob.create({
      data: {
        creatorId: user.creatorId!,
        text: dto.text,
        voice: dto.voice ?? "default",
        speed: dto.speed ?? 1,
        payload: { type: "tts.speak", text: dto.text, voice: dto.voice ?? "default", speed: dto.speed ?? 1, pitch: 1, volume: 1 }
      }
    });
  }
}
