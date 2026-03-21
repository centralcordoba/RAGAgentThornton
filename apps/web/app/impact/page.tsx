// ============================================================================
// FILE: apps/web/app/impact/page.tsx
// Impact Analyzer — main page with heatmap + analysis drawer.
// ============================================================================

import { ImpactHeatmap } from '@/components/impact/ImpactHeatmap';

export default function ImpactPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Análisis de Impacto</h1>
          <p className="text-sm text-gray-500 mt-1">
            Mapa de calor regulatorio — últimos 30 días
          </p>
        </div>
        <a
          href="/impact/timeline"
          className="btn-secondary text-xs"
        >
          Ver timeline completo
        </a>
      </div>
      <ImpactHeatmap />
    </div>
  );
}
