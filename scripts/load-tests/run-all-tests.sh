#!/bin/bash
set -e

# Load Testing Script for scoopdope
# Runs various load test scenarios and generates reports

API_URL="${API_URL:-http://localhost:3000}"
API_PREFIX="${API_PREFIX:-/api/v1}"
RESULTS_DIR="./load-test-results"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BASELINE_FILE="${BASELINE_FILE:-scripts/load-tests/baselines.json}"
THRESHOLD_PERCENT="${THRESHOLD_PERCENT:-20}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "🚀 Starting scoopdope Load Tests"
echo "API URL: $API_URL"
echo "API Prefix: $API_PREFIX"
echo "Results Directory: $RESULTS_DIR"
echo "Baseline File: $BASELINE_FILE"
echo "Regression Threshold: ${THRESHOLD_PERCENT}%"

# Create results directory
mkdir -p "$RESULTS_DIR"

# Check if k6 is installed
if ! command -v k6 &> /dev/null; then
    echo "❌ k6 is not installed. Please install it first:"
    echo "   https://k6.io/docs/getting-started/installation/"
    exit 1
fi

# Check if node is installed (required for parsing/comparison)
if ! command -v node &> /dev/null; then
    echo "❌ node is not installed. It is required to parse and compare results."
    exit 1
fi

# Verify baseline file exists
if [ ! -f "$BASELINE_FILE" ]; then
    echo "❌ Baseline file not found: $BASELINE_FILE"
    echo "   Commit a baseline JSON file before running regression checks."
    exit 1
fi

# Track scenarios that regressed
REGRESSED_SCENARIOS=()
SUMMARY_ROWS=()
======

# Function to run a load test
run_test() {
    local test_name=$1
    local test_file=$2
    local description=$3

    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "📊 Running: $test_name"
    echo "📝 Description: $description"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    local output_file="$RESULTS_DIR/${test_name}_${TIMESTAMP}.json"

    k6 run \
        --out json="$output_file" \
        --env API_URL="$API_URL" \
        --env API_PREFIX="$API_PREFIX" \
        "scripts/load-tests/$test_file"

    local exit_code=$?

    # Fail the run if k6 failed (e.g. smoke assertion for 200 responses failed)
    if [ $exit_code -ne 0 ]; then
        echo "❌ Test '$test_name' failed (exit code $exit_code)."
        echo "   This usually means no successful (200) responses were received."
        echo "   Check that API_URL ($API_URL) and API_PREFIX ($API_PREFIX) are correct."
        exit $exit_code
    fi

    # Verify the test produced at least one successful (200) response
    if [ -f "$output_file" ]; then
        local ok_count
        ok_count=$(grep -c '"status":200' "$output_file" 2>/dev/null || true)
        if [ "${ok_count:-0}" -eq 0 ]; then
            echo "❌ Test '$test_name' produced no 200 responses."
            echo "   The load test likely targeted wrong paths (expected prefix: $API_PREFIX)."
            exit 1
        fi
        echo "✅ Test completed with $ok_count successful (200) responses. Results saved to: $output_file"
    else
        echo "❌ Test '$test_name' did not produce a results file: $output_file"
        exit 1
    fi

    # Parse k6 results into a normalized metrics file
    local metrics_file="$RESULTS_DIR/${test_name}_${TIMESTAMP}_metrics.json"
    echo "🔍 Parsing results for '$test_name'..."
    if ! node "$SCRIPT_DIR/parse-k6-results.js" "$output_file" > "$metrics_file"; then
        echo "❌ Failed to parse results for '$test_name'."
        exit 1
    fi

    # Compare against baseline
    local comparison_file="$RESULTS_DIR/${test_name}_${TIMESTAMP}_comparison.json"
    echo "📐 Comparing '$test_name' against baseline..."
    node "$SCRIPT_DIR/compare-performance.js" \
        --baseline "$BASELINE_FILE" \
        --current "$metrics_file" \
        --scenario "$test_name" \
        --threshold "$THRESHOLD_PERCENT" \
        --output "$comparison_file"

    local compare_exit=$?

    # Extract p95 values for the summary table
    local baseline_p95 current_p95 regression_pct status
    baseline_p95=$(node -e "try{const d=require('$comparison_file');console.log(d.baselineP95 ?? 'n/a')}catch(e){console.log('n/a')}")
    current_p95=$(node -e "try{const d=require('$comparison_file');console.log(d.currentP95 ?? 'n/a')}catch(e){console.log('n/a')}")
    regression_pct=$(node -e "try{const d=require('$comparison_file');console.log(d.regressionPercent ?? 'n/a')}catch(e){console.log('n/a')}")

    if [ $compare_exit -ne 0 ]; then
        status="❌ FAIL"
        REGRESSED_SCENARIOS+=("$test_name")
        echo "❌ Regression detected for '$test_name' (p95 ${baseline_p95}ms → ${current_p95}ms, ${regression_pct}% change)."
    else
        status="✅ PASS"
        echo "✅ No regression for '$test_name' (p95 ${baseline_p95}ms → ${current_p95}ms, ${regression_pct}% change)."
    fi

    SUMMARY_ROWS+=("$(printf '%-20s | %12s | %12s | %10s | %s' "$test_name" "$baseline_p95" "$current_p95" "$regression_pct" "$status")")
}

# Run all tests
run_test "user-journey" "user-journey.js" \
    "Realistic user journey: register → login → browse → enroll → learn"

run_test "high-concurrency" "high-concurrency.js" \
    "High concurrency test with 1000-10000 concurrent users"

run_test "stress-test" "stress-test.js" \
    "Stress test to find breaking points"

# Generate summary report
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📈 Load Test Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Count test files
test_count=$(ls -1 "$RESULTS_DIR"/*_${TIMESTAMP}.json 2>/dev/null | wc -l)
echo "✅ Completed $test_count load tests"
echo "📁 Results saved in: $RESULTS_DIR"

# Display file sizes
echo ""
echo "Test Results:"
ls -lh "$RESULTS_DIR"/*_${TIMESTAMP}.json 2>/dev/null | awk '{print "  - " $9 " (" $5 ")"}'

# Display regression summary table
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 Performance Regression Summary (threshold: ${THRESHOLD_PERCENT}%)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
printf '%-20s | %12s | %12s | %10s | %s\n' "Scenario" "Baseline p95" "Current p95" "Change" "Status"
echo "----------------------------------------------------------------------------------------"
for row in "${SUMMARY_ROWS[@]}"; do
    echo "$row"
done
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ ${#REGRESSED_SCENARIOS[@]} -gt 0 ]; then
    echo ""
    echo "❌ Performance regression detected in: ${REGRESSED_SCENARIOS[*]}"
    echo "   One or more scenarios exceeded the ${THRESHOLD_PERCENT}% p95 threshold."
    exit 1
fi

echo ""
echo "✨ Load testing completed successfully with no regressions!"
echo ""
echo "Next steps:"
echo "  1. Review results in: $RESULTS_DIR"
echo "  2. Analyze performance metrics"
echo "  3. Identify bottlenecks"
echo "  4. Optimize as needed"
