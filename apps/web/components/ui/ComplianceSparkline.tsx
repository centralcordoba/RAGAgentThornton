// ============================================================================
// FILE: apps/web/components/ui/ComplianceSparkline.tsx
// Sparkline chart showing compliance score trend over 12 months.
// Pure SVG — no external chart library needed.
// ============================================================================

interface DataPoint {
  readonly month: string;
  readonly score: number;
}

interface Props {
  readonly data: readonly DataPoint[];
  readonly height?: number;
  readonly showLabels?: boolean;
}

export function ComplianceSparkline({ data, height = 120, showLabels = true }: Props) {
  if (data.length < 2) return null;

  const width = 400;
  const padding = { top: 10, right: 10, bottom: showLabels ? 24 : 6, left: showLabels ? 30 : 6 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const minScore = Math.min(...data.map((d) => d.score));
  const maxScore = Math.max(...data.map((d) => d.score));
  const range = Math.max(maxScore - minScore, 10); // min 10 range to avoid flat line

  const scaleX = (i: number) => padding.left + (i / (data.length - 1)) * chartW;
  const scaleY = (score: number) => padding.top + chartH - ((score - minScore + 5) / (range + 10)) * chartH;

  // Build SVG path
  const points = data.map((d, i) => ({ x: scaleX(i), y: scaleY(d.score) }));
  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

  // Gradient fill area
  const areaPath = `${linePath} L ${points[points.length - 1]!.x} ${padding.top + chartH} L ${points[0]!.x} ${padding.top + chartH} Z`;

  // Current score and trend
  const currentScore = data[data.length - 1]!.score;
  const prevScore = data[data.length - 2]!.score;
  const trendDelta = currentScore - prevScore;
  const isImproving = trendDelta >= 0;

  // Score color
  const scoreColor = currentScore >= 70 ? '#10b981' : currentScore >= 40 ? '#f59e0b' : '#ef4444';
  const gradientId = `sparkline-grad-${Math.random().toString(36).slice(2, 8)}`;

  return (
    <div className="space-y-2">
      {/* Score header */}
      {showLabels && (
        <div className="flex items-end gap-2">
          <span className="text-2xl font-bold" style={{ color: scoreColor }}>
            {currentScore}%
          </span>
          <span className={`text-xs font-medium mb-1 flex items-center gap-0.5 ${
            isImproving ? 'text-green-600' : 'text-red-600'
          }`}>
            {isImproving ? '↑' : '↓'} {Math.abs(trendDelta)}pts
            <span className="text-gray-400 font-normal ml-1">vs mes anterior</span>
          </span>
        </div>
      )}

      {/* SVG Chart */}
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ height }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={scoreColor} stopOpacity={0.2} />
            <stop offset="100%" stopColor={scoreColor} stopOpacity={0.02} />
          </linearGradient>
        </defs>

        {/* Y-axis labels */}
        {showLabels && (
          <>
            <text x={padding.left - 4} y={scaleY(maxScore) + 3} textAnchor="end" className="fill-gray-400 text-[9px]">{maxScore}</text>
            <text x={padding.left - 4} y={scaleY(minScore) + 3} textAnchor="end" className="fill-gray-400 text-[9px]">{minScore}</text>
          </>
        )}

        {/* X-axis month labels */}
        {showLabels && data.filter((_, i) => i % 3 === 0 || i === data.length - 1).map((d, idx) => {
          const origIdx = data.indexOf(d);
          const label = d.month.split('-')[1]! + '/' + d.month.split('-')[0]!.slice(2);
          return (
            <text key={d.month} x={scaleX(origIdx)} y={height - 4} textAnchor="middle" className="fill-gray-400 text-[8px]">
              {label}
            </text>
          );
        })}

        {/* Threshold line at 50% */}
        <line
          x1={padding.left}
          y1={scaleY(50)}
          x2={padding.left + chartW}
          y2={scaleY(50)}
          stroke="#e5e7eb"
          strokeWidth={1}
          strokeDasharray="4 4"
        />

        {/* Gradient fill */}
        <path d={areaPath} fill={`url(#${gradientId})`} />

        {/* Line */}
        <path d={linePath} fill="none" stroke={scoreColor} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />

        {/* Data points */}
        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={i === points.length - 1 ? 4 : 2}
            fill={i === points.length - 1 ? scoreColor : 'white'}
            stroke={scoreColor}
            strokeWidth={i === points.length - 1 ? 2 : 1.5}
          />
        ))}

        {/* Current score label on last point */}
        {!showLabels && (
          <text
            x={points[points.length - 1]!.x}
            y={points[points.length - 1]!.y - 8}
            textAnchor="middle"
            className="text-[10px] font-bold"
            fill={scoreColor}
          >
            {currentScore}%
          </text>
        )}
      </svg>
    </div>
  );
}
