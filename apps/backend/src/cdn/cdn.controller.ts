import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { CdnService } from './cdn.service';
import { ContentType } from './cdn-asset.entity';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

const VIDEO_MAX_BYTES = 100 * 1024 * 1024;
const VIDEO_MIME_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime']);

@ApiTags('cdn')
@ApiBearerAuth()
@Controller('v1/cdn')
@UseGuards(JwtAuthGuard)
export class CdnController {
  constructor(private cdnService: CdnService) {}

  @Post('upload')
  @UseGuards(RolesGuard)
  @Roles('admin', 'instructor')
  @ApiOperation({ summary: 'Upload a content asset' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async uploadAsset(
    @Body() data: { lessonId?: string; fileName?: string; originalName?: string; mimeType?: string; contentType?: ContentType; fileSize?: number; isPrivate?: boolean },
    @CurrentUser() user: { id: string },
  ) {
    const mimeType = data.mimeType ?? 'application/octet-stream';
    const fileSize = data.fileSize ?? 0;

    // Validate image uploads: 2 MB limit and allowed MIME types
    if (data.contentType === ContentType.IMAGE) {
      if (!IMAGE_MIME_TYPES.has(mimeType)) {
        throw new BadRequestException(
          `Unsupported image MIME type "${mimeType}". Allowed types: ${[...IMAGE_MIME_TYPES].join(', ')}`,
        );
      }
      if (fileSize > IMAGE_MAX_BYTES) {
        throw new BadRequestException(
          `Image file exceeds the 2 MB size limit (received ${(fileSize / 1024 / 1024).toFixed(2)} MB).`,
        );
      }
    }

    return this.cdnService.uploadAsset({
      lessonId: data.lessonId,
      fileName: data.fileName ?? 'upload',
      originalName: data.originalName ?? data.fileName ?? 'upload',
      mimeType,
      contentType: data.contentType ?? ContentType.DOCUMENT,
      fileSize,
      uploadedByUserId: user.id,
      isPrivate: data.isPrivate ?? true,
    });
  }

  @Post('video')
  @UseGuards(RolesGuard)
  @Roles('instructor')
  @UseInterceptors(FileInterceptor('video', { limits: { fileSize: VIDEO_MAX_BYTES } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        video: { type: 'string', format: 'binary' },
        lessonId: { type: 'string' },
      },
    },
  })
  @ApiOperation({ summary: 'Upload a video message asset (instructors only)' })
  @ApiResponse({ status: 201, description: 'Video asset created with signed preview URL' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 413, description: 'Video file exceeds the 100 MB size limit' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async uploadVideoMessage(
    @UploadedFile() file: { originalname?: string; mimetype?: string; size?: number } | undefined,
    @Body() data: { lessonId?: string },
    @CurrentUser() user: { id: string },
  ) {
    if (!file) {
      throw new BadRequestException('A video file is required in the "video" field.');
    }

    const fileSize = file.size ?? 0;
    if (fileSize > VIDEO_MAX_BYTES) {
      throw new PayloadTooLargeException(
        `Video file exceeds the 100 MB size limit (received ${(fileSize / 1024 / 1024).toFixed(2)} MB).`,
      );
    }

    const mimeType = file.mimetype ?? 'video/mp4';
    if (!VIDEO_MIME_TYPES.has(mimeType)) {
      throw new BadRequestException(
        `Unsupported video MIME type "${mimeType}". Allowed types: ${[...VIDEO_MIME_TYPES].join(', ')}`,
      );
    }

    const asset = await this.cdnService.uploadAsset({
      lessonId: data.lessonId,
      fileName: file.originalname ?? 'video',
      originalName: file.originalname ?? 'video',
      mimeType,
      contentType: ContentType.VIDEO,
      fileSize,
      uploadedByUserId: user.id,
      isPrivate: true,
    });

    const signedUrl = await this.cdnService.generateSignedUrl(asset.id, 60);
    return { ...asset, signedUrl };
  }

  @Get(':assetId/signed-url')
  @ApiOperation({ summary: 'Generate a signed URL for an asset' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async getSignedUrl(
    @Param('assetId') assetId: string,
    @Query('expirationMinutes') expirationMinutes?: string,
  ) {
    const signedUrl = await this.cdnService.generateSignedUrl(
      assetId,
      expirationMinutes ? parseInt(expirationMinutes, 10) : 60,
    );
    return { signedUrl };
  }

  @Post(':assetId/transcode')
  @UseGuards(RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'Mark an asset as transcoded' })
  async markTranscoded(@Param('assetId') assetId: string, @Body() data: { bitrates?: number[]; thumbnailUrl?: string }) {
    return this.cdnService.markAsTranscoded(assetId, data.bitrates?.map(String) ?? [], data.thumbnailUrl);
  }

  @Post(':assetId/invalidate')
  @UseGuards(RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'Invalidate cached versions of an asset' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async invalidateCache(@Param('assetId') assetId: string) {
    return this.cdnService.invalidateCache(assetId);
  }

  @Get('lesson/:lessonId')
  @ApiOperation({ summary: 'List assets for a lesson' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async getLessonAssets(@Param('lessonId') lessonId: string) {
    return this.cdnService.getLessonAssets(lessonId);
  }

  @Get(':assetId')
  @ApiOperation({ summary: 'Get an asset by ID' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async getAsset(@Param('assetId') assetId: string) {
    return this.cdnService.getAsset(assetId);
  }
}
