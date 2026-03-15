// ============================================================================
// FILE: apps/web/components/ui/Badge.tsx
// Risk/status badge component.
// ============================================================================

'use client';

interface BadgeProps {
  readonly variant: 'high' | 'medium' | 'low' | 'info' | 'success' | 'warning' | 'neutral';
  readonly children: React.ReactNode;
  readonly size?: 'sm' | 'md';
}

const VARIANT_STYLES: Record<BadgeProps['variant'], string> = {
  high: 'bg-red-100 text-red-800 border-red-200',
  medium: 'bg-amber-100 text-amber-800 border-amber-200',
  low: 'bg-green-100 text-green-800 border-green-200',
  info: 'bg-blue-100 text-blue-800 border-blue-200',
  success: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  warning: 'bg-orange-100 text-orange-800 border-orange-200',
  neutral: 'bg-gray-100 text-gray-700 border-gray-200',
};

export function Badge({ variant, children, size = 'sm' }: BadgeProps) {
  const sizeClass = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm';

  return (
    <span
      className={`inline-flex items-center rounded-full border font-medium ${sizeClass} ${VARIANT_STYLES[variant]}`}
    >
      {children}
    </span>
  );
}

/** Map ImpactLevel to badge variant. */
export function impactToBadgeVariant(level: string): BadgeProps['variant'] {
  switch (level) {
    case 'HIGH':
      return 'high';
    case 'MEDIUM':
      return 'medium';
    case 'LOW':
      return 'low';
    default:
      return 'neutral';
  }
}
