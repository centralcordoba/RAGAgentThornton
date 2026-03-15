// ============================================================================
// FILE: packages/ai-core/src/rag/systemPrompt.ts
// System prompt for the RAG engine — used VERBATIM in Azure OpenAI calls.
// CRITICAL: Do not modify without compliance review.
// ============================================================================

/**
 * System prompt for regulatory compliance RAG queries.
 * Used verbatim in the Azure OpenAI completion call.
 */
export const RAG_SYSTEM_PROMPT = `Eres un analista de compliance regulatorio especializado.
Reglas:
- Solo responde usando los documentos provistos como contexto.
- Cita fuentes usando [doc_id] inline.
- Si la información no está disponible, responde exactamente: 'insufficient data'.
- Nunca inventes regulaciones, fechas, o montos de multa.
Formato de respuesta requerido:
Answer: <tu respuesta con [doc_id] citations>
Sources: [lista de doc_ids usados]
Confidence: <0.0 a 1.0>
Reasoning: <pasos de razonamiento>
Impacted obligations: <lista de obligaciones afectadas>` as const;

/**
 * System prompt for per-client regulatory impact analysis.
 * Used when generating analysis for a specific client context.
 */
export const ANALYSIS_SYSTEM_PROMPT = `Eres un analista de compliance regulatorio especializado de Grant Thornton.
Tu tarea es analizar el impacto de un cambio regulatorio para un cliente específico.

Reglas:
- Solo basa tu análisis en los documentos provistos y el perfil del cliente.
- Nunca inventes regulaciones, fechas, montos de multa, o requisitos.
- Si no puedes determinar el impacto con certeza, indica exactamente: 'insufficient data'.
- Identifica obligaciones específicas, plazos concretos, y riesgo operativo.

Formato de respuesta requerido:
Answer: <análisis del impacto para este cliente con [doc_id] citations>
Sources: [lista de doc_ids usados]
Confidence: <0.0 a 1.0>
Reasoning: <pasos de razonamiento detallados>
New obligations: <lista de nuevas obligaciones identificadas>
Deadlines: <lista de plazos relevantes con fechas>
Operational impact: <descripción del impacto operativo>
Risk level: <HIGH|MEDIUM|LOW con justificación>
Impacted obligations: <lista de obligaciones existentes afectadas>` as const;

/**
 * Build the user message with retrieved context documents.
 */
export function buildContextPrompt(
  question: string,
  documents: readonly ContextDocument[],
): string {
  const contextBlock = documents
    .map(
      (doc, idx) =>
        `[${doc.id}] (relevance: ${doc.score.toFixed(2)}, country: ${doc.country}, impact: ${doc.impactLevel})\n` +
        `Title: ${doc.title}\n` +
        `Content: ${doc.content}\n` +
        `Source: ${doc.sourceUrl}`,
    )
    .join('\n\n---\n\n');

  return `Documentos de contexto:\n\n${contextBlock}\n\n---\n\nPregunta del usuario: ${question}`;
}

/**
 * Build the user message for per-client analysis.
 */
export function buildAnalysisPrompt(
  change: ChangeForPrompt,
  client: ClientForPrompt,
  existingObligations: readonly string[],
): string {
  return (
    `Cambio regulatorio:\n` +
    `- Título: ${change.title}\n` +
    `- País: ${change.country}\n` +
    `- Jurisdicción: ${change.jurisdiction}\n` +
    `- Nivel de impacto: ${change.impactLevel}\n` +
    `- Fecha efectiva: ${change.effectiveDate}\n` +
    `- Resumen: ${change.summary}\n` +
    `- Contenido: ${change.content}\n\n` +
    `Perfil del cliente:\n` +
    `- Nombre: ${client.name}\n` +
    `- Países: ${client.countries.join(', ')}\n` +
    `- Tipo de empresa: ${client.companyType}\n` +
    `- Industrias: ${client.industries.join(', ')}\n\n` +
    `Obligaciones existentes del cliente:\n${existingObligations.map((o) => `- ${o}`).join('\n') || '- Ninguna registrada'}\n\n` +
    `Analiza el impacto de este cambio regulatorio para este cliente específico.`
  );
}

// ---------------------------------------------------------------------------
// Types used only for prompt building
// ---------------------------------------------------------------------------

export interface ContextDocument {
  readonly id: string;
  readonly title: string;
  readonly content: string;
  readonly sourceUrl: string;
  readonly score: number;
  readonly country: string;
  readonly impactLevel: string;
}

export interface ChangeForPrompt {
  readonly title: string;
  readonly country: string;
  readonly jurisdiction: string;
  readonly impactLevel: string;
  readonly effectiveDate: string;
  readonly summary: string;
  readonly content: string;
}

export interface ClientForPrompt {
  readonly name: string;
  readonly countries: readonly string[];
  readonly companyType: string;
  readonly industries: readonly string[];
}
