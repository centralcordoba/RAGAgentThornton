// ============================================================================
// FILE: apps/web/app/horizon/page.tsx
// Horizon Scanning — proposed/draft regulations pipeline view.
// ============================================================================

'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { HorizonPipeline } from '@/components/horizon/HorizonPipeline';
import { HorizonCard } from '@/components/horizon/HorizonCard';
import { CountryFlag } from '@/components/ui/CountryFlag';

const API_BASE = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3000';

interface Proposal {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly country: string;
  readonly impactLevel: string;
  readonly stage: string;
  readonly approvalProbability: number | null;
  readonly commentDeadline: string | null;
  readonly proposedEffectiveDate: string | null;
  readonly estimatedFinalDate: string | null;
  readonly proposingAgency: string | null;
  readonly publishedDate: string;
  readonly sourceUrl: string;
  readonly affectedAreas: readonly string[];
}

interface Summary {
  readonly total: number;
  readonly byStage: Record<string, number>;
  readonly byCountry: readonly { country: string; count: number }[];
  readonly highImpact: number;
  readonly avgProbability: number;
  readonly nearestCommentDeadline: string | null;
}

export default function HorizonPage() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [stageFilter, setStageFilter] = useState<string | null>(null);
  const [countryFilter, setCountryFilter] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const token = sessionStorage.getItem('auth_token') ?? process.env['NEXT_PUBLIC_DEV_TOKEN'] ?? null;
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

      const params = new URLSearchParams({ pageSize: '50' });
      if (stageFilter) params.set('stage', stageFilter);
      if (countryFilter) params.set('country', countryFilter);

      const [propRes, sumRes] = await Promise.all([
        fetch(`${API_BASE}/api/horizon?${params}`, { headers }),
        fetch(`${API_BASE}/api/horizon/summary`, { headers }),
      ]);

      if (propRes.ok) {
        const data = await propRes.json();
        setProposals((data.data ?? []) as Proposal[]);
      }
      if (sumRes.ok) {
        setSummary(await sumRes.json());
      }
    } catch {
      // API not available
    } finally {
      setLoading(false);
    }
  }, [stageFilter, countryFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Get unique countries from data
  const countries = useMemo(() => {
    return Array.from(new Set(proposals.map((p) => p.country))).sort();
  }, [proposals]);

  const nearestDays = summary?.nearestCommentDeadline
    ? Math.ceil((new Date(summary.nearestCommentDeadline).getTime() - Date.now()) / 86_400_000)
    : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-2xl">🔭</span>
            <h1 className="text-xl font-bold text-gray-900">Horizon Scanning</h1>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Regulaciones propuestas y en tramite — deteccion anticipada de cambios
          </p>
        </div>
      </div>

      {/* KPI Summary */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="card px-4 py-3 text-center">
            <p className="text-2xl font-bold text-brand-700">{summary.total}</p>
            <p className="text-[11px] text-gray-500">En pipeline</p>
          </div>
          <div className="card px-4 py-3 text-center">
            <p className="text-2xl font-bold text-red-600">{summary.highImpact}</p>
            <p className="text-[11px] text-gray-500">Alto impacto</p>
          </div>
          <div className="card px-4 py-3 text-center">
            <p className="text-2xl font-bold text-amber-600">{summary.avgProbability}%</p>
            <p className="text-[11px] text-gray-500">Prob. promedio aprobacion</p>
          </div>
          <div className="card px-4 py-3 text-center">
            <p className={`text-2xl font-bold ${
              nearestDays !== null && nearestDays <= 14 ? 'text-red-600' :
              nearestDays !== null && nearestDays <= 30 ? 'text-amber-600' : 'text-gray-700'
            }`}>
              {nearestDays !== null ? `${nearestDays}d` : '—'}
            </p>
            <p className="text-[11px] text-gray-500">Proximo cierre comentarios</p>
          </div>
        </div>
      )}

      {/* Pipeline visualization */}
      {summary && (
        <HorizonPipeline
          byStage={summary.byStage}
          activeStage={stageFilter}
          onStageClick={setStageFilter}
        />
      )}

      {/* Filters */}
      <div className="card card-body">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs font-medium text-gray-500">Filtrar:</span>
          <select
            value={countryFilter}
            onChange={(e) => setCountryFilter(e.target.value)}
            className="input w-auto text-xs"
          >
            <option value="">Todos los paises</option>
            {countries.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          {stageFilter && (
            <span className="text-xs text-brand-700 bg-brand-50 px-2 py-1 rounded-full flex items-center gap-1">
              Stage: {stageFilter}
              <button onClick={() => setStageFilter(null)} className="text-brand-500 hover:text-brand-700 ml-1">x</button>
            </span>
          )}
          <span className="text-[11px] text-gray-400 ml-auto">{proposals.length} resultados</span>
        </div>
      </div>

      {/* Proposal cards */}
      {loading ? (
        <div className="card p-12 text-center">
          <p className="text-sm text-gray-500">Escaneando horizonte regulatorio...</p>
        </div>
      ) : proposals.length === 0 ? (
        <div className="card p-12 text-center">
          <span className="text-4xl block mb-3">🔭</span>
          <p className="text-sm text-gray-500">No se encontraron regulaciones propuestas con los filtros seleccionados</p>
        </div>
      ) : (
        <div className="space-y-3">
          {proposals.map((p) => (
            <HorizonCard key={p.id} proposal={p} />
          ))}
        </div>
      )}
    </div>
  );
}
