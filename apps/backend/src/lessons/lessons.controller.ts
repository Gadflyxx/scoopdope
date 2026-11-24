import {
  Body,
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Param,
  Req,
  Res,
  UseGuards,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { LessonsService } from './lessons.service';
import { CreateLessonDto } from './dto/create-lesson.dto';
import { CreateNoteDto } from './dto/create-note.dto';
import { UpdateNoteDto } from './dto/update-note.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

interface AuthenticatedRequest extends Request {
  user?: { id?: string; userId?: string; sub?: string };
}

@Controller('courses')
export class CourseNotesController {
  constructor(private readonly lessonsService: LessonsService) {}

  @UseGuards(JwtAuthGuard)
  @Get(':id/notes/export')
  async exportNotes(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
  ): Promise<void> {
    const user = req.user;
    const learnerId = user?.id ?? user?.userId ?? user?.sub;
    if (!learnerId) {
      throw new ForbiddenException('Unable to resolve current learner');
    }

    const enrolled = await this.lessonsService.isLearnerEnrolledInCourse(id, learnerId);
    if (!enrolled) {
      throw new ForbiddenException('Learner is not enrolled in this course');
    }

    const pdf = await this.lessonsService.exportCourseNotesPdf(id, learnerId);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="course-${id}-notes.pdf"`);
    res.setHeader('Content-Length', pdf.length.toString());
    res.status(HttpStatus.OK).end(pdf);
  }
}

@Controller('lessons')
export class LessonsController {
  constructor(private readonly lessonsService: LessonsService) {}

  @Post()
  create(@Body() createLessonDto: CreateLessonDto) {
    const { videoUrl } = createLessonDto;

    if (videoUrl !== undefined && videoUrl !== null && videoUrl !== '') {
      if (typeof videoUrl !== 'string' || !this.isValidUrl(videoUrl)) {
        throw new BadRequestException('videoUrl must be a valid URL');
      }
    }

    return this.lessonsService.create(createLessonDto);
  }

  @Get(':id/video')
  async streamVideo(
    @Param('id') id: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const video = await this.lessonsService.getVideoFile(id);

    if (!video) {
      throw new NotFoundException('Video not found');
    }

    const { filePath, size, contentType } = video;
    const rangeHeader = req.headers.range;

    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', contentType);

    if (!rangeHeader) {
      res.status(HttpStatus.OK);
      res.setHeader('Content-Length', size.toString());
      const stream = this.lessonsService.createVideoStream(filePath, 0, size - 1);
      stream.on('error', () => {
        if (!res.headersSent) {
          res.status(HttpStatus.INTERNAL_SERVER_ERROR).end();
        } else {
          res.end();
        }
      });
      stream.pipe(res);
      return;
    }

    const range = this.lessonsService.parseRangeHeader(rangeHeader, size);

    if (!range) {
      res.status(HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE);
      res.setHeader('Content-Range', `bytes */${size}`);
      res.end();
      return;
    }

    const { start, end } = range;
    const chunkSize = end - start + 1;

    res.status(HttpStatus.PARTIAL_CONTENT);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
    res.setHeader('Content-Length', chunkSize.toString());

    const stream = this.lessonsService.createVideoStream(filePath, start, end);
    stream.on('error', () => {
      if (!res.headersSent) {
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).end();
      } else {
        res.end();
      }
    });
    stream.pipe(res);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/notes')
  async createNote(
    @Param('id') id: string,
    @Body() createNoteDto: CreateNoteDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const learnerId = this.resolveLearnerId(req);
    await this.assertEnrolled(id, learnerId);
    return this.lessonsService.createNote(id, learnerId, createNoteDto);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/notes')
  async listNotes(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const learnerId = this.resolveLearnerId(req);
    await this.assertEnrolled(id, learnerId);
    return this.lessonsService.listNotes(id, learnerId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/notes/:noteId')
  async updateNote(
    @Param('id') id: string,
    @Param('noteId') noteId: string,
    @Body() updateNoteDto: UpdateNoteDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const learnerId = this.resolveLearnerId(req);
    await this.assertEnrolled(id, learnerId);
    return this.lessonsService.updateNote(id, noteId, learnerId, updateNoteDto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id/notes/:noteId')
  async deleteNote(
    @Param('id') id: string,
    @Param('noteId') noteId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const learnerId = this.resolveLearnerId(req);
    await this.assertEnrolled(id, learnerId);
    return this.lessonsService.deleteNote(id, noteId, learnerId);
  }

  private resolveLearnerId(req: AuthenticatedRequest): string {
    const user = req.user;
    const learnerId = user?.id ?? user?.userId ?? user?.sub;
    if (!learnerId) {
      throw new ForbiddenException('Unable to resolve current learner');
    }
    return learnerId;
  }

  private async assertEnrolled(lessonId: string, learnerId: string): Promise<void> {
    const enrolled = await this.lessonsService.isLearnerEnrolled(lessonId, learnerId);
    if (!enrolled) {
      throw new ForbiddenException('Learner is not enrolled in this course');
    }
  }

  private isValidUrl(value: string): boolean {
    try {
      const url = new URL(value);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }
}