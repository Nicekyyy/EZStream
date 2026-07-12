import { Inject, OnModuleDestroy } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConnectedSocket, MessageBody, OnGatewayDisconnect, OnGatewayInit, SubscribeMessage, WebSocketGateway, WebSocketServer } from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { PrismaService } from "../prisma/prisma.service.js";
import { REDIS } from "../redis/redis.module.js";
import { isOriginAllowed } from "../common/cors.js";

@WebSocketGateway({
  cors: {
    origin: (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => {
      callback(null, isOriginAllowed(origin));
    },
    credentials: true
  }
})
export class RealtimeGateway implements OnGatewayInit, OnGatewayDisconnect, OnModuleDestroy {
  @WebSocketServer()
  server!: Server;

  private subscriber?: any;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: any,
    @Inject(JwtService) private readonly jwt: JwtService
  ) {}

  async afterInit(server: Server) {
    this.subscriber = this.redis.duplicate();
    await this.subscriber.subscribe("ezstream:realtime");
    this.subscriber.on("message", (_channel: string, raw: string) => {
      try {
        const message = JSON.parse(raw) as { room: string; event: string; payload: unknown };
        server.to(message.room).emit(message.event, message.payload);
      } catch (error) {
        console.error("Invalid realtime message", error);
      }
    });
  }

  @SubscribeMessage("overlay.join")
  async joinOverlay(@ConnectedSocket() socket: Socket, @MessageBody() body: { token?: string; overlayId?: string; widgetId?: string }) {
    if (!body || typeof body !== "object") return { joined: false };
    if (typeof body.token === "string" && body.token) {
      const overlay = await this.prisma.overlay.findUnique({ where: { token: body.token } });
      if (!overlay || !overlay.isActive) {
        return { joined: false };
      }
      socket.data.overlayToken = body.token;
      socket.data.overlayId = overlay.id;
      socket.join(`overlay-token:${body.token}`);
      socket.join(`overlay:${overlay.id}`);
    }
    if (body.overlayId) socket.join(`overlay:${body.overlayId}`);
    if (body.widgetId) socket.join(`widget:${body.widgetId}`);
    socket.emit("overlay.connected", { socketId: socket.id, overlayToken: body.token });
    return { joined: true };
  }

  @SubscribeMessage("creator.join")
  async joinCreator(@ConnectedSocket() socket: Socket) {
    const token = socket.handshake.auth?.token;
    if (typeof token !== "string" || !token) return { joined: false };

    let payload: { sub?: string };
    try {
      payload = await this.jwt.verifyAsync(token);
    } catch {
      return { joined: false };
    }
    if (!payload.sub) return { joined: false };

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { creator: true }
    });
    const creatorId = user?.creator?.id;
    if (!creatorId) return { joined: false };

    socket.join(`creator:${creatorId}`);
    return { joined: true };
  }

  handleDisconnect(socket: Socket) {
    const token = socket.data.overlayToken as string | undefined;
    if (token) {
      this.server.to(`overlay-token:${token}`).emit("overlay.disconnected", { socketId: socket.id, overlayToken: token });
    }
  }

  emitToOverlayToken(token: string, event: string, payload: unknown) {
    this.server.to(`overlay-token:${token}`).emit(event, payload);
  }

  async onModuleDestroy() {
    await this.subscriber?.quit();
  }
}
