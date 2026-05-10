import { Module } from "@nestjs/common";
import { RulesController } from "./rules.controller.js";
import { RulesService } from "./rules.service.js";

@Module({
  controllers: [RulesController],
  providers: [RulesService]
})
export class RulesModule {}
