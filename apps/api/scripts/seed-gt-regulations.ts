// ============================================================================
// FILE: apps/api/scripts/seed-gt-regulations.ts
// Seed GT high-impact regulations — DORA, CSRD, SEC Climate, Pillar Two.
//
// Fetches real text from EUR-Lex and Federal Register (no API key).
// Creates regulations, obligations, and demo clients in PostgreSQL.
//
// Usage:
//   npx tsx --tsconfig tsconfig.json apps/api/scripts/seed-gt-regulations.ts
//
// Prerequisites:
//   - PostgreSQL running (DATABASE_URL in .env)
//   - seed-real.ts already ran (sources exist)
// ============================================================================

import { PrismaClient } from '@prisma/client';
import { EurLexConnector } from '../src/jobs/ingestion/connectors/EurLexConnector.js';
import { BoeSpainConnector } from '../src/jobs/ingestion/connectors/BoeSpainConnector.js';
import { RateLimitedHttpClient } from '../src/jobs/ingestion/connectors/httpClient.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DEMO_TENANT_ID = '00000000-0000-0000-0000-000000000001';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function log(tag: string, message: string): void {
  const ts = new Date().toISOString().split('T')[1]!.slice(0, 8);
  console.log(`[${ts}] ${tag} ${message}`);
}

// ---------------------------------------------------------------------------
// GT Regulation definitions
// ---------------------------------------------------------------------------

const DORA_REG = {
  celex: '32022R2554',
  title: 'DORA — Digital Operational Resilience Act',
  summary: 'Regulation (EU) 2022/2554 on digital operational resilience for the financial sector. Requires financial entities to implement ICT risk management frameworks, incident reporting, digital operational resilience testing, and ICT third-party risk management. Effective 17 January 2025.',
  effectiveDate: '2025-01-17',
  publishedDate: '2022-12-27',
  areas: ['digital-finance', 'banking', 'securities', 'insurance'],
  industries: ['banking', 'insurance', 'asset-management', 'securities', 'fintech'],
  affectedCountries: ['ES', 'DE', 'FR', 'IT', 'NL', 'IE'],
  deadlines: [
    { title: 'DORA — ICT Risk Management Framework obligatorio', date: '2025-01-17', status: 'OVERDUE' as const },
    { title: 'DORA — Registro de contratos con proveedores TIC', date: '2025-04-17', status: 'OVERDUE' as const },
    { title: 'DORA — Primer reporte de incidentes ICT a regulador', date: '2025-07-17', status: 'OVERDUE' as const },
  ],
};

const CSRD_REG = {
  celex: '32022L2464',
  title: 'CSRD — Corporate Sustainability Reporting Directive',
  summary: 'Directive (EU) 2022/2464 amending the Non-Financial Reporting Directive (NFRD). Requires companies to report on sustainability matters using European Sustainability Reporting Standards (ESRS). Phased implementation: large public-interest entities from 2025, large companies from 2026, listed SMEs from 2027.',
  effectiveDate: '2025-01-01',
  publishedDate: '2022-12-16',
  areas: ['sustainability', 'corporate', 'disclosure'],
  industries: ['public-companies', 'financial-services', 'manufacturing', 'energy'],
  affectedCountries: ['ES', 'DE', 'FR', 'IT', 'NL'],
  deadlines: [
    { title: 'CSRD Fase 1 — Empresas ya sujetas a NFRD (+500 empleados, cotizadas)', date: '2025-01-01', status: 'OVERDUE' as const },
    { title: 'CSRD Fase 2 — Grandes empresas no cotizadas (+250 empleados)', date: '2026-01-01', status: 'PENDING' as const },
    { title: 'CSRD Fase 3 — PYMEs cotizadas', date: '2027-01-01', status: 'PENDING' as const },
  ],
};

const SEC_CLIMATE_REG = {
  title: 'SEC Climate-Related Disclosures for Investors',
  summary: 'SEC final rule requiring registrants to provide climate-related information in registration statements and annual reports. Includes disclosure of material climate-related risks, risk management activities, board oversight, GHG emissions (Scopes 1, 2, and for large accelerated filers, Scope 3), and financial statement effects of severe weather events.',
  effectiveDate: '2026-03-15',
  publishedDate: '2024-03-06',
  areas: ['environmental', 'securities', 'disclosure', 'climate'],
  industries: ['public-companies', 'energy', 'manufacturing', 'financial-services'],
  affectedCountries: ['US'],
  deadlines: [
    { title: 'SEC Climate — Large accelerated filers (primera disclosure)', date: '2026-03-15', status: 'PENDING' as const },
    { title: 'SEC Climate — Accelerated filers', date: '2027-03-15', status: 'PENDING' as const },
  ],
};

const PILLAR_TWO_REG = {
  celex: '32022L2523',
  title: 'Pillar Two — Global Minimum Tax 15% (EU Directive)',
  summary: 'Council Directive (EU) 2022/2523 on ensuring a global minimum level of taxation for multinational enterprise groups and large-scale domestic groups (Pillar Two). Implements the OECD/G20 Inclusive Framework agreement requiring a 15% minimum effective tax rate for groups with consolidated revenue exceeding EUR 750 million.',
  effectiveDate: '2024-12-31',
  publishedDate: '2022-12-22',
  areas: ['fiscal', 'corporate', 'international-tax'],
  industries: ['public-companies', 'financial-services', 'manufacturing', 'energy'],
  affectedCountries: ['ES', 'DE', 'FR', 'IT', 'NL', 'MX'],
  deadlines: [
    { title: 'Pillar Two — Primer ejercicio fiscal (IIR, Income Inclusion Rule)', date: '2024-12-31', status: 'OVERDUE' as const },
    { title: 'Pillar Two — UTPR (Undertaxed Profits Rule)', date: '2025-12-31', status: 'PENDING' as const },
    { title: 'Pillar Two — España: Ley del Impuesto Complementario primer período', date: '2025-12-31', status: 'PENDING' as const },
  ],
};

// Federal Register API for SEC Climate docs
const FEDERAL_REGISTER_URL = 'https://www.federalregister.gov/api/v1/documents.json?per_page=3&order=newest&conditions[agencies][]=securities-and-exchange-commission&conditions[term]=climate+disclosure';

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function seedGTRegulations(): Promise<void> {
  const prisma = new PrismaClient();
  const eurLex = new EurLexConnector();
  const boe = new BoeSpainConnector();
  const http = new RateLimitedHttpClient('FEDERAL_REGISTER', { maxRequestsPerSecond: 5 });

  try {
    await prisma.$connect();
    log('DB', 'Connected to PostgreSQL');
  } catch (err) {
    console.error('Failed to connect to PostgreSQL:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  // Ensure EUR-Lex source exists
  const eurLexSource = await prisma.regulatorySource.upsert({
    where: { country_name: { country: 'EU', name: 'EUR-Lex' } },
    update: {},
    create: {
      name: 'EUR-Lex', country: 'EU', jurisdiction: 'EU',
      url: 'https://eur-lex.europa.eu', type: 'LEGISLATIVE',
      connectorType: 'RSS', isActive: true, checkIntervalMinutes: 60,
      baseUrl: 'https://eur-lex.europa.eu/tools/rss.do',
      regulatoryArea: 'financial,sustainability,fiscal', frequency: 'hourly',
    },
  });

  const secSource = await prisma.regulatorySource.upsert({
    where: { country_name: { country: 'US', name: 'SEC EDGAR' } },
    update: {},
    create: {
      name: 'SEC EDGAR', country: 'US', jurisdiction: 'US-FED',
      url: 'https://data.sec.gov', type: 'REGULATORY',
      connectorType: 'API', isActive: true, checkIntervalMinutes: 10,
      baseUrl: 'https://data.sec.gov/submissions',
      regulatoryArea: 'securities,climate', frequency: 'every_10min',
    },
  });

  const boeSource = await prisma.regulatorySource.upsert({
    where: { country_name: { country: 'ES', name: 'BOE Spain' } },
    update: {},
    create: {
      name: 'BOE Spain', country: 'ES', jurisdiction: 'ES',
      url: 'https://www.boe.es', type: 'LEGISLATIVE',
      connectorType: 'RSS', isActive: true, checkIntervalMinutes: 60,
      baseUrl: 'https://www.boe.es/rss/BOE.xml',
      regulatoryArea: 'fiscal,energy', frequency: 'hourly',
    },
  });

  log('SETUP', 'Sources ready');

  const stats = { regulations: 0, obligations: 0, clients: 0, fedRegDocs: 0 };

  // =========================================================================
  // 1. DORA
  // =========================================================================
  log('DORA', 'Fetching DORA text from EUR-Lex...');
  const doraChange = await upsertRegulation(prisma, eurLexSource.id, DORA_REG.celex, DORA_REG, async () => {
    try {
      const result = await eurLex.fetchByCelex(DORA_REG.celex);
      return result.content.slice(0, 16_000);
    } catch {
      return DORA_REG.summary;
    }
  });
  if (doraChange) {
    stats.regulations++;
    log('DORA', `Indexed: ${doraChange.id}`);
  }
  await sleep(500);

  // =========================================================================
  // 2. CSRD
  // =========================================================================
  log('CSRD', 'Fetching CSRD text from EUR-Lex...');
  const csrdChange = await upsertRegulation(prisma, eurLexSource.id, CSRD_REG.celex, CSRD_REG, async () => {
    try {
      const result = await eurLex.fetchByCelex(CSRD_REG.celex);
      return result.content.slice(0, 16_000);
    } catch {
      return CSRD_REG.summary;
    }
  });
  if (csrdChange) {
    stats.regulations++;
    log('CSRD', `Indexed: ${csrdChange.id}`);
  }
  await sleep(500);

  // =========================================================================
  // 3. SEC Climate Disclosure
  // =========================================================================
  log('SEC-CLIMATE', 'Fetching from Federal Register API...');
  let secClimateChange = null;
  try {
    const fedRegData = await http.fetchJson<FederalRegisterResponse>(FEDERAL_REGISTER_URL);
    const docs = fedRegData.results ?? [];
    stats.fedRegDocs = docs.length;

    // Use first result for real content, or fallback to summary
    const mainDoc = docs[0];
    const content = mainDoc
      ? `${mainDoc.title}\n\n${mainDoc.abstract ?? ''}\n\nPublished: ${mainDoc.publication_date}\nURL: ${mainDoc.html_url}`
      : SEC_CLIMATE_REG.summary;

    secClimateChange = await upsertRegulation(prisma, secSource.id, 'SEC-CLIMATE-2024', SEC_CLIMATE_REG, async () => content);
    if (secClimateChange) {
      stats.regulations++;
      log('SEC-CLIMATE', `Indexed: ${secClimateChange.id} (${docs.length} Federal Register docs found)`);
    }

    // Index additional Federal Register documents
    for (const doc of docs.slice(1, 3)) {
      await upsertRegulation(prisma, secSource.id, `FR-${doc.document_number}`, {
        ...SEC_CLIMATE_REG,
        title: doc.title,
        summary: doc.abstract ?? doc.title,
        publishedDate: doc.publication_date,
      }, async () => `${doc.title}\n\n${doc.abstract ?? ''}`);
      stats.regulations++;
    }
  } catch (err) {
    log('SEC-CLIMATE', `Federal Register API error: ${err instanceof Error ? err.message : String(err)}`);
    // Fallback: create from summary
    secClimateChange = await upsertRegulation(prisma, secSource.id, 'SEC-CLIMATE-2024', SEC_CLIMATE_REG, async () => SEC_CLIMATE_REG.summary);
    if (secClimateChange) stats.regulations++;
  }
  await sleep(500);

  // =========================================================================
  // 4. Pillar Two
  // =========================================================================
  log('PILLAR2', 'Fetching Pillar Two from EUR-Lex...');
  const pillarChange = await upsertRegulation(prisma, eurLexSource.id, PILLAR_TWO_REG.celex, PILLAR_TWO_REG, async () => {
    try {
      const result = await eurLex.fetchByCelex(PILLAR_TWO_REG.celex);
      return result.content.slice(0, 16_000);
    } catch {
      return PILLAR_TWO_REG.summary;
    }
  });
  if (pillarChange) {
    stats.regulations++;
    log('PILLAR2', `Indexed: ${pillarChange.id}`);
  }

  // Try to find Spanish transposition in BOE
  log('PILLAR2', 'Searching BOE for Spanish Pillar Two transposition...');
  try {
    const boeDocs = await boe.fetchLastNDays(30);
    const pillarDocs = boeDocs.filter((d) =>
      d.title.toLowerCase().includes('impuesto complementario') ||
      d.title.toLowerCase().includes('mínimo global') ||
      d.title.toLowerCase().includes('pilar dos'),
    );
    for (const doc of pillarDocs.slice(0, 2)) {
      const boeId = (doc.metadata['boeId'] as string) ?? doc.externalId;
      let content = doc.title;
      try {
        if (boeId.startsWith('BOE-')) content = await boe.fetchFullText(boeId);
      } catch {}
      await upsertRegulation(prisma, boeSource.id, boeId, {
        ...PILLAR_TWO_REG,
        title: `Transposición ES: ${doc.title}`,
        summary: doc.title,
        areas: ['fiscal'],
        industries: ['public-companies', 'financial-services'],
        affectedCountries: ['ES'],
      }, async () => content.slice(0, 16_000));
      stats.regulations++;
      log('PILLAR2', `  + BOE: ${doc.title.slice(0, 60)}...`);
    }
    if (pillarDocs.length === 0) {
      log('PILLAR2', '  No BOE transposition docs found (expected for 2026 dates)');
    }
  } catch (err) {
    log('PILLAR2', `  BOE search error: ${err instanceof Error ? err.message : String(err)}`);
  }

  // =========================================================================
  // 5. Demo Clients
  // =========================================================================
  log('CLIENTS', 'Creating GT demo clients...');

  const euroTrade = await prisma.client.upsert({
    where: { tenantId_name: { tenantId: DEMO_TENANT_ID, name: 'EuroTrade GmbH (DEMO)' } },
    update: { industries: ['financial-services', 'investment-management'], companyType: 'Investment Firm' },
    create: {
      tenantId: DEMO_TENANT_ID, name: 'EuroTrade GmbH (DEMO)',
      countries: ['ES', 'DE'], companyType: 'Investment Firm',
      industries: ['financial-services', 'investment-management'],
      contactEmail: 'compliance@eurotrade-demo.example.com', isActive: true,
    },
  });
  stats.clients++;
  log('CLIENTS', `  EuroTrade GmbH: ${euroTrade.id} (ES, DE — Investment Firm)`);

  const financeCorp = await prisma.client.upsert({
    where: { tenantId_name: { tenantId: DEMO_TENANT_ID, name: 'FinanceCorp SA (DEMO)' } },
    update: {},
    create: {
      tenantId: DEMO_TENANT_ID, name: 'FinanceCorp SA (DEMO)',
      countries: ['US', 'AR', 'MX'], companyType: 'Listed Company',
      industries: ['financial-services', 'public-companies'],
      contactEmail: 'compliance@financecorp-demo.example.com', isActive: true,
    },
  });
  stats.clients++;
  log('CLIENTS', `  FinanceCorp SA: ${financeCorp.id} (US, AR, MX — Listed Company)`);

  // =========================================================================
  // 6. Obligations from deadlines
  // =========================================================================
  log('OBLIGATIONS', 'Creating obligations from regulation deadlines...');

  // EuroTrade → DORA (financial firm in EU)
  if (doraChange) {
    for (const dl of DORA_REG.deadlines) {
      await upsertObligation(prisma, euroTrade.id, doraChange.id, dl);
      stats.obligations++;
    }
    log('OBLIGATIONS', `  EuroTrade + DORA: ${DORA_REG.deadlines.length} obligations`);
  }

  // EuroTrade → CSRD (250+ employees, EU)
  if (csrdChange) {
    for (const dl of CSRD_REG.deadlines) {
      await upsertObligation(prisma, euroTrade.id, csrdChange.id, dl);
      stats.obligations++;
    }
    log('OBLIGATIONS', `  EuroTrade + CSRD: ${CSRD_REG.deadlines.length} obligations`);
  }

  // EuroTrade → Pillar Two (multinational, >750M EUR)
  if (pillarChange) {
    for (const dl of PILLAR_TWO_REG.deadlines) {
      await upsertObligation(prisma, euroTrade.id, pillarChange.id, dl);
      stats.obligations++;
    }
    log('OBLIGATIONS', `  EuroTrade + Pillar Two: ${PILLAR_TWO_REG.deadlines.length} obligations`);
  }

  // FinanceCorp → SEC Climate (listed company in US)
  if (secClimateChange) {
    for (const dl of SEC_CLIMATE_REG.deadlines) {
      await upsertObligation(prisma, financeCorp.id, secClimateChange.id, dl);
      stats.obligations++;
    }
    log('OBLIGATIONS', `  FinanceCorp + SEC Climate: ${SEC_CLIMATE_REG.deadlines.length} obligations`);
  }

  // FinanceCorp → Pillar Two (multinational with MX operations)
  if (pillarChange) {
    await upsertObligation(prisma, financeCorp.id, pillarChange.id, PILLAR_TWO_REG.deadlines[0]!);
    stats.obligations++;
    log('OBLIGATIONS', `  FinanceCorp + Pillar Two: 1 obligation`);
  }

  // =========================================================================
  // Summary
  // =========================================================================

  console.log('\n' + '='.repeat(60));
  log('DONE', 'GT regulations seed complete!');
  console.log('='.repeat(60));
  console.log(`  Regulations indexed:  ${stats.regulations}`);
  console.log(`  Obligations created:  ${stats.obligations}`);
  console.log(`  Demo clients:         ${stats.clients}`);
  console.log(`  Federal Register docs: ${stats.fedRegDocs}`);
  console.log('');
  console.log('  Regulations:');
  console.log('    DORA (32022R2554)           — 3 deadlines, OVERDUE');
  console.log('    CSRD (32022L2464)           — 3 phases, Phase 1 OVERDUE');
  console.log('    SEC Climate Disclosure      — 2 deadlines, Mar 2026');
  console.log('    Pillar Two (32022L2523)     — 3 deadlines, IIR OVERDUE');
  console.log('');
  console.log('  Clients:');
  console.log('    EuroTrade GmbH  (ES,DE) → DORA + CSRD + Pillar Two');
  console.log('    FinanceCorp SA  (US,AR,MX) → SEC Climate + Pillar Two');
  console.log('='.repeat(60));

  await prisma.$disconnect();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface RegDef {
  title: string;
  summary: string;
  effectiveDate: string;
  publishedDate: string;
  areas: readonly string[];
  industries: readonly string[];
  affectedCountries: readonly string[];
}

async function upsertRegulation(
  prisma: PrismaClient,
  sourceId: string,
  externalDocId: string,
  reg: RegDef,
  fetchContent: () => Promise<string>,
) {
  const version = `${externalDocId}:${reg.effectiveDate}`;

  const existing = await prisma.regulatoryChange.findUnique({
    where: { sourceId_externalDocumentId_version: { sourceId, externalDocumentId: externalDocId, version } },
  });

  if (existing) {
    log('SKIP', `  Already exists: ${externalDocId}`);
    return existing;
  }

  const content = await fetchContent();
  const now = new Date();
  const effectiveDate = new Date(reg.effectiveDate);

  return prisma.regulatoryChange.create({
    data: {
      sourceId,
      externalDocumentId: externalDocId,
      title: reg.title,
      summary: reg.summary,
      rawContent: content,
      effectiveDate,
      publishedDate: new Date(reg.publishedDate),
      impactLevel: effectiveDate < now ? 'HIGH' : 'MEDIUM',
      affectedAreas: [...reg.areas],
      affectedIndustries: [...reg.industries],
      country: reg.affectedCountries.length === 1 ? reg.affectedCountries[0]! : 'EU',
      jurisdiction: reg.affectedCountries.length === 1 ? reg.affectedCountries[0]! : 'EU',
      version,
      language: 'en',
      sourceUrl: externalDocId.startsWith('3')
        ? `https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:${externalDocId}`
        : externalDocId.startsWith('SEC')
          ? 'https://www.sec.gov/rules/final/climate-disclosure'
          : `https://www.federalregister.gov/d/${externalDocId}`,
    },
  });
}

interface DeadlineDef {
  title: string;
  date: string;
  status: 'OVERDUE' | 'PENDING';
}

async function upsertObligation(
  prisma: PrismaClient,
  clientId: string,
  changeId: string,
  deadline: DeadlineDef,
) {
  const deadlineDate = new Date(deadline.date);
  const now = new Date();
  const status = deadlineDate < now ? 'OVERDUE' : 'PENDING';

  // Use a deterministic approach — find by client+change+title
  const existing = await prisma.obligation.findFirst({
    where: { clientId, changeId, title: deadline.title },
  });

  if (existing) {
    await prisma.obligation.update({
      where: { id: existing.id },
      data: { status, deadline: deadlineDate },
    });
    return existing;
  }

  return prisma.obligation.create({
    data: {
      clientId,
      tenantId: DEMO_TENANT_ID,
      changeId,
      title: deadline.title,
      description: `Deadline: ${deadline.date}. Status: ${status}.`,
      deadline: deadlineDate,
      status,
      priority: status === 'OVERDUE' ? 'HIGH' : 'MEDIUM',
      assignedTo: 'GT Professional',
    },
  });
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FederalRegisterResponse {
  readonly count: number;
  readonly results: readonly FederalRegisterDoc[];
}

interface FederalRegisterDoc {
  readonly title: string;
  readonly abstract: string | null;
  readonly document_number: string;
  readonly publication_date: string;
  readonly html_url: string;
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

seedGTRegulations().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
