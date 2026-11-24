# Access Control Flow

This document summarizes the evaluation order used by the backend access-control service for course and content access.

## Evaluation Precedence

The service treats access checks as a strict precedence chain:

1. Explicit revoke
2. Time-limited grant
3. Subscription tier
4. Default deny

A user is denied immediately when the first matching denial signal appears. The service does not fall back to a later, less specific grant once a higher-precedence condition has blocked access.

## Course Visibility Levels

Courses carry one of four visibility levels. These rules are enforced uniformly at the service layer (course detail, lesson, and resource endpoints) so that knowing a course ID is never sufficient to access protected content.

| Level | Unauthenticated | Non-enrolled (authenticated) | Enrolled learner |
| --- | --- | --- | --- |
| `public` | Allowed | Allowed | Allowed |
| `unlisted` | Allowed (not listed in search) | Allowed (not listed in search) | Allowed |
| `enrolled_only` | Denied | Denied | Allowed |
| `private` | Denied | Denied | Allowed |

- **`public`** — Visible in search results and accessible to everyone.
- **`unlisted`** — Accessible to anyone with the link/ID, but excluded from search results and other listings.
- **`enrolled_only`** — Accessible only to authenticated learners who are enrolled in (or have purchased) the course. Unauthenticated and non-enrolled users are denied.
- **`private`** — Accessible only to enrolled learners; never visible in search results or listings.

## AccessControlGuard Evaluation Order

The `AccessControlGuard` (built on the existing `access-control` module) wraps the course detail, lesson, and resource endpoints. It evaluates visibility before the general access precedence chain:

1. Resolve the course and its visibility level.
2. If visibility is `enrolled_only` or `private`, require an authenticated user; deny unauthenticated requests.
3. If visibility is `enrolled_only` or `private`, require an active enrollment or purchase; deny non-enrolled users.
4. Apply the general access precedence chain (explicit revoke → time-limited grant → subscription tier → default deny) as described above.

A denial at any step short-circuits the chain; the guard does not fall back to a later, less specific grant.

## Search Filtering

Search and listing endpoints apply visibility filtering before returning results:

- `private` courses are never included in search results.
- `unlisted` courses are excluded from search results and listings but remain accessible by direct ID/link.
- `public` courses are included in search results.
- `enrolled_only` courses are included in search results only for learners who are enrolled; they are omitted for unauthenticated and non-enrolled users.

## Flow Diagram

```text
Start
  |
  v
Load access record for (courseId, userId)
  |
  +--> No record or record inactive?
  |       |
  |       +--> Deny: explicit revoke / no access granted
  |
  +--> Time-limited grant expired?
  |       |
  |       +--> Deny: access pass expired
  |
  +--> Subscription tier valid?
          |
          +--> Allow access
          |
          +--> Deny: default deny
```

## Notes

- Explicit revocation is represented by an inactive access record and takes precedence over any other grant state.
- Time-limited grants are checked before subscription-tier access is treated as valid.
- Content access uses the same precedence order as general course access, with additional logging for content-specific denials.
- Visibility checks run before the general precedence chain, so a `private` or `enrolled_only` course denies unauthenticated and non-enrolled users regardless of any other grant state.
- The service logs each denial branch separately so maintainers can see why a request was blocked.