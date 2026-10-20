import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Stripe from 'stripe';
import { User, SubscriptionTier } from '../users/user.entity';
import { Payment } from '../payments/payment.entity';
import { MailService } from '../mail/mail.service';

@Injectable()
export class SubscriptionsService {
  private stripe: Stripe;
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(
    private configService: ConfigService,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    @InjectRepository(Payment)
    private paymentRepo: Repository<Payment>,
    private mailService: MailService,
  ) {
    this.stripe = new Stripe(this.configService.get<string>('stripe.secretKey') || '', {
      apiVersion: '2025-01-27' as any,
    });
  }

  async createCheckoutSession(userId: string, tier: SubscriptionTier) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    let priceId: string;
    if (tier === SubscriptionTier.PRO) {
      priceId = this.configService.get<string>('stripe.proPriceId')!;
    } else if (tier === SubscriptionTier.ENTERPRISE) {
      priceId = this.configService.get<string>('stripe.enterprisePriceId')!;
    } else {
      throw new BadRequestException('Invalid subscription tier');
    }

    if (!priceId) {
      throw new BadRequestException('Stripe Price ID not configured for this tier');
    }

    const session = await this.stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: `${this.configService.get('frontend.url')}/dashboard?subscription=success`,
      cancel_url: `${this.configService.get('frontend.url')}/pricing`,
      client_reference_id: userId,
      customer_email: user.email,
      metadata: { userId, tier },
    });

    return { url: session.url };
  }

  async handleWebhook(signature: string, payload: Buffer) {
    const webhookSecret = this.configService.get<string>('stripe.webhookSecret')!;
    let event: Stripe.Event;

    try {
      event = this.stripe.webhooks.constructEvent(payload, signature, webhookSecret);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Webhook signature verification failed: ${message}`);
      throw new BadRequestException(`Webhook Error: ${message}`);
    }

    switch (event.type) {
      case 'checkout.session.completed':
        await this.handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case 'customer.subscription.updated':
        await this.handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;
      case 'customer.subscription.deleted':
        await this.handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
      default:
        this.logger.log(`Unhandled event type ${event.type}`);
    }
  }

  private async handleCheckoutCompleted(session: Stripe.Checkout.Session) {
    const userId = session.metadata?.userId;
    const tier = session.metadata?.tier as SubscriptionTier;
    const stripeCustomerId = session.customer as string;
    const stripeSubscriptionId = session.subscription as string;

    if (!userId || !tier) return;

    const subscription = await this.stripe.subscriptions.retrieve(stripeSubscriptionId);

    await this.userRepo.update(userId, {
      subscriptionTier: tier,
      stripeCustomerId,
      stripeSubscriptionId,
      subscriptionExpiresAt: new Date(subscription.current_period_end * 1000),
    });

    this.logger.log(`Subscription activated for user ${userId}: ${tier}`);
  }

  private async handleSubscriptionUpdated(subscription: Stripe.Subscription) {
    const stripeSubscriptionId = subscription.id;
    const user = await this.userRepo.findOne({ where: { stripeSubscriptionId } });

    if (!user) return;

    if (subscription.status === 'active') {
      await this.userRepo.update(user.id, {
        subscriptionExpiresAt: new Date(subscription.current_period_end * 1000),
      });
    } else {
      await this.userRepo.update(user.id, {
        subscriptionTier: SubscriptionTier.FREE,
        subscriptionExpiresAt: null,
      });
    }
  }

  private async handleSubscriptionDeleted(subscription: Stripe.Subscription) {
    const user = await this.userRepo.findOne({ where: { stripeSubscriptionId: subscription.id } });

    if (!user) return;

    await this.refundUnusedSubscriptionTime(user, subscription);
    await this.userRepo.update(user.id, {
      subscriptionTier: SubscriptionTier.FREE,
      subscriptionExpiresAt: null,
    });
  }

  private async refundUnusedSubscriptionTime(user: User, subscription: Stripe.Subscription) {
    if (this.configService.get<boolean>('stripe.prorationEnabled') === false) return;

    const periodStart = subscription.current_period_start;
    const periodEnd = subscription.current_period_end;
    const now = Math.floor(Date.now() / 1000);
    const totalSeconds = periodEnd - periodStart;
    const remainingSeconds = periodEnd - now;

    if (!periodStart || !periodEnd || totalSeconds <= 0 || remainingSeconds <= 0) return;

    const latestInvoiceId = typeof subscription.latest_invoice === 'string'
      ? subscription.latest_invoice
      : subscription.latest_invoice?.id;
    if (!latestInvoiceId) return;

    const invoice = await this.stripe.invoices.retrieve(latestInvoiceId);
    const paymentIntentId = typeof invoice.payment_intent === 'string'
      ? invoice.payment_intent
      : invoice.payment_intent?.id;
    const refundAmount = Math.round(invoice.amount_paid * Math.min(remainingSeconds, totalSeconds) / totalSeconds);

    if (!paymentIntentId || invoice.amount_paid <= 0 || refundAmount <= 0) return;

    const priorRefund = await this.paymentRepo.findOne({
      where: { stripeSubscriptionId: subscription.id, transactionType: 'refund' },
    });
    if (priorRefund) return;

    const refund = await this.stripe.refunds.create(
      { payment_intent: paymentIntentId, amount: refundAmount },
      { idempotencyKey: `subscription-proration-${subscription.id}` },
    );

    await this.paymentRepo.save(this.paymentRepo.create({
      userId: user.id,
      stripeSubscriptionId: subscription.id,
      stripePaymentIntentId: paymentIntentId,
      stripeRefundId: refund.id,
      amount: refund.amount,
      currency: refund.currency,
      transactionType: 'refund',
      status: refund.status ?? 'pending',
    }));

    const currency = refund.currency.toUpperCase();
    const fractionDigits = new Intl.NumberFormat('en', {
      style: 'currency',
      currency,
    }).resolvedOptions().maximumFractionDigits;
    const formattedAmount = new Intl.NumberFormat('en', {
      style: 'currency',
      currency,
    }).format(refund.amount / (10 ** fractionDigits));

    try {
      await this.mailService.sendEmail(
        user.email,
        'Your subscription refund is being processed',
        `<p>Hi ${user.username},</p>
         <p>Your subscription cancellation generated a prorated refund of <strong>${formattedAmount}</strong>.</p>
         <p>Please allow 5-10 business days for the refund to appear on your original payment method.</p>`,
      );
    } catch (error) {
      this.logger.error(`Failed to send refund email to user ${user.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async getSubscriptionStatus(userId: string) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    return {
      tier: user.subscriptionTier,
      expiresAt: user.subscriptionExpiresAt,
      isPro: user.subscriptionTier === SubscriptionTier.PRO || user.subscriptionTier === SubscriptionTier.ENTERPRISE,
    };
  }

  /**
   * Renews a user's subscription by extending expiresAt.
   * 
   * If the user's current expiresAt is in the future, extends from that date.
   * Otherwise, extends from now.
   * 
   * Plan durations (in days):
   * - MONTHLY: 30 days
   * - ANNUAL: 365 days
   * - ENTERPRISE: 30 days (default)
   * 
   * @param userId - The user ID to renew
   * @throws {NotFoundException} if user not found or subscription tier is FREE
   * @throws {BadRequestException} if subscription is expired beyond grace period
   */
  async renewSubscription(userId: string): Promise<{ newExpiresAt: Date }> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    if (user.subscriptionTier === SubscriptionTier.FREE) {
      throw new BadRequestException('Cannot renew a FREE subscription. Upgrade to PRO or ENTERPRISE.');
    }

    // Determine plan duration in days
    const durationDays = user.subscriptionTier === SubscriptionTier.PRO ? 30 : 30; // MONTHLY or ENTERPRISE

    // Calculate new expiry date: extend from current expiiry if valid, else from now
    const now = new Date();
    let baseDate = now;

    if (user.subscriptionExpiresAt && user.subscriptionExpiresAt > now) {
      // Active subscription: extend from current expiry
      baseDate = user.subscriptionExpiresAt;
    }
    // else: expired or never set, renew from now

    const newExpiresAt = new Date(baseDate.getTime() + durationDays * 24 * 60 * 60 * 1000);

    await this.userRepo.update(userId, {
      subscriptionExpiresAt: newExpiresAt,
    });

    this.logger.log(`Renewed subscription for user ${userId}: new expiry ${newExpiresAt.toISOString()}`);

    return { newExpiresAt };
  }
}
