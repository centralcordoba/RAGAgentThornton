// ============================================================================
// FILE: apps/api/src/middleware/rateLimiter.ts
// Per-user rate limiter using in-memory sliding window.
// Production: replace with Redis-backed limiter for multi-instance.
//
// Defaults:
//   100 req/min per user (general API)
//   10 req/min per user  (/api/chat — LLM calls are expensive)
// ============================================================================

import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { Errors } from '@regwatch/shared';
import { createServiceLogger } from '../config/logger.js';
import type { AuthenticatedRequest } from './auth.js';

const logger = createServiceLogger('middleware:rate-limiter');

export interface RateLimiterConfig {
  readonly maxRequests: number;
  readonly windowMs: number;
}

interface WindowEntry {
  readonly timestamps: number[];
}

export function createRateLimiter(config: RateLimiterConfig): RequestHandler {
  const store = new Map<string, WindowEntry>();

  // Cleanup old entries every 5 minutes
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      const filtered = entry.timestamps.filter((ts) => now - ts < config.windowMs);
      if (filtered.length === 0) {
        store.delete(key);
      } else {
        store.set(key, { timestamps: filtered });
      }
    }
  }, 5 * 60 * 1000);

  return (req: Request, res: Response, next: NextFunction): void => {
    const requestId = req.requestId ?? 'unknown';

    // Use userId as rate limit key, fallback to IP
    const authReq = req as AuthenticatedRequest;
    const key = authReq.userId ?? req.ip ?? 'unknown';

    const now = Date.now();
    const entry = store.get(key) ?? { timestamps: [] };

    // Filter timestamps within the current window
    const windowTimestamps = entry.timestamps.filter((ts) => now - ts < config.windowMs);

    if (windowTimestamps.length >= config.maxRequests) {
      const oldestInWindow = windowTimestamps[0]!;
      const retryAfterMs = config.windowMs - (now - oldestInWindow);
      const retryAfterSeconds = Math.ceil(retryAfterMs / 1000);

      logger.warn({
        operation: 'rate_limiter:exceeded',
        requestId,
        userId: key,
        path: req.path,
        currentCount: windowTimestamps.length,
        maxRequests: config.maxRequests,
        windowMs: config.windowMs,
        retryAfterSeconds,
        result: 'rate_limited',
      });

      res.setHeader('Retry-After', String(retryAfterSeconds));
      res.setHeader('X-RateLimit-Limit', String(config.maxRequests));
      res.setHeader('X-RateLimit-Remaining', '0');
      res.setHeader('X-RateLimit-Reset', String(Math.ceil((oldestInWindow + config.windowMs) / 1000)));

      const error = Errors.rateLimited(requestId, retryAfterMs);
      res.status(error.statusCode).json(error.toJSON());
      return;
    }

    // Record this request
    windowTimestamps.push(now);
    store.set(key, { timestamps: windowTimestamps });

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', String(config.maxRequests));
    res.setHeader('X-RateLimit-Remaining', String(config.maxRequests - windowTimestamps.length));

    next();
  };
}
