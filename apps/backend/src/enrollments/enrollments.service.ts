import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Enrollment } from './entities/enrollment.entity';
import { Notification } from '../notifications/entities/notification.entity';
import { CreateEnrollmentDto } from './dto/create-enrollment.dto';
import { CourseStatus } from '../courses/entities/course.entity';
import { CoursesService } from '../courses/courses.service';
import { CourseVersioningService } from '../courses/course-versioning.service';
import { PrerequisitesService } from '../courses/prerequisites.service';
import { MetricsService } from '../metrics/metrics.service';
import { EnrollmentConfirmedEvent } from './events/enrollment-confirmed.event';
import { ReferralsService } from '../referrals/referrals.service';

/** TTL for cached enrollment counts, in milliseconds. */
const ENROLLMENT_COUNT_TTL_MS = 60_000;

/** How long processed Stripe event IDs are retained before pruning. */
const PROCESSED_WEBHOOK_EVENT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

interface CachedCount {
  value: number;
  expiresAt: number;
}

/** A single point in the 12-month revenue time series. */
export interface MonthlyRevenuePoint {
  /** Month in `YYYY-MM` format (UTC). */
  month: string;
  revenue: number;
}

/** Aggregated revenue figures consumed by the admin revenue dashboard. */
export interface EnrollmentRevenueSummary {
  /** Revenue collected in the current calendar month (UTC). */
  mrr: number;
  /** All-time revenue collected. */
  totalRevenue: number;
  /** Revenue per month for the last 12 months, oldest first. */
  monthlyRevenue: MonthlyRevenuePoint[];
  /** Number of refunds in the last 30 days. */
  refundCount: number;
  /** Total refunded amount in the last 30 days. */
  refundAmount: number;
  /** Refund amount divided by total revenue (0 when there is no revenue). */
  refundRate: number;
  /** Length of the refund measurement window, in days. */
  refundWindowDays: number;
}

@Injectable()
export class EnrollmentsService {
  private readonly logger = new Logger(EnrollmentsService.name);

  private readonly enrollmentCountCache = new Map<string, CachedCount>();

  constructor(
    @InjectRepository(Enrollment)
    private readonly enrollmentRepository: Repository<Enrollment>,
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
    private readonly coursesService: CoursesService,
    private readonly versioningService: CourseVersioningService,
    private readonly prereqService: PrerequisitesService,
    private readonly eventEmitter: EventEmitter2,
    private readonly metrics: MetricsService,
    private readonly referralsService: ReferralsService,
  ) {}

  /**
   * Record a Stripe webhook event as processed.
   *
   * Returns `true` when this is the first delivery of the event (the caller
   * should process it), or `false` when the event ID was already recorded
   * (a duplicate delivery that must be skipped).
   */
  async tryMarkWebhookEventProcessed(eventId: string): Promise<boolean> {
    try {
      await this.processedWebhookEventRepository.insert({ eventId });
      return true;
    } catch (error) {
      // Unique-constraint violation => the event was already processed.
      if (this.isUniqueViolation(error)) {
        this.logger.warn(`Duplicate Stripe webhook event skipped: ${eventId}`);
        return false;
      }
      throw error;
    }
  }

  /**
   * Handle a Stripe webhook event idempotently.
   *
   * Returns `true` when the event was processed, `false` when it was a
   * duplicate delivery (caller should still respond with 200).
   */
  async handleStripeWebhookEvent(
    eventId: string,
    handler: () => Promise<void>,
  ): Promise<boolean> {
    const isFirstDelivery = await this.tryMarkWebhookEventProcessed(eventId);
    if (!isFirstDelivery) {
      return false;
    }
    await handler();
    return true;
  }

  /**
   * Prune processed webhook event IDs older than the retention window (30 days).
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async cleanupProcessedWebhookEvents(): Promise<number> {
    const cutoff = new Date(Date.now() - PROCESSED_WEBHOOK_EVENT_TTL_MS);
    const result = await this.processedWebhookEventRepository
      .createQueryBuilder()
      .delete()
      .from(ProcessedWebhookEvent)
      .where('processed_at < :cutoff', { cutoff })
      .execute();
    return result.affected ?? 0;
  }

  private isUniqueViolation(error: unknown): boolean {
    const code = (error as { code?: string; driverError?: { code?: string } })?.code
      ?? (error as { driverError?: { code?: string } })?.driverError?.code;
    return code === '23505' || code === 'SQLITE_CONSTRAINT' || code === 'ER_DUP_ENTRY';
  }

  async enroll(userId: string, courseId: string, adminOverride = false): Promise<Enrollment> {
    // Throws NotFoundException (404) when the course doesn't exist (or is soft-deleted).
    const course = await this.coursesService.findOne(courseId);

    if (course.status !== CourseStatus.PUBLISHED && !adminOverride) {
      throw new ForbiddenException('Course is not open for enrollment');
    }

    const existing = await this.repo.findOne({ where: { userId, courseId } });
    if (existing) throw new ConflictException('Already enrolled in this course');

    // Enforce prerequisite courses before allowing enrollment. Instructors
    // configure prerequisites via the course prerequisites API; students must
    // have completed every prerequisite course first.
    await this.prereqService.enforcePrerequisites(userId, courseId, adminOverride);

    // Freeze the course's current content version at enrollment time so the
    // learner stays on this version even if the instructor publishes a new one.
    const enrollment = await this.repo.save(
      this.repo.create({
        userId,
        courseId,
        enrolledVersionNumber: course.version ?? null,
        transactionHash: null,
      }),
    );

    const transactionHash = enrollment.transactionHash ?? null;

    // Invalidate the cached count so the new enrollment is reflected immediately.
    this.enrollmentCountCache.delete(courseId);

    // Emit legacy event consumed by notifications / other listeners.
    this.eventEmitter.emit('enrollment.created', {
      enrollmentId: enrollment.id,
      userId,
      courseId,
      enrolledAt: enrollment.enrolledAt,
    });

    // Emit the richer on-chain confirmed event for analytics and downstream modules.
    this.eventEmitter.emit(
      'enrollment.confirmed',
      new EnrollmentConfirmedEvent({
        enrollmentId: enrollment.id,
        userId,
        courseId,
        transactionHash,
        enrolledAt: enrollment.enrolledAt,
      }),
    );

    this.metrics.incrementEnrollment(courseId, 'all');

    // Award the referrer (50 BST) once the referred learner completes their
    // first purchase. Idempotent: the referral is only rewarded a single time.
    await this.rewardReferralOnFirstPurchase(userId);

    return enrollment;
  }

  /**
   * Reward the referrer of `userId` if this is the referred learner's first
   * purchase. Failures are logged but never block the enrollment itself.
   */
  private async rewardReferralOnFirstPurchase(userId: string): Promise<void> {
    try {
      await this.referralsService.rewardReferrerOnFirstPurchase(userId);
    } catch (error) {
      this.logger.error(
        `Failed to process referral reward for user ${userId}: ${
          (error as Error)?.message ?? error
        }`,
      );
    }
  }

  async findByCourse(courseId: string): Promise<Enrollment[]> {
    return this.enrollmentRepository.find({ where: { courseId } });
  }

  /**
   * Move an enrollment onto the course's latest content version.
   *
   * Only used when a learner explicitly opts in to the new version; existing
   * enrollments are never migrated automatically.
   */
  async upgradeVersion(userId: string, courseId: string): Promise<Enrollment> {
    const enrollment = await this.enrollmentRepository.findOne({
      where: { userId, courseId },
    });
    if (!enrollment) throw new NotFoundException('Enrollment not found');

    const course = await this.coursesService.findOne(courseId);
    enrollment.enrolledVersionNumber = course.version ?? null;
    return this.enrollmentRepository.save(enrollment);
  }

  /**
   * Build an enrollment response that exposes the learner's frozen content
   * version alongside the course's latest version so the frontend can show a
   * 'New version available' banner.
   */
  async toResponse(enrollment: Enrollment): Promise<EnrollmentResponse> {
    const course = await this.coursesService.findOne(enrollment.courseId);
    const latestVersion = course.version ?? null;
    const enrolledVersion = enrollment.enrolledVersionNumber ?? null;

    return {
      ...enrollment,
      enrolledVersionNumber: enrolledVersion,
      latestVersionNumber: latestVersion,
      newVersionAvailable:
        enrolledVersion !== null &&
        latestVersion !== null &&
        latestVersion > enrolledVersion,
    };
  }

  async notifyAllEnrolled(courseId: string, message: string): Promise<void> {
    const enrollments = await this.enrollmentRepository.find({
      where: { courseId },
      select: ['studentId'],
    });

    if (enrollments.length === 0) {
      return;
    }

    const notifications = enrollments.map((enrollment) =>
      this.notificationRepository.create({
        userId: enrollment.studentId,
        courseId,
        message,
      }),
    );

    await this.notificationRepository.save(notifications);
  }

  /**
   * Count total enrollments for a course.
   *
   * Results are cached for a short TTL so repeated calls within the window
   * do not hit the database.
   */
  async countByCourseId(courseId: string): Promise<number> {
    const cached = this.enrollmentCountCache.get(courseId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    const value = await this.enrollmentRepository.count({ where: { courseId } });
    this.enrollmentCountCache.set(courseId, {
      value,
      expiresAt: Date.now() + ENROLLMENT_COUNT_TTL_MS,
    });
    return value;
  }

  /**
   * Count completed enrollments for a course
   */
  async countCompletedByCourseId(courseId: string): Promise<number> {
    return this.enrollmentRepository
      .createQueryBuilder('enrollment')
      .where('enrollment.courseId = :courseId', { courseId })
      .andWhere('enrollment.completedAt IS NOT NULL')
      .getCount();
  }

  /**
   * Return the difficulty levels of all courses a learner has completed.
   *
   * Used by the recommendation engine to assess the learner's current level.
   * Only enrollments with a non-null `completedAt` are considered, and the
   * joined course's `difficultyLevel` is selected.
   */
  async getCompletedCourseLevels(userId: string): Promise<CourseLevel[]> {
    const rows = await this.repo
      .createQueryBuilder('enrollment')
      .innerJoin('enrollment.course', 'course')
      .select('course.difficultyLevel', 'difficultyLevel')
      .where('enrollment.userId = :userId', { userId })
      .andWhere('enrollment.completedAt IS NOT NULL')
      .andWhere('course.difficultyLevel IS NOT NULL')
      .getRawMany<{ difficultyLevel: CourseLevel }>();

    return rows.map((row) => row.difficultyLevel);
  }

  async unenroll(userId: string, courseId: string): Promise<void> {
    const enrollment = await this.enrollmentRepository.findOne({
      where: { userId, courseId },
    });
    if (!enrollment) throw new NotFoundException('Enrollment not found');
    await this.enrollmentRepository.remove(enrollment);

    // Invalidate the cached count so the removal is reflected immediately.
    this.enrollmentCountCache.delete(courseId);

    // Notify waitlist system that a spot has opened
    this.eventEmitter.emit('enrollment.removed', { userId, courseId });
  }

  async findByUser(userId: string): Promise<EnrollmentResponse[]> {
    const enrollments = await this.enrollmentRepository.find({
      where: { userId },
      relations: ['course'],
      order: { enrolledAt: 'DESC' },
    });

    return Promise.all(enrollments.map((enrollment) => this.toResponse(enrollment)));
  }

  async remove(id: string): Promise<void> {
    const enrollment = await this.enrollmentRepository.findOne({ where: { id } });
    if (!enrollment) {
      throw new NotFoundException(`Enrollment ${id} not found`);
    }
    await this.enrollmentRepository.remove(enrollment);
  }

  /**
   * Aggregate enrollment/payment data for the admin revenue dashboard.
   *
   * Read-only. All aggregation is performed in the database via the query
   * builder so no rows are loaded into memory.
   */
  async getRevenueSummary(): Promise<EnrollmentRevenueSummary> {
    const now = new Date();
    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const seriesStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1),
    );
    const refundWindowStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const totalRevenueRow = await this.enrollmentRepository
      .createQueryBuilder('enrollment')
      .select('COALESCE(SUM(enrollment.amountPaid), 0)', 'total')
      .getRawOne<{ total: string | number | null }>();

    const mrrRow = await this.enrollmentRepository
      .createQueryBuilder('enrollment')
      .select('COALESCE(SUM(enrollment.amountPaid), 0)', 'total')
      .where('enrollment.enrolledAt >= :monthStart', { monthStart })
      .getRawOne<{ total: string | number | null }>();

    const monthlyRows = await this.enrollmentRepository
      .createQueryBuilder('enrollment')
      .select("TO_CHAR(DATE_TRUNC('month', enrollment.enrolledAt), 'YYYY-MM')", 'month')
      .addSelect('COALESCE(SUM(enrollment.amountPaid), 0)', 'total')
      .where('enrollment.enrolledAt >= :seriesStart', { seriesStart })
      .groupBy("DATE_TRUNC('month', enrollment.enrolledAt)")
      .orderBy("DATE_TRUNC('month', enrollment.enrolledAt)", 'ASC')
      .getRawMany<{ month: string; total: string | number | null }>();

    const refundRows = await this.enrollmentRepository
      .createQueryBuilder('enrollment')
      .select('COUNT(*)', 'count')
      .addSelect('COALESCE(SUM(enrollment.amountPaid), 0)', 'amount')
      .where('enrollment.refundedAt >= :refundWindowStart', {
        refundWindowStart,
      })
      .getRawOne<{ count: string | number | null; amount: string | number | null }>();

    const totalRevenue = Number(totalRevenueRow?.total ?? 0);
    const mrr = Number(mrrRow?.total ?? 0);
    const refundCount = Number(refundRows?.count ?? 0);
    const refundAmount = Number(refundRows?.amount ?? 0);

    const monthlyTotals = new Map<string, number>();
    for (const row of monthlyRows) {
      monthlyTotals.set(row.month, Number(row.total ?? 0));
    }

    const monthlyRevenue: MonthlyRevenuePoint[] = [];
    for (let i = 0; i < 12; i += 1) {
      const monthDate = new Date(
        Date.UTC(seriesStart.getUTCFullYear(), seriesStart.getUTCMonth() + i, 1),
      );
      const month = `${monthDate.getUTCFullYear()}-${String(
        monthDate.getUTCMonth() + 1,
      ).padStart(2, '0')}`;
      monthlyRevenue.push({ month, revenue: monthlyTotals.get(month) ?? 0 });
    }

    const refundRate =
      totalRevenue > 0 ? refundAmount / totalRevenue : 0;

    return {
      mrr,
      totalRevenue,
      monthlyRevenue,
      refundCount,
      refundAmount,
      refundRate,
      refundWindowDays: 30,
    };
  }
}
