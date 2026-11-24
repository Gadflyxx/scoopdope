import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Contract,
  Keypair,
  Networks,
  SorobanRpc,
  TransactionBuilder,
  nativeToScVal,
  xdr,
} from '@stellar/stellar-sdk';

export interface ReputationEvent {
  learnerId: string;
  delta: number;
  reason: string;
}

interface PendingUpdate {
  learnerId: string;
  delta: number;
  reasons: string[];
}

const BATCH_INTERVAL_MS = 60_000;
const MAX_RETRIES = 5;
const BASE_BACKOFF_MS = 1_000;

@Injectable()
export class ReputationService implements OnModuleDestroy {
  private readonly logger = new Logger(ReputationService.name);
  private readonly pending = new Map<string, PendingUpdate>();
  private flushTimer: NodeJS.Timeout | null = null;
  private flushing = false;

  constructor(private readonly config: ConfigService) {}

  /**
   * Record a reputation-affecting event. Events are accumulated and flushed
   * to the on-chain reputation contract at most once per minute.
   */
  recordEvent(event: ReputationEvent): void {
    if (!event.learnerId || !Number.isFinite(event.delta) || event.delta === 0) {
      return;
    }

    const existing = this.pending.get(event.learnerId);
    if (existing) {
      existing.delta += event.delta;
      existing.reasons.push(event.reason);
    } else {
      this.pending.set(event.learnerId, {
        learnerId: event.learnerId,
        delta: event.delta,
        reasons: [event.reason],
      });
    }

    this.scheduleFlush();
  }

  /** Convenience hook for quiz completion events. */
  recordQuizCompletion(learnerId: string, score: number): void {
    const delta = Math.max(1, Math.round(score / 10));
    this.recordEvent({ learnerId, delta, reason: 'quiz_completed' });
  }

  private scheduleFlush(): void {
    if (this.flushTimer) {
      return;
    }
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flush();
    }, BATCH_INTERVAL_MS);
    if (typeof this.flushTimer.unref === 'function') {
      this.flushTimer.unref();
    }
  }

  /**
   * Submit all pending updates as a single batched contract invocation.
   * Failed submissions are retried with exponential backoff.
   */
  async flush(): Promise<void> {
    if (this.flushing || this.pending.size === 0) {
      return;
    }
    this.flushing = true;

    const batch = Array.from(this.pending.values());
    this.pending.clear();

    try {
      await this.submitWithRetry(batch);
    } catch (err) {
      this.logger.error(
        `Failed to submit reputation batch after retries: ${(err as Error).message}`,
      );
      // Re-queue so the next flush window can attempt again.
      for (const update of batch) {
        const existing = this.pending.get(update.learnerId);
        if (existing) {
          existing.delta += update.delta;
          existing.reasons.push(...update.reasons);
        } else {
          this.pending.set(update.learnerId, update);
        }
      }
      this.scheduleFlush();
    } finally {
      this.flushing = false;
    }
  }

  private async submitWithRetry(batch: PendingUpdate[]): Promise<void> {
    let attempt = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        await this.submitBatch(batch);
        return;
      } catch (err) {
        attempt += 1;
        if (attempt > MAX_RETRIES) {
          throw err;
        }
        const delay = BASE_BACKOFF_MS * Math.pow(2, attempt - 1);
        this.logger.warn(
          `Reputation batch submission failed (attempt ${attempt}/${MAX_RETRIES}), retrying in ${delay}ms: ${(err as Error).message}`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  private async submitBatch(batch: PendingUpdate[]): Promise<void> {
    const rpcUrl = this.config.get<string>('SOROBAN_RPC_URL');
    const contractId = this.config.get<string>('REPUTATION_CONTRACT_ID');
    const secret = this.config.get<string>('SOROBAN_SIGNER_SECRET');
    const networkPassphrase =
      this.config.get<string>('SOROBAN_NETWORK_PASSPHRASE') ?? Networks.TESTNET;

    if (!rpcUrl || !contractId || !secret) {
      throw new Error('Reputation contract is not configured');
    }

    const server = new SorobanRpc.Server(rpcUrl, { allowHttp: rpcUrl.startsWith('http://') });
    const keypair = Keypair.fromSecret(secret);
    const contract = new Contract(contractId);
    const account = await server.getAccount(keypair.publicKey());

    const updatesScVal = xdr.ScVal.scvVec(
      batch.map((u) =>
        xdr.ScVal.scvMap([
          new xdr.ScMapEntry({
            key: nativeToScVal('learner_id', { type: 'symbol' }),
            val: nativeToScVal(u.learnerId, { type: 'string' }),
          }),
          new xdr.ScMapEntry({
            key: nativeToScVal('delta', { type: 'symbol' }),
            val: nativeToScVal(u.delta, { type: 'i128' }),
          }),
        ]),
      ),
    );

    const tx = new TransactionBuilder(account, {
      fee: '1000000',
      networkPassphrase,
    })
      .addOperation(contract.call('batch_update_scores', updatesScVal))
      .setTimeout(30)
      .build();

    const prepared = await server.prepareTransaction(tx);
    prepared.sign(keypair);

    const response = await server.sendTransaction(prepared);
    if (response.status === 'ERROR') {
      throw new Error(`Transaction submission failed: ${response.status}`);
    }

    this.logger.log(
      `Submitted reputation batch of ${batch.length} update(s) (tx ${response.hash})`,
    );
  }

  onModuleDestroy(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
  }
}
