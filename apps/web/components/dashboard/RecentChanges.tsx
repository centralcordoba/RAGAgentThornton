// ============================================================================
// FILE: apps/web/components/dashboard/RecentChanges.tsx
// Real-time feed of regulatory changes via SSE.
// ============================================================================

'use client';

import { useState, useMemo } from 'react';
import { CountryFlag } from '../ui/CountryFlag';
import { Badge, impactToBadgeVariant } from '../ui/Badge';
import { useEventSource } from '@/lib/hooks/useEventSource';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChangeItem {
  readonly id: string;
  readonly title: string;
  readonly country: string;
  readonly impactLevel: string;
  readonly source: string;
  readonly publishedDate: string;
  readonly affectedAreas: readonly string[];
}

interface RecentChangesProps {
  readonly initialChanges: readonly ChangeItem[];
  readonly sseUrl?: string;
}

// ---------------------------------------------------------------------------
// RecentChanges
// ---------------------------------------------------------------------------

export function RecentChanges({ initialChanges, sseUrl }: RecentChangesProps) {
  const [changes, setChanges] = useState<ChangeItem[]>([...initialChanges]);
  const [filter, setFilter] = useState<string | null>(null);

  // SSE for real-time updates
  const { connected } = useEventSource({
    url: sseUrl ?? '',
    enabled: !!sseUrl,
    eventTypes: ['alert'],
    onMessage: (event) => {
      try {
        const data = JSON.parse(event.data as string) as ChangeItem;
        setChanges((prev) => [data, ...prev].slice(0, 50));
      } catch {
        // Ignore invalid SSE data
      }
    },
  });

  // Apply impact filter
  const filtered = useMemo(() => {
    if (!filter) return changes;
    return changes.filter((c) => c.impactLevel === filter);
  }, [changes, filter]);

  return (
    <div className="card flex flex-col h-full">
      <div className="card-header flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-gray-900">Cambios Recientes</h2>
          {connected && (
            <span className="flex items-center gap-1 text-xs text-risk-low">
              <span className="h-1.5 w-1.5 rounded-full bg-risk-low animate-pulse" />
              En vivo
            </span>
          )}
        </div>

        {/* Impact filter */}
        <div className="flex gap-1">
          {(['HIGH', 'MEDIUM', 'LOW'] as const).map((level) => (
            <button
              key={level}
              onClick={() => setFilter(filter === level ? null : level)}
              className={`px-2 py-0.5 text-xs rounded-full border transition-colors ${
                filter === level
                  ? 'bg-brand-700 text-white border-brand-700'
                  : 'border-gray-200 text-gray-500 hover:border-gray-300'
              }`}
            >
              {level}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
        {filtered.length === 0 && (
          <div className="p-8 text-center text-sm text-gray-400">
            No hay cambios regulatorios recientes
          </div>
        )}

        {filtered.map((change) => (
          <ChangeRow key={change.id} change={change} />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ChangeRow
// ---------------------------------------------------------------------------

function ChangeRow({ change }: { change: ChangeItem }) {
  return (
    <div className="px-5 py-3 hover:bg-gray-50 transition-colors cursor-pointer">
      <div className="flex items-start gap-3">
        <CountryFlag code={change.country} size="md" />

        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-900 font-medium line-clamp-2">
            {change.title}
          </p>

          <div className="flex items-center gap-2 mt-1.5">
            <Badge variant={impactToBadgeVariant(change.impactLevel)} size="sm">
              {change.impactLevel}
            </Badge>
            <span className="text-xs text-gray-400">{change.source}</span>
            <span className="text-xs text-gray-400">·</span>
            <span className="text-xs text-gray-400">
              {formatRelativeTime(change.publishedDate)}
            </span>
          </div>

          {change.affectedAreas.length > 0 && (
            <div className="flex gap-1 mt-1.5">
              {change.affectedAreas.slice(0, 3).map((area) => (
                <span
                  key={area}
                  className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded"
                >
                  {area}
                </span>
              ))}
              {change.affectedAreas.length > 3 && (
                <span className="text-[10px] text-gray-400">
                  +{change.affectedAreas.length - 3}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60_000);

  if (diffMinutes < 1) return 'Ahora';
  if (diffMinutes < 60) return `Hace ${diffMinutes}m`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `Hace ${diffHours}h`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `Hace ${diffDays}d`;

  return date.toLocaleDateString('es', { day: 'numeric', month: 'short' });
}
