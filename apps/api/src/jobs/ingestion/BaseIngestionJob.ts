// ============================================================================
// FILE: apps/api/src/jobs/ingestion/BaseIngestionJob.ts
// Abstract base class for all regulatory source connectors.
// Handles: fetch → parse → detect changes → classify → publish to Service Bus.
// ============================================================================

import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import { ServiceBusClient, type ServiceBusSender } from '@azure/service-bus';
import { AppError, Errors } from '@regwatch/shared';
import type {
  IngestionJobResult,
  IngestionError,
  IngestionMessage,
  ImpactLevel,
} from '@regwatch/shared';
import { createServiceLogger } from '../../config/logger.js';
import type { Logger } from '../../config/logger.js';
import type {
  RawDocument,
  ParsedRegulation,
  ChangeDetectionResult,
  ImpactClassificationResult,
  IngestionSourceConfig,
} from './types.js';

/**
 * Abstract base class for regulatory ingestion connectors.
 *
 * Subclasses implement:
 * - `fetchDocuments()` — source-specific HTTP/RSS/scraping logic
 * - `parseDocument(raw)` — transform raw content into ParsedRegulation
 *
 * Base class provides:
 * - `detectChanges()` — semantic diff via cosine similarity of embeddings
 * - `classifyImpact()` — LLM-based impact classification
 * - `publishChange()` — enqueue to Azure Service Bus
 * - `run()` — orchestrates the full pipeline with idempotency & error handling
 */
export abstract class BaseIngestionJob {
  protected readonly logger: Logger;
  protected readonly config: IngestionSourceConfig;
  private serviceBusSender: ServiceBusSender | null = null;
  private serviceBusClient: ServiceBusClient | null = null;

  // Injected dependencies — set via `initialize()`
  private embeddingFn: ((text: string) => Promise<readonly number[]>) | null = null;
  private idempotencyCheckFn:
    | ((source: string, documentId: string, version: string) => Promise<boolean>)
    | null = null;
  private classifyFn:
    | ((title: string, summary: string, areas: readonly string[], changeType: string) => Promise<ImpactClassificationResult>)
    | null = null;

  constructor(config: IngestionSourceConfig) {
    this.config = config;
    this.logger = createServiceLogger(`ingestion:${config.sourceName}`);
  }

  // ---------------------------------------------------------------------------
  // Abstract methods — implemented by each connector
  // ---------------------------------------------------------------------------

  /** Fetch raw documents from the regulatory source. */
  protected abstract fetchDocuments(requestId: string): Promise<readonly RawDocument[]>;

  /** Parse a raw document into a structured regulation. */
  protected abstract parseDocument(
    raw: RawDocument,
    requestId: string,
  ): Promise<ParsedRegulation>;

  // ---------------------------------------------------------------------------
  // Dependency injection
  // ---------------------------------------------------------------------------

  initialize(deps: {
    embeddingFn: (text: string) => Promise<readonly number[]>;
    idempotencyCheckFn: (source: string, documentId: string, version: string) => Promise<boolean>;
    classifyFn: (
      title: string,
      summary: string,
      areas: readonly string[],
      changeType: string,
    ) => Promise<ImpactClassificationResult>;
    serviceBusConnectionString: string;
    queueName: string;
  }): void {
    this.embeddingFn = deps.embeddingFn;
    this.idempotencyCheckFn = deps.idempotencyCheckFn;
    this.classifyFn = deps.classifyFn;

    if (deps.serviceBusConnectionString) {
      this.serviceBusClient = new ServiceBusClient(deps.serviceBusConnectionString);
      this.serviceBusSender = this.serviceBusClient.createSender(deps.queueName);
    }
  }

  // ---------------------------------------------------------------------------
  // Core pipeline
  // ---------------------------------------------------------------------------

  /** Run the full ingestion pipeline for this source. */
  async run(): Promise<IngestionJobResult> {
    const requestId = randomUUID();
    const startTime = Date.now();
    const errors: IngestionError[] = [];
    let documentsNew = 0;
    let documentsSkipped = 0;

    this.logger.info({
      operation: 'ingestion:start',
      requestId,
      source: this.config.sourceName,
      country: this.config.country,
    });

    let rawDocuments: readonly RawDocument[];
    try {
      rawDocuments = await this.fetchDocuments(requestId);
    } catch (err) {
      const duration = Date.now() - startTime;
      this.logger.error({
        operation: 'ingestion:fetch_failed',
        requestId,
        source: this.config.sourceName,
        duration,
        result: 'error',
        error: err instanceof Error ? err.message : String(err),
      });
      throw new AppError({
        code: 'INGESTION_FETCH_FAILED',
        message: `Failed to fetch documents from ${this.config.sourceName}`,
        requestId,
        cause: err instanceof Error ? err : undefined,
      });
    }

    this.logger.info({
      operation: 'ingestion:fetched',
      requestId,
      source: this.config.sourceName,
      documentsFetched: rawDocuments.length,
      duration: Date.now() - startTime,
      result: 'success',
    });

    for (const raw of rawDocuments) {
      try {
        const parsed = await this.parseDocument(raw, requestId);

        // Idempotency check: source + documentId + version
        const alreadyExists = await this.checkIdempotency(
          this.config.sourceName,
          parsed.externalDocumentId,
          parsed.version,
          requestId,
        );

        if (alreadyExists) {
          documentsSkipped++;
          this.logger.debug({
            operation: 'ingestion:skip_duplicate',
            requestId,
            source: this.config.sourceName,
            documentId: parsed.externalDocumentId,
            version: parsed.version,
            result: 'skipped',
          });
          continue;
        }

        // Detect semantic changes against previous version
        const changeResult = await this.detectChanges(parsed, requestId);

        if (changeResult.changeType === 'NO_CHANGE') {
          documentsSkipped++;
          this.logger.debug({
            operation: 'ingestion:skip_no_change',
            requestId,
            source: this.config.sourceName,
            documentId: parsed.externalDocumentId,
            cosineSimilarity: changeResult.cosineSimilarity,
            result: 'skipped',
          });
          continue;
        }

        // Classify impact level
        const impact = await this.classifyImpact(parsed, changeResult, requestId);

        // Publish to Service Bus
        await this.publishChange(parsed, impact.level, requestId);

        documentsNew++;
        this.logger.info({
          operation: 'ingestion:processed',
          requestId,
          source: this.config.sourceName,
          documentId: parsed.externalDocumentId,
          impactLevel: impact.level,
          changeType: changeResult.changeType,
          duration: Date.now() - startTime,
          result: 'success',
        });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        errors.push({
          documentId: raw.externalId,
          error: errorMessage,
          retryable: !(err instanceof AppError && err.statusCode < 500),
        });
        this.logger.error({
          operation: 'ingestion:document_failed',
          requestId,
          source: this.config.sourceName,
          documentId: raw.externalId,
          result: 'error',
          error: errorMessage,
        });
      }
    }

    const duration = Date.now() - startTime;
    const result: IngestionJobResult = {
      source: this.config.sourceName,
      documentsFound: rawDocuments.length,
      documentsNew,
      documentsSkipped,
      errors,
      durationMs: duration,
    };

    this.logger.info({
      operation: 'ingestion:complete',
      requestId,
      source: this.config.sourceName,
      documentsFound: rawDocuments.length,
      documentsNew,
      documentsSkipped,
      errorsCount: errors.length,
      duration,
      result: errors.length > 0 ? 'partial' : 'success',
    });

    return result;
  }

  // ---------------------------------------------------------------------------
  // Change detection — semantic diff via embeddings cosine similarity
  // ---------------------------------------------------------------------------

  /**
   * Detect changes between current document and its previous version.
   * Uses embeddings cosine similarity: < 0.92 threshold = semantic change.
   */
  async detectChanges(
    current: ParsedRegulation,
    requestId: string,
  ): Promise<ChangeDetectionResult> {
    if (!this.embeddingFn) {
      throw Errors.internal(requestId, 'Embedding function not initialized');
    }

    // For new documents (no previous version), always treat as NEW
    // The idempotency check already handled exact duplicates
    const previousContent = await this.getPreviousContent(
      current.externalDocumentId,
      requestId,
    );

    if (!previousContent) {
      return {
        hasChanged: true,
        cosineSimilarity: 0,
        changeType: 'NEW',
        previousVersion: null,
        currentVersion: current.version,
      };
    }

    const [currentEmbedding, previousEmbedding] = await Promise.all([
      this.embeddingFn(current.rawContent),
      this.embeddingFn(previousContent),
    ]);

    const similarity = cosineSimilarity(currentEmbedding, previousEmbedding);

    const hasChanged = similarity < 0.92;

    this.logger.debug({
      operation: 'ingestion:change_detection',
      requestId,
      documentId: current.externalDocumentId,
      cosineSimilarity: Math.round(similarity * 10000) / 10000,
      threshold: 0.92,
      hasChanged,
    });

    return {
      hasChanged,
      cosineSimilarity: similarity,
      changeType: hasChanged ? 'SEMANTIC_CHANGE' : 'NO_CHANGE',
      previousVersion: null,
      currentVersion: current.version,
    };
  }

  // ---------------------------------------------------------------------------
  // Impact classification — LLM-based
  // ---------------------------------------------------------------------------

  /**
   * Classify the impact level of a regulatory change.
   * HIGH: deadlines, fines, new mandatory requirements
   * MEDIUM: modification of existing procedures
   * LOW: typographical corrections, minor clarifications
   */
  async classifyImpact(
    parsed: ParsedRegulation,
    changeResult: ChangeDetectionResult,
    requestId: string,
  ): Promise<ImpactClassificationResult> {
    if (!this.classifyFn) {
      throw Errors.internal(requestId, 'Classification function not initialized');
    }

    const startTime = Date.now();
    const result = await this.classifyFn(
      parsed.title,
      parsed.summary,
      parsed.affectedAreas,
      changeResult.changeType,
    );

    this.logger.info({
      operation: 'ingestion:classify_impact',
      requestId,
      source: this.config.sourceName,
      documentId: parsed.externalDocumentId,
      impactLevel: result.level,
      reasoning: result.reasoning,
      duration: Date.now() - startTime,
      result: 'success',
    });

    return result;
  }

  // ---------------------------------------------------------------------------
  // Publish to Service Bus
  // ---------------------------------------------------------------------------

  /** Publish a detected change to the Azure Service Bus queue. */
  async publishChange(
    parsed: ParsedRegulation,
    impactLevel: ImpactLevel,
    requestId: string,
  ): Promise<void> {
    const message: IngestionMessage = {
      source: this.config.sourceName,
      documentId: parsed.externalDocumentId,
      version: parsed.version,
      rawContentUrl: parsed.sourceUrl,
      country: parsed.country,
      jurisdiction: parsed.jurisdiction,
      detectedAt: new Date(),
    };

    if (this.serviceBusSender) {
      const startTime = Date.now();
      await this.serviceBusSender.sendMessages({
        body: message,
        contentType: 'application/json',
        messageId: `${this.config.sourceName}:${parsed.externalDocumentId}:${parsed.version}`,
        subject: impactLevel,
        applicationProperties: {
          source: this.config.sourceName,
          country: parsed.country,
          impactLevel,
        },
      });

      this.logger.info({
        operation: 'ingestion:publish_change',
        requestId,
        source: this.config.sourceName,
        documentId: parsed.externalDocumentId,
        impactLevel,
        queue: 'regulatory-changes',
        duration: Date.now() - startTime,
        result: 'success',
      });
    } else {
      this.logger.warn({
        operation: 'ingestion:publish_change',
        requestId,
        source: this.config.sourceName,
        documentId: parsed.externalDocumentId,
        result: 'skipped',
        reason: 'Service Bus not configured (local dev)',
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /** Check idempotency: source + documentId + version. */
  private async checkIdempotency(
    source: string,
    documentId: string,
    version: string,
    requestId: string,
  ): Promise<boolean> {
    if (!this.idempotencyCheckFn) {
      throw Errors.internal(requestId, 'Idempotency check function not initialized');
    }
    return this.idempotencyCheckFn(source, documentId, version);
  }

  /**
   * Retrieve previous content for a document to compare against.
   * Override in subclass if source provides version history.
   */
  protected async getPreviousContent(
    _externalDocumentId: string,
    _requestId: string,
  ): Promise<string | null> {
    // Default: no previous content available — treat as new
    // Subclasses can override to query PostgreSQL for last indexed version
    return null;
  }

  /** Clean up Service Bus resources. */
  async dispose(): Promise<void> {
    await this.serviceBusSender?.close();
    await this.serviceBusClient?.close();
  }
}

// ---------------------------------------------------------------------------
// Math utilities
// ---------------------------------------------------------------------------

/** Compute cosine similarity between two embedding vectors. */
function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    const valA = a[i]!;
    const valB = b[i]!;
    dotProduct += valA * valB;
    normA += valA * valA;
    normB += valB * valB;
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  return dotProduct / denominator;
}

export { cosineSimilarity };
