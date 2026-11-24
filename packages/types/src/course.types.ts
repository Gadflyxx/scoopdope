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

/** Entity types that can appear in search results */
export type SearchResultType = 'course' | 'lesson' | 'instructor';

/** Query parameters for the unified search endpoint */
export interface SearchQueryDto {
  /** Search keyword(s) */
  q: string;
  /** Optional entity type filter */
  type?: SearchResultType;
  page?: number;
  limit?: number;
}

/** Common fields shared by all search result entities */
interface SearchResultBase {
  /** Relevance score (ts_rank), higher is more relevant */
  relevance: number;
}

/** A course matched by the search query */
export interface CourseSearchResult extends SearchResultBase {
  type: 'course';
  id: string;
  title: string;
  description: string;
  level: CourseLevel;
  language: CourseLanguage;
  instructorId: string | null;
}

/** A lesson matched by the search query */
export interface LessonSearchResult extends SearchResultBase {
  type: 'lesson';
  id: string;
  title: string;
  /** Snippet of the lesson body containing the match */
  content: string | null;
  moduleId: string;
  courseId: string;
  courseTitle: string;
}

/** An instructor profile matched by the search query */
export interface InstructorSearchResult extends SearchResultBase {
  type: 'instructor';
  id: string;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
}

/** Discriminated union of all search result entities */
export type SearchResult =
  | CourseSearchResult
  | LessonSearchResult
  | InstructorSearchResult;

/** Paginated response for the unified search endpoint */
export interface SearchResponseDto {
  /** Results ranked by relevance descending */
  results: SearchResult[];
  total: number;
  page: number;
  limit: number;
}
