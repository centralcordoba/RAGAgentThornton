// ============================================================================
// FILE: apps/web/components/ui/DeadlineChip.tsx
// Deadline indicator chip with urgency color and countdown.
// ============================================================================

'use client';

interface DeadlineChipProps {
  readonly date: string;
  readonly label?: string;
}

export function DeadlineChip({ date, label }: DeadlineChipProps) {
  const dueDate = new Date(date);
  const now = new Date();
  const daysUntil = Math.ceil((dueDate.getTime() - now.getTime()) / 86_400_000);

  const urgency = getUrgency(daysUntil);
  const formattedDate = dueDate.toLocaleDateString('es', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium border ${urgency.classes}`}
    >
      <span>{urgency.icon}</span>
      <span>{label ?? formattedDate}</span>
      <span className="opacity-75">
        {daysUntil < 0
          ? `(${Math.abs(daysUntil)}d vencido)`
          : daysUntil === 0
            ? '(hoy)'
            : `(${daysUntil}d)`}
      </span>
    </div>
  );
}

interface UrgencyStyle {
  readonly icon: string;
  readonly classes: string;
}

function getUrgency(daysUntil: number): UrgencyStyle {
  if (daysUntil < 0) {
    return { icon: '🔴', classes: 'bg-red-100 text-red-800 border-red-200' };
  }
  if (daysUntil <= 7) {
    return { icon: '🔴', classes: 'bg-red-50 text-red-700 border-red-200' };
  }
  if (daysUntil <= 30) {
    return { icon: '🟠', classes: 'bg-orange-50 text-orange-700 border-orange-200' };
  }
  if (daysUntil <= 90) {
    return { icon: '🟡', classes: 'bg-amber-50 text-amber-700 border-amber-200' };
  }
  return { icon: '🟢', classes: 'bg-green-50 text-green-700 border-green-200' };
}
