import { Body, Controller, Get, Inject, Patch, UseGuards } from "@nestjs/common";
import { IsObject, IsOptional, IsString } from "class-validator";
import { CurrentUser, type AuthUser } from "../common/current-user.decorator.js";
import { JwtAuthGuard } from "../common/jwt-auth.guard.js";
import { CreatorsService } from "./creators.service.js";

class UpdateCreatorDto {
  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsString()
  bio?: string;

  @IsOptional()
  @IsObject()
  settings?: object;
}

@Controller("creator")
@UseGuards(JwtAuthGuard)
export class CreatorsController {
  constructor(@Inject(CreatorsService) private readonly creators: CreatorsService) {}

  @Get("me")
  me(@CurrentUser() user: AuthUser) {
    return this.creators.getForUser(user.id);
  }

  @Patch("me")
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateCreatorDto) {
    return this.creators.updateForUser(user.id, dto);
  }
}
