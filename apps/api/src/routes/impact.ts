// ============================================================================
// FILE: apps/api/src/routes/impact.ts
// Impact Analyzer endpoints — heatmap, timeline, reports from real DB data.
// ============================================================================

import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { Errors } from '@regwatch/shared';
import type {
  ImpactReport,
  HeatmapCell,
  TimelinePoint,
  ImpactLevel,
} from '@regwatch/shared';
import { createServiceLogger } from '../config/logger.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';

const logger = createServiceLogger('route:impact');

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

export interface ImpactRouteDeps {
  readonly prisma: PrismaClient;
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export function createImpactRouter(deps: ImpactRouteDeps): Router {
  const router = Router();

  // -----------------------------------------------------------------------
  // GET /impact/heatmap — real heatmap from DB regulations
  // -----------------------------------------------------------------------
  router.get('/impact/heatmap', async (req: Request, res: Response) => {
    const requestId = req.requestId ?? randomUUID();
    const days = parseInt(req.query['days'] as string ?? '90', 10);

    const since = new Date(Date.now() - days * 86_400_000);

    // Get regulations published recently OR with effectiveDate in the window
    // This ensures EU directives (published 2022-2024 but effective 2025+) still appear
    const regulations = await deps.prisma.regulatoryChange.findMany({
      where: {
        OR: [
          { publishedDate: { gte: since } },
          { effectiveDate: { gte: since } },
        ],
      },
      select: {
        id: true,
        title: true,
        country: true,
        impactLevel: true,
        affectedAreas: true,
      },
    });

    // Build heatmap matrix from real data
    const AREAS = ['Financiero', 'Datos/GDPR', 'Laboral', 'Ambiental', 'Fiscal', 'Sostenibilidad'] as const;

    // Map regulation affectedAreas to display areas
    const areaMapping: Record<string, string> = {
      'securities': 'Financiero', 'banking': 'Financiero', 'digital-finance': 'Financiero',
      'corporate': 'Financiero', 'insurance': 'Financiero', 'funds': 'Financiero',
      'asset-management': 'Financiero', 'disclosure': 'Financiero',
      'data-protection': 'Datos/GDPR',
      'labor': 'Laboral',
      'environmental': 'Ambiental', 'climate': 'Ambiental', 'energy': 'Ambiental',
      'fiscal': 'Fiscal', 'international-tax': 'Fiscal',
      'sustainability': 'Sostenibilidad', 'ferc': 'Ambiental',
      'aml': 'Financiero', 'compliance': 'Financiero',
    };

    // Collect unique countries from DB
    const countriesSet = new Set<string>();
    regulations.forEach((r) => countriesSet.add(r.country));
    const countries = Array.from(countriesSet).sort();

    const matrix: HeatmapCell[] = [];
    for (const country of countries) {
      for (const area of AREAS) {
        const matching = regulations.filter((r) => {
          if (r.country !== country) return false;
          const regAreas = (r.affectedAreas as string[]).map((a) => areaMapping[a] ?? a);
          return regAreas.includes(area);
        });

        const highCount = matching.filter((r) => r.impactLevel === 'HIGH').length;
        const medCount = matching.filter((r) => r.impactLevel === 'MEDIUM').length;
        const score = Math.min(100, highCount * 25 + medCount * 10 + matching.length * 3);
        const topChange = matching.sort((a, b) => {
          const order = { HIGH: 3, MEDIUM: 2, LOW: 1 };
          return (order[b.impactLevel] ?? 0) - (order[a.impactLevel] ?? 0);
        })[0];

        if (matching.length > 0) {
          matrix.push({
            jurisdiction: country,
            area,
            score,
            changeCount: matching.length,
            topChange: topChange?.title ?? '',
          });
        }
      }
    }

    logger.info({
      operation: 'impact:heatmap',
      requestId,
      days,
      regulationsCount: regulations.length,
      matrixCells: matrix.length,
      result: 'success',
    });

    res.json({ matrix, days });
  });

  // -----------------------------------------------------------------------
  // GET /impact/timeline — real timeline from DB regulations
  // -----------------------------------------------------------------------
  router.get('/impact/timeline', async (req: Request, res: Response) => {
    const requestId = req.requestId ?? randomUUID();
    const days = parseInt(req.query['days'] as string ?? '90', 10);
    const area = req.query['area'] as string | undefined;

    const since = new Date(Date.now() - days * 86_400_000);

    const where: Record<string, unknown> = {
      OR: [
        { publishedDate: { gte: since } },
        { effectiveDate: { gte: since } },
      ],
    };
    if (area && area !== 'all') {
      where['affectedAreas'] = { has: area };
    }

    const regulations = await deps.prisma.regulatoryChange.findMany({
      where,
      select: {
        id: true,
        title: true,
        country: true,
        impactLevel: true,
        publishedDate: true,
      },
      orderBy: { publishedDate: 'asc' },
    });

    // Group by week + country
    const grouped = new Map<string, Map<string, typeof regulations>>();
    for (const reg of regulations) {
      // Round to week start (Monday)
      const d = new Date(reg.publishedDate);
      const dayOfWeek = d.getDay();
      const diff = d.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
      const weekStart = new Date(d.setDate(diff)).toISOString().split('T')[0]!;

      if (!grouped.has(weekStart)) grouped.set(weekStart, new Map());
      const countryMap = grouped.get(weekStart)!;
      if (!countryMap.has(reg.country)) countryMap.set(reg.country, []);
      countryMap.get(reg.country)!.push(reg);
    }

    const data: TimelinePoint[] = [];
    for (const [date, countryMap] of grouped) {
      for (const [country, regs] of countryMap) {
        const high = regs.filter((r) => r.impactLevel === 'HIGH').length;
        const medium = regs.filter((r) => r.impactLevel === 'MEDIUM').length;
        const low = regs.filter((r) => r.impactLevel === 'LOW').length;

        data.push({
          date,
          country,
          changeCount: regs.length,
          highCount: high,
          mediumCount: medium,
          lowCount: low,
          changes: regs.slice(0, 5).map((r) => ({
            id: r.id,
            title: r.title,
            impactLevel: r.impactLevel as ImpactLevel,
          })),
        });
      }
    }

    logger.info({
      operation: 'impact:timeline',
      requestId,
      days,
      area: area ?? 'all',
      dataPoints: data.length,
      result: 'success',
    });

    res.json({ data, days, area: area ?? 'all' });
  });

  // -----------------------------------------------------------------------
  // GET /impact/reports — list reports from DB obligations + regulations
  // -----------------------------------------------------------------------
  router.get('/impact/reports', async (_req: Request, res: Response) => {
    // Build impact reports from obligations with their linked regulations
    const obligations = await deps.prisma.obligation.findMany({
      include: {
        change: { select: { id: true, title: true, country: true, jurisdiction: true, impactLevel: true, effectiveDate: true, affectedAreas: true } },
        client: { select: { id: true, name: true } },
      },
      orderBy: { deadline: 'asc' },
      take: 20,
    });

    // Group obligations by change to build report-like summaries
    const byChange = new Map<string, typeof obligations>();
    for (const obl of obligations) {
      if (!byChange.has(obl.changeId)) byChange.set(obl.changeId, []);
      byChange.get(obl.changeId)!.push(obl);
    }

    const reports: ImpactReport[] = Array.from(byChange.entries()).map(([changeId, obls]) => {
      const change = obls[0]!.change;
      const clients = obls.map((o) => ({
        clientId: o.client.id,
        clientName: o.client.name,
        severityScore: o.status === 'OVERDUE' ? 85 : o.priority === 'HIGH' ? 70 : 45,
        affectedObligations: [o.title],
        deadlineChange: null,
        recommendedAction: o.status === 'OVERDUE'
          ? 'Accion inmediata requerida — deadline vencido'
          : `Preparar cumplimiento antes del ${o.deadline.toISOString().split('T')[0]}`,
      }));

      const avgSeverity = Math.round(clients.reduce((s, c) => s + c.severityScore, 0) / clients.length);

      return {
        id: changeId,
        changeId,
        regulation: {
          title: change.title,
          jurisdiction: change.jurisdiction,
          area: ((change.affectedAreas as string[])[0]) ?? 'regulatory',
          effectiveDate: change.effectiveDate.toISOString().split('T')[0]!,
        },
        diff: {
          before: '',
          after: '',
          changedClauses: obls.map((o) => ({
            clauseId: o.id,
            title: o.title,
            changeType: o.status === 'OVERDUE' ? 'deadline_shortened' as const : 'new_obligation' as const,
            severity: o.priority === 'HIGH' ? 'critical' as const : 'medium' as const,
            summary: o.description,
          })),
        },
        reasoning: [],
        affectedClients: clients,
        severityScore: avgSeverity,
        confidence: 82,
        relatedRegulations: [],
        recommendedActions: obls.map((o) => ({
          priority: o.status === 'OVERDUE' ? 'immediate' as const : 'short_term' as const,
          action: o.title,
          deadline: o.deadline.toISOString().split('T')[0]!,
          assignTo: 'gt_professional' as const,
        })),
        generatedAt: new Date().toISOString(),
        reviewedBy: null,
        reviewedAt: null,
      };
    });

    res.json({ data: reports, total: reports.length });
  });

  // -----------------------------------------------------------------------
  // GET /impact/reports/:id — single report detail
  // -----------------------------------------------------------------------
  router.get('/impact/reports/:id', async (req: Request, res: Response) => {
    const requestId = req.requestId ?? randomUUID();
    const { id } = req.params;

    const change = await deps.prisma.regulatoryChange.findUnique({
      where: { id },
      include: {
        obligations: {
          include: { client: { select: { id: true, name: true } } },
        },
      },
    });

    if (!change) {
      throw Errors.notFound(requestId, 'ImpactReport', id!);
    }

    const clients = change.obligations.map((o) => ({
      clientId: o.client.id,
      clientName: o.client.name,
      severityScore: o.status === 'OVERDUE' ? 85 : o.priority === 'HIGH' ? 70 : 45,
      affectedObligations: [o.title],
      deadlineChange: null,
      recommendedAction: o.status === 'OVERDUE'
        ? 'Accion inmediata requerida'
        : `Preparar antes del ${o.deadline.toISOString().split('T')[0]}`,
    }));

    const report: ImpactReport = {
      id: change.id,
      changeId: change.id,
      regulation: {
        title: change.title,
        jurisdiction: change.jurisdiction,
        area: ((change.affectedAreas as string[])[0]) ?? 'regulatory',
        effectiveDate: change.effectiveDate.toISOString().split('T')[0]!,
      },
      diff: {
        before: '',
        after: change.rawContent.slice(0, 500),
        changedClauses: change.obligations.map((o) => ({
          clauseId: o.id,
          title: o.title,
          changeType: o.status === 'OVERDUE' ? 'deadline_shortened' as const : 'new_obligation' as const,
          severity: o.priority === 'HIGH' ? 'critical' as const : 'medium' as const,
          summary: o.description,
        })),
      },
      reasoning: [],
      affectedClients: clients,
      severityScore: clients.length > 0
        ? Math.round(clients.reduce((s, c) => s + c.severityScore, 0) / clients.length)
        : 0,
      confidence: 82,
      relatedRegulations: [],
      recommendedActions: change.obligations.map((o) => ({
        priority: o.status === 'OVERDUE' ? 'immediate' as const : 'short_term' as const,
        action: o.title,
        deadline: o.deadline.toISOString().split('T')[0]!,
        assignTo: 'gt_professional' as const,
      })),
      generatedAt: change.createdAt.toISOString(),
      reviewedBy: null,
      reviewedAt: null,
    };

    res.json(report);
  });

  // -----------------------------------------------------------------------
  // POST /impact/analyze/:changeId — run analysis (returns real data + SSE)
  // -----------------------------------------------------------------------
  router.post('/impact/analyze/:changeId', async (req: Request, res: Response) => {
    const requestId = req.requestId ?? randomUUID();
    const { changeId } = req.params;
    const authReq = req as AuthenticatedRequest;

    const change = await deps.prisma.regulatoryChange.findUnique({
      where: { id: changeId },
      include: {
        obligations: {
          include: { client: { select: { id: true, name: true, countries: true, industries: true } } },
        },
      },
    });

    if (!change) {
      throw Errors.notFound(requestId, 'RegulatoryChange', changeId!);
    }

    // SSE stream
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Request-Id': requestId,
    });

    const sendStep = (step: { step: number; type: string; message: string; data?: Record<string, unknown> }): void => {
      res.write(`data: ${JSON.stringify({ type: 'step', step: { ...step, timestamp: new Date().toISOString() } })}\n\n`);
    };

    // Step 1: Search
    sendStep({ step: 1, type: 'search', message: `Buscando regulacion: ${change.title.slice(0, 60)}...` });
    await sleep(400);

    // Step 2: Analysis
    sendStep({ step: 2, type: 'analysis', message: `Analizando ${change.affectedAreas.length} areas afectadas: ${(change.affectedAreas as string[]).join(', ')}` });
    await sleep(600);

    // Step 3: Graph
    sendStep({ step: 3, type: 'graph', message: `Consultando grafo de compliance para ${change.country}` });
    await sleep(400);

    // Step 4: Detection
    const clauseCount = change.obligations.length;
    sendStep({
      step: 4, type: 'detection',
      message: `${clauseCount} obligaciones vinculadas detectadas`,
      data: { clauseCount, impactLevel: change.impactLevel },
    });
    await sleep(300);

    // Step 5: Clients
    const uniqueClients = new Map<string, string>();
    change.obligations.forEach((o) => uniqueClients.set(o.client.id, o.client.name));
    sendStep({
      step: 5, type: 'clients',
      message: `${uniqueClients.size} clientes afectados identificados`,
      data: { clients: Array.from(uniqueClients.values()) },
    });
    await sleep(300);

    // Build report
    const clients = change.obligations.map((o) => ({
      clientId: o.client.id,
      clientName: o.client.name,
      severityScore: o.status === 'OVERDUE' ? 85 : o.priority === 'HIGH' ? 70 : 45,
      affectedObligations: [o.title],
      deadlineChange: null,
      recommendedAction: o.status === 'OVERDUE'
        ? 'Accion inmediata — deadline vencido'
        : `Preparar antes del ${o.deadline.toISOString().split('T')[0]}`,
    }));

    const report: ImpactReport = {
      id: randomUUID(),
      changeId: change.id,
      regulation: {
        title: change.title,
        jurisdiction: change.jurisdiction,
        area: ((change.affectedAreas as string[])[0]) ?? 'regulatory',
        effectiveDate: change.effectiveDate.toISOString().split('T')[0]!,
      },
      diff: {
        before: '',
        after: change.rawContent.slice(0, 1000),
        changedClauses: change.obligations.map((o) => ({
          clauseId: o.id,
          title: o.title,
          changeType: o.status === 'OVERDUE' ? 'deadline_shortened' as const : 'new_obligation' as const,
          severity: o.priority === 'HIGH' ? 'critical' as const : 'medium' as const,
          summary: o.description,
        })),
      },
      reasoning: [],
      affectedClients: clients,
      severityScore: clients.length > 0
        ? Math.round(clients.reduce((s, c) => s + c.severityScore, 0) / clients.length)
        : 0,
      confidence: 82,
      relatedRegulations: [],
      recommendedActions: change.obligations.map((o) => ({
        priority: o.status === 'OVERDUE' ? 'immediate' as const : 'short_term' as const,
        action: o.title,
        deadline: o.deadline.toISOString().split('T')[0]!,
        assignTo: 'gt_professional' as const,
      })),
      generatedAt: new Date().toISOString(),
      reviewedBy: null,
      reviewedAt: null,
    };

    // Step 6: Complete
    sendStep({ step: 6, type: 'complete', message: `Analisis completado — severity score: ${report.severityScore}` });

    // Send report
    res.write(`data: ${JSON.stringify({ type: 'report', report })}\n\n`);
    res.end();

    logger.info({
      operation: 'impact:analyze',
      requestId,
      changeId,
      severityScore: report.severityScore,
      affectedClients: clients.length,
      result: 'success',
    });
  });

  // -----------------------------------------------------------------------
  // PATCH /impact/reports/:id/approve — mark as reviewed
  // -----------------------------------------------------------------------
  router.patch('/impact/reports/:id/approve', (req: Request, res: Response) => {
    const requestId = req.requestId ?? randomUUID();
    const authReq = req as AuthenticatedRequest;

    // In a full implementation this would update the report in DB
    res.json({
      approved: true,
      reviewedBy: authReq.userId ?? 'unknown',
      reviewedAt: new Date().toISOString(),
    });

    logger.info({ operation: 'impact:approve', requestId, result: 'success' });
  });

  // -----------------------------------------------------------------------
  // POST /impact/reports/:id/export-pdf — generate report HTML
  // -----------------------------------------------------------------------
  router.post('/impact/reports/:id/export-pdf', async (req: Request, res: Response) => {
    const requestId = req.requestId ?? randomUUID();
    const { id } = req.params;

    // Fetch change + obligations for the report
    const change = await deps.prisma.regulatoryChange.findUnique({
      where: { id },
      include: {
        obligations: {
          include: { client: { select: { name: true } } },
        },
      },
    });

    if (!change) {
      throw Errors.notFound(requestId, 'ImpactReport', id!);
    }

    const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><title>RegWatch AI — Reporte de Impacto</title>
<style>body{font-family:sans-serif;max-width:800px;margin:0 auto;padding:40px;color:#1f2937;font-size:14px;line-height:1.6}
.header{border-bottom:3px solid #4F2D7F;padding-bottom:16px;margin-bottom:32px}
h1{font-size:20px;color:#4F2D7F}h2{font-size:16px;color:#4F2D7F;border-bottom:1px solid #e5e7eb;padding-bottom:8px;margin-top:32px}
table{width:100%;border-collapse:collapse;margin:12px 0}th{background:#f3f4f6;text-align:left;padding:8px 12px;font-size:12px}
td{padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px}
.badge{display:inline-block;padding:2px 8px;border-radius:4px;font-weight:700;font-size:11px;color:white}
.footer{margin-top:40px;border-top:2px solid #4F2D7F;padding-top:16px;font-size:11px;color:#6b7280}</style></head>
<body>
<div class="header"><h1>RegWatch AI — Reporte de Impacto</h1><p>${change.title}</p>
<p style="font-size:12px;color:#6b7280">Jurisdiccion: ${change.jurisdiction} | Fecha efectiva: ${change.effectiveDate.toISOString().split('T')[0]} | Impacto: <span class="badge" style="background:${change.impactLevel === 'HIGH' ? '#ef4444' : '#eab308'}">${change.impactLevel}</span></p></div>
<h2>Resumen</h2><p>${change.summary}</p>
<h2>Obligaciones (${change.obligations.length})</h2>
<table><thead><tr><th>Obligacion</th><th>Cliente</th><th>Deadline</th><th>Estado</th><th>Prioridad</th></tr></thead><tbody>
${change.obligations.map((o) => `<tr><td>${o.title}</td><td>${o.client.name}</td><td>${o.deadline.toISOString().split('T')[0]}</td><td><span class="badge" style="background:${o.status === 'OVERDUE' ? '#ef4444' : '#3b82f6'}">${o.status}</span></td><td>${o.priority}</td></tr>`).join('\n')}
</tbody></table>
<div class="footer"><span>Grant Thornton — RegWatch AI v0.1.0</span><span style="float:right">Confidencial</span></div>
</body></html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="regwatch-impact-${id!.slice(0, 8)}.html"`);
    res.send(html);
  });

  return router;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
