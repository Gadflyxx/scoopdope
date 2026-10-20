import { createHash } from 'crypto';
import { NextFunction, Request, Response } from 'express';

/**
 * Computes a weak ETag from a response body.
 */
function computeETag(body: Buffer | string): string {
  const hash = createHash('sha1').update(body).digest('hex');
  return `W/"${hash}"`;
}

/**
 * Middleware that adds ETag support to GET endpoints.
 *
 * - Adds an ETag header to GET responses.
 * - Honors conditional requests via If-None-Match, responding with
 *   304 Not Modified when the client's ETag matches.
 *
 * Non-GET requests are passed through untouched.
 */
export function etagMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (req.method !== 'GET') {
    return next();
  }

  const originalSend = res.send.bind(res);

  res.send = function sendWithETag(body?: any): Response {
    if (body !== undefined && body !== null && !res.headersSent) {
      const payload = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
      const etag = computeETag(payload);

      res.setHeader('ETag', etag);

      const ifNoneMatch = req.headers['if-none-match'];
      if (ifNoneMatch && ifNoneMatch === etag) {
        res.status(304);
        res.removeHeader('Content-Type');
        res.removeHeader('Content-Length');
        return originalSend();
      }
    }

    return originalSend(body);
  };

  next();
}

export default etagMiddleware;
