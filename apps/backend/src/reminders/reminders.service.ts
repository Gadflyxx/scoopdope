import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('reminder_sends')
@Index(['userId', 'courseId'])
export class ReminderSend {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'uuid' })
  courseId: string;

  @CreateDateColumn({ type: 'timestamptz' })
  sentAt: Date;
}

export interface InactivityReminderPayload {
  userId: string;
  courseId: string;
  courseName: string;
  progressPercentage: number;
  lastActivityAt: Date | null;
}

export interface EnrollmentRecord {
  id: string;
  userId: string;
  courseId: string;
  courseName: string;
  completed: boolean;
  progressPercentage: number;
  lastActivityAt: Date | null;
}

export interface ReminderSendRecord {
  userId: string;
  courseId: string;
  sentAt: Date;
}

export interface RemindersRepository {
  findActiveEnrollments(): Promise<EnrollmentRecord[]>;
  findRecentReminderSends(since: Date): Promise<ReminderSendRecord[]>;
  recordReminderSend(userId: string, courseId: string, sentAt: Date): Promise<void>;
}

export const REMINDERS_REPOSITORY = 'REMINDERS_REPOSITORY';

export const INACTIVITY_THRESHOLD_DAYS = 7;
export const SUPPRESSION_WINDOW_DAYS = 7;

@Injectable()
export class RemindersService {
  private readonly logger = new Logger(RemindersService.name);

  constructor(
    private readonly repository: RemindersRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_9AM, { name: 'inactivity-reminders' })
  async handleDailyInactivityReminders(): Promise<void> {
    await this.sendInactivityReminders();
  }

  async sendInactivityReminders(now: Date = new Date()): Promise<InactivityReminderPayload[]> {
    const inactivityCutoff = new Date(
      now.getTime() - INACTIVITY_THRESHOLD_DAYS * 24 * 60 * 60 * 1000,
    );
    const suppressionCutoff = new Date(
      now.getTime() - SUPPRESSION_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    );

    const [enrollments, recentSends] = await Promise.all([
      this.repository.findActiveEnrollments(),
      this.repository.findRecentReminderSends(suppressionCutoff),
    ]);

    const recentlyReminded = new Set(
      recentSends.map((send) => this.reminderKey(send.userId, send.courseId)),
    );

    const sent: InactivityReminderPayload[] = [];

    for (const enrollment of enrollments) {
      if (enrollment.completed) {
        continue;
      }

      if (!this.isInactive(enrollment.lastActivityAt, inactivityCutoff)) {
        continue;
      }

      const key = this.reminderKey(enrollment.userId, enrollment.courseId);
      if (recentlyReminded.has(key)) {
        continue;
      }

      const payload: InactivityReminderPayload = {
        userId: enrollment.userId,
        courseId: enrollment.courseId,
        courseName: enrollment.courseName,
        progressPercentage: enrollment.progressPercentage,
        lastActivityAt: enrollment.lastActivityAt,
      };

      try {
        await this.repository.recordReminderSend(
          enrollment.userId,
          enrollment.courseId,
          now,
        );
        this.eventEmitter.emit('reminder.inactivity', payload);
        recentlyReminded.add(key);
        sent.push(payload);
      } catch (error) {
        this.logger.error(
          `Failed to send inactivity reminder for user ${enrollment.userId} on course ${enrollment.courseId}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }

    this.logger.log(`Sent ${sent.length} inactivity reminder(s)`);
    return sent;
  }

  private isInactive(lastActivityAt: Date | null, cutoff: Date): boolean {
    if (!lastActivityAt) {
      return true;
    }
    return lastActivityAt.getTime() <= cutoff.getTime();
  }

  private reminderKey(userId: string, courseId: string): string {
    return `${userId}:${courseId}`;
  }
}