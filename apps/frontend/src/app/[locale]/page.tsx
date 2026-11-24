import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { headers } from 'next/headers';
import { ProtectedRoute } from '@/components/ProtectedRoute';

export default function HomePage() {
  const t = useTranslations('home');
  const nonce = headers().get('x-nonce') ?? undefined;

  return (
    <ProtectedRoute>
      <main className="min-h-screen flex flex-col items-center justify-center p-8 bg-white dark:bg-gray-900 transition-colors">
        <h1 className="text-4xl font-bold mb-4 text-gray-900 dark:text-white">
          {t('title')}
        </h1>
        <p className="text-lg text-gray-700 dark:text-gray-300 mb-8 text-center max-w-xl">
          {t('description')}
        </p>
        <div className="flex gap-4 flex-wrap justify-center">
          <Link
            href="/courses"
            className="px-6 py-3 bg-blue-700 dark:bg-blue-600 text-white rounded-lg hover:bg-blue-800 dark:hover:bg-blue-500 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:focus-visible:ring-blue-400 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900"
          >
            {t('browseCourses')}
          </Link>
          <Link
            href="/auth/register"
            className="px-6 py-3 border-2 border-blue-700 dark:border-blue-400 text-blue-700 dark:text-blue-400 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:focus-visible:ring-blue-400 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900"
          >
            {t('getStarted')}
          </Link>
        </div>
        {nonce ? (
          <script nonce={nonce} dangerouslySetInnerHTML={{ __html: '' }} />
        ) : null}
      </main>
    </ProtectedRoute>
  );
}