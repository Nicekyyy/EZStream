import { Controller, Get, Inject, NotFoundException, Param } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";

@Controller("public/overlay")
export class PublicOverlayController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Get(":token")
  async get(@Param("token") token: string) {
    const overlay = await this.findOverlay(token);
    return {
      id: overlay.id,
      name: overlay.name,
      token: overlay.token,
      width: overlay.width,
      height: overlay.height,
      config: overlay.config
    };
  }

  @Get(":token/state")
  async state(@Param("token") token: string) {
    const overlay = await this.findOverlay(token);
    const widgets = await this.prisma.widget.findMany({
      where: { overlayId: overlay.id, isEnabled: true },
      include: { state: true },
      orderBy: { zIndex: "asc" }
    });

    return {
      overlay,
      widgets
    };
  }

  private async findOverlay(token: string) {
    const overlay = await this.prisma.overlay.findUnique({ where: { token } });
    if (!overlay || !overlay.isActive) {
      throw new NotFoundException("Overlay not found");
    }
    return overlay;
  }
}
