import { INestApplication } from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * Minimal, dependency-free OpenAPI 3.0 specification for the backend API.
 * Served as JSON at `/api/docs` and rendered by a small built-in HTML page
 * at `/api/docs/ui` so no extra Swagger packages are required.
 */
export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Backend API',
    description: 'OpenAPI documentation for the backend REST API.',
    version: '1.0.0',
  },
  servers: [{ url: '/api', description: 'API base path' }],
  tags: [
    { name: 'Lessons', description: 'Lesson management endpoints' },
    { name: 'Forums', description: 'Forum thread endpoints' },
    { name: 'Payments', description: 'Payment and invoice endpoints' },
    { name: 'Referrals', description: 'Referral program endpoints' },
    { name: 'Webhooks', description: 'Outgoing webhook delivery endpoints' },
    { name: 'FeatureFlags', description: 'Feature flag evaluation endpoints' },
  ],
  paths: {
    '/forums/threads': {
      get: {
        tags: ['Forums'],
        summary: 'List forum threads',
        description:
          'Cursor-based pagination. Pass the `nextCursor` value from a previous response as `after` to fetch the next page.',
        operationId: 'listForumThreads',
        parameters: [
          {
            name: 'after',
            in: 'query',
            required: false,
            description:
              'Opaque base64-encoded cursor of the form `<base64-encoded-ISO-timestamp>_<id>`. Omit to start from the first page.',
            schema: { type: 'string' },
          },
          {
            name: 'limit',
            in: 'query',
            required: false,
            description: 'Maximum number of threads to return.',
            schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          },
        ],
        responses: {
          '200': {
            description: 'A page of forum threads',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ForumThreadPage' },
              },
            },
          },
          '400': { description: 'Invalid cursor or limit' },
        },
      },
    },
    '/payments/{id}/invoice': {
      get: {
        tags: ['Payments'],
        summary: 'Download the tax-inclusive invoice PDF for a payment',
        operationId: 'getPaymentInvoice',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          '200': {
            description:
              'The invoice PDF. Tax-inclusive fields (taxRate, taxAmount, taxJurisdiction, subtotal, total) are rendered in the document.',
            content: {
              'application/pdf': {
                schema: { type: 'string', format: 'binary' },
              },
            },
          },
          '404': { description: 'Payment not found' },
        },
      },
    },
    '/v1/referrals/me': {
      get: {
        tags: ['Referrals'],
        summary: 'Get the authenticated user referral profile',
        description:
          'Returns the caller referral code, referral counts and BST token earnings. The referral code can be shared so new users receive a 10% discount on their first purchase; the referrer is awarded 50 BST once the referred learner completes their first purchase. Self-referral is rejected.',
        operationId: 'getMyReferralProfile',
        responses: {
          '200': {
            description: 'The referral profile of the authenticated user',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ReferralProfile' },
              },
            },
          },
          '401': { description: 'Unauthenticated' },
        },
      },
    },
    '/v1/referrals/validate': {
      post: {
        tags: ['Referrals'],
        summary: 'Validate a referral code',
        description:
          'Checks whether a referral code is valid for the authenticated user. Codes belonging to the caller (self-referral) are rejected.',
        operationId: 'validateReferralCode',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ValidateReferralDto' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Validation result',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ReferralValidation' },
              },
            },
          },
          '400': { description: 'Invalid payload' },
          '401': { description: 'Unauthenticated' },
        },
      },
    },
    '/v1/webhooks/deliveries': {
      get: {
        tags: ['Webhooks'],
        summary: 'List webhook deliveries for the authenticated subscriber',
        description:
          'Returns the delivery history of outgoing webhook events, including status and attempt count. Failed deliveries are retried with exponential backoff (1 min, 5 min, 15 min, 1 h, 4 h) and marked as `failed` (dead-letter) after 5 unsuccessful attempts.',
        operationId: 'listWebhookDeliveries',
        parameters: [
          {
            name: 'status',
            in: 'query',
            required: false,
            description: 'Filter deliveries by status.',
            schema: {
              type: 'string',
              enum: ['pending', 'retrying', 'succeeded', 'failed'],
            },
          },
          {
            name: 'limit',
            in: 'query',
            required: false,
            schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          },
        ],
        responses: {
          '200': {
            description: 'A list of webhook deliveries',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/WebhookDelivery' },
                },
              },
            },
          },
          '401': { description: 'Unauthenticated' },
        },
      },
    },
    '/v1/feature-flags': {
      get: {
        tags: ['FeatureFlags'],
        summary: 'Get feature flag state for the authenticated user',
        description:
          'Returns the evaluated state of all feature flags for the caller, taking the configured rollout percentage into account. A flag at 0% is never enabled; a flag at 100% is enabled for everyone.',
        operationId: 'getFeatureFlags',
        responses: {
          '200': {
            description: 'Evaluated feature flags',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/FeatureFlagState' },
              },
            },
          },
          '401': { description: 'Unauthenticated' },
        },
      },
    },
=======
    '/lessons': {
      get: {
        tags: ['Lessons'],
        summary: 'List lessons',
        operationId: 'listLessons',
        responses: {
          '200': {
            description: 'A list of lessons',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/Lesson' },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ['Lessons'],
        summary: 'Create a lesson',
        operationId: 'createLesson',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateLessonDto' },
            },
          },
        },
        responses: {
          '201': {
            description: 'The created lesson',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Lesson' },
              },
            },
          },
          '400': { description: 'Invalid lesson payload' },
        },
      },
    },
    '/lessons/{id}': {
      get: {
        tags: ['Lessons'],
        summary: 'Get a lesson by id',
        operationId: 'getLesson',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          '200': {
            description: 'The requested lesson',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Lesson' },
              },
            },
          },
          '404': { description: 'Lesson not found' },
        },
      },
    },
  },
  components: {
    schemas: {
      Lesson: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          url: { type: 'string', format: 'uri' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
        required: ['id', 'title'],
      },
      CreateLessonDto: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          url: { type: 'string', format: 'uri' },
        },
        required: ['title'],
      },
      ForumThread: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
        },
        required: ['id', 'title', 'createdAt'],
      },
      ForumThreadPage: {
        type: 'object',
        properties: {
          data: {
            type: 'array',
            items: { $ref: '#/components/schemas/ForumThread' },
          },
          nextCursor: {
            type: 'string',
            nullable: true,
            description:
              'Cursor for the next page, or null when there are no more results.',
          },
          hasMore: { type: 'boolean' },
        },
        required: ['data', 'hasMore'],
      },
      Payment: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          subtotal: { type: 'number', format: 'double' },
          taxRate: { type: 'number', format: 'double' },
          taxAmount: { type: 'number', format: 'double' },
          taxJurisdiction: { type: 'string' },
          total: { type: 'number', format: 'double' },
          currency: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
        },
        required: [
          'id',
          'subtotal',
          'taxRate',
          'taxAmount',
          'taxJurisdiction',
          'total',
        ],
      },
      ReferralProfile: {
        type: 'object',
        properties: {
          code: {
            type: 'string',
            description: 'Unique referral code of the user',
          },
          referralCount: {
            type: 'integer',
            description: 'Number of users who signed up with this code',
          },
          earnings: {
            type: 'number',
            format: 'double',
            description: 'Total BST tokens earned from referrals',
          },
        },
        required: ['code', 'referralCount', 'earnings'],
      },
      ValidateReferralDto: {
        type: 'object',
        properties: {
          code: { type: 'string' },
        },
        required: ['code'],
      },
      ReferralValidation: {
        type: 'object',
        properties: {
          valid: { type: 'boolean' },
          reason: {
            type: 'string',
            nullable: true,
            description:
              'Reason the code is invalid (e.g. unknown code or self-referral).',
          },
        },
        required: ['valid'],
      },
      WebhookDelivery: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          event: { type: 'string' },
          status: {
            type: 'string',
            enum: ['pending', 'retrying', 'succeeded', 'failed'],
          },
          attempts: { type: 'integer' },
          lastAttemptAt: {
            type: 'string',
            format: 'date-time',
            nullable: true,
          },
          nextAttemptAt: {
            type: 'string',
            format: 'date-time',
            nullable: true,
          },
          createdAt: { type: 'string', format: 'date-time' },
        },
        required: ['id', 'event', 'status', 'attempts', 'createdAt'],
      },
      FeatureFlagState: {
        type: 'object',
        additionalProperties: { type: 'boolean' },
        description:
          'Map of feature flag name to its evaluated boolean state for the caller.',
        example: {
          real_time_notifications: true,
          collaborative_editor: false,
          nft_badges: false,
        },
      },
      Invoice: {
        type: 'object',
        properties: {
          paymentId: { type: 'string' },
          subtotal: { type: 'number', format: 'double' },
          taxRate: { type: 'number', format: 'double' },
          taxAmount: { type: 'number', format: 'double' },
          taxJurisdiction: { type: 'string' },
          total: { type: 'number', format: 'double' },
          currency: { type: 'string' },
          issuedAt: { type: 'string', format: 'date-time' },
        },
        required: [
          'paymentId',
          'subtotal',
          'taxRate',
          'taxAmount',
          'taxJurisdiction',
          'total',
        ],
      },
    },
  },
} as const;

const docsHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Backend API Docs</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 2rem; color: #1f2933; }
  h1 { font-size: 1.5rem; }
  code { background: #f5f7fa; padding: 0.1rem 0.3rem; border-radius: 4px; }
  a { color: #2563eb; }
</style>
</head>
<body>
<h1>Backend API Documentation</h1>
<p>OpenAPI 3.0 specification is available as JSON at <a href="/api/docs"><code>/api/docs</code></a>.</p>
<p>Import that URL into any OpenAPI/Swagger-compatible tool to explore the API.</p>
<h2>Configuration</h2>
<p>
  <code>ADMIN_ALLOWED_IPS</code> &mdash; comma-separated list of IP addresses allowed to
  access <code>/admin</code> routes. Requests from unlisted IPs are rejected with
  <code>403</code> even when a valid admin JWT is presented. Leave empty to disable the
  allowlist (not recommended in production).
</p>
</body>
</html>`;

/**
 * Registers the API documentation routes on the given Nest application.
 * - GET /api/docs     -> OpenAPI JSON spec
 * - GET /api/docs/ui  -> lightweight HTML landing page
 */
export function setupApiDocs(app: INestApplication): void {
  const httpAdapter = app.getHttpAdapter();

  httpAdapter.get('/api/docs', (_req: Request, res: Response) => {
    res.json(openApiSpec);
  });

  httpAdapter.get('/api/docs/ui', (_req: Request, res: Response) => {
    res.type('text/html').send(docsHtml);
  });
}
