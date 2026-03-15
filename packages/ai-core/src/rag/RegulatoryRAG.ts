// ============================================================================
// FILE: packages/ai-core/src/rag/RegulatoryRAG.ts
// Core RAG engine for regulatory compliance queries.
//
// Pipeline:
//   1. Check Redis cache (key: hash(question + filters), TTL: 1h)
//   2. Hybrid search: vectorWeight=0.7, keywordWeight=0.3, top_k=5
//   3. Azure OpenAI: max_tokens=1500, temperature=0.2
//   4. If confidence < 0.5 → return "insufficient data"
//   5. Cache result in Redis
// ============================================================================

import { createHash, randomUUID } from 'node:crypto';
import {
  SearchClient,
  AzureKeyCredential,
  type SearchOptions,
} from '@azure/search-documents';
import pino from 'pino';
import type { AIAnalysis, AISource, Client, Obligation, RegulatoryChange } from '@regwatch/shared';
import type { SearchDocument, SearchFilters } from '../search/types.js';
import type {
  RAGQueryInput,
  RAGResponse,
  RAGEngineConfig,
  RetrievedDocument,
} from './types.js';
import { DEFAULT_RAG_CONFIG } from './types.js';
import {
  RAG_SYSTEM_PROMPT,
  ANALYSIS_SYSTEM_PROMPT,
  buildContextPrompt,
  buildAnalysisPrompt,
} from './systemPrompt.js';
import { parseLLMResponse, parseAnalysisResponse } from './responseParser.js';

const logger = pino({ level: process.env['LOG_LEVEL'] ?? 'info' }).child({
  service: 'ai-core:rag',
});

/** Confidence threshold — below this we return "insufficient data". */
const CONFIDENCE_THRESHOLD = 0.5;

// ---------------------------------------------------------------------------
// Dependencies injected at construction
// ---------------------------------------------------------------------------

export interface RAGDependencies {
  /** Generate embedding for a query string. */
  readonly generateEmbedding: (text: string) => Promise<readonly number[]>;
  /** Get cached RAG result by query hash. */
  readonly cacheGet: (key: string) => Promise<RAGResponse | null>;
  /** Set cached RAG result. */
  readonly cacheSet: (key: string, value: RAGResponse, ttlSeconds: number) => Promise<void>;
  /** Fetch related obligations for the client. */
  readonly getClientObligations: (clientId: string, tenantId: string) => Promise<readonly Obligation[]>;
  /** Azure OpenAI chat completion. */
  readonly chatCompletion: (params: ChatCompletionParams) => Promise<string>;
}

export interface ChatCompletionParams {
  readonly systemPrompt: string;
  readonly userMessage: string;
  readonly maxTokens: number;
  readonly temperature: number;
}

// ---------------------------------------------------------------------------
// RegulatoryRAG
// ---------------------------------------------------------------------------

export class RegulatoryRAG {
  private readonly config: RAGEngineConfig;
  private readonly searchClient: SearchClient<SearchDocument>;
  private readonly deps: RAGDependencies;

  constructor(config: RAGEngineConfig, deps: RAGDependencies) {
    this.config = { ...DEFAULT_RAG_CONFIG, ...config };
    this.searchClient = new SearchClient<SearchDocument>(
      config.searchEndpoint,
      config.searchIndexName,
      new AzureKeyCredential(config.searchApiKey),
    );
    this.deps = deps;
  }

  // -------------------------------------------------------------------------
  // Main query
  // -------------------------------------------------------------------------

  /**
   * Execute a RAG query for a regulatory compliance question.
   *
   * 1. Check Redis cache
   * 2. Hybrid search (vector 0.7 + BM25 0.3)
   * 3. Azure OpenAI completion
   * 4. Confidence gate (< 0.5 → "insufficient data")
   * 5. Cache result
   */
  async query(input: RAGQueryInput): Promise<RAGResponse> {
    const requestId = randomUUID();
    const startTime = Date.now();

    // --- Step 1: Check Redis cache ---
    const cacheKey = this.buildCacheKey(input.question, input.filters);

    const cached = await this.deps.cacheGet(cacheKey);
    if (cached) {
      logger.info({
        operation: 'rag:query',
        requestId,
        tenantId: input.tenantId,
        clientId: input.clientId,
        cacheHit: true,
        duration: Date.now() - startTime,
        result: 'cache_hit',
      });
      return { ...cached, cached: true };
    }

    // --- Step 2: Hybrid search ---
    const retrievedDocs = await this.hybridSearch(input, requestId);

    // --- Step 3: Azure OpenAI completion ---
    const contextPrompt = buildContextPrompt(
      input.question,
      retrievedDocs.map((doc) => ({
        id: doc.id,
        title: doc.title,
        content: doc.content,
        sourceUrl: doc.sourceUrl,
        score: doc.score,
        country: doc.country,
        impactLevel: doc.impactLevel,
      })),
    );

    const llmStartTime = Date.now();
    const rawLLMResponse = await this.deps.chatCompletion({
      systemPrompt: RAG_SYSTEM_PROMPT,
      userMessage: contextPrompt,
      maxTokens: this.config.maxTokens,
      temperature: this.config.temperature,
    });

    logger.info({
      operation: 'rag:llm_completion',
      requestId,
      tenantId: input.tenantId,
      responseLength: rawLLMResponse.length,
      duration: Date.now() - llmStartTime,
      result: 'success',
    });

    // --- Parse LLM response ---
    const parsed = parseLLMResponse(rawLLMResponse);

    // --- Step 4: Confidence gate ---
    const analysis = this.buildAnalysis(parsed, retrievedDocs);

    // --- Fetch related obligations ---
    const relatedObligations = await this.deps.getClientObligations(
      input.clientId,
      input.tenantId,
    );

    const conversationId = input.conversationId ?? randomUUID();

    const response: RAGResponse = {
      conversationId,
      analysis,
      relatedObligations,
      cached: false,
    };

    // --- Step 5: Cache result ---
    await this.deps.cacheSet(cacheKey, response, this.config.cacheTTLSeconds);

    logger.info({
      operation: 'rag:query',
      requestId,
      tenantId: input.tenantId,
      clientId: input.clientId,
      confidence: analysis.confidence,
      sourcesCount: analysis.sources.length,
      isInsufficientData: analysis.answer === 'insufficient data',
      cacheHit: false,
      duration: Date.now() - startTime,
      result: 'success',
    });

    return response;
  }

  // -------------------------------------------------------------------------
  // Per-client analysis
  // -------------------------------------------------------------------------

  /**
   * Generate a personalized analysis of a regulatory change for a specific client.
   * Identifies new obligations, deadlines, operational impact, and risk.
   */
  async generateAnalysis(
    change: RegulatoryChange,
    client: Client,
    existingObligations: readonly string[],
  ): Promise<AIAnalysis> {
    const requestId = randomUUID();
    const startTime = Date.now();

    const userMessage = buildAnalysisPrompt(
      {
        title: change.title,
        country: change.country,
        jurisdiction: change.jurisdiction,
        impactLevel: change.impactLevel,
        effectiveDate: change.effectiveDate.toISOString(),
        summary: change.summary,
        content: change.rawContent.slice(0, 16_000),
      },
      {
        name: client.name,
        countries: client.countries,
        companyType: client.companyType,
        industries: client.industries,
      },
      existingObligations,
    );

    const rawResponse = await this.deps.chatCompletion({
      systemPrompt: ANALYSIS_SYSTEM_PROMPT,
      userMessage,
      maxTokens: this.config.maxTokens,
      temperature: this.config.temperature,
    });

    const parsed = parseAnalysisResponse(rawResponse);

    const analysis: AIAnalysis = {
      answer: parsed.confidence < CONFIDENCE_THRESHOLD ? 'insufficient data' : parsed.answer,
      sources: parsed.sources.map((sourceId) => ({
        documentId: sourceId,
        title: change.title,
        relevanceScore: 1.0,
        snippet: change.summary.slice(0, 200),
        sourceUrl: change.sourceUrl,
      })),
      confidence: parsed.confidence,
      reasoning: parsed.reasoning,
      impactedObligations: parsed.impactedObligations,
    };

    logger.info({
      operation: 'rag:generate_analysis',
      requestId,
      tenantId: client.tenantId,
      clientId: client.id,
      changeId: change.id,
      confidence: analysis.confidence,
      riskLevel: parsed.riskLevel,
      newObligationsCount: parsed.newObligations.length,
      isInsufficientData: analysis.answer === 'insufficient data',
      duration: Date.now() - startTime,
      result: 'success',
    });

    return analysis;
  }

  // -------------------------------------------------------------------------
  // Hybrid search
  // -------------------------------------------------------------------------

  /**
   * Execute hybrid search: vector (0.7) + BM25 keyword (0.3).
   * Applies mandatory tenantId filter + optional user filters.
   */
  private async hybridSearch(
    input: RAGQueryInput,
    requestId: string,
  ): Promise<readonly RetrievedDocument[]> {
    const startTime = Date.now();

    // Generate query embedding
    const queryEmbedding = await this.deps.generateEmbedding(input.question);

    // Build OData filter with mandatory tenantId
    const filterParts: string[] = [`tenantId eq '${escapeOData(input.filters.tenantId)}'`];

    if (input.filters.country) {
      filterParts.push(`country eq '${escapeOData(input.filters.country)}'`);
    }
    if (input.filters.jurisdiction) {
      filterParts.push(`jurisdiction eq '${escapeOData(input.filters.jurisdiction)}'`);
    }
    if (input.filters.area) {
      filterParts.push(`area eq '${escapeOData(input.filters.area)}'`);
    }
    if (input.filters.impactLevel) {
      filterParts.push(`impactLevel eq '${escapeOData(input.filters.impactLevel)}'`);
    }
    if (input.filters.dateFrom) {
      filterParts.push(`publishedDate ge ${input.filters.dateFrom}T00:00:00Z`);
    }
    if (input.filters.dateTo) {
      filterParts.push(`publishedDate le ${input.filters.dateTo}T23:59:59Z`);
    }

    const searchOptions: SearchOptions<SearchDocument> = {
      filter: filterParts.join(' and '),
      top: this.config.topK,
      select: [
        'id', 'title', 'content', 'summary', 'sourceUrl',
        'country', 'impactLevel', 'effectiveDate', 'publishedDate',
      ],
      vectorSearchOptions: {
        queries: [
          {
            kind: 'vector',
            vector: queryEmbedding as number[],
            fields: ['contentVector'],
            kNearestNeighborsCount: this.config.topK,
            weight: this.config.vectorWeight,
          },
        ],
      },
      queryType: 'semantic',
      semanticSearchOptions: {
        configurationName: 'default-semantic-config',
      },
    };

    const results: RetrievedDocument[] = [];
    const searchResults = await this.searchClient.search(input.question, searchOptions);

    for await (const result of searchResults.results) {
      const doc = result.document;
      results.push({
        id: doc.id,
        title: doc.title,
        content: doc.content,
        summary: doc.summary,
        sourceUrl: doc.sourceUrl,
        score: result.score ?? 0,
        country: doc.country,
        impactLevel: doc.impactLevel,
      });
    }

    logger.info({
      operation: 'rag:hybrid_search',
      requestId,
      tenantId: input.filters.tenantId,
      query: input.question.slice(0, 100),
      resultsCount: results.length,
      topK: this.config.topK,
      vectorWeight: this.config.vectorWeight,
      keywordWeight: this.config.keywordWeight,
      filter: filterParts.join(' and '),
      duration: Date.now() - startTime,
      result: 'success',
    });

    return results;
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  /**
   * Build the AIAnalysis from parsed LLM response + retrieved docs.
   * Applies confidence threshold: < 0.5 → "insufficient data".
   */
  private buildAnalysis(
    parsed: ReturnType<typeof parseLLMResponse>,
    retrievedDocs: readonly RetrievedDocument[],
  ): AIAnalysis {
    // Map source references to AISource objects
    const sources: AISource[] = parsed.sources.map((sourceId) => {
      const matchingDoc = retrievedDocs.find((d) => d.id === sourceId);
      return {
        documentId: sourceId,
        title: matchingDoc?.title ?? sourceId,
        relevanceScore: matchingDoc?.score ?? 0,
        snippet: matchingDoc?.summary ?? matchingDoc?.content?.slice(0, 200) ?? '',
        sourceUrl: matchingDoc?.sourceUrl ?? '',
      };
    });

    // Confidence gate: < 0.5 → "insufficient data"
    if (parsed.confidence < CONFIDENCE_THRESHOLD) {
      return {
        answer: 'insufficient data',
        sources,
        confidence: parsed.confidence,
        reasoning: parsed.reasoning || 'Confidence below threshold (0.5). Cannot provide reliable analysis.',
        impactedObligations: [],
      };
    }

    return {
      answer: parsed.answer,
      sources,
      confidence: parsed.confidence,
      reasoning: parsed.reasoning,
      impactedObligations: parsed.impactedObligations,
    };
  }

  /** Build cache key from question + filters. */
  private buildCacheKey(question: string, filters: SearchFilters): string {
    const normalized = JSON.stringify({
      q: question.trim().toLowerCase(),
      t: filters.tenantId,
      c: filters.country ?? '',
      j: filters.jurisdiction ?? '',
      a: filters.area ?? '',
      i: filters.impactLevel ?? '',
      df: filters.dateFrom ?? '',
      dt: filters.dateTo ?? '',
    });
    const hash = createHash('sha256').update(normalized).digest('hex');
    return `rag:${hash}`;
  }
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/** Escape single quotes in OData filter values. */
function escapeOData(value: string): string {
  return value.replace(/'/g, "''");
}
