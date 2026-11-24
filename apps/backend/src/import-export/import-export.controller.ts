import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
  Request,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { diskStorage } from 'multer';
import * as os from 'os';
import * as crypto from 'crypto';
import * as fs from 'fs';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { ImportExportService } from './import-export.service';

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

// Multer disk-storage config for SCORM uploads: the ZIP is written straight to
// the OS temp dir so it never occupies Node.js heap space.
const scormDiskStorage = diskStorage({
  destination: os.tmpdir(),
  filename: (_req: unknown, _file: unknown, cb: (err: Error | null, name: string) => void) =>
    cb(null, `scorm-upload-${crypto.randomBytes(8).toString('hex')}.zip`),
});

@ApiTags('import-export')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('instructor', 'admin')
@Controller('courses')
export class ImportExportController {
  constructor(private readonly service: ImportExportService) {}

  @Get(':id/export')
  @ApiOperation({ summary: 'Export a course as JSON' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async exportCourse(@Param('id') id: string, @Res() res: Response) {
    const data = await this.service.exportCourse(id);
    res
      .setHeader('Content-Type', 'application/json')
      .setHeader('Content-Disposition', `attachment; filename="course-${id}.json"`)
      .send(JSON.stringify(data, null, 2));
  }

  @Post('import/json')
  @ApiOperation({ summary: 'Import a course from JSON file' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_SIZE } }))
  importJson(
    @UploadedFile() file: Express.Multer.File,
    @Request() req: { user: { id: string } }
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    return this.service.importJson(file.buffer, req.user.id);
  }

  @Post('import/csv')
  @ApiOperation({ summary: 'Import a course from CSV file' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_SIZE } }))
  importCsv(
    @UploadedFile() file: Express.Multer.File,
    @Request() req: { user: { id: string } }
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    return this.service.importCsv(file.buffer, req.user.id);
  }

  @Post('import/scorm')
  @ApiOperation({ summary: 'Import a course from SCORM 1.2 or 2004 ZIP package' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @UseInterceptors(FileInterceptor('file', { storage: scormDiskStorage, limits: { fileSize: MAX_FILE_SIZE } }))
  async importScorm(
    @UploadedFile() file: Express.Multer.File,
    @Request() req: { user: { id: string } }
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    // file.path is set by disk storage; clean it up whether the import succeeds or fails
    try {
      return await this.service.importScormFromPath(file.path, req.user.id);
    } finally {
      await fs.promises.unlink(file.path).catch(() => undefined);
    }
  }

  @Post('import/bulk')
  @ApiOperation({ summary: 'Bulk import multiple courses (JSON or SCORM ZIP). Returns a job ID for progress tracking.' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { files: { type: 'array', items: { type: 'string', format: 'binary' } } } } })
  @UseInterceptors(FilesInterceptor('files', 20, { limits: { fileSize: MAX_FILE_SIZE } }))
  bulkImport(
    @UploadedFiles() files: Express.Multer.File[],
    @Request() req: { user: { id: string } }
  ) {
    if (!files?.length) throw new BadRequestException('No files uploaded');
    const buffers = files.map((f) => ({ name: f.originalname, data: f.buffer }));
    return this.service.startBulkImport(buffers, req.user.id);
  }

  @Get('import/jobs/:jobId')
  @ApiOperation({ summary: 'Get progress/status of a bulk import job' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  getJobStatus(@Param('jobId') jobId: string) {
    return this.service.getJobStatus(jobId);
  }
}

/**
 * GDPR Article 20 data-portability endpoints.
 *
 * `POST /v1/users/me/export` queues a data export job for the authenticated
 * user and emails a signed download link. The link expires after 48 hours and
 * the underlying ZIP is deleted at the same time. Requests are rate-limited to
 * one per 30 days.
 *
 * `GET /v1/users/me/export/download` validates the signed URL and expiry before
 * streaming the ZIP back to the caller.
 */
@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UserDataExportController {
  constructor(private readonly service: ImportExportService) {}

  @Post('me/export')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Request a GDPR data export (queues a job and emails a download link)' })
  @ApiResponse({ status: 202, description: 'Export queued' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 429, description: 'Export already requested within the last 30 days' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async requestExport(@Request() req: { user: { id: string } }) {
    const result = await this.service.requestExport(req.user.id);
    return {
      jobId: result.jobId,
      status: result.status,
      expiresAt: result.expiresAt,
    };
  }

  @Get('me/export/download')
  @ApiOperation({ summary: 'Download a GDPR data export via a signed, expiring link' })
  @ApiQuery({ name: 'token', required: true, description: 'Signed download token from the export email' })
  @ApiResponse({ status: 200, description: 'ZIP stream' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Export not found or expired' })
  @ApiResponse({ status: 410, description: 'Download link expired' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async downloadExport(
    @Query('token') token: string,
    @Request() req: { user: { id: string } },
    @Res() res: Response
  ) {
    if (!token) throw new BadRequestException('Missing download token');
    const { stream, filename } = await this.service.openExportDownload(token, req.user.id);
    res
      .setHeader('Content-Type', 'application/zip')
      .setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    stream.pipe(res);
  }
}