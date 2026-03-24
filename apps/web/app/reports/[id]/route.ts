// ============================================================================
// FILE: apps/web/app/reports/[id]/route.ts
// Route handler that returns standalone HTML for PDF export.
// Opens in new tab — user prints to PDF via Ctrl+P / browser print.
// ============================================================================

import { NextResponse } from 'next/server';

const API_BASE = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3000';
const DEV_TOKEN = process.env['NEXT_PUBLIC_DEV_TOKEN'] ?? null;

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (DEV_TOKEN) headers['Authorization'] = `Bearer ${DEV_TOKEN}`;

  let regulation: Record<string, unknown> | null = null;
  let changedClauses: Record<string, unknown>[] = [];
  let affectedClients: Record<string, unknown>[] = [];

  try {
    const res = await fetch(`${API_BASE}/api/regulations/${params.id}`, { headers, cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      regulation = data.regulation;
      changedClauses = data.changedClauses ?? [];
      affectedClients = data.affectedClients ?? [];
    }
  } catch {
    // API unavailable
  }

  if (!regulation) {
    return new NextResponse('Regulation not found', { status: 404 });
  }

  const title = regulation['title'] as string;
  const summary = regulation['summary'] as string;
  const country = regulation['country'] as string;
  const jurisdiction = regulation['jurisdiction'] as string;
  const impactLevel = regulation['impactLevel'] as string;
  const effectiveDate = regulation['effectiveDate'] as string;
  const publishedDate = regulation['publishedDate'] as string;
  const areas = (regulation['affectedAreas'] as string[]) ?? [];

  const now = new Date();
  const overdueCount = changedClauses.filter((c) => c['status'] === 'OVERDUE').length;
  const totalObls = changedClauses.length;
  const uniqueClients = Array.from(new Set(changedClauses.map((c) => c['clientName'] as string)));
  const severityScore = totalObls > 0 ? Math.round((overdueCount / totalObls) * 100) : 0;
  const severityLabel = severityScore >= 80 ? 'CRITICO' : severityScore >= 60 ? 'ALTO' : severityScore >= 30 ? 'MEDIO' : 'BAJO';
  const severityColor = severityScore >= 80 ? '#ef4444' : severityScore >= 60 ? '#f97316' : severityScore >= 30 ? '#eab308' : '#22c55e';
  const impactColor = impactLevel === 'HIGH' ? '#ef4444' : impactLevel === 'MEDIUM' ? '#f59e0b' : '#22c55e';

  const fmtDate = (d: string) => {
    try { return new Date(d).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' }); }
    catch { return d; }
  };

  const obligationsRows = changedClauses.map((c) => {
    const deadline = c['deadline'] as string;
    const status = c['status'] as string;
    const daysUntil = Math.ceil((new Date(deadline).getTime() - Date.now()) / 86_400_000);
    const statusClass = status === 'OVERDUE' ? 'status-overdue' : status === 'COMPLETED' ? 'status-completed' : 'status-pending';
    const statusLabel = status === 'OVERDUE' ? 'Vencido' : status === 'COMPLETED' ? 'Completado' : 'Pendiente';
    const daysLabel = daysUntil < 0 ? `<span style="color:#ef4444;font-size:10px;margin-left:4px">(${Math.abs(daysUntil)}d vencido)</span>` : '';

    return `<tr>
      <td style="font-weight:500">${c['title']}</td>
      <td>${c['clientName']}</td>
      <td>${deadline}${daysLabel}</td>
      <td><span class="${statusClass}">${statusLabel}</span></td>
      <td class="priority-${(c['priority'] as string).toLowerCase()}">${c['priority']}</td>
    </tr>`;
  }).join('\n');

  const clientRows = uniqueClients.map((name) => {
    const clientObls = changedClauses.filter((c) => c['clientName'] === name);
    const clientOverdue = clientObls.filter((c) => c['status'] === 'OVERDUE').length;
    return `<tr>
      <td style="font-weight:500">${name}</td>
      <td>${clientObls.length}</td>
      <td>${clientOverdue > 0 ? `<span style="color:#ef4444;font-weight:600">${clientOverdue}</span>` : '<span style="color:#22c55e">0</span>'}</td>
      <td style="font-size:11px">${clientOverdue > 0 ? 'Accion inmediata — obligaciones vencidas' : 'Monitorear — al dia'}</td>
    </tr>`;
  }).join('\n');

  const actionRows = [
    ...(overdueCount > 0 ? [`<tr><td><span class="badge" style="background:#ef4444">INMEDIATA</span></td><td>Revisar ${overdueCount} obligaciones vencidas</td><td>Hoy</td><td>GT Professional</td></tr>`] : []),
    ...changedClauses.filter((c) => c['status'] === 'PENDING').map((c) =>
      `<tr><td><span class="badge" style="background:#f59e0b">CORTO PLAZO</span></td><td>${c['title']}</td><td>${c['deadline']}</td><td>GT Professional</td></tr>`
    ),
  ].join('\n');

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>RegWatch AI — Reporte: ${title}</title>
<style>
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
.priority-high { color: #ef4444; font-weight: 600; }
.priority-medium { color: #f59e0b; }
.priority-low { color: #22c55e; }
.meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 12px 0; }
.meta-item label { display: block; font-size: 10px; color: #6b7280; text-transform: uppercase; }
.meta-item span { font-size: 13px; font-weight: 500; }
.areas-list { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
.area-tag { background: #eff6ff; color: #1e40af; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 500; }
.footer { margin-top: 32px; padding-top: 12px; border-top: 2px solid #4F2D7F; display: flex; justify-content: space-between; font-size: 10px; color: #6b7280; }
.print-btn { position: fixed; bottom: 20px; right: 20px; background: #4F2D7F; color: white; border: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; box-shadow: 0 4px 12px rgba(79,45,127,0.3); }
.print-btn:hover { background: #3d2263; }
.signature { margin-top: 24px; padding: 14px; background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; }
</style>
</head>
<body>
<button class="print-btn no-print" onclick="window.print()">Descargar PDF</button>

<div class="header">
  <div>
    <h1>RegWatch AI — Reporte de Impacto</h1>
    <p>${title}</p>
  </div>
  <div class="header-right">
    <p>${fmtDate(now.toISOString())}</p>
    <p>ID: ${params.id.slice(0, 8)}</p>
    <p style="margin-top:4px"><span class="badge" style="background:${impactColor}">${impactLevel}</span></p>
  </div>
</div>

<h2>Resumen Ejecutivo</h2>
<div class="summary-box"><p>${summary}</p></div>

<div class="kpi-row">
  <div class="kpi"><div class="kpi-value" style="color:${severityColor}">${severityScore}%</div><div class="kpi-label">Riesgo</div><span class="badge" style="background:${severityColor};margin-top:4px">${severityLabel}</span></div>
  <div class="kpi"><div class="kpi-value">${totalObls}</div><div class="kpi-label">Obligaciones</div></div>
  <div class="kpi"><div class="kpi-value" style="color:#ef4444">${overdueCount}</div><div class="kpi-label">Vencidas</div></div>
  <div class="kpi"><div class="kpi-value">${uniqueClients.length}</div><div class="kpi-label">Clientes</div></div>
</div>

<h2>Datos de la Regulacion</h2>
<div class="meta-grid">
  <div class="meta-item"><label>Pais</label><span>${country} — ${jurisdiction}</span></div>
  <div class="meta-item"><label>Fecha efectiva</label><span>${fmtDate(effectiveDate)}</span></div>
  <div class="meta-item"><label>Publicacion</label><span>${fmtDate(publishedDate)}</span></div>
  <div class="meta-item"><label>Impacto</label><span>${impactLevel}</span></div>
</div>
<div style="margin-top:8px"><label style="font-size:10px;color:#6b7280;text-transform:uppercase">Areas afectadas</label>
<div class="areas-list">${areas.map((a) => `<span class="area-tag">${a}</span>`).join('')}</div></div>

${totalObls > 0 ? `<h2>Obligaciones Derivadas (${totalObls})</h2>
<table><thead><tr><th>Obligacion</th><th>Cliente</th><th>Deadline</th><th>Estado</th><th>Prioridad</th></tr></thead><tbody>${obligationsRows}</tbody></table>` : ''}

${uniqueClients.length > 0 ? `<h2>Clientes Afectados (${uniqueClients.length})</h2>
<table><thead><tr><th>Cliente</th><th>Obligaciones</th><th>Vencidas</th><th>Accion</th></tr></thead><tbody>${clientRows}</tbody></table>` : ''}

<h2>Acciones Recomendadas</h2>
<table><thead><tr><th>Prioridad</th><th>Accion</th><th>Deadline</th><th>Asignar a</th></tr></thead><tbody>${actionRows}</tbody></table>

<div class="signature"><p style="font-size:12px;color:#92400e;font-weight:600">Pendiente de revision — Requiere aprobacion de un profesional GT antes de distribuir al cliente.</p></div>

<div class="footer"><span>Grant Thornton — RegWatch AI v0.1.0</span><span>Confidencial — Solo para uso interno</span></div>
</body>
</html>`;

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
