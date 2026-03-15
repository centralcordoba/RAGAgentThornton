// ============================================================================
// FILE: apps/api/src/routes/chat.ts
// POST /api/chat — conversational RAG query with SSE streaming.
// ============================================================================

import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { ChatRequestSchema, Errors } from '@regwatch/shared';
import type { RegulatoryRAG, ComplianceAgent } from '@regwatch/ai-core';
import type { RAGQueryInput } from '@regwatch/ai-core';
import { createServiceLogger } from '../config/logger.js';

const logger = createServiceLogger('route:chat');

/** In-memory conversation store. Production: use Redis or PostgreSQL. */
const conversationStore = new Map<string, ConversationEntry[]>();

interface ConversationEntry {
  readonly role: 'user' | 'assistant';
  readonly content: string;
  readonly timestamp: Date;
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
    const history = conversationStore.get(convId) ?? [];

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

        // Update conversation history
        history.push({ role: 'user', content: message, timestamp: new Date() });
        history.push({
          role: 'assistant',
          content: useAgent ? (response as { answer: string }).answer : (response as { analysis: { answer: string } }).analysis.answer,
          timestamp: new Date(),
        });
        conversationStore.set(convId, history);

        // Trim old conversations (keep max 50 turns)
        if (history.length > 100) {
          conversationStore.set(convId, history.slice(-100));
        }

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

      // Update conversation history
      history.push({ role: 'user', content: message, timestamp: new Date() });
      const answer = 'analysis' in responseBody ? responseBody.analysis.answer : '';
      history.push({ role: 'assistant', content: answer, timestamp: new Date() });
      conversationStore.set(convId, history);

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
