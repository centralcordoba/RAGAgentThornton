// ============================================================================
// FILE: apps/api/src/graph/types.ts
// Types for Neo4j graph query results.
// ============================================================================

import type { ImpactLevel, ObligationStatus } from '@regwatch/shared';

/** Full obligation with all graph-derived context. */
export interface ObligationDetail {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly area: string;
  readonly status: string;
  readonly frequency: string;
  readonly penaltyInfo: string;
  readonly jurisdiction: JurisdictionInfo;
  readonly regulator: RegulatorInfo;
  readonly deadline: DeadlineInfo;
}

export interface JurisdictionInfo {
  readonly id: string;
  readonly country: string;
  readonly name: string;
  readonly region: string;
}

export interface RegulatorInfo {
  readonly id: string;
  readonly name: string;
  readonly country: string;
  readonly website: string;
}

export interface DeadlineInfo {
  readonly id: string;
  readonly nextDueDate: string;
  readonly type: 'hard' | 'soft';
  readonly frequency: string;
  readonly penaltyInfo: string;
}

/** Grouped obligations by country for a client. */
export interface ObligationMap {
  readonly clientId: string;
  readonly totalObligations: number;
  readonly byCountry: Readonly<Record<string, readonly ObligationDetail[]>>;
  readonly byArea: Readonly<Record<string, readonly ObligationDetail[]>>;
}

/** Deadline alert for upcoming due dates. */
export interface DeadlineAlert {
  readonly obligation: ObligationDetail;
  readonly clientId: string;
  readonly clientName: string;
  readonly tenantId: string;
  readonly daysUntilDue: number;
  readonly urgency: 'CRITICAL' | 'IMPORTANT' | 'NORMAL';
}

/** Result of finding clients affected by a regulatory change. */
export interface AffectedClient {
  readonly clientId: string;
  readonly clientName: string;
  readonly tenantId: string;
  readonly matchedCountries: readonly string[];
  readonly matchedCompanyType: string;
  readonly matchedObligations: readonly string[];
}
