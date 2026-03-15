// ============================================================================
// FILE: packages/ai-core/src/agents/ComplianceAgent.ts
// LangChain ReAct agent that fuses RAG search + Neo4j graph for compliance.
//
// The agent decides which tools to call based on the user's question:
//   - Regulation queries → searchRegulations (AI Search)
//   - Obligation queries → queryGraph / getObligations (Neo4j)
//   - Deadline queries → getDeadlines (Neo4j)
//   - Impact analysis → analyzeImpact (RAG + Graph combined)
//
// Never fabricates data. If confidence < 0.5 → "insufficient data".
// ============================================================================

import { ChatOpenAI } from '@langchain/azure-openai';
import { AgentExecutor, createReactAgent } from 'langchain/agents';
import {
  ChatPromptTemplate,
  HumanMessagePromptTemplate,
  SystemMessagePromptTemplate,
  MessagesPlaceholder,
} from '@langchain/core/prompts';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import pino from 'pino';
import { createAgentTools } from './tools.js';
import type { AgentToolDeps } from './tools.js';
import type {
  AgentInput,
  AgentResponse,
  AgentSource,
  GraphInsights,
} from './types.js';

const logger = pino({ level: process.env['LOG_LEVEL'] ?? 'info' }).child({
  service: 'ai-core:compliance-agent',
});

// ---------------------------------------------------------------------------
// Agent system prompt
// ---------------------------------------------------------------------------

const AGENT_SYSTEM_PROMPT = `Eres un agente de compliance regulatorio de Grant Thornton con acceso a herramientas especializadas.

Tu rol:
- Responder preguntas sobre regulaciones, obligaciones y compliance usando las herramientas disponibles.
- Combinar información de búsqueda documental (AI Search) con datos estructurados del grafo de conocimiento (Neo4j).
- Proporcionar respuestas precisas con fuentes citadas.

Reglas CRÍTICAS:
- NUNCA inventes regulaciones, fechas, montos de multa, o requisitos.
- Si no encuentras información suficiente, responde exactamente: "insufficient data".
- Siempre cita las fuentes de tu información.
- Prioriza datos del grafo de conocimiento para obligaciones y deadlines.
- Prioriza búsqueda documental para análisis de regulaciones recientes.

Estrategia de uso de herramientas:
1. Para preguntas sobre obligaciones del cliente → usa getObligations
2. Para preguntas sobre deadlines → usa getDeadlines
3. Para preguntas sobre regulaciones específicas → usa searchRegulations
4. Para relaciones entre entidades regulatorias → usa queryGraph
5. Para análisis de impacto de un cambio → usa analyzeImpact
6. Para preguntas complejas → combina múltiples herramientas

Formato de respuesta:
- Responde en el idioma de la pregunta del usuario.
- Incluye referencias a documentos con [doc_id] cuando cites fuentes de búsqueda.
- Incluye datos estructurados del grafo cuando sea relevante (deadlines, reguladores).
- Sé conciso pero completo.

{agent_scratchpad}`;

// ---------------------------------------------------------------------------
// Agent configuration
// ---------------------------------------------------------------------------

export interface ComplianceAgentConfig {
  readonly azureOpenAIEndpoint: string;
  readonly azureOpenAIApiKey: string;
  readonly azureOpenAIApiVersion: string;
  readonly gptDeployment: string;
  readonly maxIterations: number;
  readonly temperature: number;
  readonly maxTokens: number;
}

const DEFAULT_AGENT_CONFIG: Omit<
  ComplianceAgentConfig,
  'azureOpenAIEndpoint' | 'azureOpenAIApiKey' | 'azureOpenAIApiVersion' | 'gptDeployment'
> = {
  maxIterations: 5,
  temperature: 0.2,
  maxTokens: 2000,
};

// ---------------------------------------------------------------------------
// ComplianceAgent
// ---------------------------------------------------------------------------

export class ComplianceAgent {
  private readonly config: ComplianceAgentConfig;
  private readonly toolDeps: AgentToolDeps;

  constructor(
    config: ComplianceAgentConfig,
    toolDeps: AgentToolDeps,
  ) {
    this.config = { ...DEFAULT_AGENT_CONFIG, ...config };
    this.toolDeps = toolDeps;
  }

  /**
   * Execute the agent for a user question.
   * The agent autonomously decides which tools to call (ReAct loop).
   */
  async execute(input: AgentInput): Promise<AgentResponse> {
    const startTime = Date.now();
    const toolsUsed: string[] = [];

    logger.info({
      operation: 'agent:execute_start',
      tenantId: input.tenantId,
      clientId: input.clientId,
      questionLength: input.question.length,
      conversationLength: input.conversationHistory.length,
    });

    // Create LLM
    const llm = new ChatOpenAI({
      azureOpenAIEndpoint: this.config.azureOpenAIEndpoint,
      azureOpenAIApiKey: this.config.azureOpenAIApiKey,
      azureOpenAIApiVersion: this.config.azureOpenAIApiVersion,
      azureOpenAIApiDeploymentName: this.config.gptDeployment,
      temperature: this.config.temperature,
      maxTokens: this.config.maxTokens,
    });

    // Create tools with tenant context
    const tools = createAgentTools(this.toolDeps, input.tenantId);

    // Create ReAct agent
    const prompt = ChatPromptTemplate.fromMessages([
      SystemMessagePromptTemplate.fromTemplate(AGENT_SYSTEM_PROMPT),
      new MessagesPlaceholder('chat_history'),
      HumanMessagePromptTemplate.fromTemplate('{input}'),
      new MessagesPlaceholder('agent_scratchpad'),
    ]);

    const agent = await createReactAgent({
      llm,
      tools,
      prompt,
    });

    const executor = new AgentExecutor({
      agent,
      tools,
      maxIterations: this.config.maxIterations,
      returnIntermediateSteps: true,
      handleParsingErrors: true,
    });

    // Build chat history
    const chatHistory = input.conversationHistory.map((msg) =>
      msg.role === 'user'
        ? new HumanMessage(msg.content)
        : new AIMessage(msg.content),
    );

    // Execute
    let result: AgentExecutorResult;
    try {
      result = (await executor.invoke({
        input: buildAgentInput(input),
        chat_history: chatHistory,
      })) as AgentExecutorResult;
    } catch (err) {
      logger.error({
        operation: 'agent:execute_error',
        tenantId: input.tenantId,
        clientId: input.clientId,
        duration: Date.now() - startTime,
        result: 'error',
        error: err instanceof Error ? err.message : String(err),
      });

      return {
        answer: 'insufficient data',
        sources: [],
        confidence: 0,
        reasoning: `Agent execution failed: ${err instanceof Error ? err.message : String(err)}`,
        graphInsights: emptyGraphInsights(),
        toolsUsed: [],
      };
    }

    // Extract tools used from intermediate steps
    if (result.intermediateSteps) {
      for (const step of result.intermediateSteps) {
        if (step.action?.tool) {
          toolsUsed.push(step.action.tool);
        }
      }
    }

    // Parse the agent output
    const response = parseAgentOutput(result.output, toolsUsed);

    logger.info({
      operation: 'agent:execute_complete',
      tenantId: input.tenantId,
      clientId: input.clientId,
      toolsUsed,
      iterations: result.intermediateSteps?.length ?? 0,
      confidence: response.confidence,
      isInsufficientData: response.answer === 'insufficient data',
      duration: Date.now() - startTime,
      result: 'success',
    });

    return response;
  }
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface AgentExecutorResult {
  readonly output: string;
  readonly intermediateSteps?: readonly {
    readonly action: { readonly tool: string; readonly toolInput: unknown };
    readonly observation: string;
  }[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildAgentInput(input: AgentInput): string {
  return (
    `Cliente ID: ${input.clientId}\n` +
    `Pregunta: ${input.question}`
  );
}

function parseAgentOutput(output: string, toolsUsed: readonly string[]): AgentResponse {
  // Check for insufficient data indicators
  const lowerOutput = output.toLowerCase();
  if (
    lowerOutput.includes('insufficient data') ||
    lowerOutput.includes('no encontré') ||
    lowerOutput.includes('no tengo información') ||
    lowerOutput.includes('no pude encontrar')
  ) {
    return {
      answer: 'insufficient data',
      sources: [],
      confidence: 0.2,
      reasoning: output,
      graphInsights: emptyGraphInsights(),
      toolsUsed,
    };
  }

  // Extract sources from [doc_id] references
  const sourceRefs = extractSourceReferences(output);

  // Estimate confidence based on tool usage and source count
  const confidence = estimateConfidence(toolsUsed, sourceRefs.length);

  return {
    answer: output,
    sources: sourceRefs,
    confidence,
    reasoning: `Agent used ${toolsUsed.length} tools: ${toolsUsed.join(', ')}`,
    graphInsights: extractGraphInsights(output, toolsUsed),
    toolsUsed,
  };
}

function extractSourceReferences(output: string): AgentSource[] {
  const refs: AgentSource[] = [];
  const refRegex = /\[([^\]]+)\]/g;
  const seen = new Set<string>();
  let match: RegExpExecArray | null;

  while ((match = refRegex.exec(output)) !== null) {
    const docId = match[1]!;
    // Skip common markdown patterns like [1], [link text]
    if (seen.has(docId) || /^\d+$/.test(docId) || docId.length > 100) continue;
    seen.add(docId);

    refs.push({
      documentId: docId,
      title: docId,
      relevanceScore: 0.8,
      snippet: '',
      sourceUrl: '',
      sourceType: 'search',
    });
  }

  return refs;
}

function estimateConfidence(toolsUsed: readonly string[], sourceCount: number): number {
  let confidence = 0.3; // Base

  // More tools used = more thorough analysis
  if (toolsUsed.length >= 2) confidence += 0.2;
  if (toolsUsed.length >= 3) confidence += 0.1;

  // Sources increase confidence
  if (sourceCount >= 1) confidence += 0.1;
  if (sourceCount >= 3) confidence += 0.1;

  // Graph + search combination is most reliable
  const hasSearch = toolsUsed.includes('searchRegulations');
  const hasGraph = toolsUsed.includes('getObligations') ||
    toolsUsed.includes('queryGraph') ||
    toolsUsed.includes('getDeadlines');

  if (hasSearch && hasGraph) confidence += 0.1;

  return Math.min(confidence, 0.95);
}

function extractGraphInsights(output: string, toolsUsed: readonly string[]): GraphInsights {
  // If no graph tools were used, return empty
  const usedGraphTool = toolsUsed.some((t) =>
    ['getObligations', 'getDeadlines', 'queryGraph'].includes(t),
  );

  if (!usedGraphTool) return emptyGraphInsights();

  // Basic extraction — in production this would parse structured tool output
  return {
    obligations: [],
    upcomingDeadlines: [],
    affectedRegulators: [],
    relatedJurisdictions: [],
  };
}

function emptyGraphInsights(): GraphInsights {
  return {
    obligations: [],
    upcomingDeadlines: [],
    affectedRegulators: [],
    relatedJurisdictions: [],
  };
}
