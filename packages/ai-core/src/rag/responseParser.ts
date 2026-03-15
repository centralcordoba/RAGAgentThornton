// ============================================================================
// FILE: packages/ai-core/src/rag/responseParser.ts
// Parses the structured LLM response into typed objects.
// ============================================================================

import type { ParsedLLMResponse } from './types.js';

/**
 * Parse the structured LLM response from the RAG system prompt format.
 *
 * Expected format:
 *   Answer: ...
 *   Sources: [doc1, doc2]
 *   Confidence: 0.85
 *   Reasoning: ...
 *   Impacted obligations: [obl1, obl2]
 */
export function parseLLMResponse(raw: string): ParsedLLMResponse {
  const answer = extractSection(raw, 'Answer');
  const sourcesRaw = extractSection(raw, 'Sources');
  const confidenceRaw = extractSection(raw, 'Confidence');
  const reasoning = extractSection(raw, 'Reasoning');
  const obligationsRaw = extractSection(raw, 'Impacted obligations');

  const sources = parseList(sourcesRaw);
  const confidence = parseConfidence(confidenceRaw);
  const impactedObligations = parseList(obligationsRaw);

  return {
    answer: answer || raw.trim(), // Fallback to full response if parsing fails
    sources,
    confidence,
    reasoning: reasoning || '',
    impactedObligations,
  };
}

/**
 * Parse the extended analysis response format.
 * Includes additional fields: New obligations, Deadlines, Operational impact, Risk level.
 */
export function parseAnalysisResponse(raw: string): ParsedAnalysisResponse {
  const base = parseLLMResponse(raw);

  return {
    ...base,
    newObligations: parseList(extractSection(raw, 'New obligations')),
    deadlines: parseList(extractSection(raw, 'Deadlines')),
    operationalImpact: extractSection(raw, 'Operational impact'),
    riskLevel: parseRiskLevel(extractSection(raw, 'Risk level')),
  };
}

export interface ParsedAnalysisResponse extends ParsedLLMResponse {
  readonly newObligations: readonly string[];
  readonly deadlines: readonly string[];
  readonly operationalImpact: string;
  readonly riskLevel: 'HIGH' | 'MEDIUM' | 'LOW';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract a named section from the LLM response.
 * Handles both "Section: value" and multi-line values.
 */
function extractSection(text: string, sectionName: string): string {
  // Match "SectionName:" followed by content until the next section or end
  const regex = new RegExp(
    `${escapeRegex(sectionName)}\\s*:\\s*([\\s\\S]*?)(?=\\n(?:Answer|Sources|Confidence|Reasoning|Impacted obligations|New obligations|Deadlines|Operational impact|Risk level)\\s*:|$)`,
    'i',
  );

  const match = regex.exec(text);
  if (!match?.[1]) return '';

  return match[1].trim();
}

/**
 * Parse a list from a section value.
 * Handles: [a, b, c], a, b, c, - a\n- b, and bulleted lists.
 */
function parseList(value: string): readonly string[] {
  if (!value || value.toLowerCase() === 'none' || value.toLowerCase() === 'ninguna') {
    return [];
  }

  // Remove surrounding brackets
  const cleaned = value.replace(/^\[/, '').replace(/\]$/, '').trim();

  if (!cleaned) return [];

  // Split by comma, newline + bullet, or newline + dash
  const items = cleaned
    .split(/[,\n]/)
    .map((item) => item.replace(/^[\s\-•*]+/, '').trim())
    .filter((item) => item.length > 0);

  return items;
}

/**
 * Parse confidence score, clamped to [0, 1].
 * Returns 0 if unparseable.
 */
function parseConfidence(value: string): number {
  if (!value) return 0;

  const match = /(\d+\.?\d*)/.exec(value);
  if (!match?.[1]) return 0;

  const num = parseFloat(match[1]);
  if (Number.isNaN(num)) return 0;

  return Math.max(0, Math.min(1, num));
}

/**
 * Parse risk level, defaulting to MEDIUM if unparseable.
 */
function parseRiskLevel(value: string): 'HIGH' | 'MEDIUM' | 'LOW' {
  const upper = value.toUpperCase().trim();
  if (upper.startsWith('HIGH')) return 'HIGH';
  if (upper.startsWith('LOW')) return 'LOW';
  return 'MEDIUM';
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
