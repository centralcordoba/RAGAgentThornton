// ============================================================================
// FILE: apps/web/components/reports/ReportGenerator.tsx
// Report Builder — templates + filters + generate with REAL API data.
// Each template fetches from the correct endpoints and builds HTML reports.
// ============================================================================

'use client';

import { useState, useEffect, useRef } from 'react';
import { CountryFlag } from '../ui/CountryFlag';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ReportTemplate {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly icon: string;
  readonly category: 'compliance' | 'risk' | 'operations';
  readonly estimatedPages: string;
}

interface GeneratedReport {
  readonly id: string;
  readonly templateId: string;
  readonly templateTitle: string;
  readonly generatedAt: string;
  readonly status: 'generating' | 'ready' | 'error';
  readonly errorMessage?: string;
  readonly htmlContent?: string;
  readonly filters: {
    readonly countries: string[];
    readonly dateRange: string;
    readonly clientName: string;
  };
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

const TEMPLATES: readonly ReportTemplate[] = [
  {
    id: 'compliance-status',
    title: 'Estado de Cumplimiento por Pais',
    description: 'Resumen ejecutivo del estado regulatorio de cada jurisdiccion. Incluye obligaciones pendientes, vencidas y score de cumplimiento.',
    icon: '🌍',
    category: 'compliance',
    estimatedPages: '4-8',
  },
  {
    id: 'regulatory-changes',
    title: 'Cambios Regulatorios del Periodo',
    description: 'Listado completo de cambios normativos detectados en el periodo seleccionado con analisis de impacto y areas afectadas.',
    icon: '📋',
    category: 'compliance',
    estimatedPages: '6-12',
  },
  {
    id: 'risk-assessment',
    title: 'Evaluacion de Riesgo Regulatorio',
    description: 'Heatmap de riesgo por pais y area regulatoria. Identifica las combinaciones de mayor exposicion y recomienda acciones.',
    icon: '🔴',
    category: 'risk',
    estimatedPages: '3-6',
  },
  {
    id: 'obligations-tracker',
    title: 'Tracker de Obligaciones',
    description: 'Estado detallado de todas las obligaciones por cliente: pendientes, en progreso, completadas y vencidas con deadlines.',
    icon: '✅',
    category: 'operations',
    estimatedPages: '5-10',
  },
  {
    id: 'client-onboarding',
    title: 'Reporte de Onboarding',
    description: 'Resumen del ComplianceMap generado para un cliente nuevo: jurisdicciones, obligaciones identificadas y plazos criticos.',
    icon: '🏢',
    category: 'operations',
    estimatedPages: '3-5',
  },
  {
    id: 'alert-summary',
    title: 'Resumen de Alertas',
    description: 'Consolidado de alertas enviadas, pendientes de revision HITL y reconocidas por clientes en el periodo.',
    icon: '🔔',
    category: 'risk',
    estimatedPages: '2-4',
  },
];

const COUNTRIES_AVAILABLE = ['US', 'AR', 'BR', 'EU', 'SG'] as const;

const CATEGORY_LABELS: Record<string, string> = {
  compliance: 'Cumplimiento',
  risk: 'Riesgo',
  operations: 'Operaciones',
};

const CATEGORY_COLORS: Record<string, string> = {
  compliance: 'bg-blue-100 text-blue-700',
  risk: 'bg-red-100 text-red-700',
  operations: 'bg-emerald-100 text-emerald-700',
};

const API_BASE = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3000';

// ---------------------------------------------------------------------------
// Shared HTML styles for all report templates
// ---------------------------------------------------------------------------

const REPORT_CSS = `
@media print { body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; } .no-print { display: none !important; } }
@page { margin: 1.5cm; size: A4; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1f2937; font-size: 13px; line-height: 1.6; max-width: 800px; margin: 0 auto; padding: 40px 24px; }
.header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #4F2D7F; padding-bottom: 16px; margin-bottom: 24px; }
.header h1 { font-size: 18px; color: #4F2D7F; margin-bottom: 4px; }
.header p { font-size: 11px; color: #6b7280; }
.header-right { text-align: right; font-size: 11px; color: #6b7280; }
.badge { display: inline-block; padding: 3px 10px; border-radius: 4px; font-weight: 700; font-size: 11px; color: white; }
h2 { font-size: 14px; color: #4F2D7F; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px; margin: 24px 0 12px; }
.summary-box { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin: 12px 0; }
.kpi-row { display: flex; gap: 16px; margin: 16px 0; }
.kpi { text-align: center; flex: 1; padding: 14px; background: white; border: 1px solid #e5e7eb; border-radius: 8px; }
.kpi-value { font-size: 24px; font-weight: 700; }
.kpi-label { font-size: 10px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; }
table { width: 100%; border-collapse: collapse; margin: 10px 0; }
th { background: #f3f4f6; text-align: left; padding: 7px 10px; font-size: 11px; font-weight: 600; }
td { padding: 7px 10px; border-bottom: 1px solid #e5e7eb; font-size: 12px; }
.status-overdue { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 10px; font-weight: 600; background: #fef2f2; color: #dc2626; }
.status-pending { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 10px; font-weight: 600; background: #fffbeb; color: #d97706; }
.status-completed { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 10px; font-weight: 600; background: #f0fdf4; color: #16a34a; }
.status-in-progress { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 10px; font-weight: 600; background: #eff6ff; color: #2563eb; }
.priority-high { color: #ef4444; font-weight: 600; }
.priority-medium { color: #f59e0b; }
.priority-low { color: #22c55e; }
.filter-tag { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; background: #eff6ff; color: #1e40af; margin-right: 4px; }
.footer { margin-top: 32px; padding-top: 12px; border-top: 2px solid #4F2D7F; display: flex; justify-content: space-between; font-size: 10px; color: #6b7280; }
.print-btn { position: fixed; bottom: 20px; right: 20px; background: #4F2D7F; color: white; border: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; box-shadow: 0 4px 12px rgba(79,45,127,0.3); }
.print-btn:hover { background: #3d2263; }
.signature { margin-top: 24px; padding: 14px; background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; }
.score-bar { height: 8px; border-radius: 4px; overflow: hidden; background: #e5e7eb; }
.score-fill { height: 100%; border-radius: 4px; }
`;

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function fmtDate(d: string): string {
  try { return new Date(d).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }); }
  catch { return d; }
}

function fmtShortDate(d: string): string {
  try { return new Date(d).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }); }
  catch { return d; }
}

function impactColor(level: string): string {
  return level === 'HIGH' ? '#ef4444' : level === 'MEDIUM' ? '#f59e0b' : '#22c55e';
}

function statusClass(status: string): string {
  if (status === 'OVERDUE') return 'status-overdue';
  if (status === 'COMPLETED') return 'status-completed';
  if (status === 'IN_PROGRESS') return 'status-in-progress';
  return 'status-pending';
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    OVERDUE: 'Vencido', COMPLETED: 'Completado', IN_PROGRESS: 'En progreso',
    PENDING: 'Pendiente', PENDING_REVIEW: 'Pendiente revision', APPROVED: 'Aprobada',
    SENT: 'Enviada', ACKNOWLEDGED: 'Reconocida', DISMISSED: 'Descartada',
  };
  return map[status] ?? status;
}

function wrapHtml(title: string, reportId: string, date: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><title>RegWatch AI — ${title}</title><style>${REPORT_CSS}</style></head>
<body>
<button class="print-btn no-print" onclick="window.print()">Descargar PDF</button>
<div class="header">
  <div><h1>RegWatch AI — ${title}</h1><p>Reporte generado automaticamente</p></div>
  <div class="header-right"><p>${fmtDate(date)}</p><p>ID: ${reportId.slice(0, 8)}</p></div>
</div>
${body}
<div class="signature"><p style="font-size:12px;color:#92400e;font-weight:600">Pendiente de revision — Requiere aprobacion de un profesional GT antes de distribuir al cliente.</p></div>
<div class="footer"><span>Grant Thornton — RegWatch AI v0.1.0</span><span>Confidencial — Solo para uso interno</span></div>
</body></html>`;
}

// ---------------------------------------------------------------------------
// API fetcher
// ---------------------------------------------------------------------------

async function apiFetch(path: string): Promise<Record<string, unknown> | null> {
  const token = sessionStorage.getItem('auth_token') ?? process.env['NEXT_PUBLIC_DEV_TOKEN'] ?? null;
  const res = await fetch(`${API_BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) return null;
  return res.json();
}

// ---------------------------------------------------------------------------
// Report builders — each fetches real data and returns HTML
// ---------------------------------------------------------------------------

interface ReportFilters {
  countries: string[];
  dateFrom: string;
  dateTo: string;
  clientId: string;
  clientName: string;
}

async function buildComplianceStatus(id: string, date: string, filters: ReportFilters): Promise<string> {
  // Fetch clients + their dashboards
  const clientsData = await apiFetch('/api/clients?pageSize=100');
  const allClients = ((clientsData?.['data'] ?? []) as Record<string, unknown>[])
    .filter((c) => filters.countries.length === 0 || (c['countries'] as string[]).some((cc) => filters.countries.includes(cc)));

  const dashboards: Record<string, unknown>[] = [];
  for (const client of allClients.slice(0, 20)) {
    const d = await apiFetch(`/api/clients/${client['id']}/dashboard`);
    if (d) dashboards.push(d);
  }

  const totalObligations = dashboards.reduce((sum, d) => sum + ((d['totalObligations'] as number) ?? 0), 0);
  const avgScore = dashboards.length > 0
    ? Math.round(dashboards.reduce((sum, d) => sum + ((d['complianceScore'] as number) ?? 0), 0) / dashboards.length)
    : 0;
  const totalOverdue = dashboards.reduce((sum, d) => {
    const byStatus = (d['obligationsByStatus'] as Record<string, number>) ?? {};
    return sum + (byStatus['OVERDUE'] ?? 0);
  }, 0);

  const clientRows = dashboards.map((d) => {
    const byStatus = (d['obligationsByStatus'] as Record<string, number>) ?? {};
    const score = (d['complianceScore'] as number) ?? 0;
    const scoreColor = score >= 80 ? '#22c55e' : score >= 60 ? '#f59e0b' : '#ef4444';
    const countries = ((d['countries'] as string[]) ?? []).join(', ');
    return `<tr>
      <td style="font-weight:500">${d['clientName']}</td>
      <td>${countries}</td>
      <td><span style="color:${scoreColor};font-weight:700">${score}%</span></td>
      <td>${d['totalObligations']}</td>
      <td>${byStatus['COMPLETED'] ?? 0}</td>
      <td>${byStatus['PENDING'] ?? 0}</td>
      <td>${(byStatus['OVERDUE'] ?? 0) > 0 ? `<span style="color:#ef4444;font-weight:600">${byStatus['OVERDUE']}</span>` : '<span style="color:#22c55e">0</span>'}</td>
    </tr>`;
  }).join('\n');

  // Country breakdown
  const countryMap = new Map<string, { clients: number; obligations: number; overdue: number; score: number }>();
  for (const d of dashboards) {
    for (const c of ((d['countries'] as string[]) ?? [])) {
      const existing = countryMap.get(c) ?? { clients: 0, obligations: 0, overdue: 0, score: 0 };
      existing.clients++;
      existing.obligations += (d['totalObligations'] as number) ?? 0;
      const byStatus = (d['obligationsByStatus'] as Record<string, number>) ?? {};
      existing.overdue += byStatus['OVERDUE'] ?? 0;
      existing.score += (d['complianceScore'] as number) ?? 0;
      countryMap.set(c, existing);
    }
  }

  const countryRows = Array.from(countryMap.entries()).map(([code, data]) => {
    const avg = data.clients > 0 ? Math.round(data.score / data.clients) : 0;
    const scoreColor = avg >= 80 ? '#22c55e' : avg >= 60 ? '#f59e0b' : '#ef4444';
    return `<tr>
      <td style="font-weight:500">${code}</td>
      <td>${data.clients}</td>
      <td><span style="color:${scoreColor};font-weight:700">${avg}%</span></td>
      <td>${data.obligations}</td>
      <td>${data.overdue > 0 ? `<span style="color:#ef4444;font-weight:600">${data.overdue}</span>` : '0'}</td>
    </tr>`;
  }).join('\n');

  const body = `
<h2>Resumen Ejecutivo</h2>
<div class="kpi-row">
  <div class="kpi"><div class="kpi-value" style="color:#4F2D7F">${dashboards.length}</div><div class="kpi-label">Clientes</div></div>
  <div class="kpi"><div class="kpi-value" style="color:${avgScore >= 80 ? '#22c55e' : avgScore >= 60 ? '#f59e0b' : '#ef4444'}">${avgScore}%</div><div class="kpi-label">Score Promedio</div></div>
  <div class="kpi"><div class="kpi-value">${totalObligations}</div><div class="kpi-label">Obligaciones</div></div>
  <div class="kpi"><div class="kpi-value" style="color:#ef4444">${totalOverdue}</div><div class="kpi-label">Vencidas</div></div>
</div>

<h2>Cumplimiento por Pais</h2>
<table><thead><tr><th>Pais</th><th>Clientes</th><th>Score</th><th>Obligaciones</th><th>Vencidas</th></tr></thead>
<tbody>${countryRows}</tbody></table>

<h2>Detalle por Cliente</h2>
<table><thead><tr><th>Cliente</th><th>Paises</th><th>Score</th><th>Total</th><th>Completadas</th><th>Pendientes</th><th>Vencidas</th></tr></thead>
<tbody>${clientRows}</tbody></table>`;

  return wrapHtml('Estado de Cumplimiento por Pais', id, date, body);
}

async function buildRegulatoryChanges(id: string, date: string, filters: ReportFilters): Promise<string> {
  const params = new URLSearchParams({ pageSize: '100' });
  if (filters.countries.length === 1) params.set('country', filters.countries[0]!);
  if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
  if (filters.dateTo) params.set('dateTo', filters.dateTo);

  const data = await apiFetch(`/api/regulations?${params}`);
  let regs = ((data?.['data'] ?? []) as Record<string, unknown>[]);

  // Filter by selected countries if multiple
  if (filters.countries.length > 1) {
    regs = regs.filter((r) => filters.countries.includes(r['country'] as string));
  }

  const highCount = regs.filter((r) => r['impactLevel'] === 'HIGH').length;
  const medCount = regs.filter((r) => r['impactLevel'] === 'MEDIUM').length;
  const lowCount = regs.filter((r) => r['impactLevel'] === 'LOW').length;

  const regRows = regs.map((r) => {
    const level = r['impactLevel'] as string;
    const areas = ((r['affectedAreas'] as string[]) ?? []).join(', ');
    return `<tr>
      <td style="font-weight:500">${r['title']}</td>
      <td>${r['country']}</td>
      <td><span class="badge" style="background:${impactColor(level)}">${level}</span></td>
      <td>${fmtShortDate((r['effectiveDate'] as string) ?? '')}</td>
      <td style="font-size:11px">${areas}</td>
    </tr>`;
  }).join('\n');

  // Group by country
  const byCountry = new Map<string, number>();
  for (const r of regs) {
    const c = r['country'] as string;
    byCountry.set(c, (byCountry.get(c) ?? 0) + 1);
  }
  const countryBreakdown = Array.from(byCountry.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([c, n]) => `<tr><td style="font-weight:500">${c}</td><td>${n}</td></tr>`)
    .join('\n');

  const body = `
<h2>Resumen del Periodo</h2>
<div class="summary-box">
  <p><strong>Periodo:</strong> ${filters.dateFrom && filters.dateTo ? `${fmtDate(filters.dateFrom)} — ${fmtDate(filters.dateTo)}` : 'Todos los registros disponibles'}</p>
  <p><strong>Paises:</strong> ${filters.countries.length > 0 ? filters.countries.map((c) => `<span class="filter-tag">${c}</span>`).join(' ') : 'Todos'}</p>
</div>
<div class="kpi-row">
  <div class="kpi"><div class="kpi-value" style="color:#4F2D7F">${regs.length}</div><div class="kpi-label">Total Cambios</div></div>
  <div class="kpi"><div class="kpi-value" style="color:#ef4444">${highCount}</div><div class="kpi-label">Alto Impacto</div></div>
  <div class="kpi"><div class="kpi-value" style="color:#f59e0b">${medCount}</div><div class="kpi-label">Medio Impacto</div></div>
  <div class="kpi"><div class="kpi-value" style="color:#22c55e">${lowCount}</div><div class="kpi-label">Bajo Impacto</div></div>
</div>

<h2>Distribucion por Pais</h2>
<table><thead><tr><th>Pais</th><th>Cambios</th></tr></thead><tbody>${countryBreakdown}</tbody></table>

<h2>Detalle de Cambios Regulatorios (${regs.length})</h2>
<table><thead><tr><th>Titulo</th><th>Pais</th><th>Impacto</th><th>Fecha Efectiva</th><th>Areas</th></tr></thead>
<tbody>${regRows}</tbody></table>`;

  return wrapHtml('Cambios Regulatorios del Periodo', id, date, body);
}

async function buildRiskAssessment(id: string, date: string, filters: ReportFilters): Promise<string> {
  const [heatmapData, riskData] = await Promise.all([
    apiFetch('/api/impact/heatmap?days=730'),
    apiFetch('/api/map/risk-scores'),
  ]);

  let matrix = ((heatmapData?.['matrix'] ?? []) as Record<string, unknown>[]);
  if (filters.countries.length > 0) {
    matrix = matrix.filter((c) => filters.countries.includes(c['jurisdiction'] as string));
  }

  let countries = ((riskData?.['countries'] ?? []) as Record<string, unknown>[]);
  if (filters.countries.length > 0) {
    countries = countries.filter((c) => filters.countries.includes(c['code'] as string));
  }

  // Heatmap as HTML table
  const jurisdictions = Array.from(new Set(matrix.map((c) => c['jurisdiction'] as string))).sort();
  const areas = Array.from(new Set(matrix.map((c) => c['area'] as string)));

  const heatmapHeader = jurisdictions.map((j) => `<th style="text-align:center">${j}</th>`).join('');
  const heatmapRows = areas.map((area) => {
    const cells = jurisdictions.map((jur) => {
      const cell = matrix.find((c) => c['jurisdiction'] === jur && c['area'] === area);
      const score = (cell?.['score'] as number) ?? 0;
      const bg = score >= 70 ? '#fca5a5' : score >= 30 ? '#fef08a' : '#bbf7d0';
      const textColor = score >= 70 ? '#991b1b' : '#1f2937';
      return `<td style="text-align:center;background:${bg};color:${textColor};font-weight:700">${score}</td>`;
    }).join('');
    return `<tr><td style="font-weight:500">${area}</td>${cells}</tr>`;
  }).join('\n');

  // Country risk table
  const riskRows = countries
    .sort((a, b) => ((b['score'] as number) ?? 0) - ((a['score'] as number) ?? 0))
    .map((c) => {
      const score = (c['score'] as number) ?? 0;
      const level = c['level'] as string;
      const levelColor = level === 'CRITICAL' ? '#ef4444' : level === 'HIGH' ? '#f97316' : level === 'MEDIUM' ? '#f59e0b' : '#22c55e';
      return `<tr>
        <td style="font-weight:500">${c['code']} — ${c['name']}</td>
        <td><span style="color:${levelColor};font-weight:700">${score}</span></td>
        <td><span class="badge" style="background:${levelColor}">${level}</span></td>
        <td>${c['alertsHigh']}</td>
        <td>${c['overdueObligations']}</td>
        <td>${c['changes30d']}</td>
      </tr>`;
    }).join('\n');

  const body = `
<h2>Resumen de Riesgo</h2>
<div class="summary-box">
  <p>Evaluacion de riesgo regulatorio basada en el volumen de cambios, nivel de impacto, alertas activas y obligaciones vencidas por jurisdiccion.</p>
</div>
<div class="kpi-row">
  <div class="kpi"><div class="kpi-value">${jurisdictions.length}</div><div class="kpi-label">Jurisdicciones</div></div>
  <div class="kpi"><div class="kpi-value">${areas.length}</div><div class="kpi-label">Areas Regulatorias</div></div>
  <div class="kpi"><div class="kpi-value" style="color:#ef4444">${countries.filter((c) => c['level'] === 'CRITICAL' || c['level'] === 'HIGH').length}</div><div class="kpi-label">Paises Riesgo Alto</div></div>
</div>

<h2>Mapa de Riesgo (Heatmap)</h2>
<table><thead><tr><th>Area</th>${heatmapHeader}</tr></thead><tbody>${heatmapRows}</tbody></table>
<p style="font-size:10px;color:#6b7280;margin-top:4px">Score 0-100. Verde (bajo) → Amarillo (medio) → Rojo (alto)</p>

<h2>Detalle por Pais</h2>
<table><thead><tr><th>Pais</th><th>Score</th><th>Nivel</th><th>Alertas HIGH</th><th>Vencidas</th><th>Cambios 30d</th></tr></thead>
<tbody>${riskRows}</tbody></table>`;

  return wrapHtml('Evaluacion de Riesgo Regulatorio', id, date, body);
}

async function buildObligationsTracker(id: string, date: string, filters: ReportFilters): Promise<string> {
  const params = new URLSearchParams();
  if (filters.dateFrom) params.set('from', filters.dateFrom);
  if (filters.dateTo) params.set('to', filters.dateTo);
  if (filters.clientId) params.set('clientId', filters.clientId);

  const [eventsData, summaryData] = await Promise.all([
    apiFetch(`/api/calendar/events?${params}`),
    apiFetch('/api/calendar/summary'),
  ]);

  let events = ((eventsData?.['data'] ?? []) as Record<string, unknown>[]);
  if (filters.countries.length > 0) {
    events = events.filter((e) => filters.countries.includes(e['country'] as string));
  }

  const overdue = (summaryData?.['overdue'] as number) ?? events.filter((e) => e['status'] === 'OVERDUE').length;
  const dueWeek = (summaryData?.['dueThisWeek'] as number) ?? 0;
  const dueMonth = (summaryData?.['dueThisMonth'] as number) ?? 0;
  const total = events.length;

  const eventRows = events.map((e) => {
    const status = (e['status'] as string) ?? 'PENDING';
    const client = (e['client'] as Record<string, unknown>) ?? {};
    const daysUntil = (e['daysUntil'] as number) ?? 0;
    const daysLabel = daysUntil < 0 ? `<span style="color:#ef4444;font-size:10px"> (${Math.abs(daysUntil)}d vencido)</span>` : daysUntil <= 7 ? `<span style="color:#f59e0b;font-size:10px"> (${daysUntil}d)</span>` : '';
    return `<tr>
      <td style="font-weight:500">${e['title']}</td>
      <td>${client['name'] ?? '—'}</td>
      <td>${e['country'] ?? '—'}</td>
      <td>${fmtShortDate((e['date'] as string) ?? '')}${daysLabel}</td>
      <td><span class="${statusClass(status)}">${statusLabel(status)}</span></td>
      <td>${e['assignedTo'] ?? 'Sin asignar'}</td>
    </tr>`;
  }).join('\n');

  const body = `
<h2>Resumen de Obligaciones</h2>
<div class="kpi-row">
  <div class="kpi"><div class="kpi-value">${total}</div><div class="kpi-label">Total</div></div>
  <div class="kpi"><div class="kpi-value" style="color:#ef4444">${overdue}</div><div class="kpi-label">Vencidas</div></div>
  <div class="kpi"><div class="kpi-value" style="color:#f59e0b">${dueWeek}</div><div class="kpi-label">Vencen esta semana</div></div>
  <div class="kpi"><div class="kpi-value" style="color:#4F2D7F">${dueMonth}</div><div class="kpi-label">Vencen este mes</div></div>
</div>

<h2>Detalle de Obligaciones (${total})</h2>
<table><thead><tr><th>Obligacion</th><th>Cliente</th><th>Pais</th><th>Deadline</th><th>Estado</th><th>Asignado</th></tr></thead>
<tbody>${eventRows}</tbody></table>`;

  return wrapHtml('Tracker de Obligaciones', id, date, body);
}

async function buildClientOnboarding(id: string, date: string, filters: ReportFilters): Promise<string> {
  let clientId = filters.clientId;
  let clientData: Record<string, unknown> | null = null;

  // If no client selected, get the most recently onboarded
  if (!clientId) {
    const clientsList = await apiFetch('/api/clients?pageSize=10');
    const all = (clientsList?.['data'] ?? []) as Record<string, unknown>[];
    if (all.length > 0) {
      clientData = all[0]!;
      clientId = clientData['id'] as string;
    }
  }

  if (!clientId) {
    return wrapHtml('Reporte de Onboarding', id, date, '<div class="summary-box"><p>No hay clientes disponibles para generar el reporte.</p></div>');
  }

  const [dashboard, graph] = await Promise.all([
    apiFetch(`/api/clients/${clientId}/dashboard`),
    apiFetch(`/api/clients/${clientId}/graph?depth=3`),
  ]);

  const clientName = (dashboard?.['clientName'] as string) ?? filters.clientName ?? 'Cliente';
  const countries = ((dashboard?.['countries'] as string[]) ?? []).join(', ');
  const companyType = (dashboard?.['companyType'] as string) ?? '—';
  const score = (dashboard?.['complianceScore'] as number) ?? 0;
  const totalObl = (dashboard?.['totalObligations'] as number) ?? 0;
  const byStatus = (dashboard?.['obligationsByStatus'] as Record<string, number>) ?? {};

  const deadlines = ((dashboard?.['upcomingDeadlines'] ?? []) as Record<string, unknown>[]);
  const deadlineRows = deadlines.map((d) => {
    const status = (d['status'] as string) ?? 'PENDING';
    return `<tr>
      <td style="font-weight:500">${d['title']}</td>
      <td>${fmtShortDate((d['deadline'] as string) ?? '')}</td>
      <td><span class="${statusClass(status)}">${statusLabel(status)}</span></td>
      <td class="priority-${((d['priority'] as string) ?? 'medium').toLowerCase()}">${d['priority']}</td>
    </tr>`;
  }).join('\n');

  const nodes = ((graph?.['nodes'] ?? []) as Record<string, unknown>[]);
  const jurisdictionNodes = nodes.filter((n) => n['type'] === 'JURISDICTION').length;
  const obligationNodes = nodes.filter((n) => n['type'] === 'OBLIGATION').length;
  const regulationNodes = nodes.filter((n) => n['type'] === 'REGULATION').length;

  const scoreColor = score >= 80 ? '#22c55e' : score >= 60 ? '#f59e0b' : '#ef4444';

  const body = `
<h2>Datos del Cliente</h2>
<div class="summary-box">
  <p style="margin-bottom:6px"><strong>Nombre:</strong> ${clientName}</p>
  <p style="margin-bottom:6px"><strong>Tipo:</strong> ${companyType}</p>
  <p><strong>Jurisdicciones:</strong> ${countries}</p>
</div>

<h2>ComplianceMap — Resumen</h2>
<div class="kpi-row">
  <div class="kpi"><div class="kpi-value" style="color:${scoreColor}">${score}%</div><div class="kpi-label">Score Cumplimiento</div></div>
  <div class="kpi"><div class="kpi-value">${totalObl}</div><div class="kpi-label">Obligaciones</div></div>
  <div class="kpi"><div class="kpi-value">${jurisdictionNodes}</div><div class="kpi-label">Jurisdicciones</div></div>
  <div class="kpi"><div class="kpi-value">${regulationNodes}</div><div class="kpi-label">Regulaciones</div></div>
</div>

<h2>Estado de Obligaciones</h2>
<div class="kpi-row">
  <div class="kpi"><div class="kpi-value" style="color:#22c55e">${byStatus['COMPLETED'] ?? 0}</div><div class="kpi-label">Completadas</div></div>
  <div class="kpi"><div class="kpi-value" style="color:#2563eb">${byStatus['IN_PROGRESS'] ?? 0}</div><div class="kpi-label">En Progreso</div></div>
  <div class="kpi"><div class="kpi-value" style="color:#f59e0b">${byStatus['PENDING'] ?? 0}</div><div class="kpi-label">Pendientes</div></div>
  <div class="kpi"><div class="kpi-value" style="color:#ef4444">${byStatus['OVERDUE'] ?? 0}</div><div class="kpi-label">Vencidas</div></div>
</div>

<h2>Knowledge Graph</h2>
<div class="summary-box">
  <p>El ComplianceMap contiene <strong>${nodes.length} nodos</strong> en total: ${jurisdictionNodes} jurisdicciones, ${obligationNodes} obligaciones, ${regulationNodes} regulaciones vinculadas.</p>
</div>

${deadlines.length > 0 ? `<h2>Proximos Plazos (${deadlines.length})</h2>
<table><thead><tr><th>Obligacion</th><th>Deadline</th><th>Estado</th><th>Prioridad</th></tr></thead>
<tbody>${deadlineRows}</tbody></table>` : ''}`;

  return wrapHtml(`Reporte de Onboarding — ${clientName}`, id, date, body);
}

async function buildAlertSummary(id: string, date: string, filters: ReportFilters): Promise<string> {
  const params = new URLSearchParams({ pageSize: '100' });
  if (filters.clientId) params.set('clientId', filters.clientId);

  const data = await apiFetch(`/api/alerts?${params}`);
  let alerts = ((data?.['data'] ?? []) as Record<string, unknown>[]);

  // No date filter params on alerts endpoint, filter client-side
  if (filters.dateFrom) {
    alerts = alerts.filter((a) => ((a['createdAt'] as string) ?? '') >= filters.dateFrom);
  }
  if (filters.dateTo) {
    alerts = alerts.filter((a) => ((a['createdAt'] as string) ?? '').slice(0, 10) <= filters.dateTo);
  }

  const total = alerts.length;
  const byStatus: Record<string, number> = {};
  const byImpact: Record<string, number> = {};
  for (const a of alerts) {
    const s = (a['status'] as string) ?? 'UNKNOWN';
    const i = (a['impactLevel'] as string) ?? 'UNKNOWN';
    byStatus[s] = (byStatus[s] ?? 0) + 1;
    byImpact[i] = (byImpact[i] ?? 0) + 1;
  }

  const alertRows = alerts.map((a) => {
    const status = (a['status'] as string) ?? '';
    const level = (a['impactLevel'] as string) ?? '';
    const created = fmtShortDate((a['createdAt'] as string) ?? '');
    return `<tr>
      <td style="font-weight:500;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${a['message']}</td>
      <td><span class="badge" style="background:${impactColor(level)}">${level}</span></td>
      <td><span class="${statusClass(status)}">${statusLabel(status)}</span></td>
      <td>${a['channel'] ?? '—'}</td>
      <td>${created}</td>
    </tr>`;
  }).join('\n');

  const statusRows = Object.entries(byStatus)
    .sort((a, b) => b[1] - a[1])
    .map(([s, n]) => `<tr><td>${statusLabel(s)}</td><td style="font-weight:600">${n}</td></tr>`)
    .join('\n');

  const body = `
<h2>Resumen de Alertas</h2>
<div class="kpi-row">
  <div class="kpi"><div class="kpi-value" style="color:#4F2D7F">${total}</div><div class="kpi-label">Total Alertas</div></div>
  <div class="kpi"><div class="kpi-value" style="color:#ef4444">${byImpact['HIGH'] ?? 0}</div><div class="kpi-label">Alto Impacto</div></div>
  <div class="kpi"><div class="kpi-value" style="color:#f59e0b">${byImpact['MEDIUM'] ?? 0}</div><div class="kpi-label">Medio</div></div>
  <div class="kpi"><div class="kpi-value" style="color:#22c55e">${byImpact['LOW'] ?? 0}</div><div class="kpi-label">Bajo</div></div>
</div>

<h2>Distribucion por Estado</h2>
<table><thead><tr><th>Estado</th><th>Cantidad</th></tr></thead><tbody>${statusRows}</tbody></table>

<h2>Detalle de Alertas (${total})</h2>
<table><thead><tr><th>Mensaje</th><th>Impacto</th><th>Estado</th><th>Canal</th><th>Fecha</th></tr></thead>
<tbody>${alertRows}</tbody></table>`;

  return wrapHtml('Resumen de Alertas', id, date, body);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ReportGenerator() {
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedClient, setSelectedClient] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [history, setHistory] = useState<GeneratedReport[]>([]);
  const [generating, setGenerating] = useState(false);
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const generatingRef = useRef(false);

  // Fetch clients for the filter
  useEffect(() => {
    const fetchClients = async () => {
      try {
        const token = sessionStorage.getItem('auth_token') ?? process.env['NEXT_PUBLIC_DEV_TOKEN'] ?? null;
        const res = await fetch(`${API_BASE}/api/clients?pageSize=100`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (res.ok) {
          const data = await res.json();
          setClients((data.data ?? []).map((c: Record<string, unknown>) => ({
            id: c['id'] as string,
            name: c['name'] as string,
          })));
        }
      } catch {
        // Clients not available
      }
    };
    fetchClients();
  }, []);

  const toggleCountry = (code: string) => {
    setSelectedCountries((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
    );
  };

  const template = TEMPLATES.find((t) => t.id === selectedTemplate);
  const filteredTemplates = categoryFilter
    ? TEMPLATES.filter((t) => t.category === categoryFilter)
    : TEMPLATES;

  const handleGenerate = async () => {
    if (!template || generatingRef.current) return;
    generatingRef.current = true;
    setGenerating(true);

    const clientName = clients.find((c) => c.id === selectedClient)?.name ?? '';
    const reportId = crypto.randomUUID();
    const now = new Date().toISOString();

    const newReport: GeneratedReport = {
      id: reportId,
      templateId: template.id,
      templateTitle: template.title,
      generatedAt: now,
      status: 'generating',
      filters: {
        countries: selectedCountries.length > 0 ? selectedCountries : [...COUNTRIES_AVAILABLE],
        dateRange: dateFrom && dateTo ? `${dateFrom} — ${dateTo}` : 'Todos los registros',
        clientName,
      },
    };

    setHistory((prev) => [newReport, ...prev]);

    const filters: ReportFilters = {
      countries: selectedCountries,
      dateFrom,
      dateTo,
      clientId: selectedClient,
      clientName,
    };

    try {
      const builders: Record<string, (id: string, date: string, f: ReportFilters) => Promise<string>> = {
        'compliance-status': buildComplianceStatus,
        'regulatory-changes': buildRegulatoryChanges,
        'risk-assessment': buildRiskAssessment,
        'obligations-tracker': buildObligationsTracker,
        'client-onboarding': buildClientOnboarding,
        'alert-summary': buildAlertSummary,
      };

      const builder = builders[template.id];
      if (!builder) throw new Error(`Template ${template.id} not implemented`);

      const html = await builder(reportId, now, filters);

      setHistory((prev) =>
        prev.map((r) => r.id === reportId ? { ...r, status: 'ready' as const, htmlContent: html } : r),
      );
    } catch (err) {
      setHistory((prev) =>
        prev.map((r) => r.id === reportId ? { ...r, status: 'error' as const, errorMessage: String(err) } : r),
      );
    } finally {
      setGenerating(false);
      generatingRef.current = false;
    }
  };

  const handleDownload = (report: GeneratedReport) => {
    if (!report.htmlContent) return;
    const blob = new Blob([report.htmlContent], { type: 'text/html; charset=utf-8' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">Generador de Reportes</h1>
        <p className="text-sm text-gray-500 mt-1">
          Selecciona una plantilla, configura filtros y genera reportes de cumplimiento
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Template selector */}
        <div className="lg:col-span-2 space-y-4">
          {/* Category tabs */}
          <div className="flex gap-2">
            <button
              onClick={() => setCategoryFilter(null)}
              className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                !categoryFilter ? 'bg-brand-700 text-white border-brand-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'
              }`}
            >
              Todos
            </button>
            {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setCategoryFilter(categoryFilter === key ? null : key)}
                className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                  categoryFilter === key ? 'bg-brand-700 text-white border-brand-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Template grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {filteredTemplates.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelectedTemplate(t.id)}
                className={`text-left p-4 rounded-xl border-2 transition-all ${
                  selectedTemplate === t.id
                    ? 'border-brand-700 bg-brand-50 shadow-sm'
                    : 'border-gray-100 bg-white hover:border-gray-200 hover:shadow-sm'
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className="text-2xl flex-shrink-0">{t.icon}</span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-semibold text-gray-900 leading-tight">{t.title}</h3>
                    </div>
                    <p className="text-xs text-gray-500 line-clamp-2">{t.description}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${CATEGORY_COLORS[t.category]}`}>
                        {CATEGORY_LABELS[t.category]}
                      </span>
                      <span className="text-[10px] text-gray-400">{t.estimatedPages} pags.</span>
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Right: Filters + Generate */}
        <div className="space-y-4">
          <div className="card">
            <div className="card-header">
              <h3 className="text-sm font-semibold text-gray-900">Configurar Reporte</h3>
            </div>
            <div className="card-body space-y-4">
              {/* Selected template */}
              {template ? (
                <div className="p-3 rounded-lg bg-brand-50 border border-brand-200">
                  <p className="text-xs font-semibold text-brand-800">{template.icon} {template.title}</p>
                </div>
              ) : (
                <div className="p-3 rounded-lg bg-gray-50 border border-dashed border-gray-200 text-center">
                  <p className="text-xs text-gray-400">Elige un tipo de reporte de la lista</p>
                </div>
              )}

              {/* Countries */}
              <div>
                <label className="label">Paises</label>
                <div className="flex gap-1.5 mt-1">
                  {COUNTRIES_AVAILABLE.map((code) => (
                    <button
                      key={code}
                      onClick={() => toggleCountry(code)}
                      className={`p-1.5 rounded transition-colors ${
                        selectedCountries.includes(code)
                          ? 'bg-brand-100 ring-1 ring-brand-700'
                          : 'hover:bg-gray-100'
                      }`}
                      title={code}
                    >
                      <CountryFlag code={code} size="sm" />
                    </button>
                  ))}
                </div>
                {selectedCountries.length === 0 && (
                  <p className="text-[10px] text-gray-400 mt-1">Sin seleccion = todos los paises</p>
                )}
              </div>

              {/* Client filter */}
              <div>
                <label className="label">Cliente (opcional)</label>
                <select
                  value={selectedClient}
                  onChange={(e) => setSelectedClient(e.target.value)}
                  className="input mt-1"
                >
                  <option value="">Todos los clientes</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              {/* Date range */}
              <div>
                <label className="label">Periodo</label>
                <div className="flex gap-2 mt-1">
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="input text-xs flex-1"
                  />
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="input text-xs flex-1"
                  />
                </div>
              </div>

              {/* Generate button */}
              <button
                onClick={handleGenerate}
                disabled={!template || generating}
                className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {generating ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Consultando API...
                  </span>
                ) : 'Generar Reporte'}
              </button>
            </div>
          </div>

          {/* Report history */}
          {history.length > 0 && (
            <div className="card">
              <div className="card-header">
                <h3 className="text-sm font-semibold text-gray-900">Reportes Generados</h3>
              </div>
              <div className="card-body divide-y divide-gray-100">
                {history.map((report) => (
                  <div key={report.id} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex items-start justify-between">
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-gray-900 truncate">{report.templateTitle}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">
                          {report.filters.countries.join(', ')} — {report.filters.dateRange}
                        </p>
                        <p className="text-[10px] text-gray-400">
                          {new Date(report.generatedAt).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      <div className="flex-shrink-0 ml-3">
                        {report.status === 'generating' && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 font-medium">
                            <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                            Generando
                          </span>
                        )}
                        {report.status === 'ready' && (
                          <button
                            onClick={() => handleDownload(report)}
                            className="text-[10px] text-brand-700 font-semibold hover:underline"
                          >
                            Descargar PDF
                          </button>
                        )}
                        {report.status === 'error' && (
                          <span className="text-[10px] text-red-500 font-medium">Error</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
