import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { IsArray, IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, Matches, Min } from "class-validator";
import { CurrentUser, type AuthUser } from "../common/current-user.decorator.js";
import { JwtAuthGuard } from "../common/jwt-auth.guard.js";
import { RulesService } from "./rules.service.js";

const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;

class CreateRuleDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @IsOptional()
  @IsInt()
  priority?: number;

  @IsOptional()
  @IsBoolean()
  stopOnMatch?: boolean;

  @IsArray()
  eventTypes!: string[];

  @IsOptional()
  @IsObject()
  conditions?: object;

  @IsOptional()
  @IsArray()
  actions?: object[];

  @IsOptional()
  @IsInt()
  @Min(0)
  cooldownSeconds?: number;

  @IsOptional()
  @IsIn(["rule", "user"])
  cooldownScope?: string;

  @IsOptional()
  @Matches(timePattern)
  activeFrom?: string;

  @IsOptional()
  @Matches(timePattern)
  activeTo?: string;
}

class UpdateRuleDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @IsOptional()
  @IsInt()
  priority?: number;

  @IsOptional()
  @IsBoolean()
  stopOnMatch?: boolean;

  @IsOptional()
  @IsArray()
  eventTypes?: string[];

  @IsOptional()
  @IsObject()
  conditions?: object;

  @IsOptional()
  @IsArray()
  actions?: object[];

  @IsOptional()
  @IsInt()
  @Min(0)
  cooldownSeconds?: number;

  @IsOptional()
  @IsIn(["rule", "user"])
  cooldownScope?: string;

  @IsOptional()
  activeFrom?: string | null;

  @IsOptional()
  activeTo?: string | null;
}

class TestRuleDto {
  @IsString()
  eventType!: string;

  @IsObject()
  payload!: object;
}

@Controller("rules")
@UseGuards(JwtAuthGuard)
export class RulesController {
  constructor(@Inject(RulesService) private readonly rules: RulesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.rules.list(user.creatorId!);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateRuleDto) {
    return this.rules.create(user.creatorId!, dto);
  }

  @Get(":id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.rules.getOwned(id, user.creatorId!);
  }

  @Patch(":id")
  update(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: UpdateRuleDto) {
    return this.rules.update(id, user.creatorId!, dto);
  }

  @Delete(":id")
  remove(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.rules.remove(id, user.creatorId!);
  }

  @Post(":id/test")
  test(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: TestRuleDto) {
    return this.rules.dryRun(id, user.creatorId!, dto.eventType, dto.payload as Record<string, unknown>);
  }
}
