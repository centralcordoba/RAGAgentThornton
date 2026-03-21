// ============================================================================
// FILE: apps/web/components/impact/ImpactTimeline.tsx
// Line chart: regulatory change volume over time by country.
// Uses Recharts for the chart. Hover → tooltip with day's changes.
// ============================================================================

'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TimelinePoint {
  readonly date: string;
  readonly country: string;
  readonly changeCount: number;
  readonly highCount: number;
  readonly mediumCount: number;
  readonly lowCount: number;
}

const COUNTRY_COLORS: Record<string, string> = {
  US: '#4F2D7F',
  EU: '#008D8F',
  ES: '#f59e0b',
  MX: '#10b981',
  AR: '#3b82f6',
  BR: '#ef4444',
};

const AREAS = ['Todos', 'Financiero', 'Datos/GDPR', 'Laboral', 'Ambiental', 'Fiscal'] as const;
const API_BASE = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3000';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ImpactTimeline() {
  const [rawData, setRawData] = useState<TimelinePoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedArea, setSelectedArea] = useState('Todos');
  const [selectedCountries, setSelectedCountries] = useState<Set<string>>(
    new Set(['US', 'EU', 'ES', 'MX', 'AR', 'BR']),
  );

  useEffect(() => {
    const fetchData = async () => {
      try {
        const token = sessionStorage.getItem('auth_token');
        const res = await fetch(`${API_BASE}/api/impact/timeline?days=90`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (res.ok) {
          const json = await res.json();
          setRawData(json.data ?? []);
        }
      } catch {
        // Empty on error
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // Pivot data: group by date, one column per country
  const chartData = useMemo(() => {
    const dateMap = new Map<string, Record<string, string | number>>();

    for (const point of rawData) {
      if (!selectedCountries.has(point.country)) continue;
      const existing = dateMap.get(point.date) ?? { date: point.date } as Record<string, string | number>;
      existing[point.country] = ((existing[point.country] as number) ?? 0) + point.changeCount;
      dateMap.set(point.date, existing);
    }

    return Array.from(dateMap.values()).sort(
      (a, b) => String(a['date']).localeCompare(String(b['date'])),
    );
  }, [rawData, selectedCountries]);

  const toggleCountry = (country: string) => {
    setSelectedCountries((prev) => {
      const next = new Set(prev);
      if (next.has(country)) {
        if (next.size > 1) next.delete(country);
      } else {
        next.add(country);
      }
      return next;
    });
  };

  if (loading) {
    return (
      <div className="card card-body flex items-center justify-center h-64">
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Cargando timeline...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="card card-body">
        <div className="flex items-center justify-between flex-wrap gap-3">
          {/* Area filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-500">Área:</span>
            {AREAS.map((area) => (
              <button
                key={area}
                onClick={() => setSelectedArea(area)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  selectedArea === area
                    ? 'bg-brand-700 text-white border-brand-700'
                    : 'border-gray-200 text-gray-500 hover:border-brand-700'
                }`}
              >
                {area}
              </button>
            ))}
          </div>

          {/* Country toggles */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-500">Países:</span>
            {Object.entries(COUNTRY_COLORS).map(([code, color]) => (
              <button
                key={code}
                onClick={() => toggleCountry(code)}
                className={`text-xs px-2 py-1 rounded-full border transition-all ${
                  selectedCountries.has(code)
                    ? 'font-medium text-white'
                    : 'border-gray-200 text-gray-400'
                }`}
                style={
                  selectedCountries.has(code)
                    ? { backgroundColor: color, borderColor: color }
                    : undefined
                }
              >
                {code}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="card card-body">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">
          Volumen de cambios regulatorios
        </h3>
        <ResponsiveContainer width="100%" height={380}>
          <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              tickFormatter={(v: string) => {
                const d = new Date(v);
                return `${d.getDate()}/${d.getMonth() + 1}`;
              }}
              interval="preserveStartEnd"
            />
            <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} />
            <Tooltip
              contentStyle={{
                fontSize: 12,
                borderRadius: 8,
                border: '1px solid #e5e7eb',
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
              }}
              labelFormatter={(v: string) => {
                const d = new Date(v);
                return d.toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' });
              }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {Object.entries(COUNTRY_COLORS)
              .filter(([code]) => selectedCountries.has(code))
              .map(([code, color]) => (
                <Line
                  key={code}
                  type="monotone"
                  dataKey={code}
                  name={code}
                  stroke={color}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2 }}
                />
              ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
