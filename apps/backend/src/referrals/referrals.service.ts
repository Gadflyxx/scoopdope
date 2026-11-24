import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { randomBytes } from 'crypto';

import { User } from '../users/entities/user.entity';
import { Referral } from './entities/referral.entity';
import { RewardsService } from '../rewards/rewards.service';

export const REFERRAL_REWARD_TOKENS = 50;
export const REFERRAL_DISCOUNT_PERCENT = 10;

export interface ReferralStats {
  referralCount: number;
  totalEarnings: number;
  referralCode: string;
}

@Injectable()
export class ReferralsService {
  private readonly logger = new Logger(ReferralsService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Referral)
    private readonly referralRepository: Repository<Referral>,
    private readonly rewardsService: RewardsService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Generate a unique referral code for a user and persist it on users.referralCode.
   * Idempotent: returns the existing code if one is already present.
   */
  async generateReferralCode(userId: string): Promise<string> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }

    if (user.referralCode) {
      return user.referralCode;
    }

    const code = await this.createUniqueCode();
    user.referralCode = code;
    await this.userRepository.save(user);
    return code;
  }

  private async createUniqueCode(): Promise<string> {
    const maxAttempts = 10;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const code = this.buildCode();
      const existing = await this.userRepository.findOne({
        where: { referralCode: code },
      });
      if (!existing) {
        return code;
      }
    }
    throw new Error('Unable to generate a unique referral code');
  }

  private buildCode(): string {
    // 8-char uppercase alphanumeric code, avoiding ambiguous characters.
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = randomBytes(8);
    let code = '';
    for (let i = 0; i < 8; i++) {
      code += alphabet[bytes[i] % alphabet.length];
    }
    return code;
  }

  /**
   * Validate a referral code for a registering user.
   * Rejects self-referral and unknown codes. Returns the referrer user.
   */
  async validateReferralCode(
    code: string,
    newUserId?: string,
  ): Promise<User> {
    if (!code || !code.trim()) {
      throw new BadRequestException('Referral code is required');
    }

    const normalized = code.trim().toUpperCase();

    const referrer = await this.userRepository.findOne({
      where: { referralCode: normalized },
    });

    if (!referrer) {
      throw new BadRequestException('Invalid referral code');
    }

    if (newUserId) {
      if (referrer.id === newUserId) {
        throw new BadRequestException('Self-referral is not allowed');
      }

      // Also reject if the new user's own code matches (defensive).
      const newUser = await this.userRepository.findOne({
        where: { id: newUserId },
      });
      if (newUser?.referralCode === normalized) {
        throw new BadRequestException('Self-referral is not allowed');
      }

      // Prevent duplicate referral records for the same referred user.
      const existingReferral = await this.referralRepository.findOne({
        where: { referredUserId: newUserId },
      });
      if (existingReferral) {
        throw new BadRequestException(
          'A referral already exists for this user',
        );
      }
    }

    return referrer;
  }

  /**
   * Record a referral for a newly registered user.
   * Returns the created referral record.
   */
  async recordReferral(
    referredUserId: string,
    referralCode: string,
  ): Promise<Referral> {
    const referrer = await this.validateReferralCode(
      referralCode,
      referredUserId,
    );

    const referral = this.referralRepository.create({
      referrerId: referrer.id,
      referredUserId,
      code: referrer.referralCode,
      status: 'pending',
      discountApplied: false,
      rewardGranted: false,
    });

    return this.referralRepository.save(referral);
  }

  /**
   * Determine whether the given user is eligible for the first-purchase
   * referral discount, and if so return the discount percentage.
   */
  async getFirstPurchaseDiscount(userId: string): Promise<number> {
    const referral = await this.referralRepository.findOne({
      where: { referredUserId: userId },
    });

    if (!referral) {
      return 0;
    }

    if (referral.discountApplied) {
      return 0;
    }

    return REFERRAL_DISCOUNT_PERCENT;
  }

  /**
   * Apply the 10% first-purchase discount for a referred user.
   * Returns the discount amount in the given currency (rounded to 2 decimals).
   */
  async applyFirstPurchaseDiscount(
    userId: string,
    amount: number,
  ): Promise<{ discountPercent: number; discountAmount: number; finalAmount: number }> {
    const discountPercent = await this.getFirstPurchaseDiscount(userId);

    if (discountPercent <= 0) {
      return { discountPercent: 0, discountAmount: 0, finalAmount: amount };
    }

    const discountAmount = this.round(
      (amount * discountPercent) / 100,
    );
    const finalAmount = this.round(amount - discountAmount);

    return { discountPercent, discountAmount, finalAmount };
  }

  /**
   * Called when a referred user completes their first purchase.
   * Marks the discount as applied and awards the referrer 50 BST tokens.
   */
  async handleFirstPurchaseCompleted(
    referredUserId: string,
  ): Promise<Referral | null> {
    const referral = await this.referralRepository.findOne({
      where: { referredUserId },
    });

    if (!referral) {
      return null;
    }

    if (referral.rewardGranted) {
      return referral;
    }

    return this.dataSource.transaction(async (manager) => {
      const referralRepo = manager.getRepository(Referral);

      // Re-read within transaction to avoid double-award races.
      const locked = await referralRepo.findOne({
        where: { id: referral.id },
      });

      if (!locked || locked.rewardGranted) {
        return locked ?? referral;
      }

      locked.discountApplied = true;

      try {
        await this.rewardsService.awardTokens(
          locked.referrerId,
          REFERRAL_REWARD_TOKENS,
          'referral_reward',
          {
            referredUserId: locked.referredUserId,
            referralId: locked.id,
          },
        );
        locked.rewardGranted = true;
        locked.status = 'rewarded';
        locked.rewardAmount = REFERRAL_REWARD_TOKENS;
        locked.rewardedAt = new Date();
      } catch (error) {
        this.logger.error(
          `Failed to award referral tokens for referral ${locked.id}: ${error?.message ?? error}`,
        );
        locked.status = 'failed';
        await referralRepo.save(locked);
        throw error;
      }

      return referralRepo.save(locked);
    });
  }

  /**
   * Returns referral count and total earnings for a referrer.
   */
  async getStats(userId: string): Promise<ReferralStats> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }

    const referralCode =
      user.referralCode ?? (await this.generateReferralCode(userId));

    const referralCount = await this.referralRepository.count({
      where: { referrerId: userId },
    });

    const rewarded = await this.referralRepository.find({
      where: { referrerId: userId, rewardGranted: true },
    });

    const totalEarnings = rewarded.reduce(
      (sum, r) => sum + (r.rewardAmount ?? REFERRAL_REWARD_TOKENS),
      0,
    );

    return {
      referralCount,
      totalEarnings,
      referralCode,
    };
  }

  private round(value: number): number {
    return Math.round(value * 100) / 100;
  }
}