/**
 * Shared course-related types used by both frontend and backend.
 * @module course.types
 */

/** Possible course difficulty levels */
export type CourseLevel = 'beginner' | 'intermediate' | 'advanced';

/** Supported course languages (ISO 639-1 codes) */
export type CourseLanguage = 'en' | 'fr' | 'ar' | 'es';

/** Lifecycle status of a course */
export type CourseStatus = 'draft' | 'scheduled' | 'published';

/**
 * Public course summary — used in list views and search results.
 */
export interface CourseSummary {
  id: string;
  title: string;
  description: string;
  level: CourseLevel;
  language: CourseLanguage;
  durationHours: number;
  status: CourseStatus;
  instructorId: string | null;
  requiresKyc: boolean;
  averageRating: number | null;
  createdAt: string;
}

/**
 * DTO for creating a new course.
 */
export interface CreateCourseDto {
  /** Min 3 characters, HTML stripped */
  title: string;
  /** Min 10 characters, HTML stripped */
  description: string;
  level?: CourseLevel;
  language?: CourseLanguage;
  durationHours?: number;
  requiresKyc?: boolean;
}

/**
 * DTO for updating an existing course.
 * All fields are optional.
 */
export interface UpdateCourseDto {
  title?: string;
  description?: string;
  level?: CourseLevel;
  durationHours?: number;
  isPublished?: boolean;
}

/**
 * Query parameters for filtering and paginating courses.
 */
export interface CourseQueryDto {
  search?: string;
  level?: CourseLevel;
  language?: CourseLanguage;
  status?: CourseStatus;
  instructorId?: string;
  page?: number;
  limit?: number;
  sortBy?: 'createdAt' | 'title' | 'averageRating';
  sortOrder?: 'ASC' | 'DESC';
}

/**
 * DTO for creating a course module.
 */
export interface CreateModuleDto {
  title: string;
  description?: string;
  order: number;
}

/**
 * DTO for creating a lesson within a module.
 */
export interface CreateLessonDto {
  title: string;
  content?: string;
  videoUrl?: string;
  durationMinutes?: number;
  order: number;
}

/**
 * DTO for scheduling a course to be published at a future time.
 */
export interface ScheduleCourseDto {
  /** ISO 8601 datetime string */
  scheduledAt: string;
}

/**
 * DTO for submitting a course review.
 */
export interface CreateReviewDto {
  /** 1–5 */
  rating: number;
  /** Optional review text */
  comment?: string;
}

/**
 * A single week in an instructor analytics time series.
 */
export interface InstructorAnalyticsWeek {
  /** ISO 8601 date of the week start (Monday) */
  weekStart: string;
  enrollments: number;
  revenue: number;
  completionRate: number;
}

/**
 * Per-course analytics row for an instructor.
 */
export interface InstructorAnalyticsCourseRow {
  courseId: string;
  title: string;
  enrollments: number;
  revenue: number;
  /** 0–1 */
  completionRate: number;
}

/**
 * Aggregated analytics summary for the authenticated instructor.
 */
export interface InstructorAnalyticsSummary {
  courses: InstructorAnalyticsCourseRow[];
  /** Weekly breakdown for the last 12 weeks */
  weekly: InstructorAnalyticsWeek[];
  totals: {
    enrollments: number;
    revenue: number;
    /** 0–1 */
    completionRate: number;
  };
}

/**
 * A downloadable resource attached to a lesson.
 */
export interface LessonResource {
  id: string;
  lessonId: string;
  filename: string;
  sizeBytes: number;
  mimeType: string;
  createdAt: string;
}

/**
 * DTO for attaching a resource to a lesson.
 */
export interface CreateLessonResourceDto {
  filename: string;
  storageKey: string;
  sizeBytes: number;
  mimeType: string;
}

/**
 * Response for a resource download request.
 */
export interface LessonResourceDownload {
  url: string;
  /** ISO 8601 datetime when the signed URL expires */
  expiresAt: string;
}

/**
 * A timestamped note taken by a learner on a lesson.
 */
export interface Note {
  id: string;
  lessonId: string;
  courseId: string;
  content: string;
  /** Position in the lesson video, in seconds */
  timestampSeconds: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * DTO for creating a note.
 */
export interface CreateNoteDto {
  /** Min 1 character, HTML stripped */
  content: string;
  /** Position in the lesson video, in seconds */
  timestampSeconds: number;
}

/**
 * DTO for updating an existing note.
 * All fields are optional.
 */
export interface UpdateNoteDto {
  content?: string;
  timestampSeconds?: number;
}
