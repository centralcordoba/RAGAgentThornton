// ============================================================================
// FILE: scripts/seed-graph.ts
// Seeds the Neo4j ComplianceGraph with data for 5 MVP countries.
//
// Usage: npx tsx scripts/seed-graph.ts
//
// Countries: Argentina (AR), Brasil (BR), México (MX), España (ES), USA (US)
// Per country: 3 company types × 10 obligations (5 fiscal + 3 labor + 2 corporate) + deadlines
// ============================================================================

import neo4j from 'neo4j-driver';

const NEO4J_URI = process.env['NEO4J_URI'] ?? 'bolt://localhost:7687';
const NEO4J_USER = process.env['NEO4J_USER'] ?? 'neo4j';
const NEO4J_PASSWORD = process.env['NEO4J_PASSWORD'] ?? 'neo4j_dev_password';

// ---------------------------------------------------------------------------
// Data definitions
// ---------------------------------------------------------------------------

interface SeedJurisdiction {
  id: string;
  country: string;
  name: string;
  region: string;
}

interface SeedRegulator {
  id: string;
  name: string;
  country: string;
  website: string;
}

interface SeedCompanyType {
  id: string;
  name: string;
}

interface SeedIndustry {
  id: string;
  name: string;
  sectorCode: string;
}

interface SeedObligation {
  id: string;
  title: string;
  description: string;
  area: string;
  frequency: string;
  penaltyInfo: string;
  jurisdictionId: string;
  regulatorId: string;
  companyTypeIds: string[];
  deadlineDate: string;
  deadlineType: 'hard' | 'soft';
}

// ---------------------------------------------------------------------------
// Jurisdictions
// ---------------------------------------------------------------------------

const jurisdictions: SeedJurisdiction[] = [
  { id: 'jur-ar', country: 'AR', name: 'Argentina', region: 'LATAM' },
  { id: 'jur-br', country: 'BR', name: 'Brasil', region: 'LATAM' },
  { id: 'jur-mx', country: 'MX', name: 'México', region: 'LATAM' },
  { id: 'jur-es', country: 'ES', name: 'España', region: 'EU' },
  { id: 'jur-us', country: 'US', name: 'United States', region: 'NA' },
];

// ---------------------------------------------------------------------------
// Regulators
// ---------------------------------------------------------------------------

const regulators: SeedRegulator[] = [
  // Argentina
  { id: 'reg-afip', name: 'AFIP', country: 'AR', website: 'https://www.afip.gob.ar' },
  { id: 'reg-cnv-ar', name: 'CNV Argentina', country: 'AR', website: 'https://www.cnv.gob.ar' },
  { id: 'reg-mtss-ar', name: 'Min. Trabajo Argentina', country: 'AR', website: 'https://www.argentina.gob.ar/trabajo' },
  // Brasil
  { id: 'reg-rfb', name: 'Receita Federal', country: 'BR', website: 'https://www.gov.br/receitafederal' },
  { id: 'reg-cvm', name: 'CVM', country: 'BR', website: 'https://www.gov.br/cvm' },
  { id: 'reg-mte-br', name: 'Min. Trabalho Brasil', country: 'BR', website: 'https://www.gov.br/trabalho-e-emprego' },
  // México
  { id: 'reg-sat', name: 'SAT', country: 'MX', website: 'https://www.sat.gob.mx' },
  { id: 'reg-cnbv', name: 'CNBV', country: 'MX', website: 'https://www.cnbv.gob.mx' },
  { id: 'reg-stps', name: 'STPS', country: 'MX', website: 'https://www.gob.mx/stps' },
  // España
  { id: 'reg-aeat', name: 'AEAT', country: 'ES', website: 'https://sede.agenciatributaria.gob.es' },
  { id: 'reg-cnmv', name: 'CNMV', country: 'ES', website: 'https://www.cnmv.es' },
  { id: 'reg-mites', name: 'Min. Trabajo España', country: 'ES', website: 'https://www.mites.gob.es' },
  // USA
  { id: 'reg-irs', name: 'IRS', country: 'US', website: 'https://www.irs.gov' },
  { id: 'reg-sec', name: 'SEC', country: 'US', website: 'https://www.sec.gov' },
  { id: 'reg-dol', name: 'Department of Labor', country: 'US', website: 'https://www.dol.gov' },
];

// ---------------------------------------------------------------------------
// Company types
// ---------------------------------------------------------------------------

const companyTypes: SeedCompanyType[] = [
  { id: 'ct-public', name: 'Public Company' },
  { id: 'ct-financial', name: 'Financial Institution' },
  { id: 'ct-private', name: 'Private Company' },
];

// ---------------------------------------------------------------------------
// Industries
// ---------------------------------------------------------------------------

const industries: SeedIndustry[] = [
  { id: 'ind-banking', name: 'Banking', sectorCode: 'FIN-BANK' },
  { id: 'ind-insurance', name: 'Insurance', sectorCode: 'FIN-INS' },
  { id: 'ind-securities', name: 'Securities', sectorCode: 'FIN-SEC' },
  { id: 'ind-energy', name: 'Energy', sectorCode: 'ENR' },
  { id: 'ind-tech', name: 'Technology', sectorCode: 'TECH' },
];

// ---------------------------------------------------------------------------
// Obligations — 10 per country (5 fiscal + 3 labor + 2 corporate)
// ---------------------------------------------------------------------------

const obligations: SeedObligation[] = [
  // ===== ARGENTINA =====
  // Fiscal (5)
  { id: 'obl-ar-f1', title: 'Declaración Jurada IVA Mensual', description: 'Presentación mensual de DJ de IVA ante AFIP', area: 'fiscal', frequency: 'monthly', penaltyInfo: 'Multa automática + intereses resarcitorios', jurisdictionId: 'jur-ar', regulatorId: 'reg-afip', companyTypeIds: ['ct-public', 'ct-financial', 'ct-private'], deadlineDate: '2026-04-20', deadlineType: 'hard' },
  { id: 'obl-ar-f2', title: 'Declaración Jurada Ganancias Anual', description: 'Presentación anual de impuesto a las ganancias', area: 'fiscal', frequency: 'annual', penaltyInfo: 'Multa 200% del impuesto omitido', jurisdictionId: 'jur-ar', regulatorId: 'reg-afip', companyTypeIds: ['ct-public', 'ct-financial', 'ct-private'], deadlineDate: '2026-06-30', deadlineType: 'hard' },
  { id: 'obl-ar-f3', title: 'Régimen de Información de Operaciones Internacionales', description: 'Informe de precios de transferencia', area: 'fiscal', frequency: 'annual', penaltyInfo: 'Multa graduable según monto', jurisdictionId: 'jur-ar', regulatorId: 'reg-afip', companyTypeIds: ['ct-public', 'ct-financial'], deadlineDate: '2026-07-31', deadlineType: 'hard' },
  { id: 'obl-ar-f4', title: 'Retenciones y Percepciones IVA/Ganancias', description: 'Ingreso de retenciones y percepciones practicadas', area: 'fiscal', frequency: 'monthly', penaltyInfo: 'Intereses punitorios sobre capital adeudado', jurisdictionId: 'jur-ar', regulatorId: 'reg-afip', companyTypeIds: ['ct-public', 'ct-financial', 'ct-private'], deadlineDate: '2026-04-15', deadlineType: 'hard' },
  { id: 'obl-ar-f5', title: 'Régimen Informativo de Compras y Ventas (CITI)', description: 'Informe mensual CITI compras y ventas', area: 'fiscal', frequency: 'monthly', penaltyInfo: 'Multa formal por incumplimiento', jurisdictionId: 'jur-ar', regulatorId: 'reg-afip', companyTypeIds: ['ct-public', 'ct-financial', 'ct-private'], deadlineDate: '2026-04-18', deadlineType: 'hard' },
  // Labor (3)
  { id: 'obl-ar-l1', title: 'Presentación DDJJ F.931 Seguridad Social', description: 'Declaración jurada mensual de aportes y contribuciones', area: 'labor', frequency: 'monthly', penaltyInfo: 'Multa + intereses sobre aportes no ingresados', jurisdictionId: 'jur-ar', regulatorId: 'reg-mtss-ar', companyTypeIds: ['ct-public', 'ct-financial', 'ct-private'], deadlineDate: '2026-04-13', deadlineType: 'hard' },
  { id: 'obl-ar-l2', title: 'Registro de Contratos de Trabajo (NOM035)', description: 'Alta y baja de empleados ante AFIP', area: 'labor', frequency: 'on-event', penaltyInfo: 'Multa por trabajo no registrado', jurisdictionId: 'jur-ar', regulatorId: 'reg-mtss-ar', companyTypeIds: ['ct-public', 'ct-financial', 'ct-private'], deadlineDate: '2026-12-31', deadlineType: 'soft' },
  { id: 'obl-ar-l3', title: 'ART - Aseguradora de Riesgos del Trabajo', description: 'Mantener cobertura ART vigente para todos los empleados', area: 'labor', frequency: 'continuous', penaltyInfo: 'Sanciones graves por falta de cobertura', jurisdictionId: 'jur-ar', regulatorId: 'reg-mtss-ar', companyTypeIds: ['ct-public', 'ct-financial', 'ct-private'], deadlineDate: '2026-12-31', deadlineType: 'hard' },
  // Corporate (2)
  { id: 'obl-ar-c1', title: 'Presentación Balance ante CNV', description: 'Presentación de estados contables anuales para empresas cotizantes', area: 'corporate', frequency: 'annual', penaltyInfo: 'Suspensión de cotización', jurisdictionId: 'jur-ar', regulatorId: 'reg-cnv-ar', companyTypeIds: ['ct-public'], deadlineDate: '2026-04-30', deadlineType: 'hard' },
  { id: 'obl-ar-c2', title: 'Asamblea General Ordinaria', description: 'Asamblea anual de accionistas dentro de los 4 meses del cierre', area: 'corporate', frequency: 'annual', penaltyInfo: 'Irregularidades societarias', jurisdictionId: 'jur-ar', regulatorId: 'reg-cnv-ar', companyTypeIds: ['ct-public', 'ct-financial'], deadlineDate: '2026-04-30', deadlineType: 'hard' },

  // ===== BRASIL =====
  // Fiscal (5)
  { id: 'obl-br-f1', title: 'DCTF — Declaração de Débitos e Créditos Tributários', description: 'Declaração mensal de tributos federais', area: 'fiscal', frequency: 'monthly', penaltyInfo: 'Multa de 2% ao mês sobre tributos informados', jurisdictionId: 'jur-br', regulatorId: 'reg-rfb', companyTypeIds: ['ct-public', 'ct-financial', 'ct-private'], deadlineDate: '2026-04-15', deadlineType: 'hard' },
  { id: 'obl-br-f2', title: 'ECD — Escrituração Contábil Digital', description: 'Transmissão anual do SPED contábil', area: 'fiscal', frequency: 'annual', penaltyInfo: 'Multa de R$500/mês de atraso', jurisdictionId: 'jur-br', regulatorId: 'reg-rfb', companyTypeIds: ['ct-public', 'ct-financial', 'ct-private'], deadlineDate: '2026-06-30', deadlineType: 'hard' },
  { id: 'obl-br-f3', title: 'ECF — Escrituração Contábil Fiscal', description: 'Declaração do imposto de renda pessoa jurídica', area: 'fiscal', frequency: 'annual', penaltyInfo: 'Multa de 3% sobre valor omitido', jurisdictionId: 'jur-br', regulatorId: 'reg-rfb', companyTypeIds: ['ct-public', 'ct-financial', 'ct-private'], deadlineDate: '2026-07-31', deadlineType: 'hard' },
  { id: 'obl-br-f4', title: 'REINF — Escrituração de Retenções', description: 'Informações sobre retenções e pagamentos', area: 'fiscal', frequency: 'monthly', penaltyInfo: 'Multas por atraso na entrega', jurisdictionId: 'jur-br', regulatorId: 'reg-rfb', companyTypeIds: ['ct-public', 'ct-financial', 'ct-private'], deadlineDate: '2026-04-15', deadlineType: 'hard' },
  { id: 'obl-br-f5', title: 'PIS/COFINS — Apuração Mensal', description: 'Cálculo e recolhimento mensal PIS/COFINS', area: 'fiscal', frequency: 'monthly', penaltyInfo: 'Multa de 75% sobre tributo não declarado', jurisdictionId: 'jur-br', regulatorId: 'reg-rfb', companyTypeIds: ['ct-public', 'ct-financial', 'ct-private'], deadlineDate: '2026-04-25', deadlineType: 'hard' },
  // Labor (3)
  { id: 'obl-br-l1', title: 'eSocial — Eventos Trabalhistas', description: 'Transmissão de eventos trabalhistas via eSocial', area: 'labor', frequency: 'monthly', penaltyInfo: 'Multas por descumprimento de prazo', jurisdictionId: 'jur-br', regulatorId: 'reg-mte-br', companyTypeIds: ['ct-public', 'ct-financial', 'ct-private'], deadlineDate: '2026-04-07', deadlineType: 'hard' },
  { id: 'obl-br-l2', title: 'FGTS — Recolhimento Mensal', description: 'Depósito mensal do FGTS dos empregados', area: 'labor', frequency: 'monthly', penaltyInfo: 'Multa + juros sobre depósitos em atraso', jurisdictionId: 'jur-br', regulatorId: 'reg-mte-br', companyTypeIds: ['ct-public', 'ct-financial', 'ct-private'], deadlineDate: '2026-04-07', deadlineType: 'hard' },
  { id: 'obl-br-l3', title: 'RAIS — Relação Anual de Informações Sociais', description: 'Declaração anual sobre vínculos empregatícios', area: 'labor', frequency: 'annual', penaltyInfo: 'Multa a partir de R$425,64', jurisdictionId: 'jur-br', regulatorId: 'reg-mte-br', companyTypeIds: ['ct-public', 'ct-financial', 'ct-private'], deadlineDate: '2026-03-28', deadlineType: 'hard' },
  // Corporate (2)
  { id: 'obl-br-c1', title: 'DFP — Demonstrações Financeiras Padronizadas', description: 'Publicação das demonstrações financeiras para empresas abertas', area: 'corporate', frequency: 'annual', penaltyInfo: 'Suspensão de negociação', jurisdictionId: 'jur-br', regulatorId: 'reg-cvm', companyTypeIds: ['ct-public'], deadlineDate: '2026-03-31', deadlineType: 'hard' },
  { id: 'obl-br-c2', title: 'Assembleia Geral Ordinária', description: 'AGO dentro de 4 meses do encerramento do exercício', area: 'corporate', frequency: 'annual', penaltyInfo: 'Irregularidades societárias', jurisdictionId: 'jur-br', regulatorId: 'reg-cvm', companyTypeIds: ['ct-public', 'ct-financial'], deadlineDate: '2026-04-30', deadlineType: 'hard' },

  // ===== MÉXICO =====
  // Fiscal (5)
  { id: 'obl-mx-f1', title: 'Declaración Anual ISR Personas Morales', description: 'Presentación anual del impuesto sobre la renta corporativo', area: 'fiscal', frequency: 'annual', penaltyInfo: 'Multa de $1,560 a $19,350 MXN por no presentar', jurisdictionId: 'jur-mx', regulatorId: 'reg-sat', companyTypeIds: ['ct-public', 'ct-financial', 'ct-private'], deadlineDate: '2026-03-31', deadlineType: 'hard' },
  { id: 'obl-mx-f2', title: 'DIOT — Declaración Informativa de Operaciones con Terceros', description: 'Informe mensual de operaciones con proveedores', area: 'fiscal', frequency: 'monthly', penaltyInfo: 'Multa por presentación extemporánea', jurisdictionId: 'jur-mx', regulatorId: 'reg-sat', companyTypeIds: ['ct-public', 'ct-financial', 'ct-private'], deadlineDate: '2026-04-17', deadlineType: 'hard' },
  { id: 'obl-mx-f3', title: 'Pagos Provisionales ISR Mensual', description: 'Pago provisional mensual de ISR', area: 'fiscal', frequency: 'monthly', penaltyInfo: 'Recargos y actualización sobre impuesto omitido', jurisdictionId: 'jur-mx', regulatorId: 'reg-sat', companyTypeIds: ['ct-public', 'ct-financial', 'ct-private'], deadlineDate: '2026-04-17', deadlineType: 'hard' },
  { id: 'obl-mx-f4', title: 'Declaración IVA Mensual', description: 'Pago definitivo mensual de IVA', area: 'fiscal', frequency: 'monthly', penaltyInfo: 'Recargos + multa por omisión', jurisdictionId: 'jur-mx', regulatorId: 'reg-sat', companyTypeIds: ['ct-public', 'ct-financial', 'ct-private'], deadlineDate: '2026-04-17', deadlineType: 'hard' },
  { id: 'obl-mx-f5', title: 'Contabilidad Electrónica — Envío Mensual', description: 'Envío de balanza de comprobación y catálogo de cuentas', area: 'fiscal', frequency: 'monthly', penaltyInfo: 'Multa de $5,000 a $15,000 MXN', jurisdictionId: 'jur-mx', regulatorId: 'reg-sat', companyTypeIds: ['ct-public', 'ct-financial', 'ct-private'], deadlineDate: '2026-04-25', deadlineType: 'hard' },
  // Labor (3)
  { id: 'obl-mx-l1', title: 'NOM-035 — Factores de Riesgo Psicosocial', description: 'Política de prevención de riesgos psicosociales laborales', area: 'labor', frequency: 'annual', penaltyInfo: 'Multa de 250 a 5000 UMA', jurisdictionId: 'jur-mx', regulatorId: 'reg-stps', companyTypeIds: ['ct-public', 'ct-financial', 'ct-private'], deadlineDate: '2026-12-31', deadlineType: 'soft' },
  { id: 'obl-mx-l2', title: 'IMSS — Declaración Anual de Prima de Riesgo', description: 'Determinación anual de la prima de riesgo de trabajo', area: 'labor', frequency: 'annual', penaltyInfo: 'Multa por determinación incorrecta', jurisdictionId: 'jur-mx', regulatorId: 'reg-stps', companyTypeIds: ['ct-public', 'ct-financial', 'ct-private'], deadlineDate: '2026-02-28', deadlineType: 'hard' },
  { id: 'obl-mx-l3', title: 'PTU — Reparto de Utilidades', description: 'Distribución de utilidades a trabajadores', area: 'labor', frequency: 'annual', penaltyInfo: 'Multa por incumplimiento laboral', jurisdictionId: 'jur-mx', regulatorId: 'reg-stps', companyTypeIds: ['ct-public', 'ct-financial', 'ct-private'], deadlineDate: '2026-05-30', deadlineType: 'hard' },
  // Corporate (2)
  { id: 'obl-mx-c1', title: 'Informe Anual BMV', description: 'Presentación de informe anual ante la Bolsa Mexicana de Valores', area: 'corporate', frequency: 'annual', penaltyInfo: 'Suspensión de cotización', jurisdictionId: 'jur-mx', regulatorId: 'reg-cnbv', companyTypeIds: ['ct-public'], deadlineDate: '2026-04-30', deadlineType: 'hard' },
  { id: 'obl-mx-c2', title: 'Reporte de Operaciones Relevantes (Art. 31 CNBV)', description: 'Reporte trimestral de operaciones financieras relevantes', area: 'corporate', frequency: 'quarterly', penaltyInfo: 'Multa administrativa CNBV', jurisdictionId: 'jur-mx', regulatorId: 'reg-cnbv', companyTypeIds: ['ct-public', 'ct-financial'], deadlineDate: '2026-04-17', deadlineType: 'hard' },

  // ===== ESPAÑA =====
  // Fiscal (5)
  { id: 'obl-es-f1', title: 'Modelo 303 — Autoliquidación IVA Trimestral', description: 'Declaración trimestral del IVA', area: 'fiscal', frequency: 'quarterly', penaltyInfo: 'Recargo del 5-20% + intereses de demora', jurisdictionId: 'jur-es', regulatorId: 'reg-aeat', companyTypeIds: ['ct-public', 'ct-financial', 'ct-private'], deadlineDate: '2026-04-20', deadlineType: 'hard' },
  { id: 'obl-es-f2', title: 'Modelo 200 — Impuesto de Sociedades', description: 'Declaración anual del impuesto sobre sociedades', area: 'fiscal', frequency: 'annual', penaltyInfo: 'Sanción grave: multa 50-100% de la cuota', jurisdictionId: 'jur-es', regulatorId: 'reg-aeat', companyTypeIds: ['ct-public', 'ct-financial', 'ct-private'], deadlineDate: '2026-07-25', deadlineType: 'hard' },
  { id: 'obl-es-f3', title: 'Modelo 111 — Retenciones IRPF', description: 'Declaración trimestral de retenciones e ingresos a cuenta', area: 'fiscal', frequency: 'quarterly', penaltyInfo: 'Recargo por declaración extemporánea', jurisdictionId: 'jur-es', regulatorId: 'reg-aeat', companyTypeIds: ['ct-public', 'ct-financial', 'ct-private'], deadlineDate: '2026-04-20', deadlineType: 'hard' },
  { id: 'obl-es-f4', title: 'SII — Suministro Inmediato de Información del IVA', description: 'Registro electrónico de facturas en tiempo cuasi-real', area: 'fiscal', frequency: 'continuous', penaltyInfo: 'Multa de 0.5% del importe por registro', jurisdictionId: 'jur-es', regulatorId: 'reg-aeat', companyTypeIds: ['ct-public', 'ct-financial'], deadlineDate: '2026-12-31', deadlineType: 'hard' },
  { id: 'obl-es-f5', title: 'Modelo 720 — Declaración de Bienes en el Extranjero', description: 'Declaración informativa de bienes y derechos situados en el extranjero', area: 'fiscal', frequency: 'annual', penaltyInfo: 'Sanción de 5.000€ por dato omitido', jurisdictionId: 'jur-es', regulatorId: 'reg-aeat', companyTypeIds: ['ct-public', 'ct-financial', 'ct-private'], deadlineDate: '2026-03-31', deadlineType: 'hard' },
  // Labor (3)
  { id: 'obl-es-l1', title: 'Cotización a la Seguridad Social', description: 'Ingreso mensual de cuotas de la Seguridad Social', area: 'labor', frequency: 'monthly', penaltyInfo: 'Recargo del 20% + intereses', jurisdictionId: 'jur-es', regulatorId: 'reg-mites', companyTypeIds: ['ct-public', 'ct-financial', 'ct-private'], deadlineDate: '2026-04-30', deadlineType: 'hard' },
  { id: 'obl-es-l2', title: 'Plan de Igualdad', description: 'Empresas con 50+ empleados deben registrar plan de igualdad', area: 'labor', frequency: 'once', penaltyInfo: 'Sanción grave: 7.501-30.000€', jurisdictionId: 'jur-es', regulatorId: 'reg-mites', companyTypeIds: ['ct-public', 'ct-financial', 'ct-private'], deadlineDate: '2026-12-31', deadlineType: 'soft' },
  { id: 'obl-es-l3', title: 'Registro Retributivo', description: 'Registro de salarios desglosado por sexo y categoría', area: 'labor', frequency: 'annual', penaltyInfo: 'Sanción grave por brecha retributiva', jurisdictionId: 'jur-es', regulatorId: 'reg-mites', companyTypeIds: ['ct-public', 'ct-financial', 'ct-private'], deadlineDate: '2026-12-31', deadlineType: 'soft' },
  // Corporate (2)
  { id: 'obl-es-c1', title: 'Cuentas Anuales — Depósito Registro Mercantil', description: 'Depósito de cuentas anuales aprobadas en el registro mercantil', area: 'corporate', frequency: 'annual', penaltyInfo: 'Cierre de hoja registral', jurisdictionId: 'jur-es', regulatorId: 'reg-cnmv', companyTypeIds: ['ct-public', 'ct-financial', 'ct-private'], deadlineDate: '2026-07-31', deadlineType: 'hard' },
  { id: 'obl-es-c2', title: 'IAGC — Informe Anual de Gobierno Corporativo', description: 'Informe obligatorio para empresas cotizadas', area: 'corporate', frequency: 'annual', penaltyInfo: 'Sanción CNMV por incumplimiento', jurisdictionId: 'jur-es', regulatorId: 'reg-cnmv', companyTypeIds: ['ct-public'], deadlineDate: '2026-04-30', deadlineType: 'hard' },

  // ===== USA =====
  // Fiscal (5)
  { id: 'obl-us-f1', title: 'Form 1120 — Corporate Income Tax Return', description: 'Annual federal corporate income tax return', area: 'fiscal', frequency: 'annual', penaltyInfo: '5% of unpaid tax per month, max 25%', jurisdictionId: 'jur-us', regulatorId: 'reg-irs', companyTypeIds: ['ct-public', 'ct-financial', 'ct-private'], deadlineDate: '2026-04-15', deadlineType: 'hard' },
  { id: 'obl-us-f2', title: 'Form 941 — Quarterly Employment Tax', description: 'Quarterly employer tax return for payroll taxes', area: 'fiscal', frequency: 'quarterly', penaltyInfo: '5% of unpaid tax per month', jurisdictionId: 'jur-us', regulatorId: 'reg-irs', companyTypeIds: ['ct-public', 'ct-financial', 'ct-private'], deadlineDate: '2026-04-30', deadlineType: 'hard' },
  { id: 'obl-us-f3', title: 'Estimated Tax Payments (Form 1120-W)', description: 'Quarterly estimated tax payments for corporations', area: 'fiscal', frequency: 'quarterly', penaltyInfo: 'Underpayment penalty + interest', jurisdictionId: 'jur-us', regulatorId: 'reg-irs', companyTypeIds: ['ct-public', 'ct-financial', 'ct-private'], deadlineDate: '2026-04-15', deadlineType: 'hard' },
  { id: 'obl-us-f4', title: 'Form 5471 — Foreign Corporation Reporting', description: 'Information return for US persons with foreign corporation interests', area: 'fiscal', frequency: 'annual', penaltyInfo: '$10,000 per return penalty', jurisdictionId: 'jur-us', regulatorId: 'reg-irs', companyTypeIds: ['ct-public', 'ct-financial'], deadlineDate: '2026-04-15', deadlineType: 'hard' },
  { id: 'obl-us-f5', title: 'FBAR — FinCEN Report 114', description: 'Report of foreign bank and financial accounts', area: 'fiscal', frequency: 'annual', penaltyInfo: 'Up to $12,909 per violation (non-willful)', jurisdictionId: 'jur-us', regulatorId: 'reg-irs', companyTypeIds: ['ct-public', 'ct-financial'], deadlineDate: '2026-04-15', deadlineType: 'hard' },
  // Labor (3)
  { id: 'obl-us-l1', title: 'EEO-1 Report — Employer Information', description: 'Annual demographic workforce data report', area: 'labor', frequency: 'annual', penaltyInfo: 'Compelled filing by court order', jurisdictionId: 'jur-us', regulatorId: 'reg-dol', companyTypeIds: ['ct-public', 'ct-financial', 'ct-private'], deadlineDate: '2026-05-31', deadlineType: 'hard' },
  { id: 'obl-us-l2', title: 'OSHA 300A — Injury and Illness Summary', description: 'Annual posting of workplace injury/illness summary', area: 'labor', frequency: 'annual', penaltyInfo: 'Up to $15,625 per violation', jurisdictionId: 'jur-us', regulatorId: 'reg-dol', companyTypeIds: ['ct-public', 'ct-financial', 'ct-private'], deadlineDate: '2026-02-01', deadlineType: 'hard' },
  { id: 'obl-us-l3', title: 'Form 5500 — Employee Benefit Plan Report', description: 'Annual return for employee benefit plans (ERISA)', area: 'labor', frequency: 'annual', penaltyInfo: '$250/day late filing penalty', jurisdictionId: 'jur-us', regulatorId: 'reg-dol', companyTypeIds: ['ct-public', 'ct-financial', 'ct-private'], deadlineDate: '2026-07-31', deadlineType: 'hard' },
  // Corporate (2)
  { id: 'obl-us-c1', title: '10-K Annual Report Filing', description: 'Annual report filing with SEC for public companies', area: 'corporate', frequency: 'annual', penaltyInfo: 'Deregistration risk + shareholder lawsuits', jurisdictionId: 'jur-us', regulatorId: 'reg-sec', companyTypeIds: ['ct-public'], deadlineDate: '2026-03-02', deadlineType: 'hard' },
  { id: 'obl-us-c2', title: 'Proxy Statement — DEF 14A', description: 'Annual proxy statement for shareholder meetings', area: 'corporate', frequency: 'annual', penaltyInfo: 'SEC enforcement action', jurisdictionId: 'jur-us', regulatorId: 'reg-sec', companyTypeIds: ['ct-public'], deadlineDate: '2026-04-30', deadlineType: 'hard' },
];

// ---------------------------------------------------------------------------
// Seed execution
// ---------------------------------------------------------------------------

async function seed(): Promise<void> {
  const driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
  const session = driver.session();

  console.log('🌱 Seeding Neo4j ComplianceGraph...');
  console.log(`   URI: ${NEO4J_URI}`);

  try {
    // Clear existing data
    console.log('   Clearing existing data...');
    await session.run('MATCH (n) DETACH DELETE n');

    // Create constraints
    console.log('   Creating constraints...');
    const { SCHEMA_CONSTRAINTS: constraints, SCHEMA_INDEXES: indexes } = await import('../apps/api/src/graph/schema.js');
    for (const c of constraints) { await session.run(c); }
    for (const i of indexes) { await session.run(i); }

    // Create jurisdictions
    console.log('   Creating jurisdictions...');
    for (const j of jurisdictions) {
      await session.run(
        'CREATE (j:Jurisdiction {id: $id, country: $country, name: $name, region: $region})',
        j,
      );
    }

    // Create regulators + OPERATES_IN relationships
    console.log('   Creating regulators...');
    for (const r of regulators) {
      await session.run(
        `CREATE (r:Regulator {id: $id, name: $name, country: $country, website: $website})
         WITH r
         MATCH (j:Jurisdiction {country: $country})
         CREATE (r)-[:OPERATES_IN]->(j)`,
        r,
      );
    }

    // Create company types
    console.log('   Creating company types...');
    for (const ct of companyTypes) {
      await session.run(
        'CREATE (ct:CompanyType {id: $id, name: $name})',
        ct,
      );
    }

    // Create industries
    console.log('   Creating industries...');
    for (const ind of industries) {
      await session.run(
        'CREATE (i:Industry {id: $id, name: $name, sectorCode: $sectorCode})',
        ind,
      );
    }

    // Create obligations + relationships
    console.log('   Creating obligations and relationships...');
    for (const obl of obligations) {
      await session.run(
        `CREATE (o:Obligation {
           id: $id, title: $title, description: $description,
           area: $area, status: 'PENDING', frequency: $frequency, penaltyInfo: $penaltyInfo
         })
         WITH o
         // Deadline
         CREATE (d:Deadline {
           id: $id + '-deadline', nextDueDate: date($deadlineDate),
           type: $deadlineType, frequency: $frequency, penaltyInfo: $penaltyInfo
         })
         CREATE (o)-[:HAS_DEADLINE]->(d)
         WITH o
         // Jurisdiction
         MATCH (j:Jurisdiction {id: $jurisdictionId})
         CREATE (j)-[:HAS_OBLIGATION]->(o)
         WITH o
         // Regulator
         MATCH (r:Regulator {id: $regulatorId})
         CREATE (o)-[:REGULATED_BY]->(r)`,
        {
          ...obl,
          deadlineDate: obl.deadlineDate,
        },
      );

      // CompanyType relationships
      for (const ctId of obl.companyTypeIds) {
        await session.run(
          `MATCH (ct:CompanyType {id: $ctId}), (o:Obligation {id: $oblId})
           CREATE (ct)-[:SUBJECT_TO]->(o)`,
          { ctId, oblId: obl.id },
        );
      }
    }

    // Summary
    const countResult = await session.run(
      `MATCH (n) RETURN labels(n)[0] AS label, count(n) AS count ORDER BY label`,
    );

    console.log('\n✅ Seed complete! Node counts:');
    for (const record of countResult.records) {
      console.log(`   ${record.get('label')}: ${record.get('count').toNumber()}`);
    }

    const relResult = await session.run(
      `MATCH ()-[r]->() RETURN type(r) AS type, count(r) AS count ORDER BY type`,
    );
    console.log('\n   Relationship counts:');
    for (const record of relResult.records) {
      console.log(`   ${record.get('type')}: ${record.get('count').toNumber()}`);
    }
  } finally {
    await session.close();
    await driver.close();
  }
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
