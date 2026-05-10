import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { IsBoolean, IsDefined, IsInt, IsObject, IsOptional, IsString, Min } from "class-validator";
import { CurrentUser, type AuthUser } from "../common/current-user.decorator.js";
import { JwtAuthGuard } from "../common/jwt-auth.guard.js";
import { OverlaysService } from "./overlays.service.js";

class CreateOverlayDto {
  @IsString()
  @IsDefined()
  name!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  width?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  height?: number;

  @IsOptional()
  @IsObject()
  config?: object;
}

class UpdateOverlayDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  width?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  height?: number;

  @IsOptional()
  @IsObject()
  config?: object;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

@Controller("overlays")
@UseGuards(JwtAuthGuard)
export class OverlaysController {
  constructor(@Inject(OverlaysService) private readonly overlays: OverlaysService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.overlays.list(user.creatorId!);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateOverlayDto) {
    return this.overlays.create(user.creatorId!, dto);
  }

  @Get(":id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.overlays.getOwned(id, user.creatorId!);
  }

  @Patch(":id")
  update(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: UpdateOverlayDto) {
    return this.overlays.update(id, user.creatorId!, dto);
  }

  @Delete(":id")
  remove(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.overlays.remove(id, user.creatorId!);
  }

  @Post(":id/regenerate-token")
  regenerate(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.overlays.regenerateToken(id, user.creatorId!);
  }
}
