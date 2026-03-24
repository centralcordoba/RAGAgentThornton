// ============================================================================
// FILE: apps/api/src/routes/horizon.ts
// Horizon Scanning — proposed/draft regulations pipeline.
// ============================================================================

import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { createServiceLogger } from '../config/logger.js';

const logger = createServiceLogger('route:horizon');

export interface HorizonRouteDeps {
  readonly prisma: PrismaClient;
}

export function createHorizonRouter(deps: HorizonRouteDeps): Router {
  const router = Router();

  // -----------------------------------------------------------------------
  // GET /horizon — list proposed regulations
  // -----------------------------------------------------------------------
  router.get('/horizon', async (req: Request, res: Response) => {
    const requestId = req.requestId ?? randomUUID();
    const stage = req.query['stage'] as string | undefined;
    const country = req.query['country'] as string | undefined;
    const page = parseInt(req.query['page'] as string ?? '1', 10);
    const pageSize = parseInt(req.query['pageSize'] as string ?? '20', 10);

    const where: Record<string, unknown> = {
      stage: stage
        ? stage
        : { in: ['PROPOSED', 'COMMENT_PERIOD', 'FINAL_RULE'] },
    };
    if (country) where['country'] = country;

    const [data, total] = await Promise.all([
      deps.prisma.regulatoryChange.findMany({
        where,
        orderBy: [{ commentDeadline: 'asc' }, { publishedDate: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      deps.prisma.regulatoryChange.count({ where }),
    ]);

    logger.info({ operation: 'horizon:list', requestId, total, stage, country, result: 'success' });
    res.json({ data, total, page, pageSize, hasMore: (page - 1) * pageSize + data.length < total });
  });

  // -----------------------------------------------------------------------
  // GET /horizon/summary — KPI counts
  // -----------------------------------------------------------------------
  router.get('/horizon/summary', async (_req: Request, res: Response) => {
    const proposals = await deps.prisma.regulatoryChange.findMany({
      where: { stage: { in: ['PROPOSED', 'COMMENT_PERIOD', 'FINAL_RULE'] } },
      select: { stage: true, country: true, impactLevel: true, approvalProbability: true, commentDeadline: true },
    });

    const byStage: Record<string, number> = {};
    const byCountry: Record<string, number> = {};
    let highImpact = 0;
    let totalProb = 0;
    let probCount = 0;
    let nearestComment: string | null = null;

    for (const p of proposals) {
      byStage[p.stage] = (byStage[p.stage] ?? 0) + 1;
      byCountry[p.country] = (byCountry[p.country] ?? 0) + 1;
      if (p.impactLevel === 'HIGH') highImpact++;
      if (p.approvalProbability !== null) { totalProb += p.approvalProbability; probCount++; }
      if (p.commentDeadline) {
        const d = p.commentDeadline.toISOString().split('T')[0]!;
        if (!nearestComment || d < nearestComment) nearestComment = d;
      }
    }

    res.json({
      total: proposals.length,
      byStage,
      byCountry: Object.entries(byCountry).map(([country, count]) => ({ country, count })),
      highImpact,
      avgProbability: probCount > 0 ? Math.round((totalProb / probCount) * 100) : 0,
      nearestCommentDeadline: nearestComment,
    });
  });

  // -----------------------------------------------------------------------
  // GET /horizon/:id — single proposal detail
  // -----------------------------------------------------------------------
  router.get('/horizon/:id', async (req: Request, res: Response) => {
    const { id } = req.params;
    const proposal = await deps.prisma.regulatoryChange.findUnique({ where: { id } });
    if (!proposal || !['PROPOSED', 'COMMENT_PERIOD', 'FINAL_RULE'].includes(proposal.stage)) {
      res.status(404).json({ code: 'NOT_FOUND', message: 'Proposal not found', requestId: req.requestId });
      return;
    }
    res.json(proposal);
  });

  return router;
}
