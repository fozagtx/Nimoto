import type { MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import type { AppBindings } from './context.js';
import { ApiError } from './lib/errors.js';
import { safeEquals } from './lib/ids.js';
import { resolveSession } from './services/auth.js';

export function bearerToken(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const [scheme, value] = header.split(' ');
  if (!value || scheme?.toLowerCase() !== 'bearer') return undefined;
  return value.trim();
}

/**
 * Sessions travel in an HTTP-only cookie when the web app shares a site with
 * the API, and in a bearer token when it does not (Mini App webviews).
 */
export const attachUser: MiddlewareHandler<AppBindings> = async (c, next) => {
  const ctx = c.get('ctx');
  const token = bearerToken(c.req.header('authorization')) ?? getCookie(c, ctx.env.SESSION_COOKIE_NAME);
  if (token) {
    const user = await resolveSession(ctx.db, token);
    if (user) c.set('user', user);
  }
  await next();
};

export const requireUser: MiddlewareHandler<AppBindings> = async (c, next) => {
  if (!c.get('user')) throw ApiError.unauthorized('not_authenticated', 'Connect your Nimiq wallet first');
  await next();
};

/** Admin access is a separate shared secret, never a wallet session. */
export const requireAdmin: MiddlewareHandler<AppBindings> = async (c, next) => {
  const ctx = c.get('ctx');
  const provided = bearerToken(c.req.header('authorization')) ?? c.req.header('x-admin-token');
  if (!provided || !safeEquals(provided, ctx.env.ADMIN_API_TOKEN)) {
    throw ApiError.unauthorized('admin_unauthorized', 'Admin credentials required');
  }
  await next();
};

export const securityHeaders: MiddlewareHandler = async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Referrer-Policy', 'no-referrer');
  c.header('X-Frame-Options', 'SAMEORIGIN');
  c.header('Cross-Origin-Resource-Policy', 'same-site');
  c.header('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
};
