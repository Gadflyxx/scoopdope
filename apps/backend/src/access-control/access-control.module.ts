import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CourseAccessControl } from './course-access-control.entity';
import { AccessLog } from './access-log.entity';
import { AccessControlService } from './access-control.service';
import { AccessControlController } from './access-control.controller';
import { AccessControlGuard } from './access-control.guard';

@Module({
  imports: [TypeOrmModule.forFeature([CourseAccessControl, AccessLog])],
  providers: [AccessControlService, AccessControlGuard],
  controllers: [AccessControlController],
  exports: [AccessControlService, AccessControlGuard],
})
export class AccessControlModule {}