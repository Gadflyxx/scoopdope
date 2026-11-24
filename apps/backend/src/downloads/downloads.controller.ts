import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Param,
  Body,
  UseGuards,
  Request,
  Req,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { DownloadsService } from './downloads.service';

class QueueDownloadDto {
  courseId: string;
  lessonId?: string;
  lessonTitle?: string;
  fileUrl?: string;
  fileSizeBytes?: number;
}

@ApiTags('downloads')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('v1/downloads')
export class DownloadsController {
  constructor(private readonly service: DownloadsService) {}

  @Post()
  @ApiOperation({ summary: 'Queue a lesson/course for offline download' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - user is not enrolled in the course and is not an admin/instructor',
  })
  @ApiResponse({ status: 404, description: 'Not found' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  queue(
    @Req() req: Request & { user: { id: string; role?: string } },
    @Body() dto: QueueDownloadDto,
  ) {
    return this.service.queueDownload(
      req.user.id,
      dto.courseId,
      dto.lessonId,
      dto.lessonTitle,
      dto.fileUrl,
      dto.fileSizeBytes,
      req.user.role,
    );
  }

  @Get()
  @ApiOperation({ summary: 'List all downloads for the current user' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  list(@Req() req: Request & { user: { id: string } }) {
    return this.service.findByUser(req.user.id);
  }

  @Get('storage')
  @ApiOperation({ summary: 'Get storage usage stats' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  storage(@Req() req: Request & { user: { id: string } }) {
    return this.service.getStorageStats(req.user.id);
  }

  @Patch(':id/complete')
  @ApiOperation({ summary: 'Mark a download as completed' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  complete(@Req() req: Request & { user: { id: string } }, @Param('id') id: string) {
    return this.service.markCompleted(id, req.user.id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Remove a downloaded item' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  remove(@Req() req: Request & { user: { id: string } }, @Param('id') id: string) {
    return this.service.remove(id, req.user.id);
  }
}

@ApiTags('lesson-resources')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('v1/lessons')
export class LessonResourcesController {
  constructor(private readonly service: DownloadsService) {}

  @Post(':id/resources')
  @UseGuards(RolesGuard)
  @Roles('instructor', 'admin')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiOperation({ summary: 'Upload a downloadable resource for a lesson' })
  @ApiResponse({ status: 201, description: 'Resource uploaded' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - instructor/admin only' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  upload(
    @Req() req: Request & { user: { id: string; role?: string } },
    @Param('id') lessonId: string,
    @UploadedFile(
      new ParseFilePipe({
        validators: [new MaxFileSizeValidator({ maxSize: 50 * 1024 * 1024 })],
      }),
    )
    file: { originalname: string; mimetype: string; size: number; buffer: Buffer },
  ) {
    return this.service.createLessonResource(req.user.id, lessonId, file);
  }

  @Get(':id/resources')
  @ApiOperation({ summary: 'List downloadable resources for a lesson' })
  @ApiResponse({ status: 200, description: 'List of resources' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - user is not enrolled in the course' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  listResources(
    @Req() req: Request & { user: { id: string; role?: string } },
    @Param('id') lessonId: string,
  ) {
    return this.service.listLessonResources(req.user.id, lessonId, req.user.role);
  }

  @Get(':id/resources/:resourceId/download')
  @ApiOperation({ summary: 'Get a signed download URL for a lesson resource' })
  @ApiResponse({ status: 200, description: 'Signed URL and expiry' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - user is not enrolled in the course' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  downloadResource(
    @Req() req: Request & { user: { id: string; role?: string } },
    @Param('id') lessonId: string,
    @Param('resourceId') resourceId: string,
  ) {
    return this.service.getLessonResourceDownloadUrl(
      req.user.id,
      lessonId,
      resourceId,
      req.user.role,
    );
  }
}
