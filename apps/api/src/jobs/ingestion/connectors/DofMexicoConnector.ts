// ============================================================================
// FILE: apps/api/src/jobs/ingestion/connectors/DofMexicoConnector.ts
// DOF (Diario Oficial de la Federación) Mexico connector.
// Daily batch: fetches the day's index page, extracts documents.
// Polling: every 24 hours (6am UTC).
// ============================================================================

import { BaseIngestionJob } from '../BaseIngestionJob.js';
import { RateLimitedHttpClient } from './httpClient.js';
import type { RawDocument, ParsedRegulation, IngestionSourceConfig } from '../types.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DOF_CONFIG: IngestionSourceConfig = {
  sourceName: 'DOF_MEXICO',
  country: 'MX',
  jurisdiction: 'MX-FED',
  baseUrl: 'https://www.dof.gob.mx',
  checkIntervalMinutes: 1440, // 24 hours
  maxRequestsPerSecond: 3,
};

/** DOF sections of interest for compliance monitoring. */
const RELEVANT_SECTIONS = [
  'PODER EJECUTIVO',
  'SECRETARÍA DE HACIENDA',
  'SECRETARÍA DE ECONOMÍA',
  'COMISIÓN NACIONAL BANCARIA',
  'BANCO DE MÉXICO',
  'CONSAR',
  'CNBV',
  'CONDUSEF',
] as const;

// ---------------------------------------------------------------------------
// HTML parsing helpers (lightweight)
// ---------------------------------------------------------------------------

interface DofEntry {
  readonly title: string;
  readonly url: string;
  readonly section: string;
  readonly organism: string;
}

/**
 * Parse the DOF daily index page (HTML).
 * Extracts article links from the structured listing.
 */
function parseDofIndexPage(html: string, baseUrl: string): readonly DofEntry[] {
  const entries: DofEntry[] = [];

  // DOF index has articles in structured divs with title links
  // Pattern: <div class="sumario-title">...<a href="...">Title</a>...</div>
  const articleRegex =
    /<a[^>]+href="([^"]*nota_detalle[^"]*)"[^>]*>([^<]+)<\/a>/g;

  let currentSection = '';
  let currentOrganism = '';

  // Track section headers
  const sectionRegex = /<h[23][^>]*class="[^"]*sumario[^"]*"[^>]*>([^<]+)<\/h[23]>/g;
  const orgRegex = /<p[^>]*class="[^"]*organismo[^"]*"[^>]*>([^<]+)<\/p>/g;

  // Build a combined parse by processing line by line
  const lines = html.split('\n');
  for (const line of lines) {
    const sectionMatch = sectionRegex.exec(line);
    if (sectionMatch) {
      currentSection = sectionMatch[1]!.trim();
      sectionRegex.lastIndex = 0;
    }

    const orgMatch = orgRegex.exec(line);
    if (orgMatch) {
      currentOrganism = orgMatch[1]!.trim();
      orgRegex.lastIndex = 0;
    }

    const artMatch = articleRegex.exec(line);
    if (artMatch) {
      const href = artMatch[1]!;
      const title = artMatch[2]!.trim();
      const fullUrl = href.startsWith('http') ? href : `${baseUrl}${href}`;

      entries.push({
        title,
        url: fullUrl,
        section: currentSection,
        organism: currentOrganism,
      });
      articleRegex.lastIndex = 0;
    }
  }

  return entries;
}

// ---------------------------------------------------------------------------
// DofMexicoConnector
// ---------------------------------------------------------------------------

export class DofMexicoConnector extends BaseIngestionJob {
  private readonly http: RateLimitedHttpClient;

  constructor(config: Partial<IngestionSourceConfig> = {}) {
    super({ ...DOF_CONFIG, ...config });
    this.http = new RateLimitedHttpClient('DOF_MEXICO', {
      maxRequestsPerSecond: this.config.maxRequestsPerSecond,
    });
  }

  protected async fetchDocuments(requestId: string): Promise<readonly RawDocument[]> {
    const startTime = Date.now();

    // Fetch today's DOF index page
    const today = new Date();
    const dateStr = [
      today.getDate().toString().padStart(2, '0'),
      (today.getMonth() + 1).toString().padStart(2, '0'),
      today.getFullYear(),
    ].join('/');

    const indexUrl = `${DOF_CONFIG.baseUrl}/index.php?year=${today.getFullYear()}&month=${(today.getMonth() + 1).toString().padStart(2, '0')}&day=${today.getDate().toString().padStart(2, '0')}`;

    const html = await this.http.fetchText(indexUrl);
    const allEntries = parseDofIndexPage(html, DOF_CONFIG.baseUrl);

    // Filter to relevant sections
    const relevantEntries = allEntries.filter((entry) =>
      isRelevantDofEntry(entry.section, entry.organism),
    );

    const documents: RawDocument[] = [];

    for (const entry of relevantEntries) {
      // Fetch individual article content
      try {
        const articleHtml = await this.http.fetchText(entry.url);
        const textContent = extractArticleText(articleHtml);

        documents.push({
          externalId: extractDofId(entry.url) ?? `dof-${dateStr}-${documents.length}`,
          title: entry.title,
          rawContent: textContent,
          sourceUrl: entry.url,
          publishedDate: today,
          metadata: {
            section: entry.section,
            organism: entry.organism,
            dateStr,
          },
        });
      } catch (err) {
        this.logger.warn({
          operation: 'dof:fetch_article',
          requestId,
          url: entry.url,
          result: 'error',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    this.logger.info({
      operation: 'dof:fetch_complete',
      requestId,
      date: dateStr,
      totalEntries: allEntries.length,
      relevantEntries: relevantEntries.length,
      documentsRetrieved: documents.length,
      duration: Date.now() - startTime,
      result: 'success',
    });

    return documents;
  }

  protected async parseDocument(
    raw: RawDocument,
    _requestId: string,
  ): Promise<ParsedRegulation> {
    const affectedAreas = detectDofAreas(raw.title, raw.rawContent);
    const affectedIndustries = detectDofIndustries(raw.metadata['organism'] ?? '', raw.title);

    return {
      externalDocumentId: raw.externalId,
      title: raw.title,
      summary: raw.rawContent.slice(0, 500),
      rawContent: raw.rawContent,
      effectiveDate: raw.publishedDate,
      publishedDate: raw.publishedDate,
      country: 'MX',
      jurisdiction: 'MX-FED',
      affectedAreas,
      affectedIndustries,
      sourceUrl: raw.sourceUrl,
      language: 'es',
      version: `${raw.externalId}:${raw.publishedDate.toISOString().split('T')[0]!}`,
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isRelevantDofEntry(section: string, organism: string): boolean {
  const combined = `${section} ${organism}`.toUpperCase();
  return RELEVANT_SECTIONS.some((rs) => combined.includes(rs));
}

function extractArticleText(html: string): string {
  // Strip HTML tags and decode entities
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 50_000); // Limit content size
}

function extractDofId(url: string): string | null {
  const match = /codigo=(\d+)/.exec(url);
  return match ? `dof-${match[1]}` : null;
}

function detectDofAreas(title: string, content: string): readonly string[] {
  const combined = `${title} ${content}`.toUpperCase();
  const areas: string[] = [];

  const keywords: Record<string, readonly string[]> = {
    'fiscal': ['TRIBUTAR', 'FISCAL', 'IMPUESTO', 'ISR', 'IVA', 'HACIENDA', 'SAT'],
    'banking': ['BANCARI', 'FINANCIER', 'CRÉDITO', 'CNBV', 'BANXICO'],
    'securities': ['VALORES', 'BURSÁTIL', 'BOLSA'],
    'labor': ['LABORAL', 'TRABAJO', 'EMPLEO', 'IMSS', 'INFONAVIT'],
    'corporate': ['MERCANTIL', 'SOCIETAR', 'EMPRESA'],
    'aml': ['LAVADO', 'UIF', 'PREVENCIÓN DE OPERACIONES'],
    'pensions': ['PENSIÓN', 'AFORE', 'CONSAR', 'RETIRO'],
  };

  for (const [area, kws] of Object.entries(keywords)) {
    if (kws.some((kw) => combined.includes(kw))) {
      areas.push(area);
    }
  }

  return areas.length > 0 ? areas : ['regulatory'];
}

function detectDofIndustries(organism: string, title: string): readonly string[] {
  const combined = `${organism} ${title}`.toUpperCase();
  const industries: string[] = [];

  const keywords: Record<string, readonly string[]> = {
    'banking': ['CNBV', 'BANCARI', 'BANXICO', 'CRÉDITO'],
    'insurance': ['SEGUROS', 'CNSF', 'ASEGURAD'],
    'securities': ['VALORES', 'BURSÁTIL'],
    'pensions': ['CONSAR', 'AFORE', 'PENSIÓN'],
    'energy': ['ENERGÍA', 'CRE', 'PETRÓLEO', 'PEMEX'],
    'telecom': ['TELECOMUNICACION', 'IFT'],
  };

  for (const [industry, kws] of Object.entries(keywords)) {
    if (kws.some((kw) => combined.includes(kw))) {
      industries.push(industry);
    }
  }

  return industries.length > 0 ? industries : ['general'];
}
