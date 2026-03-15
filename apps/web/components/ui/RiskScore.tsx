// ============================================================================
// FILE: apps/web/components/ui/RiskScore.tsx
// Circular risk/compliance score indicator (0-100).
// ============================================================================

'use client';

interface RiskScoreProps {
  readonly score: number;
  readonly size?: 'sm' | 'md' | 'lg';
  readonly label?: string;
}

export function RiskScore({ score, size = 'md', label }: RiskScoreProps) {
  const clamped = Math.max(0, Math.min(100, score));
  const color = getScoreColor(clamped);
  const dimensions = SIZE_MAP[size];
  const circumference = 2 * Math.PI * dimensions.radius;
  const strokeDashoffset = circumference - (clamped / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: dimensions.size, height: dimensions.size }}>
        {/* Background circle */}
        <svg className="absolute inset-0" viewBox="0 0 100 100">
          <circle
            cx="50"
            cy="50"
            r={dimensions.radius}
            fill="none"
            stroke="#e5e7eb"
            strokeWidth={dimensions.strokeWidth}
          />
          {/* Score arc */}
          <circle
            cx="50"
            cy="50"
            r={dimensions.radius}
            fill="none"
            stroke={color}
            strokeWidth={dimensions.strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            transform="rotate(-90 50 50)"
            className="transition-all duration-700 ease-out"
          />
        </svg>
        {/* Score number */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            className="font-bold"
            style={{ fontSize: dimensions.fontSize, color }}
          >
            {clamped}
          </span>
        </div>
      </div>
      {label && (
        <span className="text-xs text-gray-500 font-medium">{label}</span>
      )}
    </div>
  );
}

const SIZE_MAP = {
  sm: { size: 56, radius: 42, strokeWidth: 6, fontSize: '14px' },
  md: { size: 80, radius: 42, strokeWidth: 6, fontSize: '18px' },
  lg: { size: 120, radius: 42, strokeWidth: 5, fontSize: '24px' },
} as const;

function getScoreColor(score: number): string {
  if (score >= 70) return '#10b981'; // green
  if (score >= 40) return '#f59e0b'; // amber
  return '#dc2626'; // red
}
