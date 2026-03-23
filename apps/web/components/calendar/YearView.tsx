// ============================================================================
// FILE: apps/web/components/calendar/YearView.tsx
// 12-month grid overview. Each month shows a mini calendar with event dots.
// Click a day to see its events. Color intensity = event count.
// ============================================================================

'use client';

import { useState, useMemo } from 'react';
import type { CalendarEvent } from './CalendarPage';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Props {
  readonly events: readonly CalendarEvent[];
  readonly onEventClick: (event: CalendarEvent) => void;
}

const STATUS_COLORS: Record<string, string> = {
  OVERDUE: '#ef4444',
  PENDING: '#f59e0b',
  IN_PROGRESS: '#3b82f6',
  COMPLETED: '#22c55e',
};

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const DAY_HEADERS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function YearView({ events, onEventClick }: Props) {
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  // Group events by date string (YYYY-MM-DD)
  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of events) {
      const date = e.date.split('T')[0]!;
      if (!map.has(date)) map.set(date, []);
      map.get(date)!.push(e);
    }
    return map;
  }, [events]);

  // Events for selected day
  const selectedDayEvents = selectedDay ? (eventsByDate.get(selectedDay) ?? []) : [];

  // Years with data
  const years = useMemo(() => {
    const ys = new Set<number>();
    for (const e of events) ys.add(new Date(e.date).getFullYear());
    ys.add(new Date().getFullYear());
    return Array.from(ys).sort();
  }, [events]);

  return (
    <div className="space-y-4">
      {/* Year selector */}
      <div className="flex items-center justify-center gap-3">
        {years.map((y) => (
          <button
            key={y}
            onClick={() => setSelectedYear(y)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              selectedYear === y
                ? 'bg-brand-700 text-white border-brand-700'
                : 'border-gray-200 text-gray-500 hover:border-brand-700'
            }`}
          >
            {y}
          </button>
        ))}
      </div>

      {/* 12-month grid */}
      <div className="grid grid-cols-3 xl:grid-cols-4 gap-3">
        {Array.from({ length: 12 }, (_, monthIdx) => (
          <MiniMonth
            key={monthIdx}
            year={selectedYear}
            month={monthIdx}
            eventsByDate={eventsByDate}
            selectedDay={selectedDay}
            onDayClick={setSelectedDay}
          />
        ))}
      </div>

      {/* Selected day detail */}
      {selectedDay && selectedDayEvents.length > 0 && (
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-900">
              {new Date(selectedDay + 'T00:00:00').toLocaleDateString('es', {
                weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
              })}
            </h3>
            <button
              onClick={() => setSelectedDay(null)}
              className="text-gray-400 hover:text-gray-600 text-sm"
            >
              Cerrar
            </button>
          </div>
          <div className="space-y-2">
            {selectedDayEvents.map((e) => (
              <button
                key={e.id}
                onClick={() => onEventClick(e)}
                className="w-full text-left p-3 rounded-lg border border-gray-100 hover:border-brand-300 hover:bg-brand-50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: STATUS_COLORS[e.status] ?? '#9ca3af' }}
                  />
                  <span className="text-sm font-medium text-gray-900 truncate">{e.title}</span>
                </div>
                <div className="flex items-center gap-3 mt-1 text-[11px] text-gray-500">
                  <span>{e.client.name}</span>
                  <span>{e.country}</span>
                  <span className={
                    e.status === 'OVERDUE' ? 'text-red-600 font-semibold' :
                    e.status === 'COMPLETED' ? 'text-green-600' : ''
                  }>{e.status}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {selectedDay && selectedDayEvents.length === 0 && (
        <div className="card p-4 text-center text-sm text-gray-400">
          Sin eventos para {selectedDay}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MiniMonth — single month mini calendar
// ---------------------------------------------------------------------------

function MiniMonth({
  year,
  month,
  eventsByDate,
  selectedDay,
  onDayClick,
}: {
  year: number;
  month: number;
  eventsByDate: Map<string, CalendarEvent[]>;
  selectedDay: string | null;
  onDayClick: (day: string) => void;
}) {
  const today = new Date().toISOString().split('T')[0]!;

  // Build calendar grid
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDow = (firstDay.getDay() + 6) % 7; // Monday = 0
  const daysInMonth = lastDay.getDate();

  const cells: (number | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  // Count events in this month
  let monthEventCount = 0;
  let monthOverdueCount = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dayEvents = eventsByDate.get(dateStr);
    if (dayEvents) {
      monthEventCount += dayEvents.length;
      monthOverdueCount += dayEvents.filter((e) => e.status === 'OVERDUE').length;
    }
  }

  return (
    <div className={`card p-3 ${monthEventCount > 0 ? '' : 'opacity-50'}`}>
      {/* Month header */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-gray-700">{MONTH_NAMES[month]}</span>
        {monthEventCount > 0 && (
          <div className="flex items-center gap-1">
            {monthOverdueCount > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold">
                {monthOverdueCount}
              </span>
            )}
            <span className="text-[10px] text-gray-400">{monthEventCount} ev.</span>
          </div>
        )}
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 gap-0">
        {DAY_HEADERS.map((d) => (
          <div key={d} className="text-center text-[9px] text-gray-400 font-medium pb-1">{d}</div>
        ))}

        {/* Day cells */}
        {cells.map((day, i) => {
          if (day === null) return <div key={`empty-${i}`} className="h-6" />;

          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const dayEvents = eventsByDate.get(dateStr);
          const count = dayEvents?.length ?? 0;
          const hasOverdue = dayEvents?.some((e) => e.status === 'OVERDUE') ?? false;
          const isToday = dateStr === today;
          const isSelected = dateStr === selectedDay;

          return (
            <button
              key={dateStr}
              onClick={() => onDayClick(dateStr)}
              className={`relative h-6 w-full rounded text-[10px] transition-all ${
                isSelected ? 'bg-brand-700 text-white font-bold' :
                isToday ? 'bg-brand-100 text-brand-800 font-bold ring-1 ring-brand-400' :
                count > 0 ? 'hover:bg-gray-100 font-medium text-gray-800' :
                'text-gray-400'
              }`}
            >
              {day}
              {count > 0 && !isSelected && (
                <span
                  className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full"
                  style={{ backgroundColor: hasOverdue ? '#ef4444' : '#f59e0b' }}
                />
              )}
              {count > 1 && !isSelected && (
                <span
                  className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full text-white text-[7px] font-bold flex items-center justify-center"
                  style={{ backgroundColor: hasOverdue ? '#ef4444' : '#f59e0b' }}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
