import { Module } from "@nestjs/common";
import { ChatSourcesController } from "./chat-sources.controller.js";
import { ChatSourcesService } from "./chat-sources.service.js";

@Module({
  controllers: [ChatSourcesController],
  providers: [ChatSourcesService],
  exports: [ChatSourcesService]
})
export class ChatSourcesModule {}
