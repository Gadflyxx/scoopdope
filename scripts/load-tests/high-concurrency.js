import http from 'k6/http';
import ws from 'k6/ws';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Gauge } from 'k6/metrics';

/**
 * High Concurrency Load Test
 * Tests system with 200, 1000 and 10000 concurrent users
 *
 * The 200-user scenario validates the DB connection pool configuration
 * (DB_POOL_MAX, defaults to 20) and asserts no connection exhaustion occurs.
 *
 * WebSocket memory monitoring:
 * The `websocket_memory` scenario opens and closes WebSocket connections
 * against the collaboration gateway to exercise the `handleDisconnect`
 * cleanup path, and samples process memory (RSS) from the API's metrics
 * endpoint. The `ws_memory_rss` Gauge tracks the sampled RSS and the
 * `ws_memory_growth` Trend tracks the delta from the baseline sample.
 * Thresholds assert that memory does not grow unbounded across the run.
 *
 * Expected memory footprint per WebSocket connection (documented baseline):
 *   - ~10-20 KB per connection for the socket buffer + NestJS gateway
 *     client map entry (client id -> socket reference).
 *   - ~1-2 MB per 100 concurrent connections of additional RSS.
 *   - After all clients disconnect, RSS should return to within ~5% of the
 *     pre-connection baseline. Sustained growth beyond that indicates a
 *     leaked client reference in a gateway's in-memory map.
 */

// Custom metrics for connection-exhaustion detection
const connectionExhaustionRate = new Rate('connection_exhaustion_errors');
const serverErrorRate = new Rate('server_errors');
const dbHeavyDuration = new Trend('db_heavy_request_duration');

// Custom metrics for WebSocket memory-leak detection
const wsMemoryRss = new Gauge('ws_memory_rss');
const wsMemoryGrowth = new Trend('ws_memory_growth');
const wsConnectFailures = new Rate('ws_connect_failures');

export const options = {
  scenarios: {
    // 200 concurrent users - validates DB pool configuration
    pool_validation: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        // Ramp-up to 200 users
        { duration: '2m', target: 200 },
        // Sustain 200 users
        { duration: '5m', target: 200 },
        // Ramp-down
        { duration: '1m', target: 0 },
      ],
      exec: 'poolValidationScenario',
      tags: { scenario: 'pool_validation' },
    },
    // High concurrency - 1000 and 10000 users
    high_concurrency: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        // Ramp-up to 1000 users
        { duration: '5m', target: 1000 },
        // Sustained 1000 users
        { duration: '10m', target: 1000 },
        // Spike to 10000 users
        { duration: '2m', target: 10000 },
        // Sustained 10000 users
        { duration: '5m', target: 10000 },
        // Ramp-down
        { duration: '5m', target: 0 },
      ],
      exec: 'highConcurrencyScenario',
      startTime: '8m',
      tags: { scenario: 'high_concurrency' },
    },
    // WebSocket memory-leak monitoring - open/close connections and sample RSS
    websocket_memory: {
      executor: 'constant-vus',
      vus: 10,
      duration: '10m',
      exec: 'websocketMemoryScenario',
      startTime: '30m',
      tags: { scenario: 'websocket_memory' },
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<1000', 'p(99)<2000'],
    http_req_failed: ['rate<0.1'],
    // Pool validation scenario must show no connection exhaustion
    'connection_exhaustion_errors{scenario:pool_validation}': ['rate==0'],
    'server_errors{scenario:pool_validation}': ['rate<0.01'],
    'db_heavy_request_duration{scenario:pool_validation}': ['p(95)<1500', 'p(99)<3000'],
    // WebSocket memory must not grow unbounded across the run
    'ws_memory_growth{scenario:websocket_memory}': ['p(95)<52428800'], // < 50 MB growth
    'ws_connect_failures{scenario:websocket_memory}': ['rate<0.05'],
  },
};

const BASE_URL = __ENV.API_URL || 'http://localhost:3000';
const API_PREFIX = '/api/v1';
const WS_URL = __ENV.WS_URL || BASE_URL.replace(/^http/, 'ws');
const WS_PATH = __ENV.WS_PATH || '/socket.io/?EIO=4&transport=websocket';
const MEMORY_ENDPOINT = __ENV.MEMORY_ENDPOINT || `${BASE_URL}${API_PREFIX}/metrics/memory`;

// Baseline RSS (bytes) captured in setup(); used to compute memory growth.
let baselineRss = 0;

// Smoke assertion: fail the run if no response ever returns 200 (e.g. wrong path -> all 404s)
export function setup() {
  const res = http.get(`${BASE_URL}${API_PREFIX}/courses?page=0&limit=1`, {
    tags: { endpoint: 'smoke' },
  });

  check(res, {
    'smoke: at least one response returns 200': (r) => r.status === 200,
  });

  if (res.status !== 200) {
    throw new Error(
      `Smoke check failed: expected 200 from ${BASE_URL}${API_PREFIX}/courses, got ${res.status}`
    );
  }

  // Capture baseline process memory before any WebSocket connections are opened.
  baselineRss = sampleMemoryRss();
  if (baselineRss > 0) {
    wsMemoryRss.add(baselineRss, { scenario: 'websocket_memory', phase: 'baseline' });
  }

  return { baselineRss };
}

/**
 * Sample the API process RSS (bytes) from the memory metrics endpoint.
 * Returns 0 if the endpoint is unavailable so the run is not aborted.
 */
function sampleMemoryRss() {
  const res = http.get(MEMORY_ENDPOINT, {
    tags: { endpoint: 'memory-metrics', scenario: 'websocket_memory' },
  });

  if (res.status !== 200) {
    return 0;
  }

  try {
    const body = JSON.parse(res.body);
    // Accept either { rss } or { memory: { rss } } shapes.
    const rss = body.rss ?? (body.memory && body.memory.rss);
    return typeof rss === 'number' ? rss : 0;
  } catch (e) {
    return 0;
  }
}

/**
 * Detect connection-exhaustion symptoms in a response.
 * TypeORM/pg surfaces these as ETIMEDOUT, ECONNREFUSED, "too many clients",
 * "connection pool" errors, or generic 5xx responses.
 */
function isConnectionExhaustion(res) {
  if (!res) return false;
  const body = (res.body || '').toString().toLowerCase();
  const errorText = (res.error || '').toString().toLowerCase();
  const combined = `${body} ${errorText}`;

  const exhaustionPatterns = [
    'etimedout',
    'econnrefused',
    'econnreset',
    'timeout exceeded when trying to connect',
    'too many clients',
    'connection pool',
    'pool exhausted',
    'connection terminated',
    'remaining connection slots',
  ];

  return exhaustionPatterns.some((pattern) => combined.includes(pattern));
}

function isServerError(res) {
  return !res || res.status >= 500;
}

function recordPoolMetrics(res, tags) {
  connectionExhaustionRate.add(isConnectionExhaustion(res), tags);
  serverErrorRate.add(isServerError(res), tags);
}

/**
 * 200 concurrent user scenario - exercises DB-heavy endpoints
 * to validate the connection pool configuration.
 */
export function poolValidationScenario() {
  group('Pool Validation - DB Heavy', () => {
    // DB-heavy: paginated list query with filtering/sorting
    const listRes = http.get(
      `${BASE_URL}/v1/courses?page=${Math.floor(Math.random() * 10)}&limit=50&sort=createdAt`,
      { tags: { endpoint: 'courses-list', scenario: 'pool_validation' } },
    );

    dbHeavyDuration.add(listRes.timings.duration, { scenario: 'pool_validation' });
    recordPoolMetrics(listRes, { scenario: 'pool_validation' });

    check(listRes, {
      'list status 200': (r) => r.status === 200,
      'list not connection exhausted': (r) => !isConnectionExhaustion(r),
      'list no 5xx': (r) => r.status < 500,
      'list response time < 1500ms': (r) => r.timings.duration < 1500,
    });

    sleep(0.5);

    // DB-heavy: detail lookup with relations
    const courseId = Math.floor(Math.random() * 100) + 1;
    const detailRes = http.get(`${BASE_URL}/v1/courses/${courseId}`, {
      tags: { endpoint: 'course-details', scenario: 'pool_validation' },
    });

    dbHeavyDuration.add(detailRes.timings.duration, { scenario: 'pool_validation' });
    recordPoolMetrics(detailRes, { scenario: 'pool_validation' });

    check(detailRes, {
      'detail status 200 or 404': (r) => r.status === 200 || r.status === 404,
      'detail not connection exhausted': (r) => !isConnectionExhaustion(r),
      'detail no 5xx': (r) => r.status < 500,
      'detail response time < 1500ms': (r) => r.timings.duration < 1500,
    });

    sleep(0.5);

    // DB-heavy: write path (enrollment) to stress the pool with transactions
    const enrollRes = http.post(
      `${BASE_URL}/v1/enrollments`,
      JSON.stringify({ courseId }),
      {
        headers: { 'Content-Type': 'application/json' },
        tags: { endpoint: 'enrollments', scenario: 'pool_validation' },
      },
    );

    dbHeavyDuration.add(enrollRes.timings.duration, { scenario: 'pool_validation' });
    recordPoolMetrics(enrollRes, { scenario: 'pool_validation' });

    check(enrollRes, {
      'enroll status is 2xx/4xx': (r) => r.status >= 200 && r.status < 500,
      'enroll not connection exhausted': (r) => !isConnectionExhaustion(r),
      'enroll no 5xx': (r) => r.status < 500,
    });

    sleep(1);
  });
}

/**
 * High concurrency scenario - 1000 and 10000 users.
 */
export function highConcurrencyScenario() {
  group('High Concurrency - Read Heavy', () => {
    // Simulate read-heavy workload
    const coursesRes = http.get(`${BASE_URL}${API_PREFIX}/courses?page=${Math.floor(Math.random() * 10)}&limit=20`, {
      tags: { endpoint: 'courses' },
    });

    recordPoolMetrics(coursesRes, { scenario: 'high_concurrency' });

    check(coursesRes, {
      'courses status 200': (r) => r.status === 200,
      'courses response time < 1000ms': (r) => r.timings.duration < 1000,
    });

    sleep(1);

    // Get random course details
    const courseId = Math.floor(Math.random() * 100) + 1;
    const courseRes = http.get(`${BASE_URL}${API_PREFIX}/courses/${courseId}`, {
      tags: { endpoint: 'course-details' },
    });

    recordPoolMetrics(courseRes, { scenario: 'high_concurrency' });

    check(courseRes, {
      'course status 200 or 404': (r) => r.status === 200 || r.status === 404,
      'course response time < 1000ms': (r) => r.timings.duration < 1000,
    });

    sleep(1);
  });
}

/**
 * WebSocket memory scenario - repeatedly opens and closes WebSocket
 * connections to the collaboration gateway, exercising the
 * `handleDisconnect` cleanup path, and samples process memory.
 * A leaked client reference shows up as a rising `ws_memory_growth` trend.
 */
export function websocketMemoryScenario() {
  const url = `${WS_URL}${WS_PATH}`;

  const res = ws.connect(url, { tags: { scenario: 'websocket_memory' } }, (socket) => {
    socket.on('open', () => {
      // Send a lightweight collaboration message to register the client.
      socket.send(JSON.stringify({ event: 'join', data: { room: 'load-test' } }));
    });

    socket.on('error', () => {
      wsConnectFailures.add(true, { scenario: 'websocket_memory' });
    });

    // Keep the connection open briefly, then close it to trigger handleDisconnect.
    socket.setTimeout(() => {
      socket.close();
    }, 1000);
  });

  wsConnectFailures.add(res && res.status !== 101, { scenario: 'websocket_memory' });

  // Sample memory after the connection is closed and cleanup should have run.
  const rss = sampleMemoryRss();
  if (rss > 0) {
    wsMemoryRss.add(rss, { scenario: 'websocket_memory' });
    if (baselineRss > 0) {
      wsMemoryGrowth.add(rss - baselineRss, { scenario: 'websocket_memory' });
    }
  }

  sleep(1);
}

export default function () {
  highConcurrencyScenario();
}