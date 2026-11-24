'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface MonthlyRevenuePoint {
  month: string;
  revenue: number;
}

interface RevenueSummary {
  mrr: number;
  totalRevenue: number;
  payoutLiability: number;
  refundRate: number;
  monthlyRevenue: MonthlyRevenuePoint[];
}

const REFRESH_INTERVAL_MS = 60_000;
const REFUND_RATE_ALERT_THRESHOLD = 0.05;

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

function formatPercent(value: number): string {
  return `${(Number.isFinite(value) ? value * 100 : 0).toFixed(2)}%`;
}

function normalizeSummary(raw: unknown): RevenueSummary {
  const data = (raw ?? {}) as Record<string, unknown>;
  const monthly = Array.isArray(data.monthlyRevenue)
    ? (data.monthlyRevenue as Array<Record<string, unknown>>)
    : Array.isArray(data.revenueTimeSeries)
      ? (data.revenueTimeSeries as Array<Record<string, unknown>>)
      : [];

  return {
    mrr: Number(data.mrr ?? 0),
    totalRevenue: Number(data.totalRevenue ?? 0),
    payoutLiability: Number(data.payoutLiability ?? 0),
    refundRate: Number(data.refundRate ?? 0),
    monthlyRevenue: monthly.map((point) => ({
      month: String(point.month ?? point.date ?? ''),
      revenue: Number(point.revenue ?? point.amount ?? 0),
    })),
  };
}

function RevenueChart({ data }: { data: MonthlyRevenuePoint[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-gray-300 text-sm text-gray-500">
        No revenue data available for the last 12 months.
      </div>
    );
  }

  const maxValue = Math.max(...data.map((point) => point.revenue), 1);

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h2 className="mb-4 text-lg font-semibold text-gray-900">Revenue (Last 12 Months)</h2>
      <div className="flex h-64 items-end gap-2" role="img" aria-label="12-month revenue bar chart">
        {data.map((point, index) => {
          const heightPercent = Math.max((point.revenue / maxValue) * 100, 1);
          return (
            <div key={`${point.month}-${index}`} className="flex flex-1 flex-col items-center justify-end">
              <span className="mb-1 text-xs text-gray-600">{formatCurrency(point.revenue)}</span>
              <div
                className="w-full rounded-t bg-blue-500"
                style={{ height: `${heightPercent}%` }}
                title={`${point.month}: ${formatCurrency(point.revenue)}`}
              />
              <span className="mt-2 truncate text-xs text-gray-500">{point.month}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-medium text-gray-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-gray-900">{value}</p>
      {hint ? <p className="mt-1 text-xs text-gray-400">{hint}</p> : null}
    </div>
  );
}

export default function AdminRevenuePage() {
  const [summary, setSummary] = useState<RevenueSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const isMountedRef = useRef(true);

  const fetchSummary = useCallback(async () => {
    try {
      const response = await fetch('/v1/admin/revenue/summary', {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });

      if (!response.ok) {
        throw new Error(`Failed to load revenue summary (status ${response.status})`);
      }

      const payload = await response.json();
      if (!isMountedRef.current) {
        return;
      }
      setSummary(normalizeSummary(payload));
      setError(null);
      setLastUpdated(new Date());
    } catch (err) {
      if (!isMountedRef.current) {
        return;
      }
      setError(err instanceof Error ? err.message : 'Failed to load revenue summary');
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    void fetchSummary();

    const intervalId = setInterval(() => {
      void fetchSummary();
    }, REFRESH_INTERVAL_MS);

    return () => {
      isMountedRef.current = false;
      clearInterval(intervalId);
    };
  }, [fetchSummary]);

  const refundRateExceeded = summary !== null && summary.refundRate > REFUND_RATE_ALERT_THRESHOLD;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Revenue Dashboard</h1>
          <p className="mt-1 text-sm text-gray-500">
            Platform earnings, instructor payout liability, and transaction health.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated ? (
            <span className="text-xs text-gray-400">
              Updated {lastUpdated.toLocaleTimeString()}
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              void fetchSummary();
            }}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            disabled={loading}
          >
            Refresh
          </button>
        </div>
      </div>

      {refundRateExceeded ? (
        <div
          role="alert"
          className="mb-6 rounded-lg border border-red-300 bg-red-50 p-4 text-red-800"
        >
          <p className="font-semibold">Refund rate alert</p>
          <p className="mt-1 text-sm">
            The refund rate over the last 30 days is {formatPercent(summary!.refundRate)}, which
            exceeds the {formatPercent(REFUND_RATE_ALERT_THRESHOLD)} threshold. Review recent
            transactions for payment processing anomalies.
          </p>
        </div>
      ) : null}

      {error ? (
        <div className="mb-6 rounded-lg border border-red-300 bg-red-50 p-4 text-red-800">
          <p className="font-semibold">Unable to load revenue data</p>
          <p className="mt-1 text-sm">{error}</p>
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              void fetchSummary();
            }}
            className="mt-3 rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      ) : null}

      {loading && summary === null ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="h-28 animate-pulse rounded-lg border border-gray-200 bg-gray-100"
            />
          ))}
        </div>
      ) : null}

      {summary !== null ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="MRR" value={formatCurrency(summary.mrr)} hint="Monthly recurring revenue" />
            <StatCard label="Total Revenue" value={formatCurrency(summary.totalRevenue)} />
            <StatCard
              label="Payout Liability"
              value={formatCurrency(summary.payoutLiability)}
              hint="Sum of pending instructor payouts"
            />
            <StatCard
              label="Refund Rate (30d)"
              value={formatPercent(summary.refundRate)}
              hint={`Alert threshold: ${formatPercent(REFUND_RATE_ALERT_THRESHOLD)}`}
            />
          </div>

          <RevenueChart data={summary.monthlyRevenue} />
        </div>
      ) : null}
    </div>
  );
}