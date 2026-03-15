// ============================================================================
// FILE: packages/ai-core/src/agents/tools.ts
// LangChain tool definitions for the ComplianceAgent.
//
// Tools:
//   1. searchRegulations — Hybrid search in Azure AI Search
//   2. queryGraph — Execute Cypher on Neo4j ComplianceGraph
//   3. getObligations — Get client obligations from graph
//   4. getDeadlines — Get upcoming deadlines for a client
//   5. analyzeImpact — Run RAG analysis on a specific regulation
// ============================================================================

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import pino from 'pino';
import type { SearchFilters } from '../search/types.js';

const logger = pino({ level: process.env['LOG_LEVEL'] ?? 'info' }).child({
  service: 'ai-core:agent-tools',
});

// ---------------------------------------------------------------------------
// Tool dependency interfaces
// ---------------------------------------------------------------------------

export interface AgentToolDeps {
  /** Search regulations in Azure AI Search. */
  readonly searchRegulations: (
    query: string,
    filters: SearchFilters,
    topK: number,
  ) => Promise<readonly SearchToolResult[]>;

  /** Query the Neo4j ComplianceGraph with a Cypher-like description. */
  readonly queryGraph: (
    queryType: string,
    params: Record<string, string>,
  ) => Promise<string>;

  /** Get client obligations from the graph. */
  readonly getClientObligations: (
    clientId: string,
    tenantId: string,
  ) => Promise<string>;

  /** Get upcoming deadlines for a client. */
  readonly getUpcomingDeadlines: (
    tenantId: string,
    days: number,
  ) => Promise<string>;

  /** Run RAG impact analysis on a specific regulation for a client. */
  readonly analyzeImpact: (
    regulationId: string,
    clientId: string,
    tenantId: string,
  ) => Promise<string>;
}

export interface SearchToolResult {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly country: string;
  readonly impactLevel: string;
  readonly sourceUrl: string;
  readonly score: number;
}

// ---------------------------------------------------------------------------
// Tool factory
// ---------------------------------------------------------------------------

/**
 * Create LangChain tools for the ComplianceAgent.
 * Each tool wraps a dependency function with structured input validation.
 */
export function createAgentTools(
  deps: AgentToolDeps,
  tenantId: string,
): DynamicStructuredTool[] {
  return [
    // --- Tool 1: Search Regulations ---
    new DynamicStructuredTool({
      name: 'searchRegulations',
      description:
        'Search for regulatory documents and changes in the knowledge base. ' +
        'Use this when the user asks about specific regulations, laws, or regulatory changes. ' +
        'Supports filtering by country code (e.g. US, BR, ES), impact level (HIGH, MEDIUM, LOW), ' +
        'and regulatory area (fiscal, labor, corporate, securities).',
      schema: z.object({
        query: z.string().describe('Natural language search query about regulations'),
        country: z.string().optional().describe('ISO 3166-1 alpha-2 country code filter'),
        impactLevel: z.enum(['HIGH', 'MEDIUM', 'LOW']).optional().describe('Impact level filter'),
        area: z.string().optional().describe('Regulatory area: fiscal, labor, corporate, securities'),
        topK: z.number().min(1).max(10).default(5).describe('Number of results to return'),
      }),
      func: async (input) => {
        const startTime = Date.now();
        try {
          const filters: SearchFilters = {
            tenantId,
            country: input.country,
            area: input.area,
            impactLevel: input.impactLevel,
          };

          const results = await deps.searchRegulations(input.query, filters, input.topK);

          const formatted = results
            .map(
              (r, i) =>
                `[${i + 1}] ${r.title} (${r.country}, ${r.impactLevel})\n` +
                `   Score: ${r.score.toFixed(2)}\n` +
                `   Summary: ${r.summary.slice(0, 200)}\n` +
                `   Source: ${r.sourceUrl}`,
            )
            .join('\n\n');

          logger.debug({
            operation: 'agent_tool:search_regulations',
            query: input.query.slice(0, 100),
            resultsCount: results.length,
            duration: Date.now() - startTime,
            result: 'success',
          });

          return results.length > 0
            ? `Found ${results.length} regulations:\n\n${formatted}`
            : 'No regulations found matching the query.';
        } catch (err) {
          logger.error({
            operation: 'agent_tool:search_regulations',
            query: input.query.slice(0, 100),
            duration: Date.now() - startTime,
            result: 'error',
            error: err instanceof Error ? err.message : String(err),
          });
          return `Error searching regulations: ${err instanceof Error ? err.message : String(err)}`;
        }
      },
    }),

    // --- Tool 2: Query Graph ---
    new DynamicStructuredTool({
      name: 'queryGraph',
      description:
        'Query the Neo4j ComplianceGraph for structured compliance data. ' +
        'Use this to find relationships between jurisdictions, obligations, regulators, and company types. ' +
        'Available query types: "obligations_by_country", "regulators_by_country", ' +
        '"obligations_by_area", "affected_by_change", "regulation_history".',
      schema: z.object({
        queryType: z
          .enum([
            'obligations_by_country',
            'regulators_by_country',
            'obligations_by_area',
            'affected_by_change',
            'regulation_history',
          ])
          .describe('Type of graph query'),
        country: z.string().optional().describe('Country code for the query'),
        area: z.string().optional().describe('Regulatory area filter'),
        changeId: z.string().optional().describe('Regulatory change ID for impact analysis'),
      }),
      func: async (input) => {
        const startTime = Date.now();
        try {
          const params: Record<string, string> = {};
          if (input.country) params['country'] = input.country;
          if (input.area) params['area'] = input.area;
          if (input.changeId) params['changeId'] = input.changeId;

          const result = await deps.queryGraph(input.queryType, params);

          logger.debug({
            operation: 'agent_tool:query_graph',
            queryType: input.queryType,
            duration: Date.now() - startTime,
            result: 'success',
          });

          return result;
        } catch (err) {
          logger.error({
            operation: 'agent_tool:query_graph',
            queryType: input.queryType,
            duration: Date.now() - startTime,
            result: 'error',
            error: err instanceof Error ? err.message : String(err),
          });
          return `Error querying graph: ${err instanceof Error ? err.message : String(err)}`;
        }
      },
    }),

    // --- Tool 3: Get Client Obligations ---
    new DynamicStructuredTool({
      name: 'getObligations',
      description:
        'Get all compliance obligations for a specific client. ' +
        'Returns obligations grouped by country and area, including deadlines and regulators. ' +
        'Use this when the user asks about their obligations, what they need to comply with, ' +
        'or what is required in a specific country.',
      schema: z.object({
        clientId: z.string().describe('The client ID to get obligations for'),
      }),
      func: async (input) => {
        const startTime = Date.now();
        try {
          const result = await deps.getClientObligations(input.clientId, tenantId);

          logger.debug({
            operation: 'agent_tool:get_obligations',
            clientId: input.clientId,
            duration: Date.now() - startTime,
            result: 'success',
          });

          return result;
        } catch (err) {
          logger.error({
            operation: 'agent_tool:get_obligations',
            clientId: input.clientId,
            duration: Date.now() - startTime,
            result: 'error',
            error: err instanceof Error ? err.message : String(err),
          });
          return `Error getting obligations: ${err instanceof Error ? err.message : String(err)}`;
        }
      },
    }),

    // --- Tool 4: Get Upcoming Deadlines ---
    new DynamicStructuredTool({
      name: 'getDeadlines',
      description:
        'Get upcoming compliance deadlines across all clients in the tenant. ' +
        'Returns deadlines sorted by due date with urgency classification ' +
        '(CRITICAL: <30 days, IMPORTANT: <90 days). ' +
        'Use this when the user asks about upcoming deadlines, due dates, or time-sensitive obligations.',
      schema: z.object({
        days: z
          .number()
          .min(1)
          .max(365)
          .default(90)
          .describe('Number of days ahead to look for deadlines'),
      }),
      func: async (input) => {
        const startTime = Date.now();
        try {
          const result = await deps.getUpcomingDeadlines(tenantId, input.days);

          logger.debug({
            operation: 'agent_tool:get_deadlines',
            days: input.days,
            duration: Date.now() - startTime,
            result: 'success',
          });

          return result;
        } catch (err) {
          logger.error({
            operation: 'agent_tool:get_deadlines',
            days: input.days,
            duration: Date.now() - startTime,
            result: 'error',
            error: err instanceof Error ? err.message : String(err),
          });
          return `Error getting deadlines: ${err instanceof Error ? err.message : String(err)}`;
        }
      },
    }),

    // --- Tool 5: Analyze Impact ---
    new DynamicStructuredTool({
      name: 'analyzeImpact',
      description:
        'Run an AI-powered impact analysis of a specific regulatory change for a client. ' +
        'Returns detailed analysis including new obligations, deadlines, operational impact, and risk level. ' +
        'Use this when the user asks about how a specific regulation affects them ' +
        'or wants a detailed compliance impact assessment.',
      schema: z.object({
        regulationId: z.string().describe('ID of the regulatory change to analyze'),
        clientId: z.string().describe('Client ID to analyze the impact for'),
      }),
      func: async (input) => {
        const startTime = Date.now();
        try {
          const result = await deps.analyzeImpact(input.regulationId, input.clientId, tenantId);

          logger.debug({
            operation: 'agent_tool:analyze_impact',
            regulationId: input.regulationId,
            clientId: input.clientId,
            duration: Date.now() - startTime,
            result: 'success',
          });

          return result;
        } catch (err) {
          logger.error({
            operation: 'agent_tool:analyze_impact',
            regulationId: input.regulationId,
            clientId: input.clientId,
            duration: Date.now() - startTime,
            result: 'error',
            error: err instanceof Error ? err.message : String(err),
          });
          return `Error analyzing impact: ${err instanceof Error ? err.message : String(err)}`;
        }
      },
    }),
  ];
}
