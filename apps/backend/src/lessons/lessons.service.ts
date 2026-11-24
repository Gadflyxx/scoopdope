import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ForbiddenException,
  RequestRangeNotSatisfiableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Repository } from 'typeorm';
import { createReadStream, promises as fsPromises, Stats } from 'fs';
import { ReadStream } from 'fs';
import { Lesson } from './lesson.entity';
import { CreateLessonDto } from './dto/create-lesson.dto';
import { UpdateLessonDto } from './dto/update-lesson.dto';
import { Question } from '../qa/question.entity';
import { Answer } from '../qa/answer.entity';
import { QuestionUpvote } from '../qa/question-upvote.entity';
import { CreateQuestionDto } from '../qa/dto/create-question.dto';
import { CreateAnswerDto } from '../qa/dto/create-answer.dto';

export const QA_QUESTION_CREATED_EVENT = 'qa.question.created';
export const QA_ANSWER_CREATED_EVENT = 'qa.answer.created';

export interface QuestionCreatedEvent {
  questionId: string;
  lessonId: string;
  authorId: string;
  instructorId: string;
}

export interface AnswerCreatedEvent {
  answerId: string;
  questionId: string;
  authorId: string;
  questionAuthorId: string;
}

export interface ParsedRange {
  start: number;
  end: number;
}

export interface VideoStreamResult {
  statusCode: 200 | 206;
  headers: {
    'Content-Type': string;
    'Content-Length': number;
    'Accept-Ranges': 'bytes';
    'Content-Range'?: string;
  };
  stream: ReadStream;
}

export interface CourseNotesPdfResult {
  filename: string;
  contentType: string;
  buffer: Buffer;
}

@Injectable()
export class LessonsService {
  constructor(
    @InjectRepository(Lesson)
    private readonly lessonsRepository: Repository<Lesson>,
    @InjectRepository(Question)
    private readonly questionsRepository: Repository<Question>,
    @InjectRepository(Answer)
    private readonly answersRepository: Repository<Answer>,
    @InjectRepository(QuestionUpvote)
    private readonly questionUpvotesRepository: Repository<QuestionUpvote>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(createLessonDto: CreateLessonDto): Promise<Lesson> {
    this.validateVideoUrl(createLessonDto.videoUrl);
    const lesson = this.lessonsRepository.create(createLessonDto);
    return this.lessonsRepository.save(lesson);
  }

  async update(id: string, updateLessonDto: UpdateLessonDto): Promise<Lesson> {
    if (updateLessonDto.videoUrl !== undefined) {
      this.validateVideoUrl(updateLessonDto.videoUrl);
    }
    await this.lessonsRepository.update(id, updateLessonDto);
    return this.findOne(id);
  }

  private validateVideoUrl(videoUrl?: string): void {
    if (videoUrl === undefined || videoUrl === null || videoUrl === '') {
      return;
    }
    let parsed: URL;
    try {
      parsed = new URL(videoUrl);
    } catch {
      throw new BadRequestException('videoUrl must be a valid URL');
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new BadRequestException('videoUrl must be a valid URL');
    }
  }

  async findAll(): Promise<Lesson[]> {
    return this.lessonsRepository.find();
  }

  async findOne(id: string): Promise<Lesson> {
    return this.lessonsRepository.findOne({ where: { id } });
  }

  /**
   * Load a lesson and enforce course visibility rules for the caller.
   *
   * Throws `NotFoundException` when the lesson does not exist (or its
   * parent course is not visible to the caller) and `ForbiddenException`
   * when the lesson exists but the caller may not access its content.
   */
  async findOneForUser(id: string, userId?: string): Promise<Lesson> {
    const lesson = await this.lessonsRepository.findOne({ where: { id } });
    if (!lesson) {
      throw new NotFoundException('Lesson not found');
    }
    await this.assertCanAccessLesson(lesson, userId);
    return lesson;
  }

  /**
   * Enforce course visibility rules for a lesson's parent course.
   * Private/unlisted courses are hidden (404) from callers who cannot
   * see them; enrolled-only courses reject non-enrolled callers (403).
   */
  async assertCanAccessLesson(lesson: Lesson, userId?: string): Promise<void> {
    const courseId = (lesson as Lesson & { courseId?: string }).courseId;
    if (!courseId) {
      return;
    }
    const result = await this.accessControlService.canAccessCourse(
      courseId,
      userId,
    );
    if (result.allowed) {
      return;
    }
    if (result.reason === 'not_found') {
      throw new NotFoundException('Lesson not found');
    }
    throw new ForbiddenException(
      'You do not have access to this lesson',
    );
  }

  async remove(id: string): Promise<void> {
    await this.lessonsRepository.delete(id);
  }

  /**
   * Post a question on a lesson. The learner must be enrolled in the
   * lesson's course. Emits `qa.question.created` so the instructor can
   * be notified.
   */
  async createQuestion(
    lessonId: string,
    authorId: string,
    createQuestionDto: CreateQuestionDto,
  ): Promise<Question> {
    const lesson = await this.lessonsRepository.findOne({
      where: { id: lessonId },
    });
    if (!lesson) {
      throw new NotFoundException('Lesson not found');
    }

    await this.assertEnrolled(lesson, authorId);

    const question = this.questionsRepository.create({
      lessonId,
      authorId,
      title: createQuestionDto.title,
      body: createQuestionDto.body,
      upvoteCount: 0,
    });
    const saved = await this.questionsRepository.save(question);

    this.eventEmitter.emit(QA_QUESTION_CREATED_EVENT, {
      questionId: saved.id,
      lessonId,
      authorId,
      instructorId: lesson.instructorId,
    } as QuestionCreatedEvent);

    return saved;
  }

  /**
   * List questions for a lesson, sorted by upvote count descending.
   */
  async findQuestionsByLesson(lessonId: string): Promise<Question[]> {
    const lesson = await this.lessonsRepository.findOne({
      where: { id: lessonId },
    });
    if (!lesson) {
      throw new NotFoundException('Lesson not found');
    }

    return this.questionsRepository.find({
      where: { lessonId },
      order: { upvoteCount: 'DESC', createdAt: 'ASC' },
    });
  }

  /**
   * Answer a question. Emits `qa.answer.created` so the question author
   * can be notified.
   */
  async createAnswer(
    questionId: string,
    authorId: string,
    createAnswerDto: CreateAnswerDto,
  ): Promise<Answer> {
    const question = await this.questionsRepository.findOne({
      where: { id: questionId },
    });
    if (!question) {
      throw new NotFoundException('Question not found');
    }

    const answer = this.answersRepository.create({
      questionId,
      authorId,
      body: createAnswerDto.body,
    });
    const saved = await this.answersRepository.save(answer);

    this.eventEmitter.emit(QA_ANSWER_CREATED_EVENT, {
      answerId: saved.id,
      questionId,
      authorId,
      questionAuthorId: question.authorId,
    } as AnswerCreatedEvent);

    return saved;
  }

  /**
   * Upvote a question. Idempotent per user: a repeated upvote by the
   * same user does not increment the count again.
   */
  async upvoteQuestion(questionId: string, userId: string): Promise<Question> {
    const question = await this.questionsRepository.findOne({
      where: { id: questionId },
    });
    if (!question) {
      throw new NotFoundException('Question not found');
    }

    const existing = await this.questionUpvotesRepository.findOne({
      where: { questionId, userId },
    });
    if (existing) {
      return question;
    }

    const upvote = this.questionUpvotesRepository.create({
      questionId,
      userId,
    });
    await this.questionUpvotesRepository.save(upvote);
    await this.questionsRepository.increment({ id: questionId }, 'upvoteCount', 1);

    return this.questionsRepository.findOne({ where: { id: questionId } });
  }

  private async assertEnrolled(lesson: Lesson, userId: string): Promise<void> {
    // Enrollment is verified through the lesson's course relationship.
    // When no course is associated, the lesson is treated as open.
    const courseId = (lesson as Lesson & { courseId?: string }).courseId;
    if (!courseId) {
      return;
    }
    const enrolled = await this.lessonsRepository.manager
      .getRepository('Enrollment')
      .findOne({ where: { courseId, userId } });
    if (!enrolled) {
      throw new ForbiddenException('You are not enrolled in this lesson');
    }
  }

  /**
   * Parse an HTTP Range header against a known resource size.
   *
   * Supported forms:
   *   - `bytes=start-end` (inclusive, clamped to size - 1)
   *   - `bytes=start-`    (from start to end of file)
   *   - `bytes=-suffix`   (last `suffix` bytes)
   *
   * Returns `null` when no Range header is supplied. Throws
   * `RequestRangeNotSatisfiableException` (416) for malformed or
   * unsatisfiable ranges.
   */
  parseRangeHeader(rangeHeader: string | undefined, size: number): ParsedRange | null {
    if (rangeHeader === undefined || rangeHeader === null || rangeHeader === '') {
      return null;
    }
    if (size <= 0) {
      throw new RequestRangeNotSatisfiableException();
    }

    const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
    if (!match) {
      throw new RequestRangeNotSatisfiableException();
    }

    const [, rawStart, rawEnd] = match;
    if (rawStart === '' && rawEnd === '') {
      throw new RequestRangeNotSatisfiableException();
    }

    let start: number;
    let end: number;

    if (rawStart === '') {
      // Suffix range: last N bytes.
      const suffixLength = Number(rawEnd);
      if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) {
        throw new RequestRangeNotSatisfiableException();
      }
      start = Math.max(size - suffixLength, 0);
      end = size - 1;
    } else {
      start = Number(rawStart);
      if (!Number.isSafeInteger(start) || start < 0 || start >= size) {
        throw new RequestRangeNotSatisfiableException();
      }
      if (rawEnd === '') {
        end = size - 1;
      } else {
        end = Number(rawEnd);
        if (!Number.isSafeInteger(end) || end < start) {
          throw new RequestRangeNotSatisfiableException();
        }
        end = Math.min(end, size - 1);
      }
    }

    return { start, end };
  }

  /**
   * Resolve a video file into a streamable response, honouring the
   * optional HTTP Range header. Returns 206 with a partial stream for
   * range requests and 200 with the full stream otherwise.
   */
  async streamVideo(
    filePath: string,
    rangeHeader?: string,
    contentType = 'video/mp4',
    lessonId?: string,
    userId?: string,
  ): Promise<VideoStreamResult> {
    if (lessonId !== undefined) {
      const lesson = await this.lessonsRepository.findOne({
        where: { id: lessonId },
      });
      if (!lesson) {
        throw new NotFoundException('Lesson not found');
      }
      await this.assertCanAccessLesson(lesson, userId);
    }

    let stats: Stats;
    try {
      stats = await fsPromises.stat(filePath);
    } catch {
      throw new NotFoundException('Video file not found');
    }
    if (!stats.isFile()) {
      throw new NotFoundException('Video file not found');
    }

    const size = stats.size;
    const parsed = this.parseRangeHeader(rangeHeader, size);

    if (parsed === null) {
      return {
        statusCode: 200,
        headers: {
          'Content-Type': contentType,
          'Content-Length': size,
          'Accept-Ranges': 'bytes',
        },
        stream: createReadStream(filePath),
      };
    }

    const { start, end } = parsed;
    return {
      statusCode: 206,
      headers: {
        'Content-Type': contentType,
        'Content-Length': end - start + 1,
        'Accept-Ranges': 'bytes',
        'Content-Range': `bytes ${start}-${end}/${size}`,
      },
      stream: createReadStream(filePath, { start, end }),
    };
  }
}
