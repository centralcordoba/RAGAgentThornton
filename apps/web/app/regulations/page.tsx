// ============================================================================
// FILE: apps/web/app/regulations/page.tsx
// Regulatory feed — filterable list of regulatory changes with detail panel.
// ============================================================================

'use client';

import { useState, useMemo, useCallback } from 'react';
import { RegulationFilters } from '@/components/regulations/RegulationFilters';
import type { RegulationFilterValues } from '@/components/regulations/RegulationFilters';
import { RegulationCard } from '@/components/regulations/RegulationCard';
import type { RegulationItem } from '@/components/regulations/RegulationCard';
import { RegulationDetail } from '@/components/regulations/RegulationDetail';
import { useUIStore } from '@/lib/stores/uiStore';

const EMPTY_FILTERS: RegulationFilterValues = {
  country: null,
  area: null,
  impactLevel: null,
  dateFrom: '',
  dateTo: '',
  search: '',
};

export default function RegulationsPage() {
  const [filters, setFilters] = useState<RegulationFilterValues>(EMPTY_FILTERS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { openChatForClient } = useUIStore();

  // In production: useSWR or react-query with API call
  const allRegulations = getMockRegulations();

  // Filter regulations
  const filtered = useMemo(() => {
    let result = allRegulations;

    if (filters.search) {
      const q = filters.search.toLowerCase();
      result = result.filter(
        (r) =>
          r.title.toLowerCase().includes(q) ||
          r.summary.toLowerCase().includes(q) ||
          r.source.toLowerCase().includes(q),
      );
    }
    if (filters.country) {
      result = result.filter((r) => r.country === filters.country);
    }
    if (filters.area) {
      result = result.filter((r) => r.affectedAreas.includes(filters.area!));
    }
    if (filters.impactLevel) {
      result = result.filter((r) => r.impactLevel === filters.impactLevel);
    }
    if (filters.dateFrom) {
      result = result.filter((r) => r.publishedDate >= filters.dateFrom);
    }
    if (filters.dateTo) {
      result = result.filter((r) => r.publishedDate <= filters.dateTo);
    }

    return result;
  }, [allRegulations, filters]);

  const selectedRegulation = selectedId
    ? allRegulations.find((r) => r.id === selectedId)
    : null;

  const handleAnalyze = useCallback((id: string) => {
    // Open the chat with the regulation context
    openChatForClient(''); // Global context
    // In production: pre-fill chat with "Analiza el impacto de la regulación X"
  }, [openChatForClient]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Cambios Regulatorios</h1>
          <p className="text-sm text-gray-500 mt-1">
            Feed de cambios regulatorios con análisis de impacto
          </p>
        </div>
        <div className="flex gap-2 text-xs text-gray-400">
          <span>Última actualización: hace 5 minutos</span>
        </div>
      </div>

      {/* Filters */}
      <RegulationFilters
        values={filters}
        onChange={setFilters}
        onReset={() => setFilters(EMPTY_FILTERS)}
        resultCount={filtered.length}
      />

      {/* Regulation list */}
      <div className="space-y-3">
        {filtered.length === 0 && (
          <div className="card p-12 text-center">
            <span className="text-4xl">📭</span>
            <p className="text-sm text-gray-500 mt-3">
              No se encontraron cambios regulatorios con los filtros seleccionados
            </p>
          </div>
        )}

        {filtered.map((reg) => (
          <RegulationCard
            key={reg.id}
            regulation={reg}
            onViewDetail={setSelectedId}
            onAnalyze={handleAnalyze}
          />
        ))}
      </div>

      {/* Pagination placeholder */}
      {filtered.length > 0 && (
        <div className="flex justify-center py-4">
          <button className="btn-secondary text-sm">
            Cargar más resultados
          </button>
        </div>
      )}

      {/* Detail slide-over */}
      {selectedRegulation && (
        <RegulationDetail
          regulation={{
            ...selectedRegulation,
            rawContent: `Contenido completo del documento regulatorio ${selectedRegulation.title}. Este es un placeholder que en producción contendría el texto completo del documento extraído por el pipeline de ingestion.`,
          }}
          analysis={getMockAnalysis(selectedRegulation.impactLevel)}
          isLoadingAnalysis={false}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

function getMockRegulations(): RegulationItem[] {
  return [
    {
      id: 'reg-1',
      title: 'AFIP RG 5616 — Nuevo régimen de retenciones IVA para operaciones con billeteras virtuales',
      summary: 'La AFIP establece un nuevo régimen de retención del IVA aplicable a pagos realizados a través de billeteras virtuales y plataformas de pago electrónico. Las retenciones aplican cuando el monto acumulado mensual supere los $200.000.',
      country: 'AR',
      jurisdiction: 'AR',
      impactLevel: 'HIGH',
      source: 'AFIP',
      affectedAreas: ['fiscal', 'digital'],
      affectedIndustries: ['fintech', 'banking'],
      effectiveDate: '2026-05-01',
      publishedDate: '2026-03-14',
      sourceUrl: 'https://www.afip.gob.ar/rg5616',
    },
    {
      id: 'reg-2',
      title: 'SEC Rule 10b-5 Amendment — Enhanced Derivatives Disclosure Requirements',
      summary: 'The SEC amends Rule 10b-5 to require enhanced quarterly disclosure of derivatives positions for all public companies with notional exposure exceeding $100M. Includes new Form 8-K filing triggers for material changes in derivatives portfolios.',
      country: 'US',
      jurisdiction: 'US-FED',
      impactLevel: 'HIGH',
      source: 'SEC_EDGAR',
      affectedAreas: ['securities', 'derivatives', 'corporate'],
      affectedIndustries: ['financial-services', 'public-companies'],
      effectiveDate: '2026-06-30',
      publishedDate: '2026-03-12',
      sourceUrl: 'https://www.sec.gov/rules/final/2026/34-99999.htm',
    },
    {
      id: 'reg-3',
      title: 'Receita Federal — Alteração na DCTF para empresas do Simples Nacional',
      summary: 'A Receita Federal modifica o prazo e formato da DCTF simplificada para empresas enquadradas no Simples Nacional. O novo formato inclui campos adicionais para identificação de operações com criptoativos.',
      country: 'BR',
      jurisdiction: 'BR',
      impactLevel: 'MEDIUM',
      source: 'RECEITA_FEDERAL',
      affectedAreas: ['fiscal'],
      affectedIndustries: ['general'],
      effectiveDate: '2026-04-15',
      publishedDate: '2026-03-13',
      sourceUrl: 'https://www.gov.br/receitafederal/dctf-simples',
    },
    {
      id: 'reg-4',
      title: 'SAT — Actualización factura electrónica CFDI 4.0 campo receptor',
      summary: 'El SAT publica modificaciones al campo receptor del CFDI 4.0, requiriendo validación adicional del RFC del receptor contra la base de datos del SAT antes de la emisión.',
      country: 'MX',
      jurisdiction: 'MX-FED',
      impactLevel: 'MEDIUM',
      source: 'DOF_MEXICO',
      affectedAreas: ['fiscal', 'digital'],
      affectedIndustries: ['general'],
      effectiveDate: '2026-05-01',
      publishedDate: '2026-03-09',
      sourceUrl: 'https://www.sat.gob.mx/cfdi40-update',
    },
    {
      id: 'reg-5',
      title: 'CNMV — Actualización requisitos de transparencia para fondos ESG',
      summary: 'La CNMV actualiza los requisitos de transparencia para fondos que se comercialicen como sostenibles o ESG, alineándose con la normativa europea SFDR nivel 2.',
      country: 'ES',
      jurisdiction: 'ES',
      impactLevel: 'MEDIUM',
      source: 'BOE_SPAIN',
      affectedAreas: ['securities', 'sustainability'],
      affectedIndustries: ['asset-management', 'securities'],
      effectiveDate: '2026-07-01',
      publishedDate: '2026-03-07',
      sourceUrl: 'https://www.cnmv.es/comunicaciones/esg-2026',
    },
    {
      id: 'reg-6',
      title: 'EUR-Lex — DORA Implementation Technical Standards Published',
      summary: 'The European Supervisory Authorities publish the final implementation technical standards for the Digital Operational Resilience Act (DORA), specifying ICT risk management framework requirements.',
      country: 'EU',
      jurisdiction: 'EU',
      impactLevel: 'HIGH',
      source: 'EUR_LEX',
      affectedAreas: ['digital-finance', 'banking', 'securities'],
      affectedIndustries: ['banking', 'insurance', 'securities', 'fintech'],
      effectiveDate: '2026-07-17',
      publishedDate: '2026-03-05',
      sourceUrl: 'https://eur-lex.europa.eu/dora-its-2026',
    },
    {
      id: 'reg-7',
      title: 'BOE — Corrección de erratas en el modelo 303 de IVA trimestral',
      summary: 'Se publica corrección de erratas en las instrucciones del modelo 303 de autoliquidación trimestral del IVA, afectando la casilla 76 sobre régimen especial de criterio de caja.',
      country: 'ES',
      jurisdiction: 'ES',
      impactLevel: 'LOW',
      source: 'BOE_SPAIN',
      affectedAreas: ['fiscal'],
      affectedIndustries: ['general'],
      effectiveDate: '2026-04-20',
      publishedDate: '2026-03-08',
      sourceUrl: 'https://www.boe.es/correccion-303',
    },
    {
      id: 'reg-8',
      title: 'CNV Resolución 1002 — Modificación del régimen informativo para fondos comunes de inversión',
      summary: 'La CNV modifica el régimen informativo aplicable a las sociedades gerentes de fondos comunes de inversión, incorporando nuevos campos de reporte sobre exposición a activos digitales.',
      country: 'AR',
      jurisdiction: 'AR',
      impactLevel: 'MEDIUM',
      source: 'CNV',
      affectedAreas: ['securities', 'funds'],
      affectedIndustries: ['asset-management'],
      effectiveDate: '2026-06-01',
      publishedDate: '2026-03-11',
      sourceUrl: 'https://www.cnv.gob.ar/resolucion-1002',
    },
  ];
}

function getMockAnalysis(impactLevel: string) {
  return {
    answer: 'Este cambio regulatorio requiere actualización de los procedimientos de reporte y potencialmente modificación de sistemas internos. Se recomienda revisar el impacto operativo con el equipo legal y de compliance antes de la fecha efectiva.',
    sources: [
      { documentId: 'doc-src-1', title: 'Documento fuente original', relevanceScore: 0.95 },
      { documentId: 'doc-src-2', title: 'Análisis comparativo regulatorio', relevanceScore: 0.78 },
    ],
    confidence: impactLevel === 'HIGH' ? 0.88 : impactLevel === 'MEDIUM' ? 0.75 : 0.65,
    reasoning: 'El análisis se basa en la comparación del texto regulatorio con las obligaciones existentes del cliente y el marco normativo vigente en la jurisdicción.',
    impactedObligations: impactLevel === 'HIGH'
      ? ['Declaración trimestral', 'Reporte de derivados', 'Form 8-K disclosure']
      : ['Declaración trimestral'],
  };
}
