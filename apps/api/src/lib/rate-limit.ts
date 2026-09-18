import type { MiddlewareHandler } from 'hono';
import { ApiError } from './errors.js';

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Fixed-window limiter kept in process memory. Deployments that run more than
 * one API instance should front this with a shared limiter (e.g. at the edge).
 */
export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly windowMs: number,
    private readonly max: number,
  ) {}

  check(key: string, now = Date.now()): { allowed: boolean; retryAfterMs: number } {
    const bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + this.windowMs });
      if (this.buckets.size > 10_000) this.prune(now);
      return { allowed: true, retryAfterMs: 0 };
    }
    bucket.count += 1;
    if (bucket.count > this.max) {
      return { allowed: false, retryAfterMs: bucket.resetAt - now };
    }
    return { allowed: true, retryAfterMs: 0 };
  }

  private prune(now: number): void {
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
  }
}

export function rateLimit(limiter: RateLimiter, scope: string): MiddlewareHandler {
  return async (c, next) => {
    const ip =
      c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ??
      c.req.header('x-real-ip') ??
      'unknown';
    const { allowed, retryAfterMs } = limiter.check(`${scope}:${ip}`);
    if (!allowed) {
      c.header('Retry-After', String(Math.ceil(retryAfterMs / 1000)));
      throw ApiError.tooManyRequests();
    }
    await next();
  };
}
