// ============================================================================
// FILE: apps/api/src/services/onboarding.ts
// Onboarding Engine — generates a ComplianceMap for new clients.
//
// Flow:
//   1. Per country: query Neo4j obligations + AI Search recent changes (6 months)
//   2. Classify urgency: < 30 days CRITICAL, < 90 IMPORTANT
//   3. Detect cross-country overlaps
//   4. Generate executive summary (ES + EN) + immediate actions + 12-month timeline
// ============================================================================

import { randomUUID } from 'node:crypto';
import type { Client } from '@regwatch/shared';
import { createServiceLogger } from '../config/logger.js';
import type { ComplianceGraphService } from '../graph/complianceGraph.js';
import type { ObligationDetail } from '../graph/types.js';

const logger = createServiceLogger('service:onboarding');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ComplianceMap {
  readonly client: ClientSummary;
  readonly generatedAt: Date;
  readonly countries: readonly CountryCompliance[];
  readonly executiveSummary: ExecutiveSummary;
  readonly immediateActions: readonly string[];
  readonly timeline: readonly TimelineItem[];
  readonly crossCountryOverlaps: readonly CrossCountryOverlap[];
  readonly stats: ComplianceMapStats;
}

export interface ClientSummary {
  readonly id: string;
  readonly name: string;
  readonly companyType: string;
  readonly countries: readonly string[];
  readonly industries: readonly string[];
}

export interface CountryCompliance {
  readonly country: string;
  readonly countryName: string;
  readonly obligations: readonly ObligationDetail[];
  readonly criticalDeadlines: readonly CriticalDeadline[];
  readonly recentChanges: readonly RecentChange[];
  readonly riskScore: number;
  readonly obligationsByArea: Readonly<Record<string, number>>;
}

export interface CriticalDeadline {
  readonly obligationId: string;
  readonly obligationTitle: string;
  readonly dueDate: string;
  readonly daysUntilDue: number;
  readonly urgency: 'CRITICAL' | 'IMPORTANT' | 'NORMAL';
  readonly penaltyInfo: string;
}

export interface RecentChange {
  readonly id: string;
  readonly title: string;
  readonly country: string;
  readonly impactLevel: string;
  readonly publishedDate: string;
  readonly summary: string;
  readonly sourceUrl: string;
}

export interface ExecutiveSummary {
  readonly es: string;
  readonly en: string;
}

export interface TimelineItem {
  readonly date: string;
  readonly month: string;
  readonly obligations: readonly TimelineObligation[];
}

export interface TimelineObligation {
  readonly id: string;
  readonly title: string;
  readonly country: string;
  readonly area: string;
  readonly urgency: 'CRITICAL' | 'IMPORTANT' | 'NORMAL';
}

export interface CrossCountryOverlap {
  readonly area: string;
  readonly countries: readonly string[];
  readonly obligations: readonly string[];
  readonly recommendation: string;
}

export interface ComplianceMapStats {
  readonly totalObligations: number;
  readonly criticalCount: number;
  readonly importantCount: number;
  readonly countriesCount: number;
  readonly areasCount: number;
}

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

export interface OnboardingDeps {
  readonly graphService: ComplianceGraphService;
  readonly searchRecentChanges: (country: string, monthsBack: number) => Promise<readonly RecentChange[]>;
  readonly generateSummary: (params: SummaryGenerationParams) => Promise<ExecutiveSummary>;
}

export interface SummaryGenerationParams {
  readonly clientName: string;
  readonly companyType: string;
  readonly countries: readonly string[];
  readonly industries: readonly string[];
  readonly totalObligations: number;
  readonly criticalCount: number;
  readonly topObligations: readonly string[];
  readonly upcomingDeadlines: readonly string[];
  readonly recentChanges: readonly string[];
}

// ---------------------------------------------------------------------------
// Country name mapping
// ---------------------------------------------------------------------------

const COUNTRY_NAMES: Readonly<Record<string, string>> = {
  AR: 'Argentina',
  BR: 'Brasil',
  MX: 'México',
  ES: 'España',
  US: 'United States',
  CL: 'Chile',
  CO: 'Colombia',
  PE: 'Perú',
  UY: 'Uruguay',
  EU: 'European Union',
};

// ---------------------------------------------------------------------------
// OnboardingEngine
// ---------------------------------------------------------------------------

export class OnboardingEngine {
  private readonly deps: OnboardingDeps;

  constructor(deps: OnboardingDeps) {
    this.deps = deps;
  }

  /**
   * Generate a full ComplianceMap for a new client.
   *
   * Steps:
   * 1. Register client in Neo4j graph
   * 2. Per country: query obligations + recent changes (6 months)
   * 3. Classify urgency by deadline proximity
   * 4. Detect cross-country overlaps in same area
   * 5. Generate executive summary (ES + EN) via Azure OpenAI
   * 6. Build 12-month timeline
   */
  async generateComplianceMap(client: Client): Promise<ComplianceMap> {
    const requestId = randomUUID();
    const startTime = Date.now();

    logger.info({
      operation: 'onboarding:start',
      requestId,
      clientId: client.id,
      tenantId: client.tenantId,
      countries: client.countries,
      companyType: client.companyType,
      industries: client.industries,
    });

    // --- Step 1: Register client in graph ---
    const assignedCount = await this.deps.graphService.registerClient(client);

    logger.info({
      operation: 'onboarding:graph_registered',
      requestId,
      clientId: client.id,
      assignedObligations: assignedCount,
      duration: Date.now() - startTime,
      result: 'success',
    });

    // --- Step 2: Get obligations per country ---
    const obligationMap = await this.deps.graphService.getClientObligations(client);

    // --- Step 3: Per country — obligations + recent changes + deadlines ---
    const countries: CountryCompliance[] = [];

    for (const country of client.countries) {
      const countryObligations = obligationMap.byCountry[country] ?? [];

      // Fetch recent regulatory changes (last 6 months)
      let recentChanges: readonly RecentChange[] = [];
      try {
        recentChanges = await this.deps.searchRecentChanges(country, 6);
      } catch (err) {
        logger.warn({
          operation: 'onboarding:search_recent_changes',
          requestId,
          clientId: client.id,
          country,
          result: 'error',
          error: err instanceof Error ? err.message : String(err),
        });
      }

      // Classify deadlines by urgency
      const criticalDeadlines = classifyDeadlines(countryObligations);

      // Calculate risk score
      const riskScore = calculateRiskScore(countryObligations, criticalDeadlines, recentChanges);

      // Count by area
      const obligationsByArea: Record<string, number> = {};
      for (const obl of countryObligations) {
        obligationsByArea[obl.area] = (obligationsByArea[obl.area] ?? 0) + 1;
      }

      countries.push({
        country,
        countryName: COUNTRY_NAMES[country] ?? country,
        obligations: countryObligations,
        criticalDeadlines,
        recentChanges,
        riskScore,
        obligationsByArea,
      });
    }

    // --- Step 4: Detect cross-country overlaps ---
    const crossCountryOverlaps = detectOverlaps(countries);

    // --- Step 5: Build 12-month timeline ---
    const allObligations = countries.flatMap((c) => c.obligations);
    const allDeadlines = countries.flatMap((c) => c.criticalDeadlines);
    const timeline = buildTimeline(allObligations, allDeadlines);

    // --- Step 6: Generate executive summary ---
    const stats = computeStats(countries);

    let executiveSummary: ExecutiveSummary;
    try {
      executiveSummary = await this.deps.generateSummary({
        clientName: client.name,
        companyType: client.companyType,
        countries: client.countries,
        industries: client.industries,
        totalObligations: stats.totalObligations,
        criticalCount: stats.criticalCount,
        topObligations: allObligations
          .slice(0, 10)
          .map((o) => `${o.title} (${o.jurisdiction.country}, ${o.area})`),
        upcomingDeadlines: allDeadlines
          .filter((d) => d.urgency === 'CRITICAL')
          .slice(0, 5)
          .map((d) => `${d.obligationTitle}: ${d.dueDate} (${d.penaltyInfo})`),
        recentChanges: countries
          .flatMap((c) => c.recentChanges)
          .slice(0, 5)
          .map((rc) => `${rc.title} (${rc.country}, ${rc.impactLevel})`),
      });
    } catch (err) {
      logger.error({
        operation: 'onboarding:generate_summary',
        requestId,
        clientId: client.id,
        result: 'error',
        error: err instanceof Error ? err.message : String(err),
      });
      // Fallback: generate a basic summary without LLM
      executiveSummary = buildFallbackSummary(client, stats);
    }

    // --- Step 7: Build immediate actions ---
    const immediateActions = buildImmediateActions(allDeadlines, crossCountryOverlaps);

    const complianceMap: ComplianceMap = {
      client: {
        id: client.id,
        name: client.name,
        companyType: client.companyType,
        countries: client.countries,
        industries: client.industries,
      },
      generatedAt: new Date(),
      countries,
      executiveSummary,
      immediateActions,
      timeline,
      crossCountryOverlaps,
      stats,
    };

    logger.info({
      operation: 'onboarding:complete',
      requestId,
      clientId: client.id,
      totalObligations: stats.totalObligations,
      criticalCount: stats.criticalCount,
      countriesProcessed: countries.length,
      overlapsDetected: crossCountryOverlaps.length,
      timelineMonths: timeline.length,
      duration: Date.now() - startTime,
      result: 'success',
    });

    return complianceMap;
  }
}

// ---------------------------------------------------------------------------
// Deadline classification
// ---------------------------------------------------------------------------

function classifyDeadlines(obligations: readonly ObligationDetail[]): CriticalDeadline[] {
  const now = Date.now();

  return obligations
    .map((obl) => {
      const dueDate = new Date(obl.deadline.nextDueDate);
      const daysUntilDue = Math.ceil((dueDate.getTime() - now) / 86_400_000);

      let urgency: 'CRITICAL' | 'IMPORTANT' | 'NORMAL';
      if (daysUntilDue <= 30) urgency = 'CRITICAL';
      else if (daysUntilDue <= 90) urgency = 'IMPORTANT';
      else urgency = 'NORMAL';

      return {
        obligationId: obl.id,
        obligationTitle: obl.title,
        dueDate: obl.deadline.nextDueDate,
        daysUntilDue,
        urgency,
        penaltyInfo: obl.penaltyInfo,
      };
    })
    .filter((d) => d.daysUntilDue >= 0) // Only future deadlines
    .sort((a, b) => a.daysUntilDue - b.daysUntilDue);
}

// ---------------------------------------------------------------------------
// Risk score calculation
// ---------------------------------------------------------------------------

/**
 * Calculate a 0-100 risk score for a country.
 *
 * Factors:
 * - 40% from deadline proximity (more critical = higher risk)
 * - 30% from recent changes (more HIGH impact changes = higher risk)
 * - 30% from obligation count relative to baseline
 */
function calculateRiskScore(
  obligations: readonly ObligationDetail[],
  deadlines: readonly CriticalDeadline[],
  recentChanges: readonly RecentChange[],
): number {
  if (obligations.length === 0) return 0;

  // Deadline proximity factor (0-100)
  const criticalCount = deadlines.filter((d) => d.urgency === 'CRITICAL').length;
  const importantCount = deadlines.filter((d) => d.urgency === 'IMPORTANT').length;
  const deadlineFactor = Math.min(100, criticalCount * 20 + importantCount * 8);

  // Recent changes factor (0-100)
  const highChanges = recentChanges.filter((c) => c.impactLevel === 'HIGH').length;
  const medChanges = recentChanges.filter((c) => c.impactLevel === 'MEDIUM').length;
  const changeFactor = Math.min(100, highChanges * 25 + medChanges * 10);

  // Obligation density factor (0-100, normalized to 10 as baseline)
  const densityFactor = Math.min(100, (obligations.length / 10) * 50);

  return Math.round(deadlineFactor * 0.4 + changeFactor * 0.3 + densityFactor * 0.3);
}

// ---------------------------------------------------------------------------
// Cross-country overlap detection
// ---------------------------------------------------------------------------

function detectOverlaps(countries: readonly CountryCompliance[]): CrossCountryOverlap[] {
  const overlaps: CrossCountryOverlap[] = [];
  const areaCountryMap: Record<string, { countries: string[]; obligations: string[] }> = {};

  for (const country of countries) {
    for (const obl of country.obligations) {
      if (!areaCountryMap[obl.area]) {
        areaCountryMap[obl.area] = { countries: [], obligations: [] };
      }
      const entry = areaCountryMap[obl.area]!;
      if (!entry.countries.includes(country.country)) {
        entry.countries.push(country.country);
      }
      if (!entry.obligations.includes(obl.title)) {
        entry.obligations.push(obl.title);
      }
    }
  }

  for (const [area, data] of Object.entries(areaCountryMap)) {
    if (data.countries.length >= 2) {
      overlaps.push({
        area,
        countries: data.countries,
        obligations: data.obligations,
        recommendation: buildOverlapRecommendation(area, data.countries),
      });
    }
  }

  return overlaps;
}

function buildOverlapRecommendation(area: string, countries: readonly string[]): string {
  const countryNames = countries.map((c) => COUNTRY_NAMES[c] ?? c).join(', ');
  const recommendations: Record<string, string> = {
    fiscal: `Coordinar calendarios fiscales entre ${countryNames} para optimizar flujo de caja y evitar multas cruzadas.`,
    labor: `Unificar políticas laborales para ${countryNames} donde sea posible, manteniendo cumplimiento local.`,
    corporate: `Centralizar gobierno corporativo con adaptaciones locales para ${countryNames}.`,
  };
  return recommendations[area] ?? `Revisar obligaciones de ${area} en ${countryNames} para identificar sinergias.`;
}

// ---------------------------------------------------------------------------
// 12-month timeline builder
// ---------------------------------------------------------------------------

function buildTimeline(
  obligations: readonly ObligationDetail[],
  deadlines: readonly CriticalDeadline[],
): TimelineItem[] {
  const now = new Date();
  const timeline: TimelineItem[] = [];
  const monthNames = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
  ];

  // Create entries for the next 12 months
  for (let i = 0; i < 12; i++) {
    const targetDate = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const year = targetDate.getFullYear();
    const month = targetDate.getMonth();

    const monthDeadlines = deadlines.filter((d) => {
      const dueDate = new Date(d.dueDate);
      return dueDate.getFullYear() === year && dueDate.getMonth() === month;
    });

    if (monthDeadlines.length === 0) continue;

    // Find matching obligation details
    const obligationMap = new Map(obligations.map((o) => [o.id, o]));

    timeline.push({
      date: `${year}-${String(month + 1).padStart(2, '0')}`,
      month: `${monthNames[month]} ${year}`,
      obligations: monthDeadlines.map((d) => {
        const obl = obligationMap.get(d.obligationId);
        return {
          id: d.obligationId,
          title: d.obligationTitle,
          country: obl?.jurisdiction.country ?? '',
          area: obl?.area ?? '',
          urgency: d.urgency,
        };
      }),
    });
  }

  return timeline;
}

// ---------------------------------------------------------------------------
// Immediate actions builder
// ---------------------------------------------------------------------------

function buildImmediateActions(
  deadlines: readonly CriticalDeadline[],
  overlaps: readonly CrossCountryOverlap[],
): string[] {
  const actions: string[] = [];

  // Critical deadlines
  const critical = deadlines.filter((d) => d.urgency === 'CRITICAL');
  if (critical.length > 0) {
    actions.push(
      `URGENTE: ${critical.length} obligaciones vencen en menos de 30 días. Revisar y asignar responsables inmediatamente.`,
    );
    for (const d of critical.slice(0, 5)) {
      actions.push(
        `→ ${d.obligationTitle}: vence ${d.dueDate} (${d.daysUntilDue} días). Penalidad: ${d.penaltyInfo}`,
      );
    }
  }

  // Important deadlines
  const important = deadlines.filter((d) => d.urgency === 'IMPORTANT');
  if (important.length > 0) {
    actions.push(
      `PLANIFICAR: ${important.length} obligaciones vencen entre 30 y 90 días. Iniciar preparación.`,
    );
  }

  // Cross-country coordination
  if (overlaps.length > 0) {
    actions.push(
      `COORDINAR: Se detectaron ${overlaps.length} áreas con obligaciones en múltiples países. Consolidar gestión.`,
    );
    for (const overlap of overlaps) {
      actions.push(`→ ${overlap.recommendation}`);
    }
  }

  return actions;
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

function computeStats(countries: readonly CountryCompliance[]): ComplianceMapStats {
  const allDeadlines = countries.flatMap((c) => c.criticalDeadlines);
  const allAreas = new Set(countries.flatMap((c) => c.obligations.map((o) => o.area)));

  return {
    totalObligations: countries.reduce((sum, c) => sum + c.obligations.length, 0),
    criticalCount: allDeadlines.filter((d) => d.urgency === 'CRITICAL').length,
    importantCount: allDeadlines.filter((d) => d.urgency === 'IMPORTANT').length,
    countriesCount: countries.length,
    areasCount: allAreas.size,
  };
}

// ---------------------------------------------------------------------------
// Fallback summary (no LLM)
// ---------------------------------------------------------------------------

function buildFallbackSummary(client: Client, stats: ComplianceMapStats): ExecutiveSummary {
  const countryNames = client.countries.map((c) => COUNTRY_NAMES[c] ?? c).join(', ');

  return {
    es: `${client.name} opera en ${countryNames} como ${client.companyType}. ` +
      `Se identificaron ${stats.totalObligations} obligaciones regulatorias, ` +
      `de las cuales ${stats.criticalCount} son críticas (vencen en menos de 30 días) y ` +
      `${stats.importantCount} son importantes (vencen en menos de 90 días). ` +
      `Se cubren ${stats.areasCount} áreas regulatorias en ${stats.countriesCount} jurisdicciones.`,
    en: `${client.name} operates in ${countryNames} as ${client.companyType}. ` +
      `${stats.totalObligations} regulatory obligations were identified, ` +
      `of which ${stats.criticalCount} are critical (due within 30 days) and ` +
      `${stats.importantCount} are important (due within 90 days). ` +
      `${stats.areasCount} regulatory areas are covered across ${stats.countriesCount} jurisdictions.`,
  };
}
