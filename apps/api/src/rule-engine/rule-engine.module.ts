import { Module } from "@nestjs/common";
import { RuleEngineService } from "./rule-engine.service.js";

@Module({
  providers: [RuleEngineService],
  exports: [RuleEngineService]
})
export class RuleEngineModule {}
