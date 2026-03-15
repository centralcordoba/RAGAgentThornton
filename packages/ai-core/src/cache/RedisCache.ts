// ============================================================================
// FILE: packages/ai-core/src/cache/RedisCache.ts
// Redis caching layer for RAG results, embeddings, and regulations.
//
// Key namespaces:
//   emb:{sha256(text)}     — embedding vectors     (TTL: 24h)
//   rag:{sha256(q+filters)} — RAG query results     (TTL: 1h)
//   reg:{id}               — regulatory changes     (TTL: 6h)
// ============================================================================

import { createHash } from 'node:crypto';
import Redis from 'ioredis';
import pino from 'pino';
import type { RegulatoryChange } from '@regwatch/shared';
import type { RAGResponse } from '../rag/types.js';

const logger = pino({ level: process.env['LOG_LEVEL'] ?? 'info' }).child({
  service: 'ai-core:redis-cache',
});

// ---------------------------------------------------------------------------
// TTL constants (seconds)
// ---------------------------------------------------------------------------

const TTL_EMBEDDING = 86_400;    // 24 hours
const TTL_RAG_RESULT = 3_600;    // 1 hour
const TTL_REGULATION = 21_600;   // 6 hours

// ---------------------------------------------------------------------------
// Key prefixes
// ---------------------------------------------------------------------------

const PREFIX_EMBEDDING = 'emb:';
const PREFIX_RAG = 'rag:';
const PREFIX_REGULATION = 'reg:';

// ---------------------------------------------------------------------------
// RedisCache
// ---------------------------------------------------------------------------

export class RedisCache {
  private readonly redis: Redis;
  private readonly keyPrefix: string;

  constructor(redisUrl: string, keyPrefix = '') {
    this.redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy(times: number): number | null {
        if (times > 5) return null; // Stop retrying after 5 attempts
        return Math.min(times * 200, 2000);
      },
      lazyConnect: true,
    });
    this.keyPrefix = keyPrefix;

    this.redis.on('error', (err) => {
      logger.error({
        operation: 'redis:connection_error',
        error: err.message,
        result: 'error',
      });
    });

    this.redis.on('connect', () => {
      logger.info({
        operation: 'redis:connected',
        result: 'success',
      });
    });
  }

  // -------------------------------------------------------------------------
  // Connection
  // -------------------------------------------------------------------------

  async connect(): Promise<void> {
    if (this.redis.status === 'ready') return;
    await this.redis.connect();
  }

  async disconnect(): Promise<void> {
    await this.redis.quit();
  }

  async ping(): Promise<boolean> {
    try {
      const result = await this.redis.ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // Embedding cache — TTL: 24h
  // -------------------------------------------------------------------------

  /**
   * Get cached embedding for a text.
   * Key: emb:{sha256(text)}
   */
  async getEmbedding(text: string): Promise<readonly number[] | null> {
    const key = this.buildKey(PREFIX_EMBEDDING, hashText(text));
    const startTime = Date.now();

    try {
      const raw = await this.redis.getBuffer(key);
      if (!raw) {
        logger.debug({
          operation: 'redis:get_embedding',
          cacheHit: false,
          duration: Date.now() - startTime,
          result: 'miss',
        });
        return null;
      }

      const embedding = deserializeVector(raw);

      logger.debug({
        operation: 'redis:get_embedding',
        cacheHit: true,
        dimensions: embedding.length,
        duration: Date.now() - startTime,
        result: 'hit',
      });

      return embedding;
    } catch (err) {
      logger.warn({
        operation: 'redis:get_embedding',
        duration: Date.now() - startTime,
        result: 'error',
        error: err instanceof Error ? err.message : String(err),
      });
      return null; // Cache miss on error — proceed without cache
    }
  }

  /**
   * Cache an embedding for a text.
   * Stored as binary Float64Array buffer for space efficiency.
   */
  async setEmbedding(text: string, embedding: readonly number[]): Promise<void> {
    const key = this.buildKey(PREFIX_EMBEDDING, hashText(text));
    const startTime = Date.now();

    try {
      const buffer = serializeVector(embedding);
      await this.redis.set(key, buffer, 'EX', TTL_EMBEDDING);

      logger.debug({
        operation: 'redis:set_embedding',
        dimensions: embedding.length,
        bytesStored: buffer.length,
        ttlSeconds: TTL_EMBEDDING,
        duration: Date.now() - startTime,
        result: 'success',
      });
    } catch (err) {
      logger.warn({
        operation: 'redis:set_embedding',
        duration: Date.now() - startTime,
        result: 'error',
        error: err instanceof Error ? err.message : String(err),
      });
      // Swallow error — caching is best-effort
    }
  }

  // -------------------------------------------------------------------------
  // RAG result cache — TTL: 1h
  // -------------------------------------------------------------------------

  /**
   * Get cached RAG result by query hash.
   * Key: rag:{queryHash}
   */
  async getRAGResult(queryHash: string): Promise<RAGResponse | null> {
    const key = this.buildKey(PREFIX_RAG, queryHash);
    const startTime = Date.now();

    try {
      const raw = await this.redis.get(key);
      if (!raw) {
        logger.debug({
          operation: 'redis:get_rag',
          cacheHit: false,
          duration: Date.now() - startTime,
          result: 'miss',
        });
        return null;
      }

      const parsed = JSON.parse(raw) as RAGResponse;

      logger.debug({
        operation: 'redis:get_rag',
        cacheHit: true,
        duration: Date.now() - startTime,
        result: 'hit',
      });

      return parsed;
    } catch (err) {
      logger.warn({
        operation: 'redis:get_rag',
        duration: Date.now() - startTime,
        result: 'error',
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  /**
   * Cache a RAG result.
   * TTL defaults to 1h, configurable via parameter.
   */
  async setRAGResult(
    queryHash: string,
    result: RAGResponse,
    ttlSeconds: number = TTL_RAG_RESULT,
  ): Promise<void> {
    const key = this.buildKey(PREFIX_RAG, queryHash);
    const startTime = Date.now();

    try {
      const serialized = JSON.stringify(result);
      await this.redis.set(key, serialized, 'EX', ttlSeconds);

      logger.debug({
        operation: 'redis:set_rag',
        bytesStored: serialized.length,
        ttlSeconds,
        duration: Date.now() - startTime,
        result: 'success',
      });
    } catch (err) {
      logger.warn({
        operation: 'redis:set_rag',
        duration: Date.now() - startTime,
        result: 'error',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // -------------------------------------------------------------------------
  // Regulation cache — TTL: 6h
  // -------------------------------------------------------------------------

  /**
   * Get cached regulatory change by ID.
   * Key: reg:{id}
   */
  async getRegulation(id: string): Promise<RegulatoryChange | null> {
    const key = this.buildKey(PREFIX_REGULATION, id);
    const startTime = Date.now();

    try {
      const raw = await this.redis.get(key);
      if (!raw) {
        logger.debug({
          operation: 'redis:get_regulation',
          regulationId: id,
          cacheHit: false,
          duration: Date.now() - startTime,
          result: 'miss',
        });
        return null;
      }

      const parsed = JSON.parse(raw) as RegulatoryChange;

      logger.debug({
        operation: 'redis:get_regulation',
        regulationId: id,
        cacheHit: true,
        duration: Date.now() - startTime,
        result: 'hit',
      });

      return reviveDates(parsed);
    } catch (err) {
      logger.warn({
        operation: 'redis:get_regulation',
        regulationId: id,
        duration: Date.now() - startTime,
        result: 'error',
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  /**
   * Cache a regulatory change.
   * For frequently accessed regulations.
   */
  async setRegulation(id: string, regulation: RegulatoryChange): Promise<void> {
    const key = this.buildKey(PREFIX_REGULATION, id);
    const startTime = Date.now();

    try {
      const serialized = JSON.stringify(regulation);
      await this.redis.set(key, serialized, 'EX', TTL_REGULATION);

      logger.debug({
        operation: 'redis:set_regulation',
        regulationId: id,
        bytesStored: serialized.length,
        ttlSeconds: TTL_REGULATION,
        duration: Date.now() - startTime,
        result: 'success',
      });
    } catch (err) {
      logger.warn({
        operation: 'redis:set_regulation',
        regulationId: id,
        duration: Date.now() - startTime,
        result: 'error',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // -------------------------------------------------------------------------
  // Cache invalidation
  // -------------------------------------------------------------------------

  /** Invalidate a specific key. */
  async invalidate(fullKey: string): Promise<void> {
    await this.redis.del(fullKey);
  }

  /** Invalidate all RAG cache entries (e.g., after re-indexing). */
  async invalidateRAGCache(): Promise<number> {
    return this.invalidateByPrefix(PREFIX_RAG);
  }

  /** Invalidate all embedding cache entries. */
  async invalidateEmbeddingCache(): Promise<number> {
    return this.invalidateByPrefix(PREFIX_EMBEDDING);
  }

  /** Invalidate all keys matching a prefix using SCAN (non-blocking). */
  private async invalidateByPrefix(prefix: string): Promise<number> {
    const fullPrefix = `${this.keyPrefix}${prefix}*`;
    let deleted = 0;
    let cursor = '0';

    do {
      const [nextCursor, keys] = await this.redis.scan(
        cursor,
        'MATCH',
        fullPrefix,
        'COUNT',
        100,
      );
      cursor = nextCursor;

      if (keys.length > 0) {
        await this.redis.del(...keys);
        deleted += keys.length;
      }
    } while (cursor !== '0');

    logger.info({
      operation: 'redis:invalidate_prefix',
      prefix: fullPrefix,
      keysDeleted: deleted,
      result: 'success',
    });

    return deleted;
  }

  // -------------------------------------------------------------------------
  // Stats
  // -------------------------------------------------------------------------

  /** Get cache statistics for monitoring. */
  async getStats(): Promise<CacheStats> {
    const info = await this.redis.info('memory');
    const keyspace = await this.redis.info('keyspace');

    const usedMemory = extractInfoValue(info, 'used_memory');
    const maxMemory = extractInfoValue(info, 'maxmemory');

    return {
      usedMemoryBytes: parseInt(usedMemory ?? '0', 10),
      maxMemoryBytes: parseInt(maxMemory ?? '0', 10),
      keyspaceInfo: keyspace,
    };
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  private buildKey(prefix: string, suffix: string): string {
    return `${this.keyPrefix}${prefix}${suffix}`;
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CacheStats {
  readonly usedMemoryBytes: number;
  readonly maxMemoryBytes: number;
  readonly keyspaceInfo: string;
}

// ---------------------------------------------------------------------------
// Serialization helpers
// ---------------------------------------------------------------------------

/** SHA-256 hash of text for cache keys. */
function hashText(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/**
 * Serialize a number array to a compact binary buffer.
 * Uses Float64Array for full precision (8 bytes per number).
 */
function serializeVector(vector: readonly number[]): Buffer {
  const float64 = new Float64Array(vector);
  return Buffer.from(float64.buffer);
}

/**
 * Deserialize a binary buffer back to a number array.
 */
function deserializeVector(buffer: Buffer): readonly number[] {
  const float64 = new Float64Array(
    buffer.buffer,
    buffer.byteOffset,
    buffer.length / Float64Array.BYTES_PER_ELEMENT,
  );
  return Array.from(float64);
}

/**
 * Revive Date strings back to Date objects in a parsed RegulatoryChange.
 */
function reviveDates(obj: RegulatoryChange): RegulatoryChange {
  return {
    ...obj,
    effectiveDate: new Date(obj.effectiveDate),
    publishedDate: new Date(obj.publishedDate),
    createdAt: new Date(obj.createdAt),
    updatedAt: new Date(obj.updatedAt),
  };
}

/** Extract a value from Redis INFO output. */
function extractInfoValue(info: string, key: string): string | null {
  const regex = new RegExp(`^${key}:(.+)$`, 'm');
  const match = regex.exec(info);
  return match?.[1]?.trim() ?? null;
}
