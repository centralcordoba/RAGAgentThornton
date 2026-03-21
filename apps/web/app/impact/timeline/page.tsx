// ============================================================================
// FILE: apps/web/app/impact/timeline/page.tsx
// Impact Timeline — regulatory changes over time by country.
// ============================================================================

import { ImpactTimeline } from '@/components/impact/ImpactTimeline';

export default function TimelinePage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Timeline Regulatorio</h1>
          <p className="text-sm text-gray-500 mt-1">
            Volumen de cambios regulatorios por jurisdicción — últimos 90 días
          </p>
        </div>
        <a href="/impact" className="btn-secondary text-xs">
          Volver al heatmap
        </a>
      </div>
      <ImpactTimeline />
    </div>
  );
}
