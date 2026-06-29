import { Controller, Get, Inject, NotFoundException, Param } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";

@Controller("public/widget")
export class PublicWidgetController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Get(":id/state")
  async state(@Param("id") id: string) {
    const widget = await this.prisma.widget.findUnique({
      where: { id },
      include: { overlay: true, state: true }
    });
    if (!widget || !widget.isEnabled || (widget.overlay && !widget.overlay.isActive)) {
      throw new NotFoundException("Widget not found");
    }

    const chatMessages = widget.overlay
      ? (
          await this.prisma.eventLog.findMany({
            where: {
              creatorId: widget.creatorId,
              eventType: "live.chat.message"
            },
            orderBy: { createdAt: "desc" },
            take: 100
          })
        )
          .map((event) => this.chatMessageFromEvent(event.id, event.createdAt, event.payload))
          .filter((message): message is NonNullable<typeof message> => Boolean(message))
          .filter((message) => message.overlayId === widget.overlayId || message.overlayToken === widget.overlay?.token)
          .slice(0, 50)
          .reverse()
      : [];

    return {
      overlay: widget.overlay
        ? {
            id: widget.overlay.id,
            name: widget.overlay.name,
            token: widget.overlay.token,
            width: widget.overlay.width,
            height: widget.overlay.height
          }
        : null,
      widget: {
        id: widget.id,
        name: widget.name,
        type: widget.type,
        positionX: widget.positionX,
        positionY: widget.positionY,
        width: widget.width,
        height: widget.height,
        zIndex: widget.zIndex,
        visibility: widget.visibility,
        config: widget.config,
        state: widget.state
      },
      chatMessages
    };
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
