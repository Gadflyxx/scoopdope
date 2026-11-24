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
 * Portable course export/import format — version 1.
 * Used by `GET /v1/courses/:id/export` and `POST /v1/courses/import`.
 * Video files are never embedded; only references (URLs) are stored.
 */

/** Schema version marker for the portable export format */
export type CourseExportVersion = 1;

/**
 * A lesson within an exported module.
 * `id` is the source identifier used to resolve `prerequisiteLessonIds`.
 */
export interface CourseExportLesson {
  /** Source lesson identifier (stable within the export payload) */
  id: string;
  title: string;
  content?: string;
  /** Reference to a video asset — never the file itself */
  videoUrl?: string;
  durationMinutes?: number;
  order: number;
  /** IDs of lessons that must be completed first (must not form a cycle) */
  prerequisiteLessonIds?: string[];
}

/**
 * A quiz attached to an exported module.
 */
export interface CourseExportQuiz {
  /** Source quiz identifier (stable within the export payload) */
  id: string;
  title: string;
  description?: string;
  /** Minimum score (0–100) required to pass */
  passingScore?: number;
  questions: CourseExportQuizQuestion[];
}

/**
 * A single question within an exported quiz.
 */
export interface CourseExportQuizQuestion {
  id: string;
  prompt: string;
  /** Answer options; at least two required */
  options: CourseExportQuizOption[];
  /** Index into `options` of the correct answer */
  correctOptionIndex: number;
}

/**
 * An answer option for an exported quiz question.
 */
export interface CourseExportQuizOption {
  id: string;
  text: string;
}

/**
 * A module (section) within an exported course.
 */
export interface CourseExportModule {
  /** Source module identifier (stable within the export payload) */
  id: string;
  title: string;
  description?: string;
  order: number;
  lessons: CourseExportLesson[];
  quizzes?: CourseExportQuiz[];
}

/**
 * Portable course export payload — version 1.
 * Course metadata plus the full module/lesson/quiz structure.
 */
export interface CourseExportV1 {
  version: CourseExportVersion;
  exportedAt: string;
  course: {
    /** Source course identifier, if exported from an existing course */
    id?: string;
    title: string;
    description: string;
    level: CourseLevel;
    language: CourseLanguage;
    durationHours: number;
    requiresKyc: boolean;
  };
  modules: CourseExportModule[];
}

/**
 * A single field-level validation error produced while parsing an import.
 */
export interface ImportValidationError {
  /** JSON path to the offending field, e.g. `modules[0].lessons[1].title` */
  path: string;
  /** Machine-readable error code, e.g. `required`, `invalid_type`, `cycle` */
  code: string;
  /** Human-readable message */
  message: string;
}

/**
 * Result of a course import operation.
 */
export interface ImportResult {
  /** Whether the import completed successfully */
  success: boolean;
  /** ID of the created or updated course (present on success) */
  courseId?: string;
  /** Whether an existing course was updated rather than created */
  updated?: boolean;
  /** Field-level errors (present when `success` is false) */
  errors?: ImportValidationError[];
}
