// ============================================================================
// FILE: packages/ai-core/src/search/types.ts
// Types for Azure AI Search integration.
// ============================================================================

export interface SearchIndexConfig {
  readonly endpoint: string;
  readonly apiKey: string;
  readonly indexName: string;
}

/** Document shape stored in the Azure AI Search index. */
export interface SearchDocument {
  readonly id: string;
  readonly title: string;
  readonly content: string;
  readonly summary: string;
  readonly country: string;
  readonly jurisdiction: string;
  readonly area: string;
  readonly impactLevel: string;
  readonly effectiveDate: string;
  readonly publishedDate: string;
  readonly sourceUrl: string;
  readonly source: string;
  readonly externalDocumentId: string;
  readonly version: string;
  readonly language: string;
  readonly tenantId: string;
  readonly contentVector: readonly number[];
}

/** Filters for search queries. */
export interface SearchFilters {
  readonly tenantId: string;
  readonly country?: string;
  readonly jurisdiction?: string;
  readonly area?: string;
  readonly impactLevel?: string;
  readonly dateFrom?: string;
  readonly dateTo?: string;
  readonly language?: string;
}

/** Single search result with score and highlights. */
export interface SearchResult {
  readonly document: SearchDocument;
  readonly score: number;
  readonly rerankerScore: number | null;
  readonly highlights: Readonly<Record<string, readonly string[]>>;
}

/** Full search response. */
export interface SearchResponse {
  readonly results: readonly SearchResult[];
  readonly totalCount: number;
  readonly facets: Readonly<Record<string, readonly FacetValue[]>>;
}

export interface FacetValue {
  readonly value: string;
  readonly count: number;
}
