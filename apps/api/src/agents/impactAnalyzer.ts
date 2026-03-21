// ============================================================================
// FILE: apps/api/src/agents/impactAnalyzer.ts
// Impact Analyzer Agent — LangChain ReAct agent for regulatory impact analysis.
// Streams reasoning steps via SSE while analyzing a regulatory change.
//
// Tools: searchRelatedRegulations, compareRegulationVersions,
//        queryAffectedClients, calculateSeverityScore, getHistoricalContext
// ============================================================================

import { randomUUID } from 'node:crypto';
import type {
  ImpactReport,
  ReasoningStep,
  ClientImpact,
  ChangedClause,
  RecommendedAction,
} from '@regwatch/shared';
import { createServiceLogger } from '../config/logger.js';

const logger = createServiceLogger('agent:impact-analyzer');

// ---------------------------------------------------------------------------
// System Prompt
// ---------------------------------------------------------------------------

export const IMPACT_ANALYZER_SYSTEM_PROMPT = `Sos un agente especializado en análisis de impacto regulatorio para empresas
multinacionales clientes de Grant Thornton.

Tu tarea cuando recibís un cambio regulatorio:
1. Identificar exactamente qué cláusulas cambiaron y su naturaleza
   (nuevo requisito / deadline acortado / sanción aumentada / excepción eliminada)
2. Buscar regulaciones relacionadas que puedan verse afectadas en cadena
3. Determinar qué clientes están expuestos usando el knowledge graph
4. Calcular un severity score (0-100) basado en:
   - Tipo de cambio (deadline acortado = +30, nueva obligación = +25, etc.)
   - Jurisdicciones afectadas
   - Número de clientes impactados
   - Proximidad del deadline efectivo
5. Generar acciones recomendadas específicas y ejecutables

IMPORTANTE:
- Mostrá tu razonamiento paso a paso. Nunca omitas steps.
- Confidence < 70%: incluir advertencia explícita de revisión humana
- Nunca generes asesoramiento legal. Generás análisis de impacto.
- Idioma: responder en el idioma del profesional GT que consulta.
- Máximo 1500 tokens en la respuesta final estructurada.`;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AnalyzeParams {
  readonly changeId: string;
  readonly tenantId: string;
  readonly userId: string;
}

type StepEmitter = (step: ReasoningStep) => void;

// ---------------------------------------------------------------------------
// Impact Analyzer Agent
// ---------------------------------------------------------------------------

export class ImpactAnalyzerAgent {
  /**
   * Run the full impact analysis pipeline, emitting reasoning steps via callback.
   * In production this orchestrates LangChain ReAct with Azure OpenAI.
   * Current implementation simulates the agent's behavior with realistic data.
   */
  async analyze(
    params: AnalyzeParams,
    emitStep: StepEmitter,
  ): Promise<ImpactReport> {
    const { changeId, tenantId } = params;
    const requestId = randomUUID();
    const startTime = Date.now();

    logger.info({
      operation: 'impact_analyzer:start',
      requestId,
      changeId,
      tenantId,
    });

    let stepNum = 0;
    const allSteps: ReasoningStep[] = [];

    const emit = (
      type: ReasoningStep['type'],
      message: string,
      data?: Record<string, unknown>,
    ): void => {
      stepNum++;
      const step: ReasoningStep = {
        step: stepNum,
        type,
        message,
        timestamp: new Date().toISOString(),
        data,
      };
      allSteps.push(step);
      emitStep(step);
    };

    // Step 1: Search related regulations
    emit('search', 'Buscando regulaciones relacionadas en Azure AI Search...');
    await sleep(600 + rand(800));

    const relatedRegulations = generateRelatedRegulations(changeId);
    emit('search', `Encontradas ${relatedRegulations.length} regulaciones relacionadas`, {
      count: relatedRegulations.length,
      regulations: relatedRegulations,
    });
    await sleep(400 + rand(500));

    // Step 2: Compare versions (diff)
    emit('analysis', 'Comparando versión anterior vs nueva — análisis de cláusulas...');
    await sleep(800 + rand(1000));

    const changedClauses = generateChangedClauses();
    const deadlineChanged = changedClauses.some((c) => c.changeType === 'deadline_shortened');
    emit('detection', `Detectados ${changedClauses.length} cambios en cláusulas específicas`, {
      clauses: changedClauses.map((c) => c.title),
    });
    await sleep(300 + rand(400));

    if (deadlineChanged) {
      emit('detection', 'Detectado: deadline acortado de 30 → 15 días — impacto operacional significativo');
      await sleep(200);
    }

    // Step 3: Query affected clients via graph
    emit('graph', 'Consultando knowledge graph — relaciones jurisdicción → obligación → cliente...');
    await sleep(700 + rand(900));

    const affectedClients = generateAffectedClients();
    const totalClients = 8;
    emit('clients', `Clientes afectados: ${affectedClients.length} de ${totalClients}`, {
      affected: affectedClients.map((c) => c.clientName),
      total: totalClients,
    });
    await sleep(400 + rand(500));

    // Step 4: Calculate severity
    emit('analysis', 'Calculando severity score basado en tipo de cambio, jurisdicciones, clientes y deadlines...');
    await sleep(500 + rand(600));

    const severityScore = 72 + Math.floor(rand(20));
    const confidence = 85 + Math.floor(rand(12));
    emit('analysis', `Severity score: ${severityScore}/100 — Confianza: ${confidence}%`, {
      severityScore,
      confidence,
    });
    await sleep(300);

    // Step 5: Generate recommendations
    emit('analysis', 'Generando acciones recomendadas para cada cliente afectado...');
    await sleep(600 + rand(700));

    const recommendedActions = generateRecommendedActions(affectedClients);

    // Confidence warning
    if (confidence < 70) {
      emit('warning', `Confianza ${confidence}% < 70% — se recomienda revisión humana detallada antes de notificar`);
      await sleep(200);
    }

    // Complete
    const duration = Date.now() - startTime;
    emit('complete', `Análisis completado en ${(duration / 1000).toFixed(1)}s — confianza: ${confidence}%`, {
      duration,
      severityScore,
      confidence,
      affectedClientsCount: affectedClients.length,
    });

    const report: ImpactReport = {
      id: randomUUID(),
      changeId,
      regulation: {
        title: `Regulatory Change ${changeId.slice(0, 8)}`,
        jurisdiction: 'EU',
        area: 'Financiero',
        effectiveDate: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      },
      diff: {
        before: SAMPLE_DIFF.before,
        after: SAMPLE_DIFF.after,
        changedClauses,
      },
      reasoning: allSteps,
      affectedClients,
      severityScore,
      confidence,
      relatedRegulations,
      recommendedActions,
      generatedAt: new Date().toISOString(),
      reviewedBy: null,
      reviewedAt: null,
    };

    logger.info({
      operation: 'impact_analyzer:complete',
      requestId,
      changeId,
      tenantId,
      severityScore,
      confidence,
      affectedClients: affectedClients.length,
      duration,
      result: 'success',
    });

    return report;
  }
}

// ---------------------------------------------------------------------------
// Mock data generators (will be replaced by real LLM + graph queries)
// ---------------------------------------------------------------------------

function generateRelatedRegulations(_changeId: string): string[] {
  return [
    'MiFID II — Markets in Financial Instruments Directive',
    'EMIR — European Market Infrastructure Regulation',
    'DORA — Digital Operational Resilience Act',
  ];
}

function generateChangedClauses(): ChangedClause[] {
  return [
    {
      clauseId: 'art-23-1',
      title: 'Art. 23.1 — Plazo de presentación de reportes',
      changeType: 'deadline_shortened',
      severity: 'critical',
      summary: 'Plazo de presentación reducido de 30 días a 15 días hábiles',
    },
    {
      clauseId: 'art-45-3',
      title: 'Art. 45.3 — Requisitos de capital',
      changeType: 'new_obligation',
      severity: 'high',
      summary: 'Nuevo requisito de buffer de capital del 2.5% para exposiciones derivados',
    },
    {
      clauseId: 'art-67-2',
      title: 'Art. 67.2 — Sanciones por incumplimiento',
      changeType: 'sanction_increased',
      severity: 'high',
      summary: 'Multa máxima aumentada de €500K a €2M o 1% del volumen anual',
    },
    {
      clauseId: 'art-12-5',
      title: 'Art. 12.5 — Excepción para entidades pequeñas',
      changeType: 'exception_removed',
      severity: 'medium',
      summary: 'Eliminada la exención para entidades con activos < €50M',
    },
  ];
}

function generateAffectedClients(): ClientImpact[] {
  return [
    {
      clientId: randomUUID(),
      clientName: 'EuroTrade GmbH',
      severityScore: 92,
      affectedObligations: ['Quarterly derivatives report', 'Capital buffer maintenance'],
      deadlineChange: { from: '2026-06-30', to: '2026-06-15' },
      recommendedAction: 'Revisar inmediatamente procesos de reporte — deadline acortado 15 días',
    },
    {
      clientId: randomUUID(),
      clientName: 'FinanceCorp EU',
      severityScore: 78,
      affectedObligations: ['Capital adequacy report', 'Risk disclosure'],
      deadlineChange: { from: '2026-06-30', to: '2026-06-15' },
      recommendedAction: 'Actualizar modelo de cálculo de capital y enviar notificación al board',
    },
    {
      clientId: randomUUID(),
      clientName: 'TechStart Inc',
      severityScore: 35,
      affectedObligations: ['Annual compliance filing'],
      deadlineChange: null,
      recommendedAction: 'Bajo impacto — incluir en próximo ciclo de revisión trimestral',
    },
  ];
}

function generateRecommendedActions(_clients: readonly ClientImpact[]): RecommendedAction[] {
  return [
    {
      priority: 'immediate',
      action: 'Notificar a clientes con severidad > 70% sobre cambio de deadline',
      deadline: new Date(Date.now() + 3 * 86_400_000).toISOString(),
      assignTo: 'gt_professional',
    },
    {
      priority: 'short_term',
      action: 'Actualizar plantillas de reportes para reflejar nuevo formato Art. 23',
      deadline: new Date(Date.now() + 14 * 86_400_000).toISOString(),
      assignTo: 'gt_professional',
    },
    {
      priority: 'medium_term',
      action: 'Evaluar impacto de nuevo buffer de capital con cada cliente afectado',
      deadline: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      assignTo: 'client',
    },
  ];
}

const SAMPLE_DIFF = {
  before: `SECCIÓN III — OBLIGACIONES DE REPORTE

Art. 23 — Plazo de presentación
23.1 Las entidades obligadas deberán presentar sus reportes
trimestrales de exposición a derivados dentro de un plazo
de treinta (30) días hábiles contados desde el cierre del
período reportado.

23.2 El regulador podrá solicitar información adicional
dentro de los quince (15) días siguientes a la recepción
del reporte.

Art. 45 — Requisitos de capital
45.1 Las entidades deberán mantener un ratio de capital
mínimo del 8% sobre sus activos ponderados por riesgo.

45.2 No se establecen buffers adicionales para
exposiciones específicas a derivados financieros.

45.3 [Reservado para futuras disposiciones]

Art. 67 — Régimen sancionatorio
67.1 Las infracciones a esta normativa serán sancionadas
conforme al régimen general de supervisión.

67.2 La multa máxima aplicable será de quinientos mil
euros (€500.000) por infracción.

Art. 12 — Ámbito de aplicación
12.5 Quedan exentas de las obligaciones del Título III
las entidades con activos totales inferiores a cincuenta
millones de euros (€50M).`,

  after: `SECCIÓN III — OBLIGACIONES DE REPORTE

Art. 23 — Plazo de presentación
23.1 Las entidades obligadas deberán presentar sus reportes
trimestrales de exposición a derivados dentro de un plazo
de quince (15) días hábiles contados desde el cierre del
período reportado.

23.2 El regulador podrá solicitar información adicional
dentro de los diez (10) días siguientes a la recepción
del reporte.

Art. 45 — Requisitos de capital
45.1 Las entidades deberán mantener un ratio de capital
mínimo del 8% sobre sus activos ponderados por riesgo.

45.2 Las entidades con exposición neta a derivados
financieros superior al 15% de sus activos deberán
mantener un buffer de capital adicional del 2.5%.

45.3 El buffer adicional deberá constituirse en un plazo
máximo de seis (6) meses desde la entrada en vigor de
esta disposición.

Art. 67 — Régimen sancionatorio
67.1 Las infracciones a esta normativa serán sancionadas
conforme al régimen general de supervisión.

67.2 La multa máxima aplicable será de dos millones de
euros (€2.000.000) o el 1% del volumen anual de
operaciones, lo que resulte mayor, por infracción.

Art. 12 — Ámbito de aplicación
12.5 [Derogado — Todas las entidades quedan sujetas a
las obligaciones del Título III independientemente de
su volumen de activos.]`,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function rand(max: number): number {
  return Math.floor(Math.random() * max);
}
