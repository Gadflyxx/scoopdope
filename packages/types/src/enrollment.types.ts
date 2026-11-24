/**
 * Shared enrollment-related types.
 * @module enrollment.types
 */

/**
 * Enrollment record linking a user to a course.
 */
export interface Enrollment {
  id: string;
  userId: string;
  courseId: string;
  enrolledAt: string;
  /** Content version frozen at enrollment time (null if not yet set) */
  enrolledVersionNumber: number | null;
  /** Latest published content version of the course */
  latestVersion: number;
}

/**
 * Event payload emitted when a user enrolls in a course.
 */
export interface EnrollmentCreatedEvent {
  enrollmentId: string;
  userId: string;
  courseId: string;
  enrolledAt: string;
}

/**
 * DTO for recording lesson/course progress.
 */
export interface RecordProgressDto {
  /** UUID of the course */
  courseId: string;
  /** UUID of the lesson (optional — omit for course-level progress) */
  lessonId?: string;
  /** Progress percentage 0–100 */
  progressPct: number;
}

/**
 * Progress record for a user in a course.
 */
export interface ProgressRecord {
  id: string;
  userId: string;
  courseId: string;
  lessonId: string | null;
  progressPct: number;
  updatedAt: string;
}

/**
 * A single user/course pair to enroll as part of a batch.
 */
export interface BatchEnrollmentItem {
  /** UUID of the user to enroll */
  userId: string;
  /** UUID of the course to enroll the user in */
  courseId: string;
}

/**
 * Request body for submitting a batch enrollment job.
 * Accepts up to 500 items.
 */
export interface BatchEnrollmentRequest {
  items: BatchEnrollmentItem[];
}

/**
 * Lifecycle status of a batch enrollment job.
 */
export type BatchEnrollmentJobStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed';

/**
 * Per-user outcome of a batch enrollment job.
 */
export interface BatchEnrollmentResult {
  userId: string;
  courseId: string;
  success: boolean;
  /** Human-readable error message when `success` is false */
  error?: string;
}