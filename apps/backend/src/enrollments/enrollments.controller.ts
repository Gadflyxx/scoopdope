import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsString,
  ValidateNested,
} from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BatchQueueService } from './batch-queue.service';
import { EnrollmentsService } from './enrollments.service';

const ENROLLMENT_COUNT_TTL_MS = 60_000;
const MAX_BATCH_ENROLLMENTS = 500;

export class BatchEnrollmentItemDto {
  @IsString()
  userId: string;

  @IsString()
  courseId: string;
}

export class BatchEnrollmentDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_BATCH_ENROLLMENTS)
  @ValidateNested({ each: true })
  @Type(() => BatchEnrollmentItemDto)
  enrollments: BatchEnrollmentItemDto[];
}

@ApiTags('enrollments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class EnrollmentsController {
  private enrollmentCountCache = new Map<
    string,
    { value: number; expiresAt: number }
  >();

  constructor(
    private enrollmentsService: EnrollmentsService,
    private batchQueueService: BatchQueueService,
  ) {}

  @Post('courses/:id/enroll')
  @ApiOperation({ summary: 'Enroll the current user in a course' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  @ApiResponse({
    status: 201,
    description: 'Enrolled successfully',
    schema: {
      example: {
        id: 'uuid',
        userId: 'uuid',
        courseId: 'uuid',
        createdAt: '2024-01-01T00:00:00.000Z',
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 422,
    description: 'Prerequisites not completed',
    schema: {
      example: {
        statusCode: 422,
        message: 'Prerequisites not completed',
        missingPrerequisites: [{ courseId: 'uuid', title: 'Course title' }],
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Course not found' })
  @ApiResponse({ status: 409, description: 'Already enrolled' })
  enroll(
    @Param('id') courseId: string,
    @Request() req: { user: { id: string; role: string } },
    @Query('override') override?: string,
    @Body('adminOverride') adminOverride?: boolean,
    @Body('referralCode') referralCode?: string,
  ) {
    const isAdmin = req.user.role === 'admin';
    const wantsOverride = override === 'true' || !!adminOverride;
    return this.enrollmentsService.enroll(
      req.user.id,
      courseId,
      isAdmin && wantsOverride,
      referralCode,
    );
  }

  @Post('enrollments')
  @ApiOperation({ summary: 'Enroll the current user in a course (by body courseId)' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  @ApiResponse({ status: 201, description: 'Enrolled successfully' })
  @ApiResponse({
    status: 422,
    description: 'Prerequisites not completed',
    schema: {
      example: {
        statusCode: 422,
        message: 'Prerequisites not completed',
        missingPrerequisites: [{ courseId: 'uuid', title: 'Course title' }],
      },
    },
  })
  @ApiResponse({ status: 409, description: 'Already enrolled' })
  enrollByBody(
    @Body('courseId') courseId: string,
    @Request() req: { user: { id: string; role: string } },
    @Query('override') override?: string,
    @Body('adminOverride') adminOverride?: boolean,
    @Body('referralCode') referralCode?: string,
  ) {
    const isAdmin = req.user.role === 'admin';
    const wantsOverride = override === 'true' || !!adminOverride;
    return this.enrollmentsService.enroll(
      req.user.id,
      courseId,
      isAdmin && wantsOverride,
      referralCode,
    );
  }

  @Delete('courses/:id/enroll')
  @ApiOperation({ summary: 'Unenroll the current user from a course' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  @ApiResponse({ status: 200, description: 'Unenrolled successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Enrollment not found' })
  unenroll(@Param('id') courseId: string, @Request() req: { user: { id: string } }) {
    return this.enrollmentsService.unenroll(req.user.id, courseId);
  }

  @Get('users/:id/enrollments')
  @ApiOperation({ summary: 'Get all enrollments for a user' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  @ApiResponse({
    status: 200,
    description: 'List of enrollments',
    schema: {
      example: [
        {
          id: 'uuid',
          courseId: 'uuid',
          createdAt: '2024-01-01T00:00:00.000Z',
          enrolledVersionNumber: 1,
          latestVersion: 2,
        },
      ],
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getUserEnrollments(@Param('id') userId: string) {
    const enrollments = await this.enrollmentsService.findByUser(userId);
    return enrollments.map((enrollment) => ({
      ...enrollment,
      enrolledVersionNumber: enrollment.enrolledVersionNumber,
      latestVersion: enrollment.latestVersion,
    }));
  }

  @Get('courses/:id/enrollments/count')
  @ApiOperation({ summary: 'Get the enrollment count for a course' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Course not found' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  @ApiResponse({
    status: 200,
    description: 'Enrollment count for the course',
    schema: { example: { count: 42 } },
  })
  async getEnrollmentCount(@Param('id') courseId: string) {
    const cached = this.enrollmentCountCache.get(courseId);
    if (cached && cached.expiresAt > Date.now()) {
      return { count: cached.value };
    }

    const count = await this.enrollmentsService.countByCourse(courseId);
    this.enrollmentCountCache.set(courseId, {
      value: count,
      expiresAt: Date.now() + ENROLLMENT_COUNT_TTL_MS,
    });
    return { count };
  }

  @Post('enrollments/batch')
  @HttpCode(202)
  @ApiOperation({ summary: 'Enqueue a batch of enrollments (enterprise/admin only)' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  @ApiResponse({
    status: 202,
    description: 'Batch enrollment job accepted',
    schema: { example: { jobId: 'uuid' } },
  })
  async enqueueBatch(
    @Body() body: BatchEnrollmentDto,
    @Request() req: { user: { id: string; role: string } },
  ) {
    if (req.user.role !== 'admin' && req.user.role !== 'enterprise') {
      throw new ForbiddenException('Batch enrollment is restricted to enterprise and admin users');
    }

    const enrollments = body?.enrollments;
    if (!Array.isArray(enrollments) || enrollments.length === 0) {
      throw new BadRequestException('At least one enrollment is required');
    }
    if (enrollments.length > MAX_BATCH_ENROLLMENTS) {
      throw new BadRequestException(
        `A batch may contain at most ${MAX_BATCH_ENROLLMENTS} enrollments`,
      );
    }

    const jobId = await this.batchQueueService.enqueue(
      req.user.id,
      enrollments.map(({ userId, courseId }) => ({ userId, courseId })),
    );
    return { jobId };
  }

  @Get('enrollments/batch/:jobId')
  @ApiOperation({ summary: 'Get the status and per-user results of a batch enrollment job' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Batch job not found' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  @ApiResponse({
    status: 200,
    description: 'Batch job status with per-user results',
    schema: {
      example: {
        jobId: 'uuid',
        status: 'completed',
        total: 2,
        succeeded: 1,
        failed: 1,
        results: [
          { userId: 'uuid', courseId: 'uuid', status: 'success' },
          { userId: 'invalid', courseId: 'uuid', status: 'failure', error: 'User not found' },
        ],
      },
    },
  })
  getBatchStatus(
    @Param('jobId') jobId: string,
    @Request() req: { user: { id: string; role: string } },
  ) {
    if (req.user.role !== 'admin' && req.user.role !== 'enterprise') {
      throw new ForbiddenException('Batch enrollment is restricted to enterprise and admin users');
    }
    return this.batchQueueService.getStatus(jobId, req.user.id, req.user.role === 'admin');
  }

  @Post('courses/:id/enroll/upgrade-version')
  @ApiOperation({ summary: 'Upgrade enrollment to the latest course version' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  @ApiResponse({
    status: 200,
    description: 'Enrollment upgraded to latest version',
    schema: {
      example: {
        id: 'uuid',
        userId: 'uuid',
        courseId: 'uuid',
        createdAt: '2024-01-01T00:00:00.000Z',
        enrolledVersionNumber: 2,
        latestVersion: 2,
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Enrollment or version not found' })
  async upgradeVersion(
    @Param('id') courseId: string,
    @Request() req: { user: { id: string } },
  ) {
    const enrollment = await this.enrollmentsService.upgradeVersion(req.user.id, courseId);
    return {
      ...enrollment,
      enrolledVersionNumber: enrollment.enrolledVersionNumber,
      latestVersion: enrollment.latestVersion,
    };
  }
}
