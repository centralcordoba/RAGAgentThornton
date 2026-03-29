// ============================================================================
// FILE: apps/web/components/regulations/RegulationFilters.tsx
// Filter bar for the regulations feed — country, area, impact, date range.
// ============================================================================

'use client';

import { CountryFlag } from '../ui/CountryFlag';

export interface RegulationFilterValues {
  country: string | null;
  area: string | null;
  impactLevel: string | null;
  dateFrom: string;
  dateTo: string;
  search: string;
}

interface RegulationFiltersProps {
  readonly values: RegulationFilterValues;
  readonly onChange: (values: RegulationFilterValues) => void;
  readonly onReset: () => void;
  readonly resultCount: number;
}

const COUNTRIES = ['US', 'AR', 'BR', 'MX', 'ES', 'EU', 'SG'] as const;
const AREAS = ['fiscal', 'labor', 'corporate', 'securities', 'banking', 'data-protection', 'aml'] as const;
const IMPACT_LEVELS = ['HIGH', 'MEDIUM', 'LOW'] as const;

const AREA_LABELS: Record<string, string> = {
  fiscal: 'Fiscal',
  labor: 'Laboral',
  corporate: 'Corporativo',
  securities: 'Valores',
  banking: 'Bancario',
  'data-protection': 'Datos',
  aml: 'AML',
};

export function RegulationFilters({ values, onChange, onReset, resultCount }: RegulationFiltersProps) {
  const hasFilters = values.country || values.area || values.impactLevel || values.search || values.dateFrom || values.dateTo;

  return (
    <div className="card">
      <div className="card-body space-y-4">
        {/* Search */}
        <div>
          <input
            type="search"
            value={values.search}
            onChange={(e) => onChange({ ...values, search: e.target.value })}
            placeholder="Buscar por título, contenido, regulador..."
            className="input"
          />
        </div>

        <div className="flex flex-wrap gap-4">
          {/* Country filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-500 font-medium">País:</span>
            <div className="flex gap-1">
              {COUNTRIES.map((code) => (
                <button
                  key={code}
                  onClick={() => onChange({ ...values, country: values.country === code ? null : code })}
                  className={`p-1 rounded transition-colors ${
                    values.country === code
                      ? 'bg-brand-100 ring-1 ring-brand-700'
                      : 'hover:bg-gray-100'
                  }`}
                  title={code}
                >
                  <CountryFlag code={code} size="sm" />
                </button>
              ))}
            </div>
          </div>

          {/* Area filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-500 font-medium">Área:</span>
            <div className="flex gap-1">
              {AREAS.map((area) => (
                <button
                  key={area}
                  onClick={() => onChange({ ...values, area: values.area === area ? null : area })}
                  className={`px-2 py-0.5 text-xs rounded-full border transition-colors ${
                    values.area === area
                      ? 'bg-brand-700 text-white border-brand-700'
                      : 'border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                >
                  {AREA_LABELS[area] ?? area}
                </button>
              ))}
            </div>
          </div>

          {/* Impact filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-500 font-medium">Impacto:</span>
            <div className="flex gap-1">
              {IMPACT_LEVELS.map((level) => (
                <button
                  key={level}
                  onClick={() => onChange({ ...values, impactLevel: values.impactLevel === level ? null : level })}
                  className={`px-2 py-0.5 text-xs rounded-full border transition-colors ${
                    values.impactLevel === level
                      ? level === 'HIGH' ? 'bg-risk-high text-white border-risk-high'
                        : level === 'MEDIUM' ? 'bg-risk-medium text-white border-risk-medium'
                          : 'bg-risk-low text-white border-risk-low'
                      : 'border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>

          {/* Date range */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-500 font-medium">Desde:</span>
            <input
              type="date"
              value={values.dateFrom}
              onChange={(e) => onChange({ ...values, dateFrom: e.target.value })}
              className="input py-0.5 px-2 text-xs w-32"
            />
            <span className="text-xs text-gray-400">—</span>
            <input
              type="date"
              value={values.dateTo}
              onChange={(e) => onChange({ ...values, dateTo: e.target.value })}
              className="input py-0.5 px-2 text-xs w-32"
            />
          </div>
        </div>

        {/* Results count + clear */}
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-500">
            {resultCount} {resultCount === 1 ? 'resultado' : 'resultados'}
          </span>
          {hasFilters && (
            <button onClick={onReset} className="text-brand-700 hover:underline font-medium">
              Limpiar filtros
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
