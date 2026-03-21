// ============================================================================
// FILE: apps/web/components/calendar/CalendarSummaryBar.tsx
// KPI cards: overdue, due this week, due this month, next 90 days.
// Click on any card filters the list view to that range.
// ============================================================================

'use client';

interface Summary {
  readonly overdue: number;
  readonly dueThisWeek: number;
  readonly dueThisMonth: number;
  readonly byCountry: readonly { country: string; count: number }[];
  readonly byType: readonly { type: string; count: number }[];
}

export type UrgencyFilter = 'all' | 'overdue' | 'week' | 'month' | 'quarter';

interface Props {
  readonly summary: Summary;
  readonly totalUpcoming: number;
  readonly activeFilter: UrgencyFilter;
  readonly onFilterClick: (filter: UrgencyFilter) => void;
}

export function CalendarSummaryBar({ summary, totalUpcoming, activeFilter, onFilterClick }: Props) {
  const cards: { id: UrgencyFilter; label: string; value: number; icon: string; color: string; activeColor: string }[] = [
    {
      id: 'overdue',
      label: 'Vencidos',
      value: summary.overdue,
      icon: summary.overdue === 0 ? 'ok' : 'alert',
      color: 'text-red-600 bg-red-50 border-red-200',
      activeColor: 'ring-2 ring-red-400',
    },
    {
      id: 'week',
      label: 'Esta semana',
      value: summary.dueThisWeek,
      icon: 'warning',
      color: 'text-amber-600 bg-amber-50 border-amber-200',
      activeColor: 'ring-2 ring-amber-400',
    },
    {
      id: 'month',
      label: 'Este mes',
      value: summary.dueThisMonth,
      icon: 'calendar',
      color: 'text-blue-600 bg-blue-50 border-blue-200',
      activeColor: 'ring-2 ring-blue-400',
    },
    {
      id: 'quarter',
      label: 'Prox. 90 dias',
      value: totalUpcoming,
      icon: 'chart',
      color: 'text-purple-600 bg-purple-50 border-purple-200',
      activeColor: 'ring-2 ring-purple-400',
    },
  ];

  return (
    <div className="grid grid-cols-4 gap-4">
      {cards.map((card) => (
        <button
          key={card.id}
          onClick={() => onFilterClick(activeFilter === card.id ? 'all' : card.id)}
          className={`rounded-lg border p-4 text-left transition-all hover:shadow-sm cursor-pointer ${card.color} ${
            activeFilter === card.id ? card.activeColor : ''
          }`}
        >
          <p className="text-2xl font-bold">{card.value}</p>
          <p className="text-xs font-medium mt-1">{card.label}</p>
          <p className="text-[10px] mt-1 opacity-60">
            {card.id === 'overdue' && (card.value === 0 ? 'Sin vencidos' : 'Requiere atencion')}
            {card.id === 'week' && (card.value > 0 ? 'Proximos vencimientos' : 'Sin urgencias')}
            {card.id === 'month' && 'Planificacion mensual'}
            {card.id === 'quarter' && 'Vision trimestral'}
          </p>
        </button>
      ))}
    </div>
  );
}
