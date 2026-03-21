// ============================================================================
// FILE: apps/web/components/map/MapLegend.tsx
// Map legend — color scale + last updated timestamp + refresh button.
// ============================================================================

'use client';

interface Props {
  readonly lastUpdated: Date;
  readonly compact?: boolean;
  readonly onRefresh: () => void;
}

const LEGEND_ITEMS = [
  { label: 'Sin datos', color: '#E5E7EB' },
  { label: 'Bajo', color: '#86EFAC' },
  { label: 'Medio', color: '#FCD34D' },
  { label: 'Alto', color: '#F97316' },
  { label: 'Critico', color: '#EF4444' },
];

export function MapLegend({ lastUpdated, compact, onRefresh }: Props) {
  const minutesAgo = Math.max(0, Math.round((Date.now() - lastUpdated.getTime()) / 60_000));
  const timeLabel = minutesAgo === 0 ? 'ahora' : `hace ${minutesAgo} min`;

  return (
    <div className="px-4 py-2.5 border-t border-gray-100 flex items-center justify-between flex-wrap gap-2">
      {/* Color scale */}
      <div className="flex items-center gap-3">
        <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">
          Nivel de riesgo
        </span>
        {LEGEND_ITEMS.map((item) => (
          <div key={item.label} className="flex items-center gap-1">
            <span
              className="h-3 w-3 rounded-sm inline-block"
              style={{ backgroundColor: item.color }}
            />
            <span className="text-[10px] text-gray-500">{item.label}</span>
          </div>
        ))}
      </div>

      {/* Timestamp + refresh */}
      {!compact && (
        <div className="flex items-center gap-2 text-[10px] text-gray-400">
          <span>Actualizado: {timeLabel}</span>
          <button
            onClick={onRefresh}
            className="hover:text-brand-700 transition-colors"
            title="Actualizar datos"
          >
            🔄
          </button>
        </div>
      )}
    </div>
  );
}
