import { Module } from "@nestjs/common";
import { RuleEngineModule } from "../rule-engine/rule-engine.module.js";
import { MockEventsController } from "./mock-events.controller.js";

@Module({
  imports: [RuleEngineModule],
  controllers: [MockEventsController]
})
export class MockEventsModule {}
