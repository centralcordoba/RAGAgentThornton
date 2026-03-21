// ============================================================================
// FILE: apps/web/components/calendar/ListView.tsx
// List view grouped by urgency bands: overdue, 7 days, this month, 90 days.
// Supports filtering by urgency band via activeFilter prop.
// Inline [Marcar completado] and [Asignar] buttons.
// ============================================================================

'use client';

import { useMemo, useState } from 'react';
import { CountryFlag } from '../ui/CountryFlag';
import type { CalendarEvent } from './CalendarPage';
import type { UrgencyFilter } from './CalendarSummaryBar';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Props {
  readonly events: readonly CalendarEvent[];
  readonly onEventClick: (event: CalendarEvent) => void;
  readonly onStatusChange: (eventId: string, status: string) => void;
  readonly onAssign: (eventId: string, assignedTo: string) => void;
  readonly activeFilter: UrgencyFilter;
}

const TYPE_EMOJI: Record<string, string> = {
  DEADLINE: '🔴',
  FILING: '🟠',
  AUDIT: '🟣',
  RENEWAL: '🔵',
  REGULATORY_CHANGE: '🟡',
  REVIEW: '⚪',
};

interface UrgencyBand {
  readonly id: UrgencyFilter;
  readonly icon: string;
  readonly label: string;
  readonly events: CalendarEvent[];
  readonly headerColor: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ListView({ events, onEventClick, onStatusChange, onAssign, activeFilter }: Props) {
  const bands = useMemo(() => {
    const overdue: CalendarEvent[] = [];
    const week: CalendarEvent[] = [];
    const month: CalendarEvent[] = [];
    const quarter: CalendarEvent[] = [];

    const sorted = [...events]
      .filter((e) => e.status !== 'COMPLETED')
      .sort((a, b) => a.daysUntil - b.daysUntil);

    for (const e of sorted) {
      if (e.daysUntil < 0 || e.status === 'OVERDUE') overdue.push(e);
      else if (e.daysUntil <= 7) week.push(e);
      else if (e.daysUntil <= 30) month.push(e);
      else quarter.push(e);
    }

    const all: UrgencyBand[] = [
      { id: 'overdue', icon: '🚨', label: 'VENCIDOS', events: overdue, headerColor: 'bg-red-50 text-red-700 border-red-200' },
      { id: 'week', icon: '⚠️', label: 'PROXIMOS 7 DIAS', events: week, headerColor: 'bg-amber-50 text-amber-700 border-amber-200' },
      { id: 'month', icon: '📅', label: 'ESTE MES', events: month, headerColor: 'bg-blue-50 text-blue-700 border-blue-200' },
      { id: 'quarter', icon: '🗓️', label: 'PROXIMOS 3 MESES', events: quarter, headerColor: 'bg-gray-50 text-gray-600 border-gray-200' },
    ];

    if (activeFilter === 'all') return all;
    return all.filter((b) => b.id === activeFilter);
  }, [events, activeFilter]);

  return (
    <div className="space-y-4">
      {bands.map((band) => (
        <div key={band.id} className="card overflow-hidden">
          {/* Band header */}
          <div className={`px-4 py-2.5 border-b font-medium text-sm flex items-center justify-between ${band.headerColor}`}>
            <span>{band.icon} {band.label} ({band.events.length} eventos)</span>
          </div>

          {band.events.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs text-gray-400">
              Sin eventos en este periodo
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {band.events.map((event) => (
                <EventRow
                  key={event.id}
                  event={event}
                  onEventClick={onEventClick}
                  onStatusChange={onStatusChange}
                  onAssign={onAssign}
                />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Event row with inline actions
// ---------------------------------------------------------------------------

function EventRow({
  event,
  onEventClick,
  onStatusChange,
  onAssign,
}: {
  event: CalendarEvent;
  onEventClick: (e: CalendarEvent) => void;
  onStatusChange: (id: string, status: string) => void;
  onAssign: (id: string, assignedTo: string) => void;
}) {
  const [showAssignInput, setShowAssignInput] = useState(false);
  const [assignValue, setAssignValue] = useState(event.assignedTo ?? '');

  const handleAssignSubmit = () => {
    if (assignValue.trim()) {
      onAssign(event.id, assignValue.trim());
      setShowAssignInput(false);
    }
  };

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors cursor-pointer"
      onClick={() => onEventClick(event)}
    >
      {/* Type emoji */}
      <span className="text-base flex-shrink-0">
        {TYPE_EMOJI[event.type] ?? '📌'}
      </span>

      {/* Date */}
      <div className="w-16 flex-shrink-0 text-center">
        <p className="text-xs font-bold text-gray-900">
          {formatShortDate(event.date)}
        </p>
        <p className={`text-[10px] font-medium ${
          event.daysUntil < 0 ? 'text-red-500' :
          event.daysUntil <= 7 ? 'text-amber-600' : 'text-gray-400'
        }`}>
          {event.daysUntil < 0 ? `${Math.abs(event.daysUntil)}d atras` :
           event.daysUntil === 0 ? 'Hoy' :
           `${event.daysUntil}d`}
        </p>
      </div>

      {/* Title + client */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{event.title}</p>
        <p className="text-xs text-gray-500 truncate">
          {event.client.name} — {event.regulatoryArea}
        </p>
        {event.previousDate && (
          <p className="text-[10px] text-amber-600 mt-0.5">
            Deadline adelantado desde <span className="line-through">{event.previousDate}</span>
            {event.updateReason && ` — ${event.updateReason}`}
          </p>
        )}
      </div>

      {/* Country */}
      <div className="flex-shrink-0">
        <CountryFlag code={event.country} size="sm" />
      </div>

      {/* Assigned / Assign button */}
      <div className="flex-shrink-0" onClick={(e) => e.stopPropagation()}>
        {showAssignInput ? (
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={assignValue}
              onChange={(e) => setAssignValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAssignSubmit()}
              className="text-[10px] border border-gray-300 rounded px-1.5 py-0.5 w-24 focus:outline-none focus:ring-1 focus:ring-brand-500"
              placeholder="Nombre..."
              autoFocus
            />
            <button
              onClick={handleAssignSubmit}
              className="text-[10px] text-green-600 hover:text-green-700 font-medium"
            >
              Ok
            </button>
            <button
              onClick={() => setShowAssignInput(false)}
              className="text-[10px] text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          </div>
        ) : event.assignedTo ? (
          <button
            onClick={() => setShowAssignInput(true)}
            className="text-[10px] bg-brand-50 text-brand-700 px-2 py-0.5 rounded-full hover:bg-brand-100 transition-colors"
            title="Cambiar asignacion"
          >
            {event.assignedTo.split(' ')[0]}
          </button>
        ) : (
          <button
            onClick={() => setShowAssignInput(true)}
            className="text-[10px] text-gray-400 hover:text-brand-700 px-2 py-0.5 rounded-full border border-dashed border-gray-300 hover:border-brand-500 transition-colors"
          >
            Asignar
          </button>
        )}
      </div>

      {/* Mark complete */}
      {event.status !== 'COMPLETED' && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onStatusChange(event.id, 'COMPLETED');
          }}
          className="text-xs text-green-600 hover:text-green-700 flex-shrink-0 px-2 py-1 rounded hover:bg-green-50"
          title="Marcar completado"
        >
          ✓
        </button>
      )}
    </div>
  );
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('es', { day: 'numeric', month: 'short' });
}
