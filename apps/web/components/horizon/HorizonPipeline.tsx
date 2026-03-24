// ============================================================================
// FILE: apps/web/components/horizon/HorizonPipeline.tsx
// Visual pipeline: PROPOSED → COMMENT PERIOD → FINAL RULE → EFFECTIVE
// ============================================================================

'use client';

interface Props {
  readonly byStage: Record<string, number>;
  readonly activeStage: string | null;
  readonly onStageClick: (stage: string | null) => void;
}

const STAGES = [
  { key: 'PROPOSED', label: 'Propuesta', icon: '📝', color: 'from-blue-500 to-blue-600', bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', ring: 'ring-blue-400' },
  { key: 'COMMENT_PERIOD', label: 'Comentarios', icon: '💬', color: 'from-amber-500 to-amber-600', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', ring: 'ring-amber-400' },
  { key: 'FINAL_RULE', label: 'Regla Final', icon: '📋', color: 'from-purple-500 to-purple-600', bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200', ring: 'ring-purple-400' },
  { key: 'EFFECTIVE', label: 'Vigente', icon: '✅', color: 'from-green-500 to-green-600', bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200', ring: 'ring-green-400' },
] as const;

export function HorizonPipeline({ byStage, activeStage, onStageClick }: Props) {
  const total = Object.values(byStage).reduce((s, n) => s + n, 0);

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-900">Pipeline Regulatorio</h2>
        {activeStage && (
          <button onClick={() => onStageClick(null)} className="text-[11px] text-gray-400 hover:text-gray-600">
            Limpiar filtro
          </button>
        )}
      </div>

      <div className="flex items-center gap-0">
        {STAGES.map((stage, idx) => {
          const count = byStage[stage.key] ?? 0;
          const isActive = activeStage === stage.key;
          const hasData = count > 0;
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;

          return (
            <div key={stage.key} className="flex items-center flex-1 min-w-0">
              {/* Stage card */}
              <button
                onClick={() => onStageClick(isActive ? null : stage.key)}
                className={`relative flex-1 rounded-xl p-4 border-2 transition-all ${
                  isActive
                    ? `${stage.bg} ${stage.border} ring-2 ${stage.ring} scale-[1.02]`
                    : hasData
                      ? `${stage.bg} ${stage.border} hover:scale-[1.01] hover:shadow-md`
                      : 'bg-gray-50 border-gray-100 opacity-40'
                }`}
              >
                {/* Icon + count */}
                <div className="flex items-center justify-between">
                  <span className="text-xl">{stage.icon}</span>
                  <span className={`text-2xl font-bold ${hasData ? stage.text : 'text-gray-300'}`}>
                    {count}
                  </span>
                </div>

                {/* Label */}
                <p className={`text-[11px] font-semibold mt-2 ${hasData ? stage.text : 'text-gray-400'}`}>
                  {stage.label}
                </p>

                {/* Progress bar */}
                {total > 0 && (
                  <div className="mt-2 h-1.5 w-full bg-white/60 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full bg-gradient-to-r ${stage.color} transition-all duration-500`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                )}

                {/* Percentage */}
                <p className="text-[9px] text-gray-400 mt-1">{pct}% del pipeline</p>
              </button>

              {/* Arrow connector */}
              {idx < STAGES.length - 1 && (
                <div className="flex-shrink-0 mx-1">
                  <svg className="w-5 h-5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
