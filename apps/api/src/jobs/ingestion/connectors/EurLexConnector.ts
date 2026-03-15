// ============================================================================
// FILE: apps/api/src/jobs/ingestion/connectors/EurLexConnector.ts
// EUR-Lex connector — monitors EU legislation via RSS feed.
// Filters: GDPR, MiFID II, DORA, EMIR updates.
// Polling: every 1 hour.
// ============================================================================

import { BaseIngestionJob } from '../BaseIngestionJob.js';
import { RateLimitedHttpClient } from './httpClient.js';
import type { RawDocument, ParsedRegulation, IngestionSourceConfig } from '../types.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const EUR_LEX_CONFIG: IngestionSourceConfig = {
  sourceName: 'EUR_LEX',
  country: 'EU',
  jurisdiction: 'EU',
  baseUrl: 'https://eur-lex.europa.eu',
  checkIntervalMinutes: 60,
  maxRequestsPerSecond: 5,
};

/** Key EU regulations monitored by RegWatch AI. */
const MONITORED_REGULATIONS = [
  'GDPR', 'MiFID', 'DORA', 'EMIR', 'SFDR', 'AIFMD', 'CRD', 'CRR',
  'Solvency', 'PSD2', 'AML', 'CSRD', 'taxonomy',
] as const;

const RSS_FEED_URL =
  'https://eur-lex.europa.eu/rss/rss-consleg.xml?type=LEGISLATION';

// ---------------------------------------------------------------------------
// XML parsing helpers (lightweight — no external dependency)
// ---------------------------------------------------------------------------

interface RssItem {
  readonly title: string;
  readonly link: string;
  readonly description: string;
  readonly pubDate: string;
  readonly category: string;
  readonly guid: string;
}

function parseRssItems(xml: string): readonly RssItem[] {
  const items: RssItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match: RegExpExecArray | null;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1]!;
    items.push({
      title: extractTag(block, 'title'),
      link: extractTag(block, 'link'),
      description: extractTag(block, 'description'),
      pubDate: extractTag(block, 'pubDate'),
      category: extractTag(block, 'category'),
      guid: extractTag(block, 'guid'),
    });
  }

  return items;
}

function extractTag(xml: string, tag: string): string {
  const regex = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>|<${tag}[^>]*>([\\s\\S]*?)</${tag}>`);
  const match = regex.exec(xml);
  if (!match) return '';
  return (match[1] ?? match[2] ?? '').trim();
}

// ---------------------------------------------------------------------------
// EurLexConnector
// ---------------------------------------------------------------------------

export class EurLexConnector extends BaseIngestionJob {
  private readonly http: RateLimitedHttpClient;

  constructor(config: Partial<IngestionSourceConfig> = {}) {
    super({ ...EUR_LEX_CONFIG, ...config });
    this.http = new RateLimitedHttpClient('EUR_LEX', {
      maxRequestsPerSecond: this.config.maxRequestsPerSecond,
    });
  }

  protected async fetchDocuments(requestId: string): Promise<readonly RawDocument[]> {
    const startTime = Date.now();

    const rssXml = await this.http.fetchText(RSS_FEED_URL);
    const allItems = parseRssItems(rssXml);

    // Filter items related to monitored regulations
    const relevantItems = allItems.filter((item) =>
      isRelevantToMonitoredRegulations(item.title, item.description),
    );

    const documents: RawDocument[] = relevantItems.map((item) => ({
      externalId: item.guid || item.link,
      title: item.title,
      rawContent: item.description,
      sourceUrl: item.link,
      publishedDate: item.pubDate ? new Date(item.pubDate) : new Date(),
      metadata: {
        category: item.category,
        guid: item.guid,
        feedSource: 'EUR_LEX_RSS',
      },
    }));

    this.logger.info({
      operation: 'eur_lex:fetch_complete',
      requestId,
      totalItems: allItems.length,
      relevantItems: relevantItems.length,
      duration: Date.now() - startTime,
      result: 'success',
    });

    return documents;
  }

  protected async parseDocument(
    raw: RawDocument,
    _requestId: string,
  ): Promise<ParsedRegulation> {
    const affectedAreas = detectAffectedAreas(raw.title, raw.rawContent);
    const affectedIndustries = detectAffectedIndustries(raw.title, raw.rawContent);

    // Extract CELEX number or OJ reference if present
    const celexMatch = /CELEX[:\s]*(\d{5}[A-Z]\d{4})/.exec(raw.rawContent);
    const ojMatch = /OJ\s+[LC]\s+\d+/.exec(raw.rawContent);
    const legalRef = celexMatch?.[1] ?? ojMatch?.[0] ?? '';

    return {
      externalDocumentId: raw.externalId,
      title: raw.title,
      summary: raw.rawContent.slice(0, 500),
      rawContent: raw.rawContent,
      effectiveDate: raw.publishedDate,
      publishedDate: raw.publishedDate,
      country: 'EU',
      jurisdiction: 'EU',
      affectedAreas,
      affectedIndustries,
      sourceUrl: raw.sourceUrl,
      language: 'en',
      version: `${raw.externalId}:${legalRef || raw.publishedDate.toISOString().split('T')[0]!}`,
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isRelevantToMonitoredRegulations(title: string, description: string): boolean {
  const combined = `${title} ${description}`.toUpperCase();
  return MONITORED_REGULATIONS.some((reg) => combined.includes(reg.toUpperCase()));
}

function detectAffectedAreas(title: string, content: string): readonly string[] {
  const combined = `${title} ${content}`.toUpperCase();
  const areas: string[] = [];

  const areaKeywords: Record<string, readonly string[]> = {
    'securities': ['MIFID', 'SECURITIES', 'EMIR', 'TRADING', 'MARKET'],
    'banking': ['CRD', 'CRR', 'CAPITAL REQUIREMENTS', 'BANKING'],
    'data-protection': ['GDPR', 'DATA PROTECTION', 'PRIVACY'],
    'digital-finance': ['DORA', 'DIGITAL', 'RESILIENCE', 'ICT'],
    'insurance': ['SOLVENCY', 'INSURANCE', 'EIOPA'],
    'payments': ['PSD2', 'PAYMENT', 'SEPA'],
    'aml': ['AML', 'ANTI-MONEY', 'LAUNDERING', 'TERRORIST FINANCING'],
    'sustainability': ['SFDR', 'CSRD', 'TAXONOMY', 'ESG', 'SUSTAINABLE'],
    'funds': ['AIFMD', 'UCITS', 'FUND'],
  };

  for (const [area, keywords] of Object.entries(areaKeywords)) {
    if (keywords.some((kw) => combined.includes(kw))) {
      areas.push(area);
    }
  }

  return areas.length > 0 ? areas : ['regulatory'];
}

function detectAffectedIndustries(title: string, content: string): readonly string[] {
  const combined = `${title} ${content}`.toUpperCase();
  const industries: string[] = [];

  const industryKeywords: Record<string, readonly string[]> = {
    'banking': ['BANK', 'CREDIT INSTITUTION', 'CRD', 'CRR'],
    'insurance': ['INSUR', 'SOLVENCY', 'REINSUR'],
    'asset-management': ['FUND', 'AIFM', 'UCITS', 'ASSET MANAGEMENT'],
    'securities': ['BROKER', 'DEALER', 'INVESTMENT FIRM', 'MIFID'],
    'fintech': ['DIGITAL', 'DORA', 'ICT', 'FINTECH'],
    'public-companies': ['CSRD', 'ISSUER', 'LISTED', 'DISCLOSURE'],
  };

  for (const [industry, keywords] of Object.entries(industryKeywords)) {
    if (keywords.some((kw) => combined.includes(kw))) {
      industries.push(industry);
    }
  }

  return industries.length > 0 ? industries : ['financial-services'];
}
