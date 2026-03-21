// ============================================================================
// FILE: apps/api/src/routes/impact.ts
// Impact Analyzer endpoints — heatmap, analysis SSE, timeline, approve.
// Roles: ADMIN and PROFESSIONAL can trigger analysis.
//        CLIENT_VIEWER sees only completed reports.
// ============================================================================

import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import { Errors } from '@regwatch/shared';
import type {
  ImpactReport,
  HeatmapCell,
  TimelinePoint,
  ReasoningStep,
  ImpactLevel,
} from '@regwatch/shared';
import { createServiceLogger } from '../config/logger.js';
import { ImpactAnalyzerAgent } from '../agents/impactAnalyzer.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';

const logger = createServiceLogger('route:impact');

// ---------------------------------------------------------------------------
// In-memory store for reports (will be replaced by PostgreSQL)
// ---------------------------------------------------------------------------

const reportsStore: Map<string, ImpactReport> = new Map();
const impactAgent = new ImpactAnalyzerAgent();

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

export interface ImpactRouteDeps {
  readonly prisma: unknown;
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export function createImpactRouter(_deps: ImpactRouteDeps): Router {
  const router = Router();

  // -----------------------------------------------------------------------
  // GET /impact/heatmap — impact heatmap matrix
  // -----------------------------------------------------------------------
  router.get('/impact/heatmap', (req: Request, res: Response) => {
    const requestId = req.requestId ?? randomUUID();
    const days = parseInt(req.query['days'] as string ?? '30', 10);

    logger.info({ operation: 'impact:heatmap', requestId, days });

    const matrix = generateHeatmapData();
    res.json({ matrix, days });
  });

  // -----------------------------------------------------------------------
  // POST /impact/analyze/:changeId — run impact analysis with SSE streaming
  // -----------------------------------------------------------------------
  router.post('/impact/analyze/:changeId', async (req: Request, res: Response) => {
    const requestId = req.requestId ?? randomUUID();
    const { changeId } = req.params;
    const authReq = req as AuthenticatedRequest;

    logger.info({
      operation: 'impact:analyze',
      requestId,
      changeId,
      userId: authReq.userId,
    });

    // Set up SSE stream
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Request-Id': requestId,
    });

    const sendStep = (step: ReasoningStep): void => {
      res.write(`data: ${JSON.stringify({ type: 'step', step })}\n\n`);
    };

    try {
      const report = await impactAgent.analyze(
        {
          changeId: changeId!,
          tenantId: authReq.tenantId ?? 'dev-tenant',
          userId: authReq.userId ?? 'dev-user',
        },
        sendStep,
      );

      // Store report
      reportsStore.set(report.id, report);

      // Send final report
      res.write(`data: ${JSON.stringify({ type: 'report', report })}\n\n`);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Analysis failed';
      res.write(`data: ${JSON.stringify({ type: 'error', error: errorMsg })}\n\n`);
    }

    res.end();
  });

  // -----------------------------------------------------------------------
  // GET /impact/timeline — timeline data for charts
  // -----------------------------------------------------------------------
  router.get('/impact/timeline', (req: Request, res: Response) => {
    const requestId = req.requestId ?? randomUUID();
    const days = parseInt(req.query['days'] as string ?? '90', 10);
    const area = req.query['area'] as string | undefined;

    logger.info({ operation: 'impact:timeline', requestId, days, area });

    const data = generateTimelineData(days);
    res.json({ data, days, area: area ?? 'all' });
  });

  // -----------------------------------------------------------------------
  // GET /impact/reports — list completed impact reports
  // -----------------------------------------------------------------------
  router.get('/impact/reports', (_req: Request, res: Response) => {
    const reports = Array.from(reportsStore.values())
      .sort((a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime());

    res.json({ data: reports, total: reports.length });
  });

  // -----------------------------------------------------------------------
  // GET /impact/reports/:id — single report detail
  // -----------------------------------------------------------------------
  router.get('/impact/reports/:id', (req: Request, res: Response) => {
    const requestId = req.requestId ?? randomUUID();
    const report = reportsStore.get(req.params['id']!);
    if (!report) {
      throw Errors.notFound(requestId, 'ImpactReport', req.params['id']!);
    }
    res.json(report);
  });

  // -----------------------------------------------------------------------
  // PATCH /impact/reports/:id/approve — HITL approval
  // -----------------------------------------------------------------------
  router.patch('/impact/reports/:id/approve', (req: Request, res: Response) => {
    const requestId = req.requestId ?? randomUUID();
    const reportId = req.params['id']!;
    const authReq = req as AuthenticatedRequest;

    const report = reportsStore.get(reportId);
    if (!report) {
      throw Errors.notFound(requestId, 'ImpactReport', reportId);
    }

    if (report.reviewedBy) {
      throw Errors.conflict(requestId, 'Report already approved');
    }

    const approved: ImpactReport = {
      ...report,
      reviewedBy: authReq.userId ?? req.body?.reviewedBy ?? 'unknown',
      reviewedAt: new Date().toISOString(),
    };

    reportsStore.set(reportId, approved);

    logger.info({
      operation: 'impact:approve',
      requestId,
      reportId,
      reviewedBy: approved.reviewedBy,
      severityScore: approved.severityScore,
      result: 'success',
    });

    res.json(approved);
  });

  // -----------------------------------------------------------------------
  // POST /impact/reports/:id/export-pdf — generate executive PDF report
  // -----------------------------------------------------------------------
  router.post('/impact/reports/:id/export-pdf', (req: Request, res: Response) => {
    const requestId = req.requestId ?? randomUUID();
    const reportId = req.params['id']!;
    const authReq = req as AuthenticatedRequest;

    const report = reportsStore.get(reportId);
    if (!report) {
      throw Errors.notFound(requestId, 'ImpactReport', reportId);
    }

    logger.info({
      operation: 'impact:export_pdf',
      requestId,
      reportId,
      userId: authReq.userId,
    });

    // Build an HTML executive report and return it as downloadable HTML
    // (In production, Azure Functions + Puppeteer or wkhtmltopdf would render to real PDF)
    const html = generateExecutiveReportHtml(report);

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="regwatch-impact-report-${reportId.slice(0, 8)}.html"`);
    res.send(html);
  });

  return router;
}

// ---------------------------------------------------------------------------
// Executive PDF report HTML generation
// ---------------------------------------------------------------------------

function generateExecutiveReportHtml(report: ImpactReport): string {
  const severityLabel =
    report.severityScore >= 80 ? 'CRITICO' :
    report.severityScore >= 60 ? 'ALTO' :
    report.severityScore >= 30 ? 'MEDIO' : 'BAJO';

  const severityColor =
    report.severityScore >= 80 ? '#ef4444' :
    report.severityScore >= 60 ? '#f97316' :
    report.severityScore >= 30 ? '#eab308' : '#22c55e';

  const top5Clauses = report.diff.changedClauses.slice(0, 5);
  const sortedClients = [...report.affectedClients].sort((a, b) => b.severityScore - a.severityScore);

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>RegWatch AI — Reporte de Impacto Regulatorio</title>
<style>
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 0 auto; padding: 40px; color: #1f2937; font-size: 14px; line-height: 1.6; }
  .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #4F2D7F; padding-bottom: 16px; margin-bottom: 32px; }
  .header h1 { font-size: 20px; color: #4F2D7F; margin: 0; }
  .header .meta { text-align: right; font-size: 12px; color: #6b7280; }
  .badge { display: inline-block; padding: 4px 12px; border-radius: 4px; font-weight: 700; font-size: 13px; color: white; }
  h2 { font-size: 16px; color: #4F2D7F; border-bottom: 1px solid #e5e7eb; padding-bottom: 8px; margin-top: 32px; }
  .summary { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 16px 0; }
  .kpi-row { display: flex; gap: 24px; margin: 16px 0; }
  .kpi { text-align: center; flex: 1; padding: 16px; background: white; border: 1px solid #e5e7eb; border-radius: 8px; }
  .kpi .value { font-size: 28px; font-weight: 700; }
  .kpi .label { font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0; }
  th { background: #f3f4f6; text-align: left; padding: 8px 12px; font-size: 12px; font-weight: 600; }
  td { padding: 8px 12px; border-bottom: 1px solid #e5e7eb; font-size: 13px; }
  .severity-bar { height: 8px; border-radius: 4px; background: #e5e7eb; overflow: hidden; }
  .severity-fill { height: 100%; border-radius: 4px; }
  .diff-block { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 12px 0; }
  .diff-before, .diff-after { padding: 12px; border-radius: 6px; font-family: monospace; font-size: 12px; white-space: pre-wrap; line-height: 1.5; }
  .diff-before { background: #fef2f2; border: 1px solid #fecaca; }
  .diff-after { background: #f0fdf4; border: 1px solid #bbf7d0; }
  .footer { margin-top: 40px; padding-top: 16px; border-top: 2px solid #4F2D7F; display: flex; justify-content: space-between; font-size: 11px; color: #6b7280; }
  .signature { margin-top: 32px; padding: 16px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; }
  .signature .name { font-weight: 600; color: #1f2937; }
</style>
</head>
<body>
<div class="header">
  <div>
    <h1>RegWatch AI — Reporte de Impacto</h1>
    <p style="margin:4px 0 0;font-size:12px;color:#6b7280">${report.regulation.title}</p>
  </div>
  <div class="meta">
    <p>Generado: ${new Date(report.generatedAt).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
    <p>ID: ${report.id.slice(0, 8)}</p>
  </div>
</div>

<h2>Resumen Ejecutivo</h2>
<div class="summary">
  <p>Se ha detectado un cambio regulatorio en <strong>${report.regulation.jurisdiction}</strong> que afecta el area de <strong>${report.regulation.area}</strong>, con fecha efectiva ${new Date(report.regulation.effectiveDate).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })}. El analisis automatizado identifica <strong>${report.diff.changedClauses.length} clausulas modificadas</strong>, incluyendo cambios en plazos de reporte, requisitos de capital y regimen sancionatorio.</p>
  <p>El impacto afecta a <strong>${report.affectedClients.length} clientes</strong> de Grant Thornton. Se recomienda accion inmediata para los clientes con severidad superior al 70%, particularmente en lo referente a los nuevos plazos de presentacion y requisitos de buffer de capital.</p>
</div>

<div class="kpi-row">
  <div class="kpi">
    <div class="value" style="color:${severityColor}">${report.severityScore}</div>
    <div class="label">Severity Score</div>
    <span class="badge" style="background:${severityColor};margin-top:4px">${severityLabel}</span>
  </div>
  <div class="kpi">
    <div class="value">${report.confidence}%</div>
    <div class="label">Confianza</div>
  </div>
  <div class="kpi">
    <div class="value">${report.affectedClients.length}</div>
    <div class="label">Clientes Afectados</div>
  </div>
  <div class="kpi">
    <div class="value">${report.diff.changedClauses.length}</div>
    <div class="label">Clausulas Modificadas</div>
  </div>
</div>

<h2>Top ${top5Clauses.length} Cambios Criticos</h2>
<table>
  <thead><tr><th>Clausula</th><th>Tipo de cambio</th><th>Severidad</th><th>Resumen</th></tr></thead>
  <tbody>
    ${top5Clauses.map((c) => `<tr>
      <td><strong>${c.title}</strong></td>
      <td>${formatChangeType(c.changeType)}</td>
      <td><span class="badge" style="background:${clauseSeverityColor(c.severity)};font-size:11px">${c.severity.toUpperCase()}</span></td>
      <td>${c.summary}</td>
    </tr>`).join('\n    ')}
  </tbody>
</table>

<h2>Diff Regulatorio</h2>
<div class="diff-block">
  <div class="diff-before"><strong style="color:#dc2626">Version Anterior</strong>\n\n${escapeHtml(report.diff.before.slice(0, 600))}${report.diff.before.length > 600 ? '\n...' : ''}</div>
  <div class="diff-after"><strong style="color:#16a34a">Version Nueva</strong>\n\n${escapeHtml(report.diff.after.slice(0, 600))}${report.diff.after.length > 600 ? '\n...' : ''}</div>
</div>

<h2>Clientes Afectados</h2>
<table>
  <thead><tr><th>Cliente</th><th>Severity</th><th style="width:200px">Impacto</th><th>Accion Recomendada</th></tr></thead>
  <tbody>
    ${sortedClients.map((c) => `<tr>
      <td><strong>${c.clientName}</strong></td>
      <td>
        <div style="display:flex;align-items:center;gap:8px">
          <div class="severity-bar" style="flex:1"><div class="severity-fill" style="width:${c.severityScore}%;background:${clientSeverityColor(c.severityScore)}"></div></div>
          <span style="font-weight:600;font-size:13px">${c.severityScore}%</span>
        </div>
      </td>
      <td>${c.affectedObligations.join(', ')}</td>
      <td>${c.recommendedAction}</td>
    </tr>`).join('\n    ')}
  </tbody>
</table>

<h2>Acciones Recomendadas</h2>
<table>
  <thead><tr><th>Prioridad</th><th>Accion</th><th>Deadline</th><th>Asignar a</th></tr></thead>
  <tbody>
    ${report.recommendedActions.map((a) => `<tr>
      <td><span class="badge" style="background:${a.priority === 'immediate' ? '#ef4444' : a.priority === 'short_term' ? '#f97316' : '#eab308'};font-size:11px">${formatPriority(a.priority)}</span></td>
      <td>${a.action}</td>
      <td>${a.deadline ? new Date(a.deadline).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</td>
      <td>${a.assignTo === 'gt_professional' ? 'GT Professional' : 'Cliente'}</td>
    </tr>`).join('\n    ')}
  </tbody>
</table>

${report.reviewedBy ? `
<div class="signature">
  <p style="font-size:11px;color:#6b7280;margin:0 0 4px">Revisado y aprobado por:</p>
  <p class="name">${report.reviewedBy}</p>
  <p style="font-size:12px;color:#6b7280;margin:4px 0 0">${report.reviewedAt ? new Date(report.reviewedAt).toLocaleString('es') : ''}</p>
  <p style="font-size:11px;color:#4F2D7F;margin:8px 0 0">Grant Thornton — Profesional de Cumplimiento</p>
</div>
` : `
<div class="signature" style="border-color:#f59e0b;background:#fffbeb">
  <p style="font-size:12px;color:#92400e;margin:0;font-weight:600">Pendiente de revision — Este reporte requiere aprobacion de un profesional GT antes de ser distribuido al cliente.</p>
</div>
`}

<div class="footer">
  <span>Grant Thornton — RegWatch AI v0.1.0</span>
  <span>Confidencial — Solo para uso interno de GT y clientes autorizados</span>
</div>
</body>
</html>`;
}

function formatChangeType(type: string): string {
  const map: Record<string, string> = {
    deadline_shortened: 'Deadline acortado',
    new_obligation: 'Nueva obligacion',
    sanction_increased: 'Sancion aumentada',
    exception_removed: 'Excepcion eliminada',
    definition_changed: 'Definicion modificada',
  };
  return map[type] ?? type;
}

function formatPriority(priority: string): string {
  const map: Record<string, string> = {
    immediate: 'INMEDIATA',
    short_term: 'CORTO PLAZO',
    medium_term: 'MEDIO PLAZO',
  };
  return map[priority] ?? priority;
}

function clauseSeverityColor(severity: string): string {
  const map: Record<string, string> = {
    critical: '#ef4444',
    high: '#f97316',
    medium: '#eab308',
    low: '#22c55e',
  };
  return map[severity] ?? '#6b7280';
}

function clientSeverityColor(score: number): string {
  if (score >= 80) return '#ef4444';
  if (score >= 60) return '#f97316';
  if (score >= 30) return '#eab308';
  return '#22c55e';
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ---------------------------------------------------------------------------
// Heatmap data generator
// ---------------------------------------------------------------------------

const JURISDICTIONS = ['US', 'EU', 'ES', 'MX', 'AR', 'BR'] as const;
const AREAS = ['Financiero', 'Datos/GDPR', 'Laboral', 'Ambiental', 'Fiscal'] as const;

function generateHeatmapData(): HeatmapCell[] {
  const seedData: Record<string, Record<string, { score: number; count: number; top: string }>> = {
    US: {
      Financiero: { score: 82, count: 14, top: 'SEC Rule 10b-5 Amendment — deadline reporting' },
      'Datos/GDPR': { score: 45, count: 5, top: 'CCPA Enforcement Update Q1 2026' },
      Laboral: { score: 15, count: 2, top: 'DOL Overtime Rule Clarification' },
      Ambiental: { score: 55, count: 7, top: 'EPA Carbon Disclosure Requirements' },
      Fiscal: { score: 65, count: 9, top: 'IRS Digital Asset Reporting Rules' },
    },
    EU: {
      Financiero: { score: 72, count: 11, top: 'MiFID II Reporting Deadline Change' },
      'Datos/GDPR': { score: 88, count: 18, top: 'AI Act Implementation Guidelines' },
      Laboral: { score: 40, count: 4, top: 'EU Platform Workers Directive' },
      Ambiental: { score: 35, count: 3, top: 'CSRD Scope Extension' },
      Fiscal: { score: 48, count: 6, top: 'Pillar Two GloBE Rules Update' },
    },
    ES: {
      Financiero: { score: 38, count: 4, top: 'CNMV Circular 3/2026' },
      'Datos/GDPR': { score: 85, count: 12, top: 'AEPD Guía IA + Datos Personales' },
      Laboral: { score: 62, count: 8, top: 'Reforma Ley de Trabajo a Distancia' },
      Ambiental: { score: 20, count: 1, top: 'Actualización PRTR España' },
      Fiscal: { score: 28, count: 3, top: 'Modificación Ley IVA digital' },
    },
    MX: {
      Financiero: { score: 22, count: 2, top: 'CNBV Disposiciones Derivados' },
      'Datos/GDPR': { score: 18, count: 1, top: 'INAI Lineamientos Cloud' },
      Laboral: { score: 42, count: 5, top: 'Reforma NOM-035 Riesgos Psicosociales' },
      Ambiental: { score: 30, count: 3, top: 'Semarnat Regulación Carbono' },
      Fiscal: { score: 78, count: 10, top: 'SAT Facturación Electrónica 4.0' },
    },
    AR: {
      Financiero: { score: 15, count: 1, top: 'CNV Régimen Informativo' },
      'Datos/GDPR': { score: 12, count: 1, top: 'AAIP Disposición 2/2026' },
      Laboral: { score: 85, count: 15, top: 'Ley de Bases — reforma laboral integral' },
      Ambiental: { score: 10, count: 0, top: '' },
      Fiscal: { score: 42, count: 4, top: 'AFIP RG Monotributo Digital' },
    },
    BR: {
      Financiero: { score: 45, count: 6, top: 'CVM Instrução 694 — Derivativos' },
      'Datos/GDPR': { score: 50, count: 7, top: 'ANPD Regulamento IA' },
      Laboral: { score: 20, count: 2, top: 'CLT — Trabalho Intermitente' },
      Ambiental: { score: 25, count: 2, top: 'IBAMA Resolução Créditos Carbono' },
      Fiscal: { score: 30, count: 3, top: 'Reforma Tributária — IBS/CBS' },
    },
  };

  const matrix: HeatmapCell[] = [];
  for (const jur of JURISDICTIONS) {
    for (const area of AREAS) {
      const cell = seedData[jur]?.[area] ?? { score: 0, count: 0, top: '' };
      matrix.push({
        jurisdiction: jur,
        area,
        score: cell.score,
        changeCount: cell.count,
        topChange: cell.top,
      });
    }
  }
  return matrix;
}

// ---------------------------------------------------------------------------
// Timeline data generator
// ---------------------------------------------------------------------------

function generateTimelineData(days: number): TimelinePoint[] {
  const points: TimelinePoint[] = [];
  const countries = ['US', 'EU', 'ES', 'MX', 'AR', 'BR'];
  const now = Date.now();

  for (let d = days; d >= 0; d -= 3) {
    const date = new Date(now - d * 86_400_000).toISOString().split('T')[0]!;
    for (const country of countries) {
      const base = country === 'US' || country === 'EU' ? 3 : 1;
      const total = base + Math.floor(Math.random() * 4);
      const high = Math.floor(Math.random() * Math.min(2, total));
      const medium = Math.floor(Math.random() * (total - high));
      const low = total - high - medium;

      const changes: { id: string; title: string; impactLevel: ImpactLevel }[] = [];
      for (let i = 0; i < Math.min(total, 3); i++) {
        changes.push({
          id: randomUUID(),
          title: `${country} regulatory change ${date}-${i + 1}`,
          impactLevel: i === 0 && high > 0 ? 'HIGH' : i < high + medium ? 'MEDIUM' : 'LOW',
        });
      }

      points.push({ date, country, changeCount: total, highCount: high, mediumCount: medium, lowCount: low, changes });
    }
  }
  return points;
}
