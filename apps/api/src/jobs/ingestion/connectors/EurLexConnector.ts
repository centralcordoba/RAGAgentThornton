// ============================================================================
// FILE: apps/api/src/jobs/ingestion/connectors/EurLexConnector.ts
// EUR-Lex connector — monitors EU legislation via RSS feed + CELLAR REST.
// Filters: energy efficiency, GDPR, MiFID II, DORA, EMIR, SFDR, CSRD.
// Polling: every 1 hour.
//
// Real data endpoints (no API key required):
//   - RSS feed:    https://eur-lex.europa.eu/tools/rss.do?type=LEGISLATION&language=EN
//   - CELLAR REST: https://publications.europa.eu/resource/cellar/{cellar-id}
//   - Direct:      https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:{celex}
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
  'energy efficiency', 'renewable energy', 'emissions', 'climate',
  'sustainable finance', 'SFDR', 'GHG',
] as const;

const RSS_FEED_URL =
  'https://eur-lex.europa.eu/tools/rss.do?type=LEGISLATION&language=EN';

/**
 * Real EU energy regulations for the demo.
 * These have active transposition deadlines and multi-country impact.
 */
export const EU_ENERGY_REGULATIONS = [
  {
    celex: '32023L1791',
    title: 'Energy Efficiency Directive (recast)',
    deadline: '2025-10-11',
    affectedCountries: ['ES', 'DE', 'FR', 'IT', 'NL'],
    areas: ['energy', 'environmental', 'sustainability'],
    industries: ['energy', 'utilities', 'manufacturing', 'construction'],
  },
  {
    celex: '32018R2088',
    title: 'SFDR - Sustainable Finance Disclosure Regulation',
    deadline: '2025-01-01',
    affectedCountries: ['ES', 'DE', 'FR'],
    areas: ['sustainability', 'securities', 'funds'],
    industries: ['asset-management', 'banking', 'insurance'],
  },
  {
    celex: '32018R0842',
    title: 'Effort Sharing Regulation — GHG emissions by Member State',
    deadline: '2030-12-31',
    affectedCountries: ['ES', 'DE', 'FR', 'IT', 'NL'],
    areas: ['environmental', 'energy', 'emissions'],
    industries: ['energy', 'manufacturing', 'transport'],
  },
  {
    celex: '32017R1369',
    title: 'Energy Labelling Regulation',
    deadline: '2025-12-31',
    affectedCountries: ['ES', 'DE', 'FR', 'IT', 'NL'],
    areas: ['energy', 'consumer-protection'],
    industries: ['manufacturing', 'retail', 'energy'],
  },
] as const;

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

  // -------------------------------------------------------------------------
  // CELEX-specific fetcher (real EUR-Lex data)
  // -------------------------------------------------------------------------

  /**
   * Fetch a specific EU regulation by CELEX number.
   * URL: https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:{celex}
   */
  async fetchByCelex(celex: string): Promise<{ title: string; content: string; url: string }> {
    const url = `https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:${celex}`;
    const html = await this.http.fetchText(url);

    // Extract title from <title> tag
    const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
    const title = titleMatch?.[1]?.trim() ?? `EU Regulation ${celex}`;

    // Strip HTML to get plain text content
    const content = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/\s{2,}/g, ' ')
      .trim()
      .slice(0, 32_000); // Limit content size

    this.logger.info({
      operation: 'eur_lex:fetch_celex',
      celex,
      contentLength: content.length,
      result: 'success',
    });

    return { title, content, url };
  }

  // -------------------------------------------------------------------------
  // Standard connector pipeline (fetchDocuments)
  // -------------------------------------------------------------------------

  protected async fetchDocuments(requestId: string): Promise<readonly RawDocument[]> {
    const startTime = Date.now();
    const documents: RawDocument[] = [];

    // Strategy 1: Fetch known energy regulations by CELEX
    for (const reg of EU_ENERGY_REGULATIONS) {
      try {
        const result = await this.fetchByCelex(reg.celex);
        documents.push({
          externalId: reg.celex,
          title: reg.title,
          rawContent: result.content,
          sourceUrl: result.url,
          publishedDate: new Date(),
          metadata: {
            celex: reg.celex,
            deadline: reg.deadline,
            affectedCountries: reg.affectedCountries.join(','),
            feedSource: 'EUR_LEX_CELEX',
          },
        });
      } catch (err) {
        this.logger.warn({
          operation: 'eur_lex:fetch_celex',
          requestId,
          celex: reg.celex,
          result: 'error',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Strategy 2: RSS feed for latest legislation
    try {
      const rssXml = await this.http.fetchText(RSS_FEED_URL);
      const allItems = parseRssItems(rssXml);

      const relevantItems = allItems.filter((item) =>
        isRelevantToMonitoredRegulations(item.title, item.description),
      );

      for (const item of relevantItems) {
        // Skip if already fetched via CELEX
        if (documents.some((d) => d.sourceUrl === item.link)) continue;

        documents.push({
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
        });
      }

      this.logger.info({
        operation: 'eur_lex:fetch_rss',
        requestId,
        totalItems: allItems.length,
        relevantItems: relevantItems.length,
        result: 'success',
      });
    } catch (err) {
      this.logger.warn({
        operation: 'eur_lex:fetch_rss',
        requestId,
        result: 'error',
        error: err instanceof Error ? err.message : String(err),
      });
    }

    this.logger.info({
      operation: 'eur_lex:fetch_complete',
      requestId,
      totalDocuments: documents.length,
      celexDocs: EU_ENERGY_REGULATIONS.length,
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
