import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PresenceService } from './presence.service';
import { CollaborationGateway } from './collaboration.gateway';
import { CollaborationCleanupService } from './collaboration-cleanup.service';
import { CollaborationSession } from './entities/collaboration-session.entity';
import { CollaborationController } from './collaboration.controller';
import { LessonsModule } from '../lessons/lessons.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    TypeOrmModule.forFeature([CollaborationSession]),
    LessonsModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('jwt.secret'),
      }),
    }),
  ],
  controllers: [CollaborationController],
  providers: [PresenceService, CollaborationGateway, CollaborationCleanupService],
  exports: [PresenceService, CollaborationGateway],
})
export class CollaborationModule {}