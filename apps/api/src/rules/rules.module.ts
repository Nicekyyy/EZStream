import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module.js";
import { QueuesModule } from "../queues/queues.module.js";
import { RedisModule } from "../redis/redis.module.js";
import { RuleEngineService } from "./rule-engine.service.js";
import { RulesBootstrapService } from "./rules-bootstrap.service.js";
import { RulesController } from "./rules.controller.js";
import { RulesService } from "./rules.service.js";

@Module({
  imports: [PrismaModule, QueuesModule, RedisModule],
  controllers: [RulesController],
  providers: [RulesService, RuleEngineService, RulesBootstrapService],
  exports: [RuleEngineService, RulesService]
})
export class RulesModule {}
