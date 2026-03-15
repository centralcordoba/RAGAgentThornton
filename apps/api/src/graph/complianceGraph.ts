// ============================================================================
// FILE: apps/api/src/graph/complianceGraph.ts
// Service for querying the Neo4j ComplianceGraph.
//
// Provides:
//   - getClientObligations() — all obligations for a client by country + type
//   - getUpcomingDeadlines() — obligations due within N days across all clients
//   - findAffectedClients() — clients impacted by a regulatory change
//   - updateObligationFromChange() — create change node + MODIFIES relationship
//   - getClientGraph() — full subgraph for visualization
// ============================================================================

import { randomUUID } from 'node:crypto';
import type { ManagedTransaction } from 'neo4j-driver';
import type { Client, RegulatoryChange } from '@regwatch/shared';
import { createServiceLogger } from '../config/logger.js';
import type { Neo4jClient } from './neo4jClient.js';
import type {
  ObligationDetail,
  ObligationMap,
  DeadlineAlert,
  AffectedClient,
  JurisdictionInfo,
  RegulatorInfo,
  DeadlineInfo,
} from './types.js';

const logger = createServiceLogger('graph:compliance');

// ---------------------------------------------------------------------------
// Cypher queries
// ---------------------------------------------------------------------------

const CYPHER = {
  /** Get all obligations for a client based on countries + companyType. */
  CLIENT_OBLIGATIONS: `
    MATCH (j:Jurisdiction)-[:HAS_OBLIGATION]->(o:Obligation)<-[:SUBJECT_TO]-(ct:CompanyType {name: $companyType}),
          (o)-[:HAS_DEADLINE]->(d:Deadline),
          (o)-[:REGULATED_BY]->(r:Regulator)
    WHERE j.country IN $countries
    RETURN j, o, d, r
    ORDER BY d.nextDueDate ASC
  `,

  /** Get upcoming deadlines across all clients within N days. */
  UPCOMING_DEADLINES: `
    MATCH (c:Client)-[:HAS_OBLIGATION]->(o:Obligation)-[:HAS_DEADLINE]->(d:Deadline),
          (o)-[:REGULATED_BY]->(r:Regulator),
          (c)-[:OPERATES_IN]->(j:Jurisdiction)
    WHERE c.tenantId = $tenantId
      AND d.nextDueDate <= date() + duration({days: $days})
      AND d.nextDueDate >= date()
      AND o.status IN ['PENDING', 'IN_PROGRESS']
    RETURN c, j, o, d, r
    ORDER BY d.nextDueDate ASC
  `,

  /** Find clients affected by a change in a specific country/jurisdiction. */
  AFFECTED_CLIENTS: `
    MATCH (c:Client)-[:OPERATES_IN]->(j:Jurisdiction {country: $country}),
          (c)-[:IS_TYPE]->(ct:CompanyType),
          (j)-[:HAS_OBLIGATION]->(o:Obligation)<-[:SUBJECT_TO]-(ct)
    RETURN c.id AS clientId, c.name AS clientName, c.tenantId AS tenantId,
           collect(DISTINCT j.country) AS matchedCountries,
           ct.name AS matchedCompanyType,
           collect(DISTINCT o.title) AS matchedObligations
  `,

  /** Create RegulatoryChange node and MODIFIES relationships. */
  CREATE_CHANGE_NODE: `
    MERGE (rc:RegulatoryChange {id: $changeId})
    ON CREATE SET
      rc.title = $title,
      rc.country = $country,
      rc.jurisdiction = $jurisdiction,
      rc.impactLevel = $impactLevel,
      rc.effectiveDate = date($effectiveDate),
      rc.sourceUrl = $sourceUrl,
      rc.createdAt = datetime()
    WITH rc
    MATCH (j:Jurisdiction {country: $country})-[:HAS_OBLIGATION]->(o:Obligation)
    WHERE any(area IN $affectedAreas WHERE o.area = area)
    CREATE (rc)-[:MODIFIES {detectedAt: datetime(), impactLevel: $impactLevel}]->(o)
    RETURN rc, collect(o.id) AS modifiedObligations
  `,

  /** Get full subgraph for a client (for visualization). */
  CLIENT_SUBGRAPH: `
    MATCH path = (c:Client {id: $clientId})-[*1..${3}]-(connected)
    WHERE c.tenantId = $tenantId
    WITH nodes(path) AS ns, relationships(path) AS rs
    UNWIND ns AS n
    WITH collect(DISTINCT n) AS allNodes, rs
    UNWIND rs AS r
    WITH allNodes, collect(DISTINCT r) AS allRels
    RETURN allNodes, allRels
  `,

  /** Register a client in the graph with relationships. */
  REGISTER_CLIENT: `
    MERGE (c:Client {id: $clientId})
    ON CREATE SET
      c.name = $name,
      c.tenantId = $tenantId,
      c.companyType = $companyType,
      c.createdAt = datetime()
    WITH c
    // Link to jurisdictions
    UNWIND $countries AS countryCode
    MATCH (j:Jurisdiction {country: countryCode})
    MERGE (c)-[:OPERATES_IN]->(j)
    WITH c
    // Link to company type
    MATCH (ct:CompanyType {name: $companyType})
    MERGE (c)-[:IS_TYPE]->(ct)
    WITH c
    // Link to industries
    UNWIND $industries AS industryName
    MATCH (i:Industry {name: industryName})
    MERGE (c)-[:IN_INDUSTRY]->(i)
    WITH DISTINCT c
    // Assign matching obligations
    MATCH (j:Jurisdiction)<-[:OPERATES_IN]-(c)-[:IS_TYPE]->(ct:CompanyType),
          (j)-[:HAS_OBLIGATION]->(o:Obligation)<-[:SUBJECT_TO]-(ct)
    MERGE (c)-[:HAS_OBLIGATION]->(o)
    RETURN c.id AS clientId, count(o) AS assignedObligations
  `,

  /** Remove a client and all its relationships from the graph. */
  REMOVE_CLIENT: `
    MATCH (c:Client {id: $clientId, tenantId: $tenantId})
    DETACH DELETE c
  `,
} as const;

// ---------------------------------------------------------------------------
// ComplianceGraphService
// ---------------------------------------------------------------------------

export class ComplianceGraphService {
  private readonly neo4j: Neo4jClient;

  constructor(neo4j: Neo4jClient) {
    this.neo4j = neo4j;
  }

  // -------------------------------------------------------------------------
  // Client obligations
  // -------------------------------------------------------------------------

  /**
   * Get all obligations for a client based on their countries and company type.
   * Queries the graph: Jurisdiction → Obligation ← CompanyType, with Deadline and Regulator.
   */
  async getClientObligations(client: Client): Promise<ObligationMap> {
    const startTime = Date.now();

    const obligations = await this.neo4j.readTransaction(async (tx) => {
      const result = await tx.run(CYPHER.CLIENT_OBLIGATIONS, {
        countries: client.countries as string[],
        companyType: client.companyType,
      });

      return result.records.map((record) => {
        const j = record.get('j').properties;
        const o = record.get('o').properties;
        const d = record.get('d').properties;
        const r = record.get('r').properties;

        return mapToObligationDetail(j, o, d, r);
      });
    });

    // Group by country
    const byCountry: Record<string, ObligationDetail[]> = {};
    const byArea: Record<string, ObligationDetail[]> = {};

    for (const obl of obligations) {
      const country = obl.jurisdiction.country;
      if (!byCountry[country]) byCountry[country] = [];
      byCountry[country].push(obl);

      const area = obl.area;
      if (!byArea[area]) byArea[area] = [];
      byArea[area].push(obl);
    }

    logger.info({
      operation: 'graph:get_client_obligations',
      clientId: client.id,
      countries: client.countries,
      companyType: client.companyType,
      totalObligations: obligations.length,
      duration: Date.now() - startTime,
      result: 'success',
    });

    return {
      clientId: client.id,
      totalObligations: obligations.length,
      byCountry,
      byArea,
    };
  }

  // -------------------------------------------------------------------------
  // Upcoming deadlines
  // -------------------------------------------------------------------------

  /**
   * Get all upcoming deadlines within N days for a tenant.
   * Returns obligations sorted by due date with urgency classification:
   *   < 30 days → CRITICAL
   *   < 90 days → IMPORTANT
   *   else → NORMAL
   */
  async getUpcomingDeadlines(tenantId: string, days: number): Promise<readonly DeadlineAlert[]> {
    const startTime = Date.now();

    const alerts = await this.neo4j.readTransaction(async (tx) => {
      const result = await tx.run(CYPHER.UPCOMING_DEADLINES, {
        tenantId,
        days: neo4jInt(days),
      });

      return result.records.map((record) => {
        const c = record.get('c').properties;
        const j = record.get('j').properties;
        const o = record.get('o').properties;
        const d = record.get('d').properties;
        const r = record.get('r').properties;

        const obligation = mapToObligationDetail(j, o, d, r);
        const dueDate = parseNeo4jDate(d.nextDueDate);
        const daysUntilDue = Math.ceil((dueDate.getTime() - Date.now()) / 86_400_000);

        let urgency: 'CRITICAL' | 'IMPORTANT' | 'NORMAL';
        if (daysUntilDue <= 30) urgency = 'CRITICAL';
        else if (daysUntilDue <= 90) urgency = 'IMPORTANT';
        else urgency = 'NORMAL';

        return {
          obligation,
          clientId: String(c.id),
          clientName: String(c.name),
          tenantId: String(c.tenantId),
          daysUntilDue,
          urgency,
        } satisfies DeadlineAlert;
      });
    });

    logger.info({
      operation: 'graph:get_upcoming_deadlines',
      tenantId,
      days,
      alertsCount: alerts.length,
      criticalCount: alerts.filter((a) => a.urgency === 'CRITICAL').length,
      duration: Date.now() - startTime,
      result: 'success',
    });

    return alerts;
  }

  // -------------------------------------------------------------------------
  // Affected clients
  // -------------------------------------------------------------------------

  /**
   * Given a regulatory change, find all clients with matching obligations.
   * Matches on country + company type → obligations in that jurisdiction.
   */
  async findAffectedClients(change: RegulatoryChange): Promise<readonly AffectedClient[]> {
    const startTime = Date.now();

    const clients = await this.neo4j.readTransaction(async (tx) => {
      const result = await tx.run(CYPHER.AFFECTED_CLIENTS, {
        country: change.country,
      });

      return result.records.map((record) => ({
        clientId: String(record.get('clientId')),
        clientName: String(record.get('clientName')),
        tenantId: String(record.get('tenantId')),
        matchedCountries: record.get('matchedCountries') as readonly string[],
        matchedCompanyType: String(record.get('matchedCompanyType')),
        matchedObligations: record.get('matchedObligations') as readonly string[],
      }));
    });

    logger.info({
      operation: 'graph:find_affected_clients',
      changeId: change.id,
      country: change.country,
      affectedClientsCount: clients.length,
      duration: Date.now() - startTime,
      result: 'success',
    });

    return clients;
  }

  // -------------------------------------------------------------------------
  // Update graph from regulatory change
  // -------------------------------------------------------------------------

  /**
   * When a regulatory change is detected, update the graph:
   * 1. Create/merge a RegulatoryChange node
   * 2. Create MODIFIES relationships to affected obligations
   */
  async updateObligationFromChange(change: RegulatoryChange): Promise<readonly string[]> {
    const startTime = Date.now();

    const modifiedObligationIds = await this.neo4j.writeTransaction(async (tx) => {
      const result = await tx.run(CYPHER.CREATE_CHANGE_NODE, {
        changeId: change.id,
        title: change.title,
        country: change.country,
        jurisdiction: change.jurisdiction,
        impactLevel: change.impactLevel,
        effectiveDate: change.effectiveDate.toISOString().split('T')[0]!,
        sourceUrl: change.sourceUrl,
        affectedAreas: change.affectedAreas as string[],
      });

      if (result.records.length === 0) return [];
      return result.records[0]!.get('modifiedObligations') as string[];
    });

    logger.info({
      operation: 'graph:update_from_change',
      changeId: change.id,
      country: change.country,
      impactLevel: change.impactLevel,
      modifiedObligationsCount: modifiedObligationIds.length,
      modifiedObligationIds,
      duration: Date.now() - startTime,
      result: 'success',
    });

    return modifiedObligationIds;
  }

  // -------------------------------------------------------------------------
  // Client registration
  // -------------------------------------------------------------------------

  /**
   * Register a client in the graph and assign all matching obligations.
   * Creates: Client node + OPERATES_IN, IS_TYPE, IN_INDUSTRY, HAS_OBLIGATION relationships.
   */
  async registerClient(client: Client): Promise<number> {
    const startTime = Date.now();

    const assignedObligations = await this.neo4j.writeTransaction(async (tx) => {
      const result = await tx.run(CYPHER.REGISTER_CLIENT, {
        clientId: client.id,
        name: client.name,
        tenantId: client.tenantId,
        companyType: client.companyType,
        countries: client.countries as string[],
        industries: client.industries as string[],
      });

      if (result.records.length === 0) return 0;

      const count = result.records[0]!.get('assignedObligations');
      return typeof count === 'object' && 'toNumber' in count
        ? (count as { toNumber(): number }).toNumber()
        : Number(count);
    });

    logger.info({
      operation: 'graph:register_client',
      clientId: client.id,
      tenantId: client.tenantId,
      countries: client.countries,
      companyType: client.companyType,
      assignedObligations,
      duration: Date.now() - startTime,
      result: 'success',
    });

    return assignedObligations;
  }

  /**
   * Remove a client from the graph (detach delete).
   */
  async removeClient(clientId: string, tenantId: string): Promise<void> {
    await this.neo4j.writeTransaction(async (tx) => {
      await tx.run(CYPHER.REMOVE_CLIENT, { clientId, tenantId });
    });

    logger.info({
      operation: 'graph:remove_client',
      clientId,
      tenantId,
      result: 'success',
    });
  }

  // -------------------------------------------------------------------------
  // Client subgraph (visualization)
  // -------------------------------------------------------------------------

  /**
   * Get the full subgraph for a client up to a given depth.
   * Used by GET /api/clients/:id/graph for frontend visualization.
   */
  async getClientGraph(
    clientId: string,
    tenantId: string,
    depth: number = 3,
  ): Promise<GraphVisualization> {
    const startTime = Date.now();

    // Build query with dynamic depth
    const query = `
      MATCH path = (c:Client {id: $clientId, tenantId: $tenantId})-[*1..${Math.min(depth, 5)}]-(connected)
      WITH nodes(path) AS ns, relationships(path) AS rs
      UNWIND ns AS n
      WITH collect(DISTINCT n) AS allNodes, rs
      UNWIND rs AS r
      WITH allNodes, collect(DISTINCT r) AS allRels
      RETURN allNodes, allRels
    `;

    const graph = await this.neo4j.readTransaction(async (tx) => {
      const result = await tx.run(query, { clientId, tenantId });

      if (result.records.length === 0) {
        return { nodes: [], edges: [] };
      }

      const record = result.records[0]!;
      const rawNodes = record.get('allNodes') as readonly Neo4jNode[];
      const rawRels = record.get('allRels') as readonly Neo4jRelationship[];

      const nodes: GraphNode[] = rawNodes.map((n) => ({
        id: String(n.properties.id ?? n.elementId),
        label: String(n.properties.name ?? n.properties.title ?? n.labels[0] ?? 'Unknown'),
        type: n.labels[0] ?? 'Unknown',
        properties: serializeProperties(n.properties),
      }));

      const edges: GraphEdge[] = rawRels.map((r) => ({
        id: r.elementId,
        source: String(r.startNodeElementId),
        target: String(r.endNodeElementId),
        relationship: r.type,
        properties: serializeProperties(r.properties),
      }));

      return { nodes, edges };
    });

    logger.info({
      operation: 'graph:get_client_graph',
      clientId,
      tenantId,
      depth,
      nodesCount: graph.nodes.length,
      edgesCount: graph.edges.length,
      duration: Date.now() - startTime,
      result: 'success',
    });

    return graph;
  }

  // -------------------------------------------------------------------------
  // Health
  // -------------------------------------------------------------------------

  async ping(): Promise<boolean> {
    return this.neo4j.ping();
  }
}

// ---------------------------------------------------------------------------
// Graph visualization types
// ---------------------------------------------------------------------------

export interface GraphVisualization {
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
}

export interface GraphNode {
  readonly id: string;
  readonly label: string;
  readonly type: string;
  readonly properties: Readonly<Record<string, string | number | boolean>>;
}

export interface GraphEdge {
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly relationship: string;
  readonly properties: Readonly<Record<string, string | number | boolean>>;
}

// ---------------------------------------------------------------------------
// Internal Neo4j types
// ---------------------------------------------------------------------------

interface Neo4jNode {
  readonly elementId: string;
  readonly labels: readonly string[];
  readonly properties: Record<string, unknown>;
}

interface Neo4jRelationship {
  readonly elementId: string;
  readonly type: string;
  readonly startNodeElementId: string;
  readonly endNodeElementId: string;
  readonly properties: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapToObligationDetail(
  j: Record<string, unknown>,
  o: Record<string, unknown>,
  d: Record<string, unknown>,
  r: Record<string, unknown>,
): ObligationDetail {
  return {
    id: String(o.id),
    title: String(o.title),
    description: String(o.description ?? ''),
    area: String(o.area),
    status: String(o.status ?? 'PENDING'),
    frequency: String(o.frequency ?? ''),
    penaltyInfo: String(o.penaltyInfo ?? ''),
    jurisdiction: {
      id: String(j.id),
      country: String(j.country),
      name: String(j.name),
      region: String(j.region ?? ''),
    },
    regulator: {
      id: String(r.id),
      name: String(r.name),
      country: String(r.country),
      website: String(r.website ?? ''),
    },
    deadline: {
      id: String(d.id),
      nextDueDate: formatNeo4jDate(d.nextDueDate),
      type: String(d.type) as 'hard' | 'soft',
      frequency: String(d.frequency ?? ''),
      penaltyInfo: String(d.penaltyInfo ?? ''),
    },
  };
}

/** Parse a Neo4j date object to JS Date. */
function parseNeo4jDate(value: unknown): Date {
  if (value instanceof Date) return value;
  if (typeof value === 'string') return new Date(value);
  // Neo4j date objects have year, month, day properties
  if (value && typeof value === 'object' && 'year' in value) {
    const d = value as { year: { toNumber?: () => number }; month: { toNumber?: () => number }; day: { toNumber?: () => number } };
    const year = typeof d.year === 'object' && d.year.toNumber ? d.year.toNumber() : Number(d.year);
    const month = typeof d.month === 'object' && d.month.toNumber ? d.month.toNumber() : Number(d.month);
    const day = typeof d.day === 'object' && d.day.toNumber ? d.day.toNumber() : Number(d.day);
    return new Date(year, month - 1, day);
  }
  return new Date();
}

/** Format a Neo4j date to ISO string (YYYY-MM-DD). */
function formatNeo4jDate(value: unknown): string {
  const date = parseNeo4jDate(value);
  return date.toISOString().split('T')[0]!;
}

/** Convert Neo4j integer to JS number. */
function neo4jInt(value: number): number {
  return value;
}

/** Serialize Neo4j properties to plain object (handle Neo4j Integer, Date, etc). */
function serializeProperties(
  props: Record<string, unknown>,
): Record<string, string | number | boolean> {
  const result: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined) continue;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      result[key] = value;
    } else if (typeof value === 'object' && value !== null && 'toNumber' in value) {
      result[key] = (value as { toNumber(): number }).toNumber();
    } else if (typeof value === 'object' && value !== null && 'year' in value) {
      result[key] = formatNeo4jDate(value);
    } else {
      result[key] = String(value);
    }
  }
  return result;
}
