import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Repository } from 'typeorm';
import { InstructorApplication } from './instructor-application.entity';
import { UsersService } from '../users/users.service';
import { EmailService } from '../email/email.service';
import {
  CreateInstructorApplicationDto,
  ReviewApplicationDto,
} from './dto/instructor-application.dto';

@Injectable()
export class InstructorApplicationsService {
  private readonly logger = new Logger(InstructorApplicationsService.name);

  constructor(
    @InjectRepository(InstructorApplication)
    private readonly repo: Repository<InstructorApplication>,
    private readonly usersService: UsersService,
    private readonly eventEmitter: EventEmitter2,
    private readonly emailService: EmailService,
  ) {}

  async apply(userId: string, dto: CreateInstructorApplicationDto, acceptLanguage = 'en') {
    if (!dto.agreementAccepted) {
      throw new BadRequestException('You must accept the instructor agreement');
    }

    const existing = await this.repo.findOne({ where: { userId, status: 'pending' } });
    if (existing) {
      throw new ConflictException('You already have a pending application');
    }

    const user = await this.usersService.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    if (user.role === 'instructor') {
      throw new ConflictException('You are already an instructor');
    }

    const locale = acceptLanguage.split(',')[0].trim().split('-')[0].toLowerCase();
    const application = this.repo.create({
      ...dto,
      userId,
      status: 'pending',
      rejectionReason: null,
      reviewedBy: null,
      reviewedAt: null,
      locale: ['en', 'es', 'fr', 'ar'].includes(locale) ? locale : 'en',
    });
    const savedApplication = await this.repo.save(application);

    // Notify admins of the new application.
    this.eventEmitter.emit('application.submitted', {
      applicationId: savedApplication.id,
      userId,
      userEmail: user.email,
      userName: user.username || user.email,
      bio: savedApplication.bio,
      qualifications: savedApplication.qualifications,
      motivation: savedApplication.motivation,
      sampleContentUrl: savedApplication.sampleContentUrl,
      locale: savedApplication.locale,
    });
    this.eventEmitter.emit('admin.notification', {
      type: 'instructor_application_submitted',
      applicationId: savedApplication.id,
      userId,
      userEmail: user.email,
      userName: user.username || user.email,
      message: `New instructor application from ${user.username || user.email}`,
    });

    return savedApplication;
  }

  findMyApplication(userId: string) {
    return this.repo.findOne({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  findAll(status?: string) {
    const where = status ? { status: status as any } : {};
    return this.repo.find({
      where,
      relations: ['user'],
      order: { createdAt: 'DESC' },
    });
  }

  async approve(id: string, adminId: string) {
    const application = await this.repo.findOne({ where: { id }, relations: ['user'] });
    if (!application) throw new NotFoundException('Application not found');
    if (application.status !== 'pending') {
      throw new BadRequestException('Application has already been reviewed');
    }

    application.status = 'approved';
    application.rejectionReason = null;
    application.reviewedBy = adminId;
    application.reviewedAt = new Date();

    const reviewedApplication = await this.repo.save(application);

    // Assign the INSTRUCTOR role so the user can create courses immediately.
    await this.usersService.update(application.userId, {
      role: 'instructor',
      isVerified: true,
    });

    await this.sendEmailSafely(() =>
      this.emailService.sendApplicationApproved(
        application.user.email,
        application.user.username || application.user.email,
        application.locale || 'en',
      ),
    );

    this.eventEmitter.emit('application.approved', {
      applicationId: reviewedApplication.id,
      userId: application.userId,
      userEmail: application.user.email,
      userName: application.user.username || application.user.email,
      locale: application.locale || 'en',
    });

    return reviewedApplication;
  }

  async reject(id: string, adminId: string, reason: string) {
    if (!reason || !reason.trim()) {
      throw new BadRequestException('A rejection reason is required');
    }

    const application = await this.repo.findOne({ where: { id }, relations: ['user'] });
    if (!application) throw new NotFoundException('Application not found');
    if (application.status !== 'pending') {
      throw new BadRequestException('Application has already been reviewed');
    }

    application.status = 'rejected';
    application.rejectionReason = reason.trim();
    application.reviewedBy = adminId;
    application.reviewedAt = new Date();

    const reviewedApplication = await this.repo.save(application);

    await this.sendEmailSafely(() =>
      this.emailService.sendApplicationRejected(
        application.user.email,
        application.user.username || application.user.email,
        application.locale || 'en',
        application.rejectionReason as string,
      ),
    );

    this.eventEmitter.emit('application.rejected', {
      applicationId: reviewedApplication.id,
      userId: application.userId,
      userEmail: application.user.email,
      userName: application.user.username || application.user.email,
      locale: application.locale || 'en',
      reason: application.rejectionReason,
    });

    return reviewedApplication;
  }

  async review(id: string, adminId: string, dto: ReviewApplicationDto) {
    if (dto.status === 'approved') {
      return this.approve(id, adminId);
    }
    return this.reject(id, adminId, dto.adminNote ?? '');
  }

  private async sendEmailSafely(send: () => Promise<unknown>): Promise<void> {
    try {
      await send();
    } catch (error) {
      this.logger.error(
        `Failed to send instructor application email: ${(error as Error).message}`,
      );
    }
  }
}
