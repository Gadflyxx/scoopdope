import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InstructorApplication } from './instructor-application.entity';
import { InstructorApplicationsService } from './instructor-applications.service';
import { InstructorApplicationsController } from './instructor-applications.controller';
import { UsersModule } from '../users/users.module';
import { EmailModule } from '../email/email.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([InstructorApplication]),
    UsersModule,
    EmailModule,
    NotificationsModule,
  ],
  controllers: [InstructorApplicationsController],
  providers: [InstructorApplicationsService],
  exports: [InstructorApplicationsService],
})
export class InstructorApplicationsModule {}</｜｜DSML｜｜ parameter>