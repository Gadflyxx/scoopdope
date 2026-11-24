import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../users/user.entity';
import { Course } from '../courses/course.entity';
import { Lesson } from '../lessons/lesson.entity';

export enum DownloadStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

@Entity('download_items')
export class DownloadItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  // Why: download records belong to a user; deleting the user removes their download history.
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  courseId: string;

  // Why: if a course is deleted, the download records for it have no context and should be cleaned up.
  @ManyToOne(() => Course, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'courseId' })
  course: Course;

  @Column({ nullable: true })
  lessonId: string;

  @Column({ nullable: true })
  lessonTitle: string;

  @Column({ nullable: true })
  fileUrl: string;

  @Column({ type: 'bigint', default: 0 })
  fileSizeBytes: number;

  @Column({ type: 'enum', enum: DownloadStatus, default: DownloadStatus.PENDING })
  status: DownloadStatus;

  @CreateDateColumn()
  createdAt: Date;
}

@Entity('lesson_resources')
export class LessonResource {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  lessonId: string;

  // Why: resources are attachments of a lesson; deleting the lesson removes its resources.
  @ManyToOne(() => Lesson, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'lessonId' })
  lesson: Lesson;

  @Column()
  filename: string;

  @Column()
  storageKey: string;

  @Column({ type: 'bigint', default: 0 })
  sizeBytes: number;

  @Column()
  mimeType: string;

  @CreateDateColumn()
  createdAt: Date;
}