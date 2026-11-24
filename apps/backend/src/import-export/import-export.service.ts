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
      course: {
        title: course.title,
        description: course.description,
        level: course.level,
        durationHours: course.durationHours,
        requiresKyc: course.requiresKyc,
        modules: (course.modules ?? [])
          .sort((a, b) => a.order - b.order)
          .map((m) => ({
            title: m.title,
            order: m.order,
            lessons: (m.lessons ?? [])
              .sort((a, b) => a.order - b.order)
              .map((l) => ({
                title: l.title,
                content: l.content,
                videoUrl: l.videoUrl ?? undefined,
                order: l.order,
                durationMinutes: l.durationMinutes,
              })),
          })),
      },
    };
  }

  async importJson(buffer: Buffer, instructorId: string): Promise<{ courseId: string }> {
    return this.importWithStrategy(buffer, 'application/json', instructorId);
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
    const strategy = this.getStrategy(mimeType);
    return strategy.import(buffer, instructorId);
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
