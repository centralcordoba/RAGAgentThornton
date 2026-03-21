// ============================================================================
// FILE: apps/web/components/impact/AgentReasoningLog.tsx
// Real-time reasoning stream from the ImpactAnalyzerAgent.
// Each step fades in with an icon matching its type.
// ============================================================================

'use client';

import { useEffect, useRef } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ReasoningStep {
  readonly step: number;
  readonly type: string;
  readonly message: string;
  readonly timestamp: string;
  readonly data?: Record<string, unknown>;
}

interface Props {
  readonly steps: readonly ReasoningStep[];
  readonly isRunning: boolean;
}

const STEP_ICONS: Record<string, { icon: string; color: string }> = {
  search:    { icon: '🔍', color: 'text-blue-600 bg-blue-50 border-blue-200' },
  analysis:  { icon: '📊', color: 'text-purple-600 bg-purple-50 border-purple-200' },
  graph:     { icon: '🔗', color: 'text-green-600 bg-green-50 border-green-200' },
  detection: { icon: '⚡', color: 'text-orange-600 bg-orange-50 border-orange-200' },
  clients:   { icon: '👥', color: 'text-sky-600 bg-sky-50 border-sky-200' },
  complete:  { icon: '✅', color: 'text-green-700 bg-green-50 border-green-300' },
  warning:   { icon: '⚠️', color: 'text-amber-700 bg-amber-50 border-amber-300' },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AgentReasoningLog({ steps, isRunning }: Props) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [steps]);

  return (
    <div className="p-4 space-y-2.5">
      {steps.length === 0 && isRunning && (
        <div className="flex items-center gap-2 text-sm text-gray-400 py-8 justify-center">
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Iniciando Impact Analyzer Agent...
        </div>
      )}

      {steps.map((step, i) => {
        const meta = STEP_ICONS[step.type] ?? STEP_ICONS['analysis']!;
        const isLast = i === steps.length - 1;

        return (
          <div
            key={step.step}
            className={`flex gap-3 animate-fadeIn rounded-lg border p-3 ${meta.color} ${
              isLast && isRunning ? 'opacity-100' : ''
            }`}
            style={{ animationDelay: `${i * 50}ms` }}
          >
            <span className="text-lg flex-shrink-0">{meta.icon}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium leading-snug">{step.message}</p>
              <p className="text-[10px] mt-1 opacity-60">
                Step {step.step} — {new Date(step.timestamp).toLocaleTimeString('es', {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}
              </p>
            </div>
          </div>
        );
      })}

      {isRunning && steps.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-gray-400 pl-2">
          <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Procesando siguiente paso...
        </div>
      )}

      <div ref={endRef} />
    </div>
  );
}
