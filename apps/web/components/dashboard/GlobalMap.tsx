// ============================================================================
// FILE: apps/web/components/dashboard/GlobalMap.tsx
// World map rendered with D3 geo projections + TopoJSON.
// Countries with risk data are colored by score; click → side panel.
// ============================================================================

'use client';

import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { feature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
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
// ISO 3166 numeric → alpha-2 mapping for countries we care about
// ---------------------------------------------------------------------------

const NUMERIC_TO_ALPHA2: Record<string, string> = {
  '032': 'AR', '076': 'BR', '152': 'CL', '170': 'CO',
  '484': 'MX', '604': 'PE', '840': 'US', '724': 'ES',
  '858': 'UY', '056': 'BE', '276': 'DE', '250': 'FR',
  '380': 'IT', '528': 'NL', '620': 'PT', '040': 'AT',
};

// Countries to highlight even without risk data (GT presence regions)
const HIGHLIGHT_COUNTRIES = new Set([
  'AR', 'BR', 'CL', 'CO', 'MX', 'PE', 'US', 'ES', 'UY',
]);

const WORLD_TOPO_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

// ---------------------------------------------------------------------------
// GlobalMap
// ---------------------------------------------------------------------------

export function GlobalMap({ countries }: { countries: readonly CountryRiskData[] }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [selectedCountry, setSelectedCountry] = useState<CountryRiskData | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  const riskByCode = useRef(new Map<string, CountryRiskData>());

  // Build lookup
  useEffect(() => {
    const map = new Map<string, CountryRiskData>();
    for (const c of countries) {
      map.set(c.code, c);
    }
    riskByCode.current = map;
  }, [countries]);

  // Render D3 map
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const width = 800;
    const height = 450;

    const svgSel = d3.select(svg)
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('preserveAspectRatio', 'xMidYMid meet');

    svgSel.selectAll('*').remove();

    // Background
    svgSel.append('rect')
      .attr('width', width)
      .attr('height', height)
      .attr('fill', '#f8fafc')
      .attr('rx', 8);

    const g = svgSel.append('g');

    // Projection: Natural Earth — nice for world overview
    const projection = d3.geoNaturalEarth1()
      .scale(145)
      .translate([width / 2, height / 2 + 20]);

    const path = d3.geoPath().projection(projection);

    // Graticule (grid lines)
    const graticule = d3.geoGraticule10();
    g.append('path')
      .datum(graticule)
      .attr('d', path)
      .attr('fill', 'none')
      .attr('stroke', '#e2e8f0')
      .attr('stroke-width', 0.4);

    // Globe outline
    g.append('path')
      .datum({ type: 'Sphere' } as d3.GeoPermissibleObjects)
      .attr('d', path)
      .attr('fill', 'none')
      .attr('stroke', '#cbd5e1')
      .attr('stroke-width', 0.8);

    // Fetch world topology
    d3.json<Topology>(WORLD_TOPO_URL).then((world) => {
      if (!world) return;

      const countriesGeo = feature(
        world,
        world.objects.countries as GeometryCollection,
      );

      const riskMap = riskByCode.current;

      // Draw country paths
      g.selectAll<SVGPathElement, d3.GeoPermissibleObjects>('path.country')
        .data(countriesGeo.features)
        .join('path')
        .attr('class', 'country')
        .attr('d', path)
        .attr('fill', (d) => {
          const alpha2 = NUMERIC_TO_ALPHA2[d.id as string];
          if (!alpha2) return '#e2e8f0'; // default gray for non-tracked
          const risk = riskMap.get(alpha2);
          if (risk) return getRiskColor(risk.riskScore);
          if (HIGHLIGHT_COUNTRIES.has(alpha2)) return '#ddd6fe'; // light purple for GT presence
          return '#e2e8f0';
        })
        .attr('stroke', '#ffffff')
        .attr('stroke-width', 0.6)
        .attr('cursor', (d) => {
          const alpha2 = NUMERIC_TO_ALPHA2[d.id as string];
          return alpha2 && riskMap.has(alpha2) ? 'pointer' : 'default';
        })
        .on('mouseenter', function (event, d) {
          const alpha2 = NUMERIC_TO_ALPHA2[d.id as string];
          if (!alpha2) return;
          const risk = riskMap.get(alpha2);
          if (!risk) return;

          d3.select(this)
            .attr('stroke', '#4F2D7F')
            .attr('stroke-width', 2)
            .raise();

          // Tooltip
          const tooltip = tooltipRef.current;
          if (tooltip) {
            tooltip.style.display = 'block';
            tooltip.style.left = `${event.offsetX + 12}px`;
            tooltip.style.top = `${event.offsetY - 10}px`;
            tooltip.innerHTML = `
              <p class="font-semibold">${getCountryName(alpha2)}</p>
              <p class="text-xs">Riesgo: <span style="color:${getRiskColor(risk.riskScore)};font-weight:bold">${risk.riskScore}</span></p>
              <p class="text-xs">${risk.openAlerts} alertas · ${risk.activeClients} clientes</p>
            `;
          }
        })
        .on('mousemove', function (event) {
          const tooltip = tooltipRef.current;
          if (tooltip) {
            tooltip.style.left = `${event.offsetX + 12}px`;
            tooltip.style.top = `${event.offsetY - 10}px`;
          }
        })
        .on('mouseleave', function () {
          d3.select(this)
            .attr('stroke', '#ffffff')
            .attr('stroke-width', 0.6);
          const tooltip = tooltipRef.current;
          if (tooltip) tooltip.style.display = 'none';
        })
        .on('click', (_event, d) => {
          const alpha2 = NUMERIC_TO_ALPHA2[d.id as string];
          if (!alpha2) return;
          const risk = riskMap.get(alpha2);
          if (!risk) return;
          setSelectedCountry((prev) =>
            prev?.code === alpha2 ? null : risk,
          );
        });

      // Pulsing circles for high-risk countries
      for (const [code, risk] of riskMap.entries()) {
        if (risk.riskScore < 70) continue;

        // Find centroid of the country
        const feat = countriesGeo.features.find((f) => {
          return NUMERIC_TO_ALPHA2[f.id as string] === code;
        });
        if (!feat) continue;
        const centroid = path.centroid(feat);
        if (!centroid || isNaN(centroid[0])) continue;

        // Pulse ring
        g.append('circle')
          .attr('cx', centroid[0])
          .attr('cy', centroid[1])
          .attr('r', 6)
          .attr('fill', 'none')
          .attr('stroke', '#dc2626')
          .attr('stroke-width', 2)
          .attr('opacity', 0.8)
          .append('animate')
          .attr('attributeName', 'r')
          .attr('values', '4;12;4')
          .attr('dur', '2.5s')
          .attr('repeatCount', 'indefinite');

        g.append('circle')
          .attr('cx', centroid[0])
          .attr('cy', centroid[1])
          .attr('r', 6)
          .attr('fill', 'none')
          .attr('stroke', '#dc2626')
          .attr('stroke-width', 2)
          .append('animate')
          .attr('attributeName', 'opacity')
          .attr('values', '0.8;0;0.8')
          .attr('dur', '2.5s')
          .attr('repeatCount', 'indefinite');
      }

      // Country labels for tracked countries
      for (const [code, risk] of riskMap.entries()) {
        const feat = countriesGeo.features.find((f) => {
          return NUMERIC_TO_ALPHA2[f.id as string] === code;
        });
        if (!feat) continue;
        const centroid = path.centroid(feat);
        if (!centroid || isNaN(centroid[0])) continue;

        g.append('text')
          .attr('x', centroid[0])
          .attr('y', centroid[1] + 1)
          .attr('text-anchor', 'middle')
          .attr('dominant-baseline', 'central')
          .attr('font-size', risk.riskScore >= 70 ? 10 : 9)
          .attr('font-weight', 'bold')
          .attr('fill', risk.riskScore >= 30 ? '#fff' : '#065f46')
          .attr('pointer-events', 'none')
          .text(code);
      }

      setMapLoaded(true);
    });

    // Cleanup
    return () => {
      svgSel.selectAll('*').remove();
    };
  }, [countries]);

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
        <div className="relative flex-1 p-4">
          {!mapLoaded && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-50 rounded-lg">
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Cargando mapa...
              </div>
            </div>
          )}
          <svg
            ref={svgRef}
            className="w-full h-auto"
            style={{ maxHeight: 420 }}
          />
          {/* Tooltip */}
          <div
            ref={tooltipRef}
            className="absolute pointer-events-none bg-white border border-gray-200 rounded-md shadow-lg px-3 py-2 text-sm text-gray-800 z-10"
            style={{ display: 'none' }}
          />
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
