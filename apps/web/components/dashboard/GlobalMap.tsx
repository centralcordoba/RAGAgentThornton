// ============================================================================
// FILE: apps/web/components/dashboard/GlobalMap.tsx
// World map with countries colored by risk score.
// Click country → side panel with details.
//
// Uses a lightweight SVG map instead of react-map-gl to avoid
// heavy Mapbox dependency. Production can swap to Mapbox if needed.
// ============================================================================

'use client';

import { useState } from 'react';
import { CountryFlag, getCountryName } from '../ui/CountryFlag';
import { Badge, impactToBadgeVariant } from '../ui/Badge';
import { RiskScore } from '../ui/RiskScore';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CountryRiskData {
  readonly code: string;
  readonly riskScore: number;
  readonly activeClients: number;
  readonly openAlerts: number;
  readonly nextDeadline: string | null;
  readonly recentChanges: readonly RecentChangeItem[];
}

interface RecentChangeItem {
  readonly id: string;
  readonly title: string;
  readonly impactLevel: string;
  readonly publishedDate: string;
}

// ---------------------------------------------------------------------------
// Country positions on a simplified SVG map (mercator-like grid)
// ---------------------------------------------------------------------------

const COUNTRY_POSITIONS: Readonly<Record<string, { x: number; y: number }>> = {
  US: { x: 22, y: 32 },
  MX: { x: 18, y: 42 },
  AR: { x: 30, y: 72 },
  BR: { x: 35, y: 58 },
  CL: { x: 27, y: 70 },
  CO: { x: 26, y: 48 },
  PE: { x: 24, y: 56 },
  ES: { x: 48, y: 34 },
  EU: { x: 52, y: 28 },
  UY: { x: 33, y: 68 },
};

// ---------------------------------------------------------------------------
// GlobalMap
// ---------------------------------------------------------------------------

export function GlobalMap({ countries }: { countries: readonly CountryRiskData[] }) {
  const [selectedCountry, setSelectedCountry] = useState<CountryRiskData | null>(null);

  return (
    <div className="card">
      <div className="card-header flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">Mapa de Riesgo Global</h2>
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-risk-low" /> {'< 30'}
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-risk-medium" /> 30-70
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-risk-high" /> {'> 70'}
          </span>
        </div>
      </div>

      <div className="flex">
        {/* Map area */}
        <div className="flex-1 p-4">
          <svg
            viewBox="0 0 100 85"
            className="w-full h-auto"
            style={{ maxHeight: 400 }}
          >
            {/* Background */}
            <rect x="0" y="0" width="100" height="85" fill="#f0f4f8" rx="4" />

            {/* Grid lines */}
            {[20, 40, 60, 80].map((x) => (
              <line key={`v${x}`} x1={x} y1="0" x2={x} y2="85" stroke="#e2e8f0" strokeWidth="0.2" />
            ))}
            {[20, 40, 60].map((y) => (
              <line key={`h${y}`} x1="0" y1={y} x2="100" y2={y} stroke="#e2e8f0" strokeWidth="0.2" />
            ))}

            {/* Country dots */}
            {countries.map((country) => {
              const pos = COUNTRY_POSITIONS[country.code];
              if (!pos) return null;

              const color = getRiskColor(country.riskScore);
              const isSelected = selectedCountry?.code === country.code;
              const radius = isSelected ? 3.5 : 2.5;

              return (
                <g
                  key={country.code}
                  className="cursor-pointer"
                  onClick={() => setSelectedCountry(
                    isSelected ? null : country,
                  )}
                >
                  {/* Pulse animation for high risk */}
                  {country.riskScore > 70 && (
                    <circle
                      cx={pos.x}
                      cy={pos.y}
                      r={4}
                      fill={color}
                      opacity={0.3}
                    >
                      <animate
                        attributeName="r"
                        values="3;5;3"
                        dur="2s"
                        repeatCount="indefinite"
                      />
                      <animate
                        attributeName="opacity"
                        values="0.3;0.1;0.3"
                        dur="2s"
                        repeatCount="indefinite"
                      />
                    </circle>
                  )}

                  {/* Main dot */}
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r={radius}
                    fill={color}
                    stroke={isSelected ? '#1E3A5F' : 'white'}
                    strokeWidth={isSelected ? 1 : 0.5}
                    className="transition-all duration-200"
                  />

                  {/* Label */}
                  <text
                    x={pos.x}
                    y={pos.y - 4}
                    textAnchor="middle"
                    fontSize="2.5"
                    fill="#374151"
                    fontWeight={isSelected ? 'bold' : 'normal'}
                  >
                    {country.code}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* Detail panel */}
        {selectedCountry && (
          <div className="w-72 border-l border-gray-100 p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CountryFlag code={selectedCountry.code} size="lg" />
                <div>
                  <p className="font-semibold text-sm text-gray-900">
                    {getCountryName(selectedCountry.code)}
                  </p>
                  <p className="text-xs text-gray-500">
                    {selectedCountry.activeClients} clientes activos
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedCountry(null)}
                className="text-gray-400 hover:text-gray-600 text-sm"
              >
                ✕
              </button>
            </div>

            <div className="flex justify-center">
              <RiskScore
                score={selectedCountry.riskScore}
                size="lg"
                label="Risk Score"
              />
            </div>

            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="bg-gray-50 rounded-md p-2">
                <p className="text-lg font-bold text-gray-900">{selectedCountry.openAlerts}</p>
                <p className="text-xs text-gray-500">Alertas</p>
              </div>
              <div className="bg-gray-50 rounded-md p-2">
                <p className="text-lg font-bold text-gray-900">
                  {selectedCountry.nextDeadline
                    ? daysUntil(selectedCountry.nextDeadline)
                    : '—'}
                </p>
                <p className="text-xs text-gray-500">Días al deadline</p>
              </div>
            </div>

            {selectedCountry.recentChanges.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  Cambios recientes
                </p>
                <div className="space-y-2">
                  {selectedCountry.recentChanges.slice(0, 5).map((change) => (
                    <div
                      key={change.id}
                      className="flex items-start gap-2 text-xs"
                    >
                      <Badge variant={impactToBadgeVariant(change.impactLevel)} size="sm">
                        {change.impactLevel}
                      </Badge>
                      <p className="text-gray-700 line-clamp-2">{change.title}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getRiskColor(score: number): string {
  if (score >= 70) return '#dc2626';
  if (score >= 30) return '#f59e0b';
  return '#10b981';
}

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr);
  const now = new Date();
  return Math.ceil((target.getTime() - now.getTime()) / 86_400_000);
}
