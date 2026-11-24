import {
  Controller,
  Get,
  Injectable,
  Logger,
  Module,
  NotFoundException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

/**
 * Streaks & Engagement Gamification (#1350)
 *
 * This file wires the streaks module to the learner dashboard by exposing
 * `GET /v1/users/me/streak`. It also contains the streak service logic that:
 *  - increments the streak once per calendar day on any learning activity,
 *  - tracks the longest streak,
 *  - lazily resets the streak after 24h of inactivity and emits a
 *    `streak.reset` notification.
 *
 * NOTE: The persistence layer is abstracted behind `StreakRepository` so the
 * controller/service can be unit-tested without a database. A concrete
 * repository implementation should be provided in the module wiring.
 */

export interface StreakRecord {
  userId: string;
  currentStreak: number;
  longestStreak: number;
  lastActivityDate: Date | null;
}

export interface StreakResponse {
  current_streak: number;
  longest_streak: number;
  last_activity_date: string | null;
}

/**
 * Minimal repository contract. Implementations may back this with Prisma,
 * TypeORM, etc.
 */
export abstract class StreakRepository {
  abstract findByUserId(userId: string): Promise<StreakRecord | null>;
  abstract upsert(record: StreakRecord): Promise<StreakRecord>;
}

/**
 * Notification emitter contract. The concrete implementation is expected to
 * persist and/or push a notification to the learner.
 */
export abstract class NotificationEmitter {
  abstract emit(userId: string, type: string, payload: Record<string, unknown>): Promise<void>;
}

const HOURS_24_MS = 24 * 60 * 60 * 1000;

function startOfUtcDay(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function isSameUtcDay(a: Date, b: Date): boolean {
  return startOfUtcDay(a) === startOfUtcDay(b);
}

function isConsecutiveUtcDay(previous: Date, current: Date): boolean {
  const dayMs = 24 * 60 * 60 * 1000;
  return startOfUtcDay(current) - startOfUtcDay(previous) === dayMs;
}

@Injectable()
export class StreaksService {
  private readonly logger = new Logger(StreaksService.name);

  constructor(
    private readonly repository: StreakRepository,
    private readonly notifications: NotificationEmitter,
  ) {}

  /**
   * Records a learning activity for the user. Increments the streak at most
   * once per calendar day (UTC). Also lazily resets the streak if the user has
   * been inactive for more than 24 hours before recording the new activity.
   */
  async recordActivity(userId: string, now: Date = new Date()): Promise<StreakRecord> {
    const existing = await this.repository.findByUserId(userId);

    if (!existing) {
      const created: StreakRecord = {
        userId,
        currentStreak: 1,
        longestStreak: 1,
        lastActivityDate: now,
      };
      return this.repository.upsert(created);
    }

    // Lazily reset if the streak has already lapsed before this activity.
    const resetRecord = await this.maybeReset(existing, now);
    const base = resetRecord ?? existing;

    if (!base.lastActivityDate) {
      const updated: StreakRecord = {
        ...base,
        currentStreak: 1,
        longestStreak: Math.max(base.longestStreak, 1),
        lastActivityDate: now,
      };
      return this.repository.upsert(updated);
    }

    // Already counted today: do not increment again.
    if (isSameUtcDay(base.lastActivityDate, now)) {
      return base;
    }

    let nextStreak: number;
    if (isConsecutiveUtcDay(base.lastActivityDate, now)) {
      nextStreak = base.currentStreak + 1;
    } else {
      // Gap larger than a day (but within the 24h reset window handled above
      // for edge cases such as timezone boundaries): start fresh.
      nextStreak = 1;
    }

    const updated: StreakRecord = {
      ...base,
      currentStreak: nextStreak,
      longestStreak: Math.max(base.longestStreak, nextStreak),
      lastActivityDate: now,
    };
    return this.repository.upsert(updated);
  }

  /**
   * Returns the current streak state for the user, applying a lazy reset if
   * the streak has lapsed. Returns null if the user has no streak record.
   */
  async getStreak(userId: string, now: Date = new Date()): Promise<StreakRecord | null> {
    const existing = await this.repository.findByUserId(userId);
    if (!existing) {
      return null;
    }
    const reset = await this.maybeReset(existing, now);
    return reset ?? existing;
  }

  /**
   * If more than 24h have elapsed since the last activity, reset the streak to
   * zero and emit a `streak.reset` notification. Returns the updated record if
   * a reset occurred, otherwise null.
   */
  private async maybeReset(existing: StreakRecord, now: Date): Promise<StreakRecord | null> {
    if (!existing.lastActivityDate) {
      return null;
    }
    if (existing.currentStreak <= 0) {
      return null;
    }

    const elapsed = now.getTime() - existing.lastActivityDate.getTime();
    if (elapsed <= HOURS_24_MS) {
      return null;
    }

    const resetRecord: StreakRecord = {
      ...existing,
      currentStreak: 0,
    };
    const saved = await this.repository.upsert(resetRecord);

    try {
      await this.notifications.emit(existing.userId, 'streak.reset', {
        previous_streak: existing.currentStreak,
        longest_streak: existing.longestStreak,
        last_activity_date: existing.lastActivityDate.toISOString(),
      });
    } catch (err) {
      // Notification failures must not break streak reads/writes.
      this.logger.error(
        `Failed to emit streak.reset notification for user ${existing.userId}`,
        err instanceof Error ? err.stack : String(err),
      );
    }

    return saved;
  }
}

@ApiTags('users')
@ApiBearerAuth()
@Controller('v1/users')
@UseGuards()
export class StreaksController {
  constructor(private readonly streaksService: StreaksService) {}

  @Get('me/streak')
  @ApiOperation({ summary: 'Get the current learning streak for the authenticated user' })
  async getMyStreak(): Promise<StreakResponse> {
    const userId = this.getCurrentUserId();
    const record = await this.streaksService.getStreak(userId);

    if (!record) {
      // No activity yet: return a zeroed streak rather than 404 so the
      // dashboard can render the flame counter consistently.
      return {
        current_streak: 0,
        longest_streak: 0,
        last_activity_date: null,
      };
    }

    return {
      current_streak: record.currentStreak,
      longest_streak: record.longestStreak,
      last_activity_date: record.lastActivityDate
        ? record.lastActivityDate.toISOString()
        : null,
    };
  }

  /**
   * Resolves the authenticated user id. In the real application this is
   * provided by the auth guard / request context. Kept as a seam for testing.
   */
  protected getCurrentUserId(): string {
    const userId = (globalThis as { __currentUserId?: string }).__currentUserId;
    if (!userId) {
      throw new NotFoundException('Authenticated user not found');
    }
    return userId;
  }
}

@Module({
  controllers: [StreaksController],
  providers: [StreaksService],
  exports: [StreaksService],
})
export class StreaksModule {}