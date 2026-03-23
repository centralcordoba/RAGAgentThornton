// ============================================================================
// FILE: apps/web/components/impact/ImpactHeatmap.tsx
// Interactive heatmap: countries (cols) x regulatory areas (rows).
// Click cell → opens ImpactDrawer with analysis.
// ============================================================================

'use client';

import { useState, useEffect } from 'react';
import { CountryFlag } from '../ui/CountryFlag';
import { ImpactDrawer } from './ImpactDrawer';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface HeatmapCell {
  readonly jurisdiction: string;
  readonly area: string;
  readonly score: number;
  readonly changeCount: number;
  readonly topChange: string;
}

interface SelectedCell {
  readonly jurisdiction: string;
  readonly area: string;
  readonly score: number;
  readonly topChange: string;
}

const AREAS = ['Financiero', 'Datos/GDPR', 'Laboral', 'Ambiental', 'Fiscal', 'Sostenibilidad'] as const;
const API_BASE = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3000';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ImpactHeatmap() {
  const [matrix, setMatrix] = useState<HeatmapCell[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCell, setSelectedCell] = useState<SelectedCell | null>(null);
  const [hoveredCell, setHoveredCell] = useState<HeatmapCell | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const token = sessionStorage.getItem('auth_token') ?? process.env['NEXT_PUBLIC_DEV_TOKEN'] ?? null;
        const res = await fetch(`${API_BASE}/api/impact/heatmap?days=730`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (res.ok) {
          const data = await res.json();
          setMatrix(data.matrix ?? []);
        }
      } catch {
        // Use empty matrix on error
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // Derive jurisdictions dynamically from real data (no hardcoded AR, MX)
  const jurisdictions = Array.from(new Set(matrix.map((c) => c.jurisdiction))).sort();
  const activeAreas = AREAS.filter((area) => matrix.some((c) => c.area === area));

  const getCell = (jur: string, area: string): HeatmapCell | undefined =>
    matrix.find((c) => c.jurisdiction === jur && c.area === area);

  if (loading) {
    return (
      <div className="card card-body flex items-center justify-center h-64">
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Cargando heatmap...
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="card overflow-hidden">
        {/* Legend */}
        <div className="card-header flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">Mapa de Riesgo Regulatorio</h2>
          <div className="flex items-center gap-3 text-xs text-gray-500">
            <div className="flex items-center gap-1.5">
              <span className="h-3 w-6 rounded" style={{ background: scoreToColor(10) }} />
              <span>Bajo</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-3 w-6 rounded" style={{ background: scoreToColor(50) }} />
              <span>Medio</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-3 w-6 rounded" style={{ background: scoreToColor(90) }} />
              <span>Alto</span>
            </div>
          </div>
        </div>

        {/* Score explanation */}
        <div className="px-4 pt-3 pb-1">
          <details className="group">
            <summary className="flex items-center gap-2 cursor-pointer text-xs text-gray-400 hover:text-gray-600 transition-colors select-none">
              <svg className="h-3.5 w-3.5 transition-transform group-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
              Como se calcula el score?
            </summary>
            <div className="mt-3 mb-2 p-4 rounded-lg bg-gray-50 border border-gray-100">
              {/* Formula */}
              <div className="flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-gray-700 mb-2">Score de riesgo (0-100)</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-red-100 text-red-700 text-[11px] font-mono font-semibold">
                      HIGH x25
                    </span>
                    <span className="text-gray-400 text-xs">+</span>
                    <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-amber-100 text-amber-700 text-[11px] font-mono font-semibold">
                      MEDIUM x10
                    </span>
                    <span className="text-gray-400 text-xs">+</span>
                    <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-gray-200 text-gray-600 text-[11px] font-mono font-semibold">
                      cada cambio x3
                    </span>
                    <span className="text-gray-400 text-xs">=</span>
                    <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-brand-100 text-brand-800 text-[11px] font-mono font-semibold">
                      Score (max 100)
                    </span>
                  </div>
                </div>
              </div>

              {/* Scale visual */}
              <div className="mt-3 pt-3 border-t border-gray-200">
                <div className="flex items-center gap-0 h-3 rounded-full overflow-hidden">
                  <div className="h-full flex-1" style={{ background: 'linear-gradient(to right, #bbf7d0, #fef08a)' }} />
                  <div className="h-full flex-1" style={{ background: 'linear-gradient(to right, #fef08a, #fca5a5)' }} />
                  <div className="h-full flex-1" style={{ background: 'linear-gradient(to right, #fca5a5, #dc2626)' }} />
                </div>
                <div className="flex justify-between mt-1 text-[10px] text-gray-400">
                  <span>0 — Sin actividad</span>
                  <span>30 — Bajo</span>
                  <span>70 — Alto</span>
                  <span>100 — Critico</span>
                </div>
              </div>

              {/* Example */}
              <div className="mt-3 pt-3 border-t border-gray-200">
                <p className="text-[11px] text-gray-500">
                  <span className="font-semibold text-gray-600">Ejemplo:</span>{' '}
                  EU / Financiero = <span className="font-mono font-semibold text-red-600">100</span> porque tiene
                  4 regulaciones HIGH (DORA, SFDR, etc.) = 4 x 25 = 100.
                  Click en una celda para ver el analisis detallado.
                </p>
              </div>
            </div>
          </details>
        </div>

        <div className="p-4 pt-2 overflow-x-auto">
          <table className="w-full">
            {/* Column headers — countries */}
            <thead>
              <tr>
                <th className="p-2 text-left text-xs font-medium text-gray-500 w-32" />
                {jurisdictions.map((jur) => (
                  <th key={jur} className="p-2 text-center">
                    <div className="flex flex-col items-center gap-1">
                      <CountryFlag code={jur} size="sm" />
                      <span className="text-xs font-medium text-gray-600">{jur}</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>

            {/* Rows — areas */}
            <tbody>
              {activeAreas.map((area) => (
                <tr key={area}>
                  <td className="p-2 text-xs font-medium text-gray-600 whitespace-nowrap">
                    {area}
                  </td>
                  {jurisdictions.map((jur) => {
                    const cell = getCell(jur, area);
                    const score = cell?.score ?? 0;
                    const isHovered = hoveredCell?.jurisdiction === jur && hoveredCell?.area === area;

                    return (
                      <td key={`${jur}-${area}`} className="p-1.5">
                        <button
                          onClick={() => cell && setSelectedCell({
                            jurisdiction: jur,
                            area,
                            score,
                            topChange: cell.topChange,
                          })}
                          onMouseEnter={() => cell && setHoveredCell(cell)}
                          onMouseLeave={() => setHoveredCell(null)}
                          className={`relative w-full h-14 rounded-lg transition-all duration-150 ${
                            isHovered ? 'ring-2 ring-brand-700 scale-105 z-10' : ''
                          } ${score > 0 ? 'cursor-pointer' : 'cursor-default'}`}
                          style={{ background: scoreToColor(score) }}
                          title={cell?.topChange ?? ''}
                        >
                          <div className="flex flex-col items-center justify-center h-full">
                            <span className={`text-sm font-bold ${score > 60 ? 'text-white' : 'text-gray-800'}`}>
                              {score}
                            </span>
                            {(cell?.changeCount ?? 0) > 0 && (
                              <span className={`text-[10px] ${score > 60 ? 'text-white/80' : 'text-gray-500'}`}>
                                {cell!.changeCount} cambios
                              </span>
                            )}
                          </div>

                          {/* Tooltip on hover */}
                          {isHovered && cell?.topChange && (
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-52 bg-gray-900 text-white text-xs rounded-lg p-2.5 shadow-lg z-20 pointer-events-none">
                              <p className="font-medium line-clamp-2">{cell.topChange}</p>
                              <p className="text-gray-400 mt-1">{cell.changeCount} cambios detectados</p>
                              <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px">
                                <div className="border-4 border-transparent border-t-gray-900" />
                              </div>
                            </div>
                          )}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Impact Drawer */}
      {selectedCell && (
        <ImpactDrawer
          jurisdiction={selectedCell.jurisdiction}
          area={selectedCell.area}
          score={selectedCell.score}
          onClose={() => setSelectedCell(null)}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Color interpolation: green → yellow → red
// ---------------------------------------------------------------------------

function scoreToColor(score: number): string {
  if (score <= 0) return '#f0fdf4';
  if (score <= 30) {
    const t = score / 30;
    return lerpColor('#bbf7d0', '#fef08a', t);
  }
  if (score <= 70) {
    const t = (score - 30) / 40;
    return lerpColor('#fef08a', '#fca5a5', t);
  }
  const t = Math.min((score - 70) / 30, 1);
  return lerpColor('#fca5a5', '#dc2626', t);
}

function lerpColor(a: string, b: string, t: number): string {
  const ah = parseInt(a.slice(1), 16);
  const bh = parseInt(b.slice(1), 16);
  const ar = (ah >> 16) & 0xff, ag = (ah >> 8) & 0xff, ab = ah & 0xff;
  const br = (bh >> 16) & 0xff, bg = (bh >> 8) & 0xff, bb = bh & 0xff;
  const rr = Math.round(ar + (br - ar) * t);
  const rg = Math.round(ag + (bg - ag) * t);
  const rb = Math.round(ab + (bb - ab) * t);
  return `#${((rr << 16) | (rg << 8) | rb).toString(16).padStart(6, '0')}`;
}
