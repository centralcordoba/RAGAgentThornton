// ============================================================================
// FILE: apps/web/components/onboarding/StepAnalyzing.tsx
// Step 3: Loading animation while the API generates the ComplianceMap.
// ============================================================================

'use client';

import { useEffect, useState } from 'react';

interface StepAnalyzingProps {
  readonly countries: readonly string[];
  readonly clientName: string;
}

const ANALYSIS_STEPS = [
  { label: 'Conectando con bases regulatorias...', duration: 1500 },
  { label: 'Consultando obligaciones por jurisdicción...', duration: 2000 },
  { label: 'Analizando cambios regulatorios recientes...', duration: 2500 },
  { label: 'Calculando riesgo por país...', duration: 1500 },
  { label: 'Generando resumen ejecutivo con IA...', duration: 3000 },
  { label: 'Construyendo mapa de compliance...', duration: 1500 },
] as const;

export function StepAnalyzing({ countries, clientName }: StepAnalyzingProps) {
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    let animFrame: number;

    const totalDuration = ANALYSIS_STEPS.reduce((sum, s) => sum + s.duration, 0);
    const startTime = Date.now();

    const tick = () => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min((elapsed / totalDuration) * 100, 99);
      setProgress(pct);

      // Determine which step we're on
      let accumulated = 0;
      for (let i = 0; i < ANALYSIS_STEPS.length; i++) {
        accumulated += ANALYSIS_STEPS[i]!.duration;
        if (elapsed < accumulated) {
          setCurrentStepIdx(i);
          break;
        }
      }

      if (elapsed < totalDuration) {
        animFrame = requestAnimationFrame(tick);
      }
    };

    animFrame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(animFrame);
      clearTimeout(timeout);
    };
  }, []);

  const currentStep = ANALYSIS_STEPS[currentStepIdx];

  return (
    <div className="max-w-lg mx-auto text-center space-y-8 py-12">
      {/* Animated icon */}
      <div className="relative inline-block">
        <div className="h-24 w-24 rounded-full bg-brand-50 flex items-center justify-center mx-auto">
          <span className="text-4xl animate-bounce">🔍</span>
        </div>
        {/* Orbiting dots */}
        <div className="absolute inset-0 animate-spin" style={{ animationDuration: '3s' }}>
          {countries.slice(0, 5).map((_, i) => {
            const angle = (i / Math.min(countries.length, 5)) * 360;
            const rad = (angle * Math.PI) / 180;
            const x = 50 + 45 * Math.cos(rad);
            const y = 50 + 45 * Math.sin(rad);
            return (
              <div
                key={i}
                className="absolute h-3 w-3 rounded-full bg-brand-800"
                style={{
                  left: `${x}%`,
                  top: `${y}%`,
                  transform: 'translate(-50%, -50%)',
                  opacity: 0.3 + (i * 0.15),
                }}
              />
            );
          })}
        </div>
      </div>

      <div>
        <h2 className="text-lg font-bold text-gray-900">
          Generando mapa de compliance
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Analizando {countries.length} {countries.length === 1 ? 'jurisdicción' : 'jurisdicciones'} para {clientName}
        </p>
      </div>

      {/* Progress bar */}
      <div className="space-y-2">
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-brand-800 rounded-full transition-all duration-300 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-sm text-brand-700 font-medium animate-pulse">
          {currentStep?.label}
        </p>
      </div>

      {/* Step checklist */}
      <div className="text-left max-w-xs mx-auto space-y-2">
        {ANALYSIS_STEPS.map((step, idx) => (
          <div
            key={idx}
            className={`flex items-center gap-2 text-xs transition-opacity ${
              idx < currentStepIdx
                ? 'text-risk-low'
                : idx === currentStepIdx
                  ? 'text-brand-800 font-medium'
                  : 'text-gray-300'
            }`}
          >
            <span>
              {idx < currentStepIdx ? '✅' : idx === currentStepIdx ? '⏳' : '⬜'}
            </span>
            <span>{step.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
