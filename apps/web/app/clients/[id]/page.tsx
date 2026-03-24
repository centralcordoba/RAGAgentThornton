// ============================================================================
// FILE: apps/web/app/clients/[id]/page.tsx
// Client Dashboard — fetches real data from API.
// ============================================================================

import { RiskScore } from '@/components/ui/RiskScore';
import { ComplianceSparkline } from '@/components/ui/ComplianceSparkline';
import { CountryFlag } from '@/components/ui/CountryFlag';
import { Badge } from '@/components/ui/Badge';
// DeadlineChip removed — using structured deadline section instead
import { ObligationGraph } from '@/components/client/ObligationGraph';
import type { GraphNode, GraphEdge } from '@/components/client/ObligationGraph';
import { ComplianceTimeline } from '@/components/client/ComplianceTimeline';
import type { TimelineEvent } from '@/components/client/ComplianceTimeline';
import type { AlertItem } from '@/components/client/AlertsPanel';

// ---------------------------------------------------------------------------
// API fetch helpers (server component — fetches directly)
// ---------------------------------------------------------------------------

const API_BASE = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3000';
const DEV_TOKEN = process.env['NEXT_PUBLIC_DEV_TOKEN'] ?? null;

function authHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    ...(DEV_TOKEN ? { Authorization: `Bearer ${DEV_TOKEN}` } : {}),
  };
}

async function fetchDashboard(clientId: string): Promise<DashboardResponse | null> {
  try {
    const res = await fetch(`${API_BASE}/api/clients/${clientId}/dashboard`, {
      cache: 'no-store',
      headers: authHeaders(),
    });
    if (!res.ok) return null;
    return res.json() as Promise<DashboardResponse>;
  } catch {
    return null;
  }
}

async function fetchGraph(clientId: string): Promise<GraphResponse | null> {
  try {
    const res = await fetch(`${API_BASE}/api/clients/${clientId}/graph?depth=3`, {
      cache: 'no-store',
      headers: authHeaders(),
    });
    if (!res.ok) return null;
    return res.json() as Promise<GraphResponse>;
  } catch {
    return null;
  }
}

async function fetchAlerts(clientId: string): Promise<AlertItem[]> {
  try {
    const res = await fetch(`${API_BASE}/api/alerts?clientId=${clientId}`, {
      cache: 'no-store',
      headers: authHeaders(),
    });
    if (!res.ok) return [];
    const body = await res.json();
    return (body.data ?? []) as AlertItem[];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function ClientDashboardPage({
  params,
}: {
  params: { id: string };
}) {
  const [dashboard, graph, alerts] = await Promise.all([
    fetchDashboard(params.id),
    fetchGraph(params.id),
    fetchAlerts(params.id),
  ]);

  if (!dashboard) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-3">
          <p className="text-lg font-semibold text-gray-700">Cliente no encontrado</p>
          <p className="text-sm text-gray-500">
            No se pudo cargar el dashboard para el cliente {params.id}.
            Verifica que la API esté corriendo y que el cliente exista.
          </p>
        </div>
      </div>
    );
  }

  const obligationsByStatus = dashboard.obligationsByStatus ?? {};
  const upcomingDeadlines: { id: string; title: string; dueDate: string }[] =
    (dashboard.upcomingDeadlines ?? []).map((d: Record<string, unknown>) => ({
      id: (d['id'] as string) ?? '',
      title: (d['title'] as string) ?? '',
      dueDate: ((d['deadline'] as string) ?? (d['dueDate'] as string) ?? '').split('T')[0] ?? '',
    }));

  // Build graph nodes/edges from API response or empty
  const graphNodes: GraphNode[] = graph?.nodes?.map((n) => ({
    id: n.id,
    label: n.label ?? n.id,
    type: (n.type?.toLowerCase() ?? 'obligation') as GraphNode['type'],
    ...(n.properties ?? {}),
  })) ?? [];

  const graphEdges: GraphEdge[] = graph?.edges?.map((e) => ({
    source: e.sourceNodeId ?? e.source ?? '',
    target: e.targetNodeId ?? e.target ?? '',
    relationship: e.relationship ?? '',
  })) ?? [];

  // Build timeline events from upcoming deadlines
  const timelineEvents: TimelineEvent[] = upcomingDeadlines.map((d, i) => ({
    id: d.id || `te-${i}`,
    title: d.title,
    date: d.dueDate,
    type: 'deadline' as const,
    urgency: getUrgency(d.dueDate),
    country: dashboard.countries?.[0] ?? '',
    area: 'regulatory',
  }));

  return (
    <div className="space-y-6">
      {/* Client header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            {dashboard.clientName ?? `Cliente ${params.id.slice(0, 8)}`}
          </h1>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-sm text-gray-500">
              {dashboard.companyType ?? ''}
            </span>
            <span className="text-gray-300">·</span>
            <div className="flex gap-1">
              {(dashboard.countries ?? []).map((c: string) => (
                <CountryFlag key={c} code={c} showName size="sm" />
              ))}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <RiskScore score={dashboard.complianceScore ?? 0} size="md" label="Compliance" />
          <a href={`/chat?clientId=${params.id}`} className="btn-primary text-sm">
            Abrir Chat
          </a>
        </div>
      </div>

      {/* Top metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <MetricCard label="Obligaciones" value={dashboard.totalObligations ?? 0} />
        <MetricCard
          label="Pendientes"
          value={(obligationsByStatus['PENDING'] ?? 0) + (obligationsByStatus['IN_PROGRESS'] ?? 0)}
          color="text-risk-medium"
        />
        <MetricCard
          label="Vencidas"
          value={obligationsByStatus['OVERDUE'] ?? 0}
          color="text-risk-high"
        />
        <MetricCard
          label="Completadas"
          value={obligationsByStatus['COMPLETED'] ?? 0}
          color="text-risk-low"
        />
      </div>

      {/* Compliance score trend */}
      {dashboard.scoreTrend && (dashboard.scoreTrend as { month: string; score: number }[]).length > 1 && (
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Tendencia de Compliance (12 meses)</h2>
          <ComplianceSparkline
            data={dashboard.scoreTrend as { month: string; score: number }[]}
            height={140}
            showLabels
          />
        </div>
      )}

      {/* Deadlines — separated into overdue vs upcoming */}
      {upcomingDeadlines.length > 0 && (() => {
        const now = new Date().toISOString().split('T')[0]!;
        const overdue = upcomingDeadlines.filter((d) => d.dueDate < now);
        const upcoming = upcomingDeadlines.filter((d) => d.dueDate >= now);

        return (
          <div className="card overflow-hidden">
            <div className="card-header flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">Obligaciones y deadlines</h2>
              <div className="flex items-center gap-3 text-[11px]">
                {overdue.length > 0 && (
                  <span className="flex items-center gap-1 text-red-600 font-semibold">
                    <span className="w-2 h-2 rounded-full bg-red-500" />
                    {overdue.length} vencidas
                  </span>
                )}
                {upcoming.length > 0 && (
                  <span className="flex items-center gap-1 text-green-600">
                    <span className="w-2 h-2 rounded-full bg-green-500" />
                    {upcoming.length} proximas
                  </span>
                )}
              </div>
            </div>

            {/* Overdue section */}
            {overdue.length > 0 && (
              <div className="border-b border-red-100 bg-red-50/50">
                <div className="px-4 py-2 flex items-center gap-2 border-b border-red-100">
                  <svg className="w-3.5 h-3.5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                  <span className="text-[11px] font-semibold text-red-700 uppercase tracking-wide">
                    Vencidas — accion requerida
                  </span>
                </div>
                <div className="divide-y divide-red-100">
                  {overdue.map((d) => {
                    const daysOverdue = Math.abs(Math.ceil((new Date(d.dueDate).getTime() - Date.now()) / 86_400_000));
                    return (
                      <div key={d.id} className="px-4 py-2.5 flex items-center gap-3">
                        <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-900 truncate">{d.title}</p>
                          <p className="text-[11px] text-gray-500">{d.dueDate}</p>
                        </div>
                        <span className="text-[11px] font-semibold text-red-600 bg-red-100 px-2 py-0.5 rounded-full whitespace-nowrap">
                          {daysOverdue}d vencido
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Upcoming section */}
            {upcoming.length > 0 && (
              <div>
                <div className="px-4 py-2 flex items-center gap-2 border-b border-gray-100">
                  <svg className="w-3.5 h-3.5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                  </svg>
                  <span className="text-[11px] font-semibold text-green-700 uppercase tracking-wide">
                    Proximas
                  </span>
                </div>
                <div className="divide-y divide-gray-50">
                  {upcoming.map((d) => {
                    const daysUntil = Math.ceil((new Date(d.dueDate).getTime() - Date.now()) / 86_400_000);
                    const urgencyColor = daysUntil <= 30 ? 'text-amber-600 bg-amber-100' :
                      daysUntil <= 90 ? 'text-blue-600 bg-blue-100' : 'text-green-600 bg-green-100';
                    return (
                      <div key={d.id} className="px-4 py-2.5 flex items-center gap-3">
                        <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-900 truncate">{d.title}</p>
                          <p className="text-[11px] text-gray-500">{d.dueDate}</p>
                        </div>
                        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${urgencyColor}`}>
                          {daysUntil}d
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Graph + Timeline */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {graphNodes.length > 0 ? (
          <ObligationGraph nodes={graphNodes} edges={graphEdges} />
        ) : (
          <div className="card p-6 flex items-center justify-center text-sm text-gray-400">
            Grafo de obligaciones no disponible
          </div>
        )}
        {timelineEvents.length > 0 ? (
          <ComplianceTimeline
            events={timelineEvents}
            countries={dashboard.countries ?? []}
          />
        ) : (
          <div className="card p-6 flex items-center justify-center text-sm text-gray-400">
            Sin deadlines próximos
          </div>
        )}
      </div>

      {/* Alerts (read-only in server component) */}
      {alerts.length > 0 && (
        <div className="card overflow-hidden">
          <div className="card-header">
            <h2 className="text-sm font-semibold text-gray-900">Alertas recientes ({alerts.length})</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {alerts.slice(0, 5).map((a: AlertItem) => (
              <div key={a.id} className="px-4 py-3 flex items-start gap-3">
                <span className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${
                  a.impactLevel === 'HIGH' ? 'bg-red-500' :
                  a.impactLevel === 'MEDIUM' ? 'bg-amber-500' : 'bg-green-500'
                }`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-900 line-clamp-2">{a.message}</p>
                  <div className="flex items-center gap-2 mt-1 text-[11px] text-gray-400">
                    <span className={`font-medium ${
                      a.status === 'PENDING_REVIEW' ? 'text-amber-600' :
                      a.status === 'SENT' ? 'text-blue-600' :
                      a.status === 'ACKNOWLEDGED' ? 'text-green-600' : 'text-gray-500'
                    }`}>{a.status}</span>
                    <span>{a.channel}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {alerts.length > 5 && (
            <div className="px-4 py-2 bg-gray-50 text-center">
              <a href="/alerts" className="text-xs text-brand-700 hover:underline">
                Ver todas las alertas ({alerts.length})
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MetricCard sub-component
// ---------------------------------------------------------------------------

function MetricCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color?: string;
}) {
  return (
    <div className="card px-4 py-3 text-center">
      <p className={`text-2xl font-bold ${color ?? 'text-gray-900'}`}>{value}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getUrgency(dateStr: string): 'CRITICAL' | 'IMPORTANT' | 'NORMAL' {
  const daysUntil = Math.ceil(
    (new Date(dateStr).getTime() - Date.now()) / 86_400_000,
  );
  if (daysUntil < 0) return 'CRITICAL';
  if (daysUntil <= 30) return 'CRITICAL';
  if (daysUntil <= 90) return 'IMPORTANT';
  return 'NORMAL';
}

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

interface DashboardResponse {
  readonly clientId: string;
  readonly clientName?: string;
  readonly companyType?: string;
  readonly countries?: readonly string[];
  readonly complianceScore: number;
  readonly totalObligations: number;
  readonly obligationsByStatus: Record<string, number>;
  readonly recentChanges: readonly Record<string, unknown>[];
  readonly pendingAlerts: readonly Record<string, unknown>[];
  readonly upcomingDeadlines: readonly Record<string, unknown>[];
  readonly scoreTrend?: readonly { month: string; score: number }[];
}

interface GraphResponse {
  readonly nodes: readonly {
    readonly id: string;
    readonly label?: string;
    readonly type?: string;
    readonly properties?: Record<string, unknown>;
  }[];
  readonly edges: readonly {
    readonly id?: string;
    readonly source?: string;
    readonly target?: string;
    readonly sourceNodeId?: string;
    readonly targetNodeId?: string;
    readonly relationship?: string;
  }[];
}
