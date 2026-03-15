// ============================================================================
// FILE: packages/ai-core/src/rag/types.ts
// Types for the RAG query engine.
// ============================================================================

import type { AIAnalysis, AISource, Obligation } from '@regwatch/shared';
import type { SearchFilters } from '../search/types.js';

/** Input to the RAG query engine. */
export interface RAGQueryInput {
  readonly tenantId: string;
  readonly clientId: string;
  readonly question: string;
  readonly conversationId: string | null;
  readonly filters: SearchFilters;
}

/** Full RAG response returned to the caller. */
export interface RAGResponse {
  readonly conversationId: string;
  readonly analysis: AIAnalysis;
  readonly relatedObligations: readonly Obligation[];
  readonly cached: boolean;
}

/** Parsed LLM output from the structured response format. */
export interface ParsedLLMResponse {
  readonly answer: string;
  readonly sources: readonly string[];
  readonly confidence: number;
  readonly reasoning: string;
  readonly impactedObligations: readonly string[];
}

/** Context document passed to the LLM prompt. */
export interface RetrievedDocument {
  readonly id: string;
  readonly title: string;
  readonly content: string;
  readonly summary: string;
  readonly sourceUrl: string;
  readonly score: number;
  readonly country: string;
  readonly impactLevel: string;
}

/** Configuration for the RAG engine. */
export interface RAGEngineConfig {
  readonly azureOpenAIEndpoint: string;
  readonly azureOpenAIApiKey: string;
  readonly azureOpenAIApiVersion: string;
  readonly gptDeployment: string;
  readonly embeddingDeployment: string;
  readonly searchEndpoint: string;
  readonly searchApiKey: string;
  readonly searchIndexName: string;
  readonly maxTokens: number;
  readonly temperature: number;
  readonly topK: number;
  readonly vectorWeight: number;
  readonly keywordWeight: number;
  readonly cacheTTLSeconds: number;
}

export const DEFAULT_RAG_CONFIG: Omit<
  RAGEngineConfig,
  'azureOpenAIEndpoint' | 'azureOpenAIApiKey' | 'azureOpenAIApiVersion' | 'gptDeployment' | 'embeddingDeployment' | 'searchEndpoint' | 'searchApiKey' | 'searchIndexName'
> = {
  maxTokens: 1500,
  temperature: 0.2,
  topK: 5,
  vectorWeight: 0.7,
  keywordWeight: 0.3,
  cacheTTLSeconds: 3600, // 1 hour
};
