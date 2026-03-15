// ============================================================================
// FILE: packages/ai-core/tests/responseParser.test.ts
// Tests for RAG response parser.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { parseLLMResponse, parseAnalysisResponse } from '../src/rag/responseParser.js';

describe('parseLLMResponse', () => {
  it('parses a well-formatted response', () => {
    const raw = `Answer: La SEC requiere divulgación trimestral de derivados. [doc-1]
Sources: [doc-1, doc-2]
Confidence: 0.85
Reasoning: Los documentos proveen información directa sobre requisitos SEC.
Impacted obligations: Reporte trimestral, Form 8-K`;

    const result = parseLLMResponse(raw);
    expect(result.answer).toContain('La SEC requiere');
    expect(result.answer).toContain('[doc-1]');
    expect(result.sources).toEqual(['doc-1', 'doc-2']);
    expect(result.confidence).toBe(0.85);
    expect(result.reasoning).toContain('información directa');
    expect(result.impactedObligations).toEqual(['Reporte trimestral', 'Form 8-K']);
  });

  it('parses confidence as a number clamped to [0, 1]', () => {
    const raw = `Answer: test
Sources: []
Confidence: 1.5
Reasoning: test
Impacted obligations: none`;

    const result = parseLLMResponse(raw);
    expect(result.confidence).toBe(1.0);
  });

  it('returns 0 confidence for unparseable value', () => {
    const raw = `Answer: test
Sources: []
Confidence: not a number
Reasoning: test
Impacted obligations: none`;

    const result = parseLLMResponse(raw);
    expect(result.confidence).toBe(0);
  });

  it('handles missing sections gracefully', () => {
    const raw = `Answer: Some answer here.`;
    const result = parseLLMResponse(raw);
    expect(result.answer).toContain('Some answer');
    expect(result.sources).toEqual([]);
    expect(result.confidence).toBe(0);
    expect(result.reasoning).toBe('');
    expect(result.impactedObligations).toEqual([]);
  });

  it('falls back to full text if no Answer section found', () => {
    const raw = 'This is a raw response without any sections.';
    const result = parseLLMResponse(raw);
    expect(result.answer).toBe(raw);
  });

  it('handles "none" in lists', () => {
    const raw = `Answer: No data available.
Sources: none
Confidence: 0.3
Reasoning: Insufficient context.
Impacted obligations: none`;

    const result = parseLLMResponse(raw);
    expect(result.sources).toEqual([]);
    expect(result.impactedObligations).toEqual([]);
  });

  it('handles bulleted list format', () => {
    const raw = `Answer: Multiple obligations affected.
Sources: [doc-1, doc-2, doc-3]
Confidence: 0.9
Reasoning: Comprehensive analysis.
Impacted obligations:
- Reporte trimestral SEC
- Form 8-K filing
- Annual report 10-K`;

    const result = parseLLMResponse(raw);
    expect(result.impactedObligations).toHaveLength(3);
    expect(result.impactedObligations).toContain('Reporte trimestral SEC');
    expect(result.impactedObligations).toContain('Form 8-K filing');
    expect(result.impactedObligations).toContain('Annual report 10-K');
  });
});

describe('parseAnalysisResponse', () => {
  it('parses extended analysis format', () => {
    const raw = `Answer: Este cambio requiere actualización de procedimientos. [doc-1]
Sources: [doc-1]
Confidence: 0.82
Reasoning: El cambio modifica plazos existentes.
New obligations: Reporte ESG trimestral, Auditoría ambiental
Deadlines: 2026-06-30, 2026-12-31
Operational impact: Requiere capacitación del equipo.
Risk level: MEDIUM - Cambio significativo con plazo razonable.
Impacted obligations: Reporte financiero anual`;

    const result = parseAnalysisResponse(raw);
    expect(result.answer).toContain('actualización');
    expect(result.confidence).toBe(0.82);
    expect(result.newObligations).toHaveLength(2);
    expect(result.deadlines).toHaveLength(2);
    expect(result.operationalImpact).toContain('capacitación');
    expect(result.riskLevel).toBe('MEDIUM');
    expect(result.impactedObligations).toContain('Reporte financiero anual');
  });

  it('defaults risk level to MEDIUM when unparseable', () => {
    const raw = `Answer: test
Sources: []
Confidence: 0.5
Reasoning: test
New obligations: none
Deadlines: none
Operational impact: Unknown
Risk level: unclear
Impacted obligations: none`;

    const result = parseAnalysisResponse(raw);
    expect(result.riskLevel).toBe('MEDIUM');
  });

  it('parses HIGH risk level', () => {
    const raw = `Answer: Critical change.
Sources: [doc-1]
Confidence: 0.9
Reasoning: Major impact.
New obligations: Mandatory ESG reporting
Deadlines: 2026-03-31
Operational impact: Significant restructuring required.
Risk level: HIGH - Immediate action required due to tight deadline.
Impacted obligations: All quarterly reports`;

    const result = parseAnalysisResponse(raw);
    expect(result.riskLevel).toBe('HIGH');
  });
});
