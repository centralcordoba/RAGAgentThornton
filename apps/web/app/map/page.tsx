// ============================================================================
// FILE: apps/web/app/map/page.tsx
// Full risk map page with drawer, filters, layer toggles.
// ============================================================================

import { WorldRiskMap } from '@/components/map/WorldRiskMap';

export default function MapPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Mapa de Riesgo Regulatorio</h1>
        <p className="text-sm text-gray-500 mt-1">
          Vision global del riesgo regulatorio por jurisdiccion
        </p>
      </div>
      <WorldRiskMap compact={false} height={500} />
    </div>
  );
}
