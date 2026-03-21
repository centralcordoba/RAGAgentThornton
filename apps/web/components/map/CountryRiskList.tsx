// ============================================================================
// FILE: apps/web/components/map/CountryRiskList.tsx
// Mobile fallback — list of countries sorted by risk score descending.
// Replaces the SVG map on screens < 768px.
// ============================================================================

'use client';

import type { CountryRiskData } from './WorldRiskMap';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Props {
  readonly countries: readonly CountryRiskData[];
  readonly loading: boolean;
}

const FLAGS: Record<string, string> = {
  US: '🇺🇸', EU: '🇪🇺', ES: '🇪🇸', MX: '🇲🇽', AR: '🇦🇷', BR: '🇧🇷',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CountryRiskList({ countries, loading }: Props) {
  if (loading) {
    return (
      <div className="card card-body flex items-center justify-center h-48">
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Cargando datos...
        </div>
      </div>
    );
  }

  const sorted = [...countries].sort((a, b) => b.score - a.score);

  return (
    <div className="card overflow-hidden">
      <div className="card-header">
        <h3 className="text-sm font-semibold text-gray-900">Riesgo regulatorio por pais</h3>
      </div>
      <div className="divide-y divide-gray-50">
        {sorted.map((country) => {
          const barColor = levelToBarColor(country.level);
          return (
            <div key={country.code} className="px-4 py-3 flex items-center gap-3">
              {/* Flag + name */}
              <span className="text-xl flex-shrink-0">{FLAGS[country.code] ?? '🏳️'}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-medium text-gray-900">{country.name}</p>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-gray-700">{country.score}</span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${levelToBadge(country.level)}`}>
                      {country.level === 'NO_DATA' ? 'N/A' : country.level}
                    </span>
                  </div>
                </div>
                {/* Score bar */}
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                    style={{ width: `${Math.min(country.score, 100)}%` }}
                  />
                </div>
                {/* Stats row */}
                <div className="flex items-center gap-3 mt-1.5 text-[10px] text-gray-500">
                  {country.alertsHigh > 0 && (
                    <span className="text-red-500 font-medium">{country.alertsHigh} HIGH</span>
                  )}
                  {country.deadlines7d > 0 && (
                    <span className="text-amber-600">{country.deadlines7d} deadlines 7d</span>
                  )}
                  <span>{country.changes30d} cambios 30d</span>
                  <span>{country.clients.length} clientes</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function levelToBarColor(level: string): string {
  switch (level) {
    case 'CRITICAL': return 'bg-red-500';
    case 'HIGH': return 'bg-orange-500';
    case 'MEDIUM': return 'bg-yellow-400';
    case 'LOW': return 'bg-green-400';
    default: return 'bg-gray-300';
  }
}

function levelToBadge(level: string): string {
  switch (level) {
    case 'CRITICAL': return 'bg-red-100 text-red-700';
    case 'HIGH': return 'bg-orange-100 text-orange-700';
    case 'MEDIUM': return 'bg-yellow-100 text-yellow-700';
    case 'LOW': return 'bg-green-100 text-green-700';
    default: return 'bg-gray-100 text-gray-500';
  }
}
