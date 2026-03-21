// ============================================================================
// FILE: apps/web/components/calendar/CalendarSummaryBar.tsx
// KPI cards: overdue, due this week, due this month.
// ============================================================================

'use client';

interface Summary {
  readonly overdue: number;
  readonly dueThisWeek: number;
  readonly dueThisMonth: number;
}

export function CalendarSummaryBar({ summary }: { summary: Summary }) {
  const cards = [
    { label: 'Vencidos', value: summary.overdue, color: 'text-red-600 bg-red-50 border-red-200' },
    { label: 'Próximos 7 días', value: summary.dueThisWeek, color: 'text-amber-600 bg-amber-50 border-amber-200' },
    { label: 'Este mes', value: summary.dueThisMonth, color: 'text-blue-600 bg-blue-50 border-blue-200' },
  ];

  return (
    <div className="grid grid-cols-3 gap-4">
      {cards.map((card) => (
        <div key={card.label} className={`rounded-lg border p-4 ${card.color}`}>
          <p className="text-2xl font-bold">{card.value}</p>
          <p className="text-xs font-medium mt-1">{card.label}</p>
        </div>
      ))}
    </div>
  );
}
