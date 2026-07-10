import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { redactCreatorSettings } from "../common/redact-creator-settings.js";

@Injectable()
export class CreatorsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async getForUser(userId: string) {
    const creator = await this.prisma.creator.findUnique({ where: { userId } });
    if (!creator) {
      throw new NotFoundException("Creator profile not found");
    }
    return redactCreatorSettings(creator);
  }

  async updateForUser(userId: string, data: { displayName?: string; bio?: string; settings?: object }) {
    const existing = await this.prisma.creator.findUnique({ where: { userId } });
    if (!existing) {
      throw new NotFoundException("Creator profile not found");
    }

    // Preserve existing secret settings when the client only sends the redacted placeholder back.
    const nextSettings = data.settings as Record<string, unknown> | undefined;
    if (nextSettings && nextSettings.googleTtsServiceAccountJson === true) {
      const existingSettings = existing.settings as Record<string, unknown>;
      nextSettings.googleTtsServiceAccountJson = existingSettings?.googleTtsServiceAccountJson;
    }

    const updated = await this.prisma.creator.update({
      where: { id: existing.id },
      data
    });
    return redactCreatorSettings(updated);
  }
}
