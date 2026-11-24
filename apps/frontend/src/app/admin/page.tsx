'use client';
import Link from 'next/link';
import { AdminStatsCards } from '@/components/admin/AdminStatsCards';

export default function AdminPage() {
  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Dashboard</h1>
      <AdminStatsCards />
      <div className="mt-6">
        <Link
          href="/admin/revenue"
          className="block rounded-lg border border-gray-200 bg-white p-6 shadow-sm transition hover:shadow-md"
        >
          <h2 className="text-xl font-semibold mb-2">Revenue</h2>
          <p className="text-gray-600">
            View MRR, total revenue, payout liability, refund rate, and the 12-month revenue
            time series.
          </p>
        </Link>
      </div>
    </div>
  );
}