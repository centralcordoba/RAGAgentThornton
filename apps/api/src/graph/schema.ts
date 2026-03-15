// ============================================================================
// FILE: apps/api/src/graph/schema.ts
// Neo4j schema definition: constraints, indexes, and relationship patterns.
// ============================================================================

/**
 * Constraint queries — run once at application startup.
 * Safe to run multiple times (IF NOT EXISTS).
 */
export const SCHEMA_CONSTRAINTS = [
  // Node uniqueness constraints
  'CREATE CONSTRAINT jurisdiction_id IF NOT EXISTS FOR (j:Jurisdiction) REQUIRE j.id IS UNIQUE',
  'CREATE CONSTRAINT obligation_id IF NOT EXISTS FOR (o:Obligation) REQUIRE o.id IS UNIQUE',
  'CREATE CONSTRAINT company_type_id IF NOT EXISTS FOR (ct:CompanyType) REQUIRE ct.id IS UNIQUE',
  'CREATE CONSTRAINT regulator_id IF NOT EXISTS FOR (r:Regulator) REQUIRE r.id IS UNIQUE',
  'CREATE CONSTRAINT deadline_id IF NOT EXISTS FOR (d:Deadline) REQUIRE d.id IS UNIQUE',
  'CREATE CONSTRAINT regulation_id IF NOT EXISTS FOR (rc:RegulatoryChange) REQUIRE rc.id IS UNIQUE',
  'CREATE CONSTRAINT industry_id IF NOT EXISTS FOR (i:Industry) REQUIRE i.id IS UNIQUE',
  'CREATE CONSTRAINT client_id IF NOT EXISTS FOR (c:Client) REQUIRE c.id IS UNIQUE',
] as const;

/**
 * Index queries — for performance on frequently filtered properties.
 */
export const SCHEMA_INDEXES = [
  'CREATE INDEX jurisdiction_country IF NOT EXISTS FOR (j:Jurisdiction) ON (j.country)',
  'CREATE INDEX obligation_status IF NOT EXISTS FOR (o:Obligation) ON (o.status)',
  'CREATE INDEX obligation_area IF NOT EXISTS FOR (o:Obligation) ON (o.area)',
  'CREATE INDEX deadline_date IF NOT EXISTS FOR (d:Deadline) ON (d.nextDueDate)',
  'CREATE INDEX regulation_country IF NOT EXISTS FOR (rc:RegulatoryChange) ON (rc.country)',
  'CREATE INDEX client_tenant IF NOT EXISTS FOR (c:Client) ON (c.tenantId)',
] as const;

/**
 * Core relationship patterns documented for reference.
 *
 * (Jurisdiction)-[:HAS_OBLIGATION]->(Obligation)
 * (CompanyType)-[:SUBJECT_TO]->(Obligation)
 * (Obligation)-[:HAS_DEADLINE]->(Deadline)
 * (Obligation)-[:REGULATED_BY]->(Regulator)
 * (RegulatoryChange)-[:MODIFIES]->(Obligation)
 * (Industry)-[:REGULATED_BY]->(Regulator)
 * (Regulator)-[:OPERATES_IN]->(Jurisdiction)
 * (Client)-[:OPERATES_IN]->(Jurisdiction)
 * (Client)-[:IS_TYPE]->(CompanyType)
 * (Client)-[:IN_INDUSTRY]->(Industry)
 * (Client)-[:HAS_OBLIGATION]->(Obligation)
 */

// ---------------------------------------------------------------------------
// Node property interfaces (for typed Cypher parameters)
// ---------------------------------------------------------------------------

export interface JurisdictionNode {
  readonly id: string;
  readonly country: string;
  readonly name: string;
  readonly region: string;
}

export interface ObligationNode {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly area: string;
  readonly status: string;
  readonly frequency: string;
  readonly penaltyInfo: string;
}

export interface CompanyTypeNode {
  readonly id: string;
  readonly name: string;
}

export interface RegulatorNode {
  readonly id: string;
  readonly name: string;
  readonly country: string;
  readonly website: string;
}

export interface DeadlineNode {
  readonly id: string;
  readonly nextDueDate: string;
  readonly type: 'hard' | 'soft';
  readonly frequency: string;
  readonly penaltyInfo: string;
}

export interface IndustryNode {
  readonly id: string;
  readonly name: string;
  readonly sectorCode: string;
}
