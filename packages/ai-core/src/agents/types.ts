// ============================================================================
// FILE: packages/ai-core/src/agents/types.ts
// Types for the ComplianceAgent (LangChain ReAct).
// ============================================================================

import type { AIAnalysis, Obligation, ImpactLevel } from '@regwatch/shared';
import type { ObligationDetail } from '../../../../apps/api/src/graph/types.js';
import type { RetrievedDocument } from '../rag/types.js';

/** Input to the ComplianceAgent. */
export interface AgentInput {
  readonly tenantId: string;
  readonly clientId: string;
  readonly question: string;
  readonly conversationHistory: readonly AgentMessage[];
}

export interface AgentMessage {
  readonly role: 'user' | 'assistant';
  readonly content: string;
}

/** Full agent response combining RAG + Graph results. */
export interface AgentResponse {
  readonly answer: string;
  readonly sources: readonly AgentSource[];
  readonly confidence: number;
  readonly reasoning: string;
  readonly graphInsights: GraphInsights;
  readonly toolsUsed: readonly string[];
}

export interface AgentSource {
  readonly documentId: string;
  readonly title: string;
  readonly relevanceScore: number;
  readonly snippet: string;
  readonly sourceUrl: string;
  readonly sourceType: 'search' | 'graph';
}

/** Insights derived from the knowledge graph. */
export interface GraphInsights {
  readonly obligations: readonly ObligationSummary[];
  readonly upcomingDeadlines: readonly DeadlineSummary[];
  readonly affectedRegulators: readonly string[];
  readonly relatedJurisdictions: readonly string[];
}

export interface ObligationSummary {
  readonly id: string;
  readonly title: string;
  readonly area: string;
  readonly country: string;
  readonly status: string;
  readonly dueDate: string | null;
}

export interface DeadlineSummary {
  readonly obligationTitle: string;
  readonly dueDate: string;
  readonly daysUntilDue: number;
  readonly urgency: 'CRITICAL' | 'IMPORTANT' | 'NORMAL';
}

/** Tool call result used internally by the agent. */
export interface ToolResult {
  readonly toolName: string;
  readonly result: string;
  readonly durationMs: number;
}
