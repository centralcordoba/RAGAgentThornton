// ============================================================================
// FILE: apps/web/app/regulations/page.tsx
// Regulatory feed — fetches real data from API.
// ============================================================================

'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { RegulationFilters } from '@/components/regulations/RegulationFilters';
import type { RegulationFilterValues } from '@/components/regulations/RegulationFilters';
import { RegulationCard } from '@/components/regulations/RegulationCard';
import type { RegulationItem } from '@/components/regulations/RegulationCard';
import { RegulationDetail } from '@/components/regulations/RegulationDetail';
import { useUIStore } from '@/lib/stores/uiStore';

const API_BASE = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3000';

const EMPTY_FILTERS: RegulationFilterValues = {
  country: null,
  area: null,
  impactLevel: null,
  dateFrom: '',
  dateTo: '',
  search: '',
};

export default function RegulationsPage() {
  const [filters, setFilters] = useState<RegulationFilterValues>(EMPTY_FILTERS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [regulations, setRegulations] = useState<RegulationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<{ regulation: Record<string, unknown>; analysis: Record<string, unknown> | null } | null>(null);
  const { openChatForClient } = useUIStore();

  // Fetch regulations from API
  useEffect(() => {
    async function fetchRegulations() {
      setLoading(true);
      try {
        const token = sessionStorage.getItem('auth_token') ?? process.env['NEXT_PUBLIC_DEV_TOKEN'];
        const params = new URLSearchParams();
        params.set('pageSize', '50');
        if (filters.country) params.set('country', filters.country);
        if (filters.impactLevel) params.set('impactLevel', filters.impactLevel);

        const res = await fetch(`${API_BASE}/api/regulations?${params}`, {
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });

        if (res.ok) {
          const body = await res.json();
          const items: RegulationItem[] = (body.data ?? []).map((r: Record<string, unknown>) => ({
            id: r['id'] as string,
            title: r['title'] as string,
            summary: r['summary'] as string,
            country: r['country'] as string,
            jurisdiction: r['jurisdiction'] as string,
            impactLevel: r['impactLevel'] as string,
            source: (r['sourceUrl'] as string)?.includes('sec.gov') ? 'SEC_EDGAR'
              : (r['sourceUrl'] as string)?.includes('eur-lex') ? 'EUR_LEX'
              : (r['sourceUrl'] as string)?.includes('boe.es') ? 'BOE_SPAIN'
              : 'UNKNOWN',
            affectedAreas: (r['affectedAreas'] as string[]) ?? [],
            affectedIndustries: (r['affectedIndustries'] as string[]) ?? [],
            effectiveDate: ((r['effectiveDate'] as string) ?? '').split('T')[0] ?? '',
            publishedDate: ((r['publishedDate'] as string) ?? '').split('T')[0] ?? '',
            sourceUrl: (r['sourceUrl'] as string) ?? '',
          }));
          setRegulations(items);
        }
      } catch {
        // API not available
      } finally {
        setLoading(false);
      }
    }
    fetchRegulations();
  }, [filters.country, filters.impactLevel]);

  // Client-side filtering for search, area, dates
  const filtered = useMemo(() => {
    let result = regulations;

    if (filters.search) {
      const q = filters.search.toLowerCase();
      result = result.filter(
        (r) =>
          r.title.toLowerCase().includes(q) ||
          r.summary.toLowerCase().includes(q) ||
          r.source.toLowerCase().includes(q),
      );
    }
    if (filters.area) {
      result = result.filter((r) => r.affectedAreas.includes(filters.area!));
    }
    if (filters.dateFrom) {
      result = result.filter((r) => r.publishedDate >= filters.dateFrom);
    }
    if (filters.dateTo) {
      result = result.filter((r) => r.publishedDate <= filters.dateTo);
    }

    return result;
  }, [regulations, filters]);

  const selectedRegulation = selectedId
    ? regulations.find((r) => r.id === selectedId)
    : null;

  // Fetch detail when selected
  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    async function fetchDetail() {
      try {
        const token = sessionStorage.getItem('auth_token') ?? process.env['NEXT_PUBLIC_DEV_TOKEN'];
        const res = await fetch(`${API_BASE}/api/regulations/${selectedId}`, {
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });
        if (res.ok) {
          setDetail(await res.json());
        }
      } catch {
        // Detail not available
      }
    }
    fetchDetail();
  }, [selectedId]);

  const handleAnalyze = useCallback((_id: string) => {
    openChatForClient('');
  }, [openChatForClient]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Cambios Regulatorios</h1>
          <p className="text-sm text-gray-500 mt-1">
            Feed de cambios regulatorios con análisis de impacto
          </p>
        </div>
        <div className="flex gap-2 text-xs text-gray-400">
          <span>{regulations.length} regulaciones cargadas</span>
        </div>
      </div>

      {/* Filters */}
      <RegulationFilters
        values={filters}
        onChange={setFilters}
        onReset={() => setFilters(EMPTY_FILTERS)}
        resultCount={filtered.length}
      />

      {/* Regulation list */}
      <div className="space-y-3">
        {loading && (
          <div className="card p-12 text-center">
            <p className="text-sm text-gray-500">Cargando regulaciones...</p>
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="card p-12 text-center">
            <p className="text-sm text-gray-500 mt-3">
              No se encontraron cambios regulatorios con los filtros seleccionados
            </p>
          </div>
        )}

        {filtered.map((reg) => (
          <RegulationCard
            key={reg.id}
            regulation={reg}
            onViewDetail={setSelectedId}
            onAnalyze={handleAnalyze}
          />
        ))}
      </div>

      {/* Detail slide-over */}
      {selectedRegulation && (
        <RegulationDetail
          regulation={{
            ...selectedRegulation,
            rawContent: (detail?.regulation?.['rawContent'] as string) ?? selectedRegulation.summary,
          }}
          analysis={detail?.analysis ?? null}
          isLoadingAnalysis={!detail}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}
