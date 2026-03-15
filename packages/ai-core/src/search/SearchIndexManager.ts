// ============================================================================
// FILE: packages/ai-core/src/search/SearchIndexManager.ts
// Manages the Azure AI Search index schema for regulatory documents.
// Creates index with vector fields, semantic config, and filterable facets.
// ============================================================================

import {
  SearchIndexClient,
  type SearchIndex,
  type SemanticConfiguration,
  type SemanticField,
  type VectorSearch,
  AzureKeyCredential,
} from '@azure/search-documents';
import pino from 'pino';
import type { SearchIndexConfig } from './types.js';

const logger = pino({ level: process.env['LOG_LEVEL'] ?? 'info' }).child({
  service: 'ai-core:search-index',
});

/** text-embedding-3-large output dimensions. */
const EMBEDDING_DIMENSIONS = 3072;

const INDEX_FIELDS: SearchIndex['fields'] = [
  // Key
  { name: 'id', type: 'Edm.String', key: true, filterable: true },

  // Text fields — searchable
  { name: 'title', type: 'Edm.String', searchable: true, retrievable: true },
  {
    name: 'content',
    type: 'Edm.String',
    searchable: true,
    retrievable: true,
    analyzerName: 'standard.lucene',
  },
  {
    name: 'summary',
    type: 'Edm.String',
    searchable: true,
    retrievable: true,
  },

  // Filterable / facetable metadata
  {
    name: 'country',
    type: 'Edm.String',
    filterable: true,
    facetable: true,
    retrievable: true,
  },
  {
    name: 'jurisdiction',
    type: 'Edm.String',
    filterable: true,
    facetable: true,
    retrievable: true,
  },
  {
    name: 'area',
    type: 'Edm.String',
    filterable: true,
    facetable: true,
    retrievable: true,
  },
  {
    name: 'impactLevel',
    type: 'Edm.String',
    filterable: true,
    facetable: true,
    retrievable: true,
  },
  {
    name: 'effectiveDate',
    type: 'Edm.DateTimeOffset',
    filterable: true,
    sortable: true,
    retrievable: true,
  },
  {
    name: 'publishedDate',
    type: 'Edm.DateTimeOffset',
    filterable: true,
    sortable: true,
    retrievable: true,
  },
  {
    name: 'sourceUrl',
    type: 'Edm.String',
    retrievable: true,
  },
  {
    name: 'source',
    type: 'Edm.String',
    filterable: true,
    facetable: true,
    retrievable: true,
  },
  {
    name: 'externalDocumentId',
    type: 'Edm.String',
    filterable: true,
    retrievable: true,
  },
  {
    name: 'version',
    type: 'Edm.String',
    retrievable: true,
  },
  {
    name: 'language',
    type: 'Edm.String',
    filterable: true,
    facetable: true,
    retrievable: true,
  },
  {
    name: 'tenantId',
    type: 'Edm.String',
    filterable: true,
    retrievable: true,
  },

  // Vector field for hybrid search
  {
    name: 'contentVector',
    type: 'Collection(Edm.Single)',
    searchable: true,
    retrievable: false,
    vectorSearchDimensions: EMBEDDING_DIMENSIONS,
    vectorSearchProfileName: 'default-vector-profile',
  },
];

const VECTOR_SEARCH_CONFIG: VectorSearch = {
  algorithms: [
    {
      name: 'hnsw-algorithm',
      kind: 'hnsw',
      parameters: {
        metric: 'cosine',
        m: 4,
        efConstruction: 400,
        efSearch: 500,
      },
    },
  ],
  profiles: [
    {
      name: 'default-vector-profile',
      algorithmConfigurationName: 'hnsw-algorithm',
    },
  ],
};

const SEMANTIC_CONFIG: SemanticConfiguration = {
  name: 'default-semantic-config',
  prioritizedFields: {
    titleField: { name: 'title' } as SemanticField,
    contentFields: [
      { name: 'content' } as SemanticField,
      { name: 'summary' } as SemanticField,
    ],
  },
};

export class SearchIndexManager {
  private readonly client: SearchIndexClient;
  private readonly indexName: string;

  constructor(config: SearchIndexConfig) {
    this.client = new SearchIndexClient(
      config.endpoint,
      new AzureKeyCredential(config.apiKey),
    );
    this.indexName = config.indexName;
  }

  /**
   * Create or update the regulatory-documents index.
   * Safe to call multiple times — uses createOrUpdateIndex.
   */
  async createIndex(): Promise<void> {
    const startTime = Date.now();

    const index: SearchIndex = {
      name: this.indexName,
      fields: INDEX_FIELDS,
      vectorSearch: VECTOR_SEARCH_CONFIG,
      semanticSearch: {
        configurations: [SEMANTIC_CONFIG],
        defaultConfigurationName: 'default-semantic-config',
      },
    };

    await this.client.createOrUpdateIndex(index);

    logger.info({
      operation: 'search_index:create',
      indexName: this.indexName,
      fieldsCount: INDEX_FIELDS.length,
      embeddingDimensions: EMBEDDING_DIMENSIONS,
      duration: Date.now() - startTime,
      result: 'success',
    });
  }

  /** Delete the index. Use with caution — irreversible. */
  async deleteIndex(): Promise<void> {
    await this.client.deleteIndex(this.indexName);
    logger.warn({
      operation: 'search_index:delete',
      indexName: this.indexName,
      result: 'success',
    });
  }

  /** Get index statistics (document count, storage size). */
  async getStats(): Promise<{ documentCount: number; storageSize: number }> {
    const stats = await this.client.getIndexStatistics(this.indexName);
    return {
      documentCount: stats.documentCount ?? 0,
      storageSize: stats.storageSize ?? 0,
    };
  }
}
