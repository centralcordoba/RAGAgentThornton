// ============================================================================
// FILE: apps/web/components/impact/SeverityGauge.tsx
// Semicircular gauge for severity score 0-100.
// Ranges: 0-30 BAJO (green), 31-60 MEDIO (yellow), 61-80 ALTO (orange), 81-100 CRÍTICO (red)
// ============================================================================

'use client';

interface Props {
  readonly score: number;
  readonly size?: number;
}

const LEVELS: { max: number; label: string; color: string }[] = [
  { max: 30, label: 'BAJO', color: '#22c55e' },
  { max: 60, label: 'MEDIO', color: '#eab308' },
  { max: 80, label: 'ALTO', color: '#f97316' },
  { max: 100, label: 'CRÍTICO', color: '#ef4444' },
];

export function SeverityGauge({ score, size = 120 }: Props) {
  const clamped = Math.max(0, Math.min(100, score));
  const level = LEVELS.find((l) => clamped <= l.max) ?? LEVELS[3]!;

  // SVG semicircle arc
  const cx = size / 2;
  const cy = size / 2 + 5;
  const r = (size / 2) - 12;
  const strokeWidth = 10;

  // Arc from 180° to 0° (left to right semicircle)
  const startAngle = Math.PI;
  const sweepAngle = Math.PI * (clamped / 100);

  const bgArc = describeArc(cx, cy, r, startAngle, Math.PI);
  const valueArc = describeArc(cx, cy, r, startAngle, sweepAngle);

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size / 2 + 20} viewBox={`0 0 ${size} ${size / 2 + 20}`}>
        {/* Background arc */}
        <path
          d={bgArc}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        {/* Value arc */}
        <path
          d={valueArc}
          fill="none"
          stroke={level.color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          className="transition-all duration-1000 ease-out"
        />
        {/* Score text */}
        <text
          x={cx}
          y={cy - 6}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={size * 0.22}
          fontWeight="bold"
          fill="#111827"
        >
          {clamped}
        </text>
      </svg>
      <span
        className="text-xs font-bold -mt-1 px-2 py-0.5 rounded-full"
        style={{ color: level.color, backgroundColor: `${level.color}18` }}
      >
        {level.label}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Arc path helper
// ---------------------------------------------------------------------------

function describeArc(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  sweepAngle: number,
): string {
  const x1 = cx + r * Math.cos(startAngle);
  const y1 = cy - r * Math.sin(startAngle);
  const x2 = cx + r * Math.cos(startAngle - sweepAngle);
  const y2 = cy - r * Math.sin(startAngle - sweepAngle);
  const largeArc = sweepAngle > Math.PI / 2 ? 1 : 0;

  return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`;
}
