// ============================================================================
// FILE: packages/ai-core/src/cache/EmbeddingService.ts
// Embedding generation with Redis cache.
// Checks cache before calling Azure OpenAI — reduces API costs.
// ============================================================================

import pino from 'pino';
import type { RedisCache } from './RedisCache.js';

const logger = pino({ level: process.env['LOG_LEVEL'] ?? 'info' }).child({
  service: 'ai-core:embedding-service',
});

export interface EmbeddingServiceConfig {
  readonly azureOpenAIEndpoint: string;
  readonly azureOpenAIApiKey: string;
  readonly azureOpenAIApiVersion: string;
  readonly embeddingDeployment: string;
}

export class EmbeddingService {
  private readonly config: EmbeddingServiceConfig;
  private readonly cache: RedisCache;
  private totalRequests = 0;
  private cacheHits = 0;

  constructor(config: EmbeddingServiceConfig, cache: RedisCache) {
    this.config = config;
    this.cache = cache;
  }

  /**
   * Generate embedding for text.
   * 1. Check Redis cache first
   * 2. If miss: call Azure OpenAI, cache the result
   */
  async generateEmbedding(text: string): Promise<readonly number[]> {
    this.totalRequests++;
    const startTime = Date.now();

    // Step 1: Check cache
    const cached = await this.cache.getEmbedding(text);
    if (cached) {
      this.cacheHits++;
      logger.debug({
        operation: 'embedding:generate',
        cacheHit: true,
        dimensions: cached.length,
        duration: Date.now() - startTime,
        result: 'cache_hit',
      });
      return cached;
    }

    // Step 2: Call Azure OpenAI
    const url =
      `${this.config.azureOpenAIEndpoint}/openai/deployments/${this.config.embeddingDeployment}` +
      `/embeddings?api-version=${this.config.azureOpenAIApiVersion}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': this.config.azureOpenAIApiKey,
      },
      body: JSON.stringify({
        input: text.slice(0, 32_000), // Model input limit
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'unknown');
      throw new Error(
        `Azure OpenAI embedding failed: HTTP ${response.status} — ${errorBody}`,
      );
    }

    const body = (await response.json()) as AzureEmbeddingResponse;
    const embedding = body.data[0]?.embedding;

    if (!embedding) {
      throw new Error('Azure OpenAI returned empty embedding');
    }

    // Step 3: Cache the result
    await this.cache.setEmbedding(text, embedding);

    logger.debug({
      operation: 'embedding:generate',
      cacheHit: false,
      dimensions: embedding.length,
      tokensUsed: body.usage?.total_tokens ?? 0,
      duration: Date.now() - startTime,
      result: 'success',
    });

    return embedding;
  }

  /** Get cache hit rate for monitoring. */
  getCacheHitRate(): number {
    if (this.totalRequests === 0) return 0;
    return this.cacheHits / this.totalRequests;
  }

  /** Reset counters. */
  resetCounters(): void {
    this.totalRequests = 0;
    this.cacheHits = 0;
  }
}

// ---------------------------------------------------------------------------
// Azure OpenAI response types
// ---------------------------------------------------------------------------

interface AzureEmbeddingResponse {
  readonly data: readonly AzureEmbeddingData[];
  readonly usage?: {
    readonly prompt_tokens: number;
    readonly total_tokens: number;
  };
}

interface AzureEmbeddingData {
  readonly embedding: readonly number[];
  readonly index: number;
}
