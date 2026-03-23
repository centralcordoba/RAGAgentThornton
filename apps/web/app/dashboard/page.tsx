// ============================================================================
// FILE: apps/web/app/dashboard/page.tsx
// Global Dashboard — fetches real data from API.
// ============================================================================

import { GlobalMetrics } from '@/components/dashboard/GlobalMetrics';
import type { GlobalMetricsData } from '@/components/dashboard/GlobalMetrics';
import { GlobalMap } from '@/components/dashboard/GlobalMap';
import type { CountryRiskData } from '@/components/dashboard/GlobalMap';
import { WorldRiskMap } from '@/components/map/WorldRiskMap';
import { RecentChanges } from '@/components/dashboard/RecentChanges';
import type { ChangeItem } from '@/components/dashboard/RecentChanges';

// ---------------------------------------------------------------------------
// API helpers (server component — fetches directly)
// ---------------------------------------------------------------------------

const API_BASE = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3000';
const DEV_TOKEN = process.env['NEXT_PUBLIC_DEV_TOKEN'] ?? null;

function authHeaders(): Record<string, string> {
  return DEV_TOKEN ? { Authorization: `Bearer ${DEV_TOKEN}` } : {};
}

async function fetchMetrics(): Promise<GlobalMetricsData> {
  try {
    // Fetch counts from multiple endpoints
    const [clientsRes, alertsRes, regulationsRes] = await Promise.all([
      fetch(`${API_BASE}/api/clients?pageSize=1`, { cache: 'no-store', headers: authHeaders() }).catch(() => null),
      fetch(`${API_BASE}/api/alerts?pageSize=1`, { cache: 'no-store', headers: authHeaders() }).catch(() => null),
      fetch(`${API_BASE}/api/regulations?pageSize=1`, { cache: 'no-store', headers: authHeaders() }).catch(() => null),
    ]);

    const clients = clientsRes?.ok ? await clientsRes.json() : { total: 0 };
    const alerts = alertsRes?.ok ? await alertsRes.json() : { total: 0, data: [] };
    const regulations = regulationsRes?.ok ? await regulationsRes.json() : { total: 0 };

    const alertData = (alerts.data ?? []) as Record<string, unknown>[];
    const highAlerts = alertData.filter((a) => a['impactLevel'] === 'HIGH').length;
    const medAlerts = alertData.filter((a) => a['impactLevel'] === 'MEDIUM').length;

    return {
      activeClients: clients.total ?? 0,
      alertsOpen: {
        total: alerts.total ?? 0,
        high: highAlerts,
        medium: medAlerts,
        low: (alerts.total ?? 0) - highAlerts - medAlerts,
      },
      regulatoryChanges7d: regulations.total ?? 0,
      deadlines30d: 0,
      alertsTrend: 0,
      changesTrend: 0,
    };
  } catch {
    return {
      activeClients: 0,
      alertsOpen: { total: 0, high: 0, medium: 0, low: 0 },
      regulatoryChanges7d: 0,
      deadlines30d: 0,
      alertsTrend: 0,
      changesTrend: 0,
    };
  }
}

async function fetchCountryRisk(): Promise<CountryRiskData[]> {
  try {
    const res = await fetch(`${API_BASE}/api/regulations?pageSize=50`, { cache: 'no-store', headers: authHeaders() });
    if (!res.ok) return [];

    const body = await res.json();
    const regulations = (body.data ?? []) as Record<string, unknown>[];

    // Group by country
    const byCountry = new Map<string, Record<string, unknown>[]>();
    for (const reg of regulations) {
      const country = (reg['country'] as string) ?? 'UNKNOWN';
      if (!byCountry.has(country)) byCountry.set(country, []);
      byCountry.get(country)!.push(reg);
    }

    return Array.from(byCountry.entries()).map(([code, regs]) => {
      const highCount = regs.filter((r) => r['impactLevel'] === 'HIGH').length;
      return {
        code,
        riskScore: Math.min(100, highCount * 25 + regs.length * 5),
        activeClients: 0,
        openAlerts: 0,
        nextDeadline: '',
        recentChanges: regs.slice(0, 3).map((r) => ({
          id: r['id'] as string,
          title: r['title'] as string,
          impactLevel: r['impactLevel'] as string,
          publishedDate: ((r['publishedDate'] as string) ?? '').split('T')[0] ?? '',
        })),
      };
    });
  } catch {
    return [];
  }
}

async function fetchRecentChanges(): Promise<ChangeItem[]> {
  try {
    const res = await fetch(`${API_BASE}/api/regulations?pageSize=10`, { cache: 'no-store', headers: authHeaders() });
    if (!res.ok) return [];

    const body = await res.json();
    return ((body.data ?? []) as Record<string, unknown>[]).map((r) => ({
      id: r['id'] as string,
      title: r['title'] as string,
      country: r['country'] as string,
      impactLevel: r['impactLevel'] as string,
      source: (r['sourceUrl'] as string)?.includes('sec.gov') ? 'SEC_EDGAR'
        : (r['sourceUrl'] as string)?.includes('eur-lex') ? 'EUR_LEX'
        : (r['sourceUrl'] as string)?.includes('boe.es') ? 'BOE_SPAIN'
        : 'UNKNOWN',
      publishedDate: (r['publishedDate'] as string) ?? '',
      affectedAreas: (r['affectedAreas'] as string[]) ?? [],
    }));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Server Component
// ---------------------------------------------------------------------------

export default async function DashboardPage() {
  const [metrics, countries, recentChanges] = await Promise.all([
    fetchMetrics(),
    fetchCountryRisk(),
    fetchRecentChanges(),
  ]);

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

      {/* Compact Risk Map */}
      <WorldRiskMap compact height={300} />

      {/* Detailed Map + Feed */}
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
