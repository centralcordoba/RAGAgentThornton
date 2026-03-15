// ============================================================================
// FILE: apps/api/tests/mocks/azureOpenAI.ts
// Mock for Azure OpenAI API calls (embeddings + chat completions).
// ============================================================================

import { vi } from 'vitest';

/** Mock embedding response — returns a deterministic vector based on input hash. */
export function createMockEmbeddingFn(): (text: string) => Promise<readonly number[]> {
  return vi.fn(async (text: string): Promise<readonly number[]> => {
    // Generate a deterministic 3072-dim vector from text hash
    const hash = simpleHash(text);
    const vector: number[] = [];
    for (let i = 0; i < 3072; i++) {
      vector.push(Math.sin(hash + i) * 0.1);
    }
    return vector;
  });
}

/** Mock chat completion that returns a structured RAG response. */
export function createMockChatCompletionFn(): (params: {
  systemPrompt: string;
  userMessage: string;
  maxTokens: number;
  temperature: number;
}) => Promise<string> {
  return vi.fn(async (params): Promise<string> => {
    const isAnalysis = params.systemPrompt.includes('analizar el impacto');

    if (isAnalysis) {
      return `Answer: Este cambio regulatorio requiere que las empresas actualicen sus procedimientos de reporte. [doc-1]
Sources: [doc-1]
Confidence: 0.82
Reasoning: El cambio modifica los plazos de presentación existentes y agrega nuevos requisitos de divulgación.
New obligations: Reporte trimestral actualizado, Divulgación de riesgos ESG
Deadlines: 2026-06-30 (primer reporte), 2026-12-31 (implementación completa)
Operational impact: Requiere actualización de sistemas de reporte y capacitación del equipo de compliance.
Risk level: MEDIUM - Cambio significativo pero con plazo razonable de implementación.
Impacted obligations: Reporte financiero anual, Declaración de impuestos corporativos`;
    }

    return `Answer: Según los documentos disponibles, la regulación SEC Rule 10b-5 establece requisitos de divulgación para empresas públicas. [doc-1] Las modificaciones recientes incluyen mayor transparencia en operaciones de derivados. [doc-2]
Sources: [doc-1, doc-2]
Confidence: 0.85
Reasoning: Los documentos doc-1 y doc-2 proporcionan información directa sobre los requisitos de la SEC para divulgación de derivados.
Impacted obligations: Reporte trimestral SEC, Divulgación de derivados Form 8-K`;
  });
}

/** Mock classification function for ingestion pipeline. */
export function createMockClassifyFn(): (
  title: string,
  summary: string,
  areas: readonly string[],
  changeType: string,
) => Promise<{ level: 'HIGH' | 'MEDIUM' | 'LOW'; reasoning: string; factors: readonly string[] }> {
  return vi.fn(async (title, _summary, areas, changeType) => {
    // Deterministic classification based on keywords
    const combined = `${title} ${areas.join(' ')} ${changeType}`.toLowerCase();

    if (combined.includes('multa') || combined.includes('fine') || combined.includes('penalty') || changeType === 'NEW') {
      return {
        level: 'HIGH' as const,
        reasoning: 'New mandatory requirements or penalties detected',
        factors: ['new_requirement', 'penalty_change'],
      };
    }

    if (combined.includes('procedimiento') || combined.includes('procedure') || combined.includes('modification')) {
      return {
        level: 'MEDIUM' as const,
        reasoning: 'Modification of existing procedures',
        factors: ['procedure_change'],
      };
    }

    return {
      level: 'LOW' as const,
      reasoning: 'Minor clarification or typographical correction',
      factors: ['minor_change'],
    };
  });
}

/** Mock idempotency check — always returns false (not seen before). */
export function createMockIdempotencyCheckFn(existingKeys?: Set<string>): (
  source: string,
  documentId: string,
  version: string,
) => Promise<boolean> {
  const seen = existingKeys ?? new Set<string>();
  return vi.fn(async (source, documentId, version) => {
    const key = `${source}:${documentId}:${version}`;
    return seen.has(key);
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash;
}
