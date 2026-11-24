#!/bin/bash

# Health Check Smoke Test Script
# Supports liveness, readiness, startup, and full health probes for load balancer and monitoring integration.

set -e

API_URL="${API_URL:-http://localhost:3000}"
PROBE="${PROBE:-full}"
MAX_RETRIES="${MAX_RETRIES:-30}"
RETRY_INTERVAL="${RETRY_INTERVAL:-5}"
NODE_ENV="${NODE_ENV:-development}"
CHECK_MIGRATIONS="${CHECK_MIGRATIONS:-auto}"
MIGRATION_STATUS_CMD="${MIGRATION_STATUS_CMD:-npx typeorm migration:show -d dist/config/database.config.js}"

case "$PROBE" in
  live|liveness)
    HEALTH_ENDPOINT="${API_URL}/health/live"
    ;;
  ready|readiness)
    HEALTH_ENDPOINT="${API_URL}/health/ready"
    ;;
  startup)
    HEALTH_ENDPOINT="${API_URL}/health/startup"
    ;;
  env|environment)
    HEALTH_ENDPOINT="${API_URL}/health/environment"
    ;;
  version)
    HEALTH_ENDPOINT="${API_URL}/health/version"
    ;;
  full|*)
    HEALTH_ENDPOINT="${API_URL}/health"
    ;;
esac

echo "Health check smoke test"
echo "Endpoint: ${HEALTH_ENDPOINT}"
echo "Probe: ${PROBE}"
echo "Max retries: ${MAX_RETRIES}"
echo "Retry interval: ${RETRY_INTERVAL}s"
echo ""

# Determine whether the migration status check should run.
# Defaults to running only in production, but can be forced on/off via CHECK_MIGRATIONS.
should_check_migrations() {
    case "${CHECK_MIGRATIONS}" in
        true|1|yes|on)
            return 0
            ;;
        false|0|no|off)
            return 1
            ;;
        auto|*)
            if [ "${NODE_ENV}" = "production" ]; then
                return 0
            fi
            return 1
            ;;
    esac
}

# Check for pending migrations and alert/fail if any are reported.
# Returns 0 when no pending migrations are found, 1 when pending migrations exist
# or the status command cannot be executed.
check_migrations() {
    local output
    local exit_code

    echo "Checking migration status..."
    echo "Command: ${MIGRATION_STATUS_CMD}"

    output=$(eval "${MIGRATION_STATUS_CMD}" 2>&1)
    exit_code=$?

    echo "${output}"

    if [ ${exit_code} -ne 0 ]; then
        echo "MIGRATION STATUS CHECK FAILED - Unable to determine migration state"
        echo "ALERT: Schema drift cannot be verified; investigate migration runner immediately"
        return 1
    fi

    # typeorm migration:show marks pending migrations with "[ ]" and applied ones with "[X]".
    if echo "${output}" | grep -q '\[ \]'; then
        echo "PENDING MIGRATIONS DETECTED - Production schema is out of sync with application code"
        echo "ALERT: Run 'typeorm migration:run' before serving traffic"
        return 1
    fi

    echo "Migration status check passed - no pending migrations"
    return 0
}

if should_check_migrations; then
    if ! check_migrations; then
        echo ""
        echo "Health check smoke test FAILED!"
        echo "Pending or unverifiable migrations detected (NODE_ENV=${NODE_ENV})"
        echo "Apply pending migrations and re-run the health check"
        exit 1
    fi
    echo ""
else
    echo "Skipping migration status check (NODE_ENV=${NODE_ENV}, CHECK_MIGRATIONS=${CHECK_MIGRATIONS})"
    echo ""
fi

check_health() {
    local response
    local http_code

    response=$(curl -s -w "HTTPSTATUS:%{http_code}" "${HEALTH_ENDPOINT}" || echo "HTTPSTATUS:000")
    http_code=$(echo "${response}" | tr -d '\n' | sed -e 's/.*HTTPSTATUS://')
    body=$(echo "${response}" | sed -e 's/HTTPSTATUS:.*//g')

    echo "HTTP Status: ${http_code}"

    if [ "${http_code}" -eq 200 ]; then
        echo "Health check passed!"
        echo "Response:"
        echo "${body}" | jq '.' 2>/dev/null || echo "${body}"
        return 0
    elif [ "${http_code}" -eq 503 ]; then
        echo "Health check failed - Service unavailable"
        echo "Response:"
        echo "${body}" | jq '.' 2>/dev/null || echo "${body}"
        return 1
    elif [ "${http_code}" -eq 000 ]; then
        echo "Connection failed - Service not reachable"
        return 1
    else
        echo "Unexpected HTTP status: ${http_code}"
        echo "Response:"
        echo "${body}"
        return 1
    fi
}

retry_count=0
while [ ${retry_count} -lt ${MAX_RETRIES} ]; do
    echo "Attempt $((retry_count + 1))/${MAX_RETRIES}"

    if check_health; then
        echo ""
        echo "Health check smoke test PASSED!"
        echo "Application is healthy and ready to serve traffic"
        exit 0
    fi

    retry_count=$((retry_count + 1))

    if [ ${retry_count} -lt ${MAX_RETRIES} ]; then
        echo "Waiting ${RETRY_INTERVAL}s before next attempt..."
        sleep ${RETRY_INTERVAL}
        echo ""
    fi
done

echo ""
echo "Health check smoke test FAILED!"
echo "Application failed to become healthy after ${MAX_RETRIES} attempts"
echo "Check application logs and configuration"
exit 1
