import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { HttpModule } from '@nestjs/axios';
import { WebhookDelivery } from './entities/webhook-delivery.entity';
import { WebhookDeliveriesService } from './webhook-deliveries.service';
import { WebhookDeliveriesController } from './webhook-deliveries.controller';
import { WebhookRetryWorker } from './webhook-retry.worker';
import { WEBHOOK_BACKOFF_CONFIG, DEFAULT_WEBHOOK_BACKOFF_CONFIG } from './webhook-backoff.config';

@Module({
  imports: [
    TypeOrmModule.forFeature([WebhookDelivery]),
    ScheduleModule.forRoot(),
    HttpModule,
  ],
  controllers: [WebhookDeliveriesController],
  providers: [
    WebhookDeliveriesService,
    WebhookRetryWorker,
    {
      provide: WEBHOOK_BACKOFF_CONFIG,
      useValue: DEFAULT_WEBHOOK_BACKOFF_CONFIG,
    },
  ],
  exports: [WebhookDeliveriesService],
})
export class WebhookDeliveriesModule {}