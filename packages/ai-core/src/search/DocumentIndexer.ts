// ============================================================================
// FILE: packages/ai-core/src/search/DocumentIndexer.ts
// Indexes regulatory documents into Azure AI Search with embeddings.
// Checks Redis cache before generating embeddings to reduce AOAI costs.
// ============================================================================

import {
  SearchClient,
  AzureKeyCredential,
} from '@azure/search-documents';
import pino from 'pino';
import type { RegulatoryChange, ImpactLevel } from '@regwatch/shared';
import type { SearchIndexConfig, SearchDocument } from './types.js';

const logger = pino({ level: process.env['LOG_LEVEL'] ?? 'info' }).child({
  service: 'ai-core:document-indexer',
});

/** Maximum batch size for Azure AI Search bulk operations. */
const MAX_BATCH_SIZE = 100;

export interface DocumentIndexerDeps {
  /** Generate embedding for text. Should check cache internally. */
  readonly generateEmbedding: (text: string) => Promise<readonly number[]>;
}

export class DocumentIndexer {
  private readonly searchClient: SearchClient<SearchDocument>;
  private readonly deps: DocumentIndexerDeps;

  constructor(config: SearchIndexConfig, deps: DocumentIndexerDeps) {
    this.searchClient = new SearchClient<SearchDocument>(
      config.endpoint,
      config.indexName,
      new AzureKeyCredential(config.apiKey),
    );
    this.deps = deps;
  }

  /**
   * Embed and index a single regulatory change document.
   * Generates embedding for the combined title + summary + content.
   */
  async embedAndIndex(
    change: RegulatoryChange,
    source: string,
    tenantId: string,
    requestId: string,
  ): Promise<void> {
    const startTime = Date.now();

    // Build text for embedding: title + summary gives best semantic representation
    const embeddingText = buildEmbeddingText(change);

    // Generate embedding (deps.generateEmbedding should check Redis cache first)
    const contentVector = await this.deps.generateEmbedding(embeddingText);

    const searchDoc: SearchDocument = {
      id: change.id,
      title: change.title,
      content: change.rawContent.slice(0, 32_000), // AI Search field limit
      summary: change.summary,
      country: change.country,
      jurisdiction: change.jurisdiction,
      area: change.affectedAreas.join(', '),
      impactLevel: change.impactLevel,
      effectiveDate: change.effectiveDate.toISOString(),
      publishedDate: change.publishedDate.toISOString(),
      sourceUrl: change.sourceUrl,
      source,
      externalDocumentId: change.externalDocumentId,
      version: change.version,
      language: change.language,
      tenantId,
      contentVector,
    };

    await this.searchClient.mergeOrUploadDocuments([searchDoc]);

    logger.info({
      operation: 'document_indexer:embed_and_index',
      requestId,
      documentId: change.id,
      externalDocumentId: change.externalDocumentId,
      embeddingDimensions: contentVector.length,
      contentLength: embeddingText.length,
      duration: Date.now() - startTime,
      result: 'success',
    });
  }

  /**
   * Bulk index multiple regulatory changes.
   * Processes in batches of 100 (Azure AI Search limit).
   */
  async bulkIndex(
    changes: readonly RegulatoryChange[],
    source: string,
    tenantId: string,
    requestId: string,
  ): Promise<BulkIndexResult> {
    const startTime = Date.now();
    let indexed = 0;
    let failed = 0;
    const errors: BulkIndexError[] = [];

    // Process in batches
    for (let i = 0; i < changes.length; i += MAX_BATCH_SIZE) {
      const batch = changes.slice(i, i + MAX_BATCH_SIZE);
      const batchNumber = Math.floor(i / MAX_BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(changes.length / MAX_BATCH_SIZE);

      logger.debug({
        operation: 'document_indexer:bulk_batch_start',
        requestId,
        batch: batchNumber,
        totalBatches,
        batchSize: batch.length,
      });

      // Generate embeddings in parallel within the batch
      const docsWithEmbeddings = await Promise.allSettled(
        batch.map(async (change) => {
          const embeddingText = buildEmbeddingText(change);
          const contentVector = await this.deps.generateEmbedding(embeddingText);

          const doc: SearchDocument = {
            id: change.id,
            title: change.title,
            content: change.rawContent.slice(0, 32_000),
            summary: change.summary,
            country: change.country,
            jurisdiction: change.jurisdiction,
            area: change.affectedAreas.join(', '),
            impactLevel: change.impactLevel,
            effectiveDate: change.effectiveDate.toISOString(),
            publishedDate: change.publishedDate.toISOString(),
            sourceUrl: change.sourceUrl,
            source,
            externalDocumentId: change.externalDocumentId,
            version: change.version,
            language: change.language,
            tenantId,
            contentVector,
          };

          return { doc, changeId: change.id };
        }),
      );

      // Separate successes and failures
      const successDocs: SearchDocument[] = [];
      for (const result of docsWithEmbeddings) {
        if (result.status === 'fulfilled') {
          successDocs.push(result.value.doc);
        } else {
          failed++;
          errors.push({
            documentId: 'unknown',
            error: result.reason instanceof Error ? result.reason.message : String(result.reason),
          });
        }
      }

      // Upload the successful batch to AI Search
      if (successDocs.length > 0) {
        try {
          const uploadResult = await this.searchClient.mergeOrUploadDocuments(successDocs);

          for (const r of uploadResult.results) {
            if (r.succeeded) {
              indexed++;
            } else {
              failed++;
              errors.push({
                documentId: r.key ?? 'unknown',
                error: r.errorMessage ?? 'Upload failed',
              });
            }
          }
        } catch (err) {
          failed += successDocs.length;
          const errorMessage = err instanceof Error ? err.message : String(err);
          for (const doc of successDocs) {
            errors.push({ documentId: doc.id, error: errorMessage });
          }
        }
      }

      logger.info({
        operation: 'document_indexer:bulk_batch_complete',
        requestId,
        batch: batchNumber,
        totalBatches,
        batchIndexed: successDocs.length,
        batchFailed: batch.length - successDocs.length,
        duration: Date.now() - startTime,
        result: 'success',
      });
    }

    const duration = Date.now() - startTime;

    logger.info({
      operation: 'document_indexer:bulk_index_complete',
      requestId,
      totalDocuments: changes.length,
      indexed,
      failed,
      errorsCount: errors.length,
      duration,
      result: failed > 0 ? 'partial' : 'success',
    });

    return { indexed, failed, errors, durationMs: duration };
  }

  /** Delete a document from the index by ID. */
  async deleteDocument(documentId: string, requestId: string): Promise<void> {
    const startTime = Date.now();
    await this.searchClient.deleteDocuments([{ id: documentId } as SearchDocument]);

    logger.info({
      operation: 'document_indexer:delete',
      requestId,
      documentId,
      duration: Date.now() - startTime,
      result: 'success',
    });
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BulkIndexResult {
  readonly indexed: number;
  readonly failed: number;
  readonly errors: readonly BulkIndexError[];
  readonly durationMs: number;
}

export interface BulkIndexError {
  readonly documentId: string;
  readonly error: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build the text used for embedding generation.
 * Combines title + summary for best semantic representation.
 * Limits to ~8000 tokens (~32K chars) to stay within embedding model limits.
 */
function buildEmbeddingText(change: RegulatoryChange): string {
  const parts = [
    change.title,
    change.summary,
    `Country: ${change.country}`,
    `Jurisdiction: ${change.jurisdiction}`,
    `Areas: ${change.affectedAreas.join(', ')}`,
    `Industries: ${change.affectedIndustries.join(', ')}`,
    `Impact: ${change.impactLevel}`,
  ];

  // Add raw content up to the limit
  const header = parts.join('\n');
  const remainingChars = 32_000 - header.length;

  if (remainingChars > 0 && change.rawContent.length > 0) {
    return `${header}\n\n${change.rawContent.slice(0, remainingChars)}`;
  }

  return header;
}
