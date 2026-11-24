import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),

  // Required secrets — must be provided via environment variables.
  DATABASE_URL: z
    .string({ required_error: 'DATABASE_URL is required (database connection string)' })
    .min(1, 'DATABASE_URL must not be empty')
    .url('DATABASE_URL must be a valid connection URL'),

  JWT_SECRET: z
    .string({ required_error: 'JWT_SECRET is required (signing secret for auth tokens)' })
    .min(32, 'JWT_SECRET must be at least 32 characters long'),

  REDIS_URL: z
    .string({ required_error: 'REDIS_URL is required (Redis connection string)' })
    .min(1, 'REDIS_URL must not be empty')
    .url('REDIS_URL must be a valid connection URL'),

  STRIPE_SECRET_KEY: z
    .string({ required_error: 'STRIPE_SECRET_KEY is required (Stripe API secret key)' })
    .min(1, 'STRIPE_SECRET_KEY must not be empty'),

  EMAIL_PASS: z
    .string({ required_error: 'EMAIL_PASS is required (SMTP password for outbound email)' })
    .min(1, 'EMAIL_PASS must not be empty'),

  // Database connection pool settings
  DB_POOL_MIN: z.coerce.number().int().min(0).default(2),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(100).default(20),
  DB_POOL_IDLE_TIMEOUT_MS: z.coerce.number().int().min(0).default(30000),
  DB_POOL_CONNECTION_TIMEOUT_MS: z.coerce.number().int().min(0).default(5000),

  // Exchange rate API key used for instructor payout currency conversion
  EXCHANGE_RATE_API_KEY: z.string().default(''),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const errors = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(
      `Invalid environment configuration. The application cannot start until all required ` +
        `environment variables are set correctly:\n${errors}`,
    );
  }

  return parsed.data;
}

export const env = loadEnv();