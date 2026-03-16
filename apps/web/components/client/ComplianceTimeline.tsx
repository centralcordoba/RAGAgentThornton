// ============================================================================
// FILE: apps/web/components/client/ComplianceTimeline.tsx
// 12-month timeline using Recharts — deadlines + regulatory changes.
// ============================================================================

'use client';

import { useState, useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  Legend,
} from 'recharts';
import { CountryFlag } from '../ui/CountryFlag';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TimelineEvent {
  readonly id: string;
  readonly title: string;
  readonly date: string;
  readonly type: 'deadline' | 'change';
  readonly urgency: 'CRITICAL' | 'IMPORTANT' | 'NORMAL';
  readonly country: string;
  readonly area: string;
}

interface ComplianceTimelineProps {
  readonly events: readonly TimelineEvent[];
  readonly countries: readonly string[];
}

interface MonthBucket {
  readonly month: string;
  readonly label: string;
  readonly critical: number;
  readonly important: number;
  readonly normal: number;
  readonly events: readonly TimelineEvent[];
}

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------

const URGENCY_COLORS = {
  CRITICAL: '#dc2626',
  IMPORTANT: '#f59e0b',
  NORMAL: '#10b981',
} as const;

// ---------------------------------------------------------------------------
// ComplianceTimeline
// ---------------------------------------------------------------------------

export function ComplianceTimeline({ events, countries }: ComplianceTimelineProps) {
  const [countryFilter, setCountryFilter] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<MonthBucket | null>(null);

  const filteredEvents = useMemo(() => {
    if (!countryFilter) return events;
    return events.filter((e) => e.country === countryFilter);
  }, [events, countryFilter]);

  // Bucket events by month
  const monthData = useMemo(() => {
    const buckets = new Map<string, MonthBucket>();
    const now = new Date();

    // Create empty buckets for the next 12 months
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('es', { month: 'short', year: '2-digit' });
      buckets.set(key, { month: key, label, critical: 0, important: 0, normal: 0, events: [] });
    }

    // Fill buckets
    for (const event of filteredEvents) {
      const eventDate = new Date(event.date);
      const key = `${eventDate.getFullYear()}-${String(eventDate.getMonth() + 1).padStart(2, '0')}`;
      const bucket = buckets.get(key);
      if (!bucket) continue;

      const mutableEvents = [...bucket.events, event];
      const updated: MonthBucket = {
        ...bucket,
        critical: bucket.critical + (event.urgency === 'CRITICAL' ? 1 : 0),
        important: bucket.important + (event.urgency === 'IMPORTANT' ? 1 : 0),
        normal: bucket.normal + (event.urgency === 'NORMAL' ? 1 : 0),
        events: mutableEvents,
      };
      buckets.set(key, updated);
    }

    return Array.from(buckets.values());
  }, [filteredEvents]);

  return (
    <div className="card">
      <div className="card-header flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">Timeline de Compliance</h2>

        {/* Country filter */}
        <div className="flex gap-1">
          <button
            onClick={() => setCountryFilter(null)}
            className={`px-2 py-0.5 text-xs rounded-full border transition-colors ${
              !countryFilter ? 'bg-brand-700 text-white border-brand-700' : 'border-gray-200 text-gray-500'
            }`}
          >
            Todos
          </button>
          {countries.map((code) => (
            <button
              key={code}
              onClick={() => setCountryFilter(countryFilter === code ? null : code)}
              className={`px-2 py-0.5 text-xs rounded-full border transition-colors ${
                countryFilter === code ? 'bg-brand-700 text-white border-brand-700' : 'border-gray-200 text-gray-500'
              }`}
            >
              <CountryFlag code={code} size="sm" />
            </button>
          ))}
        </div>
      </div>

      <div className="card-body">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart
            data={monthData}
            onClick={(data) => {
              if (data?.activePayload?.[0]) {
                const payload = data.activePayload[0].payload as MonthBucket;
                setSelectedMonth(selectedMonth?.month === payload.month ? null : payload);
              }
            }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: '#6b7280' }}
              axisLine={{ stroke: '#e5e7eb' }}
            />
            <YAxis
              tick={{ fontSize: 11, fill: '#6b7280' }}
              axisLine={{ stroke: '#e5e7eb' }}
              allowDecimals={false}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              formatter={(value: string) => (
                <span className="text-xs text-gray-600 capitalize">{value}</span>
              )}
            />
            <Bar dataKey="critical" name="Crítico" stackId="a" fill={URGENCY_COLORS.CRITICAL} radius={[0, 0, 0, 0]} />
            <Bar dataKey="important" name="Importante" stackId="a" fill={URGENCY_COLORS.IMPORTANT} />
            <Bar dataKey="normal" name="Normal" stackId="a" fill={URGENCY_COLORS.NORMAL} radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>

        {/* Month detail panel */}
        {selectedMonth && selectedMonth.events.length > 0 && (
          <div className="mt-4 border-t border-gray-100 pt-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700">
                {selectedMonth.label} — {selectedMonth.events.length} eventos
              </h3>
              <button
                onClick={() => setSelectedMonth(null)}
                className="text-gray-400 hover:text-gray-600 text-xs"
              >
                Cerrar
              </button>
            </div>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {selectedMonth.events.map((event) => (
                <div
                  key={event.id}
                  className="flex items-center gap-3 text-xs py-1.5"
                >
                  <span
                    className="h-2 w-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: URGENCY_COLORS[event.urgency] }}
                  />
                  <CountryFlag code={event.country} size="sm" />
                  <span className="text-gray-500 w-16 flex-shrink-0">
                    {new Date(event.date).toLocaleDateString('es', { day: 'numeric', month: 'short' })}
                  </span>
                  <span className="text-gray-800 truncate">{event.title}</span>
                  <span className="text-gray-400 capitalize flex-shrink-0">{event.area}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Custom tooltip
// ---------------------------------------------------------------------------

function CustomTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: readonly { value: number; name: string; fill: string }[];
  label?: string;
}) {
  if (!active || !payload) return null;

  const total = payload.reduce((sum, p) => sum + p.value, 0);

  return (
    <div className="bg-white border border-gray-200 rounded-md shadow-lg p-3 text-xs">
      <p className="font-semibold text-gray-900 mb-1">{label}</p>
      {payload.map((entry) => (
        entry.value > 0 && (
          <div key={entry.name} className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.fill }} />
            <span className="text-gray-600">{entry.name}: {entry.value}</span>
          </div>
        )
      ))}
      <div className="border-t border-gray-100 mt-1 pt-1 font-semibold text-gray-700">
        Total: {total}
      </div>
    </div>
  );
}
