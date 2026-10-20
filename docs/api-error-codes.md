# API Error Codes & Reference

This document provides a comprehensive catalog of all numeric error codes returned by the scoopdope REST API, their meanings, causes, standard payload structure, and recommended client-side error handling procedures.

---

## Table of Contents

1. [Standard Error Response Format](#1-standard-error-response-format)
2. [HTTP Status & Error Code Summary](#2-http-status--error-code-summary)
3. [Client Error Codes (4xx)](#3-client-error-codes-4xx)
   - [400 Bad Request](#400-bad-request)
   - [401 Unauthorized](#401-unauthorized)
   - [403 Forbidden](#403-forbidden)
   - [404 Not Found](#404-not-found)
   - [405 Method Not Allowed](#405-method-not-allowed)
   - [408 Request Timeout](#408-request-timeout)
   - [409 Conflict](#409-conflict)
   - [410 Gone](#410-gone)
   - [413 Payload Too Large](#413-payload-too-large)
   - [415 Unsupported Media Type](#415-unsupported-media-type)
   - [422 Unprocessable Entity](#422-unprocessable-entity)
   - [429 Too Many Requests](#429-too-many-requests)
4. [Server Error Codes (5xx)](#4-server-error-codes-5xx)
   - [500 Internal Server Error](#500-internal-server-error)
   - [501 Not Implemented](#501-not-implemented)
   - [502 Bad Gateway](#502-bad-gateway)
   - [503 Service Unavailable](#503-service-unavailable)
   - [504 Gateway Timeout](#504-gateway-timeout)
5. [Client Handling & Best Practices](#5-client-handling--best-practices)

---

## 1. Standard Error Response Format

All error responses from the scoopdope API share a uniform JSON shape, defined by `ErrorResponseDto` and enforced globally by `HttpExceptionFilter`:

```json
{
  "statusCode": 404,
  "error": "Not Found",
  "message": "Course not found",
  "details": null,
  "timestamp": "2026-09-30T12:00:00.000Z",
  "correlationId": "c1d2e3f4-aaaa-bbbb-cccc-000000000000",
  "path": "/api/v1/courses/999"
}
```

### Response Field Descriptions

| Field | Type | Description |
|-------|------|-------------|
| `statusCode` | `number` | Numeric HTTP status code representing the error condition. |
| `error` | `string` | Canonical HTTP status phrase (e.g. `"Bad Request"`, `"Forbidden"`). |
| `message` | `string` | Human-readable explanation of why the error occurred. |
| `details` | `string[] \| null` | Optional array of field-level validation errors (present during `400 Bad Request`). |
| `timestamp` | `string` | ISO 8601 UTC timestamp when the exception was caught. |
| `correlationId` | `string \| undefined` | Unique request trace ID from the `X-Correlation-Id` header for debugging. |
| `path` | `string` | The URL path of the request that triggered the error. |

---

## 2. HTTP Status & Error Code Summary

| Code | HTTP Phrase | Common Triggers | Client Action |
|------|-------------|-----------------|---------------|
| **400** | `Bad Request` | Validation failure, malformed JSON, invalid query params | Correct request payload and retry |
| **401** | `Unauthorized` | Missing, expired, or invalid JWT access token | Authenticate or refresh token |
| **402** | `Payment Required` | Unpaid course enrollment, insufficient BST balance | Complete checkout or fund balance |
| **403** | `Forbidden` | User lacks required role (e.g., student calling admin route) | Do not retry without elevated permissions |
| **404** | `Not Found` | Entity (course, user, certificate) does not exist | Verify ID/slug before retrying |
| **405** | `Method Not Allowed` | Calling unsupported HTTP verb (e.g., `POST` on read-only route) | Check API route definition |
| **408** | `Request Timeout` | Network timeout waiting for request body | Retry request with reliable connection |
| **409** | `Conflict` | Resource collision (duplicate email, duplicate registration) | Change unique field value |
| **410** | `Gone` | Resource permanently deleted or deprecated | Update client to active resource |
| **413** | `Payload Too Large` | Upload exceeds maximum file size limit (e.g. course assets) | Compress file before uploading |
| **415** | `Unsupported Media Type`| Non-JSON content type sent to JSON endpoint | Set `Content-Type: application/json` |
| **422** | `Unprocessable Entity` | Business logic validation failure (e.g. course already completed) | Review business rules |
| **429** | `Too Many Requests` | Rate limit threshold exceeded | Back off and retry after `Retry-After` seconds |
| **500** | `Internal Server Error`| Unhandled server exception or unexpected failure | Contact support with `correlationId` |
| **501** | `Not Implemented` | Endpoint or capability planned but not yet deployed | Avoid calling unimplemented routes |
| **502** | `Bad Gateway` | Upstream service failure (e.g. Stellar Horizon / Soroban RPC down) | Retry with exponential backoff |
| **503** | `Service Unavailable` | Backend server under maintenance or database overloaded | Wait and retry after maintenance window |
| **504** | `Gateway Timeout` | Upstream blockchain node took too long to confirm transaction | Check transaction status via tx hash |

---

## 3. Client Error Codes (4xx)

### 400 Bad Request
- **Cause**: The request body or query parameter failed input validation checks.
- **Example Payload**:
  ```json
  {
    "statusCode": 400,
    "error": "Bad Request",
    "message": "Validation failed",
    "details": [
      "email must be an email",
      "password must be longer than or equal to 8 characters"
    ],
    "timestamp": "2026-09-30T12:00:00.000Z",
    "correlationId": "8f1a34b2-0001-4444-9999-abcdef123456",
    "path": "/api/v1/auth/register"
  }
  ```

### 401 Unauthorized
- **Cause**: Missing `Authorization: Bearer <token>` header, expired token, or token signed with invalid secret.
- **Example Payload**:
  ```json
  {
    "statusCode": 401,
    "error": "Unauthorized",
    "message": "Unauthorized",
    "details": null,
    "timestamp": "2026-09-30T12:00:00.000Z",
    "correlationId": "8f1a34b2-0002-4444-9999-abcdef123456",
    "path": "/api/v1/users/me"
  }
  ```

### 403 Forbidden
- **Cause**: User authenticated successfully, but lacks permissions (role guards: `Student`, `Instructor`, `Admin`).
- **Example Payload**:
  ```json
  {
    "statusCode": 403,
    "error": "Forbidden",
    "message": "Forbidden resource: Requires Admin role",
    "details": null,
    "timestamp": "2026-09-30T12:00:00.000Z",
    "correlationId": "8f1a34b2-0003-4444-9999-abcdef123456",
    "path": "/api/v1/admin/users"
  }
  ```

### 404 Not Found
- **Cause**: The requested resource does not exist in the database or route is invalid.
- **Example Payload**:
  ```json
  {
    "statusCode": 404,
    "error": "Not Found",
    "message": "Course with ID 'e8095b21' not found",
    "details": null,
    "timestamp": "2026-09-30T12:00:00.000Z",
    "correlationId": "8f1a34b2-0004-4444-9999-abcdef123456",
    "path": "/api/v1/courses/e8095b21"
  }
  ```

### 409 Conflict
- **Cause**: Resource already exists (e.g. email already registered, user already enrolled in course).
- **Example Payload**:
  ```json
  {
    "statusCode": 409,
    "error": "Conflict",
    "message": "User with this email already exists",
    "details": null,
    "timestamp": "2026-09-30T12:00:00.000Z",
    "correlationId": "8f1a34b2-0005-4444-9999-abcdef123456",
    "path": "/api/v1/auth/register"
  }
  ```

### 429 Too Many Requests
- **Cause**: The client exceeded rate limit thresholds configured in `ThrottlerModule`.
- **Response Headers**:
  - `Retry-After`: Number of seconds before the client may retry.
  - `X-RateLimit-Limit`: Maximum permitted requests in current window.
  - `X-RateLimit-Remaining`: Remaining request quota.
- **Example Payload**:
  ```json
  {
    "statusCode": 429,
    "error": "Too Many Requests",
    "message": "ThrottlerException: Too Many Requests",
    "details": null,
    "timestamp": "2026-09-30T12:00:00.000Z",
    "correlationId": "8f1a34b2-0006-4444-9999-abcdef123456",
    "path": "/api/v1/auth/login"
  }
  ```

---

## 4. Server Error Codes (5xx)

### 500 Internal Server Error
- **Cause**: An unexpected runtime error occurred on the server.
- **Note**: Internal stack traces are suppressed in production. The client should refer to `correlationId` when contacting system administrators.
- **Example Payload**:
  ```json
  {
    "statusCode": 500,
    "error": "Internal Server Error",
    "message": "Internal server error",
    "details": null,
    "timestamp": "2026-09-30T12:00:00.000Z",
    "correlationId": "8f1a34b2-0007-4444-9999-abcdef123456",
    "path": "/api/v1/certificates/issue"
  }
  ```

### 502 Bad Gateway
- **Cause**: Upstream dependencies such as Stellar Horizon or Soroban RPC node failed to return a valid response.
- **Example Payload**:
  ```json
  {
    "statusCode": 502,
    "error": "Bad Gateway",
    "message": "Stellar Horizon RPC service unavailable",
    "details": null,
    "timestamp": "2026-09-30T12:00:00.000Z",
    "correlationId": "8f1a34b2-0008-4444-9999-abcdef123456",
    "path": "/api/v1/stellar/transaction"
  }
  ```

### 503 Service Unavailable
- **Cause**: Backend server is undergoing maintenance, database connection pool is saturated, or Redis is down.
- **Example Payload**:
  ```json
  {
    "statusCode": 503,
    "error": "Service Unavailable",
    "message": "Database connection temporarily unavailable",
    "details": null,
    "timestamp": "2026-09-30T12:00:00.000Z",
    "correlationId": "8f1a34b2-0009-4444-9999-abcdef123456",
    "path": "/api/v1/courses"
  }
  ```

---

## 5. Client Handling & Best Practices

1. **Check `statusCode`**: Always parse the numeric `statusCode` instead of regex-matching the `message` string.
2. **Track `correlationId`**: Log the `correlationId` on client telemetry whenever an error occurs for fast triaging with backend logs.
3. **Handle Rate Limiting (429)**: Respect the `Retry-After` header using exponential backoff with jitter.
4. **Token Refresh (401)**: Intercept 401 responses to automatically request a refreshed access token before redirecting to the login screen.
5. **Form Field Mapping (400)**: When `details` is present, display validation warnings directly adjacent to the respective input fields in the UI.
