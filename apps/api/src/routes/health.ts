// ============================================================================
// FILE: apps/api/src/routes/health.ts
// GET /api/health — service health check including downstream dependencies.
// ============================================================================

import { Router, type Request, type Response } from 'express';
import type { PrismaClient } from '@prisma/client';
import type { HealthCheckResponse, ServiceHealth } from '@regwatch/shared';
import type { RedisCache } from '@regwatch/ai-core';
import type { Neo4jClient } from '../graph/neo4jClient.js';

export interface HealthDeps {
  readonly prisma: PrismaClient;
  readonly redis: RedisCache;
  readonly neo4j: Neo4jClient;
}

export function createHealthRouter(deps: HealthDeps): Router {
  const router = Router();

  router.get('/health', async (_req: Request, res: Response) => {
    const services: Record<string, ServiceHealth> = {};
    let overallHealthy = true;

    // PostgreSQL
    if (deps.prisma) {
      const pgStart = Date.now();
      try {
        await deps.prisma.$queryRaw`SELECT 1`;
        services['postgresql'] = { status: 'up', latencyMs: Date.now() - pgStart, message: null };
      } catch (err) {
        overallHealthy = false;
        services['postgresql'] = {
          status: 'down',
          latencyMs: Date.now() - pgStart,
          message: err instanceof Error ? err.message : 'Connection failed',
        };
      }
    } else {
      services['postgresql'] = { status: 'down', latencyMs: 0, message: 'Not configured (DATABASE_URL not set)' };
      overallHealthy = false;
    }

    // Redis
    if (deps.redis) {
      const redisStart = Date.now();
      try {
        const pong = await deps.redis.ping();
        services['redis'] = {
          status: pong ? 'up' : 'down',
          latencyMs: Date.now() - redisStart,
          message: pong ? null : 'Ping failed',
        };
        if (!pong) overallHealthy = false;
      } catch (err) {
        overallHealthy = false;
        services['redis'] = {
          status: 'down',
          latencyMs: Date.now() - redisStart,
          message: err instanceof Error ? err.message : 'Connection failed',
        };
      }
    } else {
      services['redis'] = { status: 'down', latencyMs: 0, message: 'Not configured (REDIS_URL not set)' };
      overallHealthy = false;
    }

    // Neo4j
    if (deps.neo4j) {
      const neoStart = Date.now();
      try {
        const ok = await deps.neo4j.ping();
        services['neo4j'] = {
          status: ok ? 'up' : 'down',
          latencyMs: Date.now() - neoStart,
          message: ok ? null : 'Ping failed',
        };
        if (!ok) overallHealthy = false;
      } catch (err) {
        overallHealthy = false;
        services['neo4j'] = {
          status: 'down',
          latencyMs: Date.now() - neoStart,
          message: err instanceof Error ? err.message : 'Connection failed',
        };
      }
    } else {
      services['neo4j'] = { status: 'down', latencyMs: 0, message: 'Not configured (NEO4J_URI not set)' };
      overallHealthy = false;
    }

    const configuredServices = Object.values(services).filter((s) => !s.message?.includes('Not configured'));
    const allConfiguredUp = configuredServices.length > 0 && configuredServices.every((s) => s.status === 'up');
    const hasDown = Object.values(services).some((s) => s.status === 'down' && !s.message?.includes('Not configured'));
    const allDown = Object.values(services).every((s) => s.status === 'down');

    let status: 'healthy' | 'degraded' | 'unhealthy';
    if (allDown) {
      status = configuredServices.length === 0 ? 'degraded' : 'unhealthy';
    } else if (hasDown) {
      status = 'degraded';
    } else {
      status = 'healthy';
    }

    const body: HealthCheckResponse = {
      status,
      version: '0.1.0',
      timestamp: new Date(),
      services,
    };

    // Return 200 if all configured services are up (even if some are not configured)
    // Return 503 only if a configured service is actually down
    const httpStatus = allConfiguredUp || configuredServices.length === 0 ? 200 : 503;
    res.status(httpStatus).json(body);
  });

  return router;
}
