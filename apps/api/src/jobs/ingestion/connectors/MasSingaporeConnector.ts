// ============================================================================
// FILE: apps/api/src/jobs/ingestion/connectors/MasSingaporeConnector.ts
// MAS (Monetary Authority of Singapore) connector.
// Monitors Singapore's financial regulator publications.
// Polling: every 1 hour.
//
// Real data endpoints (no API key required):
//   - Notices:     https://www.mas.gov.sg/regulation/notices
//   - Guidelines:  https://www.mas.gov.sg/regulation/guidelines
//   - Circulars:   https://www.mas.gov.sg/regulation/circulars
//   - Consults:    https://www.mas.gov.sg/publications/consultations
//   - Media:       https://www.mas.gov.sg/news
//   - RSS:         https://www.mas.gov.sg/rss/news
//
// Singapore is a key growth market for GT (+28.8% revenue growth).
// MAS is the sole financial regulator covering banking, insurance,
// securities, and payments — making monitoring straightforward.
// ============================================================================

import { BaseIngestionJob } from '../BaseIngestionJob.js';
import { RateLimitedHttpClient } from './httpClient.js';
import type { RawDocument, ParsedRegulation, IngestionSourceConfig } from '../types.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const MAS_CONFIG: IngestionSourceConfig = {
  sourceName: 'MAS_SINGAPORE',
  country: 'SG',
  jurisdiction: 'SG',
  baseUrl: 'https://www.mas.gov.sg',
  checkIntervalMinutes: 60,
  maxRequestsPerSecond: 3,
};

/** MAS sections to monitor for regulatory changes. */
const MAS_SECTIONS = [
  { path: '/regulation/notices', name: 'MAS Notices' },
  { path: '/regulation/guidelines', name: 'MAS Guidelines' },
  { path: '/regulation/circulars', name: 'MAS Circulars' },
  { path: '/publications/consultations', name: 'MAS Consultations' },
] as const;

/**
 * Keywords for filtering relevant MAS regulatory documents.
 */
export const SINGAPORE_KEYWORDS = [
  // Banking / finance
  'MAS', 'Monetary Authority', 'banking act', 'capital adequacy',
  'Basel', 'liquidity', 'credit risk', 'interest rate',
  // Securities
  'Securities and Futures Act', 'SFA', 'capital markets',
  'listed company', 'SGX', 'prospectus', 'collective investment',
  // Insurance
  'Insurance Act', 'RBC', 'risk-based capital', 'policyholder',
  // Payments / fintech
  'Payment Services Act', 'PSA', 'digital payment token',
  'e-money', 'stablecoin', 'DPT', 'fintech',
  // AML / CFT
  'anti-money laundering', 'AML', 'CFT', 'suspicious transaction',
  'customer due diligence', 'CDD', 'beneficial owner',
  // ESG / sustainability
  'sustainability', 'ESG', 'climate risk', 'green finance',
  'taxonomy', 'TCFD', 'transition planning',
  // Data / technology
  'technology risk', 'cyber', 'outsourcing', 'cloud',
  'artificial intelligence', 'data governance',
  // Tax
  'IRAS', 'GST', 'transfer pricing', 'tax incentive',
  'Pillar Two', 'global minimum tax', 'BEPS',
] as const;

/**
 * Singapore regulation definitions for the GT demo.
 */
export const SINGAPORE_REGULATIONS = [
  {
    id: 'mas-stablecoin-2025',
    title: 'MAS Stablecoin Regulatory Framework — Final Rules',
    summary: 'The Monetary Authority of Singapore finalises the regulatory framework for single-currency stablecoins (SCS) under the Payment Services Act. Issuers must maintain reserve assets in Singapore-domiciled institutions, hold minimum base capital of SGD 1M, and comply with redemption-at-par requirements within 5 business days. Applies to SCS pegged to SGD or G10 currencies.',
    effectiveDate: '2025-08-01',
    publishedDate: '2025-04-15',
    areas: ['digital-finance', 'banking', 'payments'],
    industries: ['fintech', 'banking', 'payments'],
    keywords: ['stablecoin', 'SCS', 'Payment Services Act', 'MAS'],
    deadlines: [
      { title: 'Existing SCS issuers — submit licence application', date: '2026-02-01', status: 'PENDING' as const },
      { title: 'Full compliance with reserve requirements', date: '2026-08-01', status: 'PENDING' as const },
    ],
  },
  {
    id: 'mas-climate-risk-2025',
    title: 'MAS Guidelines on Environmental Risk Management — Enhanced Requirements',
    summary: 'MAS enhances environmental risk management guidelines for banks, insurers, and asset managers. Requires scenario analysis aligned with NGFS pathways, Scope 3 emissions measurement, transition planning with interim targets, and board-level accountability. Mandatory TCFD-aligned disclosure effective FY2026.',
    effectiveDate: '2026-01-01',
    publishedDate: '2025-06-30',
    areas: ['sustainability', 'banking', 'insurance', 'securities'],
    industries: ['banking', 'insurance', 'asset-management', 'public-companies'],
    keywords: ['climate risk', 'TCFD', 'environmental risk', 'transition planning', 'MAS'],
    deadlines: [
      { title: 'Board approval of transition plan', date: '2026-06-30', status: 'PENDING' as const },
      { title: 'First TCFD-aligned disclosure — major FIs', date: '2026-12-31', status: 'PENDING' as const },
    ],
  },
  {
    id: 'mas-aml-platform-2025',
    title: 'MAS Notice on AML/CFT — Digital Platform Obligations',
    summary: 'MAS issues updated AML/CFT requirements for digital platform operators including enhanced customer due diligence for cross-border transactions exceeding SGD 20,000, real-time transaction monitoring, and mandatory participation in COSMIC (Collaborative Sharing of ML/TF Information & Cases) information-sharing platform.',
    effectiveDate: '2025-10-01',
    publishedDate: '2025-05-20',
    areas: ['aml', 'compliance', 'digital-finance'],
    industries: ['banking', 'fintech', 'payments', 'securities'],
    keywords: ['AML', 'CFT', 'COSMIC', 'due diligence', 'MAS'],
    deadlines: [
      { title: 'COSMIC platform onboarding — major banks', date: '2026-03-01', status: 'PENDING' as const },
      { title: 'Enhanced CDD for digital platforms', date: '2026-06-01', status: 'PENDING' as const },
    ],
  },
  {
    id: 'mas-ai-governance-2025',
    title: 'MAS Technology Risk Management Guidelines — AI & Cloud Addendum',
    summary: 'MAS supplements TRM Guidelines with specific requirements for AI model governance in financial services. Mandates explainability standards for credit scoring and AML models, periodic bias audits, model risk management frameworks, and enhanced cloud outsourcing controls including data residency requirements for customer data.',
    effectiveDate: '2026-03-01',
    publishedDate: '2025-09-01',
    areas: ['technology', 'compliance', 'data-protection'],
    industries: ['banking', 'insurance', 'fintech', 'asset-management'],
    keywords: ['AI governance', 'TRM', 'model risk', 'cloud', 'MAS'],
    deadlines: [
      { title: 'AI model inventory and classification', date: '2026-06-01', status: 'PENDING' as const },
      { title: 'Bias audit for credit scoring models', date: '2026-09-01', status: 'PENDING' as const },
    ],
  },
] as const;

// ---------------------------------------------------------------------------
// HTML parsing helpers
// ---------------------------------------------------------------------------

interface MasEntry {
  readonly title: string;
  readonly url: string;
  readonly date: string;
  readonly category: string;
}

/**
 * Parse MAS regulation listing pages (HTML).
 * MAS uses structured listing pages with document links.
 */
function parseMasListingPage(html: string, baseUrl: string, category: string): readonly MasEntry[] {
  const entries: MasEntry[] = [];

  // MAS listings typically use structured HTML with links to document pages
  const linkRegex = /<a[^>]+href="([^"]*(?:notices|guidelines|circulars|consultations)[^"]*)"[^>]*>([^<]+)<\/a>/gi;
  const dateRegex = /(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+\d{4})/gi;

  let lastDate = '';
  const lines = html.split('\n');

  for (const line of lines) {
    const dateMatch = dateRegex.exec(line);
    if (dateMatch) {
      lastDate = dateMatch[1]!;
      dateRegex.lastIndex = 0;
    }

    const linkMatch = linkRegex.exec(line);
    if (linkMatch) {
      const href = linkMatch[1]!;
      const title = linkMatch[2]!.trim();

      if (title.length < 10) {
        linkRegex.lastIndex = 0;
        continue;
      }

      const fullUrl = href.startsWith('http') ? href : `${baseUrl}${href}`;

      entries.push({
        title,
        url: fullUrl,
        date: lastDate,
        category,
      });
      linkRegex.lastIndex = 0;
    }
  }

  return entries;
}

// ---------------------------------------------------------------------------
// MasSingaporeConnector
// ---------------------------------------------------------------------------

export class MasSingaporeConnector extends BaseIngestionJob {
  private readonly http: RateLimitedHttpClient;

  constructor(config: Partial<IngestionSourceConfig> = {}) {
    super({ ...MAS_CONFIG, ...config });
    this.http = new RateLimitedHttpClient('MAS_SINGAPORE', {
      maxRequestsPerSecond: MAS_CONFIG.maxRequestsPerSecond,
    });
  }

  // -------------------------------------------------------------------------
  // Standard connector pipeline
  // -------------------------------------------------------------------------

  protected async fetchDocuments(requestId: string): Promise<readonly RawDocument[]> {
    const startTime = Date.now();
    const documents: RawDocument[] = [];

    // Fetch from each MAS section
    for (const section of MAS_SECTIONS) {
      try {
        const html = await this.http.fetchText(`${MAS_CONFIG.baseUrl}${section.path}`);
        const entries = parseMasListingPage(html, MAS_CONFIG.baseUrl, section.name);

        for (const entry of entries) {
          const pubDate = entry.date ? new Date(entry.date) : new Date();
          const safeDate = isNaN(pubDate.getTime()) ? new Date() : pubDate;

          documents.push({
            externalId: entry.url,
            title: entry.title,
            rawContent: entry.title,
            sourceUrl: entry.url,
            publishedDate: safeDate,
            metadata: {
              category: entry.category,
              source: 'MAS',
            },
          });
        }

        this.logger.debug({
          operation: 'mas:fetch_section',
          requestId,
          section: section.name,
          entriesFound: entries.length,
          result: 'success',
        });
      } catch (err) {
        this.logger.warn({
          operation: 'mas:fetch_section',
          requestId,
          section: section.name,
          result: 'error',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Filter by relevance keywords
    const relevant = this.filterByKeywords(documents);

    this.logger.info({
      operation: 'mas:fetch_complete',
      requestId,
      totalDocuments: documents.length,
      relevantDocuments: relevant.length,
      duration: Date.now() - startTime,
      result: 'success',
    });

    return relevant;
  }

  protected async parseDocument(
    raw: RawDocument,
    _requestId: string,
  ): Promise<ParsedRegulation> {
    // Try to fetch full text
    let fullContent = raw.rawContent;
    try {
      fullContent = await this.fetchFullText(raw.sourceUrl);
    } catch {
      // Keep original content on failure
    }

    const affectedAreas = detectSingaporeAreas(raw.title, fullContent);
    const affectedIndustries = detectSingaporeIndustries(raw.title, fullContent);

    return {
      externalDocumentId: raw.externalId,
      title: raw.title,
      summary: fullContent.slice(0, 500),
      rawContent: fullContent,
      effectiveDate: raw.publishedDate,
      publishedDate: raw.publishedDate,
      country: 'SG',
      jurisdiction: 'SG',
      affectedAreas,
      affectedIndustries,
      sourceUrl: raw.sourceUrl,
      language: 'en',
      version: `${raw.externalId}:${raw.publishedDate.toISOString().split('T')[0]!}`,
    };
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  /** Fetch full text from a MAS document page. */
  async fetchFullText(url: string): Promise<string> {
    try {
      const html = await this.http.fetchText(url);
      return html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
        .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
        .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/\s{2,}/g, ' ')
        .trim()
        .slice(0, 32_000);
    } catch {
      return '';
    }
  }

  /** Filter documents by relevance keywords. */
  filterByKeywords(docs: readonly RawDocument[]): readonly RawDocument[] {
    return docs.filter((doc) => {
      const lower = `${doc.title} ${doc.rawContent}`.toLowerCase();
      return SINGAPORE_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()));
    });
  }
}

// ---------------------------------------------------------------------------
// Area / Industry detection
// ---------------------------------------------------------------------------

function detectSingaporeAreas(title: string, content: string): readonly string[] {
  const combined = `${title} ${content}`.toUpperCase();
  const areas: string[] = [];

  const keywords: Record<string, readonly string[]> = {
    'banking': ['BANKING ACT', 'CAPITAL ADEQUACY', 'BASEL', 'LIQUIDITY', 'CREDIT RISK', 'DEPOSIT'],
    'securities': ['SECURITIES AND FUTURES', 'SFA', 'CAPITAL MARKET', 'SGX', 'COLLECTIVE INVESTMENT', 'FUND MANAGEMENT'],
    'insurance': ['INSURANCE ACT', 'RBC', 'POLICYHOLDER', 'REINSURANCE', 'ACTUAR'],
    'payments': ['PAYMENT SERVICES', 'PSA', 'E-MONEY', 'REMITTANCE'],
    'digital-finance': ['DIGITAL PAYMENT TOKEN', 'DPT', 'STABLECOIN', 'CRYPTO', 'VIRTUAL ASSET', 'FINTECH'],
    'aml': ['ANTI-MONEY LAUNDERING', 'AML', 'CFT', 'SUSPICIOUS TRANSACTION', 'CUSTOMER DUE DILIGENCE', 'COSMIC'],
    'sustainability': ['SUSTAINABILITY', 'ESG', 'CLIMATE', 'GREEN FINANCE', 'TCFD', 'TAXONOMY', 'TRANSITION'],
    'technology': ['TECHNOLOGY RISK', 'CYBER', 'OUTSOURCING', 'CLOUD', 'ARTIFICIAL INTELLIGENCE', 'AI GOVERNANCE'],
    'fiscal': ['IRAS', 'GST', 'TRANSFER PRICING', 'TAX INCENTIVE', 'PILLAR TWO', 'BEPS'],
    'data-protection': ['PDPA', 'PERSONAL DATA', 'DATA PROTECTION', 'DATA GOVERNANCE'],
  };

  for (const [area, kws] of Object.entries(keywords)) {
    if (kws.some((kw) => combined.includes(kw))) {
      areas.push(area);
    }
  }

  return areas.length > 0 ? areas : ['regulatory'];
}

function detectSingaporeIndustries(title: string, content: string): readonly string[] {
  const combined = `${title} ${content}`.toUpperCase();
  const industries: string[] = [];

  const keywords: Record<string, readonly string[]> = {
    'banking': ['BANK', 'CREDIT', 'DEPOSIT', 'LENDING'],
    'insurance': ['INSURANCE', 'INSURER', 'REINSURANCE', 'POLICYHOLDER'],
    'securities': ['SECURITIES', 'FUND MANAGER', 'CAPITAL MARKET', 'SGX', 'BROKER'],
    'asset-management': ['ASSET MANAGEMENT', 'FUND MANAGEMENT', 'REIT', 'COLLECTIVE INVESTMENT'],
    'fintech': ['FINTECH', 'PAYMENT', 'DPT', 'STABLECOIN', 'E-MONEY'],
    'payments': ['PAYMENT SERVICE', 'REMITTANCE', 'CROSS-BORDER'],
    'energy': ['ENERGY', 'CARBON', 'EMISSIONS'],
  };

  for (const [industry, kws] of Object.entries(keywords)) {
    if (kws.some((kw) => combined.includes(kw))) {
      industries.push(industry);
    }
  }

  return industries.length > 0 ? industries : ['financial-services'];
}
