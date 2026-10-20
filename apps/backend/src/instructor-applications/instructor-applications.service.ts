import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Repository } from 'typeorm';
import { InstructorApplication } from './instructor-application.entity';
import { UsersService } from '../users/users.service';
import {
  CreateInstructorApplicationDto,
  ReviewApplicationDto,
} from './dto/instructor-application.dto';

@Injectable()
export class InstructorApplicationsService {
  constructor(
    @InjectRepository(InstructorApplication)
    private readonly repo: Repository<InstructorApplication>,
    private readonly usersService: UsersService,
    private readonly eventEmitter: EventEmitter2,
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
      locale: ['en', 'es', 'fr', 'ar'].includes(locale) ? locale : 'en',
    });
    const savedApplication = await this.repo.save(application);
    this.eventEmitter.emit('application.submitted', {
      applicationId: savedApplication.id,
      userId,
      userEmail: user.email,
      userName: user.username || user.email,
      locale: savedApplication.locale,
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

  async review(id: string, adminId: string, dto: ReviewApplicationDto) {
    const application = await this.repo.findOne({ where: { id }, relations: ['user'] });
    if (!application) throw new NotFoundException('Application not found');
    if (application.status !== 'pending') {
      throw new BadRequestException('Application has already been reviewed');
    }

    application.status = dto.status;
    application.adminNote = dto.adminNote ?? null;
    application.reviewedBy = adminId;
    application.reviewedAt = new Date();

    const reviewedApplication = await this.repo.save(application);

    if (dto.status === 'approved') {
      await this.usersService.update(application.userId, {
        role: 'instructor',
        isVerified: true,
      });
    }

    this.eventEmitter.emit(`application.${dto.status}`, {
      applicationId: reviewedApplication.id,
      userId: application.userId,
      userEmail: application.user.email,
      userName: application.user.username || application.user.email,
      locale: application.locale || 'en',
      adminNote: application.adminNote,
    });

    return reviewedApplication;
  }
}
