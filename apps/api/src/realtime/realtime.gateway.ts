import { Inject, OnModuleDestroy } from "@nestjs/common";
import { ConnectedSocket, MessageBody, OnGatewayDisconnect, OnGatewayInit, SubscribeMessage, WebSocketGateway, WebSocketServer } from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { PrismaService } from "../prisma/prisma.service.js";
import { REDIS } from "../redis/redis.module.js";

@WebSocketGateway({
  cors: {
    origin: (origin: any, callback: any) => {
      callback(null, true);
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
    @Inject(REDIS) private readonly redis: any
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
    if (body.token) {
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
