// ============================================================================
// FILE: apps/api/src/jobs/ingestion/connectors/BoeSpainConnector.ts
// BOE (Boletín Oficial del Estado) Spain connector — XML feed.
// Filters: Section I (leyes), II (decretos), III (resoluciones).
// Polling: every 1 hour.
//
// Real data endpoints (no API key required):
//   - RSS:        https://www.boe.es/rss/BOE.xml
//   - Daily XML:  https://www.boe.es/boe/dias/YYYY/MM/DD/index.xml
//   - Doc XML:    https://www.boe.es/diario_boe/xml.php?id=BOE-A-YYYY-XXXX
//   - Doc HTML:   https://www.boe.es/diario_boe/txt.php?id=BOE-A-YYYY-XXXX
// ============================================================================

import { BaseIngestionJob } from '../BaseIngestionJob.js';
import { RateLimitedHttpClient } from './httpClient.js';
import type { RawDocument, ParsedRegulation, IngestionSourceConfig } from '../types.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const BOE_CONFIG: IngestionSourceConfig = {
  sourceName: 'BOE_SPAIN',
  country: 'ES',
  jurisdiction: 'ES',
  baseUrl: 'https://www.boe.es',
  checkIntervalMinutes: 60,
  maxRequestsPerSecond: 5,
};

/** BOE sections to monitor. */
const MONITORED_SECTIONS: Record<string, string> = {
  'I': 'Disposiciones generales',       // Leyes
  'II': 'Autoridades y personal',        // Decretos
  'III': 'Otras disposiciones',          // Resoluciones
};

const BOE_RSS_URL = 'https://www.boe.es/rss/BOE.xml';
const BOE_XML_API_URL = 'https://www.boe.es/datosabiertos/api/boe/dias/';

/**
 * Keywords for filtering relevant BOE documents.
 * Used to find documents related to energy, finance, and environment.
 */
export const RELEVANT_KEYWORDS = [
  'energía', 'eficiencia energética', 'renovables', 'eléctric',
  'mercados financieros', 'supervisión', 'CNMV', 'valores',
  'medio ambiente', 'residuos', 'emisiones', 'climático',
  'fiscal', 'tributario', 'AEAT', 'hacienda',
  'transposición', 'directiva', 'reglamento europeo',
] as const;

// ---------------------------------------------------------------------------
// XML parsing helpers
// ---------------------------------------------------------------------------

interface BoeRssItem {
  readonly title: string;
  readonly link: string;
  readonly description: string;
  readonly pubDate: string;
  readonly guid: string;
}

interface BoeSumarioItem {
  readonly id: string;
  readonly titulo: string;
  readonly urlPdf: string;
  readonly urlHtml: string;
  readonly seccion: string;
  readonly departamento: string;
  readonly fechaPublicacion: string;
}

function parseBoeRssItems(xml: string): readonly BoeRssItem[] {
  const items: BoeRssItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match: RegExpExecArray | null;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1]!;
    items.push({
      title: extractXmlTag(block, 'title'),
      link: extractXmlTag(block, 'link'),
      description: extractXmlTag(block, 'description'),
      pubDate: extractXmlTag(block, 'pubDate'),
      guid: extractXmlTag(block, 'guid'),
    });
  }

  return items;
}

function parseBoeApiItems(xml: string): readonly BoeSumarioItem[] {
  const items: BoeSumarioItem[] = [];
  const itemRegex = /<item\s[^>]*>([\s\S]*?)<\/item>/g;
  let match: RegExpExecArray | null;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1]!;
    const seccion = extractXmlTag(block, 'seccion');

    // Only include monitored sections (I, II, III)
    if (!Object.keys(MONITORED_SECTIONS).includes(seccion)) continue;

    items.push({
      id: extractXmlAttr(match[0]!, 'id'),
      titulo: extractXmlTag(block, 'titulo'),
      urlPdf: extractXmlTag(block, 'urlPdf'),
      urlHtml: extractXmlTag(block, 'urlHtml'),
      seccion,
      departamento: extractXmlTag(block, 'departamento'),
      fechaPublicacion: extractXmlTag(block, 'fechaPublicacion'),
    });
  }

  return items;
}

function extractXmlTag(xml: string, tag: string): string {
  const regex = new RegExp(
    `<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>|<${tag}[^>]*>([\\s\\S]*?)</${tag}>`,
  );
  const match = regex.exec(xml);
  if (!match) return '';
  return (match[1] ?? match[2] ?? '').trim();
}

function extractXmlAttr(xml: string, attr: string): string {
  const regex = new RegExp(`${attr}="([^"]*)"`);
  const match = regex.exec(xml);
  return match?.[1] ?? '';
}

// ---------------------------------------------------------------------------
// BoeSpainConnector
// ---------------------------------------------------------------------------

export class BoeSpainConnector extends BaseIngestionJob {
  private readonly http: RateLimitedHttpClient;

  constructor(config: Partial<IngestionSourceConfig> = {}) {
    super({ ...BOE_CONFIG, ...config });
    this.http = new RateLimitedHttpClient('BOE_SPAIN', {
      maxRequestsPerSecond: this.config.maxRequestsPerSecond,
    });
  }

  // -------------------------------------------------------------------------
  // Multi-day fetcher (for seed and historical data)
  // -------------------------------------------------------------------------

  /**
   * Fetch BOE documents from the last N days.
   * Uses the structured XML API for each day.
   */
  async fetchLastNDays(days: number): Promise<readonly RawDocument[]> {
    const allDocs: RawDocument[] = [];
    const now = new Date();

    for (let i = 0; i < days; i++) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);

      // Skip weekends — BOE typically doesn't publish on Sat/Sun
      const dayOfWeek = date.getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) continue;

      // BOE API uses YYYY/MM/DD format
      const yyyy = date.getFullYear();
      const mm = String(date.getMonth() + 1).padStart(2, '0');
      const dd = String(date.getDate()).padStart(2, '0');
      const dateStr = `${yyyy}${mm}${dd}`;
      const dateSlash = `${yyyy}/${mm}/${dd}`;

      try {
        // Try structured XML API first: https://www.boe.es/boe/dias/YYYY/MM/DD/index.xml
        const apiUrl = `https://www.boe.es/boe/dias/${dateSlash}/index.xml`;
        const xml = await this.http.fetchText(apiUrl);
        const items = parseBoeApiItems(xml);

        for (const item of items) {
          allDocs.push({
            externalId: item.id || `boe-${dateStr}-${allDocs.length}`,
            title: item.titulo,
            rawContent: item.titulo,
            sourceUrl: item.urlHtml || item.urlPdf || `${BOE_CONFIG.baseUrl}/diario_boe/`,
            publishedDate: item.fechaPublicacion ? new Date(item.fechaPublicacion) : date,
            metadata: {
              seccion: item.seccion,
              seccionName: MONITORED_SECTIONS[item.seccion] ?? item.seccion,
              departamento: item.departamento,
              boeId: item.id,
            },
          });
        }

        this.logger.debug({
          operation: 'boe:fetch_day',
          date: dateStr,
          itemsFound: items.length,
          result: 'success',
        });
      } catch (err) {
        this.logger.warn({
          operation: 'boe:fetch_day',
          date: dateStr,
          result: 'error',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // If no docs found via daily XML, fallback to RSS feed
    if (allDocs.length === 0) {
      this.logger.info({
        operation: 'boe:fetch_days_fallback_rss',
        reason: 'No documents from daily XML API, trying RSS feed',
      });

      try {
        const rssXml = await this.http.fetchText(BOE_RSS_URL);
        const rssItems = parseBoeRssItems(rssXml);

        for (const item of rssItems) {
          allDocs.push({
            externalId: item.guid || item.link,
            title: item.title,
            rawContent: item.description,
            sourceUrl: item.link,
            publishedDate: item.pubDate ? new Date(item.pubDate) : new Date(),
            metadata: {
              feedSource: 'BOE_RSS',
            },
          });
        }

        this.logger.info({
          operation: 'boe:fetch_rss_fallback',
          itemsFound: rssItems.length,
          result: 'success',
        });
      } catch (rssErr) {
        this.logger.warn({
          operation: 'boe:fetch_rss_fallback',
          result: 'error',
          error: rssErr instanceof Error ? rssErr.message : String(rssErr),
        });
      }
    }

    return allDocs;
  }

  /**
   * Fetch full text content of a BOE document by its ID.
   * Uses: https://www.boe.es/diario_boe/xml.php?id=BOE-A-YYYY-XXXX
   */
  async fetchFullText(boeId: string): Promise<string> {
    // Try XML endpoint first, fall back to HTML
    try {
      const xmlUrl = `https://www.boe.es/diario_boe/xml.php?id=${boeId}`;
      const xml = await this.http.fetchText(xmlUrl);

      // Extract text content from XML
      const textMatch = /<texto[^>]*>([\s\S]*?)<\/texto>/i.exec(xml);
      if (textMatch?.[1]) {
        return textMatch[1]
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s{2,}/g, ' ')
          .trim()
          .slice(0, 32_000);
      }
      return xml.replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, 32_000);
    } catch {
      // Fallback to HTML version
      const htmlUrl = `https://www.boe.es/diario_boe/txt.php?id=${boeId}`;
      const html = await this.http.fetchText(htmlUrl);
      return html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim()
        .slice(0, 32_000);
    }
  }

  /**
   * Filter documents by relevance keywords.
   */
  filterByKeywords(docs: readonly RawDocument[]): readonly RawDocument[] {
    return docs.filter((doc) => {
      const lower = doc.title.toLowerCase();
      return RELEVANT_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()));
    });
  }

  // -------------------------------------------------------------------------
  // Standard connector pipeline (fetchDocuments)
  // -------------------------------------------------------------------------

  protected async fetchDocuments(requestId: string): Promise<readonly RawDocument[]> {
    const startTime = Date.now();
    const documents: RawDocument[] = [];

    // Strategy 1: Try the structured XML API for today's BOE
    try {
      const today = new Date().toISOString().split('T')[0]!.replace(/-/g, '');
      const apiUrl = `${BOE_XML_API_URL}${today}`;
      const apiXml = await this.http.fetchText(apiUrl);
      const apiItems = parseBoeApiItems(apiXml);

      for (const item of apiItems) {
        documents.push({
          externalId: item.id || `boe-${today}-${documents.length}`,
          title: item.titulo,
          rawContent: item.titulo,
          sourceUrl: item.urlHtml || item.urlPdf || `${BOE_CONFIG.baseUrl}/diario_boe/`,
          publishedDate: item.fechaPublicacion ? new Date(item.fechaPublicacion) : new Date(),
          metadata: {
            seccion: item.seccion,
            seccionName: MONITORED_SECTIONS[item.seccion] ?? item.seccion,
            departamento: item.departamento,
            boeId: item.id,
          },
        });
      }

      this.logger.info({
        operation: 'boe:fetch_api',
        requestId,
        date: today,
        itemsFound: apiItems.length,
        duration: Date.now() - startTime,
        result: 'success',
      });
    } catch (apiErr) {
      // Strategy 2: Fallback to RSS feed
      this.logger.warn({
        operation: 'boe:fetch_api_fallback',
        requestId,
        reason: apiErr instanceof Error ? apiErr.message : String(apiErr),
        result: 'fallback_to_rss',
      });

      const rssXml = await this.http.fetchText(BOE_RSS_URL);
      const rssItems = parseBoeRssItems(rssXml);

      for (const item of rssItems) {
        documents.push({
          externalId: item.guid || item.link,
          title: item.title,
          rawContent: item.description,
          sourceUrl: item.link,
          publishedDate: item.pubDate ? new Date(item.pubDate) : new Date(),
          metadata: {
            feedSource: 'BOE_RSS',
          },
        });
      }

      this.logger.info({
        operation: 'boe:fetch_rss',
        requestId,
        itemsFound: rssItems.length,
        duration: Date.now() - startTime,
        result: 'success',
      });
    }

    return documents;
  }

  protected async parseDocument(
    raw: RawDocument,
    _requestId: string,
  ): Promise<ParsedRegulation> {
    const seccion = raw.metadata['seccion'] ?? '';
    const affectedAreas = detectBoeAreas(raw.title, seccion);

    return {
      externalDocumentId: raw.externalId,
      title: raw.title,
      summary: raw.rawContent.slice(0, 500),
      rawContent: raw.rawContent,
      effectiveDate: raw.publishedDate,
      publishedDate: raw.publishedDate,
      country: 'ES',
      jurisdiction: 'ES',
      affectedAreas,
      affectedIndustries: detectBoeIndustries(raw.title),
      sourceUrl: raw.sourceUrl,
      language: 'es',
      version: `${raw.externalId}:${raw.publishedDate.toISOString().split('T')[0]!}`,
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function detectBoeAreas(title: string, seccion: string): readonly string[] {
  const upper = title.toUpperCase();
  const areas: string[] = [];

  if (seccion === 'I') areas.push('legislative');
  if (seccion === 'II') areas.push('executive');
  if (seccion === 'III') areas.push('regulatory');

  const keywords: Record<string, readonly string[]> = {
    'fiscal': ['TRIBUT', 'FISCAL', 'IMPUESTO', 'IVA', 'IRPF', 'HACIENDA'],
    'labor': ['LABORAL', 'TRABAJO', 'EMPLEO', 'SEGURIDAD SOCIAL'],
    'corporate': ['MERCANTIL', 'SOCIETAR', 'EMPRESA'],
    'banking': ['BANCO', 'FINANCIER', 'CREDIT', 'CNMV', 'VALORES'],
    'data-protection': ['PROTECCIÓN DE DATOS', 'PRIVACIDAD', 'AEPD'],
    'energy': ['ENERGÍA', 'ELÉCTRIC', 'RENOVABLE', 'EFICIENCIA ENERGÉTICA', 'GAS NATURAL'],
    'environmental': ['MEDIOAMBIENT', 'CLIMÁT', 'TRANSICIÓN ECOLÓG', 'EMISIONES', 'RESIDUOS'],
  };

  for (const [area, kws] of Object.entries(keywords)) {
    if (kws.some((kw) => upper.includes(kw))) {
      areas.push(area);
    }
  }

  return areas.length > 0 ? areas : ['regulatory'];
}

function detectBoeIndustries(title: string): readonly string[] {
  const upper = title.toUpperCase();
  const industries: string[] = [];

  const keywords: Record<string, readonly string[]> = {
    'banking': ['BANCO', 'FINANCIER', 'ENTIDAD DE CRÉDITO'],
    'insurance': ['SEGUROS', 'ASEGURAD'],
    'securities': ['VALORES', 'CNMV', 'MERCADO'],
    'energy': ['ENERGÍA', 'ELÉCTRIC', 'GAS'],
    'telecom': ['TELECOMUNICACION', 'DIGITAL'],
  };

  for (const [industry, kws] of Object.entries(keywords)) {
    if (kws.some((kw) => upper.includes(kw))) {
      industries.push(industry);
    }
  }

  return industries.length > 0 ? industries : ['general'];
}
