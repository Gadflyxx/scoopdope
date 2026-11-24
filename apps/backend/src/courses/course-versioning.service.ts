import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CourseVersion } from './course-version.entity';
import { Course } from './course.entity';

@Injectable()
export class CourseVersioningService {
  constructor(
    @InjectRepository(CourseVersion) private versionRepo: Repository<CourseVersion>,
    @InjectRepository(Course) private courseRepo: Repository<Course>,
  ) {}

  async createVersion(courseId: string, changeNote: string, createdById?: string): Promise<CourseVersion> {
    const course = await this.courseRepo.findOne({
      where: { id: courseId, isDeleted: false },
      relations: ['modules', 'modules.lessons'],
    });
    if (!course) throw new NotFoundException('Course not found');

    const count = await this.versionRepo.count({ where: { courseId } });
    const versionNumber = count + 1;
    const versionTag = `v${versionNumber}.0`;

    return this.versionRepo.save(
      this.versionRepo.create({
        courseId,
        versionNumber,
        versionTag,
        snapshot: course as unknown as Record<string, any>,
        changeNote,
        createdById,
      }),
    );
  }

  async publishNewVersion(courseId: string, changeNote: string, createdById?: string): Promise<CourseVersion> {
    const course = await this.courseRepo.findOne({
      where: { id: courseId, isDeleted: false },
      relations: ['modules', 'modules.lessons'],
    });
    if (!course) throw new NotFoundException('Course not found');

    const latest = await this.getLatestVersionNumber(courseId);
    const versionNumber = latest + 1;
    const versionTag = `v${versionNumber}.0`;

    const version = await this.versionRepo.save(
      this.versionRepo.create({
        courseId,
        versionNumber,
        versionTag,
        snapshot: course as unknown as Record<string, any>,
        changeNote,
        createdById,
      }),
    );

    await this.courseRepo.update(courseId, { version: versionNumber });

    return version;
  }

  async getLatestVersionNumber(courseId: string): Promise<number> {
    const latest = await this.versionRepo.findOne({
      where: { courseId },
      order: { versionNumber: 'DESC' },
    });
    return latest ? latest.versionNumber : 0;
  }

  async getLessonContentForVersion(
    courseId: string,
    lessonId: string,
    versionNumber: number,
  ): Promise<Record<string, any> | null> {
    const version = await this.versionRepo.findOne({
      where: { courseId, versionNumber },
    });

    if (!version) {
      const course = await this.courseRepo.findOne({
        where: { id: courseId, isDeleted: false },
        relations: ['modules', 'modules.lessons'],
      });
      if (!course) throw new NotFoundException('Course not found');
      return this.findLessonInSnapshot(course as unknown as Record<string, any>, lessonId);
    }

    return this.findLessonInSnapshot(version.snapshot, lessonId);
  }

  private findLessonInSnapshot(
    snapshot: Record<string, any>,
    lessonId: string,
  ): Record<string, any> | null {
    const modules = Array.isArray(snapshot?.modules) ? snapshot.modules : [];
    for (const module of modules) {
      const lessons = Array.isArray(module?.lessons) ? module.lessons : [];
      for (const lesson of lessons) {
        if (lesson?.id === lessonId) return lesson;
      }
    }
    return null;
  }

  async listVersions(courseId: string): Promise<CourseVersion[]> {
    return this.versionRepo.find({
      where: { courseId },
      order: { versionNumber: 'DESC' },
      select: ['id', 'courseId', 'versionTag', 'versionNumber', 'changeNote', 'createdAt', 'createdById'],
    });
  }

  async getVersion(courseId: string, versionId: string): Promise<CourseVersion> {
    const version = await this.versionRepo.findOne({ where: { id: versionId, courseId } });
    if (!version) throw new NotFoundException('Version not found');
    return version;
  }

  async diffVersions(courseId: string, fromId: string, toId: string) {
    const [from, to] = await Promise.all([
      this.getVersion(courseId, fromId),
      this.getVersion(courseId, toId),
    ]);

    return {
      from: { versionTag: from.versionTag, snapshot: from.snapshot },
      to: { versionTag: to.versionTag, snapshot: to.snapshot },
      changes: this.computeDiff(from.snapshot, to.snapshot),
    };
  }

  async rollback(courseId: string, versionId: string): Promise<Course> {
    const version = await this.getVersion(courseId, versionId);
    const { id, modules, reviews, createdAt, ...fields } = version.snapshot as any;

    await this.courseRepo.update(courseId, {
      title: fields.title,
      description: fields.description,
      level: fields.level,
      durationHours: fields.durationHours,
      isPublished: fields.isPublished,
    });

    const updated = await this.courseRepo.findOne({ where: { id: courseId } });
    if (!updated) throw new NotFoundException('Course not found after rollback');
    return updated;
  }

  private computeDiff(from: Record<string, any>, to: Record<string, any>): Record<string, any> {
    const changes: Record<string, any> = {};
    const keys = new Set([...Object.keys(from), ...Object.keys(to)]);
    for (const key of keys) {
      if (JSON.stringify(from[key]) !== JSON.stringify(to[key])) {
        changes[key] = { from: from[key], to: to[key] };
      }
    }
    return changes;
  }
}
