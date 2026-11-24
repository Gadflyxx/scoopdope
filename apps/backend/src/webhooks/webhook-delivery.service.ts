import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual } from 'typeorm';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { WebhookDelivery, WebhookDeliveryStatus } from './entities/webhook-delivery.entity';

/**
 * Exponential backoff schedule (in milliseconds) for webhook delivery retries.
 * Attempt 1 (initial) -> retry after 1m
 * Attempt 2 -> retry after 5m
 * Attempt 3 -> retry after 15m
 * Attempt 4 -> retry after 1h
 * Attempt 5 -> retry after 4h
 * After 5 failed attempts the delivery is moved to the dead-letter `failed` status.
 */
export const WEBHOOK_RETRY_BACKOFF_MS: readonly number[] = [
  1 * 60 * 1000, // 1 minute
  5 * 60 * 1000, // 5 minutes
  15 * 60 * 1000, // 15 minutes
  1 * 60 * 60 * 1000, // 1 hour
  4 * 60 * 60 * 1000, // 4 hours
];

export const WEBHOOK_MAX_ATTEMPTS = WEBHOOK_RETRY_BACKOFF_MS.length;

export interface EnqueueDeliveryInput {
  subscriberId: string;
  eventType: string;
  endpointUrl: string;
  payload: Record<string, any>;
  headers?: Record<string, string>;
}

export interface DeliveryAttemptResult {
  deliveryId: string;
  status: WebhookDeliveryStatus;
  attemptCount: number;
  nextAttemptAt: Date | null;
}

@Injectable()
export class WebhookDeliveryService {
  private readonly logger = new Logger(WebhookDeliveryService.name);

  constructor(
    @InjectRepository(WebhookDelivery)
    private readonly deliveryRepository: Repository<WebhookDelivery>,
    private readonly httpService: HttpService,
  ) {}

  /**
   * Persist a delivery record for an outgoing webhook event and perform the
   * initial delivery attempt. On failure, a retry is scheduled according to
   * the configured exponential backoff schedule.
   */
  async enqueueDelivery(input: EnqueueDeliveryInput): Promise<WebhookDelivery> {
    const delivery = this.deliveryRepository.create({
      subscriberId: input.subscriberId,
      eventType: input.eventType,
      endpointUrl: input.endpointUrl,
      payload: input.payload,
      headers: input.headers ?? {},
      status: WebhookDeliveryStatus.PENDING,
      attemptCount: 0,
      nextAttemptAt: new Date(),
      lastError: null,
    });

    const saved = await this.deliveryRepository.save(delivery);
    return this.attemptDelivery(saved);
  }

  /**
   * Perform a single delivery attempt for the given delivery record and
   * update its status/attempt count accordingly. On failure, schedule the
   * next retry using the backoff schedule, or move to the dead-letter
   * `failed` status once the maximum number of attempts is exhausted.
   */
  async attemptDelivery(delivery: WebhookDelivery): Promise<WebhookDelivery> {
    const attemptNumber = delivery.attemptCount + 1;

    try {
      await firstValueFrom(
        this.httpService.post(delivery.endpointUrl, delivery.payload, {
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-Event': delivery.eventType,
            'X-Webhook-Delivery-Id': delivery.id,
            'X-Webhook-Attempt': String(attemptNumber),
            ...(delivery.headers ?? {}),
          },
          timeout: 10_000,
        }),
      );

      delivery.status = WebhookDeliveryStatus.SUCCEEDED;
      delivery.attemptCount = attemptNumber;
      delivery.nextAttemptAt = null;
      delivery.lastError = null;
      delivery.lastAttemptAt = new Date();

      this.logger.log(
        `Webhook delivery ${delivery.id} succeeded on attempt ${attemptNumber}`,
      );

      return this.deliveryRepository.save(delivery);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error ?? 'unknown error');

      delivery.attemptCount = attemptNumber;
      delivery.lastError = message;
      delivery.lastAttemptAt = new Date();

      if (attemptNumber >= WEBHOOK_MAX_ATTEMPTS) {
        delivery.status = WebhookDeliveryStatus.FAILED;
        delivery.nextAttemptAt = null;

        this.logger.warn(
          `Webhook delivery ${delivery.id} exhausted ${WEBHOOK_MAX_ATTEMPTS} attempts; moved to dead-letter (failed). Last error: ${message}`,
        );
      } else {
        const backoffMs = WEBHOOK_RETRY_BACKOFF_MS[attemptNumber - 1];
        delivery.status = WebhookDeliveryStatus.RETRYING;
        delivery.nextAttemptAt = new Date(Date.now() + backoffMs);

        this.logger.warn(
          `Webhook delivery ${delivery.id} failed on attempt ${attemptNumber}; retrying at ${delivery.nextAttemptAt.toISOString()}. Error: ${message}`,
        );
      }

      return this.deliveryRepository.save(delivery);
    }
  }

  /**
   * Process all deliveries that are due for a retry. Intended to be invoked
   * by the existing queue/scheduler infrastructure on a recurring basis.
   */
  async processDueRetries(now: Date = new Date()): Promise<DeliveryAttemptResult[]> {
    const due = await this.deliveryRepository.find({
      where: {
        status: WebhookDeliveryStatus.RETRYING,
        nextAttemptAt: LessThanOrEqual(now),
      },
      order: { nextAttemptAt: 'ASC' },
      take: 100,
    });

    const results: DeliveryAttemptResult[] = [];
    for (const delivery of due) {
      const updated = await this.attemptDelivery(delivery);
      results.push({
        deliveryId: updated.id,
        status: updated.status,
        attemptCount: updated.attemptCount,
        nextAttemptAt: updated.nextAttemptAt,
      });
    }

    return results;
  }

  /**
   * Return the delivery history for a subscriber, including status and
   * attempt count per event.
   */
  async listDeliveries(subscriberId: string): Promise<WebhookDelivery[]> {
    if (!subscriberId) {
      throw new NotFoundException('Subscriber id is required');
    }

    return this.deliveryRepository.find({
      where: { subscriberId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Fetch a single delivery by id, scoped to the subscriber.
   */
  async getDelivery(subscriberId: string, deliveryId: string): Promise<WebhookDelivery> {
    const delivery = await this.deliveryRepository.findOne({
      where: { id: deliveryId, subscriberId },
    });

    if (!delivery) {
      throw new NotFoundException(`Webhook delivery ${deliveryId} not found`);
    }

    return delivery;
  }
}