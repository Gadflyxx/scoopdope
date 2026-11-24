#!/bin/bash

# Load testing script for scoopdope API
# Requires k6 to be installed: https://k6.io/docs/getting-started/installation/

set -e

API_URL="${API_URL:-http://localhost:3000}"
API_PREFIX="${API_PREFIX:-/api/v1}"
RESULTS_DIR="./load-test-results"
BASELINE_FILE="${BASELINE_FILE:-scripts/load-tests/baselines.json}"
COMPARE_SCRIPT="${COMPARE_SCRIPT:-scripts/compare-performance.js}"
REGRESSION_THRESHOLD="${REGRESSION_THRESHOLD:-20}"

mkdir -p "$RESULTS_DIR"

echo "🚀 Starting load tests for scoopdope API"
echo "API URL: $API_URL"
echo "API Prefix: $API_PREFIX"
echo "Baseline: $BASELINE_FILE"
echo "Regression threshold: ${REGRESSION_THRESHOLD}%"
echo ""

if [ ! -f "$BASELINE_FILE" ]; then
  echo "❌ Baseline file not found: $BASELINE_FILE" >&2
  exit 1
fi

# Compare a scenario's results against the committed baseline.
# Exits non-zero when p95 regresses beyond the allowed threshold.
# Usage: compare_against_baseline <scenario> <results-file>
compare_against_baseline() {
  local scenario="$1"
  local results_file="$2"

  echo "🔍 Comparing ${scenario} against baseline"
  node "$COMPARE_SCRIPT" \
    --baseline "$BASELINE_FILE" \
    --results "$results_file" \
    --scenario "$scenario" \
    --threshold "$REGRESSION_THRESHOLD"
  echo ""
}
=======

# Run a k6 test and fail if no 200 responses were observed.
# Usage: run_load_test <name> <vus> <duration> <script> <output-file>
run_load_test() {
  local name="$1"
  local vus="$2"
  local duration="$3"
  local script="$4"
  local out_file="$5"

  echo "📊 ${name} (${vus} VUs, ${duration} duration)"
  k6 run \
    --vus "$vus" \
    --duration "$duration" \
    --env API_URL="$API_URL" \
    --env API_PREFIX="$API_PREFIX" \
    --out json="$out_file" \
    "$script"

  # Verify that at least one response returned HTTP 200.
  # If every request 404s (e.g. wrong path prefix), the test is meaningless.
  local ok_count
  ok_count=$(grep -c '"status":200' "$out_file" 2>/dev/null || true)
  if [ "${ok_count:-0}" -eq 0 ]; then
    echo "❌ ${name} produced no 200 responses — check API_URL/API_PREFIX (${API_URL}${API_PREFIX})" >&2
    exit 1
  fi
  echo "✅ ${name}: ${ok_count} successful (200) responses"
  echo ""
}

# Test 1: GET /api/v1/courses (500 VUs)
run_load_test \
  "Test 1: GET ${API_PREFIX}/courses" \
  500 \
  30s \
  scripts/load-tests/courses.js \
  "$RESULTS_DIR/courses-load-test.json"
compare_against_baseline \
  "courses" \
  "$RESULTS_DIR/courses-load-test.json"

# Test 2: POST /api/v1/auth/login (100 VUs)
run_load_test \
  "Test 2: POST ${API_PREFIX}/auth/login" \
  100 \
  30s \
  scripts/load-tests/auth-login.js \
  "$RESULTS_DIR/login-load-test.json"
compare_against_baseline \
  "auth-login" \
  "$RESULTS_DIR/login-load-test.json"

# Test 3: GET /api/v1/stellar/balance/:key (50 VUs)
run_load_test \
  "Test 3: GET ${API_PREFIX}/stellar/balance/:key" \
  50 \
  30s \
  scripts/load-tests/stellar-balance.js \
  "$RESULTS_DIR/stellar-balance-load-test.json"
compare_against_baseline \
  "stellar-balance" \
  "$RESULTS_DIR/stellar-balance-load-test.json"

echo "✅ Load tests completed!"
echo "Results saved to: $RESULTS_DIR"