// ============================================================================
// FILE: apps/api/src/jobs/ingestion/connectors/BoeSpainConnector.ts
// BOE (Boletín Oficial del Estado) Spain connector — XML feed.
// Filters: Section I (leyes), II (decretos), III (resoluciones).
// Polling: every 1 hour.
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
    'environmental': ['MEDIOAMBIENT', 'CLIMÁT', 'TRANSICIÓN ECOLÓG'],
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
