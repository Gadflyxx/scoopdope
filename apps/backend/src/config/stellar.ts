import { Horizon, Networks } from '@stellar/stellar-sdk';

/**
 * Stellar network configuration.
 *
 * The active network is controlled by the STELLAR_NETWORK environment variable.
 * Supported values: "testnet" (default) and "mainnet".
 */
export type StellarNetwork = 'testnet' | 'mainnet';

const NETWORK_PASSPHRASES: Record<StellarNetwork, string> = {
  testnet: Networks.TESTNET,
  mainnet: Networks.PUBLIC,
};

const DEFAULT_NETWORK: StellarNetwork = 'testnet';

const DEFAULT_HORIZON_URLS: Record<StellarNetwork, string> = {
  testnet: 'https://horizon-testnet.stellar.org',
  mainnet: 'https://horizon.stellar.org',
};

function resolveNetwork(): StellarNetwork {
  const raw = process.env.STELLAR_NETWORK?.trim().toLowerCase();

  if (!raw) {
    return DEFAULT_NETWORK;
  }

  if (raw === 'testnet' || raw === 'mainnet') {
    return raw;
  }

  throw new Error(
    `Invalid STELLAR_NETWORK value "${process.env.STELLAR_NETWORK}". ` +
      'Expected "testnet" or "mainnet".',
  );
}

export const stellarNetwork: StellarNetwork = resolveNetwork();

export const stellarNetworkPassphrase: string =
  NETWORK_PASSPHRASES[stellarNetwork];

export const isMainnet: boolean = stellarNetwork === 'mainnet';

function resolveHorizonUrl(): string {
  const raw = process.env.STELLAR_HORIZON_URL?.trim();

  if (raw) {
    return raw;
  }

  return DEFAULT_HORIZON_URLS[stellarNetwork];
}

export const stellarHorizonUrl: string = resolveHorizonUrl();

export const stellarConfig = {
  network: stellarNetwork,
  networkPassphrase: stellarNetworkPassphrase,
  isMainnet,
  horizonUrl: stellarHorizonUrl,
} as const;

const DEFAULT_STELLAR_HEALTH_TIMEOUT_MS = 3000;

function resolveStellarHealthTimeout(): number {
  const raw = process.env.STELLAR_HEALTH_TIMEOUT_MS?.trim();

  if (!raw) {
    return DEFAULT_STELLAR_HEALTH_TIMEOUT_MS;
  }

  const parsed = Number(raw);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_STELLAR_HEALTH_TIMEOUT_MS;
  }

  return parsed;
}

export const stellarHealthTimeoutMs: number = resolveStellarHealthTimeout();

/**
 * Result of a Stellar RPC/Horizon reachability probe.
 */
export interface StellarHealthCheckResult {
  status: 'up' | 'down';
  latencyMs: number;
  url: string;
  error?: string;
}

/**
 * Probes the configured Stellar Horizon endpoint to verify reachability.
 *
 * Performs a lightweight `GET /` request against the Horizon root endpoint
 * (which returns the network passphrase and Horizon version) with an
 * abort-based timeout. Never throws: failures are reported as `status: 'down'`
 * so the health service can aggregate them into an overall status.
 */
export async function checkStellarRpcHealth(
  timeoutMs: number = stellarHealthTimeoutMs,
): Promise<StellarHealthCheckResult> {
  const url = stellarHorizonUrl;
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });

    const latencyMs = Date.now() - startedAt;

    if (!response.ok) {
      return {
        status: 'down',
        latencyMs,
        url,
        error: `Unexpected status ${response.status}`,
      };
    }

    return { status: 'up', latencyMs, url };
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    const isAbort = (error as { name?: string })?.name === 'AbortError';

    return {
      status: 'down',
      latencyMs,
      url,
      error: isAbort
        ? `Timed out after ${timeoutMs}ms`
        : (error as Error)?.message ?? 'Unknown error',
    };
  } finally {
    clearTimeout(timer);
  }
}

let cachedHorizonServer: Horizon.Server | undefined;

/**
 * Returns a shared Horizon server client for the configured network.
 *
 * The client is created lazily and cached so that repeated calls (e.g. from
 * the GDPR export job) reuse the same connection pool.
 */
export function getHorizonServer(): Horizon.Server {
  if (!cachedHorizonServer) {
    cachedHorizonServer = new Horizon.Server(stellarHorizonUrl);
  }

  return cachedHorizonServer;
}

/**
 * A single on-chain transaction record, normalized into a plain JSON-friendly
 * shape suitable for inclusion in the GDPR export.
 */
export interface AccountTransactionRecord {
  id: string;
  hash: string;
  ledger: number;
  createdAt: string;
  sourceAccount: string;
  successful: boolean;
  operationCount: number;
  memo?: string;
  memoType?: string;
  feeCharged: string;
  pagingToken: string;
  operations: Array<{
    id: string;
    type: string;
    typeI: number;
    sourceAccount?: string;
    createdAt: string;
    transactionSuccessful: boolean;
    [key: string]: unknown;
  }>;
}

export interface FetchAccountTransactionsOptions {
  /** Maximum number of transactions to retrieve (default: 200). */
  limit?: number;
  /** Horizon cursor to start from (exclusive). Defaults to the newest page. */
  cursor?: string;
  /** Sort order: "asc" or "desc" (default: "desc"). */
  order?: 'asc' | 'desc';
  /** Include the operations for each transaction (default: true). */
  includeOperations?: boolean;
}

const DEFAULT_TRANSACTION_LIMIT = 200;
const HORIZON_PAGE_SIZE = 200;

function normalizeTransaction(
  tx: Horizon.ServerApi.TransactionRecord,
  operations: Horizon.ServerApi.OperationRecord[],
): AccountTransactionRecord {
  return {
    id: tx.id,
    hash: tx.hash,
    ledger: tx.ledger_attr ?? Number(tx.ledger),
    createdAt: tx.created_at,
    sourceAccount: tx.source_account,
    successful: tx.successful,
    operationCount: tx.operation_count,
    memo: tx.memo,
    memoType: tx.memo_type,
    feeCharged: tx.fee_charged,
    pagingToken: tx.paging_token,
    operations: operations.map((op) => ({
      ...(op as unknown as Record<string, unknown>),
      id: op.id,
      type: op.type,
      typeI: op.type_i,
      sourceAccount: op.source_account,
      createdAt: op.created_at,
      transactionSuccessful: op.transaction_successful,
    })),
  };
}

/**
 * Fetches the on-chain transactions for a Stellar account from Horizon.
 *
 * Results are paginated and normalized into plain JSON-friendly records so
 * they can be written directly into the GDPR export (`blockchain-records.json`).
 *
 * If the account does not exist on-chain (never funded), an empty array is
 * returned rather than throwing.
 */
export async function fetchAccountTransactions(
  publicKey: string,
  options: FetchAccountTransactionsOptions = {},
): Promise<AccountTransactionRecord[]> {
  if (!publicKey || typeof publicKey !== 'string') {
    throw new Error('fetchAccountTransactions requires a valid public key');
  }

  const limit = Math.max(1, options.limit ?? DEFAULT_TRANSACTION_LIMIT);
  const order = options.order ?? 'desc';
  const includeOperations = options.includeOperations ?? true;
  const server = getHorizonServer();

  const records: AccountTransactionRecord[] = [];
  let cursor = options.cursor;

  try {
    while (records.length < limit) {
      const pageSize = Math.min(HORIZON_PAGE_SIZE, limit - records.length);

      let builder = server
        .transactions()
        .forAccount(publicKey)
        .order(order)
        .limit(pageSize);

      if (cursor) {
        builder = builder.cursor(cursor);
      }

      const page = await builder.call();
      const txs = page.records as Horizon.ServerApi.TransactionRecord[];

      if (txs.length === 0) {
        break;
      }

      for (const tx of txs) {
        if (records.length >= limit) {
          break;
        }

        let operations: Horizon.ServerApi.OperationRecord[] = [];

        if (includeOperations) {
          try {
            const opsPage = await server
              .operations()
              .forTransaction(tx.hash)
              .limit(HORIZON_PAGE_SIZE)
              .call();
            operations =
              opsPage.records as Horizon.ServerApi.OperationRecord[];
          } catch {
            operations = [];
          }
        }

        records.push(normalizeTransaction(tx, operations));
      }

      cursor = txs[txs.length - 1].paging_token;

      if (txs.length < pageSize) {
        break;
      }
    }
  } catch (error) {
    // Horizon returns 404 for accounts that have never been funded.
    const status = (error as { response?: { status?: number } })?.response
      ?.status;
    if (status === 404) {
      return [];
    }
    throw error;
  }

  return records;
}