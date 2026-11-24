export interface HealthSystemInfo {
  version: string;
  uptime: number;
  environment: string;
  nodeVersion: string;
  platform: string;
  memoryUsage: NodeJS.MemoryUsage;
  cpuLoad: number[];
  startTime: string;
  environmentName: string;
}

export interface HealthEnvironmentInfo {
  active: string;
  inactive: string;
  region: string;
  timestamp: string;
}

export type ProbeType = 'liveness' | 'readiness' | 'startup' | 'full';

export interface ProbeResult {
  status: 'ok' | 'error';
  timestamp: string;
  checks: Record<string, ProbeCheckResult>;
}

export interface ProbeCheckResult {
  status: 'up' | 'down' | 'degraded';
  message?: string;
  latencyMs?: number;
}

export type HealthStatus = 'ok' | 'degraded' | 'down';

export type HealthCheckStatus = 'up' | 'down' | 'degraded';

export interface HealthSubCheckResult {
  status: HealthCheckStatus;
  message?: string;
  latencyMs?: number;
}

export interface HealthChecks {
  db: HealthSubCheckResult;
  redis: HealthSubCheckResult;
  stellar: HealthSubCheckResult;
}

export interface HealthResponse {
  status: HealthStatus;
  checks: HealthChecks;
  timestamp?: string;
}

export interface ReadinessResponse {
  status: HealthStatus;
  checks: HealthChecks;
  timestamp?: string;
}