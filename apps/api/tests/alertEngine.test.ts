// ============================================================================
// FILE: apps/api/tests/alertEngine.test.ts
// Tests for the AlertFormatter.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { AlertFormatter } from '../src/services/alerts/alertFormatter.js';
import type { AIAnalysis, Client, RegulatoryChange } from '@regwatch/shared';

const formatter = new AlertFormatter();

const mockAnalysis: AIAnalysis = {
  answer: 'Este cambio requiere actualización de procedimientos de reporte trimestral.',
  sources: [
    {
      documentId: 'doc-1',
      title: 'SEC Rule Amendment',
      relevanceScore: 0.9,
      snippet: 'Enhanced disclosure requirements...',
      sourceUrl: 'https://sec.gov/doc-1',
    },
  ],
  confidence: 0.85,
  reasoning: 'Análisis basado en documentos SEC recientes.',
  impactedObligations: ['Reporte trimestral', 'Form 8-K'],
};

const mockChange: RegulatoryChange = {
  id: 'change-001',
  sourceId: 'SEC_EDGAR',
  externalDocumentId: 'sec-123',
  title: 'SEC Rule 10b-5 Amendment',
  summary: 'Enhanced disclosure for derivatives',
  rawContent: 'Full text...',
  effectiveDate: new Date('2026-06-30'),
  publishedDate: new Date('2026-03-01'),
  impactLevel: 'HIGH',
  affectedAreas: ['securities', 'derivatives'],
  affectedIndustries: ['financial-services'],
  country: 'US',
  jurisdiction: 'US-FED',
  version: 'v1',
  language: 'en',
  sourceUrl: 'https://sec.gov/rules/final/2026',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockClient: Client = {
  id: 'client-001',
  tenantId: 'tenant-001',
  name: 'Acme Financial Corp',
  countries: ['US', 'MX'],
  companyType: 'Public Company',
  industries: ['financial-services'],
  contactEmail: 'compliance@acme.com',
  isActive: true,
  onboardedAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('AlertFormatter', () => {
  it('formats HIGH impact alert with correct subject', () => {
    const result = formatter.format(mockAnalysis, mockChange, mockClient);
    expect(result.subject).toContain('[URGENTE]');
    expect(result.subject).toContain('SEC Rule 10b-5');
    expect(result.subject).toContain('US');
  });

  it('formats MEDIUM impact alert', () => {
    const medChange = { ...mockChange, impactLevel: 'MEDIUM' as const };
    const result = formatter.format(mockAnalysis, medChange, mockClient);
    expect(result.subject).toContain('[Importante]');
  });

  it('formats LOW impact alert', () => {
    const lowChange = { ...mockChange, impactLevel: 'LOW' as const };
    const result = formatter.format(mockAnalysis, lowChange, mockClient);
    expect(result.subject).toContain('[Informativo]');
  });

  it('sets actionRequired for HIGH and MEDIUM', () => {
    const high = formatter.format(mockAnalysis, mockChange, mockClient);
    expect(high.actionRequired).toBe(true);

    const low = formatter.format(mockAnalysis, { ...mockChange, impactLevel: 'LOW' as const }, mockClient);
    expect(low.actionRequired).toBe(false);
  });

  it('includes affected obligations', () => {
    const result = formatter.format(mockAnalysis, mockChange, mockClient);
    expect(result.affectedObligations).toEqual(['Reporte trimestral', 'Form 8-K']);
  });

  it('generates recommended actions', () => {
    const result = formatter.format(mockAnalysis, mockChange, mockClient);
    expect(result.recommendedActions.length).toBeGreaterThan(0);
    expect(result.recommendedActions.some((a) => a.includes('inmediatamente'))).toBe(true);
  });

  it('generates valid HTML body', () => {
    const result = formatter.format(mockAnalysis, mockChange, mockClient);
    expect(result.bodyHtml).toContain('<!DOCTYPE html>');
    expect(result.bodyHtml).toContain('Acme Financial Corp');
    expect(result.bodyHtml).toContain('SEC Rule 10b-5');
    expect(result.bodyHtml).toContain('#dc2626'); // HIGH severity color
  });

  it('generates plain text body', () => {
    const result = formatter.format(mockAnalysis, mockChange, mockClient);
    expect(result.bodyText).toContain('Acme Financial Corp');
    expect(result.bodyText).toContain('Grant Thornton');
    expect(result.bodyText).toContain('ACCIONES RECOMENDADAS');
  });

  it('includes deadline from effectiveDate', () => {
    const result = formatter.format(mockAnalysis, mockChange, mockClient);
    expect(result.deadline).toBe('2026-06-30');
  });

  it('escapes HTML in output', () => {
    const xssChange = {
      ...mockChange,
      title: '<script>alert("xss")</script>',
    };
    const result = formatter.format(mockAnalysis, xssChange, mockClient);
    expect(result.bodyHtml).not.toContain('<script>');
    expect(result.bodyHtml).toContain('&lt;script&gt;');
  });
});
