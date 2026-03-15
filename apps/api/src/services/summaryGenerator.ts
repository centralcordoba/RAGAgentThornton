// ============================================================================
// FILE: apps/api/src/services/summaryGenerator.ts
// Azure OpenAI-powered executive summary generator for onboarding.
// Generates bilingual (ES + EN) summaries, action checklists, and timelines.
// ============================================================================

import { createServiceLogger } from '../config/logger.js';
import type { ExecutiveSummary, SummaryGenerationParams } from './onboarding.js';

const logger = createServiceLogger('service:summary-generator');

export interface SummaryGeneratorConfig {
  readonly azureOpenAIEndpoint: string;
  readonly azureOpenAIApiKey: string;
  readonly azureOpenAIApiVersion: string;
  readonly gptDeployment: string;
}

const SUMMARY_SYSTEM_PROMPT = `Eres un analista senior de compliance regulatorio de Grant Thornton.
Tu tarea es generar un resumen ejecutivo bilingüe (español e inglés) para un nuevo cliente.

Reglas:
- Sé conciso y profesional. Máximo 3 párrafos por idioma.
- Destaca los riesgos críticos primero.
- Incluye plazos específicos cuando estén disponibles.
- Nunca inventes regulaciones o fechas que no estén en el contexto.
- Si no tienes suficiente información, indica qué datos adicionales se necesitan.

Formato de respuesta OBLIGATORIO:
RESUMEN_ES:
<resumen ejecutivo en español>

RESUMEN_EN:
<executive summary in English>` as const;

export class SummaryGenerator {
  private readonly config: SummaryGeneratorConfig;

  constructor(config: SummaryGeneratorConfig) {
    this.config = config;
  }

  async generate(params: SummaryGenerationParams): Promise<ExecutiveSummary> {
    const startTime = Date.now();

    const userMessage = buildUserMessage(params);

    const url =
      `${this.config.azureOpenAIEndpoint}/openai/deployments/${this.config.gptDeployment}` +
      `/chat/completions?api-version=${this.config.azureOpenAIApiVersion}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': this.config.azureOpenAIApiKey,
      },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: SUMMARY_SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
        max_tokens: 1500,
        temperature: 0.3,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'unknown');
      throw new Error(`Azure OpenAI summary generation failed: HTTP ${response.status} — ${errorBody}`);
    }

    const body = (await response.json()) as AzureCompletionResponse;
    const rawContent = body.choices[0]?.message?.content ?? '';

    const summary = parseExecutiveSummary(rawContent);

    logger.info({
      operation: 'summary_generator:generate',
      clientName: params.clientName,
      totalObligations: params.totalObligations,
      criticalCount: params.criticalCount,
      tokensUsed: body.usage?.total_tokens ?? 0,
      duration: Date.now() - startTime,
      result: 'success',
    });

    return summary;
  }
}

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

function buildUserMessage(params: SummaryGenerationParams): string {
  const sections = [
    `Cliente: ${params.clientName}`,
    `Tipo de empresa: ${params.companyType}`,
    `Países: ${params.countries.join(', ')}`,
    `Industrias: ${params.industries.join(', ')}`,
    `Total obligaciones: ${params.totalObligations}`,
    `Obligaciones críticas (<30 días): ${params.criticalCount}`,
    '',
    'Principales obligaciones:',
    ...params.topObligations.map((o) => `- ${o}`),
    '',
    'Deadlines próximos críticos:',
    ...(params.upcomingDeadlines.length > 0
      ? params.upcomingDeadlines.map((d) => `- ${d}`)
      : ['- No hay deadlines críticos inmediatos']),
    '',
    'Cambios regulatorios recientes relevantes:',
    ...(params.recentChanges.length > 0
      ? params.recentChanges.map((c) => `- ${c}`)
      : ['- No hay cambios recientes significativos']),
  ];

  return sections.join('\n');
}

// ---------------------------------------------------------------------------
// Response parser
// ---------------------------------------------------------------------------

function parseExecutiveSummary(raw: string): ExecutiveSummary {
  const esMatch = /RESUMEN_ES:\s*([\s\S]*?)(?=RESUMEN_EN:|$)/i.exec(raw);
  const enMatch = /RESUMEN_EN:\s*([\s\S]*?)$/i.exec(raw);

  const es = esMatch?.[1]?.trim() ?? '';
  const en = enMatch?.[1]?.trim() ?? '';

  // Fallback: if parsing fails, use the full response for both
  if (!es && !en) {
    return { es: raw.trim(), en: raw.trim() };
  }

  return { es: es || en, en: en || es };
}

// ---------------------------------------------------------------------------
// Azure OpenAI response type
// ---------------------------------------------------------------------------

interface AzureCompletionResponse {
  readonly choices: readonly {
    readonly message?: {
      readonly content: string;
    };
  }[];
  readonly usage?: {
    readonly total_tokens: number;
  };
}
