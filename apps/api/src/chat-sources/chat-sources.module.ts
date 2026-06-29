import { Module } from "@nestjs/common";
import { ChatSourcesController } from "./chat-sources.controller.js";
import { ChatSourcesService } from "./chat-sources.service.js";
import { ChatConnectorService } from "./chat-connector.service.js";
import { LiveEventsModule } from "../live-events/live-events.module.js";
import { QueuesModule } from "../queues/queues.module.js";

@Module({
  imports: [LiveEventsModule, QueuesModule],
  controllers: [ChatSourcesController],
  providers: [ChatSourcesService, ChatConnectorService],
  exports: [ChatSourcesService, ChatConnectorService]
})
export class ChatSourcesModule {}
