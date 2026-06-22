import { Module } from "@nestjs/common";
import { LiveEventsModule } from "../live-events/live-events.module.js";
import { MockEventsController } from "./mock-events.controller.js";

@Module({
  imports: [LiveEventsModule],
  controllers: [MockEventsController]
})
export class MockEventsModule {}
