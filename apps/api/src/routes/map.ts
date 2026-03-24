// ============================================================================
// FILE: apps/api/src/routes/map.ts
// Geographic risk map — real data from PostgreSQL.
// ============================================================================

import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { Errors } from '@regwatch/shared';
import { createServiceLogger } from '../config/logger.js';

const logger = createServiceLogger('route:map');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CountryRiskScore {
  readonly code: string;
  readonly name: string;
  readonly score: number;
  readonly level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | 'NO_DATA';
  readonly alertsHigh: number;
  readonly alertsMedium: number;
  readonly deadlines7d: number;
  readonly changes30d: number;
  readonly overdueObligations: number;
  readonly clients: readonly { id: string; name: string }[];
}

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

export interface MapRouteDeps {
  readonly prisma: PrismaClient;
}

const COUNTRY_NAMES: Record<string, string> = {
  US: 'Estados Unidos', EU: 'Union Europea', ES: 'Espana',
  DE: 'Alemania', FR: 'Francia', IT: 'Italia', NL: 'Paises Bajos',
  BR: 'Brasil', MX: 'Mexico', AR: 'Argentina', CL: 'Chile',
  IE: 'Irlanda', GB: 'Reino Unido',
};

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export function createMapRouter(deps: MapRouteDeps): Router {
  const router = Router();

  // -----------------------------------------------------------------------
  // GET /map/risk-scores — real risk scores from DB
  // -----------------------------------------------------------------------
  router.get('/map/risk-scores', async (req: Request, res: Response) => {
    const requestId = req.requestId ?? randomUUID();

    const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000);
    const sevenDaysFromNow = new Date(Date.now() + 7 * 86_400_000);

    // Parallel queries
    const [regulations, obligations, alerts, clients] = await Promise.all([
      deps.prisma.regulatoryChange.findMany({
        where: { publishedDate: { gte: thirtyDaysAgo } },
        select: { country: true, impactLevel: true },
      }),
      deps.prisma.obligation.findMany({
        select: {
          status: true, deadline: true,
          change: { select: { country: true } },
          client: { select: { id: true, name: true } },
        },
      }),
      deps.prisma.alert.findMany({
        select: {
          impactLevel: true,
          change: { select: { country: true } },
        },
      }),
      deps.prisma.client.findMany({
        where: { isActive: true },
        select: { id: true, name: true, countries: true },
      }),
    ]);

    // Collect all countries with data
    const countriesSet = new Set<string>();
    regulations.forEach((r) => countriesSet.add(r.country));
    obligations.forEach((o) => countriesSet.add(o.change.country));
    // Also add countries from clients
    clients.forEach((c) => c.countries.forEach((cc) => countriesSet.add(cc)));

    const countryScores: CountryRiskScore[] = [];

    for (const code of countriesSet) {
      const countryRegs = regulations.filter((r) => r.country === code);
      const countryObls = obligations.filter((o) => o.change.country === code);
      const countryAlerts = alerts.filter((a) => a.change.country === code);
      const countryClients = clients.filter((c) => c.countries.includes(code));

      const alertsHigh = countryAlerts.filter((a) => a.impactLevel === 'HIGH').length;
      const alertsMedium = countryAlerts.filter((a) => a.impactLevel === 'MEDIUM').length;
      const overdueObligations = countryObls.filter((o) => o.status === 'OVERDUE').length;
      const deadlines7d = countryObls.filter((o) =>
        o.status !== 'COMPLETED' && o.deadline <= sevenDaysFromNow && o.deadline >= new Date(),
      ).length;
      const changes30d = countryRegs.length;

      const score = calculateScore({ alertsHigh, alertsMedium, deadlines7d, changes30d, overdueObligations });

      countryScores.push({
        code,
        name: COUNTRY_NAMES[code] ?? code,
        score,
        level: scoreToLevel(score),
        alertsHigh,
        alertsMedium,
        deadlines7d,
        changes30d,
        overdueObligations,
        clients: countryClients.map((c) => ({ id: c.id, name: c.name })),
      });
    }

    // Sort by score descending
    countryScores.sort((a, b) => b.score - a.score);

    logger.info({
      operation: 'map:risk_scores',
      requestId,
      countriesCount: countryScores.length,
      result: 'success',
    });

    res.json({ countries: countryScores });
  });

  // -----------------------------------------------------------------------
  // GET /map/country/:code/detail — real detail from DB
  // -----------------------------------------------------------------------
  router.get('/map/country/:code/detail', async (req: Request, res: Response) => {
    const requestId = req.requestId ?? randomUUID();
    const code = req.params['code']!.toUpperCase();

    // Recent alerts for this country
    const recentAlerts = await deps.prisma.alert.findMany({
      where: { change: { country: code } },
      select: {
        id: true, message: true, impactLevel: true, status: true, createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    // Upcoming deadlines (obligations)
    const upcomingDeadlines = await deps.prisma.obligation.findMany({
      where: {
        change: { country: code },
        status: { not: 'COMPLETED' },
      },
      include: {
        client: { select: { id: true, name: true } },
      },
      orderBy: { deadline: 'asc' },
      take: 5,
    });

    // Recent regulatory changes
    const recentChanges = await deps.prisma.regulatoryChange.findMany({
      where: { country: code },
      select: {
        id: true, title: true, effectiveDate: true, impactLevel: true, affectedAreas: true,
      },
      orderBy: { publishedDate: 'desc' },
      take: 5,
    });

    // Clients in this country
    const clients = await deps.prisma.client.findMany({
      where: { isActive: true, countries: { has: code } },
      select: { id: true, name: true },
    });

    logger.info({
      operation: 'map:country_detail',
      requestId,
      code,
      alerts: recentAlerts.length,
      deadlines: upcomingDeadlines.length,
      changes: recentChanges.length,
      result: 'success',
    });

    res.json({
      recentAlerts: recentAlerts.map((a) => ({
        id: a.id,
        message: a.message,
        impactLevel: a.impactLevel,
        status: a.status,
        createdAt: a.createdAt.toISOString(),
      })),
      upcomingDeadlines: upcomingDeadlines.map((o) => ({
        id: o.id,
        title: o.title,
        date: o.deadline.toISOString().split('T')[0]!,
        daysUntil: Math.ceil((o.deadline.getTime() - Date.now()) / 86_400_000),
        type: 'DEADLINE',
        client: { id: o.client.id, name: o.client.name },
        status: o.status === 'OVERDUE' ? 'OVERDUE' : 'PENDING',
      })),
      recentChanges: recentChanges.map((r) => ({
        id: r.id,
        title: r.title,
        effectiveDate: r.effectiveDate.toISOString().split('T')[0]!,
        impactLevel: r.impactLevel,
        area: (r.affectedAreas as string[])[0] ?? 'regulatory',
      })),
      clients,
    });
  });

  return router;
}

// ---------------------------------------------------------------------------
// Score calculation (same formula, real inputs)
// ---------------------------------------------------------------------------

function calculateScore(raw: {
  alertsHigh: number;
  alertsMedium: number;
  deadlines7d: number;
  changes30d: number;
  overdueObligations: number;
}): number {
  const total =
    raw.alertsHigh * 10 +
    raw.alertsMedium * 5 +
    raw.deadlines7d * 8 +
    raw.changes30d * 3 +
    raw.overdueObligations * 15;
  return Math.min(100, Math.round(total / 1.2));
}

function scoreToLevel(score: number): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | 'NO_DATA' {
  if (score === 0) return 'NO_DATA';
  if (score <= 30) return 'LOW';
  if (score <= 60) return 'MEDIUM';
  if (score <= 80) return 'HIGH';
  return 'CRITICAL';
}
