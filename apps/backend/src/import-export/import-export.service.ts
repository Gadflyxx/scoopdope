import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Course } from '../courses/course.entity';
import { CourseModule } from '../courses/course-module.entity';
import { Lesson } from '../courses/lesson.entity';
import { ImportJob, ImportJobStatus } from './import-job.entity';
import { CourseJsonExport, ImportFieldError } from './import-export.types';
import { ImportStrategy } from './strategies/import-strategy.interface';

interface ImportLessonInput {
  id?: string;
  title: string;
  content: string;
  videoUrl?: string;
  order: number;
  durationMinutes?: number;
  parentLessonId?: string;
}

interface ImportModuleInput {
  id?: string;
  title: string;
  order: number;
  lessons: ImportLessonInput[];
}

interface ImportCourseInput {
  id?: string;
  title: string;
  description?: string;
  level?: string;
  durationHours?: number;
  requiresKyc?: boolean;
  modules: ImportModuleInput[];
}

interface ImportPayload {
  version: string;
  courseId?: string;
  course: ImportCourseInput;
}

@Injectable()
export class ImportExportService {
  private readonly logger = new Logger(ImportExportService.name);

  constructor(
    @InjectRepository(Course) private readonly courseRepo: Repository<Course>,
    @InjectRepository(CourseModule) private readonly moduleRepo: Repository<CourseModule>,
    @InjectRepository(Lesson) private readonly lessonRepo: Repository<Lesson>,
    @InjectRepository(ImportJob) private readonly jobRepo: Repository<ImportJob>,
    @Inject('IMPORT_STRATEGIES') private readonly strategies: ImportStrategy[]
  ) {}

  // ─── Export ────────────────────────────────────────────────────────────────

  async exportCourse(courseId: string): Promise<CourseJsonExport> {
    const course = await this.courseRepo.findOne({
      where: { id: courseId, isDeleted: false },
      relations: ['modules', 'modules.lessons'],
    });
    if (!course) throw new NotFoundException('Course not found');

    return {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      courseId: course.id,
      course: {
        id: course.id,
        title: course.title,
        description: course.description,
        level: course.level,
        durationHours: course.durationHours,
        requiresKyc: course.requiresKyc,
        modules: (course.modules ?? [])
          .sort((a, b) => a.order - b.order)
          .map((m) => ({
            id: m.id,
            title: m.title,
            order: m.order,
            lessons: (m.lessons ?? [])
              .sort((a, b) => a.order - b.order)
              .map((l) => ({
                id: l.id,
                title: l.title,
                content: l.content,
                videoUrl: l.videoUrl ?? undefined,
                order: l.order,
                durationMinutes: l.durationMinutes,
                parentLessonId: (l as Lesson & { parentLessonId?: string }).parentLessonId,
              })),
          })),
      },
    };
  }

  async importJson(buffer: Buffer, instructorId: string): Promise<{ courseId: string }> {
    const payload = this.parseAndValidate(buffer);
    return this.applyImport(payload, instructorId);
  }

  async importCsv(buffer: Buffer, instructorId: string): Promise<{ courseId: string }> {
    return this.importWithStrategy(buffer, 'text/csv', instructorId);
  }

  async importScorm(buffer: Buffer, instructorId: string): Promise<{ courseId: string }> {
    return this.importWithStrategy(buffer, 'application/zip', instructorId);
  }

  async importScormFromPath(filePath: string, instructorId: string): Promise<{ courseId: string }> {
    const strategy = this.getStrategy('application/zip');
    if (!strategy.importFromPath) {
      throw new Error('SCORM strategy does not implement path-based import');
    }
    return strategy.importFromPath(filePath, instructorId);
  }

  async startBulkImport(
    buffers: { name: string; data: Buffer }[],
    instructorId: string
  ): Promise<ImportJob> {
    const job = await this.jobRepo.save(
      this.jobRepo.create({
        instructorId,
        status: ImportJobStatus.PENDING,
        total: buffers.length,
        processed: 0,
      })
    );

    this.processBulk(job.id, buffers, instructorId).catch((err) =>
      this.logger.error(`Bulk import job ${job.id} failed: ${err}`)
    );

    return job;
  }

  async getJobStatus(jobId: string): Promise<ImportJob> {
    const job = await this.jobRepo.findOne({ where: { id: jobId } });
    if (!job) throw new NotFoundException('Import job not found');
    return job;
  }

  private async importWithStrategy(
    buffer: Buffer,
    mimeType: string,
    instructorId: string
  ): Promise<{ courseId: string }> {
    if (mimeType === 'application/json') {
      return this.importJson(buffer, instructorId);
    }
    const strategy = this.getStrategy(mimeType);
    return strategy.import(buffer, instructorId);
  }

  // ─── JSON parsing & validation ─────────────────────────────────────────────

  private parseAndValidate(buffer: Buffer): ImportPayload {
    let raw: unknown;
    try {
      raw = JSON.parse(buffer.toString('utf8'));
    } catch {
      throw new BadRequestException({
        message: 'Invalid JSON',
        errors: [{ field: '$', message: 'Payload is not valid JSON' }],
      });
    }

    const errors: ImportFieldError[] = [];
    const payload = this.validatePayload(raw, errors);
    if (errors.length > 0) {
      throw new BadRequestException({ message: 'Import validation failed', errors });
    }
    return payload as ImportPayload;
  }

  private validatePayload(raw: unknown, errors: ImportFieldError[]): ImportPayload | null {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      errors.push({ field: '$', message: 'Payload must be an object' });
      return null;
    }
    const root = raw as Record<string, unknown>;

    if (typeof root.version !== 'string' || root.version.length === 0) {
      errors.push({ field: 'version', message: 'version is required and must be a string' });
    }
    if (root.courseId !== undefined && typeof root.courseId !== 'string') {
      errors.push({ field: 'courseId', message: 'courseId must be a string' });
    }

    const course = root.course;
    if (typeof course !== 'object' || course === null || Array.isArray(course)) {
      errors.push({ field: 'course', message: 'course is required and must be an object' });
      return null;
    }
    const c = course as Record<string, unknown>;

    if (typeof c.title !== 'string' || c.title.trim().length === 0) {
      errors.push({ field: 'course.title', message: 'title is required and must be a non-empty string' });
    }
    if (c.description !== undefined && typeof c.description !== 'string') {
      errors.push({ field: 'course.description', message: 'description must be a string' });
    }
    if (c.level !== undefined && typeof c.level !== 'string') {
      errors.push({ field: 'course.level', message: 'level must be a string' });
    }
    if (c.durationHours !== undefined && typeof c.durationHours !== 'number') {
      errors.push({ field: 'course.durationHours', message: 'durationHours must be a number' });
    }
    if (c.requiresKyc !== undefined && typeof c.requiresKyc !== 'boolean') {
      errors.push({ field: 'course.requiresKyc', message: 'requiresKyc must be a boolean' });
    }

    if (!Array.isArray(c.modules)) {
      errors.push({ field: 'course.modules', message: 'modules is required and must be an array' });
      return null;
    }

    const modules: ImportModuleInput[] = [];
    c.modules.forEach((mod, mi) => {
      const base = `course.modules[${mi}]`;
      if (typeof mod !== 'object' || mod === null || Array.isArray(mod)) {
        errors.push({ field: base, message: 'module must be an object' });
        return;
      }
      const m = mod as Record<string, unknown>;
      if (typeof m.title !== 'string' || m.title.trim().length === 0) {
        errors.push({ field: `${base}.title`, message: 'title is required and must be a non-empty string' });
      }
      if (typeof m.order !== 'number') {
        errors.push({ field: `${base}.order`, message: 'order is required and must be a number' });
      }
      if (m.id !== undefined && typeof m.id !== 'string') {
        errors.push({ field: `${base}.id`, message: 'id must be a string' });
      }

      const lessons: ImportLessonInput[] = [];
      if (!Array.isArray(m.lessons)) {
        errors.push({ field: `${base}.lessons`, message: 'lessons is required and must be an array' });
      } else {
        m.lessons.forEach((les, li) => {
          const lBase = `${base}.lessons[${li}]`;
          if (typeof les !== 'object' || les === null || Array.isArray(les)) {
            errors.push({ field: lBase, message: 'lesson must be an object' });
            return;
          }
          const l = les as Record<string, unknown>;
          if (typeof l.title !== 'string' || l.title.trim().length === 0) {
            errors.push({ field: `${lBase}.title`, message: 'title is required and must be a non-empty string' });
          }
          if (typeof l.content !== 'string') {
            errors.push({ field: `${lBase}.content`, message: 'content is required and must be a string' });
          }
          if (typeof l.order !== 'number') {
            errors.push({ field: `${lBase}.order`, message: 'order is required and must be a number' });
          }
          if (l.videoUrl !== undefined && typeof l.videoUrl !== 'string') {
            errors.push({ field: `${lBase}.videoUrl`, message: 'videoUrl must be a string' });
          }
          if (l.durationMinutes !== undefined && typeof l.durationMinutes !== 'number') {
            errors.push({ field: `${lBase}.durationMinutes`, message: 'durationMinutes must be a number' });
          }
          if (l.parentLessonId !== undefined && typeof l.parentLessonId !== 'string') {
            errors.push({ field: `${lBase}.parentLessonId`, message: 'parentLessonId must be a string' });
          }
          if (l.id !== undefined && typeof l.id !== 'string') {
            errors.push({ field: `${lBase}.id`, message: 'id must be a string' });
          }
          lessons.push({
            id: l.id as string | undefined,
            title: l.title as string,
            content: l.content as string,
            videoUrl: l.videoUrl as string | undefined,
            order: l.order as number,
            durationMinutes: l.durationMinutes as number | undefined,
            parentLessonId: l.parentLessonId as string | undefined,
          });
        });
      }

      modules.push({
        id: m.id as string | undefined,
        title: m.title as string,
        order: m.order as number,
        lessons,
      });
    });

    this.detectCircularLessonRefs(modules, errors);

    return {
      version: root.version as string,
      courseId: root.courseId as string | undefined,
      course: {
        id: c.id as string | undefined,
        title: c.title as string,
        description: c.description as string | undefined,
        level: c.level as string | undefined,
        durationHours: c.durationHours as number | undefined,
        requiresKyc: c.requiresKyc as boolean | undefined,
        modules,
      },
    };
  }

  private detectCircularLessonRefs(modules: ImportModuleInput[], errors: ImportFieldError[]): void {
    const parentOf = new Map<string, string>();
    modules.forEach((mod, mi) => {
      mod.lessons.forEach((lesson, li) => {
        if (!lesson.id || !lesson.parentLessonId) return;
        if (lesson.id === lesson.parentLessonId) {
          errors.push({
            field: `course.modules[${mi}].lessons[${li}].parentLessonId`,
            message: 'lesson cannot reference itself as parent',
          });
          return;
        }
        parentOf.set(lesson.id, lesson.parentLessonId);
      });
    });

    for (const start of parentOf.keys()) {
      const seen = new Set<string>();
      let current: string | undefined = start;
      while (current) {
        if (seen.has(current)) {
          errors.push({
            field: 'course.modules',
            message: `circular lesson reference detected involving lesson "${start}"`,
          });
          break;
        }
        seen.add(current);
        current = parentOf.get(current);
      }
    }
  }

  // ─── Apply import (create or idempotent update) ────────────────────────────

  private async applyImport(
    payload: ImportPayload,
    instructorId: string
  ): Promise<{ courseId: string }> {
    const existing = await this.findExistingCourse(payload, instructorId);

    if (existing) {
      await this.updateExistingCourse(existing, payload);
      return { courseId: existing.id };
    }

    const course = await this.courseRepo.save(
      this.courseRepo.create({
        title: payload.course.title,
        description: payload.course.description,
        level: payload.course.level,
        durationHours: payload.course.durationHours,
        requiresKyc: payload.course.requiresKyc ?? false,
        instructorId,
      } as Partial<Course>)
    );

    await this.persistModules(course.id, payload.course.modules);
    return { courseId: course.id };
  }

  private async findExistingCourse(
    payload: ImportPayload,
    instructorId: string
  ): Promise<Course | null> {
    const targetId = payload.courseId ?? payload.course.id;
    if (targetId) {
      const byId = await this.courseRepo.findOne({
        where: { id: targetId, isDeleted: false },
      });
      if (byId) return byId;
    }
    return this.courseRepo.findOne({
      where: { title: payload.course.title, instructorId, isDeleted: false },
    });
  }

  private async updateExistingCourse(course: Course, payload: ImportPayload): Promise<void> {
    await this.courseRepo.update(course.id, {
      title: payload.course.title,
      description: payload.course.description,
      level: payload.course.level,
      durationHours: payload.course.durationHours,
      requiresKyc: payload.course.requiresKyc ?? course.requiresKyc,
    });

    const existingModules = await this.moduleRepo.find({ where: { courseId: course.id } });
    if (existingModules.length > 0) {
      await this.moduleRepo.delete(existingModules.map((m) => m.id));
    }

    await this.persistModules(course.id, payload.course.modules);
  }

  private async persistModules(courseId: string, modules: ImportModuleInput[]): Promise<void> {
    for (const mod of modules) {
      const savedModule = await this.moduleRepo.save(
        this.moduleRepo.create({
          courseId,
          title: mod.title,
          order: mod.order,
        } as Partial<CourseModule>)
      );

      for (const lesson of mod.lessons) {
        await this.lessonRepo.save(
          this.lessonRepo.create({
            moduleId: savedModule.id,
            title: lesson.title,
            content: lesson.content,
            videoUrl: lesson.videoUrl,
            order: lesson.order,
            durationMinutes: lesson.durationMinutes,
            parentLessonId: lesson.parentLessonId,
          } as Partial<Lesson>)
        );
      }
    }
  }

  private getStrategy(mimeType: string): ImportStrategy {
    const strategy = this.strategies.find((candidate) => candidate.canHandle(mimeType));
    if (!strategy) throw new BadRequestException(`Unsupported import format: ${mimeType}`);
    return strategy;
  }

  private async processBulk(
    jobId: string,
    buffers: { name: string; data: Buffer }[],
    instructorId: string
  ) {
    await this.jobRepo.update(jobId, { status: ImportJobStatus.PROCESSING });
    const results: Record<string, unknown> = {};
    let processed = 0;

    for (const { name, data } of buffers) {
      try {
        const mimeType = this.resolveMimeType(name);
        const res = await this.importWithStrategy(data, mimeType, instructorId);
        results[name] = { success: true, courseId: res.courseId };
      } catch (err: unknown) {
        results[name] = { success: false, error: err instanceof Error ? err.message : String(err) };
      }
      processed++;
      await this.jobRepo.update(jobId, { processed });
    }

    await this.jobRepo
      .createQueryBuilder()
      .update(ImportJob)
      .set({ status: ImportJobStatus.DONE, result: () => `:result` })
      .where('id = :id', { id: jobId })
      .setParameter('result', JSON.stringify(results))
      .execute();
  }

  private resolveMimeType(fileName: string): string {
    const normalized = fileName.toLowerCase();
    if (normalized.endsWith('.zip')) return 'application/zip';
    if (normalized.endsWith('.csv')) return 'text/csv';
    return 'application/json';
  }
}
