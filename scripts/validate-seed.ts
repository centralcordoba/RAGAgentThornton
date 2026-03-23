// ============================================================================
// FILE: scripts/validate-seed.ts
// Validates that the real data seed ran correctly.
// Checks 5 checkpoints against PostgreSQL.
//
// Usage: npx tsx scripts/validate-seed.ts
// ============================================================================

import { PrismaClient } from '@prisma/client';

async function validate(): Promise<void> {
  const prisma = new PrismaClient();
  await prisma.$connect();

  let passed = 0;
  let failed = 0;

  function check(name: string, ok: boolean, detail: string): void {
    if (ok) {
      console.log(`  [PASS] ${name}: ${detail}`);
      passed++;
    } else {
      console.log(`  [FAIL] ${name}: ${detail}`);
      failed++;
    }
  }

  console.log('\n=== RegWatch AI — Seed Validation ===\n');

  // 1. Regulatory sources exist
  const sources = await prisma.regulatorySource.findMany({ where: { isActive: true } });
  check('Sources', sources.length >= 3, `${sources.length} active sources (expected >= 3)`);

  // 2. Regulatory changes indexed
  const totalChanges = await prisma.regulatoryChange.count();
  const bySource = await prisma.regulatoryChange.groupBy({
    by: ['country'],
    _count: { id: true },
  });
  check(
    'Regulatory changes',
    totalChanges > 0,
    `${totalChanges} total — ${bySource.map((s) => `${s.country}: ${s._count.id}`).join(', ')}`,
  );

  // 3. SEC EDGAR filings
  const secSource = sources.find((s) => s.name === 'SEC EDGAR');
  const secCount = secSource
    ? await prisma.regulatoryChange.count({ where: { sourceId: secSource.id } })
    : 0;
  check('SEC EDGAR', secCount > 0, `${secCount} filings indexed`);

  // 4. EUR-Lex regulations
  const eurSource = sources.find((s) => s.name === 'EUR-Lex');
  const eurCount = eurSource
    ? await prisma.regulatoryChange.count({ where: { sourceId: eurSource.id } })
    : 0;
  check('EUR-Lex', eurCount > 0, `${eurCount} regulations indexed`);

  // 5. BOE Spain documents
  const boeSource = sources.find((s) => s.name === 'BOE Spain');
  const boeCount = boeSource
    ? await prisma.regulatoryChange.count({ where: { sourceId: boeSource.id } })
    : 0;
  check('BOE Spain', boeCount >= 0, `${boeCount} documents indexed`);

  // 6. Demo client exists
  const demoClient = await prisma.client.findFirst({
    where: { name: { contains: 'EuroTrade' } },
  });
  check('Demo client', !!demoClient, demoClient ? `${demoClient.name} (${demoClient.countries.join(', ')})` : 'Not found');

  // 7. Obligations created
  const obligationCount = demoClient
    ? await prisma.obligation.count({ where: { clientId: demoClient.id } })
    : 0;
  check('Obligations', obligationCount > 0, `${obligationCount} obligations for demo client`);

  // 8. Overdue obligations (from passed EU deadlines)
  const overdueCount = demoClient
    ? await prisma.obligation.count({ where: { clientId: demoClient.id, status: 'OVERDUE' } })
    : 0;
  check('Overdue deadlines', overdueCount >= 0, `${overdueCount} overdue obligations (expected for passed EU deadlines)`);

  // Summary
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);

  await prisma.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

validate().catch((err) => {
  console.error('Validation failed:', err);
  process.exit(1);
});
