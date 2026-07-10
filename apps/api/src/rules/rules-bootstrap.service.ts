import { Inject, Injectable, OnApplicationBootstrap } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";

@Injectable()
export class RulesBootstrapService implements OnApplicationBootstrap {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async onApplicationBootstrap() {
    const creators = await this.prisma.creator.findMany({
      where: { rules: { none: {} } },
      select: { id: true }
    });
    for (const creator of creators) {
      await this.createDefaultChatRule(creator.id).catch((error) => {
        console.error(`[rules] Failed to create default rule for creator ${creator.id}:`, error);
      });
    }
  }

  private async createDefaultChatRule(creatorId: string) {
    const widget = await this.prisma.widget.findFirst({
      where: { creatorId, type: "TTS_WIDGET", isEnabled: true },
      orderBy: { createdAt: "asc" },
      select: { id: true }
    });
    if (!widget) return;

    await this.prisma.rule.create({
      data: {
        creatorId,
        name: "อ่านแชทเป็นเสียง (TTS)",
        isEnabled: true,
        priority: 0,
        eventTypes: ["live.chat.message"],
        conditions: { all: [] },
        actions: [{ type: "SPEAK_TTS", widgetId: widget.id }]
      }
    });
  }
}
