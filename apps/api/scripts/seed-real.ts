// ============================================================================
// FILE: scripts/seed-real.ts
// Seed script — fetches REAL regulatory data from official sources.
//
// Sources:
//   1. SEC EDGAR — recent 8-K filings from 3 energy companies (no API key)
//   2. EUR-Lex  — 4 EU energy/sustainability directives (no API key)
//   3. BOE Spain — last 7 days, filtered by energy/finance keywords (no API key)
//
// Usage:
//   npx tsx scripts/seed-real.ts
//
// Prerequisites:
//   - PostgreSQL running (DATABASE_URL in .env)
//   - Internet access (fetches from public APIs)
//   - No API keys required — all sources are public
// ============================================================================

import { PrismaClient } from '@prisma/client';
import { SecEdgarConnector, ENERGY_COMPANIES } from '../src/jobs/ingestion/connectors/SecEdgarConnector.js';
import { EurLexConnector, EU_ENERGY_REGULATIONS } from '../src/jobs/ingestion/connectors/EurLexConnector.js';
import { BoeSpainConnector, RELEVANT_KEYWORDS } from '../src/jobs/ingestion/connectors/BoeSpainConnector.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DEMO_TENANT_ID = '00000000-0000-0000-0000-000000000001';
const SEC_DELAY_MS = 200; // Respect SEC rate limit: max 10 req/s

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function log(emoji: string, message: string): void {
  const ts = new Date().toISOString().split('T')[1]!.slice(0, 8);
  console.log(`[${ts}] ${emoji} ${message}`);
}

// ---------------------------------------------------------------------------
// Main seed function
// ---------------------------------------------------------------------------

async function seedRealData(): Promise<void> {
  const prisma = new PrismaClient();

  try {
    await prisma.$connect();
    log('DB', 'Connected to PostgreSQL');
  } catch (err) {
    console.error('Failed to connect to PostgreSQL. Is DATABASE_URL set and the database running?');
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  const stats = {
    secEdgar: { fetched: 0, stored: 0, skipped: 0, errors: 0 },
    eurLex: { fetched: 0, stored: 0, skipped: 0, errors: 0 },
    boe: { fetched: 0, stored: 0, skipped: 0, errors: 0 },
  };

  // =========================================================================
  // 1. Ensure regulatory sources exist in DB
  // =========================================================================

  log('SETUP', 'Creating regulatory sources...');

  const secSource = await prisma.regulatorySource.upsert({
    where: { country_name: { country: 'US', name: 'SEC EDGAR' } },
    update: {},
    create: {
      name: 'SEC EDGAR',
      country: 'US',
      jurisdiction: 'US-FED',
      url: 'https://data.sec.gov',
      type: 'REGULATORY',
      connectorType: 'API',
      isActive: true,
      checkIntervalMinutes: 10,
      baseUrl: 'https://data.sec.gov/submissions',
      regulatoryArea: 'securities,energy',
      frequency: 'every_10min',
    },
  });

  const eurLexSource = await prisma.regulatorySource.upsert({
    where: { country_name: { country: 'EU', name: 'EUR-Lex' } },
    update: {},
    create: {
      name: 'EUR-Lex',
      country: 'EU',
      jurisdiction: 'EU',
      url: 'https://eur-lex.europa.eu',
      type: 'LEGISLATIVE',
      connectorType: 'RSS',
      isActive: true,
      checkIntervalMinutes: 60,
      baseUrl: 'https://eur-lex.europa.eu/tools/rss.do',
      regulatoryArea: 'energy,sustainability,securities',
      frequency: 'hourly',
    },
  });

  const boeSource = await prisma.regulatorySource.upsert({
    where: { country_name: { country: 'ES', name: 'BOE Spain' } },
    update: {},
    create: {
      name: 'BOE Spain',
      country: 'ES',
      jurisdiction: 'ES',
      url: 'https://www.boe.es',
      type: 'LEGISLATIVE',
      connectorType: 'RSS',
      isActive: true,
      checkIntervalMinutes: 60,
      baseUrl: 'https://www.boe.es/rss/BOE.xml',
      regulatoryArea: 'energy,fiscal,environmental',
      frequency: 'hourly',
    },
  });

  log('SETUP', `Sources created: SEC=${secSource.id}, EUR-Lex=${eurLexSource.id}, BOE=${boeSource.id}`);

  // =========================================================================
  // 2. SEC EDGAR — fetch real filings from 3 energy companies
  // =========================================================================

  log('SEC', 'Fetching real SEC EDGAR filings...');

  const secConnector = new SecEdgarConnector();

  for (const company of ENERGY_COMPANIES) {
    try {
      log('SEC', `  Fetching ${company.name} (CIK: ${company.cik})...`);

      const filings = await secConnector.fetchRecentFilings(
        company.cik,
        ['8-K', '10-K', '10-Q'],
        5, // 5 filings per company = 15 total
      );

      stats.secEdgar.fetched += filings.length;

      for (const filing of filings) {
        try {
          // Check idempotency
          const existing = await prisma.regulatoryChange.findUnique({
            where: {
              sourceId_externalDocumentId_version: {
                sourceId: secSource.id,
                externalDocumentId: filing.accessionNumber,
                version: `${filing.accessionNumber}:${filing.filedAt}`,
              },
            },
          });

          if (existing) {
            stats.secEdgar.skipped++;
            continue;
          }

          // Fetch filing text (truncated for DB storage)
          let content = '';
          try {
            content = await secConnector.fetchFilingText(
              filing.accessionNumber,
              company.cik,
              filing.primaryDocument,
            );
            content = content.slice(0, 16_000);
          } catch {
            content = `${filing.formType} filing by ${company.name}: ${filing.description}`;
          }

          await prisma.regulatoryChange.create({
            data: {
              sourceId: secSource.id,
              externalDocumentId: filing.accessionNumber,
              title: `${filing.formType}: ${company.name} — ${filing.description}`,
              summary: `${filing.formType} filed by ${company.name} on ${filing.filedAt}. ${filing.description}`,
              rawContent: content,
              effectiveDate: new Date(filing.filedAt),
              publishedDate: new Date(filing.filedAt),
              impactLevel: filing.formType === '8-K' ? 'HIGH' : 'MEDIUM',
              affectedAreas: ['energy', 'securities', 'corporate'],
              affectedIndustries: ['energy', 'utilities', 'public-companies'],
              country: 'US',
              jurisdiction: 'US-FED',
              version: `${filing.accessionNumber}:${filing.filedAt}`,
              language: 'en',
              sourceUrl: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${company.cik}&type=${filing.formType}`,
            },
          });

          stats.secEdgar.stored++;
          log('SEC', `    + ${filing.formType}: ${filing.description}`);

          await sleep(SEC_DELAY_MS);
        } catch (err) {
          stats.secEdgar.errors++;
          log('SEC', `    ! Error storing ${filing.accessionNumber}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    } catch (err) {
      stats.secEdgar.errors++;
      log('SEC', `  ! Error fetching ${company.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  log('SEC', `SEC EDGAR complete: ${stats.secEdgar.stored} stored, ${stats.secEdgar.skipped} skipped, ${stats.secEdgar.errors} errors`);

  // =========================================================================
  // 3. EUR-Lex — fetch real EU energy regulations by CELEX
  // =========================================================================

  log('EU', 'Fetching real EUR-Lex regulations...');

  const eurLexConnector = new EurLexConnector();

  for (const reg of EU_ENERGY_REGULATIONS) {
    try {
      stats.eurLex.fetched++;

      const existing = await prisma.regulatoryChange.findUnique({
        where: {
          sourceId_externalDocumentId_version: {
            sourceId: eurLexSource.id,
            externalDocumentId: reg.celex,
            version: `${reg.celex}:${reg.deadline}`,
          },
        },
      });

      if (existing) {
        stats.eurLex.skipped++;
        log('EU', `  - Skipped ${reg.celex} (already exists)`);
        continue;
      }

      let content = `EU regulation ${reg.celex}: ${reg.title}. Transposition deadline: ${reg.deadline}.`;
      try {
        const result = await eurLexConnector.fetchByCelex(reg.celex);
        content = result.content.slice(0, 16_000);
      } catch {
        log('EU', `  ~ Could not fetch full text for ${reg.celex}, using summary`);
      }

      const deadlineDate = new Date(reg.deadline);
      const now = new Date();

      await prisma.regulatoryChange.create({
        data: {
          sourceId: eurLexSource.id,
          externalDocumentId: reg.celex,
          title: reg.title,
          summary: `EU Directive/Regulation ${reg.celex}: ${reg.title}. Transposition deadline: ${reg.deadline}. Affects: ${reg.affectedCountries.join(', ')}.`,
          rawContent: content,
          effectiveDate: deadlineDate,
          publishedDate: new Date('2023-09-20'), // Original publication date
          impactLevel: deadlineDate < now ? 'HIGH' : 'MEDIUM',
          affectedAreas: [...reg.areas],
          affectedIndustries: [...reg.industries],
          country: 'EU',
          jurisdiction: 'EU',
          version: `${reg.celex}:${reg.deadline}`,
          language: 'en',
          sourceUrl: `https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:${reg.celex}`,
        },
      });

      stats.eurLex.stored++;
      log('EU', `  + ${reg.celex}: ${reg.title}`);

      await sleep(500);
    } catch (err) {
      stats.eurLex.errors++;
      log('EU', `  ! Error: ${reg.celex}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  log('EU', `EUR-Lex complete: ${stats.eurLex.stored} stored, ${stats.eurLex.skipped} skipped, ${stats.eurLex.errors} errors`);

  // =========================================================================
  // 4. BOE Spain — fetch last 7 days, filter by keywords
  // =========================================================================

  log('BOE', 'Fetching real BOE Spain documents (last 7 days)...');

  const boeConnector = new BoeSpainConnector();

  try {
    const allBoeDocs = await boeConnector.fetchLastNDays(7);
    stats.boe.fetched = allBoeDocs.length;
    log('BOE', `  Found ${allBoeDocs.length} total documents`);

    const relevant = boeConnector.filterByKeywords(allBoeDocs);
    log('BOE', `  ${relevant.length} match energy/finance keywords`);

    for (const doc of relevant.slice(0, 10)) {
      try {
        const boeId = (doc.metadata['boeId'] as string) ?? doc.externalId;

        const existing = await prisma.regulatoryChange.findUnique({
          where: {
            sourceId_externalDocumentId_version: {
              sourceId: boeSource.id,
              externalDocumentId: boeId,
              version: `${boeId}:${doc.publishedDate.toISOString().split('T')[0]!}`,
            },
          },
        });

        if (existing) {
          stats.boe.skipped++;
          continue;
        }

        let content = doc.title;
        try {
          if (boeId.startsWith('BOE-')) {
            content = await boeConnector.fetchFullText(boeId);
          }
        } catch {
          // Use title as content fallback
        }

        await prisma.regulatoryChange.create({
          data: {
            sourceId: boeSource.id,
            externalDocumentId: boeId,
            title: doc.title,
            summary: doc.title,
            rawContent: content.slice(0, 16_000),
            effectiveDate: doc.publishedDate,
            publishedDate: doc.publishedDate,
            impactLevel: 'MEDIUM',
            affectedAreas: detectBoeAreas(doc.title),
            affectedIndustries: detectBoeIndustries(doc.title),
            country: 'ES',
            jurisdiction: 'ES',
            version: `${boeId}:${doc.publishedDate.toISOString().split('T')[0]!}`,
            language: 'es',
            sourceUrl: doc.sourceUrl,
          },
        });

        stats.boe.stored++;
        log('BOE', `  + ${doc.title.slice(0, 80)}...`);

        await sleep(300);
      } catch (err) {
        stats.boe.errors++;
        log('BOE', `  ! Error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  } catch (err) {
    stats.boe.errors++;
    log('BOE', `  ! Error fetching BOE: ${err instanceof Error ? err.message : String(err)}`);
  }

  log('BOE', `BOE Spain complete: ${stats.boe.stored} stored, ${stats.boe.skipped} skipped, ${stats.boe.errors} errors`);

  // =========================================================================
  // 5. Create demo client
  // =========================================================================

  log('CLIENT', 'Creating demo client EuroTrade GmbH...');

  const demoClient = await prisma.client.upsert({
    where: {
      tenantId_name: {
        tenantId: DEMO_TENANT_ID,
        name: 'EuroTrade GmbH (DEMO)',
      },
    },
    update: {},
    create: {
      tenantId: DEMO_TENANT_ID,
      name: 'EuroTrade GmbH (DEMO)',
      countries: ['ES', 'DE'],
      companyType: 'Financial Institution',
      industries: ['energy', 'financial-services'],
      contactEmail: 'compliance@eurotrade-demo.example.com',
      isActive: true,
    },
  });

  log('CLIENT', `Demo client created: ${demoClient.id}`);

  // Create obligations from EU regulations with deadlines
  for (const reg of EU_ENERGY_REGULATIONS) {
    const change = await prisma.regulatoryChange.findFirst({
      where: {
        sourceId: eurLexSource.id,
        externalDocumentId: reg.celex,
      },
    });

    if (!change) continue;

    const deadlineDate = new Date(reg.deadline);
    const now = new Date();
    const status = deadlineDate < now ? 'OVERDUE' : 'PENDING';

    await prisma.obligation.upsert({
      where: {
        id: `${demoClient.id}-${reg.celex}`.slice(0, 36), // Deterministic ID
      },
      update: { status },
      create: {
        id: `${demoClient.id}-${reg.celex}`.slice(0, 36),
        clientId: demoClient.id,
        tenantId: DEMO_TENANT_ID,
        changeId: change.id,
        title: `Comply with ${reg.title}`,
        description: `Transposition/compliance obligation for ${reg.celex}. Deadline: ${reg.deadline}. Affected countries: ${reg.affectedCountries.join(', ')}.`,
        deadline: deadlineDate,
        status,
        priority: deadlineDate < now ? 'HIGH' : 'MEDIUM',
        assignedTo: 'GT Professional',
      },
    });

    log('CLIENT', `  + Obligation: ${reg.title} [${status}]`);
  }

  // =========================================================================
  // Summary
  // =========================================================================

  const totalStored = stats.secEdgar.stored + stats.eurLex.stored + stats.boe.stored;
  const totalSkipped = stats.secEdgar.skipped + stats.eurLex.skipped + stats.boe.skipped;

  console.log('\n' + '='.repeat(60));
  log('DONE', 'Real data seed complete!');
  console.log('='.repeat(60));
  console.log(`  SEC EDGAR:  ${stats.secEdgar.stored} stored, ${stats.secEdgar.skipped} skipped, ${stats.secEdgar.errors} errors`);
  console.log(`  EUR-Lex:    ${stats.eurLex.stored} stored, ${stats.eurLex.skipped} skipped, ${stats.eurLex.errors} errors`);
  console.log(`  BOE Spain:  ${stats.boe.stored} stored, ${stats.boe.skipped} skipped, ${stats.boe.errors} errors`);
  console.log(`  TOTAL:      ${totalStored} new documents, ${totalSkipped} skipped`);
  console.log(`  Client:     EuroTrade GmbH (DEMO) — ES, DE`);
  console.log('='.repeat(60));

  await prisma.$disconnect();
}

// ---------------------------------------------------------------------------
// BOE helpers (simplified for seed script)
// ---------------------------------------------------------------------------

function detectBoeAreas(title: string): string[] {
  const upper = title.toUpperCase();
  const areas: string[] = [];
  if (/ENERGÍA|ELÉCTRIC|RENOVABLE/i.test(upper)) areas.push('energy');
  if (/FISCAL|TRIBUT|HACIENDA/i.test(upper)) areas.push('fiscal');
  if (/MEDIOAMBIENT|EMISIONES|CLIMÁT/i.test(upper)) areas.push('environmental');
  if (/FINANCIER|VALORES|CNMV/i.test(upper)) areas.push('securities');
  if (/LABORAL|TRABAJO|EMPLEO/i.test(upper)) areas.push('labor');
  return areas.length > 0 ? areas : ['regulatory'];
}

function detectBoeIndustries(title: string): string[] {
  const upper = title.toUpperCase();
  const industries: string[] = [];
  if (/ENERGÍA|ELÉCTRIC/i.test(upper)) industries.push('energy');
  if (/BANCO|FINANCIER/i.test(upper)) industries.push('banking');
  if (/VALORES|CNMV/i.test(upper)) industries.push('securities');
  return industries.length > 0 ? industries : ['general'];
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

seedRealData().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
