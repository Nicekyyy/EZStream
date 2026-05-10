import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";

@Injectable()
export class CreatorsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async getForUser(userId: string) {
    const creator = await this.prisma.creator.findUnique({ where: { userId } });
    if (!creator) {
      throw new NotFoundException("Creator profile not found");
    }
    return creator;
  }

  async updateForUser(userId: string, data: { displayName?: string; bio?: string; settings?: object }) {
    const creator = await this.getForUser(userId);
    return this.prisma.creator.update({
      where: { id: creator.id },
      data
    });
  }
}
