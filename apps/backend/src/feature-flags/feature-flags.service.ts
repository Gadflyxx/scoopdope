import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FeatureFlag } from './feature-flag.entity';

export type FeatureFlagMap = Record<string, boolean>;

@Injectable()
export class FeatureFlagsService {
  constructor(
    @InjectRepository(FeatureFlag)
    private readonly featureFlagRepository: Repository<FeatureFlag>,
  ) {}

  /**
   * Returns a map of flag name -> boolean for the given user.
   * Flags are read from the database on every call so that changes
   * take effect without a deployment.
   */
  async getFlagsForUser(userId: string): Promise<FeatureFlagMap> {
    const flags = await this.featureFlagRepository.find();
    const result: FeatureFlagMap = {};

    for (const flag of flags) {
      result[flag.name] = this.evaluateFlag(flag, userId);
    }

    return result;
  }

  /**
   * Evaluates a single flag for a user.
   * - Disabled flags are never enabled.
   * - 0% rollout is never enabled for any user.
   * - 100% rollout is enabled for all users.
   * - Otherwise, deterministic hashing of userId + flagName decides.
   */
  evaluateFlag(flag: FeatureFlag, userId: string): boolean {
    if (!flag.enabled) {
      return false;
    }

    const rolloutPercent = this.clampPercent(flag.rolloutPercent);

    if (rolloutPercent <= 0) {
      return false;
    }

    if (rolloutPercent >= 100) {
      return true;
    }

    const bucket = this.hashToBucket(`${userId}:${flag.name}`);
    return bucket < rolloutPercent;
  }

  private clampPercent(value: number): number {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      return 0;
    }
    if (value < 0) {
      return 0;
    }
    if (value > 100) {
      return 100;
    }
    return value;
  }

  /**
   * Deterministic hash of a string into a bucket in [0, 100).
   * Uses FNV-1a for stable, well-distributed results across processes.
   */
  private hashToBucket(input: string): number {
    let hash = 0x811c9dc5;
    for (let i = 0; i < input.length; i++) {
      hash ^= input.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    // Convert to unsigned 32-bit and map to [0, 100).
    const unsigned = hash >>> 0;
    return (unsigned % 10000) / 100;
  }
}