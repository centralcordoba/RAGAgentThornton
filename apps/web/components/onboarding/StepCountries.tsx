// ============================================================================
// FILE: apps/web/components/onboarding/StepCountries.tsx
// Step 2: Interactive country selection — map + chips.
// ============================================================================

'use client';

import { CountryFlag, getCountryName } from '../ui/CountryFlag';

interface StepCountriesProps {
  readonly selected: string[];
  readonly onChange: (countries: string[]) => void;
  readonly onNext: () => void;
  readonly onBack: () => void;
}

interface CountryOption {
  readonly code: string;
  readonly name: string;
  readonly region: string;
  readonly flag: string;
  readonly x: number;
  readonly y: number;
}

const AVAILABLE_COUNTRIES: readonly CountryOption[] = [
  { code: 'US', name: 'Estados Unidos', region: 'Norteamérica', flag: '🇺🇸', x: 22, y: 32 },
  { code: 'MX', name: 'México', region: 'LATAM', flag: '🇲🇽', x: 18, y: 42 },
  { code: 'CO', name: 'Colombia', region: 'LATAM', flag: '🇨🇴', x: 26, y: 48 },
  { code: 'PE', name: 'Perú', region: 'LATAM', flag: '🇵🇪', x: 24, y: 56 },
  { code: 'BR', name: 'Brasil', region: 'LATAM', flag: '🇧🇷', x: 35, y: 58 },
  { code: 'CL', name: 'Chile', region: 'LATAM', flag: '🇨🇱', x: 27, y: 70 },
  { code: 'AR', name: 'Argentina', region: 'LATAM', flag: '🇦🇷', x: 30, y: 72 },
  { code: 'UY', name: 'Uruguay', region: 'LATAM', flag: '🇺🇾', x: 33, y: 68 },
  { code: 'ES', name: 'España', region: 'Europa', flag: '🇪🇸', x: 48, y: 34 },
  { code: 'EU', name: 'Unión Europea', region: 'Europa', flag: '🇪🇺', x: 52, y: 28 },
];

const REGIONS = ['Norteamérica', 'LATAM', 'Europa'] as const;

export function StepCountries({ selected, onChange, onNext, onBack }: StepCountriesProps) {
  const toggle = (code: string) => {
    const next = selected.includes(code)
      ? selected.filter((c) => c !== code)
      : [...selected, code];
    onChange(next);
  };

  const selectRegion = (region: string) => {
    const regionCodes = AVAILABLE_COUNTRIES
      .filter((c) => c.region === region)
      .map((c) => c.code);
    const allSelected = regionCodes.every((c) => selected.includes(c));
    if (allSelected) {
      onChange(selected.filter((c) => !regionCodes.includes(c)));
    } else {
      const merged = new Set([...selected, ...regionCodes]);
      onChange(Array.from(merged));
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h2 className="text-lg font-bold text-gray-900">Selección de países</h2>
        <p className="text-sm text-gray-500 mt-1">
          Seleccioná los países donde opera el cliente. Hacé click en el mapa o usá los chips.
        </p>
      </div>

      {/* Interactive map */}
      <div className="card p-4">
        <svg viewBox="0 0 100 85" className="w-full" style={{ maxHeight: 350 }}>
          <rect x="0" y="0" width="100" height="85" fill="#f8fafc" rx="4" />

          {/* Grid */}
          {[20, 40, 60, 80].map((x) => (
            <line key={`v${x}`} x1={x} y1="0" x2={x} y2="85" stroke="#e2e8f0" strokeWidth="0.2" />
          ))}

          {/* Country dots */}
          {AVAILABLE_COUNTRIES.map((country) => {
            const isSelected = selected.includes(country.code);
            return (
              <g
                key={country.code}
                className="cursor-pointer"
                onClick={() => toggle(country.code)}
              >
                {/* Selection ring */}
                {isSelected && (
                  <circle
                    cx={country.x}
                    cy={country.y}
                    r={5}
                    fill="none"
                    stroke="#1E3A5F"
                    strokeWidth={0.8}
                    strokeDasharray="2 1"
                  >
                    <animateTransform
                      attributeName="transform"
                      type="rotate"
                      from={`0 ${country.x} ${country.y}`}
                      to={`360 ${country.x} ${country.y}`}
                      dur="8s"
                      repeatCount="indefinite"
                    />
                  </circle>
                )}

                <circle
                  cx={country.x}
                  cy={country.y}
                  r={3}
                  fill={isSelected ? '#1E3A5F' : '#cbd5e1'}
                  stroke="white"
                  strokeWidth={0.8}
                  className="transition-all duration-200"
                />
                <text
                  x={country.x}
                  y={country.y - 5}
                  textAnchor="middle"
                  fontSize="2.5"
                  fill={isSelected ? '#1E3A5F' : '#94a3b8'}
                  fontWeight={isSelected ? 'bold' : 'normal'}
                >
                  {country.flag} {country.code}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Region quick-select */}
      <div className="flex gap-2">
        {REGIONS.map((region) => {
          const regionCodes = AVAILABLE_COUNTRIES.filter((c) => c.region === region).map((c) => c.code);
          const allSelected = regionCodes.every((c) => selected.includes(c));
          return (
            <button
              key={region}
              onClick={() => selectRegion(region)}
              className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${
                allSelected
                  ? 'bg-brand-800 text-white border-brand-800'
                  : 'border-gray-200 text-gray-600 hover:border-gray-300'
              }`}
            >
              {region}
            </button>
          );
        })}
      </div>

      {/* Country chips */}
      <div className="flex flex-wrap gap-2">
        {AVAILABLE_COUNTRIES.map((country) => {
          const isSelected = selected.includes(country.code);
          return (
            <button
              key={country.code}
              onClick={() => toggle(country.code)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm transition-all ${
                isSelected
                  ? 'border-brand-800 bg-brand-50 text-brand-800 font-medium shadow-sm'
                  : 'border-gray-200 text-gray-600 hover:border-gray-300'
              }`}
            >
              <CountryFlag code={country.code} size="sm" />
              <span>{country.name}</span>
              {isSelected && <span className="text-brand-400 ml-1">✕</span>}
            </button>
          );
        })}
      </div>

      {/* Selected summary */}
      {selected.length > 0 && (
        <p className="text-sm text-gray-500">
          {selected.length} {selected.length === 1 ? 'país seleccionado' : 'países seleccionados'}
        </p>
      )}

      {/* Actions */}
      <div className="flex justify-between pt-4">
        <button onClick={onBack} className="btn-secondary">
          ← Anterior
        </button>
        <button
          onClick={onNext}
          disabled={selected.length === 0}
          className="btn-primary"
        >
          Siguiente: Generar análisis →
        </button>
      </div>
    </div>
  );
}
