import { BadRequestException, Controller, Delete, ForbiddenException, Get, Inject, NotFoundException, Param, Post, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { FileInterceptor } from "@nestjs/platform-express";
import { MediaAssetType } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { CurrentUser, type AuthUser } from "../common/current-user.decorator.js";
import { JwtAuthGuard } from "../common/jwt-auth.guard.js";
import { PrismaService } from "../prisma/prisma.service.js";

const allowedMimeTypes = new Map<string, { type: MediaAssetType; ext: string }>([
  ["image/png", { type: MediaAssetType.IMAGE, ext: ".png" }],
  ["image/jpeg", { type: MediaAssetType.IMAGE, ext: ".jpg" }],
  ["image/webp", { type: MediaAssetType.IMAGE, ext: ".webp" }],
  ["audio/mpeg", { type: MediaAssetType.AUDIO, ext: ".mp3" }],
  ["audio/wav", { type: MediaAssetType.AUDIO, ext: ".wav" }],
  ["audio/ogg", { type: MediaAssetType.AUDIO, ext: ".ogg" }]
]);

const maxFileSizeBytes = 10 * 1024 * 1024;

@Controller("media")
@UseGuards(JwtAuthGuard)
export class MediaController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ConfigService) private readonly config: ConfigService
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.prisma.mediaAsset.findMany({ where: { creatorId: user.creatorId! }, orderBy: { createdAt: "desc" } });
  }

  @Post("upload")
  @UseInterceptors(FileInterceptor("file"))
  async upload(@CurrentUser() user: AuthUser, @UploadedFile() file: Express.Multer.File | undefined) {
    if (!file) throw new BadRequestException("Missing file");
    if (file.size > maxFileSizeBytes) throw new BadRequestException("File is too large");

    const mime = allowedMimeTypes.get(file.mimetype);
    if (!mime) throw new BadRequestException("Unsupported file type");

    const safeOriginalExt = extname(file.originalname).toLowerCase();
    const fileName = `${randomUUID()}${safeOriginalExt || mime.ext}`;
    const storageRoot = resolve(this.config.get<string>("LOCAL_STORAGE_ROOT", "./storage"));
    const creatorDir = resolve(storageRoot, user.creatorId!);
    const storagePath = resolve(creatorDir, fileName);

    if (!storagePath.startsWith(creatorDir)) {
      throw new BadRequestException("Invalid storage path");
    }

    await mkdir(creatorDir, { recursive: true });
    await writeFile(storagePath, file.buffer);

    return this.prisma.mediaAsset.create({
      data: {
        creatorId: user.creatorId!,
        type: mime.type,
        fileName,
        originalName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        storagePath,
        publicPath: `/storage/${user.creatorId}/${fileName}`,
        metadata: {}
      }
    });
  }

  @Delete(":id")
  async remove(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    const asset = await this.prisma.mediaAsset.findUnique({ where: { id } });
    if (!asset) throw new NotFoundException("Media asset not found");
    if (asset.creatorId !== user.creatorId) throw new ForbiddenException("Media asset does not belong to creator");
    const storageRoot = resolve(this.config.get<string>("LOCAL_STORAGE_ROOT", "./storage"));
    const storagePath = resolve(asset.storagePath);
    if (storagePath.startsWith(storageRoot)) {
      await unlink(storagePath).catch(() => undefined);
    }
    await this.prisma.mediaAsset.delete({ where: { id } });
    return { deleted: true };
  }
}
