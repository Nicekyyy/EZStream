import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { IsArray, IsBoolean, IsDefined, IsInt, IsObject, IsOptional, IsString, Min } from "class-validator";
import { CurrentUser, type AuthUser } from "../common/current-user.decorator.js";
import { JwtAuthGuard } from "../common/jwt-auth.guard.js";
import { RulesService } from "./rules.service.js";

class CreateRuleDto {
  @IsOptional()
  @IsString()
  overlayId?: string;

  @IsString()
  @IsDefined()
  name!: string;

  @IsString()
  @IsDefined()
  eventType!: string;

  @IsOptional()
  @IsInt()
  priority?: number;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @IsOptional()
  @IsArray()
  @IsObject({ each: true })
  conditions?: object[];

  @IsOptional()
  @IsArray()
  @IsObject({ each: true })
  actions?: object[];

  @IsOptional()
  @IsInt()
  @Min(0)
  cooldownMs?: number;
}

class UpdateRuleDto {
  @IsOptional()
  @IsString()
  overlayId?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  eventType?: string;

  @IsOptional()
  @IsInt()
  priority?: number;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @IsOptional()
  @IsArray()
  @IsObject({ each: true })
  conditions?: object[];

  @IsOptional()
  @IsArray()
  @IsObject({ each: true })
  actions?: object[];

  @IsOptional()
  @IsInt()
  @Min(0)
  cooldownMs?: number;
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
}
