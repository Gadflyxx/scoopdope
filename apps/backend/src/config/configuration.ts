/**
 * Parse a region-to-tax-rate map from an environment variable.
 *
 * Accepted formats (comma-separated entries, `:` or `=` as separator):
 *   "US-CA:0.0725,DE:0.19,AE:0"
 *
 * Returns an empty object when the input is missing or malformed.
 */
function parseTaxRegionRates(raw?: string): Record<string, number> {
  const rates: Record<string, number> = {};
  if (!raw) {
    return rates;
  }

  for (const entry of raw.split(',')) {
    const trimmed = entry.trim();
    if (!trimmed) {
      continue;
    }

    const separatorIndex = trimmed.indexOf(':') !== -1 ? trimmed.indexOf(':') : trimmed.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const region = trimmed.slice(0, separatorIndex).trim().toUpperCase();
    const rate = parseFloat(trimmed.slice(separatorIndex + 1).trim());

    if (!region || Number.isNaN(rate) || rate < 0) {
      continue;
    }

    rates[region] = rate;
  }

  return rates;
}

function buildRedisUrl(): string {
  if (process.env.REDIS_URL) {
    return process.env.REDIS_URL;
  }

  // Fallback: build Redis URL from individual components
  const host = process.env.REDIS_HOST || 'localhost';
  const port = process.env.REDIS_PORT || '6379';
  const password = process.env.REDIS_PASSWORD || '';
  const db = process.env.REDIS_DB || '0';

  if (password) {
    return `redis://:${password}@${host}:${port}/${db}`;
  }
  return `redis://${host}:${port}/${db}`;
}

/**
 * Read a required environment variable.
 *
 * Throws a clear, actionable error when the variable is missing or blank so
 * the application fails fast at startup instead of running with an insecure
 * default or an empty secret.
 */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') {
    throw new Error(
      `Missing required environment variable "${name}". ` +
        `Set it in your environment (see .env.example) before starting the application.`,
    );
  }
  return value;
}

/**
 * Read an optional environment variable, returning `undefined` when unset.
 * Never falls back to a hardcoded secret value.
 */
function optionalEnv(name: string): string | undefined {
  const value = process.env[name];
  return value === undefined || value.trim() === '' ? undefined : value;
}

export default () => {
  // Validate required secrets up front so startup fails with a clear error.
  const jwtSecret = requireEnv('JWT_SECRET');
  const databasePassword = requireEnv('DATABASE_PASSWORD');

  return {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  database: {
    host: process.env.DATABASE_HOST!,
    port: parseInt(process.env.DATABASE_PORT || '5432', 10),
    username: process.env.DATABASE_USER!,
    password: databasePassword,
    name: process.env.DATABASE_NAME!,
    poolMin: parseInt(process.env.DB_POOL_MIN || process.env.DATABASE_POOL_MIN || '5', 10),
    poolMax: parseInt(process.env.DB_POOL_MAX || process.env.DATABASE_POOL_MAX || '20', 10),
    idleTimeoutMs: parseInt(
      process.env.DB_POOL_IDLE_TIMEOUT_MS || process.env.DATABASE_IDLE_TIMEOUT_MS || '30000',
      10,
    ),
    connectionTimeoutMs: parseInt(
      process.env.DB_POOL_CONNECTION_TIMEOUT_MS || process.env.DATABASE_CONNECTION_TIMEOUT_MS || '2000',
      10,
    ),
  },

  jwt: {
    secret: jwtSecret,
  },

  redis: {
    url: buildRedisUrl(),
  },

  stellar: {
    network: process.env.STELLAR_NETWORK as 'testnet' | 'mainnet',
    secretKey: optionalEnv('STELLAR_SECRET_KEY'),
    sorobanRpcUrl: process.env.SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org',
    contractId: process.env.SOROBAN_CONTRACT_ID || '',
    enrollmentContractId: process.env.ENROLLMENT_CONTRACT_ID || '',
    analyticsContractId: process.env.ANALYTICS_CONTRACT_ID || '',
    credentialMetadataContractId: process.env.CREDENTIAL_METADATA_CONTRACT_ID || '',
    certificateContractId: process.env.CERTIFICATE_CONTRACT_ID || '',
    tokenContractId: process.env.TOKEN_CONTRACT_ID || '',
    indexerPollIntervalMs: parseInt(process.env.INDEXER_POLL_INTERVAL_MS || '5000', 10),
    webAuthDomain: process.env.STELLAR_WEB_AUTH_DOMAIN || 'localhost',
  },

  health: {
    stellarCritical: process.env.STELLAR_HEALTH_CRITICAL?.toLowerCase() !== 'false',
    stellarHorizonUrl:
      process.env.STELLAR_HORIZON_URL ||
      (process.env.STELLAR_NETWORK === 'mainnet'
        ? 'https://horizon.stellar.org'
        : 'https://horizon-testnet.stellar.org'),
  },

  mail: {
    host: process.env.EMAIL_HOST!,
    port: parseInt(process.env.EMAIL_PORT || '587', 10),
    secure: process.env.EMAIL_SECURE === 'true',
    user: process.env.EMAIL_USER!,
    pass: process.env.EMAIL_PASS!,
    from: process.env.EMAIL_FROM || '"Scoopdope" <no-reply@Scoopdope.app>',
    enabled: process.env.EMAIL_ENABLED === 'true',
  },

  google: {
    clientId: optionalEnv('GOOGLE_CLIENT_ID'),
    clientSecret: optionalEnv('GOOGLE_CLIENT_SECRET'),
    callbackUrl: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/auth/google/callback',
  },

  microsoft: {
    clientId: optionalEnv('MICROSOFT_CLIENT_ID'),
    clientSecret: optionalEnv('MICROSOFT_CLIENT_SECRET'),
    callbackUrl: process.env.MICROSOFT_CALLBACK_URL || 'http://localhost:3000/auth/microsoft/callback',
  },

  frontend: {
    url: process.env.FRONTEND_URL || 'http://localhost:3001',
  },

  cors: {
    origins: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3001'],
    credentials: process.env.CORS_CREDENTIALS === 'true',
    maxAge: parseInt(process.env.CORS_MAX_AGE || '86400', 10),
  },

  throttle: {
    ttl: parseInt(process.env.THROTTLE_TTL || '60000', 10),
    limit: parseInt(process.env.THROTTLE_LIMIT || '100', 10),
  },

  kyc: {
    providerApiKey: optionalEnv('KYC_PROVIDER_API_KEY'),
  },

  aws: {
    region: process.env.AWS_REGION || 'us-east-1',
    accessKeyId: optionalEnv('AWS_ACCESS_KEY_ID'),
    secretAccessKey: optionalEnv('AWS_SECRET_ACCESS_KEY'),
  },

  moderation: {
    toxicityThreshold: parseFloat(process.env.MODERATION_TOXICITY_THRESHOLD || '0.7'),
  },

  elasticsearch: {
    node: process.env.ELASTICSEARCH_NODE || 'http://localhost:9200',
    apiKey: optionalEnv('ELASTICSEARCH_API_KEY'),
  },

  stripe: {
    secretKey: optionalEnv('STRIPE_SECRET_KEY'),
    webhookSecret: optionalEnv('STRIPE_WEBHOOK_SECRET'),
    proPriceId: process.env.STRIPE_PRO_PRICE_ID || '',
    enterprisePriceId: process.env.STRIPE_ENTERPRISE_PRICE_ID || '',
    prorationEnabled: process.env.STRIPE_SUBSCRIPTION_PRORATION_ENABLED !== 'false',
  },

  exchangeRate: {
    apiKey: optionalEnv('EXCHANGE_RATE_API_KEY'),
    baseUrl: process.env.EXCHANGE_RATE_BASE_URL || 'https://open.er-api.com/v6/latest',
    cacheTtlMs: parseInt(process.env.EXCHANGE_RATE_CACHE_TTL_MS || '3600000', 10),
  },

  payouts: {
    batchSize: parseInt(process.env.PAYOUT_BATCH_SIZE ?? '500', 10),
  },

  rewards: {
    moduleCompletion: parseInt(process.env.REWARD_MODULE_COMPLETION ?? '25', 10),
    courseCompletion: parseInt(process.env.REWARD_COURSE_COMPLETION ?? '100', 10),
  },

  vapid: {
    publicKey: optionalEnv('VAPID_PUBLIC_KEY'),
    privateKey: optionalEnv('VAPID_PRIVATE_KEY'),
    subject: process.env.VAPID_SUBJECT || 'mailto:admin@scoopdope.com',
  },

  survey: {
    pseudonymizationSecret: optionalEnv('SURVEY_PSEUDONYMIZATION_SECRET'),
  },
  };
};
