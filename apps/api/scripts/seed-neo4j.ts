// ============================================================================
// FILE: apps/api/scripts/seed-neo4j.ts
// Populates Neo4j ComplianceGraph from PostgreSQL data.
//
// Creates nodes: Client, Jurisdiction, Regulation, Obligation, Regulator, Industry
// Creates relationships: OPERATES_IN, HAS_OBLIGATION, REQUIRED_BY, PUBLISHES, etc.
//
// Usage:
//   npx tsx --tsconfig tsconfig.json apps/api/scripts/seed-neo4j.ts
//
// Prerequisites: PostgreSQL seeded + Neo4j running (docker compose up neo4j)
// ============================================================================

import { PrismaClient } from '@prisma/client';
import { Neo4jClient } from '../src/graph/neo4jClient.js';

function log(tag: string, msg: string): void {
  const ts = new Date().toISOString().split('T')[1]!.slice(0, 8);
  console.log(`[${ts}] ${tag} ${msg}`);
}

async function seedNeo4j(): Promise<void> {
  const prisma = new PrismaClient();
  await prisma.$connect();
  log('DB', 'PostgreSQL connected');

  const neo4jUri = process.env['NEO4J_URI'];
  const neo4jUser = process.env['NEO4J_USER'] ?? 'neo4j';
  const neo4jPassword = process.env['NEO4J_PASSWORD'];

  if (!neo4jUri || !neo4jPassword) {
    console.error('NEO4J_URI and NEO4J_PASSWORD required. Set in .env');
    process.exit(1);
  }

  const neo4j = new Neo4jClient(neo4jUri, neo4jUser, neo4jPassword);
  await neo4j.initialize();
  log('NEO4J', 'Connected and schema initialized');

  const stats = { jurisdictions: 0, regulators: 0, regulations: 0, clients: 0, obligations: 0, relationships: 0 };

  // =========================================================================
  // 1. Jurisdictions
  // =========================================================================
  log('NODES', 'Creating Jurisdiction nodes...');

  const countries = new Set<string>();
  const regs = await prisma.regulatoryChange.findMany({ select: { country: true } });
  const clients = await prisma.client.findMany({ select: { countries: true } });
  regs.forEach((r) => countries.add(r.country));
  clients.forEach((c) => c.countries.forEach((cc) => countries.add(cc)));

  const COUNTRY_NAMES: Record<string, string> = {
    US: 'Estados Unidos', EU: 'Union Europea', ES: 'Espana', DE: 'Alemania',
    FR: 'Francia', BR: 'Brasil', MX: 'Mexico', AR: 'Argentina', IT: 'Italia',
    NL: 'Paises Bajos', IE: 'Irlanda', CL: 'Chile',
  };

  const REGIONS: Record<string, string> = {
    US: 'North America', EU: 'Europe', ES: 'Europe', DE: 'Europe',
    FR: 'Europe', BR: 'LATAM', MX: 'LATAM', AR: 'LATAM',
    IT: 'Europe', NL: 'Europe', IE: 'Europe', CL: 'LATAM',
  };

  for (const code of countries) {
    const session = neo4j.getSession();
    try {
      await session.run(
        `MERGE (j:Jurisdiction {country: $code})
         ON CREATE SET j.name = $name, j.region = $region`,
        { code, name: COUNTRY_NAMES[code] ?? code, region: REGIONS[code] ?? 'Other' },
      );
      stats.jurisdictions++;
    } finally {
      await session.close();
    }
  }
  log('NODES', `  ${stats.jurisdictions} jurisdictions`);

  // =========================================================================
  // 2. Regulators
  // =========================================================================
  log('NODES', 'Creating Regulator nodes...');

  const regulators = [
    { name: 'SEC', fullName: 'Securities and Exchange Commission', country: 'US' },
    { name: 'FERC', fullName: 'Federal Energy Regulatory Commission', country: 'US' },
    { name: 'EU Commission', fullName: 'European Commission', country: 'EU' },
    { name: 'EBA', fullName: 'European Banking Authority', country: 'EU' },
    { name: 'ESMA', fullName: 'European Securities and Markets Authority', country: 'EU' },
    { name: 'CNMV', fullName: 'Comision Nacional del Mercado de Valores', country: 'ES' },
    { name: 'BCB', fullName: 'Banco Central do Brasil', country: 'BR' },
    { name: 'CVM', fullName: 'Comissao de Valores Mobiliarios', country: 'BR' },
    { name: 'ANPD', fullName: 'Autoridade Nacional de Protecao de Dados', country: 'BR' },
  ];

  for (const reg of regulators) {
    const session = neo4j.getSession();
    try {
      await session.run(
        `MERGE (r:Regulator {name: $name})
         ON CREATE SET r.fullName = $fullName, r.country = $country
         WITH r
         MATCH (j:Jurisdiction {country: $country})
         MERGE (r)-[:REGULATES]->(j)`,
        reg,
      );
      stats.regulators++;
      stats.relationships++;
    } finally {
      await session.close();
    }
  }
  log('NODES', `  ${stats.regulators} regulators`);

  // =========================================================================
  // 3. Regulations (from PostgreSQL)
  // =========================================================================
  log('NODES', 'Creating Regulation nodes from DB...');

  const allRegs = await prisma.regulatoryChange.findMany({
    select: { id: true, title: true, country: true, impactLevel: true, effectiveDate: true, affectedAreas: true, affectedIndustries: true },
  });

  for (const r of allRegs) {
    const session = neo4j.getSession();
    try {
      await session.run(
        `MERGE (reg:Regulation {id: $id})
         ON CREATE SET reg.title = $title, reg.country = $country,
           reg.impactLevel = $impactLevel, reg.effectiveDate = $effectiveDate,
           reg.areas = $areas
         WITH reg
         MATCH (j:Jurisdiction {country: $country})
         MERGE (reg)-[:APPLIES_TO]->(j)`,
        {
          id: r.id,
          title: r.title,
          country: r.country,
          impactLevel: r.impactLevel,
          effectiveDate: r.effectiveDate.toISOString().split('T')[0]!,
          areas: r.affectedAreas as string[],
        },
      );
      stats.regulations++;
      stats.relationships++;
    } finally {
      await session.close();
    }
  }
  log('NODES', `  ${stats.regulations} regulations`);

  // =========================================================================
  // 4. Clients (from PostgreSQL)
  // =========================================================================
  log('NODES', 'Creating Client nodes from DB...');

  const allClients = await prisma.client.findMany({
    where: { isActive: true },
    select: { id: true, name: true, tenantId: true, companyType: true, countries: true, industries: true },
  });

  for (const c of allClients) {
    const session = neo4j.getSession();
    try {
      await session.run(
        `MERGE (c:Client {id: $id})
         ON CREATE SET c.name = $name, c.tenantId = $tenantId, c.companyType = $companyType`,
        { id: c.id, name: c.name, tenantId: c.tenantId, companyType: c.companyType },
      );

      // OPERATES_IN relationships
      for (const country of c.countries) {
        await session.run(
          `MATCH (c:Client {id: $clientId}), (j:Jurisdiction {country: $country})
           MERGE (c)-[:OPERATES_IN]->(j)`,
          { clientId: c.id, country },
        );
        stats.relationships++;
      }

      stats.clients++;
    } finally {
      await session.close();
    }
  }
  log('NODES', `  ${stats.clients} clients`);

  // =========================================================================
  // 5. Obligations (from PostgreSQL) + relationships
  // =========================================================================
  log('NODES', 'Creating Obligation nodes + relationships...');

  const allObls = await prisma.obligation.findMany({
    include: {
      client: { select: { id: true } },
      change: { select: { id: true, country: true } },
    },
  });

  for (const o of allObls) {
    const session = neo4j.getSession();
    try {
      await session.run(
        `MERGE (obl:Obligation {id: $id})
         ON CREATE SET obl.title = $title, obl.status = $status,
           obl.priority = $priority, obl.deadline = $deadline
         WITH obl
         // Link to client
         MATCH (c:Client {id: $clientId})
         MERGE (c)-[:HAS_OBLIGATION]->(obl)
         WITH obl
         // Link to regulation
         MATCH (reg:Regulation {id: $changeId})
         MERGE (reg)-[:REQUIRES]->(obl)
         WITH obl
         // Link to jurisdiction
         MATCH (j:Jurisdiction {country: $country})
         MERGE (obl)-[:IN_JURISDICTION]->(j)`,
        {
          id: o.id,
          title: o.title,
          status: o.status,
          priority: o.priority,
          deadline: o.deadline.toISOString().split('T')[0]!,
          clientId: o.client.id,
          changeId: o.change.id,
          country: o.change.country,
        },
      );
      stats.obligations++;
      stats.relationships += 3; // client, regulation, jurisdiction
    } finally {
      await session.close();
    }
  }
  log('NODES', `  ${stats.obligations} obligations`);

  // =========================================================================
  // Summary
  // =========================================================================

  // Count total nodes and relationships
  const session = neo4j.getSession();
  try {
    const nodeCount = await session.run('MATCH (n) RETURN count(n) AS count');
    const relCount = await session.run('MATCH ()-[r]->() RETURN count(r) AS count');
    const totalNodes = nodeCount.records[0]?.get('count').toNumber() ?? 0;
    const totalRels = relCount.records[0]?.get('count').toNumber() ?? 0;

    console.log('\n' + '='.repeat(60));
    log('DONE', 'Neo4j ComplianceGraph seeded!');
    console.log('='.repeat(60));
    console.log(`  Jurisdictions: ${stats.jurisdictions}`);
    console.log(`  Regulators:    ${stats.regulators}`);
    console.log(`  Regulations:   ${stats.regulations}`);
    console.log(`  Clients:       ${stats.clients}`);
    console.log(`  Obligations:   ${stats.obligations}`);
    console.log(`  Total nodes:   ${totalNodes}`);
    console.log(`  Total rels:    ${totalRels}`);
    console.log('='.repeat(60));
  } finally {
    await session.close();
  }

  await neo4j.close();
  await prisma.$disconnect();
}

seedNeo4j().catch((err) => { console.error('Seed failed:', err); process.exit(1); });
