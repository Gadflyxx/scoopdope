import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DownloadItem } from './download-item.entity';
import { LessonResource } from './lesson-resource.entity';
import { DownloadsService } from './downloads.service';
import { DownloadsController } from './downloads.controller';
import { EnrollmentsModule } from '../enrollments/enrollments.module';
import { LessonsModule } from '../lessons/lessons.module';
import { CoursesModule } from '../courses/courses.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([DownloadItem, LessonResource]),
    EnrollmentsModule,
    LessonsModule,
    CoursesModule,
  ],
  providers: [DownloadsService],
  controllers: [DownloadsController],
})
export class DownloadsModule {}