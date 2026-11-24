export const HEALTH_CACHE_TTL_MS = 30_000;

export const DISK_HEALTH_THRESHOLD_PERCENT = 0.9;

export const MEMORY_HEAP_THRESHOLD_BYTES = 150 * 1024 * 1024;
export const MEMORY_RSS_THRESHOLD_BYTES = 300 * 1024 * 1024;

export const STELLAR_HORIZON_TIMEOUT_MS = 2_000;
export const STELLAR_SOROBAN_TIMEOUT_MS = 5_000;
export const ELASTICSEARCH_TIMEOUT_MS = 3_000;

export const DATABASE_HEALTH_TIMEOUT_MS = 2_000;
export const REDIS_HEALTH_TIMEOUT_MS = 2_000;
export const STELLAR_RPC_HEALTH_TIMEOUT_MS = 3_000;

export const LOAD_BALANCER_HEALTH_CHECK_PATH = '/health';
export const LIVENESS_PROBE_PATH = '/health/live';
export const READINESS_PROBE_PATH = '/health/ready';
export const STARTUP_PROBE_PATH = '/health/startup';
export const ENVIRONMENT_PATH = '/health/environment';
export const VERSION_PATH = '/health/version';

export type HealthCheckName = 'db' | 'redis' | 'stellar';

export type HealthCheckStatus = 'ok' | 'degraded' | 'down';

export type HealthStatus = 'ok' | 'degraded' | 'down';

export interface DependencyClassification {
  name: HealthCheckName;
  critical: boolean;
}

export const CRITICAL_DEPENDENCIES: readonly HealthCheckName[] = ['db', 'stellar'];

export const NON_CRITICAL_DEPENDENCIES: readonly HealthCheckName[] = ['redis'];

export const DEPENDENCY_CLASSIFICATIONS: readonly DependencyClassification[] = [
  { name: 'db', critical: true },
  { name: 'stellar', critical: true },
  { name: 'redis', critical: false },
];

export function isCriticalDependency(name: HealthCheckName): boolean {
  return CRITICAL_DEPENDENCIES.includes(name);
}

export const HEALTH_STATUS_OK: HealthStatus = 'ok';
export const HEALTH_STATUS_DEGRADED: HealthStatus = 'degraded';
export const HEALTH_STATUS_DOWN: HealthStatus = 'down';

export const HEALTH_HTTP_STATUS_OK = 200;
export const HEALTH_HTTP_STATUS_SERVICE_UNAVAILABLE = 503;