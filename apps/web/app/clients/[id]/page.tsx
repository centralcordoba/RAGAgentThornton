// ============================================================================
// FILE: apps/web/app/clients/[id]/page.tsx
// Client Dashboard — graph, timeline, alerts, compliance score.
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
// Page
// ---------------------------------------------------------------------------

export default async function ClientDashboardPage({
  params,
}: {
  params: { id: string };
}) {
  // In production: fetch from API
  // const dashboard = await api.clients.dashboard(params.id);
  const mock = getMockClientData(params.id);

  return (
    <div className="space-y-6">
      {/* Client header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{mock.client.name}</h1>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-sm text-gray-500">{mock.client.companyType}</span>
            <span className="text-gray-300">·</span>
            <div className="flex gap-1">
              {mock.client.countries.map((c: string) => (
                <CountryFlag key={c} code={c} showName size="sm" />
              ))}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <RiskScore score={mock.complianceScore} size="md" label="Compliance" />
          <button className="btn-primary text-sm">Abrir Chat</button>
        </div>
      </div>

      {/* Top metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <MetricCard label="Obligaciones" value={mock.totalObligations} />
        <MetricCard
          label="Pendientes"
          value={mock.obligationsByStatus['PENDING'] ?? 0}
          color="text-risk-medium"
        />
        <MetricCard
          label="Vencidas"
          value={mock.obligationsByStatus['OVERDUE'] ?? 0}
          color="text-risk-high"
        />
        <MetricCard
          label="Completadas"
          value={mock.obligationsByStatus['COMPLETED'] ?? 0}
          color="text-risk-low"
        />
      </div>

      {/* Upcoming deadlines strip */}
      {mock.upcomingDeadlines.length > 0 && (
        <div className="card px-5 py-3">
          <div className="flex items-center gap-3 overflow-x-auto">
            <span className="text-xs font-semibold text-gray-500 flex-shrink-0">Próximos:</span>
            {mock.upcomingDeadlines.map((d: { id: string; title: string; dueDate: string }) => (
              <DeadlineChip key={d.id} date={d.dueDate} label={d.title} />
            ))}
          </div>
        </div>
      )}

      {/* Graph + Timeline */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <ObligationGraph
          nodes={mock.graphNodes}
          edges={mock.graphEdges}
        />
        <ComplianceTimeline
          events={mock.timelineEvents}
          countries={mock.client.countries}
        />
      </div>

      {/* Alerts */}
      <AlertsPanel
        alerts={mock.alerts}
        onAcknowledge={async () => {}}
        onBulkAcknowledge={async () => {}}
        userRole="PROFESSIONAL"
      />
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
// Mock data
// ---------------------------------------------------------------------------

function getMockClientData(clientId: string) {
  return {
    client: {
      id: clientId,
      name: 'Acme Financial Corp',
      companyType: 'Public Company',
      countries: ['US', 'AR', 'MX'],
      industries: ['financial-services'],
    },
    complianceScore: 68,
    totalObligations: 28,
    obligationsByStatus: {
      PENDING: 12,
      IN_PROGRESS: 6,
      COMPLETED: 8,
      OVERDUE: 2,
    },
    upcomingDeadlines: [
      { id: 'dl-1', title: 'DDJJ F.931', dueDate: '2026-04-13' },
      { id: 'dl-2', title: 'Form 1120', dueDate: '2026-04-15' },
      { id: 'dl-3', title: 'DIOT Mensual', dueDate: '2026-04-17' },
      { id: 'dl-4', title: 'IVA Mensual AR', dueDate: '2026-04-20' },
    ],
    graphNodes: [
      { id: 'client', label: 'Acme Financial', type: 'client' as const },
      { id: 'us', label: 'Estados Unidos', type: 'country' as const },
      { id: 'ar', label: 'Argentina', type: 'country' as const },
      { id: 'mx', label: 'México', type: 'country' as const },
      { id: 'obl-us-1', label: 'Form 1120', type: 'obligation' as const, status: 'PENDING', area: 'fiscal', dueDate: '2026-04-15' },
      { id: 'obl-us-2', label: '10-K Annual', type: 'obligation' as const, status: 'COMPLETED', area: 'corporate' },
      { id: 'obl-ar-1', label: 'IVA Mensual', type: 'obligation' as const, status: 'PENDING', area: 'fiscal', dueDate: '2026-04-20' },
      { id: 'obl-ar-2', label: 'DDJJ F.931', type: 'obligation' as const, status: 'OVERDUE', area: 'labor', dueDate: '2026-04-13' },
      { id: 'obl-mx-1', label: 'DIOT', type: 'obligation' as const, status: 'PENDING', area: 'fiscal', dueDate: '2026-04-17' },
      { id: 'obl-mx-2', label: 'NOM-035', type: 'obligation' as const, status: 'COMPLETED', area: 'labor' },
      { id: 'reg-sec', label: 'SEC', type: 'regulator' as const },
      { id: 'reg-afip', label: 'AFIP', type: 'regulator' as const },
      { id: 'reg-sat', label: 'SAT', type: 'regulator' as const },
    ] satisfies GraphNode[],
    graphEdges: [
      { source: 'client', target: 'us', relationship: 'OPERATES_IN' },
      { source: 'client', target: 'ar', relationship: 'OPERATES_IN' },
      { source: 'client', target: 'mx', relationship: 'OPERATES_IN' },
      { source: 'us', target: 'obl-us-1', relationship: 'HAS_OBLIGATION' },
      { source: 'us', target: 'obl-us-2', relationship: 'HAS_OBLIGATION' },
      { source: 'ar', target: 'obl-ar-1', relationship: 'HAS_OBLIGATION' },
      { source: 'ar', target: 'obl-ar-2', relationship: 'HAS_OBLIGATION' },
      { source: 'mx', target: 'obl-mx-1', relationship: 'HAS_OBLIGATION' },
      { source: 'mx', target: 'obl-mx-2', relationship: 'HAS_OBLIGATION' },
      { source: 'obl-us-1', target: 'reg-sec', relationship: 'REGULATED_BY' },
      { source: 'obl-us-2', target: 'reg-sec', relationship: 'REGULATED_BY' },
      { source: 'obl-ar-1', target: 'reg-afip', relationship: 'REGULATED_BY' },
      { source: 'obl-ar-2', target: 'reg-afip', relationship: 'REGULATED_BY' },
      { source: 'obl-mx-1', target: 'reg-sat', relationship: 'REGULATED_BY' },
      { source: 'obl-mx-2', target: 'reg-sat', relationship: 'REGULATED_BY' },
    ] satisfies GraphEdge[],
    timelineEvents: [
      { id: 'te-1', title: 'DDJJ F.931 Seguridad Social', date: '2026-04-13', type: 'deadline' as const, urgency: 'CRITICAL' as const, country: 'AR', area: 'labor' },
      { id: 'te-2', title: 'Form 1120 Income Tax', date: '2026-04-15', type: 'deadline' as const, urgency: 'CRITICAL' as const, country: 'US', area: 'fiscal' },
      { id: 'te-3', title: 'DIOT Operaciones Terceros', date: '2026-04-17', type: 'deadline' as const, urgency: 'CRITICAL' as const, country: 'MX', area: 'fiscal' },
      { id: 'te-4', title: 'IVA Mensual', date: '2026-04-20', type: 'deadline' as const, urgency: 'CRITICAL' as const, country: 'AR', area: 'fiscal' },
      { id: 'te-5', title: 'Form 941 Employment Tax', date: '2026-04-30', type: 'deadline' as const, urgency: 'IMPORTANT' as const, country: 'US', area: 'fiscal' },
      { id: 'te-6', title: 'PTU Reparto Utilidades', date: '2026-05-30', type: 'deadline' as const, urgency: 'IMPORTANT' as const, country: 'MX', area: 'labor' },
      { id: 'te-7', title: 'EEO-1 Report', date: '2026-05-31', type: 'deadline' as const, urgency: 'IMPORTANT' as const, country: 'US', area: 'labor' },
      { id: 'te-8', title: 'Ganancias Anual', date: '2026-06-30', type: 'deadline' as const, urgency: 'NORMAL' as const, country: 'AR', area: 'fiscal' },
      { id: 'te-9', title: 'ECD SPED Contábil', date: '2026-06-30', type: 'deadline' as const, urgency: 'NORMAL' as const, country: 'BR', area: 'fiscal' },
      { id: 'te-10', title: 'Impuesto Sociedades ES', date: '2026-07-25', type: 'deadline' as const, urgency: 'NORMAL' as const, country: 'ES', area: 'fiscal' },
    ] satisfies TimelineEvent[],
    alerts: [
      { id: 'a-1', changeId: 'c-1', message: 'AFIP RG 5616 — Nuevo régimen de retenciones IVA afecta sus operaciones en Argentina. Plazo: 30 días.', impactLevel: 'HIGH', status: 'PENDING_REVIEW', channel: 'EMAIL', country: 'AR', createdAt: '2026-03-14T14:30:00Z', sentAt: null, acknowledgedAt: null, reviewedBy: null },
      { id: 'a-2', changeId: 'c-2', message: 'SEC Rule 10b-5 Amendment requiere actualización de divulgación de derivados para Q2 2026.', impactLevel: 'HIGH', status: 'SENT', channel: 'EMAIL', country: 'US', createdAt: '2026-03-12T18:00:00Z', sentAt: '2026-03-12T19:30:00Z', acknowledgedAt: null, reviewedBy: 'user-pro-001' },
      { id: 'a-3', changeId: 'c-3', message: 'SAT actualiza factura electrónica CFDI 4.0 — verificar campo receptor en sistemas.', impactLevel: 'MEDIUM', status: 'ACKNOWLEDGED', channel: 'TEAMS', country: 'MX', createdAt: '2026-03-09T08:00:00Z', sentAt: '2026-03-09T08:05:00Z', acknowledgedAt: '2026-03-10T10:00:00Z', reviewedBy: null },
      { id: 'a-4', changeId: 'c-4', message: 'BOE Corrección modelo 303 IVA — cambio menor en instrucciones de campos.', impactLevel: 'LOW', status: 'SENT', channel: 'SSE', country: 'ES', createdAt: '2026-03-08T09:00:00Z', sentAt: '2026-03-08T09:00:00Z', acknowledgedAt: null, reviewedBy: null },
    ] satisfies AlertItem[],
  };
}
