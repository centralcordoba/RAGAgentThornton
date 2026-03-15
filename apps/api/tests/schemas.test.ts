// ============================================================================
// FILE: apps/api/tests/schemas.test.ts
// Tests for Zod request validation schemas.
// ============================================================================

import { describe, it, expect } from 'vitest';
import {
  CreateClientSchema,
  ChatRequestSchema,
  ListRegulationsSchema,
  AcknowledgeAlertSchema,
  PaginationSchema,
  TriggerIngestionSchema,
} from '@regwatch/shared';

describe('PaginationSchema', () => {
  it('accepts valid pagination', () => {
    const result = PaginationSchema.safeParse({ page: '2', pageSize: '50' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(2);
      expect(result.data.pageSize).toBe(50);
    }
  });

  it('applies defaults', () => {
    const result = PaginationSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.pageSize).toBe(20);
    }
  });

  it('rejects page < 1', () => {
    const result = PaginationSchema.safeParse({ page: '0' });
    expect(result.success).toBe(false);
  });

  it('rejects pageSize > 100', () => {
    const result = PaginationSchema.safeParse({ pageSize: '200' });
    expect(result.success).toBe(false);
  });
});

describe('CreateClientSchema', () => {
  it('accepts valid client data', () => {
    const result = CreateClientSchema.safeParse({
      name: 'Acme Corp',
      countries: ['US', 'MX'],
      companyType: 'Public Company',
      industries: ['financial-services'],
      contactEmail: 'compliance@acme.com',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty name', () => {
    const result = CreateClientSchema.safeParse({
      name: '',
      countries: ['US'],
      companyType: 'Public',
      industries: ['tech'],
      contactEmail: 'a@b.com',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid country code (not 2 chars)', () => {
    const result = CreateClientSchema.safeParse({
      name: 'Test',
      countries: ['USA'],
      companyType: 'Public',
      industries: ['tech'],
      contactEmail: 'a@b.com',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty countries array', () => {
    const result = CreateClientSchema.safeParse({
      name: 'Test',
      countries: [],
      companyType: 'Public',
      industries: ['tech'],
      contactEmail: 'a@b.com',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid email', () => {
    const result = CreateClientSchema.safeParse({
      name: 'Test',
      countries: ['US'],
      companyType: 'Public',
      industries: ['tech'],
      contactEmail: 'not-an-email',
    });
    expect(result.success).toBe(false);
  });
});

describe('ChatRequestSchema', () => {
  it('accepts valid chat request', () => {
    const result = ChatRequestSchema.safeParse({
      clientId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      message: 'What SEC regulations affect our derivatives?',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.conversationId).toBeNull();
      expect(result.data.filters).toBeNull();
    }
  });

  it('accepts chat with filters', () => {
    const result = ChatRequestSchema.safeParse({
      clientId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      message: 'Show me recent changes',
      filters: {
        countries: ['US', 'ES'],
        impactLevel: 'HIGH',
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty message', () => {
    const result = ChatRequestSchema.safeParse({
      clientId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      message: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects message over 2000 chars', () => {
    const result = ChatRequestSchema.safeParse({
      clientId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      message: 'x'.repeat(2001),
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid clientId (not UUID)', () => {
    const result = ChatRequestSchema.safeParse({
      clientId: 'not-a-uuid',
      message: 'test',
    });
    expect(result.success).toBe(false);
  });
});

describe('ListRegulationsSchema', () => {
  it('accepts all optional filters', () => {
    const result = ListRegulationsSchema.safeParse({
      country: 'US',
      area: 'fiscal',
      impactLevel: 'HIGH',
      dateFrom: '2026-01-01',
      dateTo: '2026-12-31',
      page: '1',
      pageSize: '10',
    });
    expect(result.success).toBe(true);
  });

  it('accepts empty query (all defaults)', () => {
    const result = ListRegulationsSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('rejects invalid impactLevel', () => {
    const result = ListRegulationsSchema.safeParse({ impactLevel: 'CRITICAL' });
    expect(result.success).toBe(false);
  });
});

describe('AcknowledgeAlertSchema', () => {
  it('accepts valid ack with notes', () => {
    const result = AcknowledgeAlertSchema.safeParse({
      acknowledgedBy: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      notes: 'Reviewed and confirmed.',
    });
    expect(result.success).toBe(true);
  });

  it('accepts ack without notes', () => {
    const result = AcknowledgeAlertSchema.safeParse({
      acknowledgedBy: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    });
    expect(result.success).toBe(true);
  });

  it('rejects notes over 1000 chars', () => {
    const result = AcknowledgeAlertSchema.safeParse({
      acknowledgedBy: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      notes: 'x'.repeat(1001),
    });
    expect(result.success).toBe(false);
  });
});

describe('TriggerIngestionSchema', () => {
  it('accepts sources filter', () => {
    const result = TriggerIngestionSchema.safeParse({
      sources: ['SEC_EDGAR', 'EUR_LEX'],
    });
    expect(result.success).toBe(true);
  });

  it('accepts countries filter', () => {
    const result = TriggerIngestionSchema.safeParse({
      countries: ['US', 'ES'],
    });
    expect(result.success).toBe(true);
  });

  it('accepts empty body (trigger all)', () => {
    const result = TriggerIngestionSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});
