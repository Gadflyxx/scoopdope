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
  UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { LessonsService } from './lessons.service';
import { CreateLessonDto } from './dto/create-lesson.dto';
import { QaService } from '../qa/qa.service';
import { NotificationsService } from '../notifications/notifications.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

interface AuthenticatedRequest extends Request {
  user?: { id?: string; userId?: string; sub?: string };
}

@Controller('lessons')
export class LessonsController {
  constructor(
    private readonly lessonsService: LessonsService,
    private readonly qaService: QaService,
    private readonly notificationsService: NotificationsService,
  ) {}

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

  @Post(':id/questions')
  @UseGuards(JwtAuthGuard)
  async createQuestion(
    @Param('id') id: string,
    @Body() body: { content: string },
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = this.getUserId(req);

    if (!body || typeof body.content !== 'string' || body.content.trim() === '') {
      throw new BadRequestException('content is required');
    }

    const enrolled = await this.lessonsService.isUserEnrolled(id, userId);
    if (!enrolled) {
      throw new ForbiddenException('You must be enrolled in this lesson to ask a question');
    }

    const question = await this.qaService.createQuestion({
      lessonId: id,
      authorId: userId,
      content: body.content.trim(),
    });

    const instructorId = await this.lessonsService.getInstructorId(id);
    if (instructorId && instructorId !== userId) {
      await this.notificationsService.create({
        userId: instructorId,
        type: 'question',
        message: 'A new question was posted on your lesson',
        metadata: { lessonId: id, questionId: question.id },
      });
    }

    return question;
  }

  @Get(':id/questions')
  async listQuestions(@Param('id') id: string) {
    return this.qaService.listQuestionsByLesson(id);
  }

  @Get(':id/video')
  @UseGuards(AccessControlGuard)
  async streamVideo(
    @Param('id') id: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    // Resolve the parent course before serving content so the AccessControlGuard
    // can enforce the course's visibility rules for this lesson resource.
    const courseId = await this.lessonsService.getCourseIdForLesson(id);
    (req as Request & { courseId?: string }).courseId = courseId;

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

  private getUserId(req: AuthenticatedRequest): string {
    const userId = req.user?.id ?? req.user?.userId ?? req.user?.sub;
    if (!userId) {
      throw new ForbiddenException('Authenticated user is required');
    }
    return userId;
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

@Controller('questions')
export class QuestionsController {
  constructor(
    private readonly qaService: QaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Post(':id/answers')
  @UseGuards(JwtAuthGuard)
  async createAnswer(
    @Param('id') id: string,
    @Body() body: { content: string },
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = this.getUserId(req);

    if (!body || typeof body.content !== 'string' || body.content.trim() === '') {
      throw new BadRequestException('content is required');
    }

    const question = await this.qaService.getQuestionById(id);
    if (!question) {
      throw new NotFoundException('Question not found');
    }

    const answer = await this.qaService.createAnswer({
      questionId: id,
      authorId: userId,
      content: body.content.trim(),
    });

    if (question.authorId && question.authorId !== userId) {
      await this.notificationsService.create({
        userId: question.authorId,
        type: 'answer',
        message: 'Your question has been answered',
        metadata: { questionId: id, answerId: answer.id },
      });
    }

    return answer;
  }

  @Post(':id/upvote')
  @UseGuards(JwtAuthGuard)
  async upvote(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const userId = this.getUserId(req);

    const question = await this.qaService.getQuestionById(id);
    if (!question) {
      throw new NotFoundException('Question not found');
    }

    return this.qaService.upvoteQuestion(id, userId);
  }

  private getUserId(req: AuthenticatedRequest): string {
    const userId = req.user?.id ?? req.user?.userId ?? req.user?.sub;
    if (!userId) {
      throw new ForbiddenException('Authenticated user is required');
    }
    return userId;
  }
}