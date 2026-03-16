// ============================================================================
// FILE: apps/api/src/routes/sources.ts
// CRUD + trigger + test for regulatory sources. All endpoints require ADMIN.
// ============================================================================

import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import {
  Errors,
  CreateSourceSchema,
  TestSourceSchema,
  PatchSourceSchema,
} from '@regwatch/shared';
import type {
  ManagedRegulatorySource,
  SourceTestResult,
  SourcePreviewDoc,
  SourceTriggerEvent,
  SourceConnectorType,
} from '@regwatch/shared';
import { createServiceLogger } from '../config/logger.js';

const logger = createServiceLogger('route:sources');

// ---------------------------------------------------------------------------
// In-memory store (will be replaced by Prisma/PostgreSQL)
// ---------------------------------------------------------------------------

const sourcesStore: Map<string, ManagedRegulatorySource> = new Map();

// Seed with MVP sources
const MVP_SOURCES: ManagedRegulatorySource[] = [
  {
    id: randomUUID(),
    name: 'SEC EDGAR',
    country: 'US',
    type: 'API',
    status: 'OK',
    lastFetch: new Date(Date.now() - 8 * 60_000),
    docsIndexed: 1247,
    lastError: null,
    frequency: 'every_10min',
    active: true,
    baseUrl: 'https://efts.sec.gov/LATEST/search-index',
    headers: { 'User-Agent': 'RegWatch-AI/1.0 (regwatch@grantthornton.com)' },
    regulatoryArea: 'securities',
    createdAt: new Date('2025-11-01'),
    updatedAt: new Date(),
  },
  {
    id: randomUUID(),
    name: 'EUR-Lex',
    country: 'EU',
    type: 'API',
    status: 'OK',
    lastFetch: new Date(Date.now() - 42 * 60_000),
    docsIndexed: 834,
    lastError: null,
    frequency: 'hourly',
    active: true,
    baseUrl: 'https://eur-lex.europa.eu/eurlex-ws/rest',
    headers: {},
    regulatoryArea: 'financial-regulation',
    createdAt: new Date('2025-11-01'),
    updatedAt: new Date(),
  },
  {
    id: randomUUID(),
    name: 'BOE España',
    country: 'ES',
    type: 'RSS',
    status: 'WARNING',
    lastFetch: new Date(Date.now() - 95 * 60_000),
    docsIndexed: 612,
    lastError: 'Timeout on last 2 attempts (> 30s)',
    frequency: 'hourly',
    active: true,
    baseUrl: 'https://www.boe.es/rss/boe.php',
    headers: {},
    regulatoryArea: 'banking',
    createdAt: new Date('2025-11-15'),
    updatedAt: new Date(),
  },
  {
    id: randomUUID(),
    name: 'DOF México',
    country: 'MX',
    type: 'SCRAPING',
    status: 'OK',
    lastFetch: new Date(Date.now() - 18 * 3600_000),
    docsIndexed: 389,
    lastError: null,
    frequency: 'daily',
    active: true,
    baseUrl: 'https://www.dof.gob.mx',
    headers: {},
    regulatoryArea: 'financial-regulation',
    createdAt: new Date('2025-12-01'),
    updatedAt: new Date(),
  },
  {
    id: randomUUID(),
    name: 'DOU Brasil',
    country: 'BR',
    type: 'SCRAPING',
    status: 'ERROR',
    lastFetch: new Date(Date.now() - 72 * 3600_000),
    docsIndexed: 156,
    lastError: 'HTTP 403 — Cloudflare challenge detected, scraper blocked',
    frequency: 'daily',
    active: false,
    baseUrl: 'https://www.in.gov.br/leiturajornal',
    headers: {},
    regulatoryArea: 'banking',
    createdAt: new Date('2026-01-10'),
    updatedAt: new Date(),
  },
];

for (const s of MVP_SOURCES) {
  sourcesStore.set(s.id, s);
}

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

export interface SourcesRouteDeps {
  readonly scheduler: unknown; // IngestionScheduler — used for trigger
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export function createSourcesRouter(_deps: SourcesRouteDeps): Router {
  const router = Router();

  // -----------------------------------------------------------------------
  // GET /sources — list all sources with status
  // -----------------------------------------------------------------------
  router.get('/sources', (req: Request, res: Response) => {
    const requestId = req.requestId ?? randomUUID();

    logger.info({
      operation: 'sources:list',
      requestId,
      result: 'success',
    });

    const sources = Array.from(sourcesStore.values()).sort(
      (a, b) => a.name.localeCompare(b.name),
    );

    res.json({ data: sources, total: sources.length });
  });

  // -----------------------------------------------------------------------
  // POST /sources — create new source
  // -----------------------------------------------------------------------
  router.post('/sources', (req: Request, res: Response) => {
    const requestId = req.requestId ?? randomUUID();

    const parsed = CreateSourceSchema.safeParse(req.body);
    if (!parsed.success) {
      throw Errors.validation(requestId, parsed.error.issues);
    }

    const input = parsed.data;

    // Check for duplicate name
    for (const existing of sourcesStore.values()) {
      if (existing.name.toLowerCase() === input.name.toLowerCase()) {
        throw Errors.conflict(requestId, `Source with name '${input.name}' already exists`);
      }
    }

    const now = new Date();
    const source: ManagedRegulatorySource = {
      id: randomUUID(),
      name: input.name,
      country: input.country,
      type: input.type,
      status: 'OK',
      lastFetch: null,
      docsIndexed: 0,
      lastError: null,
      frequency: input.frequency,
      active: true,
      baseUrl: input.baseUrl,
      headers: input.headers,
      regulatoryArea: input.regulatoryArea,
      createdAt: now,
      updatedAt: now,
    };

    sourcesStore.set(source.id, source);

    logger.info({
      operation: 'sources:create',
      requestId,
      sourceId: source.id,
      sourceName: source.name,
      sourceType: source.type,
      country: source.country,
      result: 'success',
    });

    res.status(201).json(source);
  });

  // -----------------------------------------------------------------------
  // POST /sources/test — test connection and preview docs
  // -----------------------------------------------------------------------
  router.post('/sources/test', async (req: Request, res: Response) => {
    const requestId = req.requestId ?? randomUUID();

    const parsed = TestSourceSchema.safeParse(req.body);
    if (!parsed.success) {
      throw Errors.validation(requestId, parsed.error.issues);
    }

    const { type, baseUrl, headers } = parsed.data;

    logger.info({
      operation: 'sources:test',
      requestId,
      type,
      baseUrl,
    });

    try {
      const result = await testSourceConnection(type, baseUrl, headers);

      logger.info({
        operation: 'sources:test_complete',
        requestId,
        success: result.success,
        previewCount: result.preview.length,
        result: result.success ? 'success' : 'error',
      });

      res.json(result);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const result: SourceTestResult = {
        success: false,
        statusCode: null,
        errorMessage,
        preview: [],
      };
      res.json(result);
    }
  });

  // -----------------------------------------------------------------------
  // POST /sources/:id/trigger — manual trigger with SSE progress
  // -----------------------------------------------------------------------
  router.post('/sources/:id/trigger', (req: Request, res: Response) => {
    const requestId = req.requestId ?? randomUUID();
    const { id } = req.params;

    const source = sourcesStore.get(id!);
    if (!source) {
      throw Errors.notFound(requestId, 'Source', id!);
    }

    logger.info({
      operation: 'sources:trigger',
      requestId,
      sourceId: id,
      sourceName: source.name,
    });

    // Set up SSE stream
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Request-Id': requestId,
    });

    const sendEvent = (event: SourceTriggerEvent): void => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    // Simulate ingestion pipeline with realistic events
    void simulateIngestion(source, sendEvent).then(() => {
      res.end();
    });

    // Handle client disconnect
    req.on('close', () => {
      logger.debug({
        operation: 'sources:trigger_client_disconnect',
        requestId,
        sourceId: id,
      });
    });
  });

  // -----------------------------------------------------------------------
  // PATCH /sources/:id — update source (activate/deactivate, frequency)
  // -----------------------------------------------------------------------
  router.patch('/sources/:id', (req: Request, res: Response) => {
    const requestId = req.requestId ?? randomUUID();
    const { id } = req.params;

    const source = sourcesStore.get(id!);
    if (!source) {
      throw Errors.notFound(requestId, 'Source', id!);
    }

    const parsed = PatchSourceSchema.safeParse(req.body);
    if (!parsed.success) {
      throw Errors.validation(requestId, parsed.error.issues);
    }

    const updates = parsed.data;
    const updated: ManagedRegulatorySource = {
      ...source,
      ...(updates.active !== undefined ? { active: updates.active } : {}),
      ...(updates.frequency !== undefined ? { frequency: updates.frequency } : {}),
      ...(updates.headers !== undefined ? { headers: updates.headers } : {}),
      updatedAt: new Date(),
    };

    sourcesStore.set(id!, updated);

    logger.info({
      operation: 'sources:patch',
      requestId,
      sourceId: id,
      updates: Object.keys(updates),
      result: 'success',
    });

    res.json(updated);
  });

  // -----------------------------------------------------------------------
  // DELETE /sources/:id — delete source
  // -----------------------------------------------------------------------
  router.delete('/sources/:id', (req: Request, res: Response) => {
    const requestId = req.requestId ?? randomUUID();
    const { id } = req.params;

    const source = sourcesStore.get(id!);
    if (!source) {
      throw Errors.notFound(requestId, 'Source', id!);
    }

    sourcesStore.delete(id!);

    logger.info({
      operation: 'sources:delete',
      requestId,
      sourceId: id,
      sourceName: source.name,
      result: 'success',
    });

    res.status(204).end();
  });

  return router;
}

// ---------------------------------------------------------------------------
// Test connection helper
// ---------------------------------------------------------------------------

async function testSourceConnection(
  type: SourceConnectorType,
  baseUrl: string,
  headers: Record<string, string>,
): Promise<SourceTestResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await fetch(baseUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'RegWatch-AI/1.0 (regwatch@grantthornton.com)',
        ...headers,
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      return {
        success: false,
        statusCode: response.status,
        errorMessage: `HTTP ${response.status} — ${response.statusText}`,
        preview: [],
      };
    }

    const contentType = response.headers.get('content-type') ?? '';
    const body = await response.text();

    // Generate preview based on type
    const preview = extractPreview(type, body, contentType, baseUrl);

    return {
      success: true,
      statusCode: response.status,
      errorMessage: null,
      preview: preview.slice(0, 3),
    };
  } catch (err) {
    const message = err instanceof Error
      ? err.name === 'AbortError'
        ? 'Connection timeout (15s)'
        : err.message
      : String(err);

    return {
      success: false,
      statusCode: null,
      errorMessage: message,
      preview: [],
    };
  } finally {
    clearTimeout(timeout);
  }
}

function extractPreview(
  type: SourceConnectorType,
  body: string,
  contentType: string,
  baseUrl: string,
): SourcePreviewDoc[] {
  const docs: SourcePreviewDoc[] = [];

  if (type === 'RSS' || contentType.includes('xml') || contentType.includes('rss')) {
    // Basic XML/RSS parsing — extract <item> or <entry> elements
    const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi;
    let match: RegExpExecArray | null;
    while ((match = itemRegex.exec(body)) !== null && docs.length < 3) {
      const item = match[1]!;
      const title = extractXmlTag(item, 'title') ?? 'Untitled';
      const link = extractXmlTag(item, 'link') ?? baseUrl;
      const date = extractXmlTag(item, 'pubDate') ?? extractXmlTag(item, 'dc:date') ?? '';
      const desc = extractXmlTag(item, 'description') ?? '';
      docs.push({
        title,
        date,
        url: link,
        snippet: desc.replace(/<[^>]*>/g, '').slice(0, 200),
      });
    }
  } else if (contentType.includes('json')) {
    // Try to parse JSON and extract document-like entries
    try {
      const json = JSON.parse(body);
      const items = Array.isArray(json) ? json : json.results ?? json.hits?.hits ?? json.data ?? [];
      for (const item of items.slice(0, 3)) {
        docs.push({
          title: item.title ?? item.name ?? item._source?.file_description ?? 'Document',
          date: item.date ?? item.publishedDate ?? item._source?.file_date ?? '',
          url: item.url ?? item.link ?? baseUrl,
          snippet: (item.summary ?? item.description ?? item.content ?? JSON.stringify(item)).slice(0, 200),
        });
      }
    } catch {
      docs.push({
        title: 'JSON Response',
        date: new Date().toISOString(),
        url: baseUrl,
        snippet: body.slice(0, 200),
      });
    }
  } else {
    // HTML / plain text — just show a snippet
    docs.push({
      title: 'Response from source',
      date: new Date().toISOString(),
      url: baseUrl,
      snippet: body.replace(/<[^>]*>/g, '').trim().slice(0, 200),
    });
  }

  return docs;
}

function extractXmlTag(xml: string, tag: string): string | null {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const match = regex.exec(xml);
  return match ? match[1]!.trim() : null;
}

// ---------------------------------------------------------------------------
// Simulate ingestion pipeline (SSE events)
// ---------------------------------------------------------------------------

async function simulateIngestion(
  source: ManagedRegulatorySource,
  sendEvent: (event: SourceTriggerEvent) => void,
): Promise<void> {
  const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
  const startTime = Date.now();

  sendEvent({
    event: 'fetch_start',
    source: source.name,
    timestamp: new Date().toISOString(),
  });
  await sleep(800 + Math.random() * 1200);

  const docsCount = 3 + Math.floor(Math.random() * 12);
  sendEvent({
    event: 'docs_fetched',
    source: source.name,
    timestamp: new Date().toISOString(),
    count: docsCount,
  });
  await sleep(500 + Math.random() * 800);

  const changesCount = Math.max(1, Math.floor(docsCount * 0.4));
  const impactLevels: Array<'HIGH' | 'MEDIUM' | 'LOW'> = ['HIGH', 'MEDIUM', 'LOW'];
  const impact = impactLevels[Math.floor(Math.random() * 3)]!;
  sendEvent({
    event: 'changes_detected',
    source: source.name,
    timestamp: new Date().toISOString(),
    count: changesCount,
    impactLevel: impact,
  });
  await sleep(1200 + Math.random() * 1500);

  const cached = Math.floor(changesCount * 0.3);
  sendEvent({
    event: 'embeddings_generated',
    source: source.name,
    timestamp: new Date().toISOString(),
    count: changesCount,
    cached,
  });
  await sleep(600 + Math.random() * 800);

  const alertsCount = impact === 'HIGH' ? changesCount : Math.floor(changesCount * 0.5);
  sendEvent({
    event: 'alerts_triggered',
    source: source.name,
    timestamp: new Date().toISOString(),
    count: alertsCount,
  });
  await sleep(300);

  sendEvent({
    event: 'complete',
    source: source.name,
    timestamp: new Date().toISOString(),
    duration_ms: Date.now() - startTime,
    status: 'OK',
  });

  // Update source status in store
  const updated: ManagedRegulatorySource = {
    ...source,
    lastFetch: new Date(),
    docsIndexed: source.docsIndexed + changesCount,
    status: 'OK',
    lastError: null,
    updatedAt: new Date(),
  };
  sourcesStore.set(source.id, updated);
}
