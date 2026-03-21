// ============================================================================
// FILE: apps/web/components/calendar/EventDrawer.tsx
// Slide-in drawer showing full event detail with actions.
// ============================================================================

'use client';

import { CountryFlag, getCountryName } from '../ui/CountryFlag';
import type { CalendarEvent } from './CalendarPage';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Props {
  readonly event: CalendarEvent;
  readonly onClose: () => void;
  readonly onStatusChange: (eventId: string, status: string) => void;
}

const TYPE_LABELS: Record<string, { label: string; emoji: string; color: string }> = {
  DEADLINE: { label: 'Fecha límite', emoji: '🔴', color: 'bg-red-100 text-red-700' },
  FILING: { label: 'Presentación', emoji: '🟠', color: 'bg-orange-100 text-orange-700' },
  AUDIT: { label: 'Auditoría', emoji: '🟣', color: 'bg-purple-100 text-purple-700' },
  RENEWAL: { label: 'Renovación', emoji: '🔵', color: 'bg-blue-100 text-blue-700' },
  REGULATORY_CHANGE: { label: 'Cambio normativo', emoji: '🟡', color: 'bg-yellow-100 text-yellow-700' },
  REVIEW: { label: 'Revisión interna', emoji: '⚪', color: 'bg-gray-100 text-gray-700' },
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  PENDING: { label: 'Pendiente', color: 'bg-amber-100 text-amber-700' },
  IN_PROGRESS: { label: 'En progreso', color: 'bg-blue-100 text-blue-700' },
  COMPLETED: { label: 'Completado', color: 'bg-green-100 text-green-700' },
  OVERDUE: { label: 'Vencido', color: 'bg-red-100 text-red-700' },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EventDrawer({ event, onClose, onStatusChange }: Props) {
  const typeMeta = TYPE_LABELS[event.type] ?? TYPE_LABELS['REVIEW']!;
  const statusMeta = STATUS_LABELS[event.status] ?? STATUS_LABELS['PENDING']!;

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

      <div className="relative w-[400px] bg-white shadow-2xl flex flex-col h-full">
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-3">
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${typeMeta.color}`}>
              {typeMeta.emoji} {typeMeta.label}
            </span>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
          </div>
          <h3 className="text-base font-semibold text-gray-900">{event.title}</h3>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Date */}
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase mb-1">Fecha</p>
            <p className="text-sm text-gray-900 font-medium">{formatDate(event.date)}</p>
            <p className={`text-xs mt-0.5 ${
              event.daysUntil < 0 ? 'text-red-500 font-medium' :
              event.daysUntil <= 7 ? 'text-amber-600' : 'text-gray-500'
            }`}>
              {event.daysUntil < 0
                ? `Vencido hace ${Math.abs(event.daysUntil)} días`
                : event.daysUntil === 0
                ? 'Hoy'
                : `Faltan ${event.daysUntil} días`}
            </p>
            {event.previousDate && (
              <p className="text-xs text-amber-600 mt-1 bg-amber-50 rounded px-2 py-1">
                Deadline anterior: {event.previousDate}
                {event.updateReason && ` — ${event.updateReason}`}
              </p>
            )}
          </div>

          {/* Client + Country */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase mb-1">Cliente</p>
              <p className="text-sm text-gray-900">{event.client.name}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase mb-1">País</p>
              <div className="flex items-center gap-1.5">
                <CountryFlag code={event.country} size="sm" />
                <span className="text-sm text-gray-900">{getCountryName(event.country)}</span>
              </div>
            </div>
          </div>

          {/* Area + Status */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase mb-1">Área</p>
              <p className="text-sm text-gray-900">{event.regulatoryArea}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase mb-1">Estado</p>
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${statusMeta.color}`}>
                {statusMeta.label}
              </span>
            </div>
          </div>

          {/* Assigned */}
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase mb-1">Asignado a</p>
            <p className="text-sm text-gray-900">{event.assignedTo ?? 'Sin asignar'}</p>
          </div>

          {/* Notes */}
          {event.notes && (
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase mb-1">Notas</p>
              <p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3">{event.notes}</p>
            </div>
          )}

          {/* Auto-generated badge */}
          {event.autoGenerated && (
            <div className="flex items-center gap-1.5 text-xs text-gray-400">
              <span className="h-1.5 w-1.5 rounded-full bg-gray-300" />
              Evento generado automáticamente por el pipeline
            </div>
          )}
        </div>

        {/* Actions */}
        {event.status !== 'COMPLETED' && (
          <div className="px-5 py-4 border-t border-gray-200 space-y-2">
            {event.status === 'PENDING' && (
              <button
                onClick={() => onStatusChange(event.id, 'IN_PROGRESS')}
                className="w-full btn-secondary text-xs"
              >
                Marcar en progreso
              </button>
            )}
            <button
              onClick={() => onStatusChange(event.id, 'COMPLETED')}
              className="w-full btn-primary text-xs"
            >
              Marcar completado
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
