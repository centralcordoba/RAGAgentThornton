// ============================================================================
// FILE: apps/api/src/routes/map.ts
// Geographic risk map endpoints — risk scores per country + country detail.
// ============================================================================

import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
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
  readonly prisma: unknown;
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export function createMapRouter(_deps: MapRouteDeps): Router {
  const router = Router();

  // -----------------------------------------------------------------------
  // GET /map/risk-scores — risk score per country
  // -----------------------------------------------------------------------
  router.get('/map/risk-scores', (req: Request, res: Response) => {
    const requestId = req.requestId ?? randomUUID();
    const clientId = req.query['clientId'] as string | undefined;

    logger.info({ operation: 'map:risk_scores', requestId, clientId });

    const countries = generateRiskScores(clientId);
    res.json({ countries });
  });

  // -----------------------------------------------------------------------
  // GET /map/country/:code/detail — detailed data for a single country
  // -----------------------------------------------------------------------
  router.get('/map/country/:code/detail', (req: Request, res: Response) => {
    const requestId = req.requestId ?? randomUUID();
    const code = req.params['code']!.toUpperCase();

    logger.info({ operation: 'map:country_detail', requestId, code });

    const countryName = COUNTRY_NAMES[code];
    if (!countryName) {
      throw Errors.notFound(requestId, 'Country', code);
    }

    const detail = generateCountryDetail(code);
    res.json(detail);
  });

  return router;
}

// ---------------------------------------------------------------------------
// Country names
// ---------------------------------------------------------------------------

const COUNTRY_NAMES: Record<string, string> = {
  US: 'Estados Unidos',
  EU: 'Union Europea',
  ES: 'Espana',
  MX: 'Mexico',
  AR: 'Argentina',
  BR: 'Brasil',
};

// ---------------------------------------------------------------------------
// Risk score calculation
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
  const normFactor = 1.2;
  return Math.min(100, Math.round(total / normFactor));
}

function scoreToLevel(score: number): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | 'NO_DATA' {
  if (score === 0) return 'NO_DATA';
  if (score <= 30) return 'LOW';
  if (score <= 60) return 'MEDIUM';
  if (score <= 80) return 'HIGH';
  return 'CRITICAL';
}

// ---------------------------------------------------------------------------
// Mock data generators
// ---------------------------------------------------------------------------

function generateRiskScores(_clientId?: string): CountryRiskScore[] {
  const rawData: {
    code: string;
    alertsHigh: number;
    alertsMedium: number;
    deadlines7d: number;
    changes30d: number;
    overdueObligations: number;
    clients: { id: string; name: string }[];
  }[] = [
    {
      code: 'US',
      alertsHigh: 3, alertsMedium: 5, deadlines7d: 2, changes30d: 14, overdueObligations: 1,
      clients: [
        { id: 'c3', name: 'TechStart Inc' },
        { id: 'c6', name: 'GlobalBank US' },
      ],
    },
    {
      code: 'EU',
      alertsHigh: 2, alertsMedium: 4, deadlines7d: 3, changes30d: 11, overdueObligations: 0,
      clients: [
        { id: 'c1', name: 'EuroTrade GmbH' },
        { id: 'c2', name: 'FinanceCorp EU' },
      ],
    },
    {
      code: 'ES',
      alertsHigh: 1, alertsMedium: 3, deadlines7d: 2, changes30d: 8, overdueObligations: 0,
      clients: [
        { id: 'c1', name: 'EuroTrade GmbH' },
      ],
    },
    {
      code: 'MX',
      alertsHigh: 0, alertsMedium: 2, deadlines7d: 1, changes30d: 5, overdueObligations: 1,
      clients: [
        { id: 'c4', name: 'Banco Pacifico MX' },
      ],
    },
    {
      code: 'AR',
      alertsHigh: 1, alertsMedium: 1, deadlines7d: 1, changes30d: 4, overdueObligations: 0,
      clients: [
        { id: 'c5', name: 'FinanceCorp AR' },
      ],
    },
    {
      code: 'BR',
      alertsHigh: 0, alertsMedium: 1, deadlines7d: 0, changes30d: 3, overdueObligations: 0,
      clients: [
        { id: 'c7', name: 'CVM Brasil Holdings' },
      ],
    },
  ];

  return rawData.map((raw) => {
    const score = calculateScore(raw);
    return {
      code: raw.code,
      name: COUNTRY_NAMES[raw.code] ?? raw.code,
      score,
      level: scoreToLevel(score),
      alertsHigh: raw.alertsHigh,
      alertsMedium: raw.alertsMedium,
      deadlines7d: raw.deadlines7d,
      changes30d: raw.changes30d,
      overdueObligations: raw.overdueObligations,
      clients: raw.clients,
    };
  });
}

function generateCountryDetail(code: string) {
  const countryClients: Record<string, { id: string; name: string }[]> = {
    US: [{ id: 'c3', name: 'TechStart Inc' }, { id: 'c6', name: 'GlobalBank US' }],
    EU: [{ id: 'c1', name: 'EuroTrade GmbH' }, { id: 'c2', name: 'FinanceCorp EU' }],
    ES: [{ id: 'c1', name: 'EuroTrade GmbH' }],
    MX: [{ id: 'c4', name: 'Banco Pacifico MX' }],
    AR: [{ id: 'c5', name: 'FinanceCorp AR' }],
    BR: [{ id: 'c7', name: 'CVM Brasil Holdings' }],
  };

  const areasByCountry: Record<string, string> = {
    US: 'Financiero', EU: 'Datos/GDPR', ES: 'Laboral',
    MX: 'Fiscal', AR: 'Financiero', BR: 'Financiero',
  };

  const clients = countryClients[code] ?? [];
  const area = areasByCountry[code] ?? 'General';

  return {
    recentAlerts: [
      {
        id: randomUUID(),
        message: `Nuevo requisito de reporte trimestral detectado en ${COUNTRY_NAMES[code]}`,
        impactLevel: 'HIGH',
        status: 'PENDING_REVIEW',
        createdAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
      },
      {
        id: randomUUID(),
        message: `Actualizacion de sanciones por incumplimiento — ${area}`,
        impactLevel: 'MEDIUM',
        status: 'SENT',
        createdAt: new Date(Date.now() - 5 * 86_400_000).toISOString(),
      },
      {
        id: randomUUID(),
        message: `Cambio en definiciones de entidades reguladas`,
        impactLevel: 'MEDIUM',
        status: 'ACKNOWLEDGED',
        createdAt: new Date(Date.now() - 8 * 86_400_000).toISOString(),
      },
    ],
    upcomingDeadlines: [
      {
        id: randomUUID(),
        title: `Reporte trimestral — ${area}`,
        date: dateOffset(5),
        daysUntil: 5,
        type: 'DEADLINE',
        client: clients[0] ?? { id: 'unknown', name: 'Sin cliente' },
        status: 'PENDING',
      },
      {
        id: randomUUID(),
        title: `Filing anual — Regulador ${code}`,
        date: dateOffset(18),
        daysUntil: 18,
        type: 'FILING',
        client: clients[0] ?? { id: 'unknown', name: 'Sin cliente' },
        status: 'PENDING',
      },
      {
        id: randomUUID(),
        title: `Revision interna AML`,
        date: dateOffset(35),
        daysUntil: 35,
        type: 'REVIEW',
        client: clients[0] ?? { id: 'unknown', name: 'Sin cliente' },
        status: 'PENDING',
      },
    ],
    recentChanges: [
      {
        id: randomUUID(),
        title: `Modificacion plazo de reporte — ${area}`,
        effectiveDate: dateOffset(30),
        impactLevel: 'HIGH',
        area,
      },
      {
        id: randomUUID(),
        title: `Actualizacion requisitos de capital`,
        effectiveDate: dateOffset(45),
        impactLevel: 'MEDIUM',
        area: 'Financiero',
      },
      {
        id: randomUUID(),
        title: `Nueva guia de cumplimiento digital`,
        effectiveDate: dateOffset(60),
        impactLevel: 'LOW',
        area: 'Datos/GDPR',
      },
    ],
    clients,
  };
}

function dateOffset(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().split('T')[0]!;
}
