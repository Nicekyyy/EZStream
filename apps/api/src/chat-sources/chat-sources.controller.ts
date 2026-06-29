import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { IsBoolean, IsEnum, IsOptional, IsString } from "class-validator";
import { CurrentUser, type AuthUser } from "../common/current-user.decorator.js";
import { JwtAuthGuard } from "../common/jwt-auth.guard.js";
import { ChatSourcesService } from "./chat-sources.service.js";

class CreateChatSourceDto {
  @IsString()
  overlayId!: string;

  @IsEnum(["TIKTOK", "YOUTUBE", "TWITCH"])
  platform!: "TIKTOK" | "YOUTUBE" | "TWITCH";

  @IsString()
  target!: string;

  @IsOptional()
  @IsString()
  label?: string;
}

class UpdateChatSourceDto {
  @IsOptional()
  @IsString()
  target?: string;

  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;
}

@Controller("chat-sources")
@UseGuards(JwtAuthGuard)
export class ChatSourcesController {
  constructor(@Inject(ChatSourcesService) private readonly chatSources: ChatSourcesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.chatSources.list(user.creatorId!);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateChatSourceDto) {
    return this.chatSources.create(user.creatorId!, dto);
  }

  @Patch(":id")
  update(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: UpdateChatSourceDto) {
    return this.chatSources.update(id, user.creatorId!, dto);
  }

  @Delete(":id")
  remove(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.chatSources.remove(id, user.creatorId!);
  }

  @Post(":id/connect")
  connect(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.chatSources.connect(id, user.creatorId!);
  }

  @Post(":id/disconnect")
  disconnect(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.chatSources.disconnect(id, user.creatorId!);
  }
}
