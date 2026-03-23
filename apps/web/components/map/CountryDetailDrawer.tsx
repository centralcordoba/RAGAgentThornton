// ============================================================================
// FILE: apps/web/components/map/CountryDetailDrawer.tsx
// Country detail drawer — 4 tabs: Resumen, Alertas, Deadlines, Cambios.
// Opens when clicking a country on the risk map.
// ============================================================================

'use client';

import { useState, useEffect } from 'react';
import { CountryFlag, getCountryName } from '../ui/CountryFlag';
import { SeverityGauge } from '../impact/SeverityGauge';
import type { CountryRiskData } from './WorldRiskMap';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Props {
  readonly country: CountryRiskData;
  readonly onClose: () => void;
}

interface CountryDetail {
  readonly recentAlerts: readonly AlertItem[];
  readonly upcomingDeadlines: readonly DeadlineItem[];
  readonly recentChanges: readonly ChangeItem[];
  readonly clients: readonly { id: string; name: string }[];
}

interface AlertItem {
  readonly id: string;
  readonly message: string;
  readonly impactLevel: string;
  readonly status: string;
  readonly createdAt: string;
}

interface DeadlineItem {
  readonly id: string;
  readonly title: string;
  readonly date: string;
  readonly daysUntil: number;
  readonly type: string;
  readonly client: { id: string; name: string };
  readonly status: string;
}

interface ChangeItem {
  readonly id: string;
  readonly title: string;
  readonly effectiveDate: string;
  readonly impactLevel: string;
  readonly area: string;
}

type TabId = 'summary' | 'alerts' | 'deadlines' | 'changes';

const API_BASE = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3000';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CountryDetailDrawer({ country, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>('summary');
  const [detail, setDetail] = useState<CountryDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDetail = async () => {
      try {
        const token = sessionStorage.getItem('auth_token') ?? process.env['NEXT_PUBLIC_DEV_TOKEN'] ?? null;
        const res = await fetch(`${API_BASE}/api/map/country/${country.code}/detail`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (res.ok) {
          setDetail(await res.json());
        }
      } catch {
        // Keep null
      } finally {
        setLoading(false);
      }
    };
    fetchDetail();
  }, [country.code]);

  const TABS: { id: TabId; label: string }[] = [
    { id: 'summary', label: 'Resumen' },
    { id: 'alerts', label: 'Alertas' },
    { id: 'deadlines', label: 'Deadlines' },
    { id: 'changes', label: 'Cambios' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

      <div className="relative w-[480px] bg-white shadow-2xl flex flex-col h-full">
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-200 bg-brand-700 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CountryFlag code={country.code} size="lg" />
              <div>
                <h3 className="text-sm font-semibold">{country.name}</h3>
                <p className="text-xs text-brand-200 mt-0.5">
                  Risk Score: {country.score}/100 — {country.level}
                </p>
              </div>
            </div>
            <button onClick={onClose} className="text-brand-200 hover:text-white">✕</button>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-gray-200">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 px-4 py-2.5 text-xs font-medium transition-colors ${
                activeTab === tab.id
                  ? 'text-brand-700 border-b-2 border-brand-700'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-48">
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Cargando...
              </div>
            </div>
          ) : (
            <>
              {activeTab === 'summary' && <SummaryTab country={country} detail={detail} />}
              {activeTab === 'alerts' && <AlertsTab alerts={detail?.recentAlerts ?? []} />}
              {activeTab === 'deadlines' && <DeadlinesTab deadlines={detail?.upcomingDeadlines ?? []} />}
              {activeTab === 'changes' && <ChangesTab changes={detail?.recentChanges ?? []} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Summary
// ---------------------------------------------------------------------------

function SummaryTab({ country, detail }: { country: CountryRiskData; detail: CountryDetail | null }) {
  return (
    <div className="p-5 space-y-5">
      {/* Gauge + KPIs */}
      <div className="flex items-center justify-around">
        <SeverityGauge score={country.score} size={110} />
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="Alertas HIGH" value={country.alertsHigh} color="text-red-600 bg-red-50" />
          <StatCard label="Alertas MEDIUM" value={country.alertsMedium} color="text-amber-600 bg-amber-50" />
          <StatCard label="Deadlines 7d" value={country.deadlines7d} color="text-orange-600 bg-orange-50" />
          <StatCard label="Cambios 30d" value={country.changes30d} color="text-blue-600 bg-blue-50" />
        </div>
      </div>

      {/* Clients */}
      <div>
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
          Clientes activos ({country.clients.length})
        </h4>
        <div className="space-y-2">
          {country.clients.map((client) => (
            <div key={client.id} className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg">
              <span className="h-2 w-2 rounded-full bg-green-400" />
              <span className="text-sm text-gray-900">{client.name}</span>
            </div>
          ))}
          {country.clients.length === 0 && (
            <p className="text-xs text-gray-400">Sin clientes en esta jurisdiccion</p>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className={`px-3 py-2 rounded-lg text-center ${color}`}>
      <p className="text-lg font-bold">{value}</p>
      <p className="text-[10px] font-medium">{label}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Alerts
// ---------------------------------------------------------------------------

function AlertsTab({ alerts }: { alerts: readonly AlertItem[] }) {
  return (
    <div className="p-4 space-y-2">
      {alerts.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-8">Sin alertas activas</p>
      )}
      {alerts.map((alert) => (
        <div key={alert.id} className="p-3 rounded-lg border border-gray-200 bg-white">
          <div className="flex items-center justify-between mb-1">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
              alert.impactLevel === 'HIGH' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
            }`}>
              {alert.impactLevel}
            </span>
            <span className="text-[10px] text-gray-400">
              {new Date(alert.createdAt).toLocaleDateString('es', { day: 'numeric', month: 'short' })}
            </span>
          </div>
          <p className="text-sm text-gray-900">{alert.message}</p>
          <a href="/alerts" className="text-[10px] text-brand-700 hover:underline mt-1 inline-block">
            Ver en alertas →
          </a>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Deadlines
// ---------------------------------------------------------------------------

function DeadlinesTab({ deadlines }: { deadlines: readonly DeadlineItem[] }) {
  return (
    <div className="p-4 space-y-2">
      {deadlines.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-8">Sin deadlines proximos</p>
      )}
      {deadlines.map((dl) => (
        <div key={dl.id} className="p-3 rounded-lg border border-gray-200 bg-white flex items-center gap-3">
          <div className={`h-8 w-1 rounded-full flex-shrink-0 ${
            dl.daysUntil < 0 ? 'bg-red-500' :
            dl.daysUntil <= 7 ? 'bg-amber-500' :
            dl.daysUntil <= 30 ? 'bg-blue-400' : 'bg-gray-300'
          }`} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{dl.title}</p>
            <p className="text-xs text-gray-500">{dl.client.name}</p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-xs font-bold text-gray-900">
              {new Date(dl.date).toLocaleDateString('es', { day: 'numeric', month: 'short' })}
            </p>
            <p className={`text-[10px] font-medium ${
              dl.daysUntil < 0 ? 'text-red-500' :
              dl.daysUntil <= 7 ? 'text-amber-600' : 'text-gray-400'
            }`}>
              {dl.daysUntil < 0 ? `${Math.abs(dl.daysUntil)}d atras` :
               dl.daysUntil === 0 ? 'Hoy' : `${dl.daysUntil}d`}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Changes
// ---------------------------------------------------------------------------

function ChangesTab({ changes }: { changes: readonly ChangeItem[] }) {
  return (
    <div className="p-4 space-y-2">
      {changes.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-8">Sin cambios recientes</p>
      )}
      {changes.map((change) => (
        <div key={change.id} className="p-3 rounded-lg border border-gray-200 bg-white">
          <div className="flex items-center justify-between mb-1">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
              change.impactLevel === 'HIGH' ? 'bg-red-100 text-red-700' :
              change.impactLevel === 'MEDIUM' ? 'bg-amber-100 text-amber-700' :
              'bg-green-100 text-green-700'
            }`}>
              {change.impactLevel}
            </span>
            <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
              {change.area}
            </span>
          </div>
          <p className="text-sm text-gray-900">{change.title}</p>
          <p className="text-[10px] text-gray-400 mt-1">
            Vigencia: {new Date(change.effectiveDate).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
          <a href="/impact" className="text-[10px] text-brand-700 hover:underline mt-1 inline-block">
            Ver en Impact Analyzer →
          </a>
        </div>
      ))}
    </div>
  );
}
