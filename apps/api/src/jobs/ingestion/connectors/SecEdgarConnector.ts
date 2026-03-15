// ============================================================================
// FILE: apps/api/src/jobs/ingestion/connectors/SecEdgarConnector.ts
// SEC EDGAR connector — monitors 8-K, 13F, N-1A filings.
// Rate limit: max 10 req/s per EDGAR fair access policy.
// Polling: every 10 minutes.
// ============================================================================

import { BaseIngestionJob } from '../BaseIngestionJob.js';
import { RateLimitedHttpClient } from './httpClient.js';
import type { RawDocument, ParsedRegulation, IngestionSourceConfig } from '../types.js';

// ---------------------------------------------------------------------------
// EDGAR API response types
// ---------------------------------------------------------------------------

interface EdgarSubmissionsResponse {
  readonly cik: string;
  readonly entityType: string;
  readonly name: string;
  readonly filings: {
    readonly recent: EdgarRecentFilings;
  };
}

interface EdgarRecentFilings {
  readonly accessionNumber: readonly string[];
  readonly filingDate: readonly string[];
  readonly form: readonly string[];
  readonly primaryDocument: readonly string[];
  readonly primaryDocDescription: readonly string[];
}

interface EdgarFullTextSearchResponse {
  readonly hits: {
    readonly hits: readonly EdgarSearchHit[];
    readonly total: { readonly value: number };
  };
}

interface EdgarSearchHit {
  readonly _id: string;
  readonly _source: {
    readonly file_date: string;
    readonly display_date_filed: string;
    readonly entity_name: string;
    readonly file_num: string;
    readonly form_type: string;
    readonly file_description: string;
    readonly period_of_report: string;
  };
}

// ---------------------------------------------------------------------------
// Connector config
// ---------------------------------------------------------------------------

const SEC_EDGAR_CONFIG: IngestionSourceConfig = {
  sourceName: 'SEC_EDGAR',
  country: 'US',
  jurisdiction: 'US-FED',
  baseUrl: 'https://efts.sec.gov/LATEST/search-index',
  checkIntervalMinutes: 10,
  maxRequestsPerSecond: 10,
};

/** Form types monitored by RegWatch AI. */
const MONITORED_FORMS = ['8-K', '13F-HR', '13F-NT', 'N-1A', 'S-1', '10-K', '10-Q'] as const;

// ---------------------------------------------------------------------------
// SecEdgarConnector
// ---------------------------------------------------------------------------

export class SecEdgarConnector extends BaseIngestionJob {
  private readonly http: RateLimitedHttpClient;

  constructor(config: Partial<IngestionSourceConfig> = {}) {
    super({ ...SEC_EDGAR_CONFIG, ...config });
    this.http = new RateLimitedHttpClient('SEC_EDGAR', {
      maxRequestsPerSecond: this.config.maxRequestsPerSecond,
      maxRetries: 3,
      baseDelayMs: 1000,
    });
  }

  protected async fetchDocuments(requestId: string): Promise<readonly RawDocument[]> {
    const startTime = Date.now();
    const documents: RawDocument[] = [];

    // Use EDGAR full-text search API to find recent filings
    // Filter by monitored form types, last 24 hours
    const dateFrom = new Date(Date.now() - 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0]!;
    const dateTo = new Date().toISOString().split('T')[0]!;

    for (const formType of MONITORED_FORMS) {
      try {
        const searchUrl =
          `https://efts.sec.gov/LATEST/search-index?q=%22${encodeURIComponent(formType)}%22` +
          `&dateRange=custom&startdt=${dateFrom}&enddt=${dateTo}` +
          `&forms=${encodeURIComponent(formType)}`;

        const response = await this.http.fetchJson<EdgarFullTextSearchResponse>(searchUrl);

        for (const hit of response.hits.hits) {
          const source = hit._source;
          documents.push({
            externalId: hit._id,
            title: `${source.form_type}: ${source.entity_name} — ${source.file_description || 'Filing'}`,
            rawContent: JSON.stringify(source),
            sourceUrl: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&filenum=${encodeURIComponent(source.file_num)}&type=${encodeURIComponent(source.form_type)}`,
            publishedDate: new Date(source.file_date || source.display_date_filed),
            metadata: {
              formType: source.form_type,
              entityName: source.entity_name,
              fileNumber: source.file_num,
              periodOfReport: source.period_of_report,
            },
          });
        }

        this.logger.debug({
          operation: 'sec_edgar:search_form',
          requestId,
          formType,
          resultsFound: response.hits.hits.length,
          totalAvailable: response.hits.total.value,
          result: 'success',
        });
      } catch (err) {
        this.logger.error({
          operation: 'sec_edgar:search_form',
          requestId,
          formType,
          result: 'error',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    this.logger.info({
      operation: 'sec_edgar:fetch_complete',
      requestId,
      totalDocuments: documents.length,
      formsSearched: MONITORED_FORMS.length,
      duration: Date.now() - startTime,
      result: 'success',
    });

    return documents;
  }

  protected async parseDocument(
    raw: RawDocument,
    _requestId: string,
  ): Promise<ParsedRegulation> {
    const metadata = raw.metadata;
    const formType = metadata['formType'] ?? 'UNKNOWN';

    // Determine affected areas based on form type
    const affectedAreas = getAffectedAreas(formType);
    const affectedIndustries = getAffectedIndustries(formType);

    return {
      externalDocumentId: raw.externalId,
      title: raw.title,
      summary: buildSummary(raw, formType),
      rawContent: raw.rawContent,
      effectiveDate: raw.publishedDate,
      publishedDate: raw.publishedDate,
      country: 'US',
      jurisdiction: 'US-FED',
      affectedAreas,
      affectedIndustries,
      sourceUrl: raw.sourceUrl,
      language: 'en',
      version: buildVersion(raw),
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getAffectedAreas(formType: string): readonly string[] {
  const areaMap: Record<string, readonly string[]> = {
    '8-K': ['corporate', 'securities', 'disclosure'],
    '13F-HR': ['securities', 'investment-management'],
    '13F-NT': ['securities', 'investment-management'],
    'N-1A': ['investment-management', 'funds'],
    'S-1': ['securities', 'corporate', 'ipo'],
    '10-K': ['corporate', 'securities', 'financial-reporting'],
    '10-Q': ['corporate', 'securities', 'financial-reporting'],
  };
  return areaMap[formType] ?? ['securities'];
}

function getAffectedIndustries(formType: string): readonly string[] {
  const industryMap: Record<string, readonly string[]> = {
    '8-K': ['financial-services', 'public-companies'],
    '13F-HR': ['asset-management', 'investment-advisors'],
    '13F-NT': ['asset-management', 'investment-advisors'],
    'N-1A': ['mutual-funds', 'investment-companies'],
    'S-1': ['public-companies'],
    '10-K': ['public-companies'],
    '10-Q': ['public-companies'],
  };
  return industryMap[formType] ?? ['financial-services'];
}

function buildSummary(raw: RawDocument, formType: string): string {
  const entity = raw.metadata['entityName'] ?? 'Unknown Entity';
  const period = raw.metadata['periodOfReport'] ?? '';
  const dateStr = raw.publishedDate.toISOString().split('T')[0]!;

  const formDescriptions: Record<string, string> = {
    '8-K': 'Material event disclosure',
    '13F-HR': 'Institutional investment holdings report',
    '13F-NT': 'Institutional investment holdings notification',
    'N-1A': 'Mutual fund registration/prospectus',
    'S-1': 'Securities registration statement',
    '10-K': 'Annual report',
    '10-Q': 'Quarterly report',
  };

  const description = formDescriptions[formType] ?? `SEC filing (${formType})`;
  const periodStr = period ? ` for period ${period}` : '';

  return `${description} filed by ${entity} on ${dateStr}${periodStr}.`;
}

function buildVersion(raw: RawDocument): string {
  const dateStr = raw.publishedDate.toISOString().split('T')[0]!;
  return `${raw.externalId}:${dateStr}`;
}
