// ============================================================================
// FILE: apps/api/src/routes/chat.ts
// POST /api/chat — conversational RAG query with SSE streaming.
// ============================================================================

import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import type { PrismaClient } from '@prisma/client';
import { ChatRequestSchema, Errors } from '@regwatch/shared';
import type { RegulatoryRAG, ComplianceAgent } from '@regwatch/ai-core';
import type { RAGQueryInput } from '@regwatch/ai-core';
import { createServiceLogger } from '../config/logger.js';

const logger = createServiceLogger('route:chat');

// ---------------------------------------------------------------------------
// Conversation store — Redis-backed with in-memory fallback
// ---------------------------------------------------------------------------

interface ConversationEntry {
  readonly role: 'user' | 'assistant';
  readonly content: string;
  readonly timestamp: string;
}

const CONVERSATION_TTL = 86_400; // 24 hours
const CONVERSATION_MAX_ENTRIES = 100;

interface ConversationStore {
  get(conversationId: string): Promise<ConversationEntry[]>;
  set(conversationId: string, entries: ConversationEntry[]): Promise<void>;
}

function createRedisConversationStore(redis: Redis): ConversationStore {
  return {
    async get(conversationId: string): Promise<ConversationEntry[]> {
      const key = `conv:${conversationId}`;
      const raw = await redis.get(key);
      if (!raw) return [];
      return JSON.parse(raw) as ConversationEntry[];
    },
    async set(conversationId: string, entries: ConversationEntry[]): Promise<void> {
      const key = `conv:${conversationId}`;
      const trimmed = entries.length > CONVERSATION_MAX_ENTRIES
        ? entries.slice(-CONVERSATION_MAX_ENTRIES)
        : entries;
      await redis.set(key, JSON.stringify(trimmed), 'EX', CONVERSATION_TTL);
    },
  };
}

function createInMemoryConversationStore(): ConversationStore {
  const store = new Map<string, ConversationEntry[]>();
  return {
    async get(conversationId: string): Promise<ConversationEntry[]> {
      return store.get(conversationId) ?? [];
    },
    async set(conversationId: string, entries: ConversationEntry[]): Promise<void> {
      const trimmed = entries.length > CONVERSATION_MAX_ENTRIES
        ? entries.slice(-CONVERSATION_MAX_ENTRIES)
        : entries;
      store.set(conversationId, trimmed);
    },
  };
}

let conversationStore: ConversationStore | null = null;

/**
 * Creates a Redis-backed conversation store with automatic in-memory fallback.
 * If Redis is unavailable, operations silently fall back to the memory store.
 */
function createResilientRedisConversationStore(redisUrl: string): ConversationStore {
  const memoryFallback = createInMemoryConversationStore();
  let redisAvailable = false;
  let redis: Redis | null = null;

  try {
    redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      enableOfflineQueue: false,
    });
    redis.connect()
      .then(() => { redisAvailable = true; })
      .catch(() => {
        redisAvailable = false;
        logger.warn({
          operation: 'chat:conversation_store',
          result: 'redis_connect_failed',
          fallback: 'memory',
        });
      });

    redis.on('error', () => { redisAvailable = false; });
    redis.on('ready', () => { redisAvailable = true; });
  } catch {
    return memoryFallback;
  }

  return {
    async get(conversationId: string): Promise<ConversationEntry[]> {
      if (!redisAvailable || !redis) return memoryFallback.get(conversationId);
      try {
        const key = `conv:${conversationId}`;
        const raw = await redis.get(key);
        if (!raw) return memoryFallback.get(conversationId);
        return JSON.parse(raw) as ConversationEntry[];
      } catch {
        return memoryFallback.get(conversationId);
      }
    },
    async set(conversationId: string, entries: ConversationEntry[]): Promise<void> {
      // Always save to memory as fallback
      await memoryFallback.set(conversationId, entries);

      if (!redisAvailable || !redis) return;
      try {
        const key = `conv:${conversationId}`;
        const trimmed = entries.length > CONVERSATION_MAX_ENTRIES
          ? entries.slice(-CONVERSATION_MAX_ENTRIES)
          : entries;
        await redis.set(key, JSON.stringify(trimmed), 'EX', CONVERSATION_TTL);
      } catch {
        // Redis write failed, memory fallback already saved
      }
    },
  };
}

function getConversationStore(): ConversationStore {
  if (conversationStore) return conversationStore;

  const redisUrl = process.env['REDIS_URL'];
  if (redisUrl) {
    conversationStore = createResilientRedisConversationStore(redisUrl);
    logger.info({ operation: 'chat:conversation_store', backend: 'redis_with_fallback' });
  } else {
    conversationStore = createInMemoryConversationStore();
    logger.warn({
      operation: 'chat:conversation_store',
      backend: 'memory',
      warning: 'Conversation history will not persist across restarts or replicas',
    });
  }

  return conversationStore;
}

export interface ChatRouteDeps {
  readonly prisma: PrismaClient;
  readonly ragEngine: RegulatoryRAG;
  readonly complianceAgent: ComplianceAgent;
}

export function createChatRouter(deps: ChatRouteDeps): Router {
  const router = Router();

  router.post('/chat', async (req: Request, res: Response) => {
    const requestId = req.headers['x-request-id'] as string ?? randomUUID();
    const startTime = Date.now();

    try {
    const tenantId = (req as AuthenticatedRequest).tenantId ?? 'default';

    // Validate request
    const parsed = ChatRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        requestId,
        details: parsed.error.issues,
      });
      return;
    }

    const { clientId, message, conversationId, filters } = parsed.data;
    const effectiveClientId = clientId ?? undefined;

    // Check SSE streaming preference
    const wantStreaming = req.headers['accept'] === 'text/event-stream';

    // Get or create conversation
    const convId = conversationId ?? randomUUID();
    const store = getConversationStore();
    const history = await store.get(convId);

    // Decide: use agent for complex queries, RAG for simple ones
    const useAgent = shouldUseAgent(message);

    logger.info({
      operation: 'chat:query',
      requestId,
      tenantId,
      clientId: effectiveClientId ?? 'global',
      conversationId: convId,
      useAgent,
      messageLength: message.length,
      historyLength: history.length,
    });

    if (wantStreaming) {
      // SSE streaming response
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Request-Id': requestId,
      });

      res.write(`event: start\ndata: ${JSON.stringify({ conversationId: convId })}\n\n`);

      try {
        let response;

        if (deps.ragEngine && !useAgent) {
          // Use RAG engine (Azure OpenAI + AI Search)
          const ragInput: RAGQueryInput = {
            tenantId,
            clientId: effectiveClientId ?? '',
            question: message,
            conversationId: convId,
            filters: {
              tenantId,
              country: filters?.countries?.[0] ?? undefined,
              impactLevel: filters?.impactLevel ?? undefined,
            },
          };

          response = await deps.ragEngine.query(ragInput);

          res.write(`event: message\ndata: ${JSON.stringify(response)}\n\n`);
        } else {
          // Fallback: Prisma-based search when RAG engine is not available
          const result = await prismaFallbackSearch(deps.prisma, message, effectiveClientId);

          response = {
            conversationId: convId,
            analysis: result.analysis,
            relatedObligations: result.obligations,
            cached: false,
          };

          res.write(`event: message\ndata: ${JSON.stringify(response)}\n\n`);
        }

        // Update conversation history
        const answerText = response && 'analysis' in response ? (response as { analysis: { answer: string } }).analysis.answer : '';
        history.push({ role: 'user', content: message, timestamp: new Date().toISOString() });
        history.push({ role: 'assistant', content: answerText, timestamp: new Date().toISOString() });
        await store.set(convId, history);

        res.write(`event: done\ndata: ${JSON.stringify({ duration: Date.now() - startTime })}\n\n`);
        res.end();
      } catch (err) {
        res.write(`event: error\ndata: ${JSON.stringify({
          code: 'CHAT_ERROR',
          message: err instanceof Error ? err.message : 'Chat processing failed',
          requestId,
        })}\n\n`);
        res.end();
      }
    } else {
      // Standard JSON response
      let responseBody;

      if (deps.ragEngine) {
        // Use RAG engine
        const ragInput: RAGQueryInput = {
          tenantId,
          clientId: effectiveClientId ?? '',
          question: message,
          conversationId: convId,
          filters: {
            tenantId,
            country: filters?.countries?.[0] ?? undefined,
            impactLevel: filters?.impactLevel ?? undefined,
          },
        };
        responseBody = await deps.ragEngine.query(ragInput);
      } else {
        // Fallback: Prisma DB search
        const result = await prismaFallbackSearch(deps.prisma, message, effectiveClientId);
        responseBody = {
          conversationId: convId,
          analysis: result.analysis,
          relatedObligations: result.obligations,
          cached: false,
        };
      }

      // Update conversation history in Redis
      history.push({ role: 'user', content: message, timestamp: new Date().toISOString() });
      const answer = 'analysis' in responseBody ? responseBody.analysis.answer : '';
      history.push({ role: 'assistant', content: answer, timestamp: new Date().toISOString() });
      await store.set(convId, history);

      logger.info({
        operation: 'chat:query_complete',
        requestId,
        tenantId,
        conversationId: convId,
        useAgent,
        cached: 'cached' in responseBody ? responseBody.cached : false,
        duration: Date.now() - startTime,
        result: 'success',
      });

      res.json(responseBody);
    }

    } catch (err) {
      logger.error({
        operation: 'chat:unhandled_error',
        requestId,
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
        duration: Date.now() - startTime,
        result: 'error',
      });

      if (!res.headersSent) {
        res.status(500).json({
          code: 'CHAT_ERROR',
          message: 'Error al procesar la consulta. Intenta de nuevo.',
          requestId,
        });
      }
    }
  });

  return router;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Determine if the question requires the full agent (multi-tool)
 * or can be answered by the simpler RAG pipeline.
 *
 * Agent is used for:
 * - Questions about client obligations or deadlines
 * - Cross-reference questions (regulation + client impact)
 * - Questions requiring graph traversal
 */
function shouldUseAgent(message: string): boolean {
  const agentKeywords = [
    'obligacion', 'obligation', 'deadline', 'vencimiento', 'plazo',
    'afecta', 'impacta', 'impact', 'affect',
    'mi empresa', 'my company', 'nuestro', 'our',
    'grafo', 'graph', 'relacion', 'relationship',
    'regulador', 'regulator', 'jurisdicc',
    'cumplimiento', 'compliance score',
    'qué debo', 'what should', 'qué tengo que',
  ];

  const lower = message.toLowerCase();
  return agentKeywords.some((kw) => lower.includes(kw));
}

/**
 * Prisma-based fallback search when RAG engine (Azure OpenAI + AI Search) is unavailable.
 * Searches each keyword separately with OR logic for better recall.
 * Falls back to latest regulations if no keywords match.
 */
async function prismaFallbackSearch(
  prisma: PrismaClient,
  message: string,
  clientId: string | undefined,
): Promise<{
  analysis: { answer: string; sources: readonly { documentId: string; title: string; relevanceScore: number; snippet: string; sourceUrl: string }[]; confidence: number; reasoning: string; impactedObligations: readonly string[] };
  obligations: readonly unknown[];
}> {
  const keywords = message
    .split(/[\s,;.?!]+/)
    .filter((w) => w.length > 3)
    .map((w) => w.toLowerCase())
    .slice(0, 5);

  const country = detectCountryFromMessage(message);
  const supportedList = Object.values(SUPPORTED_COUNTRIES).join(', ');

  // --- Case 1: Unsupported country detected ---
  if (country && !country.supported) {
    return {
      analysis: {
        answer: `Actualmente no tenemos cobertura regulatoria para **${country.name}**.\n\nRegWatch AI monitorea regulaciones de: **${supportedList}**.\n\nSi necesitas incorporar ${country.name}, podemos configurar un nuevo connector de ingestion. Contacta al equipo de administracion o preguntame sobre cualquiera de los paises que ya monitoreamos.`,
        sources: [],
        confidence: 0.9,
        reasoning: `Pais detectado: ${country.name} (${country.code}). No soportado — respuesta informativa`,
        impactedObligations: [],
      },
      obligations: [],
    };
  }

  // --- Build search query ---
  const orConditions = keywords.flatMap((kw) => [
    { title: { contains: kw, mode: 'insensitive' as const } },
    { summary: { contains: kw, mode: 'insensitive' as const } },
  ]);

  if (country?.supported) {
    orConditions.push({ country: { equals: country.code } });
  }

  let dbResults = await prisma.regulatoryChange.findMany({
    where: orConditions.length > 0 ? { OR: orConditions } : {},
    take: 5,
    orderBy: { publishedDate: 'desc' },
  });

  // If supported country detected but no results, try country-only
  if (dbResults.length === 0 && country?.supported) {
    dbResults = await prisma.regulatoryChange.findMany({
      where: { country: country.code },
      take: 5,
      orderBy: { publishedDate: 'desc' },
    });
  }

  const obligations = clientId
    ? await prisma.obligation.findMany({ where: { clientId }, take: 5 })
    : [];

  // --- Case 2: Found matching regulations ---
  if (dbResults.length > 0) {
    let answer = `Encontre ${dbResults.length} regulaciones relacionadas:\n\n${dbResults.map((r, i) => `${i + 1}. **${r.title}** (${r.country}, ${r.impactLevel})\n   ${r.summary.slice(0, 200)}`).join('\n\n')}`;
    if (obligations.length > 0) {
      answer += `\n\n**Obligaciones vinculadas (${obligations.length}):**\n${obligations.map((o) => `- ${o.title} [${o.status}] — deadline: ${o.deadline.toISOString().split('T')[0]}`).join('\n')}`;
    }
    return {
      analysis: {
        answer,
        sources: dbResults.map((r) => ({
          documentId: r.id, title: r.title, relevanceScore: 0.8,
          snippet: r.summary.slice(0, 150), sourceUrl: r.sourceUrl,
        })),
        confidence: 0.7,
        reasoning: `Busqueda por keywords [${keywords.join(', ')}]${country ? ` + pais ${country.code}` : ''}: ${dbResults.length} resultados`,
        impactedObligations: obligations.map((o) => o.id),
      },
      obligations,
    };
  }

  // --- Case 3: Supported country but no data yet ---
  if (country?.supported) {
    return {
      analysis: {
        answer: `Todavia no hay regulaciones de **${country.name}** en la base de datos. El connector esta configurado pero aun no se ha ejecutado la ingestion.\n\nPodes cargar datos desde la seccion **Fuentes** o preguntarme sobre otro pais. Actualmente tenemos datos de: **${supportedList}**.`,
        sources: [],
        confidence: 0.5,
        reasoning: `Pais soportado ${country.name} (${country.code}) sin datos indexados`,
        impactedObligations: [],
      },
      obligations: [],
    };
  }

  // --- Case 4: No country, no keyword match ---
  const total = await prisma.regulatoryChange.count();
  if (total === 0) {
    return {
      analysis: {
        answer: 'La base de datos esta vacia. Para comenzar, ejecuta la ingestion desde la seccion **Fuentes** o corre `npm run seed:real` para cargar datos de demo.',
        sources: [],
        confidence: 0.9,
        reasoning: 'Base de datos vacia',
        impactedObligations: [],
      },
      obligations: [],
    };
  }

  return {
    analysis: {
      answer: `No encontre resultados para tu consulta. Intenta con terminos mas especificos o preguntame sobre:\n\n- Regulaciones de un pais: *"regulaciones de Brasil"*\n- Un tema regulatorio: *"crypto"*, *"ESG"*, *"lavado de activos"*\n- Obligaciones de un cliente: *"obligaciones de FinanceCorp"*\n\nPaises disponibles: **${supportedList}**.`,
      sources: [],
      confidence: 0.9,
      reasoning: `Sin resultados para keywords [${keywords.join(', ')}]. Respuesta de guia`,
      impactedObligations: [],
    },
    obligations: [],
  };
}

/** Countries with active connectors and data in RegWatch AI. */
const SUPPORTED_COUNTRIES: Record<string, string> = {
  US: 'Estados Unidos', SG: 'Singapur', AR: 'Argentina', BR: 'Brasil',
  MX: 'Mexico', ES: 'España', EU: 'Union Europea',
};

/**
 * Detect country reference from natural language.
 * Returns { code, name, supported } — supported=false means we recognized
 * the country but don't have a connector for it.
 */
function detectCountryFromMessage(message: string): { code: string; name: string; supported: boolean } | null {
  const lower = message.toLowerCase();

  const countryMap: Record<string, { names: readonly string[]; displayName: string }> = {
    'US': { names: ['estados unidos', 'united states', 'usa', 'eeuu', 'sec ', 'sec,', 'norteamerica'], displayName: 'Estados Unidos' },
    'SG': { names: ['singapur', 'singapore', 'mas '], displayName: 'Singapur' },
    'AR': { names: ['argentina', 'afip', 'bcra', 'buenos aires', 'infoleg'], displayName: 'Argentina' },
    'BR': { names: ['brasil', 'brazil', 'brasileñ', 'bcb ', 'cvm ', 'lgpd', 'dou '], displayName: 'Brasil' },
    'MX': { names: ['mexico', 'méxico', 'mexicano', 'cnbv', 'dof ', 'banxico'], displayName: 'Mexico' },
    'ES': { names: ['españa', 'spain', 'spanish', 'español', 'boe ', 'cnmv'], displayName: 'España' },
    'EU': { names: ['europa', 'europe', 'european', 'europeo', 'eur-lex', 'dora', 'mifid', 'gdpr'], displayName: 'Union Europea' },
    // Countries we can recognize but DON'T support yet
    'CL': { names: ['chile', 'chileno', 'cmf '], displayName: 'Chile' },
    'CO': { names: ['colombia', 'colombian'], displayName: 'Colombia' },
    'PE': { names: ['peru', 'perú', 'peruano'], displayName: 'Peru' },
    'UY': { names: ['uruguay', 'uruguayo'], displayName: 'Uruguay' },
    'JO': { names: ['jordania', 'jordan'], displayName: 'Jordania' },
    'JP': { names: ['japon', 'japan', 'japones'], displayName: 'Japon' },
    'CN': { names: ['china', 'chino', 'beijing'], displayName: 'China' },
    'IN': { names: ['india', 'indian', 'mumbai'], displayName: 'India' },
    'GB': { names: ['reino unido', 'united kingdom', 'uk ', 'england', 'london', 'fca '], displayName: 'Reino Unido' },
    'DE': { names: ['alemania', 'germany', 'german', 'bafin'], displayName: 'Alemania' },
    'FR': { names: ['francia', 'france', 'french', 'amf '], displayName: 'Francia' },
    'AU': { names: ['australia', 'australian', 'asic '], displayName: 'Australia' },
    'CA': { names: ['canada', 'canadien'], displayName: 'Canada' },
    'KR': { names: ['corea', 'korea', 'korean', 'seoul'], displayName: 'Corea del Sur' },
    'SA': { names: ['arabia saudita', 'saudi', 'riyadh'], displayName: 'Arabia Saudita' },
    'AE': { names: ['emiratos', 'emirates', 'dubai', 'abu dhabi'], displayName: 'Emiratos Arabes' },
  };

  for (const [code, { names, displayName }] of Object.entries(countryMap)) {
    if (names.some((name) => lower.includes(name))) {
      return { code, name: displayName, supported: code in SUPPORTED_COUNTRIES };
    }
  }

  return null;
}

interface AuthenticatedRequest extends Request {
  tenantId?: string;
  userId?: string;
  userRole?: string;
}
