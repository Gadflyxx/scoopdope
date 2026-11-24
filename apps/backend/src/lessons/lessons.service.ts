import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  RequestRangeNotSatisfiableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { createReadStream, promises as fsPromises, Stats } from 'fs';
import { ReadStream } from 'fs';
import { Lesson } from './lesson.entity';
import { CreateLessonDto } from './dto/create-lesson.dto';
import { UpdateLessonDto } from './dto/update-lesson.dto';
import { Note } from '../notes/note.entity';
import { CreateNoteDto } from '../notes/dto/create-note.dto';
import { UpdateNoteDto } from '../notes/dto/update-note.dto';
import { Enrollment } from '../enrollments/enrollment.entity';

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
    @InjectRepository(Note)
    private readonly notesRepository: Repository<Note>,
    @InjectRepository(Enrollment)
    private readonly enrollmentsRepository: Repository<Enrollment>,
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

  async remove(id: string): Promise<void> {
    await this.lessonsRepository.delete(id);
  }

  /**
   * Ensure the user is enrolled in the course that owns the lesson.
   * Throws NotFoundException when the lesson does not exist and
   * ForbiddenException when the user is not enrolled.
   */
  private async assertEnrolledInLessonCourse(
    lessonId: string,
    userId: string,
  ): Promise<Lesson> {
    const lesson = await this.lessonsRepository.findOne({
      where: { id: lessonId },
    });
    if (!lesson) {
      throw new NotFoundException('Lesson not found');
    }
    if (!userId) {
      throw new ForbiddenException('Enrollment required');
    }
    const enrollment = await this.enrollmentsRepository.findOne({
      where: { courseId: lesson.courseId, userId },
    });
    if (!enrollment) {
      throw new ForbiddenException('Enrollment required');
    }
    return lesson;
  }

  async createNote(
    lessonId: string,
    userId: string,
    dto: CreateNoteDto,
  ): Promise<Note> {
    await this.assertEnrolledInLessonCourse(lessonId, userId);
    const note = this.notesRepository.create({
      lessonId,
      userId,
      content: dto.content,
      timestampSeconds: dto.timestampSeconds ?? 0,
    });
    return this.notesRepository.save(note);
  }

  async findNotesForLesson(lessonId: string, userId: string): Promise<Note[]> {
    await this.assertEnrolledInLessonCourse(lessonId, userId);
    return this.notesRepository.find({
      where: { lessonId, userId },
      order: { timestampSeconds: 'ASC', createdAt: 'ASC' },
    });
  }

  private async findOwnedNote(noteId: string, userId: string): Promise<Note> {
    const note = await this.notesRepository.findOne({
      where: { id: noteId },
    });
    if (!note) {
      throw new NotFoundException('Note not found');
    }
    if (note.userId !== userId) {
      throw new ForbiddenException('You do not own this note');
    }
    return note;
  }

  async updateNote(
    lessonId: string,
    noteId: string,
    userId: string,
    dto: UpdateNoteDto,
  ): Promise<Note> {
    const note = await this.findOwnedNote(noteId, userId);
    if (note.lessonId !== lessonId) {
      throw new NotFoundException('Note not found');
    }
    if (dto.content !== undefined) {
      note.content = dto.content;
    }
    if (dto.timestampSeconds !== undefined) {
      note.timestampSeconds = dto.timestampSeconds;
    }
    return this.notesRepository.save(note);
  }

  async removeNote(
    lessonId: string,
    noteId: string,
    userId: string,
  ): Promise<void> {
    const note = await this.findOwnedNote(noteId, userId);
    if (note.lessonId !== lessonId) {
      throw new NotFoundException('Note not found');
    }
    await this.notesRepository.delete(note.id);
  }

  /**
   * Export all of a user's notes for a course as a formatted PDF.
   * Notes are ordered by lesson order, then by timestamp within a lesson.
   */
  async exportCourseNotesPdf(
    courseId: string,
    userId: string,
  ): Promise<CourseNotesPdfResult> {
    const enrollment = await this.enrollmentsRepository.findOne({
      where: { courseId, userId },
    });
    if (!enrollment) {
      throw new ForbiddenException('Enrollment required');
    }

    const lessons = await this.lessonsRepository.find({
      where: { courseId },
      order: { order: 'ASC', createdAt: 'ASC' },
    });

    const lessonIds = lessons.map((lesson) => lesson.id);
    const notes = lessonIds.length
      ? await this.notesRepository.find({
          where: { userId, lessonId: In(lessonIds) },
          order: { timestampSeconds: 'ASC', createdAt: 'ASC' },
        })
      : [];

    const lessonOrder = new Map<string, number>();
    lessons.forEach((lesson, index) => lessonOrder.set(lesson.id, index));
    const lessonTitle = new Map<string, string>();
    lessons.forEach((lesson) => lessonTitle.set(lesson.id, lesson.title));

    const orderedNotes = [...notes].sort((a, b) => {
      const aOrder = lessonOrder.get(a.lessonId) ?? Number.MAX_SAFE_INTEGER;
      const bOrder = lessonOrder.get(b.lessonId) ?? Number.MAX_SAFE_INTEGER;
      if (aOrder !== bOrder) {
        return aOrder - bOrder;
      }
      if (a.timestampSeconds !== b.timestampSeconds) {
        return a.timestampSeconds - b.timestampSeconds;
      }
      return a.createdAt.getTime() - b.createdAt.getTime();
    });

    const buffer = this.renderNotesPdf(orderedNotes, lessonTitle);
    return {
      filename: `course-${courseId}-notes.pdf`,
      contentType: 'application/pdf',
      buffer,
    };
  }

  private renderNotesPdf(
    notes: Note[],
    lessonTitle: Map<string, string>,
  ): Buffer {
    const lines: string[] = [];
    lines.push('Course Notes');
    lines.push('');
    for (const note of notes) {
      const title = lessonTitle.get(note.lessonId) ?? 'Lesson';
      lines.push(`${title} - ${this.formatTimestamp(note.timestampSeconds)}`);
      lines.push(note.content);
      lines.push('');
    }
    if (notes.length === 0) {
      lines.push('No notes yet.');
    }
    return this.buildSimplePdf(lines);
  }

  private formatTimestamp(totalSeconds: number): string {
    const safe = Math.max(0, Math.floor(totalSeconds || 0));
    const hours = Math.floor(safe / 3600);
    const minutes = Math.floor((safe % 3600) / 60);
    const seconds = safe % 60;
    const pad = (value: number) => value.toString().padStart(2, '0');
    return hours > 0
      ? `${hours}:${pad(minutes)}:${pad(seconds)}`
      : `${minutes}:${pad(seconds)}`;
  }

  private escapePdfText(value: string): string {
    return value
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)')
      .replace(/[\r\n]+/g, ' ');
  }

  private buildSimplePdf(lines: string[]): Buffer {
    const contentLines = lines.map(
      (line) => `(${this.escapePdfText(line)}) Tj T*`,
    );
    const content = ['BT', '/F1 12 Tf', '14 TL', '50 780 Td', ...contentLines, 'ET'].join(
      '\n',
    );

    const objects: string[] = [];
    objects.push('<< /Type /Catalog /Pages 2 0 R >>');
    objects.push('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
    objects.push(
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    );
    objects.push(
      `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`,
    );
    objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

    let pdf = '%PDF-1.4\n';
    const offsets: number[] = [];
    objects.forEach((object, index) => {
      offsets.push(Buffer.byteLength(pdf, 'latin1'));
      pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    });
    const xrefOffset = Buffer.byteLength(pdf, 'latin1');
    pdf += `xref\n0 ${objects.length + 1}\n`;
    pdf += '0000000000 65535 f \n';
    offsets.forEach((offset) => {
      pdf += `${offset.toString().padStart(10, '0')} 00000 n \n`;
    });
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

    return Buffer.from(pdf, 'latin1');
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
  ): Promise<VideoStreamResult> {
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
