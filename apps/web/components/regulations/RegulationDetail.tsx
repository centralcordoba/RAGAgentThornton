// ============================================================================
// FILE: apps/web/components/regulations/RegulationDetail.tsx
// Slide-over detail panel for a single regulation + AI analysis.
// ============================================================================

'use client';

import { Badge, impactToBadgeVariant } from '../ui/Badge';
import { CountryFlag, getCountryName } from '../ui/CountryFlag';
import { RiskScore } from '../ui/RiskScore';
import { RegulatoryDiff } from './RegulatoryDiff';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AIAnalysisData {
  readonly answer: string;
  readonly sources: readonly { documentId: string; title: string; relevanceScore: number }[];
  readonly confidence: number;
  readonly reasoning: string;
  readonly impactedObligations: readonly string[];
}

interface ChangedClauseData {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly deadline: string;
  readonly status: string;
  readonly priority: string;
  readonly clientName: string;
}

interface AffectedClientData {
  readonly id: string;
  readonly name: string;
  readonly countries: readonly string[];
}

interface RegulationDetailProps {
  readonly regulation: {
    readonly id: string;
    readonly title: string;
    readonly summary: string;
    readonly rawContent: string;
    readonly country: string;
    readonly jurisdiction: string;
    readonly impactLevel: string;
    readonly source: string;
    readonly affectedAreas: readonly string[];
    readonly effectiveDate: string;
    readonly publishedDate: string;
    readonly sourceUrl: string;
  };
  readonly analysis: AIAnalysisData | null;
  readonly changedClauses?: readonly ChangedClauseData[];
  readonly affectedClients?: readonly AffectedClientData[];
  readonly isLoadingAnalysis: boolean;
  readonly onClose: () => void;
}

// ---------------------------------------------------------------------------
// RegulationDetail
// ---------------------------------------------------------------------------

export function RegulationDetail({
  regulation,
  analysis,
  changedClauses,
  affectedClients,
  isLoadingAnalysis,
  onClose,
}: RegulationDetailProps) {
  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/20 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative w-full max-w-xl bg-white shadow-2xl overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 z-10">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <CountryFlag code={regulation.country} size="md" />
                <Badge variant={impactToBadgeVariant(regulation.impactLevel)} size="md">
                  {regulation.impactLevel}
                </Badge>
                <span className="text-xs text-gray-400">{regulation.source}</span>
              </div>
              <h2 className="text-base font-bold text-gray-900">{regulation.title}</h2>
            </div>
            <button
              onClick={onClose}
              className="flex-shrink-0 p-1.5 rounded-md hover:bg-gray-100 transition-colors"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="px-6 py-5 space-y-6">
          {/* Metadata */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-xs text-gray-500 block">País / Jurisdicción</span>
              <span className="font-medium text-gray-900">
                {getCountryName(regulation.country)} ({regulation.jurisdiction})
              </span>
            </div>
            <div>
              <span className="text-xs text-gray-500 block">Fuente</span>
              <span className="font-medium text-gray-900">{regulation.source}</span>
            </div>
            <div>
              <span className="text-xs text-gray-500 block">Fecha de publicación</span>
              <span className="font-medium text-gray-900">
                {new Date(regulation.publishedDate).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })}
              </span>
            </div>
            <div>
              <span className="text-xs text-gray-500 block">Fecha efectiva</span>
              <span className="font-medium text-gray-900">
                {new Date(regulation.effectiveDate).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })}
              </span>
            </div>
          </div>

          {/* Areas */}
          <div>
            <span className="text-xs text-gray-500 block mb-1.5">Áreas afectadas</span>
            <div className="flex flex-wrap gap-1.5">
              {regulation.affectedAreas.map((area) => (
                <Badge key={area} variant="info" size="sm">{area}</Badge>
              ))}
            </div>
          </div>

          {/* Summary */}
          <div>
            <span className="text-xs text-gray-500 block mb-1.5">Resumen</span>
            <p className="text-sm text-gray-700">{regulation.summary}</p>
          </div>

          {/* Full content (collapsible) */}
          {regulation.rawContent && (
            <details className="group">
              <summary className="text-xs text-brand-600 cursor-pointer hover:underline font-medium">
                Ver contenido completo
              </summary>
              <div className="mt-2 p-3 bg-gray-50 rounded-md text-xs text-gray-600 max-h-60 overflow-y-auto whitespace-pre-line">
                {regulation.rawContent}
              </div>
            </details>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-3">
            <a
              href={regulation.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-brand-600 hover:underline"
            >
              Ver fuente →
            </a>
            <a
              href={`/reports/${regulation.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-brand-700 text-white hover:bg-brand-800 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
              Exportar PDF
            </a>
          </div>

          {/* Regulatory Diff — obligations + affected clients */}
          {((changedClauses && changedClauses.length > 0) || (affectedClients && affectedClients.length > 0)) && (
            <div className="border-t border-gray-200 pt-5">
              <RegulatoryDiff
                clauses={changedClauses ?? []}
                clients={affectedClients ?? []}
                regulationTitle={regulation.title}
              />
            </div>
          )}

          {/* AI Analysis */}
          <div className="border-t border-gray-200 pt-5">
            <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
              🤖 Análisis de Impacto (IA)
              {analysis && (
                <RiskScore score={Math.round(analysis.confidence * 100)} size="sm" />
              )}
            </h3>

            {isLoadingAnalysis && (
              <div className="space-y-3 animate-pulse">
                <div className="h-3 bg-gray-200 rounded w-full" />
                <div className="h-3 bg-gray-200 rounded w-5/6" />
                <div className="h-3 bg-gray-200 rounded w-3/4" />
                <div className="h-3 bg-gray-200 rounded w-4/5" />
              </div>
            )}

            {!isLoadingAnalysis && !analysis && (
              <p className="text-sm text-gray-400 italic">
                Seleccione un cliente para generar un análisis de impacto personalizado.
              </p>
            )}

            {analysis && (
              <div className="space-y-4">
                {/* Answer */}
                <div>
                  <span className="text-xs text-gray-500 block mb-1">Análisis</span>
                  <p className="text-sm text-gray-700">{analysis.answer}</p>
                </div>

                {/* Confidence */}
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-500">Confianza:</span>
                  <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${analysis.confidence * 100}%`,
                        backgroundColor: analysis.confidence >= 0.7 ? '#10b981'
                          : analysis.confidence >= 0.5 ? '#f59e0b' : '#dc2626',
                      }}
                    />
                  </div>
                  <span className="text-xs font-medium text-gray-700">
                    {(analysis.confidence * 100).toFixed(0)}%
                  </span>
                </div>

                {/* Reasoning */}
                <div>
                  <span className="text-xs text-gray-500 block mb-1">Razonamiento</span>
                  <p className="text-xs text-gray-600 bg-gray-50 p-2.5 rounded">{analysis.reasoning}</p>
                </div>

                {/* Impacted obligations */}
                {analysis.impactedObligations.length > 0 && (
                  <div>
                    <span className="text-xs text-gray-500 block mb-1.5">Obligaciones afectadas</span>
                    <ul className="space-y-1">
                      {analysis.impactedObligations.map((obl, i) => (
                        <li key={i} className="flex items-center gap-2 text-xs text-gray-700">
                          <span className="h-1.5 w-1.5 rounded-full bg-risk-medium flex-shrink-0" />
                          {obl}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Sources */}
                {analysis.sources.length > 0 && (
                  <div>
                    <span className="text-xs text-gray-500 block mb-1.5">Fuentes del análisis</span>
                    <div className="space-y-1">
                      {analysis.sources.map((src) => (
                        <div key={src.documentId} className="flex items-center gap-2 text-xs">
                          <Badge variant="info" size="sm">{src.documentId}</Badge>
                          <span className="text-gray-600 truncate">{src.title}</span>
                          <span className="text-gray-400">{(src.relevanceScore * 100).toFixed(0)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
