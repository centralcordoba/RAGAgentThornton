// ============================================================================
// FILE: apps/web/components/map/WorldRiskMap.tsx
// Choropleth world map colored by regulatory risk score per country.
// Uses react-simple-maps for SVG rendering.
// Compact mode (no drawer) for dashboard, full mode for /map page.
// Mobile: falls back to CountryRiskList.
// ============================================================================

'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  ComposableMap,
  Geographies,
  Geography,
  ZoomableGroup,
  Marker,
} from 'react-simple-maps';
import { CountryDetailDrawer } from './CountryDetailDrawer';
import { CountryRiskList } from './CountryRiskList';
import { MapLegend } from './MapLegend';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CountryRiskData {
  readonly code: string;
  readonly name: string;
  readonly score: number;
  readonly level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | 'NO_DATA';
  readonly alertsHigh: number;
  readonly alertsMedium: number;
  readonly deadlines7d: number;
  readonly changes30d: number;
  readonly overdueObligations: number;
  readonly clients: readonly { id: string; name: string }[];
}

interface Props {
  readonly compact?: boolean;
  readonly clientId?: string;
  readonly height?: number;
}

interface TooltipState {
  readonly visible: boolean;
  readonly x: number;
  readonly y: number;
  readonly country: CountryRiskData | null;
}

type LayerToggle = 'risk' | 'deadlines' | 'changes';

const API_BASE = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3000';
const GEO_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

// ISO 3166-1 numeric → alpha-2 mapping for our countries of interest
const NUMERIC_TO_ALPHA2: Record<string, string> = {
  '032': 'AR', '076': 'BR', '484': 'MX', '724': 'ES', '840': 'US', '702': 'SG',
};

// EU members (main ones for coloring)
const EU_MEMBERS = ['040', '056', '100', '191', '196', '203', '208', '233', '246', '250', '276', '300', '348', '372', '380', '428', '440', '442', '470', '528', '616', '620', '642', '703', '705', '752'];

// Bubble positions for markers (approximate lat/lon)
const COUNTRY_CENTERS: Record<string, [number, number]> = {
  US: [-98, 39],
  EU: [10, 50],
  ES: [-3.7, 40.4],
  MX: [-102, 23.6],
  AR: [-64, -34],
  BR: [-51, -14.2],
  SG: [103.8, 1.35],
};

// ---------------------------------------------------------------------------
// Color scale
// ---------------------------------------------------------------------------

function scoreToColor(score: number, level: string): string {
  if (level === 'NO_DATA' || score === 0) return '#E5E7EB';
  if (score <= 30) return '#86EFAC';
  if (score <= 60) return '#FCD34D';
  if (score <= 80) return '#F97316';
  return '#EF4444';
}

function scoreToHoverColor(score: number, level: string): string {
  if (level === 'NO_DATA' || score === 0) return '#D1D5DB';
  if (score <= 30) return '#4ADE80';
  if (score <= 60) return '#FBBF24';
  if (score <= 80) return '#EA580C';
  return '#DC2626';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WorldRiskMap({ compact = false, clientId, height = 420 }: Props) {
  const [countries, setCountries] = useState<CountryRiskData[]>([]);
  const [loading, setLoading] = useState(true);
  const [tooltip, setTooltip] = useState<TooltipState>({ visible: false, x: 0, y: 0, country: null });
  const [selectedCountry, setSelectedCountry] = useState<CountryRiskData | null>(null);
  const [layers, setLayers] = useState<Set<LayerToggle>>(new Set(['risk']));
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [isMobile, setIsMobile] = useState(false);

  // Mobile detection
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const token = sessionStorage.getItem('auth_token') ?? process.env['NEXT_PUBLIC_DEV_TOKEN'] ?? null;
      const qs = clientId ? `?clientId=${clientId}` : '';
      const res = await fetch(`${API_BASE}/api/map/risk-scores${qs}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setCountries(data.countries ?? []);
        setLastUpdated(new Date());
      }
    } catch {
      // Keep current state
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const getCountryData = (isoNumeric: string): CountryRiskData | undefined => {
    const alpha2 = NUMERIC_TO_ALPHA2[isoNumeric];
    if (alpha2) return countries.find((c) => c.code === alpha2);
    // Check EU members
    if (EU_MEMBERS.includes(isoNumeric)) return countries.find((c) => c.code === 'EU');
    return undefined;
  };

  const toggleLayer = (layer: LayerToggle) => {
    setLayers((prev) => {
      const next = new Set(prev);
      if (next.has(layer)) next.delete(layer);
      else next.add(layer);
      return next;
    });
  };

  // Mobile fallback
  if (isMobile) {
    return <CountryRiskList countries={countries} loading={loading} />;
  }

  if (loading) {
    return (
      <div className="card card-body flex items-center justify-center" style={{ height }}>
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Cargando mapa de riesgo...
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="card overflow-hidden relative">
        {/* Layer toggles (full mode only) */}
        {!compact && (
          <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              {(['risk', 'deadlines', 'changes'] as const).map((layer) => {
                const labels: Record<LayerToggle, string> = {
                  risk: 'Risk Score',
                  deadlines: 'Deadlines',
                  changes: 'Cambios recientes',
                };
                return (
                  <button
                    key={layer}
                    onClick={() => toggleLayer(layer)}
                    className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                      layers.has(layer)
                        ? 'bg-brand-700 text-white border-brand-700'
                        : 'border-gray-200 text-gray-500 hover:border-brand-500'
                    }`}
                  >
                    {layers.has(layer) ? '✓ ' : ''}{labels[layer]}
                  </button>
                );
              })}
            </div>
            <button
              onClick={fetchData}
              className="text-xs text-gray-400 hover:text-brand-700 flex items-center gap-1"
            >
              Actualizar
            </button>
          </div>
        )}

        {/* Map */}
        <div style={{ height: compact ? height : height + 40 }}>
          <ComposableMap
            projection="geoMercator"
            projectionConfig={{ scale: compact ? 120 : 140, center: [0, 20] }}
            style={{ width: '100%', height: '100%' }}
          >
            <ZoomableGroup zoom={1} minZoom={compact ? 1 : 0.8} maxZoom={compact ? 1 : 4}>
              <Geographies geography={GEO_URL}>
                {({ geographies }) =>
                  geographies.map((geo) => {
                    const isoNumeric = geo.id;
                    const countryData = getCountryData(isoNumeric);
                    const score = countryData?.score ?? 0;
                    const level = countryData?.level ?? 'NO_DATA';

                    return (
                      <Geography
                        key={geo.rsmKey}
                        geography={geo}
                        fill={layers.has('risk') ? scoreToColor(score, level) : '#E5E7EB'}
                        stroke="#D1D5DB"
                        strokeWidth={0.5}
                        style={{
                          hover: {
                            fill: countryData ? scoreToHoverColor(score, level) : '#D1D5DB',
                            stroke: '#9CA3AF',
                            strokeWidth: 1,
                            cursor: countryData ? 'pointer' : 'default',
                          },
                          pressed: {
                            fill: countryData ? scoreToHoverColor(score, level) : '#D1D5DB',
                          },
                        }}
                        onMouseEnter={(evt) => {
                          if (!countryData) return;
                          setTooltip({
                            visible: true,
                            x: evt.clientX,
                            y: evt.clientY,
                            country: countryData,
                          });
                        }}
                        onMouseMove={(evt) => {
                          if (tooltip.visible) {
                            setTooltip((t) => ({ ...t, x: evt.clientX, y: evt.clientY }));
                          }
                        }}
                        onMouseLeave={() => {
                          setTooltip((t) => ({ ...t, visible: false }));
                        }}
                        onClick={() => {
                          if (countryData && !compact) setSelectedCountry(countryData);
                        }}
                      />
                    );
                  })
                }
              </Geographies>

              {/* Deadline bubbles layer */}
              {layers.has('deadlines') && countries.map((c) => {
                const center = COUNTRY_CENTERS[c.code];
                if (!center || c.deadlines7d === 0) return null;
                const r = Math.min(4 + c.deadlines7d * 3, 18);
                return (
                  <Marker key={`dl-${c.code}`} coordinates={center}>
                    <circle r={r} fill="#F97316" fillOpacity={0.6} stroke="#EA580C" strokeWidth={1} />
                    <text textAnchor="middle" dominantBaseline="central" fontSize={8} fill="white" fontWeight="bold">
                      {c.deadlines7d}
                    </text>
                  </Marker>
                );
              })}

              {/* Recent changes pulsing bubbles layer */}
              {layers.has('changes') && countries.map((c) => {
                const center = COUNTRY_CENTERS[c.code];
                if (!center || c.changes30d === 0) return null;
                const r = Math.min(4 + c.changes30d * 1.5, 16);
                return (
                  <Marker key={`ch-${c.code}`} coordinates={center}>
                    <circle r={r} fill="#8B5CF6" fillOpacity={0.5} stroke="#7C3AED" strokeWidth={1} className="animate-pulse" />
                    <text textAnchor="middle" dominantBaseline="central" fontSize={8} fill="white" fontWeight="bold">
                      {c.changes30d}
                    </text>
                  </Marker>
                );
              })}
            </ZoomableGroup>
          </ComposableMap>
        </div>

        {/* Legend */}
        <MapLegend lastUpdated={lastUpdated} compact={compact} onRefresh={fetchData} />

        {/* Tooltip */}
        {tooltip.visible && tooltip.country && (
          <div
            className="fixed z-50 bg-gray-900 text-white text-xs rounded-lg p-3 shadow-xl pointer-events-none max-w-[220px]"
            style={{
              left: tooltip.x + 12,
              top: tooltip.y - 8,
            }}
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="text-base">{getFlag(tooltip.country.code)}</span>
              <span className="font-semibold">{tooltip.country.name}</span>
            </div>
            <div className="border-t border-gray-700 pt-2 space-y-1">
              <div className="flex justify-between">
                <span className="text-gray-400">Risk Score:</span>
                <span className="font-bold">
                  {tooltip.country.score}/100{' '}
                  <span style={{ color: scoreToColor(tooltip.country.score, tooltip.country.level) }}>
                    {tooltip.country.level}
                  </span>
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Alertas HIGH:</span>
                <span>{tooltip.country.alertsHigh}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Deadlines 7d:</span>
                <span>{tooltip.country.deadlines7d}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Cambios 30d:</span>
                <span>{tooltip.country.changes30d}</span>
              </div>
              {tooltip.country.clients.length > 0 && (
                <div className="pt-1 border-t border-gray-700">
                  <span className="text-gray-400">Clientes: </span>
                  <span>{tooltip.country.clients.map((c) => c.name).join(', ')}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Country detail drawer */}
      {selectedCountry && !compact && (
        <CountryDetailDrawer
          country={selectedCountry}
          onClose={() => setSelectedCountry(null)}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FLAGS: Record<string, string> = {
  US: '🇺🇸', EU: '🇪🇺', ES: '🇪🇸', MX: '🇲🇽', AR: '🇦🇷', BR: '🇧🇷',
};

function getFlag(code: string): string {
  return FLAGS[code] ?? '🏳️';
}
