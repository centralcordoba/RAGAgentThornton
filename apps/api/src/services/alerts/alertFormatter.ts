// ============================================================================
// FILE: apps/api/src/services/alerts/alertFormatter.ts
// Formats AI analysis + client context into structured alert messages.
// ============================================================================

import type { AIAnalysis, Client, RegulatoryChange, ImpactLevel, AlertChannel } from '@regwatch/shared';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AlertMessage {
  readonly subject: string;
  readonly bodyHtml: string;
  readonly bodyText: string;
  readonly severity: ImpactLevel;
  readonly actionRequired: boolean;
  readonly deadline: string | null;
  readonly affectedObligations: readonly string[];
  readonly recommendedActions: readonly string[];
}

// ---------------------------------------------------------------------------
// AlertFormatter
// ---------------------------------------------------------------------------

export class AlertFormatter {
  /**
   * Format an AI analysis + regulatory change into a structured alert message
   * personalized for a specific client.
   */
  format(
    analysis: AIAnalysis,
    change: RegulatoryChange,
    client: Client,
  ): AlertMessage {
    const severity = change.impactLevel;
    const actionRequired = severity === 'HIGH' || severity === 'MEDIUM';
    const deadline = change.effectiveDate.toISOString().split('T')[0] ?? null;

    const subject = buildSubject(change, severity);
    const recommendedActions = buildRecommendedActions(analysis, change, severity);
    const bodyText = buildTextBody(analysis, change, client, recommendedActions);
    const bodyHtml = buildHtmlBody(analysis, change, client, recommendedActions);

    return {
      subject,
      bodyHtml,
      bodyText,
      severity,
      actionRequired,
      deadline,
      affectedObligations: [...analysis.impactedObligations],
      recommendedActions,
    };
  }
}

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

function buildSubject(change: RegulatoryChange, severity: ImpactLevel): string {
  const severityPrefix: Record<ImpactLevel, string> = {
    HIGH: '[URGENTE]',
    MEDIUM: '[Importante]',
    LOW: '[Informativo]',
  };

  return `${severityPrefix[severity]} ${change.title} — ${change.country}`;
}

function buildRecommendedActions(
  analysis: AIAnalysis,
  change: RegulatoryChange,
  severity: ImpactLevel,
): string[] {
  const actions: string[] = [];

  if (severity === 'HIGH') {
    actions.push('Revisar el cambio regulatorio con el equipo legal inmediatamente.');
    actions.push(`Verificar cumplimiento antes de la fecha efectiva: ${change.effectiveDate.toISOString().split('T')[0]}.`);
  }

  if (analysis.impactedObligations.length > 0) {
    actions.push(
      `Actualizar ${analysis.impactedObligations.length} obligación(es) afectada(s) en el sistema de compliance.`,
    );
  }

  if (severity === 'HIGH' || severity === 'MEDIUM') {
    actions.push('Comunicar a los responsables de las áreas afectadas.');
  }

  if (change.affectedAreas.length > 0) {
    actions.push(
      `Revisar procesos internos en: ${change.affectedAreas.join(', ')}.`,
    );
  }

  actions.push('Confirmar la recepción de esta alerta en el dashboard de RegWatch AI.');

  return actions;
}

function buildTextBody(
  analysis: AIAnalysis,
  change: RegulatoryChange,
  client: Client,
  actions: readonly string[],
): string {
  const lines = [
    `Estimado equipo de ${client.name},`,
    '',
    `Se ha detectado un cambio regulatorio que impacta su operación en ${change.country}.`,
    '',
    `CAMBIO REGULATORIO`,
    `Título: ${change.title}`,
    `País: ${change.country} (${change.jurisdiction})`,
    `Impacto: ${change.impactLevel}`,
    `Fecha efectiva: ${change.effectiveDate.toISOString().split('T')[0]}`,
    `Fuente: ${change.sourceUrl}`,
    '',
    `ANÁLISIS DE IMPACTO`,
    analysis.answer,
    '',
    `Confianza del análisis: ${(analysis.confidence * 100).toFixed(0)}%`,
    `Razonamiento: ${analysis.reasoning}`,
    '',
  ];

  if (analysis.impactedObligations.length > 0) {
    lines.push('OBLIGACIONES AFECTADAS');
    for (const obl of analysis.impactedObligations) {
      lines.push(`- ${obl}`);
    }
    lines.push('');
  }

  lines.push('ACCIONES RECOMENDADAS');
  for (const [i, action] of actions.entries()) {
    lines.push(`${i + 1}. ${action}`);
  }

  lines.push('');
  lines.push('---');
  lines.push('RegWatch AI — Grant Thornton');
  lines.push('Este análisis fue generado por inteligencia artificial y revisado por profesionales de GT.');

  return lines.join('\n');
}

function buildHtmlBody(
  analysis: AIAnalysis,
  change: RegulatoryChange,
  client: Client,
  actions: readonly string[],
): string {
  const severityColor: Record<ImpactLevel, string> = {
    HIGH: '#dc2626',
    MEDIUM: '#f59e0b',
    LOW: '#10b981',
  };

  const color = severityColor[change.impactLevel];

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 680px; margin: 0 auto; padding: 20px; color: #333;">
  <div style="border-left: 4px solid ${color}; padding-left: 16px; margin-bottom: 24px;">
    <h2 style="margin: 0 0 8px; color: ${color};">${escapeHtml(change.title)}</h2>
    <p style="margin: 0; color: #666;">
      ${escapeHtml(change.country)} · Impacto: <strong style="color: ${color};">${change.impactLevel}</strong>
      · Fecha efectiva: ${change.effectiveDate.toISOString().split('T')[0]}
    </p>
  </div>

  <p>Estimado equipo de <strong>${escapeHtml(client.name)}</strong>,</p>
  <p>Se ha detectado un cambio regulatorio que impacta su operación en ${escapeHtml(change.country)}.</p>

  <h3 style="color: #1e3a5f; border-bottom: 1px solid #e5e7eb; padding-bottom: 8px;">Análisis de Impacto</h3>
  <p>${escapeHtml(analysis.answer)}</p>
  <p style="color: #666; font-size: 14px;">
    Confianza: ${(analysis.confidence * 100).toFixed(0)}% · ${escapeHtml(analysis.reasoning)}
  </p>

  ${analysis.impactedObligations.length > 0 ? `
  <h3 style="color: #1e3a5f; border-bottom: 1px solid #e5e7eb; padding-bottom: 8px;">Obligaciones Afectadas</h3>
  <ul>${analysis.impactedObligations.map((o) => `<li>${escapeHtml(o)}</li>`).join('')}</ul>
  ` : ''}

  <h3 style="color: #1e3a5f; border-bottom: 1px solid #e5e7eb; padding-bottom: 8px;">Acciones Recomendadas</h3>
  <ol>${actions.map((a) => `<li>${escapeHtml(a)}</li>`).join('')}</ol>

  <p><a href="${escapeHtml(change.sourceUrl)}" style="color: #2563eb;">Ver documento fuente completo</a></p>

  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
  <p style="font-size: 12px; color: #999;">
    RegWatch AI — Grant Thornton<br>
    Este análisis fue generado por inteligencia artificial y revisado por profesionales de GT.
  </p>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
