# Monitoring Setup

Scoopdope uses Prometheus for metrics collection, Alertmanager for alert routing, and Grafana for visualization.

## Quick Start

1. Start the monitoring stack:
```bash
docker compose -f docker-compose.monitoring.yml up -d
```

2. Access the dashboards:
- Grafana: http://localhost:3002 (admin/admin)
- Prometheus: http://localhost:9090
- Alertmanager: http://localhost:9093

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   Monitoring Stack                       │
│  docker compose -f docker-compose.monitoring.yml         │
│                                                          │
│  ┌──────────┐    ┌──────────────┐    ┌───────────────┐  │
│  │ Backend   │───▶│ Prometheus   │───▶│ Alertmanager  │  │
│  │ /metrics  │    │ port 9090    │    │ port 9093     │  │
│  │ /health   │    └──────┬───────┘    └───────────────┘  │
│  └──────────┘           │                                 │
│                          ▼                                │
│                   ┌──────────────┐                       │
│                   │ Grafana      │                       │
│                   │ port 3002    │                       │
│                   └──────────────┘                       │
└─────────────────────────────────────────────────────────┘
```

## Metrics Endpoint

The backend exposes a Prometheus-compatible endpoint at `GET /metrics`.

### Authentication

The endpoint is protected by a bearer token. Configure the expected token via the `METRICS_TOKEN` environment variable:

```bash
METRICS_TOKEN=your-secret-token
```

Requests without a valid `Authorization: Bearer <token>` header receive `401 Unauthorized`. Prometheus must be configured with the same token (see the scrape config below).

### Custom Counters

In addition to the standard Node.js process metrics, the endpoint exposes:

- `enrollments_total` — Incremented on each new enrollment
- `credentials_issued_total` — Incremented on each credential issued
- `active_sessions` — Current number of active sessions

### Prometheus Scrape Config

The monitoring compose stack (`docker-compose.monitoring.yml`) includes a scrape job for the backend:

```yaml
scrape_configs:
  - job_name: 'scoopdope-backend'
    metrics_path: /metrics
    authorization:
      type: Bearer
      credentials: '${METRICS_TOKEN}'
    static_configs:
      - targets: ['backend:3000']
```

## Health Check Endpoints

The backend exposes granular health checks for all dependencies.

### `GET /health`

Returns a JSON body with an overall status and individual sub-check results:

```json
{
  "status": "ok",
  "checks": {
    "db": { "status": "up" },
    "redis": { "status": "up" },
    "stellar": { "status": "up" }
  }
}
```

Status semantics:

| Overall status | Meaning | HTTP status |
|----------------|---------|-------------|
| `ok` | All dependencies healthy | `200` |
| `degraded` | A non-critical dependency (e.g. Redis) is down | `200` |
| `down` | A critical dependency (e.g. database) is down | `503` |

### `GET /health/ready`

Readiness probe. Returns `503` if any critical dependency is down, `200` otherwise. Use this to route traffic away from degraded instances.

### `GET /health/live`

Liveness probe. Returns `200` as long as the API process is running. Use this to trigger restarts of hung instances.

### Kubernetes Probe Configuration

```yaml
livenessProbe:
  httpGet:
    path: /health/live
    port: 3000
  initialDelaySeconds: 15
  periodSeconds: 20
  failureThreshold: 3

readinessProbe:
  httpGet:
    path: /health/ready
    port: 3000
  initialDelaySeconds: 10
  periodSeconds: 10
  failureThreshold: 3
```

- **Liveness** — restarts the pod after 3 consecutive failures (default 20s interval).
- **Readiness** — removes the pod from service endpoints after 3 consecutive failures (default 10s interval).

## Available Metrics

### HTTP Metrics
- `http_requests_total` — Total HTTP requests by method, route, and status code
- `http_request_duration_seconds` — Request latency histogram (buckets: 0.01–10s)

### Business Metrics
- `enrollments_total` — Course enrollments by course_id and level
- `courses_completed_total` — Course completions by course_id and level
- `recommendations_served_total` — Recommendation responses served
- `credential_issued_total` — Credentials issued by type
- `bst_minted_total` — BST tokens minted by user

### Cache Metrics
- `cache_hits_total` — Cache hits by cache name
- `cache_misses_total` — Cache misses by cache name

### Performance Metrics
- `stellar_rpc_latency_seconds` — Stellar RPC call latency histogram
- `health_check_duration_seconds` — Health check probe duration

### Health Metrics
- `health_check_up` — Health check status per probe (1=up, 0=down)

### Application Metrics
- `app_uptime_seconds` — Application uptime
- `app_active_connections` — Active connections
- `app_database_pool_size` — Database connection pool size by state
- `app_redis_connected_clients` — Redis connected clients
- `app_active_users` — Active users by time window

### System Metrics (auto-collected)
- `process_cpu_user_seconds_total` — CPU usage
- `process_resident_memory_bytes` — Memory usage
- `nodejs_eventloop_lag_seconds` — Event loop lag
- `nodejs_heap_size_total_bytes` — Heap total
- `nodejs_heap_size_used_bytes` — Heap used

## Grafana Dashboard

A pre-built dashboard is auto-provisioned at startup showing 19 panels across 3 rows:

**Top Row — Service Health**
- HTTP Request Rate (by method/route/status)
- HTTP Error Rate (5xx)
- HTTP Request Duration (p50/p95/p99)

**Middle Row — Business & Health**
- Total Enrollments (stat)
- Courses Completed (stat)
- Credentials Issued (stat)
- BST Tokens Minted (stat)
- Recommendations Served (stat)
- Health Check Status (stat)
- Active Users (stat)
- Enrollment Rate (timeseries)
- Completion Rate (timeseries)
- Credential Issuance Rate (timeseries)

**Bottom Row — System**
- Cache Hit Rate (%)
- Stellar RPC Latency (p50/p95/p99)
- Node.js Memory Usage
- Event Loop Lag
- CPU Usage
- Active Connections & DB Pool

## Prometheus Alerting Rules

Defined in `infra/monitoring/prometheus-rules.yml`:

| Alert | Severity | Condition |
|-------|----------|-----------|
| `HighHttpErrorRate` | critical | 5xx rate > 5% for 2m |
| `HighHttpLatency` | warning | p95 latency > 2s for 3m |
| `BackendDown` | critical | Target unreachable for 1m |
| `HealthCheckFailing` | critical | Readiness probe failing for 2m |
| `HighMemoryUsage` | warning | RSS > 512 MB for 5m |
| `HighEventLoopLag` | warning | Lag > 1s for 2m |
| `StellarRpcDegraded` | warning | p95 latency > 2s for 5m |
| `StellarRpcErrors` | critical | RPC errors detected for 2m |
| `LowEnrollmentRate` | info | < 1 enrollment/hour over 24h |
| `NoRecommendationsServed` | warning | No recommendations in 2h |
| `SecretRotationFailed` | critical | Secrets Manager rotation lambda reports failure for 2m |

## Secret Rotation Notifications

Automatic secret rotation (see `docs/secret-rotation.md`) publishes events to an SNS topic, which fans out to the monitoring Slack channel.

```
┌──────────────────┐   ┌──────────────────┐   ┌──────────────────┐
│ Secrets Manager  │──▶│ SNS Topic        │──▶│ Slack            │
│ rotation lambda  │   │ secret-rotation  │   │ #monitoring      │
└──────────────────┘   └──────────────────┘   └──────────────────┘
```

- **SNS topic** — `scoopdope-secret-rotation` (created in the Terraform config alongside the rotation schedules)
- **Slack channel** — `#monitoring`; rotation success/failure events are posted here
- **Alert** — `SecretRotationFailed` fires when a rotation lambda reports failure, and is routed to `#incidents` like other critical alerts

Operators should watch `#monitoring` for scheduled rotation events and `#incidents` for rotation failures. If a rotation fails, follow the emergency manual rotation procedure in `docs/secret-rotation.md`.

## Alertmanager

Config at `infra/monitoring/alertmanager/config.yml`:
- **Critical** alerts → `#incidents` channel
- **Warning** alerts → logged only (configurable)
- **Info** alerts → logged only
- **Inhibition** — critical alerts suppress warning alerts for same alertname

To configure Slack, replace the `api_url` placeholder with your webhook URL.

## Custom Metrics

Add custom metrics through `MetricsService`:

```typescript
import { MetricsService } from './metrics/metrics.service';

constructor(private metrics: MetricsService) {}

// Counters
this.metrics.incrementEnrollment(courseId, course.level);
this.metrics.incrementCourseCompleted(courseId, course.level);
this.metrics.incrementRecommendationsServed(results.length);

// Histograms
const start = Date.now();
// ... perform operation
this.metrics.observeHttpRequestDuration('GET', '/courses', 200, (Date.now() - start) / 1000);

// Gauges
this.metrics.setActiveUsers('24h', userCount);
```

## Production Deployment

In production, update `infra/monitoring/prometheus.yml` to target the backend service:

```yaml
scrape_configs:
  - job_name: 'scoopdope-backend'
    static_configs:
      - targets: ['backend:3000']
```

Update Alertmanager Slack webhook URL in `infra/monitoring/alertmanager/config.yml`:
```yaml
slack_configs:
  - api_url: 'https://hooks.slack.com/services/YOUR/WEBHOOK'
```
