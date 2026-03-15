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

    // Redis
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

    // Neo4j
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

    const hasDegraded = Object.values(services).some((s) => s.status === 'down');
    const allDown = Object.values(services).every((s) => s.status === 'down');

    const body: HealthCheckResponse = {
      status: allDown ? 'unhealthy' : hasDegraded ? 'degraded' : 'healthy',
      version: '0.1.0',
      timestamp: new Date(),
      services,
    };

    res.status(overallHealthy ? 200 : 503).json(body);
  });

  return router;
}
