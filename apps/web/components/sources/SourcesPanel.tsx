// ============================================================================
// FILE: apps/web/components/sources/SourcesPanel.tsx
// Panel showing all regulatory sources with status, controls, and actions.
// ============================================================================

'use client';

import { useState, useEffect, useCallback } from 'react';
import { CountryFlag } from '../ui/CountryFlag';
import { TriggerDrawer } from './TriggerDrawer';
import { AddSourceForm } from './AddSourceForm';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Source {
  readonly id: string;
  readonly name: string;
  readonly country: string;
  readonly type: 'API' | 'RSS' | 'SCRAPING';
  readonly status: 'OK' | 'WARNING' | 'ERROR';
  readonly lastFetch: string | null;
  readonly docsIndexed: number;
  readonly lastError: string | null;
  readonly frequency: 'every_10min' | 'hourly' | 'daily';
  readonly active: boolean;
  readonly baseUrl: string;
  readonly headers: Record<string, string>;
  readonly regulatoryArea: string;
}

const STATUS_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  OK: { bg: 'bg-green-50', text: 'text-green-700', dot: 'bg-green-500' },
  WARNING: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
  ERROR: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
};

const TYPE_BADGES: Record<string, { bg: string; text: string }> = {
  API: { bg: 'bg-blue-100', text: 'text-blue-700' },
  RSS: { bg: 'bg-purple-100', text: 'text-purple-700' },
  SCRAPING: { bg: 'bg-orange-100', text: 'text-orange-700' },
};

const FREQ_LABELS: Record<string, string> = {
  every_10min: 'Cada 10 min',
  hourly: 'Cada hora',
  daily: 'Diario',
};

const API_BASE = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3000';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SourcesPanel() {
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggerSource, setTriggerSource] = useState<Source | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const fetchSources = useCallback(async () => {
    try {
      const token = sessionStorage.getItem('auth_token') ?? process.env['NEXT_PUBLIC_DEV_TOKEN'];
      const res = await fetch(`${API_BASE}/api/sources`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setSources(data.data ?? []);
      }
    } catch {
      // API not available — sources list will be empty
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSources();
  }, [fetchSources]);

  const handleToggle = async (source: Source) => {
    setTogglingId(source.id);
    try {
      const token = sessionStorage.getItem('auth_token') ?? process.env['NEXT_PUBLIC_DEV_TOKEN'];
      const res = await fetch(`${API_BASE}/api/sources/${source.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ active: !source.active }),
      });
      if (res.ok) {
        const updated = await res.json();
        setSources((prev) => prev.map((s) => (s.id === source.id ? updated : s)));
      }
    } finally {
      setTogglingId(null);
    }
  };

  const handleSourceAdded = () => {
    setShowAddForm(false);
    fetchSources();
  };

  if (loading) {
    return (
      <div className="card card-body flex items-center justify-center h-48">
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Cargando fuentes...
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Header with Add button */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">
          {sources.length} fuentes configuradas
          {' · '}
          {sources.filter((s) => s.active).length} activas
        </p>
        <button
          onClick={() => setShowAddForm(true)}
          className="btn-primary flex items-center gap-2"
        >
          <span>+</span>
          Nueva fuente
        </button>
      </div>

      {/* Sources table */}
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-left">
              <th className="px-4 py-3 font-medium text-gray-500">Estado</th>
              <th className="px-4 py-3 font-medium text-gray-500">Fuente</th>
              <th className="px-4 py-3 font-medium text-gray-500">Tipo</th>
              <th className="px-4 py-3 font-medium text-gray-500">Último fetch</th>
              <th className="px-4 py-3 font-medium text-gray-500 text-right">Docs</th>
              <th className="px-4 py-3 font-medium text-gray-500">Frecuencia</th>
              <th className="px-4 py-3 font-medium text-gray-500 text-center">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {sources.map((source) => {
              const statusStyle = STATUS_COLORS[source.status] ?? STATUS_COLORS['OK']!;
              const typeStyle = TYPE_BADGES[source.type] ?? TYPE_BADGES['API']!;

              return (
                <tr
                  key={source.id}
                  className={`hover:bg-gray-50 transition-colors ${!source.active ? 'opacity-50' : ''}`}
                >
                  {/* Status indicator */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 rounded-full ${statusStyle.dot}`} />
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusStyle.bg} ${statusStyle.text}`}>
                        {source.status}
                      </span>
                    </div>
                  </td>

                  {/* Name + country */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <CountryFlag code={source.country} size="sm" />
                      <div>
                        <p className="font-medium text-gray-900">{source.name}</p>
                        <p className="text-xs text-gray-400 truncate max-w-[200px]">
                          {source.baseUrl}
                        </p>
                      </div>
                    </div>
                  </td>

                  {/* Type badge */}
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-1 rounded ${typeStyle.bg} ${typeStyle.text}`}>
                      {source.type}
                    </span>
                  </td>

                  {/* Last fetch */}
                  <td className="px-4 py-3">
                    {source.lastFetch ? (
                      <div>
                        <p className="text-gray-700">{formatRelativeTime(source.lastFetch)}</p>
                        {source.lastError && (
                          <p className="text-xs text-red-500 truncate max-w-[180px]" title={source.lastError}>
                            {source.lastError}
                          </p>
                        )}
                      </div>
                    ) : (
                      <span className="text-gray-400">Nunca</span>
                    )}
                  </td>

                  {/* Doc count */}
                  <td className="px-4 py-3 text-right">
                    <span className="font-mono text-gray-700">
                      {source.docsIndexed.toLocaleString()}
                    </span>
                  </td>

                  {/* Frequency */}
                  <td className="px-4 py-3">
                    <span className="text-gray-600 text-xs">
                      {FREQ_LABELS[source.frequency] ?? source.frequency}
                    </span>
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-2">
                      {/* Trigger button */}
                      <button
                        onClick={() => setTriggerSource(source)}
                        disabled={!source.active}
                        className="text-xs px-2.5 py-1.5 rounded border border-brand-700 text-brand-700 hover:bg-brand-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        title="Ejecutar ahora"
                      >
                        ▶ Ejecutar
                      </button>

                      {/* Toggle active */}
                      <button
                        onClick={() => handleToggle(source)}
                        disabled={togglingId === source.id}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                          source.active ? 'bg-brand-700' : 'bg-gray-300'
                        }`}
                        title={source.active ? 'Desactivar' : 'Activar'}
                      >
                        <span
                          className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                            source.active ? 'translate-x-4.5' : 'translate-x-0.5'
                          }`}
                        />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Trigger drawer */}
      {triggerSource && (
        <TriggerDrawer
          source={triggerSource}
          onClose={() => {
            setTriggerSource(null);
            fetchSources();
          }}
        />
      )}

      {/* Add source form */}
      {showAddForm && (
        <AddSourceForm
          onClose={() => setShowAddForm(false)}
          onCreated={handleSourceAdded}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMin < 1) return 'Ahora';
  if (diffMin < 60) return `Hace ${diffMin} min`;
  if (diffHr < 24) return `Hace ${diffHr}h`;
  return `Hace ${diffDays}d`;
}
