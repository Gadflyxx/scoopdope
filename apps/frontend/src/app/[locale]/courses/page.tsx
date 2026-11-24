import dynamic from 'next/dynamic';
import CoursesPage from '@/app/courses/page';

// Heavy below-the-fold components are loaded lazily to keep the initial
// course catalog chunk small. `ssr: false` avoids shipping their code in the
// server-rendered payload and defers hydration until needed.
const CoursePreviewModal = dynamic(
  () => import('@/components/courses/CoursePreviewModal'),
  {
    ssr: false,
    loading: () => (
      <div
        role="status"
        aria-live="polite"
        className="animate-pulse rounded-lg bg-gray-200 p-6"
      >
        <span className="sr-only">Loading course preview…</span>
      </div>
    ),
  },
);

const RichTextDescription = dynamic(
  () => import('@/components/courses/RichTextDescription'),
  {
    ssr: false,
    loading: () => (
      <div
        role="status"
        aria-live="polite"
        className="animate-pulse space-y-2"
      >
        <div className="h-4 w-3/4 rounded bg-gray-200" />
        <div className="h-4 w-full rounded bg-gray-200" />
        <div className="h-4 w-5/6 rounded bg-gray-200" />
        <span className="sr-only">Loading course description…</span>
      </div>
    ),
  },
);

export { CoursePreviewModal, RichTextDescription };

export default CoursesPage;