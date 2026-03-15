// ============================================================================
// FILE: apps/api/tests/mocks/aiSearch.ts
// Mock for Azure AI Search operations.
// ============================================================================

import { vi } from 'vitest';
import type { SearchDocument, SearchResult } from '@regwatch/ai-core';

/** Sample search documents for testing. */
export const MOCK_SEARCH_DOCUMENTS: SearchDocument[] = [
  {
    id: 'doc-1',
    title: 'SEC Rule 10b-5 Amendment — Derivatives Disclosure',
    content: 'The Securities and Exchange Commission amends Rule 10b-5 to enhance disclosure requirements for derivatives trading...',
    summary: 'Enhanced disclosure requirements for derivatives trading by public companies.',
    country: 'US',
    jurisdiction: 'US-FED',
    area: 'securities',
    impactLevel: 'HIGH',
    effectiveDate: '2026-06-30T00:00:00Z',
    publishedDate: '2026-03-01T00:00:00Z',
    sourceUrl: 'https://www.sec.gov/rules/final/2026/34-99999.htm',
    source: 'SEC_EDGAR',
    externalDocumentId: 'sec-34-99999',
    version: 'sec-34-99999:2026-03-01',
    language: 'en',
    tenantId: 'tenant-001',
    contentVector: [],
  },
  {
    id: 'doc-2',
    title: 'Modelo 303 — Actualización IVA Trimestral España',
    content: 'La Agencia Tributaria modifica el modelo 303 de autoliquidación trimestral del IVA...',
    summary: 'Modificación del modelo 303 para incluir nuevos campos de información.',
    country: 'ES',
    jurisdiction: 'ES',
    area: 'fiscal',
    impactLevel: 'MEDIUM',
    effectiveDate: '2026-04-20T00:00:00Z',
    publishedDate: '2026-02-15T00:00:00Z',
    sourceUrl: 'https://www.boe.es/diario_boe/txt.php?id=BOE-A-2026-9999',
    source: 'BOE_SPAIN',
    externalDocumentId: 'boe-2026-9999',
    version: 'boe-2026-9999:2026-02-15',
    language: 'es',
    tenantId: 'tenant-001',
    contentVector: [],
  },
  {
    id: 'doc-3',
    title: 'CNBV Circular — Reporte de Operaciones Relevantes',
    content: 'La Comisión Nacional Bancaria y de Valores emite circular modificando el formato de reporte...',
    summary: 'Nuevo formato de reporte trimestral para instituciones financieras.',
    country: 'MX',
    jurisdiction: 'MX-FED',
    area: 'banking',
    impactLevel: 'MEDIUM',
    effectiveDate: '2026-05-01T00:00:00Z',
    publishedDate: '2026-03-10T00:00:00Z',
    sourceUrl: 'https://www.cnbv.gob.mx/circulares/2026-001',
    source: 'DOF_MEXICO',
    externalDocumentId: 'dof-cnbv-2026-001',
    version: 'dof-cnbv-2026-001:2026-03-10',
    language: 'es',
    tenantId: 'tenant-001',
    contentVector: [],
  },
];

/** Create a mock search client that returns predefined results. */
export function createMockSearchFn(): (
  query: string,
  filters: Record<string, unknown>,
  topK: number,
) => Promise<readonly SearchResult[]> {
  return vi.fn(async (query, filters, topK) => {
    let results = MOCK_SEARCH_DOCUMENTS.map((doc, idx) => ({
      document: doc,
      score: 1.0 - idx * 0.15,
      rerankerScore: null,
      highlights: {},
    }));

    // Apply basic filters
    const country = filters['country'] as string | undefined;
    if (country) {
      results = results.filter((r) => r.document.country === country);
    }

    const impactLevel = filters['impactLevel'] as string | undefined;
    if (impactLevel) {
      results = results.filter((r) => r.document.impactLevel === impactLevel);
    }

    return results.slice(0, topK);
  });
}

/** Create a mock document indexer. */
export function createMockDocumentIndexer() {
  return {
    embedAndIndex: vi.fn(async () => undefined),
    bulkIndex: vi.fn(async () => ({
      indexed: 0,
      failed: 0,
      errors: [],
      durationMs: 10,
    })),
    deleteDocument: vi.fn(async () => undefined),
  };
}
