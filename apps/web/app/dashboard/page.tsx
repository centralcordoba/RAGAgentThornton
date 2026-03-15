// ============================================================================
// FILE: apps/web/app/dashboard/page.tsx
// Global Dashboard — metrics, risk map, and recent changes feed.
// ============================================================================

import { GlobalMetrics } from '@/components/dashboard/GlobalMetrics';
import type { GlobalMetricsData } from '@/components/dashboard/GlobalMetrics';
import { GlobalMap } from '@/components/dashboard/GlobalMap';
import type { CountryRiskData } from '@/components/dashboard/GlobalMap';
import { RecentChanges } from '@/components/dashboard/RecentChanges';
import type { ChangeItem } from '@/components/dashboard/RecentChanges';

// ---------------------------------------------------------------------------
// Server Component — fetches initial data
// ---------------------------------------------------------------------------

export default async function DashboardPage() {
  // In production: fetch from API with RSC server fetch
  // const metricsRes = await fetch(`${API_URL}/api/dashboard/metrics`, { cache: 'no-store' });
  const metrics = getMockMetrics();
  const countries = getMockCountryRisk();
  const recentChanges = getMockRecentChanges();

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">Dashboard Global</h1>
        <p className="text-sm text-gray-500 mt-1">
          Monitoreo regulatorio en tiempo real para todos los clientes
        </p>
      </div>

      {/* KPI Cards */}
      <GlobalMetrics data={metrics} />

      {/* Map + Feed */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2">
          <GlobalMap countries={countries} />
        </div>
        <div className="xl:col-span-1 min-h-[500px]">
          <RecentChanges initialChanges={recentChanges} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mock data — replaced by API calls in production
// ---------------------------------------------------------------------------

function getMockMetrics(): GlobalMetricsData {
  return {
    activeClients: 24,
    alertsOpen: { total: 18, high: 3, medium: 8, low: 7 },
    regulatoryChanges7d: 42,
    deadlines30d: 15,
    alertsTrend: 12,
    changesTrend: -5,
  };
}

function getMockCountryRisk(): CountryRiskData[] {
  return [
    {
      code: 'US',
      riskScore: 45,
      activeClients: 8,
      openAlerts: 5,
      nextDeadline: '2026-04-15',
      recentChanges: [
        { id: 'rc-1', title: 'SEC Rule 10b-5 Amendment — Enhanced Derivatives Disclosure', impactLevel: 'HIGH', publishedDate: '2026-03-12' },
        { id: 'rc-2', title: 'Form 941 — Updated Quarterly Employment Tax', impactLevel: 'LOW', publishedDate: '2026-03-10' },
      ],
    },
    {
      code: 'AR',
      riskScore: 72,
      activeClients: 5,
      openAlerts: 4,
      nextDeadline: '2026-04-13',
      recentChanges: [
        { id: 'rc-3', title: 'AFIP RG 5616 — Nuevo régimen de retenciones IVA', impactLevel: 'HIGH', publishedDate: '2026-03-14' },
        { id: 'rc-4', title: 'CNV Resolución 1002 — Modificación régimen informativo', impactLevel: 'MEDIUM', publishedDate: '2026-03-11' },
      ],
    },
    {
      code: 'BR',
      riskScore: 58,
      activeClients: 6,
      openAlerts: 3,
      nextDeadline: '2026-04-07',
      recentChanges: [
        { id: 'rc-5', title: 'Receita Federal — Alteração DCTF simplificada', impactLevel: 'MEDIUM', publishedDate: '2026-03-13' },
      ],
    },
    {
      code: 'MX',
      riskScore: 35,
      activeClients: 4,
      openAlerts: 2,
      nextDeadline: '2026-04-17',
      recentChanges: [
        { id: 'rc-6', title: 'SAT — Actualización factura electrónica CFDI 4.0', impactLevel: 'MEDIUM', publishedDate: '2026-03-09' },
      ],
    },
    {
      code: 'ES',
      riskScore: 28,
      activeClients: 3,
      openAlerts: 1,
      nextDeadline: '2026-04-20',
      recentChanges: [
        { id: 'rc-7', title: 'BOE — Corrección modelo 303 IVA trimestral', impactLevel: 'LOW', publishedDate: '2026-03-08' },
      ],
    },
    {
      code: 'CL',
      riskScore: 22,
      activeClients: 2,
      openAlerts: 0,
      nextDeadline: '2026-05-01',
      recentChanges: [],
    },
  ];
}

function getMockRecentChanges(): ChangeItem[] {
  return [
    {
      id: 'fc-1',
      title: 'AFIP RG 5616 — Nuevo régimen de retenciones IVA para operaciones digitales',
      country: 'AR',
      impactLevel: 'HIGH',
      source: 'AFIP',
      publishedDate: '2026-03-14T14:30:00Z',
      affectedAreas: ['fiscal', 'digital'],
    },
    {
      id: 'fc-2',
      title: 'SEC Rule 10b-5 Amendment — Enhanced Derivatives Disclosure Requirements',
      country: 'US',
      impactLevel: 'HIGH',
      source: 'SEC_EDGAR',
      publishedDate: '2026-03-12T18:00:00Z',
      affectedAreas: ['securities', 'derivatives'],
    },
    {
      id: 'fc-3',
      title: 'Receita Federal — Alteração na DCTF para empresas do Simples Nacional',
      country: 'BR',
      impactLevel: 'MEDIUM',
      source: 'RECEITA_FEDERAL',
      publishedDate: '2026-03-13T12:00:00Z',
      affectedAreas: ['fiscal'],
    },
    {
      id: 'fc-4',
      title: 'CNV Resolución 1002 — Modificación del régimen informativo para fondos comunes',
      country: 'AR',
      impactLevel: 'MEDIUM',
      source: 'CNV',
      publishedDate: '2026-03-11T10:00:00Z',
      affectedAreas: ['securities', 'funds'],
    },
    {
      id: 'fc-5',
      title: 'SAT — Actualización de la factura electrónica CFDI 4.0 campo receptor',
      country: 'MX',
      impactLevel: 'MEDIUM',
      source: 'DOF_MEXICO',
      publishedDate: '2026-03-09T08:00:00Z',
      affectedAreas: ['fiscal', 'digital'],
    },
    {
      id: 'fc-6',
      title: 'BOE — Corrección de erratas en el modelo 303 de IVA trimestral',
      country: 'ES',
      impactLevel: 'LOW',
      source: 'BOE_SPAIN',
      publishedDate: '2026-03-08T09:00:00Z',
      affectedAreas: ['fiscal'],
    },
    {
      id: 'fc-7',
      title: 'Form 941 — Updated Instructions for Quarterly Employment Tax Return',
      country: 'US',
      impactLevel: 'LOW',
      source: 'SEC_EDGAR',
      publishedDate: '2026-03-10T15:00:00Z',
      affectedAreas: ['labor', 'fiscal'],
    },
  ];
}
