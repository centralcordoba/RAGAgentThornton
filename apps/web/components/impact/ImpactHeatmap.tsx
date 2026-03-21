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

const JURISDICTIONS = ['US', 'EU', 'ES', 'MX', 'AR', 'BR'] as const;
const AREAS = ['Financiero', 'Datos/GDPR', 'Laboral', 'Ambiental', 'Fiscal'] as const;
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
        const token = sessionStorage.getItem('auth_token');
        const res = await fetch(`${API_BASE}/api/impact/heatmap?days=30`, {
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

        <div className="p-4 overflow-x-auto">
          <table className="w-full">
            {/* Column headers — countries */}
            <thead>
              <tr>
                <th className="p-2 text-left text-xs font-medium text-gray-500 w-32" />
                {JURISDICTIONS.map((jur) => (
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
              {AREAS.map((area) => (
                <tr key={area}>
                  <td className="p-2 text-xs font-medium text-gray-600 whitespace-nowrap">
                    {area}
                  </td>
                  {JURISDICTIONS.map((jur) => {
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
