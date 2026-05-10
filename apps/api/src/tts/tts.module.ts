import { Module } from "@nestjs/common";
import { TtsController } from "./tts.controller.js";

@Module({
  controllers: [TtsController]
})
export class TtsModule {}
