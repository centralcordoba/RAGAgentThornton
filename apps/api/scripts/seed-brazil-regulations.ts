// ============================================================================
// FILE: apps/api/scripts/seed-brazil-regulations.ts
// Seed Brazil high-impact regulations — BCB Crypto, LGPD, CVM ESG.
//
// Sources: DOU RSS feeds + DOU keyword search (no API key).
// Creates regulations, obligations, and demo client in PostgreSQL.
//
// Usage:
//   npx tsx --tsconfig tsconfig.json apps/api/scripts/seed-brazil-regulations.ts
//
// Prerequisites:
//   - PostgreSQL running (DATABASE_URL in .env)
//   - seed-real.ts or seed-gt-regulations.ts already ran (sources exist)
// ============================================================================

import { PrismaClient } from '@prisma/client';
import { DouBrazilConnector, BRAZIL_REGULATIONS } from '../src/jobs/ingestion/connectors/DouBrazilConnector.js';

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
// Main
// ---------------------------------------------------------------------------

async function seedBrazilRegulations(): Promise<void> {
  const prisma = new PrismaClient();
  const dou = new DouBrazilConnector();

  try {
    await prisma.$connect();
    log('DB', 'Connected to PostgreSQL');
  } catch (err) {
    console.error('Failed to connect:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  // Ensure DOU source exists
  const douSource = await prisma.regulatorySource.upsert({
    where: { country_name: { country: 'BR', name: 'DOU Brazil' } },
    update: {},
    create: {
      name: 'DOU Brazil', country: 'BR', jurisdiction: 'BR',
      url: 'https://www.in.gov.br', type: 'LEGISLATIVE',
      connectorType: 'RSS', isActive: true, checkIntervalMinutes: 60,
      baseUrl: 'https://www.in.gov.br/rss/dou/-/secao-1',
      regulatoryArea: 'financial,data-protection,sustainability', frequency: 'hourly',
    },
  });

  log('SETUP', `DOU source: ${douSource.id}`);

  const stats = { regulations: 0, douDocs: 0, obligations: 0 };

  // =========================================================================
  // 1. BCB Marco Legal Criptoativos
  // =========================================================================
  const cryptoReg = BRAZIL_REGULATIONS[0];
  log('BCB-CRYPTO', `Indexing: ${cryptoReg.title}...`);

  // Try to fetch real DOU docs by keywords
  let cryptoContent = cryptoReg.summary;
  try {
    const docs = await dou.fetchByKeywords(cryptoReg.keywords, 150);
    stats.douDocs += docs.length;
    if (docs.length > 0) {
      log('BCB-CRYPTO', `  Found ${docs.length} DOU documents`);
      // Use first doc content as supplemental
      cryptoContent = `${cryptoReg.summary}\n\n--- DOU Documents ---\n${docs.slice(0, 3).map((d) => `${d.title}: ${d.rawContent}`).join('\n\n')}`;
    } else {
      log('BCB-CRYPTO', '  No DOU docs found via RSS (using summary)');
    }
  } catch (err) {
    log('BCB-CRYPTO', `  DOU fetch error: ${err instanceof Error ? err.message : String(err)}`);
  }

  const cryptoChange = await upsertRegulation(prisma, douSource.id, cryptoReg.id, {
    title: cryptoReg.title,
    summary: cryptoReg.summary,
    effectiveDate: cryptoReg.effectiveDate,
    publishedDate: cryptoReg.publishedDate,
    areas: [...cryptoReg.areas],
    industries: [...cryptoReg.industries],
  }, cryptoContent);
  if (cryptoChange) stats.regulations++;
  await sleep(300);

  // =========================================================================
  // 2. LGPD Fiscalização ANPD
  // =========================================================================
  const lgpdReg = BRAZIL_REGULATIONS[1];
  log('LGPD', `Indexing: ${lgpdReg.title}...`);

  let lgpdContent = lgpdReg.summary;
  try {
    const docs = await dou.fetchByKeywords(lgpdReg.keywords, 90);
    stats.douDocs += docs.length;
    if (docs.length > 0) {
      log('LGPD', `  Found ${docs.length} DOU documents`);
      lgpdContent = `${lgpdReg.summary}\n\n--- DOU Documents ---\n${docs.slice(0, 3).map((d) => `${d.title}: ${d.rawContent}`).join('\n\n')}`;
    } else {
      log('LGPD', '  No DOU docs found via RSS (using summary)');
    }
  } catch (err) {
    log('LGPD', `  DOU fetch error: ${err instanceof Error ? err.message : String(err)}`);
  }

  const lgpdChange = await upsertRegulation(prisma, douSource.id, lgpdReg.id, {
    title: lgpdReg.title,
    summary: lgpdReg.summary,
    effectiveDate: lgpdReg.effectiveDate,
    publishedDate: lgpdReg.publishedDate,
    areas: [...lgpdReg.areas],
    industries: [...lgpdReg.industries],
  }, lgpdContent);
  if (lgpdChange) stats.regulations++;
  await sleep(300);

  // =========================================================================
  // 3. CVM Resolução 193 — ESG/ISSB
  // =========================================================================
  const cvmReg = BRAZIL_REGULATIONS[2];
  log('CVM-ESG', `Indexing: ${cvmReg.title}...`);

  let cvmContent = cvmReg.summary;
  try {
    const docs = await dou.fetchByKeywords(cvmReg.keywords, 90);
    stats.douDocs += docs.length;
    if (docs.length > 0) {
      log('CVM-ESG', `  Found ${docs.length} DOU documents`);
      cvmContent = `${cvmReg.summary}\n\n--- DOU Documents ---\n${docs.slice(0, 3).map((d) => `${d.title}: ${d.rawContent}`).join('\n\n')}`;
    } else {
      log('CVM-ESG', '  No DOU docs found via RSS (using summary)');
    }
  } catch (err) {
    log('CVM-ESG', `  DOU fetch error: ${err instanceof Error ? err.message : String(err)}`);
  }

  const cvmChange = await upsertRegulation(prisma, douSource.id, cvmReg.id, {
    title: cvmReg.title,
    summary: cvmReg.summary,
    effectiveDate: cvmReg.effectiveDate,
    publishedDate: cvmReg.publishedDate,
    areas: [...cvmReg.areas],
    industries: [...cvmReg.industries],
  }, cvmContent);
  if (cvmChange) stats.regulations++;

  // =========================================================================
  // 4. Demo Client — FinanceCorp Brasil
  // =========================================================================
  log('CLIENT', 'Creating FinanceCorp Brasil SA...');

  const financeBR = await prisma.client.upsert({
    where: { tenantId_name: { tenantId: DEMO_TENANT_ID, name: 'FinanceCorp Brasil SA (DEMO)' } },
    update: {},
    create: {
      tenantId: DEMO_TENANT_ID, name: 'FinanceCorp Brasil SA (DEMO)',
      countries: ['BR', 'US'], companyType: 'Fintech',
      industries: ['fintech', 'banking', 'securities'],
      contactEmail: 'compliance@financecorp-br-demo.example.com', isActive: true,
    },
  });

  log('CLIENT', `  FinanceCorp Brasil: ${financeBR.id} (BR, US — Fintech)`);

  // =========================================================================
  // 5. Obligations from deadlines
  // =========================================================================
  log('OBLIGATIONS', 'Creating obligations...');

  // FinanceCorp BR → BCB Crypto (fintech with crypto operations)
  if (cryptoChange) {
    for (const dl of cryptoReg.deadlines) {
      await upsertObligation(prisma, financeBR.id, cryptoChange.id, dl);
      stats.obligations++;
    }
    log('OBLIGATIONS', `  FinanceCorp BR + BCB Crypto: ${cryptoReg.deadlines.length} obligations`);
  }

  // FinanceCorp BR → LGPD (all companies)
  if (lgpdChange) {
    for (const dl of lgpdReg.deadlines) {
      await upsertObligation(prisma, financeBR.id, lgpdChange.id, dl);
      stats.obligations++;
    }
    log('OBLIGATIONS', `  FinanceCorp BR + LGPD: ${lgpdReg.deadlines.length} obligations`);
  }

  // FinanceCorp BR → CVM ESG (if listed — for demo purposes, include anyway)
  if (cvmChange) {
    for (const dl of cvmReg.deadlines) {
      await upsertObligation(prisma, financeBR.id, cvmChange.id, dl);
      stats.obligations++;
    }
    log('OBLIGATIONS', `  FinanceCorp BR + CVM ESG: ${cvmReg.deadlines.length} obligations`);
  }

  // Also connect existing EuroTrade to LGPD (they operate internationally)
  const euroTrade = await prisma.client.findFirst({ where: { name: { contains: 'EuroTrade' } } });
  if (euroTrade && lgpdChange) {
    // EuroTrade might have BR operations in the future — show cross-border compliance
    log('OBLIGATIONS', '  (EuroTrade not connected to BR regs — operates in ES,DE only)');
  }

  // =========================================================================
  // Summary
  // =========================================================================

  console.log('\n' + '='.repeat(60));
  log('DONE', 'Brazil regulations seed complete!');
  console.log('='.repeat(60));
  console.log(`  Regulations indexed:   ${stats.regulations}`);
  console.log(`  DOU docs fetched:      ${stats.douDocs}`);
  console.log(`  Obligations created:   ${stats.obligations}`);
  console.log('');
  console.log('  Regulations:');
  console.log('    BCB Crypto (Resoluções 519-521) — 2 deadlines jun/nov 2026');
  console.log('    LGPD (ANPD Fiscalização)        — 2 deadlines jan/mar 2026');
  console.log('    CVM ESG (Resolução 193/ISSB)    — 1 deadline jun 2026');
  console.log('');
  console.log('  Client:');
  console.log('    FinanceCorp Brasil SA (BR,US) → BCB Crypto + LGPD + CVM ESG');
  console.log('');
  console.log('  What you see in the demo:');
  console.log('    Map:      Brasil colored orange/red');
  console.log('    Calendar: 5 Brazilian deadlines (BCB jun/nov, DPO jan, RIPD mar, ESG jun)');
  console.log('    Chat:     "Quais obrigações tem FinanceCorp sob o Marco Legal de Criptoativos?"');
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
  areas: string[];
  industries: string[];
}

async function upsertRegulation(
  prisma: PrismaClient,
  sourceId: string,
  externalDocId: string,
  reg: RegDef,
  content: string,
) {
  const version = `${externalDocId}:${reg.effectiveDate}`;

  const existing = await prisma.regulatoryChange.findUnique({
    where: { sourceId_externalDocumentId_version: { sourceId, externalDocumentId: externalDocId, version } },
  });

  if (existing) {
    log('SKIP', `  Already exists: ${externalDocId}`);
    return existing;
  }

  return prisma.regulatoryChange.create({
    data: {
      sourceId,
      externalDocumentId: externalDocId,
      title: reg.title,
      summary: reg.summary,
      rawContent: content.slice(0, 16_000),
      effectiveDate: new Date(reg.effectiveDate),
      publishedDate: new Date(reg.publishedDate),
      impactLevel: new Date(reg.effectiveDate) < new Date() ? 'HIGH' : 'MEDIUM',
      affectedAreas: reg.areas,
      affectedIndustries: reg.industries,
      country: 'BR',
      jurisdiction: 'BR',
      version,
      language: 'pt',
      sourceUrl: `https://www.in.gov.br/consulta/-/buscar/dou?q=${encodeURIComponent(reg.title.slice(0, 50))}`,
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
  const status = deadlineDate < new Date() ? 'OVERDUE' : 'PENDING';

  const existing = await prisma.obligation.findFirst({
    where: { clientId, changeId, title: deadline.title },
  });

  if (existing) {
    await prisma.obligation.update({ where: { id: existing.id }, data: { status, deadline: deadlineDate } });
    return existing;
  }

  return prisma.obligation.create({
    data: {
      clientId, tenantId: DEMO_TENANT_ID, changeId,
      title: deadline.title,
      description: `Prazo: ${deadline.date}. Status: ${status}.`,
      deadline: deadlineDate, status,
      priority: status === 'OVERDUE' ? 'HIGH' : 'MEDIUM',
      assignedTo: 'GT Professional',
    },
  });
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

seedBrazilRegulations().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
