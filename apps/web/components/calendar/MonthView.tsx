// ============================================================================
// FILE: apps/web/components/calendar/MonthView.tsx
// Monthly calendar using @fullcalendar/react with daygrid plugin.
// Hover tooltip shows client, area, days until.
// ============================================================================

'use client';

import { useState, useRef, useEffect } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import type { CalendarEvent } from './CalendarPage';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Props {
  readonly events: readonly CalendarEvent[];
  readonly onEventClick: (event: CalendarEvent) => void;
}

const TYPE_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  DEADLINE:          { bg: '#fef2f2', border: '#dc2626', text: '#991b1b' },
  FILING:            { bg: '#fff7ed', border: '#f97316', text: '#9a3412' },
  AUDIT:             { bg: '#faf5ff', border: '#9333ea', text: '#6b21a8' },
  RENEWAL:           { bg: '#eff6ff', border: '#3b82f6', text: '#1e40af' },
  REGULATORY_CHANGE: { bg: '#fefce8', border: '#eab308', text: '#854d0e' },
  REVIEW:            { bg: '#f9fafb', border: '#9ca3af', text: '#4b5563' },
};

const TYPE_EMOJI: Record<string, string> = {
  DEADLINE: '🔴',
  FILING: '🟠',
  AUDIT: '🟣',
  RENEWAL: '🔵',
  REGULATORY_CHANGE: '🟡',
  REVIEW: '⚪',
};

const COUNTRY_FLAGS: Record<string, string> = {
  US: '🇺🇸', EU: '🇪🇺', ES: '🇪🇸', MX: '🇲🇽', AR: '🇦🇷', BR: '🇧🇷',
};

// ---------------------------------------------------------------------------
// Tooltip
// ---------------------------------------------------------------------------

interface TooltipState {
  readonly visible: boolean;
  readonly x: number;
  readonly y: number;
  readonly event: CalendarEvent | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MonthView({ events, onEventClick }: Props) {
  const [tooltip, setTooltip] = useState<TooltipState>({ visible: false, x: 0, y: 0, event: null });
  const tooltipRef = useRef<HTMLDivElement>(null);
  const calendarRef = useRef<FullCalendar>(null);

  const calendarEvents = events.map((e) => {
    const colors = TYPE_COLORS[e.type] ?? TYPE_COLORS['REVIEW']!;
    const emoji = TYPE_EMOJI[e.type] ?? '';
    const flag = COUNTRY_FLAGS[e.country] ?? '';
    const isOverdue = e.status === 'OVERDUE';

    return {
      id: e.id,
      title: `${emoji} ${e.title} ${flag}`,
      start: e.date,
      allDay: true,
      backgroundColor: isOverdue ? '#fef2f2' : colors.bg,
      borderColor: isOverdue ? '#dc2626' : colors.border,
      textColor: isOverdue ? '#991b1b' : colors.text,
      extendedProps: { originalEvent: e },
    };
  });

  // Close tooltip on scroll
  useEffect(() => {
    const handleScroll = () => setTooltip((t) => ({ ...t, visible: false }));
    window.addEventListener('scroll', handleScroll, true);
    return () => window.removeEventListener('scroll', handleScroll, true);
  }, []);

  // Years with events for quick jump
  const eventYears = Array.from(new Set(events.map((e) => new Date(e.date).getFullYear()))).sort();

  const jumpToYear = (year: number) => {
    const api = calendarRef.current?.getApi();
    if (api) api.gotoDate(new Date(year, 0, 1));
  };

  return (
    <div className="card card-body fullcalendar-container relative">
      {/* Year jump buttons */}
      {eventYears.length > 1 && (
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[11px] text-gray-400">Ir a:</span>
          {eventYears.map((y) => (
            <button
              key={y}
              onClick={() => jumpToYear(y)}
              className="text-[11px] px-2.5 py-1 rounded-full border border-gray-200 text-gray-500 hover:border-brand-700 hover:text-brand-700 transition-colors"
            >
              {y}
            </button>
          ))}
        </div>
      )}
      <FullCalendar
        ref={calendarRef}
        plugins={[dayGridPlugin, interactionPlugin]}
        initialView="dayGridMonth"
        events={calendarEvents}
        locale="es"
        headerToolbar={{
          left: 'prev,next today',
          center: 'title',
          right: '',
        }}
        buttonText={{
          today: 'Hoy',
        }}
        height="auto"
        dayMaxEvents={3}
        moreLinkText={(n) => `+${n} mas`}
        eventClick={(info) => {
          const original = info.event.extendedProps['originalEvent'] as CalendarEvent;
          if (original) onEventClick(original);
        }}
        eventMouseEnter={(info) => {
          const original = info.event.extendedProps['originalEvent'] as CalendarEvent;
          if (!original) return;
          const rect = info.el.getBoundingClientRect();
          setTooltip({
            visible: true,
            x: rect.left + rect.width / 2,
            y: rect.top - 8,
            event: original,
          });
        }}
        eventMouseLeave={() => {
          setTooltip((t) => ({ ...t, visible: false }));
        }}
        eventClassNames={() => ['cursor-pointer', 'text-xs']}
        dayCellClassNames={(arg) => {
          const today = new Date().toISOString().split('T')[0];
          if (arg.date.toISOString().split('T')[0] === today) return ['bg-brand-50'];
          return [];
        }}
      />

      {/* Hover tooltip */}
      {tooltip.visible && tooltip.event && (
        <div
          ref={tooltipRef}
          className="fixed z-50 bg-gray-900 text-white text-xs rounded-lg p-3 shadow-xl pointer-events-none max-w-[220px]"
          style={{
            left: tooltip.x,
            top: tooltip.y,
            transform: 'translate(-50%, -100%)',
          }}
        >
          <p className="font-medium">{tooltip.event.client.name}</p>
          <p className="text-gray-400 mt-1">{tooltip.event.regulatoryArea} — {tooltip.event.country}</p>
          <p className={`mt-1 font-medium ${
            tooltip.event.daysUntil < 0 ? 'text-red-400' :
            tooltip.event.daysUntil <= 7 ? 'text-amber-400' : 'text-green-400'
          }`}>
            {tooltip.event.daysUntil < 0
              ? `Vencido hace ${Math.abs(tooltip.event.daysUntil)} dias`
              : tooltip.event.daysUntil === 0
              ? 'Hoy'
              : `Faltan ${tooltip.event.daysUntil} dias`}
          </p>
          {tooltip.event.assignedTo && (
            <p className="text-gray-400 mt-1">Asignado: {tooltip.event.assignedTo}</p>
          )}
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px">
            <div className="border-4 border-transparent border-t-gray-900" />
          </div>
        </div>
      )}
    </div>
  );
}
