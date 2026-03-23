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

        if (useAgent) {
          response = await deps.complianceAgent.execute({
            tenantId,
            clientId,
            question: message,
            conversationHistory: history.map((h) => ({ role: h.role, content: h.content })),
          });

          // Stream the agent response
          res.write(`event: message\ndata: ${JSON.stringify({
            conversationId: convId,
            analysis: {
              answer: response.answer,
              sources: response.sources,
              confidence: response.confidence,
              reasoning: response.reasoning,
              impactedObligations: response.graphInsights.obligations.map((o) => o.id),
            },
            relatedObligations: [],
            cached: false,
            toolsUsed: response.toolsUsed,
          })}\n\n`);
        } else {
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
        }

        // Update conversation history in Redis
        history.push({ role: 'user', content: message, timestamp: new Date().toISOString() });
        history.push({
          role: 'assistant',
          content: useAgent ? (response as { answer: string }).answer : (response as { analysis: { answer: string } }).analysis.answer,
          timestamp: new Date().toISOString(),
        });
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

      if (useAgent) {
        const agentResponse = await deps.complianceAgent.execute({
          tenantId,
          clientId,
          question: message,
          conversationHistory: history.map((h) => ({ role: h.role, content: h.content })),
        });

        responseBody = {
          conversationId: convId,
          analysis: {
            answer: agentResponse.answer,
            sources: agentResponse.sources,
            confidence: agentResponse.confidence,
            reasoning: agentResponse.reasoning,
            impactedObligations: agentResponse.graphInsights.obligations.map((o) => o.id),
          },
          relatedObligations: [],
          cached: false,
          toolsUsed: agentResponse.toolsUsed,
        };
      } else {
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
