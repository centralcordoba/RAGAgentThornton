// ============================================================================
// FILE: apps/api/src/jobs/ingestion/connectors/DouBrazilConnector.ts
// DOU (Diário Oficial da União) Brazil connector — keyword search + RSS.
// Polling: every 1 hour.
//
// Real data endpoints (no API key required):
//   - Search:   https://www.in.gov.br/consulta/-/buscar/dou?q={keyword}&s=todos
//   - RSS:      https://www.in.gov.br/rss/dou/-/secao-1  (Seção 1 — Atos normativos)
//   - Detail:   https://www.in.gov.br/web/dou/-/{slug}
//
// Note: DOU search API may return HTML rather than JSON.
// We use RSS as primary source and keyword search as supplemental.
// ============================================================================

import { BaseIngestionJob } from '../BaseIngestionJob.js';
import { RateLimitedHttpClient } from './httpClient.js';
import type { RawDocument, ParsedRegulation, IngestionSourceConfig } from '../types.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DOU_CONFIG: IngestionSourceConfig = {
  sourceName: 'DOU_BRAZIL',
  country: 'BR',
  jurisdiction: 'BR',
  baseUrl: 'https://www.in.gov.br',
  checkIntervalMinutes: 60,
  maxRequestsPerSecond: 3,
};

/** DOU section RSS feeds. */
const DOU_RSS_URLS = [
  'https://www.in.gov.br/rss/dou/-/secao-1',  // Atos Normativos
  'https://www.in.gov.br/rss/dou/-/secao-3',  // Editais, Contratos
] as const;

/**
 * Keywords for filtering relevant DOU documents.
 */
export const DOU_KEYWORDS = [
  'ativos virtuais', 'VASP', 'criptoativos', 'BCB',
  'LGPD', 'proteção dados', 'ANPD',
  'CVM', 'sustentabilidade', 'ESG', 'ISSB',
  'imposto mínimo global', 'Pilar Dois',
  'mercado de capitais', 'valores mobiliários',
  'lavagem dinheiro', 'compliance',
] as const;

/**
 * Brazil regulation definitions for the GT demo.
 */
export const BRAZIL_REGULATIONS = [
  {
    id: 'bcb-vasp-2025',
    title: 'Marco Legal Criptoativos — Resoluções BCB nº 519, 520, 521',
    summary: 'Regulamentação do mercado de ativos virtuais pelo Banco Central do Brasil. Estabelece requisitos de autorização, capital mínimo, governança e prevenção à lavagem de dinheiro para prestadoras de serviços de ativos virtuais (VASPs). Vigência: novembro 2025.',
    effectiveDate: '2025-11-10',
    publishedDate: '2025-06-30',
    areas: ['digital-finance', 'banking', 'aml'],
    industries: ['banking', 'fintech', 'securities'],
    keywords: ['ativos virtuais', 'VASP', 'criptoativos BCB', 'resolução BCB 519'],
    deadlines: [
      { title: 'VASPs em operação — solicitar autorização BCB', date: '2026-06-10', status: 'PENDING' as const },
      { title: 'Adequação capital mínimo VASPs', date: '2026-11-10', status: 'PENDING' as const },
    ],
  },
  {
    id: 'lgpd-anpd-2025',
    title: 'LGPD — Programa de Fiscalização ANPD 2025',
    summary: 'Programa anual de fiscalização da Autoridade Nacional de Proteção de Dados (ANPD). Foco em setores de saúde, financeiro e telecomunicações. Inclui obrigatoriedade de nomeação de DPO para empresas de médio porte e relatórios de impacto (RIPD) para tratamento de alto risco.',
    effectiveDate: '2025-09-18',
    publishedDate: '2025-03-01',
    areas: ['data-protection', 'compliance'],
    industries: ['banking', 'fintech', 'insurance', 'public-companies'],
    keywords: ['LGPD', 'proteção dados pessoais', 'ANPD fiscalização', 'DPO'],
    deadlines: [
      { title: 'Nomeação DPO obrigatório — empresas médio porte', date: '2026-01-01', status: 'PENDING' as const },
      { title: 'Relatório Impacto Proteção Dados (RIPD) — alto risco', date: '2026-03-01', status: 'PENDING' as const },
    ],
  },
  {
    id: 'cvm-esg-193',
    title: 'CVM Resolução 193 — ESG Disclosure alinhado ISSB',
    summary: 'Resolução CVM nº 193 que estabelece requisitos de divulgação de informações de sustentabilidade alinhados com os padrões ISSB (IFRS S1 e S2). Aplicável a companhias abertas. Primeira divulgação obrigatória para grandes empresas em junho 2026.',
    effectiveDate: '2025-01-01',
    publishedDate: '2024-10-22',
    areas: ['sustainability', 'securities', 'disclosure'],
    industries: ['public-companies', 'financial-services', 'energy'],
    keywords: ['CVM resolução 193', 'ISSB sustentabilidade', 'divulgação ESG CVM'],
    deadlines: [
      { title: 'Primeira divulgação ESG alinhada ISSB — grandes empresas', date: '2026-06-30', status: 'PENDING' as const },
    ],
  },
] as const;

// ---------------------------------------------------------------------------
// XML parsing helpers
// ---------------------------------------------------------------------------

interface RssItem {
  readonly title: string;
  readonly link: string;
  readonly description: string;
  readonly pubDate: string;
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
      guid: extractTag(block, 'guid'),
    });
  }

  return items;
}

function extractTag(xml: string, tag: string): string {
  const regex = new RegExp(
    `<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>|<${tag}[^>]*>([\\s\\S]*?)</${tag}>`,
  );
  const match = regex.exec(xml);
  if (!match) return '';
  return (match[1] ?? match[2] ?? '').trim();
}

// ---------------------------------------------------------------------------
// DouBrazilConnector
// ---------------------------------------------------------------------------

export class DouBrazilConnector extends BaseIngestionJob {
  private readonly http: RateLimitedHttpClient;

  constructor(config: Partial<IngestionSourceConfig> = {}) {
    super({ ...DOU_CONFIG, ...config });
    this.http = new RateLimitedHttpClient('DOU_BRAZIL', {
      maxRequestsPerSecond: DOU_CONFIG.maxRequestsPerSecond,
    });
  }

  // -------------------------------------------------------------------------
  // Keyword-based fetcher (for seed scripts)
  // -------------------------------------------------------------------------

  /**
   * Fetch DOU documents matching keywords from RSS feeds.
   * Filters the RSS items by keyword relevance.
   */
  async fetchByKeywords(
    keywords: readonly string[],
    _days = 30,
  ): Promise<readonly RawDocument[]> {
    const allDocs: RawDocument[] = [];

    for (const rssUrl of DOU_RSS_URLS) {
      try {
        const xml = await this.http.fetchText(rssUrl);
        const items = parseRssItems(xml);

        for (const item of items) {
          const combined = `${item.title} ${item.description}`.toLowerCase();
          const matches = keywords.some((kw) => combined.includes(kw.toLowerCase()));
          if (!matches) continue;

          allDocs.push({
            externalId: item.guid || item.link,
            title: item.title,
            rawContent: item.description,
            sourceUrl: item.link,
            publishedDate: item.pubDate ? new Date(item.pubDate) : new Date(),
            metadata: {
              feedSource: 'DOU_RSS',
              matchedKeywords: keywords.filter((kw) => combined.includes(kw.toLowerCase())).join(','),
            },
          });
        }

        this.logger.debug({
          operation: 'dou:fetch_rss',
          rssUrl,
          totalItems: items.length,
          matchedItems: allDocs.length,
          result: 'success',
        });
      } catch (err) {
        this.logger.warn({
          operation: 'dou:fetch_rss',
          rssUrl,
          result: 'error',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return allDocs;
  }

  /**
   * Fetch full text from a DOU article URL.
   */
  async fetchFullText(url: string): Promise<string> {
    try {
      const html = await this.http.fetchText(url);
      return html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
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

  /**
   * Filter documents by relevance keywords.
   */
  filterByKeywords(docs: readonly RawDocument[]): readonly RawDocument[] {
    return docs.filter((doc) => {
      const lower = `${doc.title} ${doc.rawContent}`.toLowerCase();
      return DOU_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()));
    });
  }

  // -------------------------------------------------------------------------
  // Standard connector pipeline
  // -------------------------------------------------------------------------

  protected async fetchDocuments(requestId: string): Promise<readonly RawDocument[]> {
    const startTime = Date.now();
    const documents: RawDocument[] = [];

    // Fetch from RSS feeds
    for (const rssUrl of DOU_RSS_URLS) {
      try {
        const xml = await this.http.fetchText(rssUrl);
        const items = parseRssItems(xml);

        for (const item of items) {
          documents.push({
            externalId: item.guid || item.link,
            title: item.title,
            rawContent: item.description,
            sourceUrl: item.link,
            publishedDate: item.pubDate ? new Date(item.pubDate) : new Date(),
            metadata: {
              feedSource: 'DOU_RSS',
            },
          });
        }
      } catch (err) {
        this.logger.warn({
          operation: 'dou:fetch_rss',
          requestId,
          rssUrl,
          result: 'error',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Filter by relevance
    const relevant = this.filterByKeywords(documents);

    this.logger.info({
      operation: 'dou:fetch_complete',
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
    const affectedAreas = detectDouAreas(raw.title, raw.rawContent);
    const affectedIndustries = detectDouIndustries(raw.title, raw.rawContent);

    return {
      externalDocumentId: raw.externalId,
      title: raw.title,
      summary: raw.rawContent.slice(0, 500),
      rawContent: raw.rawContent,
      effectiveDate: raw.publishedDate,
      publishedDate: raw.publishedDate,
      country: 'BR',
      jurisdiction: 'BR',
      affectedAreas,
      affectedIndustries,
      sourceUrl: raw.sourceUrl,
      language: 'pt',
      version: `${raw.externalId}:${raw.publishedDate.toISOString().split('T')[0]!}`,
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function detectDouAreas(title: string, content: string): readonly string[] {
  const combined = `${title} ${content}`.toUpperCase();
  const areas: string[] = [];

  const keywords: Record<string, readonly string[]> = {
    'digital-finance': ['ATIVO VIRTUAL', 'VASP', 'CRIPTOATIVO', 'FINTECH'],
    'banking': ['BCB', 'BANCO CENTRAL', 'RESOLUÇÃO BCB', 'CRÉDITO'],
    'data-protection': ['LGPD', 'PROTEÇÃO DE DADOS', 'ANPD', 'DPO'],
    'securities': ['CVM', 'VALORES MOBILIÁRIOS', 'B3', 'COMPANHIA ABERTA'],
    'sustainability': ['ESG', 'SUSTENTABILIDADE', 'ISSB', 'CLIMÁTICO'],
    'fiscal': ['RECEITA FEDERAL', 'TRIBUT', 'IRPJ', 'CSLL', 'PIS', 'COFINS'],
    'aml': ['LAVAGEM', 'COAF', 'PLD/FT', 'COMPLIANCE'],
    'labor': ['CLT', 'TRABALHO', 'EMPREGO', 'FGTS'],
  };

  for (const [area, kws] of Object.entries(keywords)) {
    if (kws.some((kw) => combined.includes(kw))) {
      areas.push(area);
    }
  }

  return areas.length > 0 ? areas : ['regulatory'];
}

function detectDouIndustries(title: string, content: string): readonly string[] {
  const combined = `${title} ${content}`.toUpperCase();
  const industries: string[] = [];

  const keywords: Record<string, readonly string[]> = {
    'banking': ['BANCO', 'BCB', 'CRÉDITO', 'FINANCEIRA'],
    'fintech': ['FINTECH', 'ATIVO VIRTUAL', 'VASP', 'PAGAMENTO'],
    'insurance': ['SEGUROS', 'SUSEP', 'PREVIDÊNCIA'],
    'securities': ['CVM', 'VALORES', 'B3', 'BOLSA'],
    'energy': ['ENERGIA', 'ANEEL', 'PETRÓLEO', 'ANP'],
  };

  for (const [industry, kws] of Object.entries(keywords)) {
    if (kws.some((kw) => combined.includes(kw))) {
      industries.push(industry);
    }
  }

  return industries.length > 0 ? industries : ['general'];
}
