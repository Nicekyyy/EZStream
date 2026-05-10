import { BadRequestException, Body, Controller, Get, Inject, Post, UseGuards } from "@nestjs/common";
import { defaultGoogleTtsVoiceName, resolveGoogleTtsVoiceName } from "@ezstream/shared";
import { WidgetType } from "@prisma/client";
import { IsNumber, IsOptional, IsString, Max, MaxLength, Min, IsNotEmpty } from "class-validator";
import { CurrentUser, type AuthUser } from "../common/current-user.decorator.js";
import { JwtAuthGuard } from "../common/jwt-auth.guard.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { QueuesService } from "../queues/queues.service.js";

const defaultGoogleTtsVoice = resolveGoogleTtsVoiceName(process.env.GOOGLE_TTS_VOICE, defaultGoogleTtsVoiceName);

class TestTtsDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  text!: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  widgetId?: string;

  @IsOptional()
  @IsString()
  voice?: string;

  @IsOptional()
  @IsNumber()
  @Min(0.5)
  @Max(2)
  speed?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  pitch?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  volume?: number;
}

function jsonObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

@Controller("tts")
@UseGuards(JwtAuthGuard)
export class TtsController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(QueuesService) private readonly queues: QueuesService
  ) {}

  @Get("jobs")
  jobs(@CurrentUser() user: AuthUser) {
    return this.prisma.ttsJob.findMany({
      where: { creatorId: user.creatorId! },
      include: { widget: { select: { id: true, name: true, overlay: { select: { id: true, name: true, token: true } } } } },
      orderBy: { createdAt: "desc" },
      take: 100
    });
  }

  @Post("test")
  async test(@CurrentUser() user: AuthUser, @Body() dto: TestTtsDto) {
    const creatorId = user.creatorId!;
    const widget = dto.widgetId
      ? await this.prisma.widget.findFirst({ where: { id: dto.widgetId, creatorId, type: WidgetType.TTS_WIDGET, isEnabled: true }, include: { overlay: true } })
      : await this.prisma.widget.findFirst({ where: { creatorId, type: WidgetType.TTS_WIDGET, isEnabled: true }, include: { overlay: true }, orderBy: { createdAt: "asc" } });

    if (!widget) {
      throw new BadRequestException("Create or select an enabled TTS widget before testing TTS");
    }

    const text = dto.text.trim();
    if (!text) {
      throw new BadRequestException("TTS text is required");
    }

    const widgetConfig = jsonObject(widget.config);
    const voice = resolveGoogleTtsVoiceName(dto.voice ?? widgetConfig.voice, defaultGoogleTtsVoice);
    const speed = dto.speed ?? (typeof widgetConfig.speed === "number" ? widgetConfig.speed : 1);
    const pitch = dto.pitch ?? (typeof widgetConfig.pitch === "number" ? widgetConfig.pitch : 1);
    const volume = dto.volume ?? (typeof widgetConfig.volume === "number" ? widgetConfig.volume : 1);

    const job = await this.prisma.ttsJob.create({
      data: {
        creatorId,
        widgetId: widget.id,
        text,
        voice,
        speed,
        pitch,
        volume,
        payload: { type: "tts.audio", ttsJobId: "", text, voice, speed, pitch, volume }
      },
      include: { widget: { select: { id: true, name: true, overlay: { select: { id: true, name: true, token: true } } } } }
    });

    await this.queues.ttsJobs.add("tts.speak", { ttsJobId: job.id });
    return job;
  }
}
