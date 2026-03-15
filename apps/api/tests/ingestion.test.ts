// ============================================================================
// FILE: apps/api/tests/ingestion.test.ts
// Tests for the ingestion pipeline: BaseIngestionJob, connectors, classification.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cosineSimilarity } from '../src/jobs/ingestion/BaseIngestionJob.js';
import {
  createMockEmbeddingFn,
  createMockClassifyFn,
  createMockIdempotencyCheckFn,
} from './mocks/azureOpenAI.js';

// ---------------------------------------------------------------------------
// Cosine similarity
// ---------------------------------------------------------------------------

describe('cosineSimilarity', () => {
  it('returns 1.0 for identical vectors', () => {
    const v = [0.1, 0.2, 0.3, 0.4, 0.5];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1.0, 5);
  });

  it('returns 0 for orthogonal vectors', () => {
    const a = [1, 0, 0];
    const b = [0, 1, 0];
    expect(cosineSimilarity(a, b)).toBeCloseTo(0.0, 5);
  });

  it('returns -1 for opposite vectors', () => {
    const a = [1, 0, 0];
    const b = [-1, 0, 0];
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1.0, 5);
  });

  it('returns 0 for zero vectors', () => {
    const a = [0, 0, 0];
    const b = [1, 2, 3];
    expect(cosineSimilarity(a, b)).toBe(0);
  });

  it('throws for mismatched dimensions', () => {
    const a = [1, 2];
    const b = [1, 2, 3];
    expect(() => cosineSimilarity(a, b)).toThrow('dimension mismatch');
  });

  it('correctly identifies similar vectors (>0.92 threshold)', () => {
    const a = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8];
    // Slightly modified version
    const b = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.81];
    const similarity = cosineSimilarity(a, b);
    expect(similarity).toBeGreaterThan(0.92);
  });

  it('correctly identifies different vectors (<0.92 threshold)', () => {
    const a = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8];
    // Significantly different
    const b = [0.8, 0.1, 0.9, 0.2, 0.3, 0.1, 0.4, 0.1];
    const similarity = cosineSimilarity(a, b);
    expect(similarity).toBeLessThan(0.92);
  });
});

// ---------------------------------------------------------------------------
// Impact classification (mock)
// ---------------------------------------------------------------------------

describe('classifyImpact (mock)', () => {
  const classifyFn = createMockClassifyFn();

  const cases: Array<{
    name: string;
    title: string;
    summary: string;
    areas: string[];
    changeType: string;
    expectedLevel: 'HIGH' | 'MEDIUM' | 'LOW';
  }> = [
    {
      name: 'HIGH: new mandatory requirement',
      title: 'New mandatory reporting requirement',
      summary: 'All public companies must comply',
      areas: ['securities'],
      changeType: 'NEW',
      expectedLevel: 'HIGH',
    },
    {
      name: 'HIGH: penalty change',
      title: 'Increase in fine for non-compliance',
      summary: 'Fines increased by 200%',
      areas: ['fiscal'],
      changeType: 'SEMANTIC_CHANGE',
      expectedLevel: 'HIGH',
    },
    {
      name: 'HIGH: multa keyword',
      title: 'Nueva multa por incumplimiento',
      summary: 'Multa de $50,000 por retraso',
      areas: ['labor'],
      changeType: 'SEMANTIC_CHANGE',
      expectedLevel: 'HIGH',
    },
    {
      name: 'MEDIUM: procedure modification',
      title: 'Update to filing procedure',
      summary: 'Changes to quarterly filing process',
      areas: ['corporate'],
      changeType: 'SEMANTIC_CHANGE',
      expectedLevel: 'MEDIUM',
    },
    {
      name: 'MEDIUM: procedimiento update',
      title: 'Cambio en procedimiento de declaración',
      summary: 'Se modifica el formulario trimestral',
      areas: ['fiscal'],
      changeType: 'SEMANTIC_CHANGE',
      expectedLevel: 'MEDIUM',
    },
    {
      name: 'LOW: minor clarification',
      title: 'Clarification on form instructions',
      summary: 'Updated instructions for field 12',
      areas: ['fiscal'],
      changeType: 'SEMANTIC_CHANGE',
      expectedLevel: 'LOW',
    },
    {
      name: 'LOW: typographical correction',
      title: 'Corrección tipográfica en resolución',
      summary: 'Se corrige referencia a artículo',
      areas: ['regulatory'],
      changeType: 'SEMANTIC_CHANGE',
      expectedLevel: 'LOW',
    },
    {
      name: 'HIGH: new regulation (changeType=NEW)',
      title: 'Regulación completamente nueva de ESG',
      summary: 'Nueva normativa de divulgación ambiental',
      areas: ['corporate'],
      changeType: 'NEW',
      expectedLevel: 'HIGH',
    },
    {
      name: 'HIGH: penalty keyword in English',
      title: 'Updated penalty schedule',
      summary: 'New penalty tiers for late filings',
      areas: ['fiscal'],
      changeType: 'SEMANTIC_CHANGE',
      expectedLevel: 'HIGH',
    },
    {
      name: 'LOW: general minor update',
      title: 'Annual reference update',
      summary: 'Updated year references in form headers',
      areas: ['fiscal'],
      changeType: 'SEMANTIC_CHANGE',
      expectedLevel: 'LOW',
    },
  ];

  for (const testCase of cases) {
    it(testCase.name, async () => {
      const result = await classifyFn(
        testCase.title,
        testCase.summary,
        testCase.areas,
        testCase.changeType,
      );
      expect(result.level).toBe(testCase.expectedLevel);
      expect(result.reasoning).toBeTruthy();
      expect(result.factors.length).toBeGreaterThan(0);
    });
  }
});

// ---------------------------------------------------------------------------
// Idempotency check
// ---------------------------------------------------------------------------

describe('idempotencyCheck', () => {
  it('returns false for new documents', async () => {
    const check = createMockIdempotencyCheckFn();
    const exists = await check('SEC_EDGAR', 'doc-new', 'v1');
    expect(exists).toBe(false);
  });

  it('returns true for existing documents', async () => {
    const existing = new Set(['SEC_EDGAR:doc-1:v1']);
    const check = createMockIdempotencyCheckFn(existing);
    const exists = await check('SEC_EDGAR', 'doc-1', 'v1');
    expect(exists).toBe(true);
  });

  it('different version is treated as new', async () => {
    const existing = new Set(['SEC_EDGAR:doc-1:v1']);
    const check = createMockIdempotencyCheckFn(existing);
    const exists = await check('SEC_EDGAR', 'doc-1', 'v2');
    expect(exists).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Embedding mock
// ---------------------------------------------------------------------------

describe('mock embedding function', () => {
  it('returns 3072-dimensional vector', async () => {
    const embed = createMockEmbeddingFn();
    const result = await embed('test text');
    expect(result.length).toBe(3072);
  });

  it('returns deterministic results for same input', async () => {
    const embed = createMockEmbeddingFn();
    const a = await embed('same text');
    const b = await embed('same text');
    expect(a).toEqual(b);
  });

  it('returns different results for different input', async () => {
    const embed = createMockEmbeddingFn();
    const a = await embed('text one');
    const b = await embed('text two');
    expect(a).not.toEqual(b);
  });
});
