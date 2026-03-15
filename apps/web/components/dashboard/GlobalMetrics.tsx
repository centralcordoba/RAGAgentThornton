// ============================================================================
// FILE: apps/web/components/dashboard/GlobalMetrics.tsx
// Top-level KPI cards: active clients, open alerts, changes, deadlines.
// ============================================================================

'use client';

interface MetricCardProps {
  readonly title: string;
  readonly value: number | string;
  readonly subtitle?: string;
  readonly icon: string;
  readonly trend?: { value: number; direction: 'up' | 'down' };
  readonly breakdown?: readonly { label: string; value: number; color: string }[];
}

function MetricCard({ title, value, subtitle, icon, trend, breakdown }: MetricCardProps) {
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500 font-medium">{title}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
          {subtitle && (
            <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>
          )}
        </div>
        <span className="text-2xl">{icon}</span>
      </div>

      {trend && (
        <div className={`mt-3 flex items-center gap-1 text-xs font-medium ${
          trend.direction === 'up' ? 'text-risk-high' : 'text-risk-low'
        }`}>
          <span>{trend.direction === 'up' ? '▲' : '▼'}</span>
          <span>{Math.abs(trend.value)}% vs semana anterior</span>
        </div>
      )}

      {breakdown && breakdown.length > 0 && (
        <div className="mt-3 flex gap-3">
          {breakdown.map((item) => (
            <div key={item.label} className="flex items-center gap-1.5 text-xs">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              <span className="text-gray-500">{item.label}</span>
              <span className="font-semibold text-gray-700">{item.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export interface GlobalMetricsData {
  readonly activeClients: number;
  readonly alertsOpen: { total: number; high: number; medium: number; low: number };
  readonly regulatoryChanges7d: number;
  readonly deadlines30d: number;
  readonly alertsTrend: number;
  readonly changesTrend: number;
}

export function GlobalMetrics({ data }: { data: GlobalMetricsData }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <MetricCard
        title="Clientes activos"
        value={data.activeClients}
        icon="🏢"
        subtitle="En monitoreo"
      />
      <MetricCard
        title="Alertas abiertas"
        value={data.alertsOpen.total}
        icon="🔔"
        trend={
          data.alertsTrend !== 0
            ? { value: data.alertsTrend, direction: data.alertsTrend > 0 ? 'up' : 'down' }
            : undefined
        }
        breakdown={[
          { label: 'HIGH', value: data.alertsOpen.high, color: '#dc2626' },
          { label: 'MED', value: data.alertsOpen.medium, color: '#f59e0b' },
          { label: 'LOW', value: data.alertsOpen.low, color: '#10b981' },
        ]}
      />
      <MetricCard
        title="Cambios regulatorios"
        value={data.regulatoryChanges7d}
        icon="📜"
        subtitle="Últimos 7 días"
        trend={
          data.changesTrend !== 0
            ? { value: data.changesTrend, direction: data.changesTrend > 0 ? 'up' : 'down' }
            : undefined
        }
      />
      <MetricCard
        title="Deadlines próximos"
        value={data.deadlines30d}
        icon="⏰"
        subtitle="Próximos 30 días"
      />
    </div>
  );
}
