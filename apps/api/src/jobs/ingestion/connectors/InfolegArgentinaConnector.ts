// ============================================================================
// FILE: apps/api/src/jobs/ingestion/connectors/InfolegArgentinaConnector.ts
// Infoleg (Informacion Legislativa y Documental) Argentina connector.
// Monitors Argentina's official legal information system.
// Polling: every 1 hour.
//
// Real data endpoints (no API key required):
//   - Search:  https://www.infoleg.gob.ar/infolegInternet/buscarNormas.do
//   - Detail:  https://www.infoleg.gob.ar/infolegInternet/verNorma.do?id={id}
//   - RSS:     https://www.boletinoficial.gob.ar/seccion/primera (BO feed)
//
// Also monitors Boletin Oficial de la Republica Argentina:
//   - Index:   https://www.boletinoficial.gob.ar/seccion/primera
//   - Detail:  https://www.boletinoficial.gob.ar/detalleAviso/primera/{id}
// ============================================================================

import { BaseIngestionJob } from '../BaseIngestionJob.js';
import { RateLimitedHttpClient } from './httpClient.js';
import type { RawDocument, ParsedRegulation, IngestionSourceConfig } from '../types.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const INFOLEG_CONFIG: IngestionSourceConfig = {
  sourceName: 'INFOLEG_ARGENTINA',
  country: 'AR',
  jurisdiction: 'AR-FED',
  baseUrl: 'https://www.boletinoficial.gob.ar',
  checkIntervalMinutes: 60,
  maxRequestsPerSecond: 3,
};

/** Boletin Oficial sections to monitor. */
const BO_SECTIONS = [
  { path: '/seccion/primera', name: 'Primera Seccion — Legislacion y Avisos Oficiales' },
  { path: '/seccion/segunda', name: 'Segunda Seccion — Sociedades' },
] as const;

/**
 * Keywords for filtering relevant Argentine regulatory documents.
 */
export const ARGENTINA_KEYWORDS = [
  // Fiscal / impositivo
  'AFIP', 'impuesto', 'ganancias', 'IVA', 'monotributo', 'retención',
  'percepción', 'factura electrónica', 'resolución general',
  // Financiero / bancario
  'BCRA', 'Banco Central', 'comunicación BCRA', 'encaje', 'tipo de cambio',
  'mercado de capitales', 'CNV', 'Comisión Nacional de Valores',
  // Laboral
  'MTESS', 'Ministerio de Trabajo', 'convenio colectivo', 'salario mínimo',
  'contribuciones patronales', 'ART', 'riesgos del trabajo',
  // Societario / corporativo
  'IGJ', 'Inspección General de Justicia', 'sociedad anónima',
  'UIF', 'lavado de activos', 'sujeto obligado',
  // Datos personales
  'datos personales', 'AAIP', 'habeas data',
  // Comercio exterior
  'aduana', 'exportación', 'importación', 'ARCA',
  // ESG / sustentabilidad
  'sustentabilidad', 'ESG', 'ambiental',
] as const;

/**
 * Argentine regulation definitions for GT demo.
 */
export const ARGENTINA_REGULATIONS = [
  {
    id: 'afip-factura-electronica-2025',
    title: 'AFIP RG 5616/2025 — Facturación Electrónica Obligatoria para Todos los Contribuyentes',
    summary: 'La Administración Federal de Ingresos Públicos (AFIP/ARCA) establece la obligatoriedad de facturación electrónica para todos los contribuyentes sin excepción, eliminando regímenes de excepción para pequeños contribuyentes y monotributistas categoría A y B. Implementación gradual desde marzo 2026.',
    effectiveDate: '2026-03-01',
    publishedDate: '2025-11-15',
    areas: ['fiscal', 'compliance'],
    industries: ['general', 'retail', 'services'],
    keywords: ['factura electrónica', 'AFIP', 'monotributo', 'RG 5616'],
    deadlines: [
      { title: 'Adecuación sistemas facturación — monotributistas A/B', date: '2026-06-01', status: 'PENDING' as const },
      { title: 'Cumplimiento total facturación electrónica', date: '2026-09-01', status: 'PENDING' as const },
    ],
  },
  {
    id: 'bcra-regulacion-fintech-2025',
    title: 'BCRA Com. A 7890 — Regulación de Proveedores de Servicios de Pago (PSP)',
    summary: 'El Banco Central de la República Argentina establece nuevos requisitos de capital mínimo, gobernanza y prevención de lavado de activos para Proveedores de Servicios de Pago (PSP) y billeteras virtuales. Incluye obligaciones de interoperabilidad y protección de fondos de usuarios.',
    effectiveDate: '2025-08-01',
    publishedDate: '2025-04-15',
    areas: ['banking', 'digital-finance', 'aml'],
    industries: ['banking', 'fintech', 'payments'],
    keywords: ['BCRA', 'PSP', 'billetera virtual', 'fintech', 'Com. A 7890'],
    deadlines: [
      { title: 'Adecuación capital mínimo PSP', date: '2026-02-01', status: 'PENDING' as const },
      { title: 'Interoperabilidad plena billeteras', date: '2026-08-01', status: 'PENDING' as const },
    ],
  },
  {
    id: 'cnv-esg-disclosure-2025',
    title: 'CNV RG 963 — Reporte de Sustentabilidad Obligatorio para Emisoras',
    summary: 'La Comisión Nacional de Valores requiere que todas las sociedades emisoras presenten un Reporte de Sustentabilidad alineado con estándares ISSB (IFRS S1/S2). Incluye divulgación de riesgos climáticos, métricas de gobernanza y cadena de valor. Primera presentación obligatoria ejercicio 2026.',
    effectiveDate: '2026-01-01',
    publishedDate: '2025-07-20',
    areas: ['sustainability', 'securities', 'disclosure'],
    industries: ['public-companies', 'financial-services', 'energy'],
    keywords: ['CNV', 'sustentabilidad', 'ESG', 'ISSB', 'reporte'],
    deadlines: [
      { title: 'Primer Reporte Sustentabilidad obligatorio — grandes emisoras', date: '2026-12-31', status: 'PENDING' as const },
    ],
  },
  {
    id: 'uif-sujetos-obligados-2025',
    title: 'UIF Resolución 112/2025 — Actualización Régimen Sujetos Obligados PLA/FT',
    summary: 'La Unidad de Información Financiera actualiza el régimen de Prevención de Lavado de Activos y Financiamiento del Terrorismo (PLA/FT). Incorpora nuevas categorías de sujetos obligados incluyendo proveedores de servicios de activos virtuales (VASP) y amplía las obligaciones de debida diligencia reforzada.',
    effectiveDate: '2025-10-01',
    publishedDate: '2025-06-10',
    areas: ['aml', 'compliance', 'digital-finance'],
    industries: ['banking', 'fintech', 'insurance', 'securities'],
    keywords: ['UIF', 'lavado de activos', 'sujetos obligados', 'VASP', 'PLA/FT'],
    deadlines: [
      { title: 'Registro VASP ante UIF', date: '2026-04-01', status: 'PENDING' as const },
      { title: 'Implementación debida diligencia reforzada', date: '2026-07-01', status: 'PENDING' as const },
    ],
  },
] as const;

// ---------------------------------------------------------------------------
// HTML parsing helpers
// ---------------------------------------------------------------------------

interface BoletinEntry {
  readonly title: string;
  readonly url: string;
  readonly section: string;
  readonly organism: string;
}

/**
 * Parse the Boletin Oficial section page (HTML).
 * Extracts article links from the daily listing.
 */
function parseBoletinPage(html: string, baseUrl: string): readonly BoletinEntry[] {
  const entries: BoletinEntry[] = [];

  // BO uses structured divs with article links
  const articleRegex =
    /<a[^>]+href="([^"]*detalleAviso[^"]*|[^"]*verNorma[^"]*)"[^>]*>([^<]+)<\/a>/gi;

  let currentSection = '';
  let currentOrganism = '';

  const sectionRegex = /<h[23][^>]*>([^<]+)<\/h[23]>/gi;
  const orgRegex = /<(?:span|p|div)[^>]*class="[^"]*organismo[^"]*"[^>]*>([^<]+)<\/(?:span|p|div)>/gi;

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
// InfolegArgentinaConnector
// ---------------------------------------------------------------------------

export class InfolegArgentinaConnector extends BaseIngestionJob {
  private readonly http: RateLimitedHttpClient;

  constructor(config: Partial<IngestionSourceConfig> = {}) {
    super({ ...INFOLEG_CONFIG, ...config });
    this.http = new RateLimitedHttpClient('INFOLEG_ARGENTINA', {
      maxRequestsPerSecond: INFOLEG_CONFIG.maxRequestsPerSecond,
    });
  }

  // -------------------------------------------------------------------------
  // Standard connector pipeline
  // -------------------------------------------------------------------------

  protected async fetchDocuments(requestId: string): Promise<readonly RawDocument[]> {
    const startTime = Date.now();
    const documents: RawDocument[] = [];

    // Strategy 1: Fetch from Boletin Oficial sections
    for (const section of BO_SECTIONS) {
      try {
        const html = await this.http.fetchText(`${INFOLEG_CONFIG.baseUrl}${section.path}`);
        const entries = parseBoletinPage(html, INFOLEG_CONFIG.baseUrl);

        for (const entry of entries) {
          documents.push({
            externalId: entry.url,
            title: entry.title,
            rawContent: entry.title,
            sourceUrl: entry.url,
            publishedDate: new Date(),
            metadata: {
              section: entry.section,
              organism: entry.organism,
              source: 'BOLETIN_OFICIAL',
            },
          });
        }

        this.logger.debug({
          operation: 'infoleg:fetch_bo_section',
          requestId,
          section: section.name,
          entriesFound: entries.length,
          result: 'success',
        });
      } catch (err) {
        this.logger.warn({
          operation: 'infoleg:fetch_bo_section',
          requestId,
          section: section.name,
          result: 'error',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Strategy 2: Search Infoleg for recent norms
    try {
      const searchUrl = 'https://www.infoleg.gob.ar/infolegInternet/buscarNormas.do';
      const html = await this.http.fetchText(searchUrl);
      const infolegEntries = parseInfolegSearchResults(html);

      for (const entry of infolegEntries) {
        documents.push({
          externalId: entry.id,
          title: entry.title,
          rawContent: entry.summary,
          sourceUrl: entry.url,
          publishedDate: entry.date,
          metadata: {
            normType: entry.normType,
            source: 'INFOLEG',
          },
        });
      }
    } catch (err) {
      this.logger.warn({
        operation: 'infoleg:fetch_search',
        requestId,
        result: 'error',
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // Filter by relevance keywords
    const relevant = this.filterByKeywords(documents);

    this.logger.info({
      operation: 'infoleg:fetch_complete',
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
    // Try to fetch full text for BO articles
    let fullContent = raw.rawContent;
    if (raw.sourceUrl.includes('detalleAviso') || raw.sourceUrl.includes('verNorma')) {
      try {
        fullContent = await this.fetchFullText(raw.sourceUrl);
      } catch {
        // Keep original content on failure
      }
    }

    const affectedAreas = detectArgentinaAreas(raw.title, fullContent);
    const affectedIndustries = detectArgentinaIndustries(
      raw.metadata['organism'] ?? '',
      raw.title,
    );

    return {
      externalDocumentId: raw.externalId,
      title: raw.title,
      summary: fullContent.slice(0, 500),
      rawContent: fullContent,
      effectiveDate: raw.publishedDate,
      publishedDate: raw.publishedDate,
      country: 'AR',
      jurisdiction: 'AR-FED',
      affectedAreas,
      affectedIndustries,
      sourceUrl: raw.sourceUrl,
      language: 'es',
      version: `${raw.externalId}:${raw.publishedDate.toISOString().split('T')[0]!}`,
    };
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  /** Fetch full text from a Boletin Oficial or Infoleg article URL. */
  async fetchFullText(url: string): Promise<string> {
    try {
      const html = await this.http.fetchText(url);
      return html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&aacute;/gi, 'a')
        .replace(/&eacute;/gi, 'e')
        .replace(/&iacute;/gi, 'i')
        .replace(/&oacute;/gi, 'o')
        .replace(/&uacute;/gi, 'u')
        .replace(/&ntilde;/gi, 'n')
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
      return ARGENTINA_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()));
    });
  }
}

// ---------------------------------------------------------------------------
// Infoleg search result parser
// ---------------------------------------------------------------------------

interface InfolegResult {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly url: string;
  readonly date: Date;
  readonly normType: string;
}

function parseInfolegSearchResults(html: string): readonly InfolegResult[] {
  const results: InfolegResult[] = [];

  // Infoleg lists norms with links to verNorma.do?id=XXX
  const normRegex = /<a[^>]+href="[^"]*verNorma\.do\?id=(\d+)"[^>]*>([^<]+)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = normRegex.exec(html)) !== null && results.length < 50) {
    const id = match[1]!;
    const title = match[2]!.trim();

    results.push({
      id: `infoleg-${id}`,
      title,
      summary: title,
      url: `https://www.infoleg.gob.ar/infolegInternet/verNorma.do?id=${id}`,
      date: new Date(),
      normType: detectNormType(title),
    });
  }

  return results;
}

function detectNormType(title: string): string {
  const upper = title.toUpperCase();
  if (upper.includes('LEY')) return 'LEY';
  if (upper.includes('DECRETO')) return 'DECRETO';
  if (upper.includes('RESOLUCIÓN GENERAL') || upper.includes('RESOLUCION GENERAL')) return 'RESOLUCION_GENERAL';
  if (upper.includes('RESOLUCIÓN') || upper.includes('RESOLUCION')) return 'RESOLUCION';
  if (upper.includes('DISPOSICIÓN') || upper.includes('DISPOSICION')) return 'DISPOSICION';
  if (upper.includes('COMUNICACIÓN') || upper.includes('COMUNICACION')) return 'COMUNICACION';
  return 'NORMA';
}

// ---------------------------------------------------------------------------
// Area / Industry detection
// ---------------------------------------------------------------------------

function detectArgentinaAreas(title: string, content: string): readonly string[] {
  const combined = `${title} ${content}`.toUpperCase();
  const areas: string[] = [];

  const keywords: Record<string, readonly string[]> = {
    'fiscal': ['AFIP', 'ARCA', 'IMPUESTO', 'GANANCIAS', 'IVA', 'MONOTRIBUTO', 'RETENCIÓN', 'PERCEPCIÓN', 'FACTURA', 'TRIBUTAR'],
    'banking': ['BCRA', 'BANCO CENTRAL', 'COMUNICACIÓN A', 'ENCAJE', 'ENTIDAD FINANCIERA'],
    'securities': ['CNV', 'COMISIÓN NACIONAL DE VALORES', 'EMISORA', 'OFERTA PÚBLICA'],
    'labor': ['MTESS', 'MINISTERIO DE TRABAJO', 'CONVENIO COLECTIVO', 'SALARIO', 'ART', 'RIESGO'],
    'corporate': ['IGJ', 'INSPECCIÓN GENERAL', 'SOCIEDAD ANÓNIMA', 'SRL', 'SOCIETAR'],
    'aml': ['UIF', 'LAVADO', 'FINANCIAMIENTO DEL TERRORISMO', 'PLA/FT', 'SUJETO OBLIGADO'],
    'data-protection': ['DATOS PERSONALES', 'AAIP', 'HABEAS DATA', 'PRIVACIDAD'],
    'digital-finance': ['FINTECH', 'PSP', 'BILLETERA VIRTUAL', 'ACTIVO VIRTUAL', 'CRIPTO'],
    'trade': ['ADUANA', 'EXPORTACIÓN', 'IMPORTACIÓN', 'COMERCIO EXTERIOR'],
    'sustainability': ['SUSTENTABILIDAD', 'ESG', 'AMBIENTAL', 'CLIMÁTICO'],
  };

  for (const [area, kws] of Object.entries(keywords)) {
    if (kws.some((kw) => combined.includes(kw))) {
      areas.push(area);
    }
  }

  return areas.length > 0 ? areas : ['regulatory'];
}

function detectArgentinaIndustries(organism: string, title: string): readonly string[] {
  const combined = `${organism} ${title}`.toUpperCase();
  const industries: string[] = [];

  const keywords: Record<string, readonly string[]> = {
    'banking': ['BCRA', 'BANCO', 'FINANCIER', 'CRÉDITO'],
    'fintech': ['FINTECH', 'PSP', 'BILLETERA', 'PAGO ELECTRÓNICO'],
    'insurance': ['SEGUROS', 'SSN', 'SUPERINTENDENCIA DE SEGUROS'],
    'securities': ['CNV', 'VALORES', 'BOLSA', 'BYMA'],
    'energy': ['ENERGÍA', 'ENARGAS', 'ENRE', 'CAMMESA'],
    'mining': ['MINERÍA', 'LITIO'],
    'agriculture': ['AGRO', 'SENASA', 'AGRICULTURA'],
  };

  for (const [industry, kws] of Object.entries(keywords)) {
    if (kws.some((kw) => combined.includes(kw))) {
      industries.push(industry);
    }
  }

  return industries.length > 0 ? industries : ['general'];
}
