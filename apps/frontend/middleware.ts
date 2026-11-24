import { NextRequest, NextResponse } from 'next/server';
import createMiddleware from 'next-intl/middleware';
import { generateNonce, buildCSPHeader, CSP_CONFIG } from '@/lib/csp';
import { routing } from './src/i18n/routing';

const handleI18nRouting = createMiddleware(routing);

export function middleware(request: NextRequest) {
  const nonce = generateNonce();
  const env = process.env.NODE_ENV || 'development';
  const config = env === 'production' ? CSP_CONFIG.production : CSP_CONFIG.development;

  // Build CSP header with nonce
  const cspHeader = buildCSPHeader(config, nonce);

  // Clone response headers
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);

  const middlewareRequest = new NextRequest(request, { headers: requestHeaders });
  const pathname = request.nextUrl.pathname;
  // Authenticated app routes (e.g. /account/support, /dashboard) must go through
  // i18n routing so locale prefixes and CSP nonces are applied consistently.
  const isAuthenticatedRoute = /^\/(?:account|dashboard)(?:\/|$)/.test(pathname);
  const isPageRequest =
    !/^\/(?:api|_next|_vercel)(?:\/|$)/.test(pathname) && !pathname.includes('.');
  const response =
    isPageRequest || isAuthenticatedRoute
      ? handleI18nRouting(middlewareRequest)
      : NextResponse.next({ request: { headers: requestHeaders } });

  response.headers.set('Content-Security-Policy', cspHeader);
  response.headers.set('Content-Security-Policy-Report-Only', cspHeader);
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), interest-cohort=()'
  );

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     *
     * API routes are now included to ensure CSP headers are applied
     * Authenticated routes (/account/*, /dashboard/*) are matched so that
     * CSP headers and i18n routing apply to the support and streak pages.
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
    '/account/:path*',
    '/dashboard/:path*',
  ],
};
