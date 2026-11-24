import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DownloadItem, DownloadStatus } from './download-item.entity';
import { LessonResource } from './lesson-resource.entity';
import { Enrollment } from '../enrollments/enrollment.entity';
import { Lesson } from '../lessons/lesson.entity';
import { StorageService } from '../storage/storage.service';

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/zip',
  'application/x-zip-compressed',
  'text/plain',
  'text/csv',
  'text/markdown',
];

const MAX_RESOURCE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB
const DOWNLOAD_URL_TTL_SECONDS = 60 * 60; // 1 hour

export interface UploadedResourceFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@Injectable()
export class DownloadsService {
  constructor(
    @InjectRepository(DownloadItem) private repo: Repository<DownloadItem>,
    @InjectRepository(LessonResource)
    private resourceRepo: Repository<LessonResource>,
    @InjectRepository(Lesson) private lessonRepo: Repository<Lesson>,
    @InjectRepository(Enrollment)
    private enrollmentRepo: Repository<Enrollment>,
    private storageService: StorageService,
  ) {}

  async assertCanDownload(
    userId: string,
    role: string,
    courseId: string,
  ): Promise<void> {
    if (role === 'admin' || role === 'instructor') {
      return;
    }
    const enrollment = await this.enrollmentRepo.findOne({
      where: { userId, courseId },
    });
    if (!enrollment) {
      throw new ForbiddenException(
        'You must be enrolled in this course to download its materials',
      );
    }
  }

  async queueDownload(
    userId: string,
    role: string,
    courseId: string,
    lessonId?: string,
    lessonTitle?: string,
    fileUrl?: string,
    fileSizeBytes?: number,
  ): Promise<DownloadItem> {
    await this.assertCanDownload(userId, role, courseId);
    const item = this.repo.create({
      userId,
      courseId,
      lessonId,
      lessonTitle,
      fileUrl,
      fileSizeBytes: fileSizeBytes ?? 0,
      status: DownloadStatus.PENDING,
    });
    return this.repo.save(item);
  }

  async findByUser(userId: string): Promise<DownloadItem[]> {
    return this.repo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async markCompleted(id: string, userId: string): Promise<DownloadItem> {
    const item = await this.repo.findOne({ where: { id, userId } });
    if (!item) throw new NotFoundException('Download not found');
    item.status = DownloadStatus.COMPLETED;
    return this.repo.save(item);
  }

  async remove(id: string, userId: string): Promise<void> {
    const item = await this.repo.findOne({ where: { id, userId } });
    if (!item) throw new NotFoundException('Download not found');
    await this.repo.remove(item);
  }

  async getStorageStats(userId: string): Promise<{ totalBytes: number; count: number }> {
    const items = await this.repo.find({ where: { userId, status: DownloadStatus.COMPLETED } });
    const totalBytes = items.reduce((sum, i) => sum + Number(i.fileSizeBytes), 0);
    return { totalBytes, count: items.length };
  }

  private async getLessonOrThrow(lessonId: string): Promise<Lesson> {
    const lesson = await this.lessonRepo.findOne({ where: { id: lessonId } });
    if (!lesson) throw new NotFoundException('Lesson not found');
    return lesson;
  }

  async uploadResource(
    lessonId: string,
    instructorId: string,
    file: UploadedResourceFile,
  ): Promise<LessonResource> {
    const lesson = await this.getLessonOrThrow(lessonId);

    if (lesson.course?.instructorId !== instructorId) {
      throw new ForbiddenException(
        'You can only add resources to lessons in your own courses',
      );
    }

    if (!file || !file.buffer || file.size === 0) {
      throw new BadRequestException('A file is required');
    }
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(
        `Unsupported file type: ${file.mimetype}. Allowed types: PDF, ZIP, plain text`,
      );
    }
    if (file.size > MAX_RESOURCE_SIZE_BYTES) {
      throw new BadRequestException(
        `File exceeds the maximum size of ${MAX_RESOURCE_SIZE_BYTES} bytes`,
      );
    }

    const storageKey = await this.storageService.upload(
      file.buffer,
      file.originalname,
      file.mimetype,
    );

    const resource = this.resourceRepo.create({
      lessonId,
      filename: file.originalname,
      storageKey,
      sizeBytes: file.size,
      mimeType: file.mimetype,
    });
    return this.resourceRepo.save(resource);
  }

  async listResources(lessonId: string): Promise<LessonResource[]> {
    return this.resourceRepo.find({
      where: { lessonId },
      order: { createdAt: 'ASC' },
    });
  }

  async getDownloadUrl(
    lessonId: string,
    resourceId: string,
    userId: string,
    role: string,
  ): Promise<{ url: string; expiresAt: Date }> {
    const lesson = await this.getLessonOrThrow(lessonId);

    const resource = await this.resourceRepo.findOne({
      where: { id: resourceId, lessonId },
    });
    if (!resource) throw new NotFoundException('Resource not found');

    await this.assertCanDownload(userId, role, lesson.courseId);

    const url = await this.storageService.getSignedUrl(
      resource.storageKey,
      DOWNLOAD_URL_TTL_SECONDS,
    );
    const expiresAt = new Date(Date.now() + DOWNLOAD_URL_TTL_SECONDS * 1000);
    return { url, expiresAt };
  }
}
