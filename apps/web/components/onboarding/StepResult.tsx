// ============================================================================
// FILE: apps/web/components/onboarding/StepResult.tsx
// Step 4: ComplianceMap result — table, timeline, summary, actions.
// ============================================================================

'use client';

import { useState } from 'react';
import { Badge, impactToBadgeVariant } from '../ui/Badge';
import { RiskScore } from '../ui/RiskScore';
import { CountryFlag, getCountryName } from '../ui/CountryFlag';
import { DeadlineChip } from '../ui/DeadlineChip';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ComplianceMapResult {
  readonly countries: readonly CountryResult[];
  readonly executiveSummary: { es: string; en: string };
  readonly immediateActions: readonly string[];
  readonly stats: {
    totalObligations: number;
    criticalCount: number;
    importantCount: number;
    countriesCount: number;
  };
}

interface CountryResult {
  readonly country: string;
  readonly riskScore: number;
  readonly obligations: readonly ObligationResult[];
  readonly criticalDeadlines: readonly DeadlineResult[];
}

interface ObligationResult {
  readonly id: string;
  readonly title: string;
  readonly area: string;
  readonly regulator: string;
  readonly dueDate: string;
  readonly urgency: string;
  readonly penaltyInfo: string;
}

interface DeadlineResult {
  readonly obligationTitle: string;
  readonly dueDate: string;
  readonly daysUntilDue: number;
  readonly urgency: string;
}

interface StepResultProps {
  readonly result: ComplianceMapResult;
  readonly clientName: string;
  readonly onSave: () => void;
  readonly onBack: () => void;
  readonly isSaving: boolean;
}

// ---------------------------------------------------------------------------
// StepResult
// ---------------------------------------------------------------------------

export function StepResult({ result, clientName, onSave, onBack, isSaving }: StepResultProps) {
  const [activeTab, setActiveTab] = useState<'summary' | 'obligations' | 'actions'>('summary');
  const [summaryLang, setSummaryLang] = useState<'es' | 'en'>('es');

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900">
            Mapa de Compliance — {clientName}
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            {result.stats.totalObligations} obligaciones en {result.stats.countriesCount} jurisdicciones
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={onBack} className="btn-secondary text-sm">
            ← Editar datos
          </button>
          <button
            onClick={onSave}
            disabled={isSaving}
            className="btn-primary text-sm"
          >
            {isSaving ? 'Guardando...' : 'Guardar cliente'}
          </button>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Total obligaciones" value={result.stats.totalObligations} />
        <StatCard label="Críticas (<30d)" value={result.stats.criticalCount} color="text-risk-high" />
        <StatCard label="Importantes (<90d)" value={result.stats.importantCount} color="text-risk-medium" />
        <StatCard label="Jurisdicciones" value={result.stats.countriesCount} />
      </div>

      {/* Country risk overview */}
      <div className="card">
        <div className="card-header">
          <h3 className="text-sm font-semibold text-gray-900">Riesgo por país</h3>
        </div>
        <div className="card-body">
          <div className="flex flex-wrap gap-6 justify-center">
            {result.countries.map((c) => (
              <div key={c.country} className="flex flex-col items-center gap-2">
                <RiskScore score={c.riskScore} size="md" />
                <CountryFlag code={c.country} showName size="sm" />
                <span className="text-xs text-gray-400">
                  {c.obligations.length} obligaciones
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="card">
        <div className="border-b border-gray-100 px-5">
          <div className="flex gap-6">
            {(['summary', 'obligations', 'actions'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab
                    ? 'border-brand-800 text-brand-800'
                    : 'border-transparent text-gray-400 hover:text-gray-600'
                }`}
              >
                {TAB_LABELS[tab]}
              </button>
            ))}
          </div>
        </div>

        <div className="card-body">
          {activeTab === 'summary' && (
            <div className="space-y-4">
              <div className="flex gap-2">
                <button
                  onClick={() => setSummaryLang('es')}
                  className={`text-xs px-2 py-1 rounded ${summaryLang === 'es' ? 'bg-brand-800 text-white' : 'bg-gray-100 text-gray-600'}`}
                >
                  Español
                </button>
                <button
                  onClick={() => setSummaryLang('en')}
                  className={`text-xs px-2 py-1 rounded ${summaryLang === 'en' ? 'bg-brand-800 text-white' : 'bg-gray-100 text-gray-600'}`}
                >
                  English
                </button>
              </div>
              <div className="prose prose-sm max-w-none text-gray-700">
                <p className="whitespace-pre-line">{result.executiveSummary[summaryLang]}</p>
              </div>
            </div>
          )}

          {activeTab === 'obligations' && (
            <div className="space-y-4">
              {result.countries.map((country) => (
                <div key={country.country}>
                  <h4 className="flex items-center gap-2 text-sm font-semibold text-gray-900 mb-2">
                    <CountryFlag code={country.country} size="sm" />
                    {getCountryName(country.country)}
                    <Badge variant="neutral" size="sm">{country.obligations.length}</Badge>
                  </h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-left text-gray-500 border-b border-gray-100">
                          <th className="py-2 px-2 font-medium">Obligación</th>
                          <th className="py-2 px-2 font-medium">Área</th>
                          <th className="py-2 px-2 font-medium">Regulador</th>
                          <th className="py-2 px-2 font-medium">Deadline</th>
                          <th className="py-2 px-2 font-medium">Urgencia</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {country.obligations.map((obl) => (
                          <tr key={obl.id} className="hover:bg-gray-50">
                            <td className="py-2 px-2 text-gray-900 font-medium">{obl.title}</td>
                            <td className="py-2 px-2 capitalize text-gray-600">{obl.area}</td>
                            <td className="py-2 px-2 text-gray-600">{obl.regulator}</td>
                            <td className="py-2 px-2">
                              <DeadlineChip date={obl.dueDate} />
                            </td>
                            <td className="py-2 px-2">
                              <Badge variant={urgencyToVariant(obl.urgency)} size="sm">
                                {obl.urgency}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'actions' && (
            <div className="space-y-3">
              {result.immediateActions.map((action, idx) => (
                <div
                  key={idx}
                  className={`flex items-start gap-3 text-sm p-3 rounded-md ${
                    action.startsWith('URGENTE')
                      ? 'bg-red-50 text-red-800'
                      : action.startsWith('PLANIFICAR')
                        ? 'bg-amber-50 text-amber-800'
                        : action.startsWith('→')
                          ? 'pl-8 text-gray-600'
                          : 'bg-blue-50 text-blue-800'
                  }`}
                >
                  {!action.startsWith('→') && (
                    <span className="flex-shrink-0 mt-0.5">
                      {action.startsWith('URGENTE') ? '🔴' : action.startsWith('PLANIFICAR') ? '🟡' : '🔵'}
                    </span>
                  )}
                  <span>{action}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color?: string;
}) {
  return (
    <div className="card px-4 py-3 text-center">
      <p className={`text-2xl font-bold ${color ?? 'text-gray-900'}`}>{value}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </div>
  );
}

function urgencyToVariant(urgency: string): 'high' | 'medium' | 'low' | 'neutral' {
  switch (urgency) {
    case 'CRITICAL': return 'high';
    case 'IMPORTANT': return 'medium';
    case 'NORMAL': return 'low';
    default: return 'neutral';
  }
}

const TAB_LABELS: Record<string, string> = {
  summary: 'Resumen ejecutivo',
  obligations: 'Obligaciones',
  actions: 'Acciones inmediatas',
};
