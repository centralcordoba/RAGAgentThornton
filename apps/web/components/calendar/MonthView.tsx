// ============================================================================
// FILE: apps/web/components/calendar/MonthView.tsx
// Monthly calendar using @fullcalendar/react with daygrid plugin.
// ============================================================================

'use client';

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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MonthView({ events, onEventClick }: Props) {
  const calendarEvents = events.map((e) => {
    const colors = TYPE_COLORS[e.type] ?? TYPE_COLORS['REVIEW']!;
    const emoji = TYPE_EMOJI[e.type] ?? '';
    const isOverdue = e.status === 'OVERDUE';

    return {
      id: e.id,
      title: `${emoji} ${e.title}`,
      start: e.date,
      allDay: true,
      backgroundColor: isOverdue ? '#fef2f2' : colors.bg,
      borderColor: isOverdue ? '#dc2626' : colors.border,
      textColor: isOverdue ? '#991b1b' : colors.text,
      extendedProps: { originalEvent: e },
    };
  });

  return (
    <div className="card card-body fullcalendar-container">
      <FullCalendar
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
        moreLinkText={(n) => `+${n} más`}
        eventClick={(info) => {
          const original = info.event.extendedProps['originalEvent'] as CalendarEvent;
          if (original) onEventClick(original);
        }}
        eventClassNames={() => ['cursor-pointer', 'text-xs']}
        dayCellClassNames={(arg) => {
          const today = new Date().toISOString().split('T')[0];
          if (arg.date.toISOString().split('T')[0] === today) return ['bg-brand-50'];
          return [];
        }}
      />
    </div>
  );
}
