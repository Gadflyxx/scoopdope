import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';
import { Course } from '../courses/course.entity';
import { CourseModule } from '../courses/course-module.entity';
import { Lesson } from '../courses/lesson.entity';
import { Quiz } from '../courses/quiz.entity';
import { QuizQuestion } from '../courses/quiz-question.entity';
import { ImportJob } from './import-job.entity';
import { DataExportJob } from './data-export-job.entity';
import { ImportExportService } from './import-export.service';
import { ImportExportController } from './import-export.controller';
import { DataExportService } from './data-export.service';
import { DataExportWorker } from './data-export.worker';
import { DataExportCleanupScheduler } from './data-export-cleanup.scheduler';
import { JsonImportStrategy } from './strategies/json-import.strategy';
import { CsvImportStrategy } from './strategies/csv-import.strategy';
import { ScormImportStrategy } from './strategies/scorm-import.strategy';
import { EnrollmentsModule } from '../enrollments/enrollments.module';
import { CertificatesModule } from '../certificates/certificates.module';
import { AuditModule } from '../audit/audit.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Course, CourseModule, Lesson, ImportJob, DataExportJob]),
    MulterModule.register({ storage: undefined }), // use memory storage (buffer)
    EnrollmentsModule,
    CertificatesModule,
    AuditModule,
    EmailModule,
  ],
  providers: [
    ImportExportService,
    DataExportService,
    DataExportWorker,
    DataExportCleanupScheduler,
    JsonImportStrategy,
    CsvImportStrategy,
    ScormImportStrategy,
    {
      provide: 'IMPORT_STRATEGIES',
      useFactory: (jsonStrategy: JsonImportStrategy, csvStrategy: CsvImportStrategy, scormStrategy: ScormImportStrategy) => [
        jsonStrategy,
        csvStrategy,
        scormStrategy,
      ],
      inject: [JsonImportStrategy, CsvImportStrategy, ScormImportStrategy],
    },
  ],
  controllers: [ImportExportController],
})
export class ImportExportModule {}