// ============================================================================
// FILE: apps/api/src/jobs/ingestion/types.ts
// Types specific to the ingestion pipeline.
// ============================================================================

import type { ImpactLevel } from '@regwatch/shared';

/** Raw document fetched from a regulatory source before parsing. */
export interface RawDocument {
  readonly externalId: string;
  readonly title: string;
  readonly rawContent: string;
  readonly sourceUrl: string;
  readonly publishedDate: Date;
  readonly metadata: Readonly<Record<string, string>>;
}

/** Parsed regulation ready for classification and indexing. */
export interface ParsedRegulation {
  readonly externalDocumentId: string;
  readonly title: string;
  readonly summary: string;
  readonly rawContent: string;
  readonly effectiveDate: Date;
  readonly publishedDate: Date;
  readonly country: string;
  readonly jurisdiction: string;
  readonly affectedAreas: readonly string[];
  readonly affectedIndustries: readonly string[];
  readonly sourceUrl: string;
  readonly language: string;
  readonly version: string;
}

/** Result of comparing current vs previous version of a document. */
export interface ChangeDetectionResult {
  readonly hasChanged: boolean;
  readonly cosineSimilarity: number;
  readonly changeType: 'NEW' | 'SEMANTIC_CHANGE' | 'NO_CHANGE';
  readonly previousVersion: string | null;
  readonly currentVersion: string;
}

/** Impact classification input for the LLM classifier. */
export interface ImpactClassificationInput {
  readonly title: string;
  readonly summary: string;
  readonly affectedAreas: readonly string[];
  readonly changeType: ChangeDetectionResult['changeType'];
}

/** Impact classification result from the LLM. */
export interface ImpactClassificationResult {
  readonly level: ImpactLevel;
  readonly reasoning: string;
  readonly factors: readonly string[];
}

/** Configuration for a specific ingestion source. */
export interface IngestionSourceConfig {
  readonly sourceName: string;
  readonly country: string;
  readonly jurisdiction: string;
  readonly baseUrl: string;
  readonly checkIntervalMinutes: number;
  readonly maxRequestsPerSecond: number;
}
