// ============================================================================
// FILE: apps/api/src/middleware/rateLimiter.ts
// Per-user rate limiter using Redis sliding window (ZADD/ZRANGEBYSCORE).
// Works correctly across multiple replicas with KEDA autoscaling.
//
// Defaults:
//   100 req/min per user (general API)
//   10 req/min per user  (/api/chat — LLM calls are expensive)
// ============================================================================

import type { Request, Response, NextFunction, RequestHandler } from 'express';
import Redis from 'ioredis';
import { Errors } from '@regwatch/shared';
import { createServiceLogger } from '../config/logger.js';
import type { AuthenticatedRequest } from './auth.js';

const logger = createServiceLogger('middleware:rate-limiter');

export interface RateLimiterConfig {
  readonly maxRequests: number;
  readonly windowMs: number;
  readonly redis?: Redis;
}

// ---------------------------------------------------------------------------
// In-memory fallback (used only when Redis is unavailable)
// ---------------------------------------------------------------------------

interface InMemoryStore {
  readonly timestamps: number[];
}

function createInMemoryBackend(): RateLimiterBackend {
  const store = new Map<string, InMemoryStore>();

  // Cleanup old entries every 5 minutes
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      const filtered = entry.timestamps.filter((ts) => now - ts < 120_000);
      if (filtered.length === 0) {
        store.delete(key);
      } else {
        store.set(key, { timestamps: filtered });
      }
    }
  }, 5 * 60 * 1000).unref();

  return {
    async checkAndIncrement(key: string, windowMs: number, maxRequests: number) {
      const now = Date.now();
      const entry = store.get(key) ?? { timestamps: [] };
      const windowTimestamps = entry.timestamps.filter((ts) => now - ts < windowMs);

      if (windowTimestamps.length >= maxRequests) {
        const oldestInWindow = windowTimestamps[0]!;
        return {
          allowed: false,
          currentCount: windowTimestamps.length,
          retryAfterMs: windowMs - (now - oldestInWindow),
        };
      }

      windowTimestamps.push(now);
      store.set(key, { timestamps: windowTimestamps });

      return {
        allowed: true,
        currentCount: windowTimestamps.length,
        retryAfterMs: 0,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Redis backend (production — works across multiple replicas)
// ---------------------------------------------------------------------------

function createRedisBackend(redis: Redis): RateLimiterBackend {
  return {
    async checkAndIncrement(key: string, windowMs: number, maxRequests: number) {
      const now = Date.now();
      const windowStart = now - windowMs;
      const redisKey = `ratelimit:${key}`;

      // Lua script: atomic ZREMRANGEBYSCORE + ZADD + ZCARD + PEXPIRE
      const luaScript = `
        redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[1])
        local count = redis.call('ZCARD', KEYS[1])
        if count < tonumber(ARGV[3]) then
          redis.call('ZADD', KEYS[1], ARGV[2], ARGV[2] .. ':' .. math.random(1000000))
          redis.call('PEXPIRE', KEYS[1], ARGV[4])
          return {1, count + 1, 0}
        else
          local oldest = redis.call('ZRANGEBYSCORE', KEYS[1], '-inf', '+inf', 'LIMIT', 0, 1, 'WITHSCORES')
          local retryAfter = 0
          if #oldest >= 2 then
            retryAfter = tonumber(ARGV[4]) - (tonumber(ARGV[2]) - tonumber(oldest[2]))
          end
          return {0, count, retryAfter}
        end
      `;

      const result = await redis.eval(
        luaScript,
        1,
        redisKey,
        String(windowStart),
        String(now),
        String(maxRequests),
        String(windowMs),
      ) as [number, number, number];

      return {
        allowed: result[0] === 1,
        currentCount: result[1],
        retryAfterMs: result[2],
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Backend interface
// ---------------------------------------------------------------------------

interface RateLimiterBackend {
  checkAndIncrement(
    key: string,
    windowMs: number,
    maxRequests: number,
  ): Promise<{ allowed: boolean; currentCount: number; retryAfterMs: number }>;
}

// ---------------------------------------------------------------------------
// Shared Redis instance (lazy-initialized)
// ---------------------------------------------------------------------------

let sharedRedis: Redis | null = null;

function getSharedRedis(): Redis | null {
  const redisUrl = process.env['REDIS_URL'];
  if (!redisUrl) return null;

  if (!sharedRedis) {
    sharedRedis = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      retryStrategy(times: number): number | null {
        if (times > 3) return null;
        return Math.min(times * 100, 1000);
      },
      lazyConnect: true,
      enableOfflineQueue: false,
    });
    sharedRedis.connect().catch(() => {
      logger.warn({
        operation: 'rate_limiter:redis_connect_failed',
        result: 'fallback_to_memory',
      });
    });
  }

  return sharedRedis;
}

// ---------------------------------------------------------------------------
// Rate limiter middleware
// ---------------------------------------------------------------------------

export function createRateLimiter(config: RateLimiterConfig): RequestHandler {
  const redis = config.redis ?? getSharedRedis();

  let backend: RateLimiterBackend;
  let usingRedis = false;

  if (redis) {
    backend = createRedisBackend(redis);
    usingRedis = true;
    logger.info({
      operation: 'rate_limiter:init',
      backend: 'redis',
      maxRequests: config.maxRequests,
      windowMs: config.windowMs,
    });
  } else {
    backend = createInMemoryBackend();
    logger.warn({
      operation: 'rate_limiter:init',
      backend: 'memory',
      maxRequests: config.maxRequests,
      windowMs: config.windowMs,
      warning: 'In-memory rate limiter does not work across multiple replicas',
    });
  }

  // Fallback backend for Redis errors
  const fallbackBackend = createInMemoryBackend();

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const requestId = req.requestId ?? 'unknown';

    // Use userId as rate limit key, fallback to IP
    const authReq = req as AuthenticatedRequest;
    const key = `${authReq.userId ?? req.ip ?? 'unknown'}:${req.baseUrl}`;

    try {
      const result = await backend.checkAndIncrement(key, config.windowMs, config.maxRequests);

      if (!result.allowed) {
        const retryAfterSeconds = Math.ceil(result.retryAfterMs / 1000);

        logger.warn({
          operation: 'rate_limiter:exceeded',
          requestId,
          userId: authReq.userId ?? req.ip,
          path: req.path,
          currentCount: result.currentCount,
          maxRequests: config.maxRequests,
          windowMs: config.windowMs,
          retryAfterSeconds,
          backend: usingRedis ? 'redis' : 'memory',
          result: 'rate_limited',
        });

        res.setHeader('Retry-After', String(retryAfterSeconds));
        res.setHeader('X-RateLimit-Limit', String(config.maxRequests));
        res.setHeader('X-RateLimit-Remaining', '0');

        const error = Errors.rateLimited(requestId, result.retryAfterMs);
        res.status(error.statusCode).json(error.toJSON());
        return;
      }

      // Set rate limit headers
      res.setHeader('X-RateLimit-Limit', String(config.maxRequests));
      res.setHeader('X-RateLimit-Remaining', String(config.maxRequests - result.currentCount));

      next();
    } catch (err) {
      // Redis failure: fallback to in-memory to avoid blocking requests
      logger.error({
        operation: 'rate_limiter:redis_error',
        requestId,
        error: err instanceof Error ? err.message : String(err),
        result: 'fallback_to_memory',
      });

      try {
        const fallbackResult = await fallbackBackend.checkAndIncrement(key, config.windowMs, config.maxRequests);
        if (!fallbackResult.allowed) {
          const error = Errors.rateLimited(requestId, fallbackResult.retryAfterMs);
          res.status(error.statusCode).json(error.toJSON());
          return;
        }
      } catch {
        // If even fallback fails, allow the request through
      }

      next();
    }
  };
}
