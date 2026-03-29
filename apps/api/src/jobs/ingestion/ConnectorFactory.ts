// ============================================================================
// FILE: apps/api/src/jobs/ingestion/ConnectorFactory.ts
// Factory that creates the correct connector instance based on source type.
// Used by the scheduler to dynamically instantiate connectors from DB config.
// ============================================================================

import type { ManagedRegulatorySource } from '@regwatch/shared';
import { BaseIngestionJob } from './BaseIngestionJob.js';
import { SecEdgarConnector } from './connectors/SecEdgarConnector.js';
import { EurLexConnector } from './connectors/EurLexConnector.js';
import { BoeSpainConnector } from './connectors/BoeSpainConnector.js';
import { DofMexicoConnector } from './connectors/DofMexicoConnector.js';
import { DouBrazilConnector } from './connectors/DouBrazilConnector.js';
import { InfolegArgentinaConnector } from './connectors/InfolegArgentinaConnector.js';
import { MasSingaporeConnector } from './connectors/MasSingaporeConnector.js';
import type { IngestionSourceConfig } from './types.js';
import { createServiceLogger } from '../../config/logger.js';

const logger = createServiceLogger('connector-factory');

// ---------------------------------------------------------------------------
// Known connector registry — maps source names to their connector classes
// ---------------------------------------------------------------------------

const KNOWN_CONNECTORS: Record<string, new (config?: Partial<IngestionSourceConfig>) => BaseIngestionJob> = {
  SEC_EDGAR: SecEdgarConnector,
  EUR_LEX: EurLexConnector,
  BOE_SPAIN: BoeSpainConnector,
  DOF_MEXICO: DofMexicoConnector,
  DOU_BRAZIL: DouBrazilConnector,
  INFOLEG_ARGENTINA: InfolegArgentinaConnector,
  MAS_SINGAPORE: MasSingaporeConnector,
};

// ---------------------------------------------------------------------------
// Frequency → interval mapping
// ---------------------------------------------------------------------------

const FREQUENCY_TO_INTERVAL: Record<string, number> = {
  every_10min: 10 * 60_000,
  hourly: 60 * 60_000,
  daily: 24 * 60 * 60_000,
};

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export class ConnectorFactory {
  /**
   * Create a connector instance from a ManagedRegulatorySource DB record.
   * For known sources (SEC_EDGAR, EUR_LEX, etc.) uses the specialized connector.
   * For custom sources, creates a generic connector based on type.
   */
  static create(source: ManagedRegulatorySource): BaseIngestionJob | null {
    // Normalize the source name for lookup
    const normalizedName = source.name
      .toUpperCase()
      .replace(/[\s-]+/g, '_')
      .replace(/[^A-Z0-9_]/g, '');

    // Check if we have a specialized connector
    const ConnectorClass = KNOWN_CONNECTORS[normalizedName];
    if (ConnectorClass) {
      logger.info({
        operation: 'connector_factory:create',
        sourceName: source.name,
        normalizedName,
        connectorType: 'specialized',
        result: 'success',
      });

      return new ConnectorClass({
        sourceName: normalizedName,
        country: source.country,
        baseUrl: source.baseUrl,
        checkIntervalMinutes: intervalToMinutes(source.frequency),
      });
    }

    // For new/custom sources, create a generic connector based on type
    logger.info({
      operation: 'connector_factory:create',
      sourceName: source.name,
      sourceType: source.type,
      connectorType: 'generic',
      result: 'success',
    });

    return createGenericConnector(source);
  }

  /**
   * Get the interval in milliseconds for a given frequency.
   */
  static getIntervalMs(frequency: string): number {
    return FREQUENCY_TO_INTERVAL[frequency] ?? 60 * 60_000;
  }

  /**
   * Check if a source should run in the current scheduler cycle.
   * Compares lastFetch + interval against current time.
   */
  static shouldRunNow(source: ManagedRegulatorySource): boolean {
    if (!source.active) return false;
    if (!source.lastFetch) return true; // Never fetched → run now

    const intervalMs = ConnectorFactory.getIntervalMs(source.frequency);
    const nextRun = new Date(source.lastFetch).getTime() + intervalMs;
    return Date.now() >= nextRun;
  }
}

// ---------------------------------------------------------------------------
// Generic connectors for custom sources
// ---------------------------------------------------------------------------

/**
 * Creates a generic connector that fetches documents based on source type.
 * - API: fetches JSON from the base URL
 * - RSS: fetches and parses RSS/XML feed
 * - SCRAPING: fetches HTML and extracts document links
 */
function createGenericConnector(source: ManagedRegulatorySource): BaseIngestionJob {
  const config: IngestionSourceConfig = {
    sourceName: source.name.toUpperCase().replace(/[\s-]+/g, '_'),
    country: source.country,
    jurisdiction: `${source.country}-NATIONAL`,
    baseUrl: source.baseUrl,
    checkIntervalMinutes: intervalToMinutes(source.frequency),
    maxRequestsPerSecond: 5,
  };

  switch (source.type) {
    case 'API':
      return new GenericApiConnector(config, source.headers);
    case 'RSS':
      return new GenericRssConnector(config, source.headers);
    case 'SCRAPING':
      return new GenericScrapingConnector(config, source.headers);
    default:
      return new GenericApiConnector(config, source.headers);
  }
}

function intervalToMinutes(frequency: string): number {
  switch (frequency) {
    case 'every_10min': return 10;
    case 'hourly': return 60;
    case 'daily': return 1440;
    default: return 60;
  }
}

// ---------------------------------------------------------------------------
// Generic connector implementations
// ---------------------------------------------------------------------------

import type { RawDocument, ParsedRegulation } from './types.js';

class GenericApiConnector extends BaseIngestionJob {
  private readonly customHeaders: Readonly<Record<string, string>>;

  constructor(config: IngestionSourceConfig, headers: Readonly<Record<string, string>>) {
    super(config);
    this.customHeaders = headers;
  }

  protected async fetchDocuments(_requestId: string): Promise<readonly RawDocument[]> {
    const response = await fetch(this.config.baseUrl, {
      headers: {
        'User-Agent': 'RegWatch-AI/1.0',
        Accept: 'application/json',
        ...this.customHeaders,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const json = await response.json() as Record<string, unknown>;
    const rawItems = Array.isArray(json) ? json : (json['results'] ?? json['data'] ?? []) as unknown[];
    const items = Array.isArray(rawItems) ? rawItems : [];

    return items.slice(0, 50).map((item: Record<string, string>, i: number) => ({
      externalId: item['id'] ?? item['_id'] ?? `${this.config.sourceName}-${i}`,
      title: item['title'] ?? item['name'] ?? `Document ${i + 1}`,
      rawContent: JSON.stringify(item),
      sourceUrl: item['url'] ?? item['link'] ?? this.config.baseUrl,
      publishedDate: new Date(item['date'] ?? item['publishedDate'] ?? Date.now()),
      metadata: {},
    }));
  }

  protected async parseDocument(raw: RawDocument, _requestId: string): Promise<ParsedRegulation> {
    return {
      externalDocumentId: raw.externalId,
      title: raw.title,
      summary: raw.title,
      rawContent: raw.rawContent,
      effectiveDate: raw.publishedDate,
      publishedDate: raw.publishedDate,
      country: this.config.country,
      jurisdiction: this.config.jurisdiction,
      affectedAreas: [],
      affectedIndustries: [],
      sourceUrl: raw.sourceUrl,
      language: 'en',
      version: `${raw.externalId}:${raw.publishedDate.toISOString().split('T')[0]}`,
    };
  }
}

class GenericRssConnector extends BaseIngestionJob {
  private readonly customHeaders: Readonly<Record<string, string>>;

  constructor(config: IngestionSourceConfig, headers: Readonly<Record<string, string>>) {
    super(config);
    this.customHeaders = headers;
  }

  protected async fetchDocuments(_requestId: string): Promise<readonly RawDocument[]> {
    const response = await fetch(this.config.baseUrl, {
      headers: {
        'User-Agent': 'RegWatch-AI/1.0',
        Accept: 'application/xml, text/xml, application/rss+xml',
        ...this.customHeaders,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const xml = await response.text();
    const docs: RawDocument[] = [];

    // Parse RSS items
    const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi;
    let match: RegExpExecArray | null;
    while ((match = itemRegex.exec(xml)) !== null && docs.length < 50) {
      const item = match[1]!;
      const title = extractTag(item, 'title') ?? 'Untitled';
      const link = extractTag(item, 'link') ?? this.config.baseUrl;
      const pubDate = extractTag(item, 'pubDate') ?? extractTag(item, 'dc:date');
      const desc = extractTag(item, 'description') ?? '';

      docs.push({
        externalId: link,
        title,
        rawContent: desc.replace(/<[^>]*>/g, ''),
        sourceUrl: link,
        publishedDate: pubDate ? new Date(pubDate) : new Date(),
        metadata: {},
      });
    }

    return docs;
  }

  protected async parseDocument(raw: RawDocument, _requestId: string): Promise<ParsedRegulation> {
    return {
      externalDocumentId: raw.externalId,
      title: raw.title,
      summary: raw.rawContent.slice(0, 500),
      rawContent: raw.rawContent,
      effectiveDate: raw.publishedDate,
      publishedDate: raw.publishedDate,
      country: this.config.country,
      jurisdiction: this.config.jurisdiction,
      affectedAreas: [],
      affectedIndustries: [],
      sourceUrl: raw.sourceUrl,
      language: 'es',
      version: `${raw.externalId}:${raw.publishedDate.toISOString().split('T')[0]}`,
    };
  }
}

class GenericScrapingConnector extends BaseIngestionJob {
  private readonly customHeaders: Readonly<Record<string, string>>;

  constructor(config: IngestionSourceConfig, headers: Readonly<Record<string, string>>) {
    super(config);
    this.customHeaders = headers;
  }

  protected async fetchDocuments(_requestId: string): Promise<readonly RawDocument[]> {
    const response = await fetch(this.config.baseUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; RegWatch-AI/1.0)',
        Accept: 'text/html',
        ...this.customHeaders,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    const docs: RawDocument[] = [];

    // Extract links that look like regulatory documents
    const linkRegex = /<a[^>]+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
    let match: RegExpExecArray | null;
    while ((match = linkRegex.exec(html)) !== null && docs.length < 50) {
      const href = match[1]!;
      const text = match[2]!.replace(/<[^>]*>/g, '').trim();

      // Filter for document-like links
      if (text.length < 10 || href.startsWith('#') || href.startsWith('javascript:')) continue;
      if (!href.includes('pdf') && !href.includes('doc') && !href.includes('nota') && !href.includes('ley')) continue;

      const fullUrl = href.startsWith('http') ? href : new URL(href, this.config.baseUrl).toString();
      docs.push({
        externalId: fullUrl,
        title: text,
        rawContent: text,
        sourceUrl: fullUrl,
        publishedDate: new Date(),
        metadata: {},
      });
    }

    return docs;
  }

  protected async parseDocument(raw: RawDocument, _requestId: string): Promise<ParsedRegulation> {
    return {
      externalDocumentId: raw.externalId,
      title: raw.title,
      summary: raw.rawContent.slice(0, 500),
      rawContent: raw.rawContent,
      effectiveDate: raw.publishedDate,
      publishedDate: raw.publishedDate,
      country: this.config.country,
      jurisdiction: this.config.jurisdiction,
      affectedAreas: [],
      affectedIndustries: [],
      sourceUrl: raw.sourceUrl,
      language: 'es',
      version: `${raw.externalId}:${raw.publishedDate.toISOString().split('T')[0]}`,
    };
  }
}

function extractTag(xml: string, tag: string): string | null {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const match = regex.exec(xml);
  return match ? match[1]!.trim() : null;
}
