// ============================================================================
// FILE: apps/web/components/calendar/WeekView.tsx
// Weekly calendar view — 7-day grid showing events per day.
// ============================================================================

'use client';

import { useState, useMemo } from 'react';
import { CountryFlag } from '../ui/CountryFlag';
import type { CalendarEvent } from './CalendarPage';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Props {
  readonly events: readonly CalendarEvent[];
  readonly onEventClick: (event: CalendarEvent) => void;
}

const TYPE_EMOJI: Record<string, string> = {
  DEADLINE: '🔴',
  FILING: '🟠',
  AUDIT: '🟣',
  RENEWAL: '🔵',
  REGULATORY_CHANGE: '🟡',
  REVIEW: '⚪',
};

const STATUS_COLORS: Record<string, string> = {
  OVERDUE: 'border-l-red-500 bg-red-50',
  PENDING: 'border-l-amber-400 bg-white',
  IN_PROGRESS: 'border-l-blue-500 bg-blue-50',
  COMPLETED: 'border-l-green-500 bg-green-50 opacity-60',
};

const DAY_NAMES = ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom'];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WeekView({ events, onEventClick }: Props) {
  const [weekOffset, setWeekOffset] = useState(0);

  const { days, weekLabel } = useMemo(() => {
    const now = new Date();
    const dayOfWeek = now.getDay();
    // Monday-based week start
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7) + weekOffset * 7);

    const weekDays: { date: Date; dateStr: string; isToday: boolean }[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const dateStr = d.toISOString().split('T')[0]!;
      const todayStr = now.toISOString().split('T')[0]!;
      weekDays.push({ date: d, dateStr, isToday: dateStr === todayStr });
    }

    const from = weekDays[0]!.date;
    const to = weekDays[6]!.date;
    const label = `${from.toLocaleDateString('es', { day: 'numeric', month: 'short' })} — ${to.toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })}`;

    return { days: weekDays, weekLabel: label };
  }, [weekOffset]);

  // Group events by date
  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of events) {
      const dateStr = e.date.split('T')[0]!;
      const existing = map.get(dateStr) ?? [];
      existing.push(e);
      map.set(dateStr, existing);
    }
    return map;
  }, [events]);

  return (
    <div className="card overflow-hidden">
      {/* Navigation */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <button
          onClick={() => setWeekOffset((p) => p - 1)}
          className="text-xs text-gray-500 hover:text-brand-700 px-2 py-1 rounded hover:bg-gray-100"
        >
          ← Anterior
        </button>
        <div className="text-center">
          <p className="text-sm font-semibold text-gray-900">{weekLabel}</p>
          {weekOffset !== 0 && (
            <button
              onClick={() => setWeekOffset(0)}
              className="text-[10px] text-brand-700 hover:underline mt-0.5"
            >
              Ir a esta semana
            </button>
          )}
        </div>
        <button
          onClick={() => setWeekOffset((p) => p + 1)}
          className="text-xs text-gray-500 hover:text-brand-700 px-2 py-1 rounded hover:bg-gray-100"
        >
          Siguiente →
        </button>
      </div>

      {/* Week grid */}
      <div className="grid grid-cols-7 divide-x divide-gray-100">
        {days.map((day, idx) => {
          const dayEvents = eventsByDate.get(day.dateStr) ?? [];

          return (
            <div
              key={day.dateStr}
              className={`min-h-[200px] ${day.isToday ? 'bg-brand-50/30' : ''}`}
            >
              {/* Day header */}
              <div className={`px-2 py-2 border-b border-gray-100 text-center ${
                day.isToday ? 'bg-brand-700 text-white' : 'bg-gray-50'
              }`}>
                <p className={`text-[10px] font-medium ${day.isToday ? 'text-brand-200' : 'text-gray-400'}`}>
                  {DAY_NAMES[idx]}
                </p>
                <p className={`text-sm font-bold ${day.isToday ? 'text-white' : 'text-gray-900'}`}>
                  {day.date.getDate()}
                </p>
              </div>

              {/* Events */}
              <div className="p-1.5 space-y-1">
                {dayEvents.map((event) => {
                  const statusClass = STATUS_COLORS[event.status] ?? STATUS_COLORS['PENDING']!;
                  return (
                    <button
                      key={event.id}
                      onClick={() => onEventClick(event)}
                      className={`w-full text-left rounded border-l-3 p-1.5 text-[10px] leading-tight hover:shadow-sm transition-shadow cursor-pointer ${statusClass}`}
                      style={{ borderLeftWidth: '3px' }}
                    >
                      <p className="font-medium text-gray-900 truncate">
                        {TYPE_EMOJI[event.type] ?? ''} {event.title}
                      </p>
                      <div className="flex items-center gap-1 mt-0.5">
                        <CountryFlag code={event.country} size="xs" />
                        <span className="text-gray-500 truncate">{event.client.name}</span>
                      </div>
                    </button>
                  );
                })}
                {dayEvents.length === 0 && (
                  <p className="text-[10px] text-gray-300 text-center py-4">—</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
