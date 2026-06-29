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
    const recentEvents = await this.prisma.eventLog.findMany({
      where: {
        creatorId: overlay.creatorId,
        eventType: "live.chat.message"
      },
      orderBy: { createdAt: "desc" },
      take: 100
    });
    const chatMessages = recentEvents
      .map((event) => this.chatMessageFromEvent(event.id, event.createdAt, event.payload))
      .filter((message): message is NonNullable<typeof message> => Boolean(message))
      .filter((message) => message.overlayId === overlay.id || message.overlayToken === overlay.token)
      .slice(0, 50)
      .reverse();

    return {
      overlay,
      widgets,
      chatMessages
    };
  }

  private async findOverlay(token: string) {
    const overlay = await this.prisma.overlay.findUnique({ where: { token } });
    if (!overlay || !overlay.isActive) {
      throw new NotFoundException("Overlay not found");
    }
    return overlay;
  }

  private chatMessageFromEvent(id: string, createdAt: Date, payload: unknown) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
    const value = payload as Record<string, unknown>;
    const message = typeof value.message === "string" ? value.message : "";
    if (!message) return null;
    return {
      id: typeof value.id === "string" ? value.id : `event-${id}`,
      platform: value.platform === "youtube" ? "youtube" : value.platform === "twitch" ? "twitch" : "tiktok",
      username: typeof value.username === "string" ? value.username : "unknown",
      displayName: typeof value.displayName === "string" ? value.displayName : typeof value.username === "string" ? value.username : "unknown",
      message,
      avatarUrl: typeof value.avatarUrl === "string" ? value.avatarUrl : undefined,
      badges: Array.isArray(value.badges) ? value.badges.map((b: any) => ({ label: typeof b === "string" ? b : String(b?.label || ""), url: b?.url ? String(b.url) : undefined })) : [],
      timestamp: typeof value.timestamp === "number" && Number.isFinite(value.timestamp) ? value.timestamp : createdAt.getTime(),
      overlayId: typeof value.overlayId === "string" ? value.overlayId : undefined,
      overlayToken: typeof value.overlayToken === "string" ? value.overlayToken : undefined
    };
  }
}
