// ============================================================================
// FILE: apps/web/components/onboarding/Stepper.tsx
// Horizontal stepper for the 4-step onboarding flow.
// ============================================================================

'use client';

interface StepperProps {
  readonly steps: readonly StepDef[];
  readonly currentStep: number;
}

interface StepDef {
  readonly label: string;
  readonly icon: string;
}

export function Stepper({ steps, currentStep }: StepperProps) {
  return (
    <nav className="flex items-center justify-center gap-2" aria-label="Progress">
      {steps.map((step, idx) => {
        const status = idx < currentStep ? 'complete' : idx === currentStep ? 'current' : 'upcoming';

        return (
          <div key={step.label} className="flex items-center">
            {/* Step circle */}
            <div className="flex flex-col items-center gap-1">
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold transition-colors ${
                  status === 'complete'
                    ? 'bg-risk-low text-white'
                    : status === 'current'
                      ? 'bg-brand-800 text-white ring-4 ring-brand-100'
                      : 'bg-gray-100 text-gray-400'
                }`}
              >
                {status === 'complete' ? '✓' : step.icon}
              </div>
              <span
                className={`text-xs font-medium ${
                  status === 'current' ? 'text-brand-800' : 'text-gray-400'
                }`}
              >
                {step.label}
              </span>
            </div>

            {/* Connector line */}
            {idx < steps.length - 1 && (
              <div
                className={`mx-3 h-0.5 w-12 sm:w-20 rounded ${
                  idx < currentStep ? 'bg-risk-low' : 'bg-gray-200'
                }`}
              />
            )}
          </div>
        );
      })}
    </nav>
  );
}

export const ONBOARDING_STEPS: StepDef[] = [
  { label: 'Datos', icon: '1' },
  { label: 'Países', icon: '2' },
  { label: 'Análisis', icon: '3' },
  { label: 'Resultado', icon: '4' },
];
