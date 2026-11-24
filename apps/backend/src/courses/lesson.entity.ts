import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { CourseModule } from './course-module.entity';
import { Assignment } from '../assignments/assignment.entity';

@Entity('lessons')
export class Lesson {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  moduleId: string;

  // Why: deleting a module removes all its lessons to prevent orphan content.
  @ManyToOne(() => CourseModule, (m) => m.lessons, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'moduleId' })
  module: CourseModule;

  @Column()
  title: string;

  @Column('text')
  content: string;

  @Column({ nullable: true })
  videoUrl: string;

  @Column({ type: 'jsonb', nullable: true })
  transcript: any;

  @Column({ type: 'text', nullable: true })
  transcriptSrt: string;

  @Column({ nullable: true })
  transcriptionJobName: string;

  @Column({ default: 0 })
  order: number;

  // Why: persists the effective global lesson order across modules so that
  // reordering modules can recompute sequential navigation indices.
  @Column({ type: 'int', default: 0 })
  globalOrder: number;

  @Column({ default: 0 })
  durationMinutes: number;

  @Column({ type: 'jsonb', nullable: true })
  learningObjectives?: string[];

  // Why: generated tsvector over title and content enables full-text search
  // and ts_rank scoring so keywords appearing only in the lesson body are
  // discoverable. The GIN index keeps those queries fast.
  @Index('IDX_lessons_search_vector', { synchronize: false })
  @Column({
    type: 'tsvector',
    nullable: true,
    select: false,
    asExpression: `setweight(to_tsvector('english', coalesce(title, '')), 'A') || setweight(to_tsvector('english', coalesce(content, '')), 'B')`,
    generatedType: 'STORED',
  })
  searchVector: string;

  // Why: deleting a lesson removes its assignments to prevent orphan records.
  @OneToMany(() => Assignment, (assignment) => assignment.lesson, {
    cascade: ['remove'],
  })
  assignments: Assignment[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}