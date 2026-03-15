// ============================================================================
// FILE: scripts/demo-seed.ts
// Generates realistic demo data for RegWatch AI presentations.
//
// Usage: npx tsx scripts/demo-seed.ts
//
// Creates:
//   3 clients (FinanceCorp, EuroTrade, TechStart)
//   8 regulatory changes (real-world based)
//   8 alerts (2 HIGH without ACK for HITL demo, 3 MEDIUM, deadlines)
//   Obligations via graph seed (runs seed-graph.ts first)
// ============================================================================

import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// Demo clients
// ---------------------------------------------------------------------------

const DEMO_CLIENTS = [
  {
    id: randomUUID(),
    tenantId: 'demo-tenant-001',
    name: 'FinanceCorp S.A.',
    countries: ['AR', 'BR', 'MX'],
    companyType: 'Financial Institution',
    industries: ['banking', 'securities', 'asset-management'],
    contactEmail: 'compliance@financecorp-demo.com',
    isActive: true,
    description: 'Holding financiero LATAM con operaciones bancarias en 3 países. Sujeto a regulaciones de AFIP, Receita Federal, SAT, CNBV, CNV y CVM.',
  },
  {
    id: randomUUID(),
    tenantId: 'demo-tenant-001',
    name: 'EuroTrade GmbH',
    countries: ['ES', 'EU'],
    companyType: 'Public Company',
    industries: ['securities', 'asset-management'],
    contactEmail: 'compliance@eurotrade-demo.com',
    isActive: true,
    description: 'Empresa de trading europeo cotizada en bolsa. Sujeta a MiFID II, DORA, CNMV, AEAT y normativa EU.',
  },
  {
    id: randomUUID(),
    tenantId: 'demo-tenant-001',
    name: 'TechStart Inc.',
    countries: ['US', 'CL'],
    companyType: 'Private Company',
    industries: ['technology', 'fintech'],
    contactEmail: 'compliance@techstart-demo.com',
    isActive: true,
    description: 'Startup fintech con sede en USA y operación en Chile. Sujeta a SEC, IRS, SII y CMF.',
  },
] as const;

// ---------------------------------------------------------------------------
// Demo regulatory changes (based on real-world regulations)
// ---------------------------------------------------------------------------

const DEMO_CHANGES = [
  {
    id: randomUUID(),
    sourceId: 'SEC_EDGAR',
    externalDocumentId: 'sec-2026-derivatives-disclosure',
    title: 'SEC Final Rule: Enhanced Derivatives Disclosure (Rule 10b-5 Amendment)',
    summary: 'The SEC requires quarterly disclosure of derivatives positions exceeding $100M notional for all public companies, effective Q3 2026. New Form 8-K triggers for material portfolio changes.',
    impactLevel: 'HIGH' as const,
    country: 'US',
    jurisdiction: 'US-FED',
    affectedAreas: ['securities', 'derivatives', 'corporate'],
    affectedIndustries: ['financial-services', 'public-companies'],
    effectiveDate: '2026-06-30',
    publishedDate: '2026-03-12',
    sourceUrl: 'https://www.sec.gov/rules/final/2026/34-derivatives.htm',
    affectsClients: ['TechStart Inc.'],
  },
  {
    id: randomUUID(),
    sourceId: 'AFIP',
    externalDocumentId: 'afip-rg-5616',
    title: 'AFIP RG 5616 — Régimen de Retención IVA sobre Pagos Electrónicos',
    summary: 'Nuevo régimen de retención del IVA aplicable a pagos mediante billeteras virtuales y plataformas electrónicas. Retención del 3% cuando el monto acumulado mensual supere $200.000.',
    impactLevel: 'HIGH' as const,
    country: 'AR',
    jurisdiction: 'AR',
    affectedAreas: ['fiscal', 'digital'],
    affectedIndustries: ['fintech', 'banking'],
    effectiveDate: '2026-05-01',
    publishedDate: '2026-03-14',
    sourceUrl: 'https://www.afip.gob.ar/rg5616',
    affectsClients: ['FinanceCorp S.A.'],
  },
  {
    id: randomUUID(),
    sourceId: 'EUR_LEX',
    externalDocumentId: 'eu-dora-its-2026',
    title: 'DORA Implementation Technical Standards — ICT Risk Management',
    summary: 'Final ITS for the Digital Operational Resilience Act specifying ICT risk management framework, incident reporting requirements, and third-party provider oversight for financial entities.',
    impactLevel: 'HIGH' as const,
    country: 'EU',
    jurisdiction: 'EU',
    affectedAreas: ['digital-finance', 'banking', 'securities'],
    affectedIndustries: ['banking', 'insurance', 'securities', 'fintech'],
    effectiveDate: '2026-07-17',
    publishedDate: '2026-03-05',
    sourceUrl: 'https://eur-lex.europa.eu/dora-its-2026',
    affectsClients: ['EuroTrade GmbH'],
  },
  {
    id: randomUUID(),
    sourceId: 'DOF_MEXICO',
    externalDocumentId: 'sat-cfdi-40-update',
    title: 'SAT — Actualización CFDI 4.0: Validación RFC Receptor',
    summary: 'El SAT requiere validación en tiempo real del RFC del receptor contra la base de datos del SAT antes de emitir CFDI. Implementación obligatoria para todos los contribuyentes.',
    impactLevel: 'MEDIUM' as const,
    country: 'MX',
    jurisdiction: 'MX-FED',
    affectedAreas: ['fiscal', 'digital'],
    affectedIndustries: ['general'],
    effectiveDate: '2026-05-01',
    publishedDate: '2026-03-09',
    sourceUrl: 'https://www.sat.gob.mx/cfdi40',
    affectsClients: ['FinanceCorp S.A.'],
  },
  {
    id: randomUUID(),
    sourceId: 'RECEITA_FEDERAL',
    externalDocumentId: 'rfb-dctf-simples-2026',
    title: 'Receita Federal — Alteração DCTF Simplificada (Simples Nacional)',
    summary: 'Nova obrigação de declarar operações com criptoativos na DCTF simplificada. Prazo de adequação: 45 dias a partir da publicação.',
    impactLevel: 'MEDIUM' as const,
    country: 'BR',
    jurisdiction: 'BR',
    affectedAreas: ['fiscal'],
    affectedIndustries: ['general', 'fintech'],
    effectiveDate: '2026-04-30',
    publishedDate: '2026-03-13',
    sourceUrl: 'https://www.gov.br/receitafederal/dctf-crypto',
    affectsClients: ['FinanceCorp S.A.'],
  },
  {
    id: randomUUID(),
    sourceId: 'BOE_SPAIN',
    externalDocumentId: 'cnmv-esg-transparency-2026',
    title: 'CNMV — Requisitos de Transparencia para Fondos ESG (SFDR Nivel 2)',
    summary: 'Actualización de requisitos de transparencia para fondos sostenibles alineándose con SFDR. Incluye nuevos indicadores de impacto adverso y plantillas de divulgación.',
    impactLevel: 'MEDIUM' as const,
    country: 'ES',
    jurisdiction: 'ES',
    affectedAreas: ['securities', 'sustainability'],
    affectedIndustries: ['asset-management'],
    effectiveDate: '2026-07-01',
    publishedDate: '2026-03-07',
    sourceUrl: 'https://www.cnmv.es/esg-sfdr-2026',
    affectsClients: ['EuroTrade GmbH'],
  },
  {
    id: randomUUID(),
    sourceId: 'SEC_EDGAR',
    externalDocumentId: 'sec-cybersecurity-update-2026',
    title: 'SEC — Updated Cybersecurity Incident Disclosure Requirements',
    summary: 'SEC amends cybersecurity disclosure rules requiring 48-hour reporting of material incidents and annual cybersecurity governance disclosures for all registrants.',
    impactLevel: 'HIGH' as const,
    country: 'US',
    jurisdiction: 'US-FED',
    affectedAreas: ['corporate', 'digital-finance'],
    affectedIndustries: ['public-companies', 'fintech', 'technology'],
    effectiveDate: '2026-09-01',
    publishedDate: '2026-03-10',
    sourceUrl: 'https://www.sec.gov/rules/final/2026/cybersecurity-update',
    affectsClients: ['TechStart Inc.'],
  },
  {
    id: randomUUID(),
    sourceId: 'BOE_SPAIN',
    externalDocumentId: 'boe-modelo-303-errata',
    title: 'BOE — Corrección de Erratas Modelo 303 IVA Trimestral',
    summary: 'Corrección de erratas en instrucciones del modelo 303, casilla 76 sobre régimen especial de criterio de caja. Cambio menor en formato.',
    impactLevel: 'LOW' as const,
    country: 'ES',
    jurisdiction: 'ES',
    affectedAreas: ['fiscal'],
    affectedIndustries: ['general'],
    effectiveDate: '2026-04-20',
    publishedDate: '2026-03-08',
    sourceUrl: 'https://www.boe.es/correccion-303-2026',
    affectsClients: ['EuroTrade GmbH'],
  },
];

// ---------------------------------------------------------------------------
// Demo alerts
// ---------------------------------------------------------------------------

const DEMO_ALERTS = [
  // 2 HIGH without ACK → HITL demo
  {
    id: randomUUID(),
    clientName: 'FinanceCorp S.A.',
    changeTitle: 'AFIP RG 5616 — Régimen de Retención IVA',
    message: 'URGENTE: El nuevo régimen de retención IVA de AFIP impacta directamente las operaciones de billeteras virtuales de FinanceCorp en Argentina. Se requiere adecuación de sistemas de pago antes del 1 de mayo de 2026. Multa por incumplimiento: 200% del impuesto retenido.',
    impactLevel: 'HIGH' as const,
    status: 'PENDING_REVIEW' as const,
    channel: 'EMAIL' as const,
    country: 'AR',
    createdAt: '2026-03-14T14:30:00Z',
  },
  {
    id: randomUUID(),
    clientName: 'EuroTrade GmbH',
    changeTitle: 'DORA Implementation Technical Standards',
    message: 'URGENTE: Los estándares técnicos de DORA requieren que EuroTrade implemente un framework de resiliencia operativa digital antes de julio 2026. Impacta infraestructura de trading, BCP y gestión de proveedores ICT.',
    impactLevel: 'HIGH' as const,
    status: 'PENDING_REVIEW' as const,
    channel: 'EMAIL' as const,
    country: 'EU',
    createdAt: '2026-03-05T10:00:00Z',
  },
  // 3 MEDIUM pending
  {
    id: randomUUID(),
    clientName: 'FinanceCorp S.A.',
    changeTitle: 'SAT — Actualización CFDI 4.0',
    message: 'La actualización del CFDI 4.0 requiere validación RFC receptor en tiempo real. FinanceCorp México debe actualizar su sistema de facturación electrónica antes del 1 de mayo.',
    impactLevel: 'MEDIUM' as const,
    status: 'SENT' as const,
    channel: 'TEAMS' as const,
    country: 'MX',
    createdAt: '2026-03-09T08:00:00Z',
  },
  {
    id: randomUUID(),
    clientName: 'FinanceCorp S.A.',
    changeTitle: 'Receita Federal — DCTF Criptoativos',
    message: 'Nueva obligación de reportar operaciones con criptoativos en la DCTF simplificada. FinanceCorp Brasil debe revisar si tiene exposición a activos digitales que requieran declaración.',
    impactLevel: 'MEDIUM' as const,
    status: 'SENT' as const,
    channel: 'TEAMS' as const,
    country: 'BR',
    createdAt: '2026-03-13T12:00:00Z',
  },
  {
    id: randomUUID(),
    clientName: 'EuroTrade GmbH',
    changeTitle: 'CNMV — Requisitos ESG',
    message: 'Nuevos requisitos de transparencia SFDR para fondos ESG de EuroTrade. Requiere actualización de plantillas de divulgación antes de julio 2026.',
    impactLevel: 'MEDIUM' as const,
    status: 'SENT' as const,
    channel: 'SSE' as const,
    country: 'ES',
    createdAt: '2026-03-07T09:00:00Z',
  },
  // 1 with deadline in 7 days → urgency demo
  {
    id: randomUUID(),
    clientName: 'FinanceCorp S.A.',
    changeTitle: 'Deadline: DDJJ F.931 Seguridad Social Argentina',
    message: 'DEADLINE EN 7 DÍAS: La declaración jurada F.931 de aportes y contribuciones de seguridad social vence el 22 de marzo. FinanceCorp Argentina debe presentar antes de la fecha límite. Penalidad: multa + intereses por aportes no ingresados.',
    impactLevel: 'HIGH' as const,
    status: 'SENT' as const,
    channel: 'EMAIL' as const,
    country: 'AR',
    createdAt: '2026-03-15T06:00:00Z',
  },
  // Acknowledged alerts for history
  {
    id: randomUUID(),
    clientName: 'TechStart Inc.',
    changeTitle: 'SEC Cybersecurity Update',
    message: 'SEC actualiza requisitos de divulgación de incidentes de ciberseguridad. TechStart debe implementar proceso de reporte de 48 horas.',
    impactLevel: 'HIGH' as const,
    status: 'ACKNOWLEDGED' as const,
    channel: 'EMAIL' as const,
    country: 'US',
    createdAt: '2026-03-10T15:00:00Z',
  },
  {
    id: randomUUID(),
    clientName: 'EuroTrade GmbH',
    changeTitle: 'BOE — Corrección Modelo 303',
    message: 'Corrección menor en instrucciones del modelo 303 IVA. Solo informativo, no requiere acción.',
    impactLevel: 'LOW' as const,
    status: 'ACKNOWLEDGED' as const,
    channel: 'SSE' as const,
    country: 'ES',
    createdAt: '2026-03-08T09:00:00Z',
  },
];

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

console.log('===== REGWATCH AI — DEMO SEED DATA =====\n');

console.log('=== CLIENTS ===');
for (const client of DEMO_CLIENTS) {
  console.log(`\n${client.name} (${client.id})`);
  console.log(`  Tenant: ${client.tenantId}`);
  console.log(`  Countries: ${client.countries.join(', ')}`);
  console.log(`  Type: ${client.companyType}`);
  console.log(`  Industries: ${client.industries.join(', ')}`);
  console.log(`  ${client.description}`);
}

console.log('\n\n=== REGULATORY CHANGES ===');
for (const change of DEMO_CHANGES) {
  console.log(`\n[${change.impactLevel}] ${change.title}`);
  console.log(`  Country: ${change.country} | Source: ${change.sourceId}`);
  console.log(`  Effective: ${change.effectiveDate} | Published: ${change.publishedDate}`);
  console.log(`  Affects: ${change.affectsClients.join(', ')}`);
}

console.log('\n\n=== ALERTS ===');
for (const alert of DEMO_ALERTS) {
  console.log(`\n[${alert.impactLevel}] [${alert.status}] ${alert.clientName}`);
  console.log(`  ${alert.changeTitle}`);
  console.log(`  Channel: ${alert.channel} | Country: ${alert.country}`);
  console.log(`  ${alert.message.slice(0, 120)}...`);
}

console.log('\n\n===== SEED DATA READY =====');
console.log('In production: insert via Prisma client + Neo4j driver');
console.log(`Total: ${DEMO_CLIENTS.length} clients, ${DEMO_CHANGES.length} changes, ${DEMO_ALERTS.length} alerts`);

// Export for programmatic use
export { DEMO_CLIENTS, DEMO_CHANGES, DEMO_ALERTS };
