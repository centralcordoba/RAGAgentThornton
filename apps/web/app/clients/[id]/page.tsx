// ============================================================================
// FILE: apps/web/app/clients/[id]/page.tsx
// Client Dashboard — fetches real data from API.
// ============================================================================

import { RiskScore } from '@/components/ui/RiskScore';
import { CountryFlag } from '@/components/ui/CountryFlag';
import { Badge } from '@/components/ui/Badge';
import { DeadlineChip } from '@/components/ui/DeadlineChip';
import { ObligationGraph } from '@/components/client/ObligationGraph';
import type { GraphNode, GraphEdge } from '@/components/client/ObligationGraph';
import { ComplianceTimeline } from '@/components/client/ComplianceTimeline';
import type { TimelineEvent } from '@/components/client/ComplianceTimeline';
import { AlertsPanel } from '@/components/client/AlertsPanel';
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

      {/* Upcoming deadlines strip */}
      {upcomingDeadlines.length > 0 && (
        <div className="card px-5 py-3">
          <div className="flex items-center gap-3 overflow-x-auto">
            <span className="text-xs font-semibold text-gray-500 flex-shrink-0">Próximos:</span>
            {upcomingDeadlines.map((d) => (
              <DeadlineChip key={d.id} date={d.dueDate} label={d.title} />
            ))}
          </div>
        </div>
      )}

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

      {/* Alerts */}
      {alerts.length > 0 && (
        <AlertsPanel
          alerts={alerts}
          onAcknowledge={async () => {}}
          onBulkAcknowledge={async () => {}}
          userRole="PROFESSIONAL"
        />
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
