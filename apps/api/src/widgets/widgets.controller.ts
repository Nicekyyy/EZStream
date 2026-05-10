import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { WidgetType } from "@prisma/client";
import { IsBoolean, IsDefined, IsEnum, IsInt, IsObject, IsOptional, IsString, Min } from "class-validator";
import { CurrentUser, type AuthUser } from "../common/current-user.decorator.js";
import { JwtAuthGuard } from "../common/jwt-auth.guard.js";
import { WidgetsService } from "./widgets.service.js";

class CreateWidgetDto {
  @IsString()
  @IsDefined()
  overlayId!: string;

  @IsEnum(WidgetType)
  @IsDefined()
  type!: WidgetType;

  @IsString()
  @IsDefined()
  name!: string;

  @IsOptional()
  @IsInt()
  positionX?: number;

  @IsOptional()
  @IsInt()
  positionY?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  width?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  height?: number;

  @IsOptional()
  @IsInt()
  zIndex?: number;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  visibility?: boolean;

  @IsOptional()
  @IsObject()
  config?: object;
}

class UpdateWidgetDto {
  @IsOptional()
  @IsString()
  overlayId?: string;

  @IsOptional()
  @IsEnum(WidgetType)
  type?: WidgetType;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsInt()
  positionX?: number;

  @IsOptional()
  @IsInt()
  positionY?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  width?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  height?: number;

  @IsOptional()
  @IsInt()
  zIndex?: number;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  visibility?: boolean;

  @IsOptional()
  @IsObject()
  config?: object;
}

@Controller("widgets")
@UseGuards(JwtAuthGuard)
export class WidgetsController {
  constructor(@Inject(WidgetsService) private readonly widgets: WidgetsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.widgets.list(user.creatorId!);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateWidgetDto) {
    return this.widgets.create(user.creatorId!, dto);
  }

  @Get(":id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.widgets.getOwned(id, user.creatorId!);
  }

  @Patch(":id")
  update(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: UpdateWidgetDto) {
    return this.widgets.update(id, user.creatorId!, dto);
  }

  @Delete(":id")
  remove(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.widgets.remove(id, user.creatorId!);
  }

  @Post(":id/test-trigger")
  testTrigger(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.widgets.testTrigger(id, user.creatorId!);
  }
}
