// ============================================================================
// FILE: apps/web/components/ui/AlertBanner.tsx
// Dismissible alert banner for notifications and warnings.
// ============================================================================

'use client';

import { useState } from 'react';

interface AlertBannerProps {
  readonly variant: 'info' | 'warning' | 'error' | 'success';
  readonly title: string;
  readonly message: string;
  readonly dismissible?: boolean;
  readonly action?: {
    readonly label: string;
    readonly onClick: () => void;
  };
}

const VARIANT_STYLES: Record<AlertBannerProps['variant'], string> = {
  info: 'bg-blue-50 border-blue-200 text-blue-800',
  warning: 'bg-amber-50 border-amber-200 text-amber-800',
  error: 'bg-red-50 border-red-200 text-red-800',
  success: 'bg-green-50 border-green-200 text-green-800',
};

const VARIANT_ICONS: Record<AlertBannerProps['variant'], string> = {
  info: 'ℹ️',
  warning: '⚠️',
  error: '🚨',
  success: '✅',
};

export function AlertBanner({
  variant,
  title,
  message,
  dismissible = true,
  action,
}: AlertBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <div
      className={`flex items-start gap-3 rounded-lg border p-4 ${VARIANT_STYLES[variant]}`}
      role="alert"
    >
      <span className="text-lg flex-shrink-0 mt-0.5">{VARIANT_ICONS[variant]}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-sm mt-0.5 opacity-90">{message}</p>
        {action && (
          <button
            onClick={action.onClick}
            className="mt-2 text-sm font-medium underline hover:no-underline"
          >
            {action.label}
          </button>
        )}
      </div>
      {dismissible && (
        <button
          onClick={() => setDismissed(true)}
          className="flex-shrink-0 p-1 rounded hover:bg-black/5 transition-colors"
          aria-label="Dismiss"
        >
          <span className="text-sm">✕</span>
        </button>
      )}
    </div>
  );
}
