// ============================================================================
// FILE: apps/web/app/sources/page.tsx
// Source Manager page — GT_ADMIN only.
// ============================================================================

import { SourcesPanel } from '@/components/sources/SourcesPanel';

export default function SourcesPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            Fuentes Regulatorias
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Gestiona los conectores de ingestion regulatoria
          </p>
        </div>
      </div>
      <SourcesPanel />
    </div>
  );
}
