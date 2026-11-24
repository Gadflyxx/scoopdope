import type { Metadata } from 'next';
import Link from 'next/link';
import Script from 'next/script';
import { headers } from 'next/headers';

export const metadata: Metadata = {
  title: 'Home',
};

export default function HomePage() {
  // Per-request CSP nonce generated in middleware and forwarded via headers.
  const nonce = headers().get('x-nonce') ?? undefined;

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8 bg-white dark:bg-gray-900">
      {/* Single h1 per page — required for proper heading hierarchy */}
      <h1 className="text-4xl font-bold mb-4 text-gray-900 dark:text-white">scoopdope</h1>
      <p className="text-lg text-gray-600 dark:text-gray-300 mb-8 text-center max-w-xl">
        Blockchain education platform built on the Stellar network. Earn verifiable on-chain
        credentials as you learn.
      </p>
      {/* Use <nav> to give the landmark region a semantic role */}
      <nav aria-label="Get started" className="flex flex-wrap gap-4 justify-center">
        <Link
          href="/courses"
          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:focus-visible:ring-blue-400 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900 transition-colors"
        >
          Browse Courses
        </Link>
        <Link
          href="/auth/register"
          className="px-6 py-3 border border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:focus-visible:ring-blue-400 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900 transition-colors"
        >
          Get Started
        </Link>
      </nav>
      {/* Inline script carries the per-request nonce so it satisfies the CSP */}
      <Script id="home-page-init" nonce={nonce} strategy="afterInteractive">
        {`window.__scoopdopeHomeReady = true;`}
      </Script>
    </main>
  );
}
