// ============================================================================
// FILE: apps/api/src/routes/regulations.ts
// GET  /api/regulations       — list with filters + pagination
// GET  /api/regulations/:id   — detail + AI analysis
// ============================================================================

import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { ListRegulationsSchema, Errors } from '@regwatch/shared';
import type { RegulatoryRAG } from '@regwatch/ai-core';
import type { RedisCache } from '@regwatch/ai-core';
import { createServiceLogger } from '../config/logger.js';
import type { ComplianceGraphService } from '../graph/complianceGraph.js';

const logger = createServiceLogger('route:regulations');

export interface RegulationRouteDeps {
  readonly prisma: PrismaClient;
  readonly ragEngine: RegulatoryRAG;
  readonly redisCache: RedisCache;
  readonly graphService: ComplianceGraphService;
}

export function createRegulationsRouter(deps: RegulationRouteDeps): Router {
  const router = Router();

  // -----------------------------------------------------------------------
  // GET /api/regulations
  // -----------------------------------------------------------------------
  router.get('/regulations', async (req: Request, res: Response) => {
    const requestId = req.headers['x-request-id'] as string ?? randomUUID();

    const parsed = ListRegulationsSchema.safeParse(req.query);
    if (!parsed.success) {
      throw Errors.validation(requestId, parsed.error.issues);
    }

    const { page, pageSize, country, area, impactLevel, dateFrom, dateTo } = parsed.data;
    const skip = (page - 1) * pageSize;

    // Build Prisma where clause
    const where: Record<string, unknown> = {};
    if (country) where['country'] = country;
    if (area) where['affectedAreas'] = { has: area };
    if (impactLevel) where['impactLevel'] = impactLevel;
    if (dateFrom || dateTo) {
      const dateFilter: Record<string, Date> = {};
      if (dateFrom) dateFilter['gte'] = dateFrom;
      if (dateTo) dateFilter['lte'] = dateTo;
      where['publishedDate'] = dateFilter;
    }

    const [data, total] = await Promise.all([
      deps.prisma.regulatoryChange.findMany({
        where,
        orderBy: { publishedDate: 'desc' },
        skip,
        take: pageSize,
      }),
      deps.prisma.regulatoryChange.count({ where }),
    ]);

    logger.info({
      operation: 'regulations:list',
      requestId,
      filters: { country, area, impactLevel },
      page,
      pageSize,
      totalResults: total,
      result: 'success',
    });

    res.json({
      data,
      total,
      page,
      pageSize,
      hasMore: skip + data.length < total,
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/regulations/:id
  // -----------------------------------------------------------------------
  router.get('/regulations/:id', async (req: Request, res: Response) => {
    const requestId = req.headers['x-request-id'] as string ?? randomUUID();
    const { id } = req.params;

    // Check Redis cache first
    const cached = await deps.redisCache.getRegulation(id!);
    if (cached) {
      logger.debug({
        operation: 'regulations:get_detail',
        requestId,
        regulationId: id,
        cacheHit: true,
        result: 'cache_hit',
      });
    }

    const regulation = cached ?? await deps.prisma.regulatoryChange.findUnique({
      where: { id },
    });

    if (!regulation) {
      throw Errors.notFound(requestId, 'Regulation', id!);
    }

    // Generate AI analysis on-demand
    // Extract tenantId from auth context (set by middleware)
    const tenantId = (req as AuthenticatedRequest).tenantId ?? 'system';
    const clientId = req.query['clientId'] as string | undefined;

    let analysis = null;
    if (clientId) {
      try {
        const client = await deps.prisma.client.findUnique({ where: { id: clientId } });
        if (client) {
          const regulatoryChange = {
            ...regulation,
            affectedAreas: regulation.affectedAreas as string[],
            affectedIndustries: regulation.affectedIndustries as string[],
            effectiveDate: new Date(regulation.effectiveDate),
            publishedDate: new Date(regulation.publishedDate),
            createdAt: new Date(regulation.createdAt),
            updatedAt: new Date(regulation.updatedAt),
          };

          analysis = await deps.ragEngine.generateAnalysis(
            regulatoryChange as Parameters<typeof deps.ragEngine.generateAnalysis>[0],
            {
              id: client.id,
              tenantId: client.tenantId,
              name: client.name,
              countries: client.countries,
              companyType: client.companyType,
              industries: client.industries,
              contactEmail: client.contactEmail,
              isActive: client.isActive,
              onboardedAt: client.onboardedAt,
              createdAt: client.createdAt,
              updatedAt: client.updatedAt,
            },
            [],
          );
        }
      } catch (err) {
        logger.warn({
          operation: 'regulations:analysis_failed',
          requestId,
          regulationId: id,
          clientId,
          result: 'error',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Cache the regulation for future access
    if (!cached) {
      void deps.redisCache.setRegulation(id!, regulation as Parameters<typeof deps.redisCache.setRegulation>[1]);
    }

    logger.info({
      operation: 'regulations:get_detail',
      requestId,
      regulationId: id,
      hasAnalysis: analysis !== null,
      result: 'success',
    });

    res.json({
      regulation,
      analysis,
    });
  });

  return router;
}

interface AuthenticatedRequest extends Request {
  tenantId?: string;
  userId?: string;
  userRole?: string;
}
