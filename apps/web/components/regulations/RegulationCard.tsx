// ============================================================================
// FILE: apps/web/components/regulations/RegulationCard.tsx
// Card for a single regulatory change in the feed.
// ============================================================================

'use client';

import { useState } from 'react';
import { Badge, impactToBadgeVariant } from '../ui/Badge';
import { CountryFlag } from '../ui/CountryFlag';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RegulationItem {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly country: string;
  readonly jurisdiction: string;
  readonly impactLevel: string;
  readonly source: string;
  readonly affectedAreas: readonly string[];
  readonly affectedIndustries: readonly string[];
  readonly effectiveDate: string;
  readonly publishedDate: string;
  readonly sourceUrl: string;
}

interface RegulationCardProps {
  readonly regulation: RegulationItem;
  readonly onViewDetail: (id: string) => void;
  readonly onAnalyze: (id: string) => void;
}

// ---------------------------------------------------------------------------
// RegulationCard
// ---------------------------------------------------------------------------

export function RegulationCard({ regulation, onViewDetail, onAnalyze }: RegulationCardProps) {
  const [expanded, setExpanded] = useState(false);

  const daysAgo = Math.floor(
    (Date.now() - new Date(regulation.publishedDate).getTime()) / 86_400_000,
  );

  return (
    <div className="card hover:shadow-md transition-shadow">
      <div className="px-5 py-4">
        {/* Header row */}
        <div className="flex items-start gap-3">
          <CountryFlag code={regulation.country} size="md" />

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant={impactToBadgeVariant(regulation.impactLevel)} size="sm">
                {regulation.impactLevel}
              </Badge>
              <span className="text-xs text-gray-400">{regulation.source}</span>
              <span className="text-xs text-gray-400">·</span>
              <span className="text-xs text-gray-400">
                {daysAgo === 0 ? 'Hoy' : daysAgo === 1 ? 'Ayer' : `Hace ${daysAgo} días`}
              </span>
            </div>

            <h3
              className="text-sm font-semibold text-gray-900 cursor-pointer hover:text-brand-700 transition-colors"
              onClick={() => onViewDetail(regulation.id)}
            >
              {regulation.title}
            </h3>

            <p className={`text-xs text-gray-600 mt-1.5 ${expanded ? '' : 'line-clamp-2'}`}>
              {regulation.summary}
            </p>

            {regulation.summary.length > 150 && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="text-xs text-brand-600 hover:underline mt-1"
              >
                {expanded ? 'Ver menos' : 'Ver más'}
              </button>
            )}
          </div>
        </div>

        {/* Metadata row */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-50">
          <div className="flex flex-wrap gap-1.5">
            {/* Areas */}
            {regulation.affectedAreas.slice(0, 4).map((area) => (
              <span
                key={area}
                className="text-[10px] px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded capitalize"
              >
                {area}
              </span>
            ))}
            {/* Industries */}
            {regulation.affectedIndustries.slice(0, 2).map((ind) => (
              <span
                key={ind}
                className="text-[10px] px-1.5 py-0.5 bg-purple-50 text-purple-700 rounded capitalize"
              >
                {ind}
              </span>
            ))}
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-[10px] text-gray-400">
              Efectiva: {new Date(regulation.effectiveDate).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
            <button
              onClick={() => onAnalyze(regulation.id)}
              className="text-xs px-2.5 py-1 rounded border border-brand-200 text-brand-700 hover:bg-brand-50 transition-colors"
            >
              Analizar impacto
            </button>
            <a
              href={regulation.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              Fuente →
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
