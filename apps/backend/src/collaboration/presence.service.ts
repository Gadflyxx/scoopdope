import { Injectable, Logger } from '@nestjs/common';

export interface InstructorPresence {
  instructorId: string;
  courseId: string;
  joinedAt: number;
  lastSeenAt: number;
  /** Resource the instructor is currently editing, if known. */
  editingResource?: string;
}

export interface CourseUpdateResult {
  accepted: boolean;
  currentVersion: number;
  conflict: boolean;
}

/**
 * In-memory tracker of instructor presence per course plus a per-course
 * version counter used for last-write-wins conflict detection on edits.
 *
 * Presence is intentionally kept in memory (per backend instance); for a
 * multi-instance deployment this would be backed by Redis, but the API stays
 * the same so the gateway does not change.
 */
/** Participants with no heartbeat for this long are treated as disconnected. */
export const PRESENCE_TTL_MS = 60_000;

@Injectable()
export class PresenceService {
  private readonly logger = new Logger(PresenceService.name);
  private readonly presence = new Map<string, Map<string, InstructorPresence>>();
  private readonly courseVersions = new Map<string, number>();

  join(courseId: string, instructorId: string, editingResource?: string): InstructorPresence {
    let courseMap = this.presence.get(courseId);
    if (!courseMap) {
      courseMap = new Map();
      this.presence.set(courseId, courseMap);
    }
    const now = Date.now();
    const entry: InstructorPresence = {
      instructorId,
      courseId,
      joinedAt: now,
      lastSeenAt: now,
      editingResource,
    };
    courseMap.set(instructorId, entry);
    this.logger.log(`instructor ${instructorId} joined course ${courseId}`);
    return entry;
  }

  leave(courseId: string, instructorId: string): void {
    const courseMap = this.presence.get(courseId);
    if (courseMap) {
      courseMap.delete(instructorId);
      if (courseMap.size === 0) this.presence.delete(courseId);
    }
    this.logger.log(`instructor ${instructorId} left course ${courseId}`);
  }

  /**
   * Fully remove a participant from every course they are tracked in.
   * Used by gateway disconnect handling so stale client references do not
   * accumulate in memory. Empty course maps are pruned as well.
   * Returns the course ids the participant was removed from.
   */
  remove(instructorId: string): string[] {
    const removedFrom: string[] = [];
    for (const [courseId, courseMap] of this.presence) {
      if (courseMap.delete(instructorId)) {
        removedFrom.push(courseId);
        if (courseMap.size === 0) this.presence.delete(courseId);
      }
    }
    if (removedFrom.length > 0) {
      this.logger.log(
        `instructor ${instructorId} removed from courses ${removedFrom.join(', ')}`,
      );
    }
    return removedFrom;
  }

  /**
   * Report the current in-memory map sizes. Intended for tests that assert
   * memory/state returns to baseline after clients disconnect.
   */
  getStats(): { courseCount: number; participantCount: number; versionCount: number } {
    let participantCount = 0;
    for (const courseMap of this.presence.values()) {
      participantCount += courseMap.size;
    }
    return {
      courseCount: this.presence.size,
      participantCount,
      versionCount: this.courseVersions.size,
    };
  }

  /** Refresh the last-seen heartbeat for an instructor. */
  touch(courseId: string, instructorId: string): void {
    const entry = this.presence.get(courseId)?.get(instructorId);
    if (entry) entry.lastSeenAt = Date.now();
  }

  getActive(courseId: string): InstructorPresence[] {
    const courseMap = this.presence.get(courseId);
    return courseMap ? Array.from(courseMap.values()) : [];
  }

  isPresent(courseId: string, instructorId: string): boolean {
    return this.presence.get(courseId)?.has(instructorId) ?? false;
  }

  /**
   * Remove participants whose last heartbeat is older than the TTL.
   * Returns the removed entries grouped by course so the gateway can
   * broadcast an updated participant list for each affected course.
   */
  sweepStale(ttlMs: number = PRESENCE_TTL_MS): Map<string, InstructorPresence[]> {
    const now = Date.now();
    const removed = new Map<string, InstructorPresence[]>();
    for (const [courseId, courseMap] of this.presence) {
      for (const [instructorId, entry] of courseMap) {
        if (now - entry.lastSeenAt > ttlMs) {
          courseMap.delete(instructorId);
          const list = removed.get(courseId) ?? [];
          list.push(entry);
          removed.set(courseId, list);
          this.logger.log(
            `instructor ${instructorId} timed out in course ${courseId} (last seen ${now - entry.lastSeenAt}ms ago)`,
          );
        }
      }
      if (courseMap.size === 0) this.presence.delete(courseId);
    }
    return removed;
  }

  /**
   * Apply a course edit with optimistic-concurrency conflict detection.
   * Returns conflict=true when the client's baseVersion is behind the current
   * server version (another instructor already advanced it). Otherwise the
   * version is incremented and the update is accepted.
   */
  applyCourseUpdate(courseId: string, _instructorId: string, baseVersion: number): CourseUpdateResult {
    const current = this.courseVersions.get(courseId) ?? 0;
    if (baseVersion < current) {
      return { accepted: false, currentVersion: current, conflict: true };
    }
    const next = current + 1;
    this.courseVersions.set(courseId, next);
    this.logger.log(`course ${courseId} advanced to v${next}`);
    return { accepted: true, currentVersion: next, conflict: false };
  }

  getCourseVersion(courseId: string): number {
    return this.courseVersions.get(courseId) ?? 0;
  }
}
