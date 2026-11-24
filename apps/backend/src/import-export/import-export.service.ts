import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Repository } from 'typeorm';
import { Course } from '../courses/course.entity';
import { CourseModule } from '../courses/course-module.entity';
import { Lesson } from '../courses/lesson.entity';
import { ImportJob, ImportJobStatus } from './import-job.entity';
import { DataExportJob, DataExportJobStatus } from './data-export-job.entity';
import { CourseJsonExport } from './import-export.types';
import { ImportStrategy } from './strategies/import-strategy.interface';

/** Minimum interval between two data export requests for the same user. */
export const DATA_EXPORT_RATE_LIMIT_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
/** How long an export archive (and its signed link) stays valid. */
export const DATA_EXPORT_TTL_MS = 48 * 60 * 60 * 1000; // 48 hours

export interface DataExportGatherer {
  /** Returns the JSON-serialisable payload for a single data category. */
  gather(userId: string): Promise<unknown>;
}

export interface DataExportArchiveStore {
  /** Persists the archive and returns a storage key. */
  save(key: string, data: Buffer): Promise<void>;
  /** Removes a previously stored archive. */
  remove(key: string): Promise<void>;
}

export interface DataExportNotifier {
  /** Emails the signed download link to the user. */
  sendDownloadLink(userId: string, email: string, downloadUrl: string): Promise<void>;
}

export interface DataExportUrlSigner {
  /** Produces a signed, expiring download URL for the given storage key. */
  sign(key: string, expiresAt: Date): string;
}

@Injectable()
export class ImportExportService {
  private readonly logger = new Logger(ImportExportService.name);

  constructor(
    @InjectRepository(Course) private readonly courseRepo: Repository<Course>,
    @InjectRepository(CourseModule) private readonly moduleRepo: Repository<CourseModule>,
    @InjectRepository(Lesson) private readonly lessonRepo: Repository<Lesson>,
    @InjectRepository(ImportJob) private readonly jobRepo: Repository<ImportJob>,
    @InjectRepository(DataExportJob) private readonly exportJobRepo: Repository<DataExportJob>,
    @Inject('IMPORT_STRATEGIES') private readonly strategies: ImportStrategy[],
    @Inject('DATA_EXPORT_GATHERERS')
    private readonly exportGatherers: Record<string, DataExportGatherer>,
    @Inject('DATA_EXPORT_ARCHIVE_STORE')
    private readonly archiveStore: DataExportArchiveStore,
    @Inject('DATA_EXPORT_NOTIFIER')
    private readonly exportNotifier: DataExportNotifier,
    @Inject('DATA_EXPORT_URL_SIGNER')
    private readonly urlSigner: DataExportUrlSigner
  ) {}

  // ─── GDPR Data Export ──────────────────────────────────────────────────────

  /**
   * Queues a GDPR Article 20 data export for the given user.
   * Rate-limited to one request per 30 days.
   */
  async requestExport(userId: string, email: string): Promise<DataExportJob> {
    const lastRequest = await this.exportJobRepo.findOne({
      where: { userId },
      order: { requestedAt: 'DESC' },
    });

    if (lastRequest && Date.now() - lastRequest.requestedAt.getTime() < DATA_EXPORT_RATE_LIMIT_MS) {
      throw new BadRequestException(
        'A data export was requested recently. You may request another after 30 days.'
      );
    }

    const job = await this.exportJobRepo.save(
      this.exportJobRepo.create({
        userId,
        email,
        status: DataExportJobStatus.PENDING,
        requestedAt: new Date(),
      })
    );

    this.processExport(job.id, userId, email).catch((err) =>
      this.logger.error(`Data export job ${job.id} failed: ${err}`)
    );

    return job;
  }

  async getExportStatus(jobId: string, userId: string): Promise<DataExportJob> {
    const job = await this.exportJobRepo.findOne({ where: { id: jobId, userId } });
    if (!job) throw new NotFoundException('Data export job not found');
    return job;
  }

  private async processExport(jobId: string, userId: string, email: string): Promise<void> {
    await this.exportJobRepo.update(jobId, { status: DataExportJobStatus.PROCESSING });

    try {
      const files = await this.gatherExportFiles(userId);
      const archive = await this.buildZip(files);

      const storageKey = `data-exports/${userId}/${jobId}.zip`;
      await this.archiveStore.save(storageKey, archive);

      const expiresAt = new Date(Date.now() + DATA_EXPORT_TTL_MS);
      const downloadUrl = this.urlSigner.sign(storageKey, expiresAt);

      await this.exportJobRepo.update(jobId, {
        status: DataExportJobStatus.READY,
        storageKey,
        expiresAt,
        completedAt: new Date(),
      });

      await this.exportNotifier.sendDownloadLink(userId, email, downloadUrl);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Data export job ${jobId} failed: ${message}`);
      await this.exportJobRepo.update(jobId, {
        status: DataExportJobStatus.FAILED,
        error: message,
      });
    }
  }

  private async gatherExportFiles(userId: string): Promise<Record<string, unknown>> {
    const files: Record<string, unknown> = {};
    for (const [category, gatherer] of Object.entries(this.exportGatherers)) {
      files[`${category}.json`] = await gatherer.gather(userId);
    }
    return files;
  }

  private async buildZip(files: Record<string, unknown>): Promise<Buffer> {
    // Minimal ZIP writer (stored, no compression) to avoid extra dependencies.
    const entries: { name: Buffer; data: Buffer }[] = Object.entries(files).map(
      ([name, payload]) => ({
        name: Buffer.from(name, 'utf8'),
        data: Buffer.from(JSON.stringify(payload, null, 2), 'utf8'),
      })
    );

    const localParts: Buffer[] = [];
    const centralParts: Buffer[] = [];
    let offset = 0;

    for (const entry of entries) {
      const crc = this.crc32(entry.data);
      const local = Buffer.alloc(30);
      local.writeUInt32LE(0x04034b50, 0);
      local.writeUInt16LE(20, 4);
      local.writeUInt16LE(0, 6);
      local.writeUInt16LE(0, 8);
      local.writeUInt16LE(0, 10);
      local.writeUInt16LE(0, 12);
      local.writeUInt32LE(crc, 14);
      local.writeUInt32LE(entry.data.length, 18);
      local.writeUInt32LE(entry.data.length, 22);
      local.writeUInt16LE(entry.name.length, 26);
      local.writeUInt16LE(0, 28);
      localParts.push(local, entry.name, entry.data);

      const central = Buffer.alloc(46);
      central.writeUInt32LE(0x02014b50, 0);
      central.writeUInt16LE(20, 4);
      central.writeUInt16LE(20, 6);
      central.writeUInt16LE(0, 8);
      central.writeUInt16LE(0, 10);
      central.writeUInt16LE(0, 12);
      central.writeUInt16LE(0, 14);
      central.writeUInt32LE(crc, 16);
      central.writeUInt32LE(entry.data.length, 20);
      central.writeUInt32LE(entry.data.length, 24);
      central.writeUInt16LE(entry.name.length, 28);
      central.writeUInt16LE(0, 30);
      central.writeUInt16LE(0, 32);
      central.writeUInt16LE(0, 34);
      central.writeUInt16LE(0, 36);
      central.writeUInt32LE(0, 38);
      central.writeUInt32LE(offset, 42);
      centralParts.push(central, entry.name);

      offset += local.length + entry.name.length + entry.data.length;
    }

    const centralDir = Buffer.concat(centralParts);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(0, 4);
    end.writeUInt16LE(0, 6);
    end.writeUInt16LE(entries.length, 8);
    end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(centralDir.length, 12);
    end.writeUInt32LE(offset, 16);
    end.writeUInt16LE(0, 20);

    return Buffer.concat([...localParts, centralDir, end]);
  }

  private crc32(data: Buffer): number {
    let crc = 0xffffffff;
    for (let i = 0; i < data.length; i++) {
      crc ^= data[i];
      for (let j = 0; j < 8; j++) {
        crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
      }
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  /**
   * Deletes export archives whose 48-hour retention window has elapsed.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async cleanupExpiredExports(): Promise<void> {
    const expired = await this.exportJobRepo
      .createQueryBuilder('job')
      .where('job.expiresAt IS NOT NULL')
      .andWhere('job.expiresAt <= :now', { now: new Date() })
      .andWhere('job.storageKey IS NOT NULL')
      .getMany();

    for (const job of expired) {
      try {
        if (job.storageKey) await this.archiveStore.remove(job.storageKey);
        await this.exportJobRepo.update(job.id, {
          status: DataExportJobStatus.EXPIRED,
          storageKey: null,
        });
      } catch (err: unknown) {
        this.logger.error(
          `Failed to clean up data export ${job.id}: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      }
    }
  }

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
