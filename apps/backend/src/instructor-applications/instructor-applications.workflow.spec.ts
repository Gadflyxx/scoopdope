import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EmailPreference } from '../email/email-preference.entity';
import { EmailQueue } from '../email/email-queue.entity';
import { EmailService } from '../email/email.service';
import { NotificationsEvents } from '../notifications/notifications.events';
import { NotificationsService } from '../notifications/notifications.service';
import { User } from '../users/user.entity';
import { UsersService } from '../users/users.service';
import { InstructorApplication } from './instructor-application.entity';
import { InstructorApplicationsService } from './instructor-applications.service';

describe('Instructor application email workflow', () => {
  const user = {
    id: 'user-1',
    email: 'applicant@example.com',
    username: 'applicant',
    role: 'student',
  } as User;
  const application = {
    id: 'application-1',
    userId: user.id,
    user,
    status: 'pending',
    locale: 'fr',
    adminNote: null,
  } as InstructorApplication;

  let module: TestingModule;
  let service: InstructorApplicationsService;
  let repository: any;
  let queueRepository: any;
  let usersService: jest.Mocked<Partial<UsersService>>;
  let emailInitSpy: jest.SpyInstance;

  beforeEach(async () => {
    application.status = 'pending';
    application.adminNote = null;
    repository = {
      findOne: jest.fn(),
      create: jest.fn((data: any) => data as InstructorApplication),
      save: jest.fn(
        async (data: any) => ({ ...data, id: application.id }) as InstructorApplication
      ),
    };
    queueRepository = {
      create: jest.fn((data) => data),
      save: jest.fn(async (data) => data),
      find: jest.fn().mockResolvedValue([]),
    };
    usersService = {
      findById: jest.fn().mockResolvedValue(user),
      update: jest.fn().mockResolvedValue(user),
    };
    emailInitSpy = jest.spyOn(EmailService.prototype, 'onModuleInit').mockResolvedValue();

    module = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot()],
      providers: [
        InstructorApplicationsService,
        NotificationsEvents,
        EmailService,
        { provide: getRepositoryToken(InstructorApplication), useValue: repository },
        { provide: getRepositoryToken(EmailQueue), useValue: queueRepository },
        { provide: getRepositoryToken(EmailPreference), useValue: {} },
        { provide: UsersService, useValue: usersService },
        { provide: NotificationsService, useValue: {} },
        { provide: ConfigService, useValue: { get: jest.fn(() => false) } },
      ],
    }).compile();
    await module.init();
    service = module.get(InstructorApplicationsService);
  });

  afterEach(async () => {
    await module.close();
    emailInitSpy.mockRestore();
  });

  it('queues a localized received email after an application is saved', async () => {
    repository.findOne.mockResolvedValueOnce(null);

    await service.apply(
      user.id,
      {
        agreementAccepted: true,
      } as any,
      'es-MX,es;q=0.9'
    );

    await new Promise((resolve) => setImmediate(resolve));
    expect(queueRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        to: user.email,
        subject: 'Solicitud recibida',
        html: expect.stringContaining('Hemos recibido tu solicitud para ser instructor'),
      })
    );
  });

  it.each(['approved', 'rejected'] as const)(
    'queues the %s email with the saved applicant locale and reviewer note',
    async (status) => {
      repository.findOne.mockResolvedValueOnce(application);

      await service.review(application.id, 'admin-1', {
        status,
        adminNote: 'Please add more detail.',
      });

      await new Promise((resolve) => setImmediate(resolve));
      const expectedSubject =
        status === 'approved' ? 'Candidature approuvée' : 'Candidature rejetée';
      expect(queueRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          to: user.email,
          subject: expectedSubject,
          html: expect.stringContaining(
            status === 'approved'
              ? 'Votre candidature pour enseigner est approuvée'
              : 'Please add more detail.'
          ),
        })
      );
    }
  );

  it('falls back to English for unsupported Accept-Language values', async () => {
    repository.findOne.mockResolvedValueOnce(null);

    const saved = await service.apply(
      user.id,
      {
        agreementAccepted: true,
      } as any,
      'de-DE,de;q=0.9'
    );

    expect(saved.locale).toBe('en');
    await new Promise((resolve) => setImmediate(resolve));
    expect(queueRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ subject: 'Application Received' })
    );
  });
});
