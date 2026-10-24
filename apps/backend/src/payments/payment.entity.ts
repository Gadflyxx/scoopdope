import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  userId: string;

  @Column()
  stripeSubscriptionId: string;

  @Column()
  stripePaymentIntentId: string;

  @Column({ unique: true })
  stripeRefundId: string;

  @Column({ type: 'integer' })
  amount: number;

  @Column({ length: 3 })
  currency: string;

  @Column({ default: 'refund' })
  transactionType: string;

  @Column({ default: 'succeeded' })
  status: string;

  @CreateDateColumn()
  createdAt: Date;
}