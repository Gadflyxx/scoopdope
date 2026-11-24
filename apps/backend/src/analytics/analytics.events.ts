import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AnalyticsService } from './analytics.service';

@Injectable()
export class AnalyticsEvents {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @OnEvent('reward.earned')
  async handleRewardEarned(payload: {
    userId: string;
    amount: number;
    type: string;
    referenceId: string;
    reason: string;
    txHash: string | null;
    claimedAt: Date;
  }): Promise<void> {
    await this.analyticsService.recordRewardEvent(payload);
  }
}
```

```typescript
// apps/backend/src/analytics/entities/video-event.entity.ts
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum VideoEventType {
  PLAY = 'play',
  PAUSE = 'pause',
  SEEKED = 'seeked',
  ENDED = 'ended',
}

@Entity('video_events')
@Index('IDX_video_events_lesson_id', ['lessonId'])
@Index('IDX_video_events_created_at', ['createdAt'])
export class VideoEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'lesson_id' })
  lessonId: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  @Column({
    type: 'enum',
    enum: VideoEventType,
    enumName: 'video_event_type',
    name: 'event_type',
  })
  eventType: VideoEventType;

  @Column({ type: 'float', name: 'timestamp_seconds' })
  timestampSeconds: number;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}