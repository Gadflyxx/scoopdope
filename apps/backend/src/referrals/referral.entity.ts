import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../users/user.entity';

export enum ReferralStatus {
  PENDING = 'pending',
  REWARDED = 'rewarded',
}

@Entity('referrals')
@Index('IDX_referrals_referrer_id', ['referrerId'])
@Index('IDX_referrals_code', ['code'])
export class Referral {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'referrer_id', type: 'uuid' })
  referrerId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'referrer_id' })
  referrer: User;

  @Index('IDX_referrals_referred_user_id', { unique: true })
  @Column({ name: 'referred_user_id', type: 'uuid', unique: true })
  referredUserId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'referred_user_id' })
  referredUser: User;

  @Column({ type: 'varchar', length: 32 })
  code: string;

  @Column({
    type: 'enum',
    enum: ReferralStatus,
    default: ReferralStatus.PENDING,
  })
  status: ReferralStatus;

  @Column({ name: 'reward_paid_at', type: 'timestamptz', nullable: true })
  rewardPaidAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}