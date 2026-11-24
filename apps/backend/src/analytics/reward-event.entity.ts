import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';
import { RewardType } from '../rewards/reward.entity';

@Entity('reward_events')
export class RewardEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column({ type: 'enum', enum: RewardType })
  type: RewardType;

  @Column()
  referenceId: string;

  @Column({ type: 'int' })
  amount: number;

  @Column()
  reason: string;

  @Column({ nullable: true })
  txHash: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  recordedAt: Date;
}