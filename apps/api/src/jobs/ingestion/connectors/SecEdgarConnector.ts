// ============================================================================
// FILE: apps/api/src/jobs/ingestion/connectors/SecEdgarConnector.ts
// SEC EDGAR connector — monitors filings via company submissions + full-text search.
// Rate limit: max 10 req/s per EDGAR fair access policy.
// Polling: every 10 minutes.
//
// Real data endpoints (no API key required):
//   - Company filings: https://data.sec.gov/submissions/CIK{cik}.json
//   - Full-text search: https://efts.sec.gov/LATEST/search-index
//   - Filing text:      https://www.sec.gov/Archives/edgar/data/{cik}/{acc}/{doc}
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

/** A parsed EDGAR filing from the submissions API. */
export interface EdgarFiling {
  readonly accessionNumber: string;
  readonly formType: string;
  readonly filedAt: string;
  readonly primaryDocument: string;
  readonly description: string;
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
const MONITORED_FORMS = ['8-K', '10-K', '10-Q', 'DEF 14A', 'S-1', '13F-HR', 'N-1A'] as const;

/**
 * Real energy companies for the demo — public CIKs from SEC.
 * These are among the largest and most actively regulated energy filers.
 */
export const ENERGY_COMPANIES = [
  { cik: '0000753308', name: 'NextEra Energy', area: 'ENERGY' },
  { cik: '0000034088', name: 'Exxon Mobil', area: 'ENERGY' },
  { cik: '0001326428', name: 'Duke Energy', area: 'ENERGY' },
] as const;

// SEC requires a descriptive User-Agent header for EDGAR access
const SEC_USER_AGENT = 'RegWatch-AI/0.1.0 (compliance-monitoring; contact@grantthornton.com)';

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

  // -------------------------------------------------------------------------
  // Company-specific filing fetcher (real EDGAR data)
  // -------------------------------------------------------------------------

  /**
   * Fetch recent filings for a specific company by CIK.
   * Uses: https://data.sec.gov/submissions/CIK{cik}.json
   * No API key required. Rate limit: 10 req/s.
   */
  async fetchRecentFilings(
    cik: string,
    formTypes: readonly string[],
    maxResults = 20,
  ): Promise<readonly EdgarFiling[]> {
    const paddedCik = cik.padStart(10, '0');
    const url = `https://data.sec.gov/submissions/CIK${paddedCik}.json`;

    const response = await this.http.fetchJson<EdgarSubmissionsResponse>(url, {
      headers: { 'User-Agent': SEC_USER_AGENT },
    });

    const recent = response.filings.recent;
    const filings: EdgarFiling[] = [];

    const count = Math.min(recent.accessionNumber.length, 100);
    for (let i = 0; i < count; i++) {
      const form = recent.form[i]!;
      if (!formTypes.includes(form)) continue;

      filings.push({
        accessionNumber: recent.accessionNumber[i]!,
        formType: form,
        filedAt: recent.filingDate[i]!,
        primaryDocument: recent.primaryDocument[i]!,
        description: recent.primaryDocDescription[i] ?? `${form} Filing`,
      });

      if (filings.length >= maxResults) break;
    }

    this.logger.info({
      operation: 'sec_edgar:fetch_by_cik',
      cik: paddedCik,
      entityName: response.name,
      totalRecent: recent.accessionNumber.length,
      filteredCount: filings.length,
      formTypes,
      result: 'success',
    });

    return filings;
  }

  /**
   * Download the text content of a specific filing.
   * Uses: https://www.sec.gov/Archives/edgar/data/{cik}/{acc-no-dashes}/{primaryDoc}
   */
  async fetchFilingText(
    accessionNumber: string,
    cik: string,
    primaryDocument: string,
  ): Promise<string> {
    const cleanCik = cik.replace(/^0+/, '');
    const accNoDashes = accessionNumber.replace(/-/g, '');
    const url = `https://www.sec.gov/Archives/edgar/data/${cleanCik}/${accNoDashes}/${primaryDocument}`;

    const text = await this.http.fetchText(url, {
      headers: { 'User-Agent': SEC_USER_AGENT },
    });

    // Strip HTML tags for plain text content (filings are often HTML)
    return stripHtml(text);
  }

  // -------------------------------------------------------------------------
  // Standard connector pipeline (fetchDocuments)
  // -------------------------------------------------------------------------

  protected async fetchDocuments(requestId: string): Promise<readonly RawDocument[]> {
    const startTime = Date.now();
    const documents: RawDocument[] = [];

    // Strategy 1: Fetch filings from monitored energy companies by CIK
    for (const company of ENERGY_COMPANIES) {
      try {
        const filings = await this.fetchRecentFilings(
          company.cik,
          ['8-K', '10-K', '10-Q'],
          5,
        );

        for (const filing of filings) {
          documents.push({
            externalId: filing.accessionNumber,
            title: `${filing.formType}: ${company.name} — ${filing.description}`,
            rawContent: JSON.stringify({
              company: company.name,
              cik: company.cik,
              ...filing,
            }),
            sourceUrl: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${company.cik}&type=${encodeURIComponent(filing.formType)}&dateb=&owner=include&count=40`,
            publishedDate: new Date(filing.filedAt),
            metadata: {
              formType: filing.formType,
              entityName: company.name,
              cik: company.cik,
              accessionNumber: filing.accessionNumber,
              primaryDocument: filing.primaryDocument,
              area: company.area,
            },
          });
        }

        this.logger.debug({
          operation: 'sec_edgar:fetch_company',
          requestId,
          company: company.name,
          cik: company.cik,
          filingsFound: filings.length,
          result: 'success',
        });
      } catch (err) {
        this.logger.error({
          operation: 'sec_edgar:fetch_company',
          requestId,
          company: company.name,
          cik: company.cik,
          result: 'error',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Strategy 2: Full-text search for energy regulation filings
    try {
      const dateFrom = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0]!;
      const dateTo = new Date().toISOString().split('T')[0]!;

      const searchUrl =
        `https://efts.sec.gov/LATEST/search-index?q=%22energy+regulation%22+%22FERC%22` +
        `&dateRange=custom&startdt=${dateFrom}&enddt=${dateTo}` +
        `&forms=8-K,10-K`;

      const response = await this.http.fetchJson<EdgarFullTextSearchResponse>(searchUrl, {
        headers: { 'User-Agent': SEC_USER_AGENT },
      });

      for (const hit of response.hits.hits) {
        const source = hit._source;
        // Skip duplicates already fetched via CIK
        if (documents.some((d) => d.externalId === hit._id)) continue;

        documents.push({
          externalId: hit._id,
          title: `${source.form_type}: ${source.entity_name} — ${source.file_description || 'Energy Regulation Filing'}`,
          rawContent: JSON.stringify(source),
          sourceUrl: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&filenum=${encodeURIComponent(source.file_num)}&type=${encodeURIComponent(source.form_type)}`,
          publishedDate: new Date(source.file_date || source.display_date_filed),
          metadata: {
            formType: source.form_type,
            entityName: source.entity_name,
            fileNumber: source.file_num,
            periodOfReport: source.period_of_report,
            area: 'ENERGY',
          },
        });
      }

      this.logger.debug({
        operation: 'sec_edgar:search_energy',
        requestId,
        resultsFound: response.hits.hits.length,
        result: 'success',
      });
    } catch (err) {
      this.logger.error({
        operation: 'sec_edgar:search_energy',
        requestId,
        result: 'error',
        error: err instanceof Error ? err.message : String(err),
      });
    }

    this.logger.info({
      operation: 'sec_edgar:fetch_complete',
      requestId,
      totalDocuments: documents.length,
      companiesSearched: ENERGY_COMPANIES.length,
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
    const formType = (metadata['formType'] as string) ?? 'UNKNOWN';
    const area = (metadata['area'] as string) ?? '';

    const affectedAreas = getAffectedAreas(formType, area);
    const affectedIndustries = getAffectedIndustries(formType, area);

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

function getAffectedAreas(formType: string, area: string): readonly string[] {
  const areas: string[] = [];

  const areaMap: Record<string, readonly string[]> = {
    '8-K': ['corporate', 'securities', 'disclosure'],
    '13F-HR': ['securities', 'investment-management'],
    'N-1A': ['investment-management', 'funds'],
    'S-1': ['securities', 'corporate', 'ipo'],
    '10-K': ['corporate', 'securities', 'financial-reporting'],
    '10-Q': ['corporate', 'securities', 'financial-reporting'],
    'DEF 14A': ['corporate', 'governance', 'proxy'],
  };

  areas.push(...(areaMap[formType] ?? ['securities']));

  if (area === 'ENERGY') {
    areas.push('energy', 'environmental', 'ferc');
  }

  return [...new Set(areas)];
}

function getAffectedIndustries(formType: string, area: string): readonly string[] {
  const industries: string[] = [];

  const industryMap: Record<string, readonly string[]> = {
    '8-K': ['financial-services', 'public-companies'],
    '13F-HR': ['asset-management', 'investment-advisors'],
    'N-1A': ['mutual-funds', 'investment-companies'],
    'S-1': ['public-companies'],
    '10-K': ['public-companies'],
    '10-Q': ['public-companies'],
    'DEF 14A': ['public-companies'],
  };

  industries.push(...(industryMap[formType] ?? ['financial-services']));

  if (area === 'ENERGY') {
    industries.push('energy', 'utilities', 'oil-gas', 'renewables');
  }

  return [...new Set(industries)];
}

function buildSummary(raw: RawDocument, formType: string): string {
  const entity = (raw.metadata['entityName'] as string) ?? 'Unknown Entity';
  const period = (raw.metadata['periodOfReport'] as string) ?? '';
  const dateStr = raw.publishedDate.toISOString().split('T')[0]!;

  const formDescriptions: Record<string, string> = {
    '8-K': 'Material event disclosure',
    '13F-HR': 'Institutional investment holdings report',
    'N-1A': 'Mutual fund registration/prospectus',
    'S-1': 'Securities registration statement',
    '10-K': 'Annual report',
    '10-Q': 'Quarterly report',
    'DEF 14A': 'Proxy statement',
  };

  const description = formDescriptions[formType] ?? `SEC filing (${formType})`;
  const periodStr = period ? ` for period ${period}` : '';

  return `${description} filed by ${entity} on ${dateStr}${periodStr}.`;
}

function buildVersion(raw: RawDocument): string {
  const dateStr = raw.publishedDate.toISOString().split('T')[0]!;
  return `${raw.externalId}:${dateStr}`;
}

/** Strip HTML tags to extract plain text. */
function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
