import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerModule } from "@nestjs/throttler";
import { AuditLogsModule } from "./audit-logs/audit-logs.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { ChatSourcesModule } from "./chat-sources/chat-sources.module.js";
import { RequestLoggerMiddleware } from "./common/request-logger.middleware.js";
import { CreatorsModule } from "./creators/creators.module.js";
import { EventsModule } from "./events/events.module.js";
import { HealthController } from "./health.controller.js";
import { MediaModule } from "./media/media.module.js";
import { MockEventsModule } from "./mock-events/mock-events.module.js";
import { OverlaysModule } from "./overlays/overlays.module.js";
import { PrismaModule } from "./prisma/prisma.module.js";
import { PublicModule } from "./public/public.module.js";
import { QueuesModule } from "./queues/queues.module.js";
import { RealtimeModule } from "./realtime/realtime.module.js";
import { RedisModule } from "./redis/redis.module.js";
import { LiveEventsModule } from "./live-events/live-events.module.js";
import { MaintenanceModule } from "./maintenance/maintenance.module.js";
import { TtsModule } from "./tts/tts.module.js";
import { UsersModule } from "./users/users.module.js";
import { WidgetsModule } from "./widgets/widgets.module.js";
import { RulesModule } from "./rules/rules.module.js";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: [".env", "../../.env"] }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 120 }]),
    PrismaModule,
    RedisModule,
    QueuesModule,
    AuthModule,
    UsersModule,
    CreatorsModule,
    OverlaysModule,
    WidgetsModule,
    RulesModule,
    EventsModule,
    RealtimeModule,
    LiveEventsModule,
    TtsModule,
    MediaModule,
    MockEventsModule,
    AuditLogsModule,
    PublicModule,
    ChatSourcesModule,
    MaintenanceModule
  ],
  controllers: [HealthController]
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestLoggerMiddleware).forRoutes("*");
  }
}
