#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const currentFile = process.argv[2];
const baselineFile = process.argv[3];
const updateBaseline = process.argv.includes('--update-baseline');

if (!currentFile || !fs.existsSync(currentFile)) {
  console.error('Usage: compare-performance.js <current.json> <baseline.json> [--update-baseline]');
  process.exit(1);
}

const current = JSON.parse(fs.readFileSync(currentFile, 'utf8'));
const baseline = baselineFile && fs.existsSync(baselineFile)
  ? JSON.parse(fs.readFileSync(baselineFile, 'utf8'))
  : null;

// Maximum allowed regression (as a fraction) before the comparison fails CI.
const REGRESSION_THRESHOLD = 0.20;

// Determine whether the current run contains at least one successful (200) response.
// This guards against wrong-path (all-404) runs being recorded as a new baseline.
function countSuccessfulResponses(result) {
  if (!result || typeof result !== 'object') {
    return 0;
  }

  // Preferred: explicit success counter emitted by the load test scripts.
  if (typeof result.successful_responses === 'number') {
    return result.successful_responses;
  }

  // Fallback: derive from a status-code breakdown if present.
  const statusCodes = result.status_codes || result.statusCodes;
  if (statusCodes && typeof statusCodes === 'object') {
    return Number(statusCodes['200'] || statusCodes[200] || 0);
  }

  // Fallback: derive from a metrics object containing http_req_* counters.
  const metrics = result.metrics || {};
  if (typeof metrics.successful_responses === 'number') {
    return metrics.successful_responses;
  }
  if (typeof metrics.http_reqs_200 === 'number') {
    return metrics.http_reqs_200;
  }

  return 0;
}

const successfulResponses = countSuccessfulResponses(current);

if (successfulResponses <= 0) {
  console.error(
    'ERROR: Current performance results contain no successful (200) responses. ' +
    'This usually indicates the load tests targeted the wrong API path (e.g. missing /api/v1 prefix). ' +
    'Refusing to compare or update the baseline.'
  );
  process.exit(1);
}

// Normalize a results document into a flat map of scenario -> { p95, ... }.
// Supports both a flat `metrics` object and a `scenarios` object where each
// scenario carries its own metrics (e.g. { scenarios: { browse: { p95: 123 } } }).
function extractScenarios(result) {
  const scenarios = {};

  if (!result || typeof result !== 'object') {
    return scenarios;
  }

  if (result.scenarios && typeof result.scenarios === 'object') {
    Object.keys(result.scenarios).forEach(name => {
      const scenario = result.scenarios[name] || {};
      const metrics = scenario.metrics || scenario;
      scenarios[name] = {
        p95: typeof metrics.p95 === 'number' ? metrics.p95 : null,
        metrics,
      };
    });
  }

  // Flat metrics object: treat each metric as its own scenario entry.
  if (result.metrics && typeof result.metrics === 'object') {
    Object.keys(result.metrics).forEach(metric => {
      if (!scenarios[metric]) {
        const value = result.metrics[metric];
        scenarios[metric] = {
          p95: typeof value === 'number' ? value : null,
          metrics: { p95: value },
        };
      }
    });
  }

  return scenarios;
}

const currentScenarios = extractScenarios(current);
const baselineScenarios = extractScenarios(baseline);

const comparison = {
  timestamp: new Date().toISOString(),
  successful_responses: successfulResponses,
  current_metrics: current.metrics,
  baseline_metrics: baseline?.metrics || {},
  metrics: {},
  scenarios: {},
  regressions: [],
};

Object.keys(current.metrics || {}).forEach(metric => {
  const currentValue = current.metrics[metric];
  const baselineValue = baseline?.metrics?.[metric] || currentValue;
  
  comparison.metrics[metric] = {
    baseline: baselineValue,
    current: currentValue,
    change: currentValue - baselineValue,
    change_percent: baselineValue > 0 ? ((currentValue - baselineValue) / baselineValue) * 100 : 0,
  };
});

// Compute before/after p95 per scenario and flag regressions over the threshold.
Object.keys(currentScenarios).forEach(name => {
  const currentP95 = currentScenarios[name].p95;
  const baselineP95 = baselineScenarios[name] ? baselineScenarios[name].p95 : null;

  const changePercent = baselineP95 && baselineP95 > 0 && typeof currentP95 === 'number'
    ? ((currentP95 - baselineP95) / baselineP95) * 100
    : 0;

  const regressed = baselineP95 && baselineP95 > 0 && typeof currentP95 === 'number'
    ? currentP95 > baselineP95 * (1 + REGRESSION_THRESHOLD)
    : false;

  comparison.scenarios[name] = {
    baseline_p95: baselineP95,
    current_p95: currentP95,
    change_percent: changePercent,
    regressed,
  };

  if (regressed) {
    comparison.regressions.push(name);
  }
});

function formatMs(value) {
  return typeof value === 'number' ? `${value.toFixed(2)} ms` : 'n/a';
}

function formatPercent(value) {
  if (typeof value !== 'number' || !isFinite(value)) {
    return 'n/a';
  }
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

function buildMarkdown(comparison) {
  const lines = [];
  lines.push('## Load Test Performance Comparison');
  lines.push('');
  lines.push(`Generated: ${comparison.timestamp}`);
  lines.push('');

  const scenarioNames = Object.keys(comparison.scenarios);
  if (scenarioNames.length === 0) {
    lines.push('_No scenario metrics were found in the results._');
  } else {
    lines.push('| Scenario | Baseline p95 | Current p95 | Change | Status |');
    lines.push('| --- | --- | --- | --- | --- |');
    scenarioNames.forEach(name => {
      const s = comparison.scenarios[name];
      const status = s.regressed ? '❌ Regression' : '✅ OK';
      lines.push(
        `| ${name} | ${formatMs(s.baseline_p95)} | ${formatMs(s.current_p95)} | ${formatPercent(s.change_percent)} | ${status} |`
      );
    });
  }

  lines.push('');
  if (comparison.regressions.length > 0) {
    lines.push(
      `**FAILED:** ${comparison.regressions.length} scenario(s) regressed by more than ` +
      `${(REGRESSION_THRESHOLD * 100).toFixed(0)}% over baseline: ${comparison.regressions.join(', ')}.`
    );
  } else {
    lines.push(`All scenarios within the ${(REGRESSION_THRESHOLD * 100).toFixed(0)}% regression threshold.`);
  }

  return lines.join('\n') + '\n';
}

comparison.markdown = buildMarkdown(comparison);

if (updateBaseline) {
  if (!baselineFile) {
    console.error('ERROR: --update-baseline requires a baseline file path.');
    process.exit(1);
  }

  const baselineDir = path.dirname(baselineFile);
  if (baselineDir && !fs.existsSync(baselineDir)) {
    fs.mkdirSync(baselineDir, { recursive: true });
  }

  fs.writeFileSync(baselineFile, JSON.stringify(current, null, 2) + '\n');
  console.error(`Baseline updated: ${baselineFile}`);
}

process.stdout.write(JSON.stringify(comparison, null, 2) + '\n');

// Emit the markdown summary for PR comments when requested.
if (process.argv.includes('--markdown')) {
  process.stdout.write('\n' + comparison.markdown);
}

if (comparison.regressions.length > 0) {
  console.error(
    `ERROR: Performance regression detected in ${comparison.regressions.length} scenario(s): ` +
    `${comparison.regressions.join(', ')}. ` +
    `p95 exceeded baseline by more than ${(REGRESSION_THRESHOLD * 100).toFixed(0)}%.`
  );
  process.exit(1);
}