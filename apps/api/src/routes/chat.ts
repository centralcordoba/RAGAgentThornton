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

function getConversationStore(): ConversationStore {
  if (conversationStore) return conversationStore;

  const redisUrl = process.env['REDIS_URL'];
  if (redisUrl) {
    const redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      enableOfflineQueue: false,
    });
    redis.connect().catch(() => {
      logger.warn({
        operation: 'chat:conversation_store',
        result: 'redis_connect_failed',
        fallback: 'memory',
      });
    });
    conversationStore = createRedisConversationStore(redis);
    logger.info({ operation: 'chat:conversation_store', backend: 'redis' });
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
    const tenantId = (req as AuthenticatedRequest).tenantId!;
    const startTime = Date.now();

    // Validate request
    const parsed = ChatRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      throw Errors.validation(requestId, parsed.error.issues);
    }

    const { clientId, message, conversationId, filters } = parsed.data;

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
      clientId,
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
            clientId,
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
          const dbResults = await deps.prisma.regulatoryChange.findMany({
            where: {
              OR: [
                { title: { contains: message.split(' ').slice(0, 3).join(' '), mode: 'insensitive' } },
                { summary: { contains: message.split(' ').slice(0, 3).join(' '), mode: 'insensitive' } },
              ],
            },
            take: 5,
            orderBy: { publishedDate: 'desc' },
          });

          const obligations = clientId ? await deps.prisma.obligation.findMany({
            where: { clientId },
            take: 5,
          }) : [];

          const answer = dbResults.length > 0
            ? `Basado en ${dbResults.length} regulaciones encontradas:\n\n${dbResults.map((r, i) => `${i + 1}. **${r.title}** (${r.country}, ${r.impactLevel})\n   ${r.summary.slice(0, 200)}`).join('\n\n')}${obligations.length > 0 ? `\n\n**Obligaciones vinculadas (${obligations.length}):**\n${obligations.map((o) => `- ${o.title} [${o.status}] — deadline: ${o.deadline.toISOString().split('T')[0]}`).join('\n')}` : ''}`
            : 'No se encontraron regulaciones relacionadas con tu consulta. Intenta reformular la pregunta.';

          response = {
            conversationId: convId,
            analysis: {
              answer,
              sources: dbResults.map((r) => ({ documentId: r.id, title: r.title, relevanceScore: 0.8, snippet: r.summary.slice(0, 150), sourceUrl: r.sourceUrl })),
              confidence: dbResults.length > 0 ? 0.7 : 0.3,
              reasoning: dbResults.length > 0 ? `Busqueda en base de datos: ${dbResults.length} regulaciones encontradas` : 'Sin resultados en la base de datos',
              impactedObligations: obligations.map((o) => o.id),
            },
            relatedObligations: obligations,
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
          clientId,
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
        const keywords = message.split(' ').filter((w) => w.length > 3).slice(0, 3);
        const searchTerm = keywords.join(' ');

        const dbResults = await deps.prisma.regulatoryChange.findMany({
          where: searchTerm ? {
            OR: [
              { title: { contains: searchTerm, mode: 'insensitive' } },
              { summary: { contains: searchTerm, mode: 'insensitive' } },
            ],
          } : {},
          take: 5,
          orderBy: { publishedDate: 'desc' },
        });

        const obligations = clientId ? await deps.prisma.obligation.findMany({
          where: { clientId },
          take: 5,
        }) : [];

        const answerText = dbResults.length > 0
          ? `Basado en ${dbResults.length} regulaciones encontradas:\n\n${dbResults.map((r, i) => `${i + 1}. **${r.title}** (${r.country}, ${r.impactLevel})\n   ${r.summary.slice(0, 200)}`).join('\n\n')}`
          : 'No se encontraron regulaciones relacionadas. Intenta reformular la pregunta.';

        responseBody = {
          conversationId: convId,
          analysis: {
            answer: answerText,
            sources: dbResults.map((r) => ({ documentId: r.id, title: r.title, relevanceScore: 0.8, snippet: r.summary.slice(0, 150), sourceUrl: r.sourceUrl })),
            confidence: dbResults.length > 0 ? 0.7 : 0.3,
            reasoning: `Busqueda en base de datos: ${dbResults.length} resultados`,
            impactedObligations: obligations.map((o) => o.id),
          },
          relatedObligations: obligations,
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

interface AuthenticatedRequest extends Request {
  tenantId?: string;
  userId?: string;
  userRole?: string;
}
