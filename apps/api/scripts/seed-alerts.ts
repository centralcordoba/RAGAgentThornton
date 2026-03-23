// ============================================================================
// FILE: apps/api/scripts/seed-alerts.ts
// Seed realistic alerts based on existing regulations and clients.
//
// Usage:
//   npx tsx --tsconfig tsconfig.json apps/api/scripts/seed-alerts.ts
//
// Prerequisites: seed-real + seed-gt + seed-brazil already ran.
// ============================================================================

import { PrismaClient } from '@prisma/client';

const DEMO_TENANT_ID = '00000000-0000-0000-0000-000000000001';

function log(tag: string, msg: string): void {
  const ts = new Date().toISOString().split('T')[1]!.slice(0, 8);
  console.log(`[${ts}] ${tag} ${msg}`);
}

async function seedAlerts(): Promise<void> {
  const prisma = new PrismaClient();
  await prisma.$connect();
  log('DB', 'Connected');

  // Get clients
  const clients = await prisma.client.findMany({ where: { tenantId: DEMO_TENANT_ID } });
  const euroTrade = clients.find((c) => c.name.includes('EuroTrade'));
  const financeCorp = clients.find((c) => c.name.includes('FinanceCorp SA'));
  const financeBR = clients.find((c) => c.name.includes('Brasil'));

  if (!euroTrade) { console.error('EuroTrade not found — run seed:gt first'); process.exit(1); }

  // Get key regulations
  const dora = await prisma.regulatoryChange.findFirst({ where: { title: { contains: 'DORA' } } });
  const csrd = await prisma.regulatoryChange.findFirst({ where: { title: { contains: 'CSRD' } } });
  const secClimate = await prisma.regulatoryChange.findFirst({ where: { title: { contains: 'SEC Climate' } } });
  const pillarTwo = await prisma.regulatoryChange.findFirst({ where: { title: { contains: 'Pillar Two' } } });
  const bcbCrypto = await prisma.regulatoryChange.findFirst({ where: { title: { contains: 'Criptoativos' } } });
  const lgpd = await prisma.regulatoryChange.findFirst({ where: { title: { contains: 'LGPD' } } });

  // Get some SEC filings
  const secFilings = await prisma.regulatoryChange.findMany({
    where: { title: { contains: '8-K' } },
    take: 3,
    orderBy: { publishedDate: 'desc' },
  });

  // Get obligations for linking
  const euroTradeObligations = await prisma.obligation.findMany({
    where: { clientId: euroTrade.id },
    take: 5,
  });

  log('DATA', `Clients: ${clients.length}, Regulations found: DORA=${!!dora} CSRD=${!!csrd} SEC=${!!secClimate} P2=${!!pillarTwo} BCB=${!!bcbCrypto}`);

  // Define alerts
  const alertDefs: {
    clientId: string;
    changeId: string;
    obligationId?: string;
    message: string;
    channel: 'EMAIL' | 'TEAMS' | 'SSE';
    status: 'PENDING_REVIEW' | 'APPROVED' | 'SENT' | 'ACKNOWLEDGED';
    impactLevel: 'HIGH' | 'MEDIUM' | 'LOW';
    reviewedById?: string;
    reviewedAt?: Date;
    sentAt?: Date;
    acknowledgedAt?: Date;
    createdAt: Date;
  }[] = [];

  // --- HIGH impact: DORA (PENDING_REVIEW — needs HITL) ---
  if (dora && euroTrade) {
    alertDefs.push({
      clientId: euroTrade.id,
      changeId: dora.id,
      obligationId: euroTradeObligations.find((o) => o.title.includes('ICT Risk'))?.id,
      message: 'DORA (Reg. EU 2022/2554) — EuroTrade GmbH debe implementar el marco de gestión de riesgos TIC. El plazo venció el 17/01/2025. Acción inmediata requerida: evaluar gaps en controles de resiliencia operativa digital.',
      channel: 'EMAIL',
      status: 'PENDING_REVIEW',
      impactLevel: 'HIGH',
      createdAt: new Date('2025-01-20T09:00:00Z'),
    });

    alertDefs.push({
      clientId: euroTrade.id,
      changeId: dora.id,
      obligationId: euroTradeObligations.find((o) => o.title.includes('proveedores'))?.id,
      message: 'DORA — Registro de contratos con proveedores TIC: EuroTrade debe completar el inventario de todos los proveedores de servicios tecnológicos críticos antes del 17/04/2025.',
      channel: 'TEAMS',
      status: 'SENT',
      impactLevel: 'HIGH',
      reviewedAt: new Date('2025-01-21T14:00:00Z'),
      sentAt: new Date('2025-01-21T14:30:00Z'),
      createdAt: new Date('2025-01-20T09:15:00Z'),
    });
  }

  // --- HIGH impact: CSRD (APPROVED, waiting to send) ---
  if (csrd && euroTrade) {
    alertDefs.push({
      clientId: euroTrade.id,
      changeId: csrd.id,
      message: 'CSRD Fase 2 — EuroTrade GmbH (+320 empleados, no cotizada) entra en el ámbito de la CSRD a partir del 01/01/2026. Debe preparar el primer informe de sostenibilidad bajo ESRS. Recomendación: iniciar gap analysis Q2 2025.',
      channel: 'EMAIL',
      status: 'APPROVED',
      impactLevel: 'HIGH',
      reviewedAt: new Date('2025-03-15T10:00:00Z'),
      createdAt: new Date('2025-03-14T16:00:00Z'),
    });
  }

  // --- HIGH impact: SEC Climate (PENDING_REVIEW) ---
  if (secClimate && financeCorp) {
    alertDefs.push({
      clientId: financeCorp.id,
      changeId: secClimate.id,
      message: 'SEC Climate Disclosure — FinanceCorp SA como large accelerated filer debe incluir divulgación de riesgos climáticos y emisiones GHG (Scopes 1-2) en el próximo 10-K. Deadline: 15/03/2026.',
      channel: 'EMAIL',
      status: 'PENDING_REVIEW',
      impactLevel: 'HIGH',
      createdAt: new Date('2025-12-01T08:00:00Z'),
    });
  }

  // --- MEDIUM impact: Pillar Two ---
  if (pillarTwo && euroTrade) {
    alertDefs.push({
      clientId: euroTrade.id,
      changeId: pillarTwo.id,
      message: 'Pillar Two / Impuesto Mínimo Global 15% — EuroTrade opera en ES y DE, ambas jurisdicciones con transposición activa. Verificar si el grupo supera umbral de EUR 750M en ingresos consolidados.',
      channel: 'TEAMS',
      status: 'ACKNOWLEDGED',
      impactLevel: 'MEDIUM',
      reviewedAt: new Date('2025-06-10T11:00:00Z'),
      sentAt: new Date('2025-06-10T11:30:00Z'),
      acknowledgedAt: new Date('2025-06-12T09:00:00Z'),
      createdAt: new Date('2025-06-09T15:00:00Z'),
    });
  }

  // --- MEDIUM: BCB Crypto ---
  if (bcbCrypto && financeBR) {
    alertDefs.push({
      clientId: financeBR.id,
      changeId: bcbCrypto.id,
      message: 'Marco Legal Criptoativos (BCB Res. 519-521) — FinanceCorp Brasil como fintech con operaciones de ativos virtuais debe solicitar autorización al BCB antes del 10/06/2026. Iniciar proceso de compliance.',
      channel: 'EMAIL',
      status: 'PENDING_REVIEW',
      impactLevel: 'MEDIUM',
      createdAt: new Date('2025-12-15T10:00:00Z'),
    });
  }

  // --- MEDIUM: LGPD ---
  if (lgpd && financeBR) {
    alertDefs.push({
      clientId: financeBR.id,
      changeId: lgpd.id,
      message: 'LGPD — ANPD inicia programa de fiscalización 2025 enfocado en sector financiero. FinanceCorp Brasil debe designar DPO y preparar RIPD para tratamientos de alto riesgo antes del 01/01/2026.',
      channel: 'SSE',
      status: 'SENT',
      impactLevel: 'MEDIUM',
      sentAt: new Date('2025-10-01T09:00:00Z'),
      createdAt: new Date('2025-09-25T14:00:00Z'),
    });
  }

  // --- SEC filings (LOW/MEDIUM) ---
  for (const filing of secFilings) {
    if (!financeCorp) break;
    alertDefs.push({
      clientId: financeCorp.id,
      changeId: filing.id,
      message: `Nuevo filing SEC: ${filing.title}. Revisar impacto en obligaciones de disclosure de FinanceCorp SA.`,
      channel: 'SSE',
      status: 'SENT',
      impactLevel: 'LOW',
      sentAt: new Date(filing.publishedDate.getTime() + 3600_000),
      createdAt: filing.publishedDate,
    });
  }

  // --- Insert alerts ---
  let created = 0;
  for (const def of alertDefs) {
    // Skip if similar alert already exists
    const existing = await prisma.alert.findFirst({
      where: { clientId: def.clientId, changeId: def.changeId, message: { startsWith: def.message.slice(0, 50) } },
    });
    if (existing) {
      log('SKIP', `  Alert already exists: ${def.message.slice(0, 50)}...`);
      continue;
    }

    await prisma.alert.create({
      data: {
        clientId: def.clientId,
        tenantId: DEMO_TENANT_ID,
        changeId: def.changeId,
        obligationId: def.obligationId ?? null,
        message: def.message,
        channel: def.channel,
        status: def.status,
        impactLevel: def.impactLevel,
        reviewedAt: def.reviewedAt ?? null,
        sentAt: def.sentAt ?? null,
        acknowledgedAt: def.acknowledgedAt ?? null,
        createdAt: def.createdAt,
      },
    });
    created++;

    const statusIcon = def.status === 'PENDING_REVIEW' ? 'HITL'
      : def.status === 'APPROVED' ? 'OK'
      : def.status === 'SENT' ? 'SENT'
      : 'ACK';
    log('ALERT', `  [${def.impactLevel}] [${statusIcon}] ${def.message.slice(0, 60)}...`);
  }

  // Summary
  const totalAlerts = await prisma.alert.count({ where: { tenantId: DEMO_TENANT_ID } });
  const byStatus = await prisma.alert.groupBy({ by: ['status'], where: { tenantId: DEMO_TENANT_ID }, _count: { id: true } });

  console.log('\n' + '='.repeat(60));
  log('DONE', 'Alerts seed complete!');
  console.log('='.repeat(60));
  console.log(`  Created: ${created} new alerts`);
  console.log(`  Total in DB: ${totalAlerts}`);
  byStatus.forEach((s) => console.log(`    ${s.status}: ${s._count.id}`));
  console.log('='.repeat(60));

  await prisma.$disconnect();
}

seedAlerts().catch((err) => { console.error('Seed failed:', err); process.exit(1); });
