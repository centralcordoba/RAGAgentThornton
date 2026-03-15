// ============================================================================
// RegWatch AI — Zod Schemas for Runtime Validation
// Used at API boundaries (request validation, external data parsing)
// ============================================================================

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Enum schemas
// ---------------------------------------------------------------------------

export const ImpactLevelSchema = z.enum(['HIGH', 'MEDIUM', 'LOW']);

export const AlertChannelSchema = z.enum(['EMAIL', 'TEAMS', 'SSE']);

export const AlertStatusSchema = z.enum([
  'PENDING_REVIEW',
  'APPROVED',
  'SENT',
  'ACKNOWLEDGED',
  'DISMISSED',
]);

export const ObligationStatusSchema = z.enum([
  'PENDING',
  'IN_PROGRESS',
  'COMPLETED',
  'OVERDUE',
  'WAIVED',
]);

export const RegulatorySourceTypeSchema = z.enum([
  'LEGISLATIVE',
  'REGULATORY',
  'GUIDANCE',
  'ENFORCEMENT',
]);

export const UserRoleSchema = z.enum(['ADMIN', 'PROFESSIONAL', 'CLIENT_VIEWER']);

// ---------------------------------------------------------------------------
// Request schemas — API input validation
// ---------------------------------------------------------------------------

export const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const CreateClientSchema = z.object({
  name: z.string().min(1).max(255),
  countries: z.array(z.string().length(2)).min(1),
  companyType: z.string().min(1).max(100),
  industries: z.array(z.string().min(1)).min(1),
  contactEmail: z.string().email(),
});

export const ChatRequestSchema = z.object({
  clientId: z.string().uuid(),
  message: z.string().min(1).max(2000),
  conversationId: z.string().uuid().nullable().default(null),
  filters: z
    .object({
      countries: z.array(z.string().length(2)).nullable().default(null),
      industries: z.array(z.string()).nullable().default(null),
      impactLevel: ImpactLevelSchema.nullable().default(null),
      dateFrom: z.coerce.date().nullable().default(null),
      dateTo: z.coerce.date().nullable().default(null),
    })
    .nullable()
    .default(null),
});

export const TriggerIngestionSchema = z.object({
  sources: z.array(z.string().min(1)).min(1).optional(),
  countries: z.array(z.string().length(2)).min(1).optional(),
});

export const ListRegulationsSchema = z.object({
  country: z.string().length(2).optional(),
  area: z.string().optional(),
  impactLevel: ImpactLevelSchema.optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
}).merge(PaginationSchema);

export const AcknowledgeAlertSchema = z.object({
  acknowledgedBy: z.string().uuid(),
  notes: z.string().max(1000).optional(),
});

export const ListAlertsSchema = z.object({
  clientId: z.string().uuid().optional(),
  status: AlertStatusSchema.optional(),
  impactLevel: ImpactLevelSchema.optional(),
  channel: AlertChannelSchema.optional(),
}).merge(PaginationSchema);

// ---------------------------------------------------------------------------
// Type inference helpers
// ---------------------------------------------------------------------------

export type CreateClientInput = z.infer<typeof CreateClientSchema>;
export type ChatRequestInput = z.infer<typeof ChatRequestSchema>;
export type TriggerIngestionInput = z.infer<typeof TriggerIngestionSchema>;
export type ListRegulationsInput = z.infer<typeof ListRegulationsSchema>;
export type AcknowledgeAlertInput = z.infer<typeof AcknowledgeAlertSchema>;
export type ListAlertsInput = z.infer<typeof ListAlertsSchema>;
export type PaginationInput = z.infer<typeof PaginationSchema>;
