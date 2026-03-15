// ============================================================================
// FILE: apps/api/src/jobs/ingestion/connectors/httpClient.ts
// Rate-limited HTTP client with exponential backoff for regulatory sources.
// ============================================================================

import { createServiceLogger } from '../../../config/logger.js';

const logger = createServiceLogger('ingestion:http');

export interface RateLimitConfig {
  readonly maxRequestsPerSecond: number;
  readonly maxRetries: number;
  readonly baseDelayMs: number;
}

const DEFAULT_CONFIG: RateLimitConfig = {
  maxRequestsPerSecond: 5,
  maxRetries: 3,
  baseDelayMs: 1000,
};

/**
 * Rate-limited fetch with exponential backoff.
 * Tracks request timestamps to enforce per-second limits.
 */
export class RateLimitedHttpClient {
  private readonly config: RateLimitConfig;
  private readonly requestTimestamps: number[] = [];
  private readonly sourceName: string;

  constructor(sourceName: string, config: Partial<RateLimitConfig> = {}) {
    this.sourceName = sourceName;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async fetch(url: string, init?: RequestInit): Promise<Response> {
    await this.waitForSlot();

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        this.requestTimestamps.push(Date.now());

        const startTime = Date.now();
        const response = await globalThis.fetch(url, {
          ...init,
          headers: {
            'User-Agent': 'RegWatch-AI/0.1.0 (compliance-monitoring; contact@grantthornton.com)',
            Accept: 'application/json, application/xml, text/xml, text/html',
            ...init?.headers,
          },
          signal: init?.signal ?? AbortSignal.timeout(30_000),
        });

        logger.debug({
          operation: 'http:fetch',
          source: this.sourceName,
          url,
          statusCode: response.status,
          attempt,
          duration: Date.now() - startTime,
          result: response.ok ? 'success' : 'http_error',
        });

        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After');
          const delayMs = retryAfter
            ? parseInt(retryAfter, 10) * 1000
            : this.getBackoffDelay(attempt);

          logger.warn({
            operation: 'http:rate_limited',
            source: this.sourceName,
            url,
            attempt,
            retryAfterMs: delayMs,
            result: 'retry',
          });

          await sleep(delayMs);
          continue;
        }

        if (response.status >= 500 && attempt < this.config.maxRetries) {
          const delayMs = this.getBackoffDelay(attempt);
          logger.warn({
            operation: 'http:server_error',
            source: this.sourceName,
            url,
            statusCode: response.status,
            attempt,
            retryAfterMs: delayMs,
            result: 'retry',
          });
          await sleep(delayMs);
          continue;
        }

        return response;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        if (attempt < this.config.maxRetries) {
          const delayMs = this.getBackoffDelay(attempt);
          logger.warn({
            operation: 'http:fetch_error',
            source: this.sourceName,
            url,
            attempt,
            retryAfterMs: delayMs,
            error: lastError.message,
            result: 'retry',
          });
          await sleep(delayMs);
        }
      }
    }

    throw lastError ?? new Error(`Failed to fetch ${url} after ${this.config.maxRetries} retries`);
  }

  /** Fetch and parse as text. */
  async fetchText(url: string, init?: RequestInit): Promise<string> {
    const response = await this.fetch(url, init);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText} for ${url}`);
    }
    return response.text();
  }

  /** Fetch and parse as JSON. */
  async fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await this.fetch(url, {
      ...init,
      headers: { Accept: 'application/json', ...init?.headers },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText} for ${url}`);
    }
    return response.json() as Promise<T>;
  }

  /** Wait until we have a rate-limit slot available. */
  private async waitForSlot(): Promise<void> {
    const now = Date.now();
    const windowStart = now - 1000;

    // Remove timestamps older than 1 second
    while (this.requestTimestamps.length > 0 && this.requestTimestamps[0]! < windowStart) {
      this.requestTimestamps.shift();
    }

    if (this.requestTimestamps.length >= this.config.maxRequestsPerSecond) {
      const oldestInWindow = this.requestTimestamps[0]!;
      const waitMs = oldestInWindow + 1000 - now + 10; // +10ms buffer
      if (waitMs > 0) {
        logger.debug({
          operation: 'http:rate_limit_wait',
          source: this.sourceName,
          waitMs,
          currentRate: this.requestTimestamps.length,
          maxRate: this.config.maxRequestsPerSecond,
        });
        await sleep(waitMs);
      }
    }
  }

  /** Exponential backoff with jitter. */
  private getBackoffDelay(attempt: number): number {
    const exponentialDelay = this.config.baseDelayMs * Math.pow(2, attempt);
    const jitter = Math.random() * this.config.baseDelayMs;
    return Math.min(exponentialDelay + jitter, 30_000);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
