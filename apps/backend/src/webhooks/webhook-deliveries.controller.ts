import { Controller, Get, Query, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WebhookDeliveriesService } from './webhook-deliveries.service';

@Controller('v1/webhooks/deliveries')
@UseGuards(JwtAuthGuard)
export class WebhookDeliveriesController {
  constructor(
    private readonly webhookDeliveriesService: WebhookDeliveriesService,
  ) {}

  @Get()
  async getDeliveries(
    @Req() req: any,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const subscriberId = req.user?.subscriberId ?? req.user?.sub ?? req.user?.id;

    const parsedLimit = limit ? parseInt(limit, 10) : undefined;
    const parsedOffset = offset ? parseInt(offset, 10) : undefined;

    return this.webhookDeliveriesService.findBySubscriber(subscriberId, {
      status,
      limit: Number.isNaN(parsedLimit) ? undefined : parsedLimit,
      offset: Number.isNaN(parsedOffset) ? undefined : parsedOffset,
    });
  }
}