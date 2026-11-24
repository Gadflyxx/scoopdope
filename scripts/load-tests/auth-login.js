import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter } from 'k6/metrics';

// Baseline p95 for this scenario (see scripts/load-tests/baselines.json).
// Thresholds allow up to 20% regression over the baseline before failing CI.
const BASELINE_P95_MS = 500;
const P95_LIMIT_MS = Math.round(BASELINE_P95_MS * 1.2);
const P99_LIMIT_MS = Math.round(BASELINE_P95_MS * 2);

export const options = {
  stages: [
    { duration: '5s', target: 100 },
    { duration: '20s', target: 100 },
    { duration: '5s', target: 0 },
  ],
  thresholds: {
    // Fail if p95 exceeds baseline by more than 20%.
    http_req_duration: [`p(95)<${P95_LIMIT_MS}`, `p(99)<${P99_LIMIT_MS}`],
    http_req_failed: ['rate<0.01'],
    // Smoke assertion: fail the run if no response returns 200.
    checks: ['rate>0'],
  },
};

// Shared config
const BASE_URL = __ENV.API_URL || 'http://localhost:3000';
const API_PREFIX = '/api/v1';

// Track successful (200) responses so we can fail the run if all requests 404.
const successCount = new Counter('login_success_200');

export default function () {
  const payload = JSON.stringify({
    email: `user${Math.random()}@example.com`,
    password: 'password123',
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
    },
  };

  const res = http.post(`${BASE_URL}${API_PREFIX}/auth/login`, payload, params);

  if (res.status === 200) {
    successCount.add(1);
  }

  check(res, {
    'status is 200 or 401': (r) => r.status === 200 || r.status === 401,
    'response time < 500ms': (r) => r.timings.duration < 500,
    'has access_token on success': (r) => {
      if (r.status === 200) {
        const body = JSON.parse(r.body);
        return body.access_token !== undefined;
      }
      return true;
    },
  });

  sleep(1);
}

export function handleSummary(data) {
  // Smoke assertion: fail the run if no response returned 200 (e.g. all 404s
  // caused by a wrong API path prefix).
  const successMetric = data.metrics.login_success_200;
  const successCountValue = successMetric ? successMetric.values.count : 0;

  if (successCountValue === 0) {
    console.error(
      'SMOKE FAILURE: no responses returned 200. ' +
        `Check that ${BASE_URL}${API_PREFIX}/auth/login is a valid route.`
    );
    // Non-zero exit code fails the k6 run.
    throw new Error('Smoke assertion failed: no 200 responses received');
  }

  return {};
}