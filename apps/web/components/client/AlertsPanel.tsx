// ============================================================================
// FILE: apps/web/components/client/AlertsPanel.tsx
// Client alerts list with ACK, bulk ACK, and escalation indicator.
// ============================================================================

'use client';

import { useState, useCallback } from 'react';
import { Badge, impactToBadgeVariant } from '../ui/Badge';
import { CountryFlag } from '../ui/CountryFlag';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AlertItem {
  readonly id: string;
  readonly changeId: string;
  readonly message: string;
  readonly impactLevel: string;
  readonly status: string;
  readonly channel: string;
  readonly country: string;
  readonly createdAt: string;
  readonly sentAt: string | null;
  readonly acknowledgedAt: string | null;
  readonly reviewedBy: string | null;
}

interface AlertsPanelProps {
  readonly alerts: readonly AlertItem[];
  readonly onAcknowledge: (alertId: string) => Promise<void>;
  readonly onBulkAcknowledge: (alertIds: string[]) => Promise<void>;
  readonly userRole: string;
}

// ---------------------------------------------------------------------------
// AlertsPanel
// ---------------------------------------------------------------------------

export function AlertsPanel({
  alerts,
  onAcknowledge,
  onBulkAcknowledge,
  userRole,
}: AlertsPanelProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const filteredAlerts = statusFilter
    ? alerts.filter((a) => a.status === statusFilter)
    : alerts;

  const pendingReview = alerts.filter((a) => a.status === 'PENDING_REVIEW');
  const actionable = alerts.filter(
    (a) => a.status === 'SENT' || a.status === 'APPROVED' || a.status === 'PENDING_REVIEW',
  );

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === actionable.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(actionable.map((a) => a.id)));
    }
  };

  const handleAck = useCallback(async (alertId: string) => {
    setProcessingIds((prev) => new Set(prev).add(alertId));
    try {
      await onAcknowledge(alertId);
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev);
        next.delete(alertId);
        return next;
      });
    }
  }, [onAcknowledge]);

  const handleBulkAck = useCallback(async () => {
    const ids = Array.from(selected);
    setProcessingIds(new Set(ids));
    try {
      await onBulkAcknowledge(ids);
      setSelected(new Set());
    } finally {
      setProcessingIds(new Set());
    }
  }, [selected, onBulkAcknowledge]);

  return (
    <div className="card flex flex-col">
      <div className="card-header flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-gray-900">Alertas</h2>
          {pendingReview.length > 0 && (
            <Badge variant="high" size="sm">
              {pendingReview.length} pendientes de revisión
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Status filter */}
          <div className="flex gap-1">
            {['PENDING_REVIEW', 'SENT', 'ACKNOWLEDGED'].map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(statusFilter === status ? null : status)}
                className={`px-2 py-0.5 text-[10px] rounded-full border transition-colors ${
                  statusFilter === status
                    ? 'bg-brand-800 text-white border-brand-800'
                    : 'border-gray-200 text-gray-500'
                }`}
              >
                {STATUS_LABELS[status] ?? status}
              </button>
            ))}
          </div>

          {/* Bulk actions */}
          {selected.size > 0 && (
            <button
              onClick={handleBulkAck}
              className="btn-primary text-xs"
              disabled={processingIds.size > 0}
            >
              Confirmar ({selected.size})
            </button>
          )}
        </div>
      </div>

      {/* Select all */}
      {actionable.length > 0 && (
        <div className="px-5 py-2 border-b border-gray-50 flex items-center gap-2">
          <input
            type="checkbox"
            checked={selected.size === actionable.length && actionable.length > 0}
            onChange={selectAll}
            className="rounded border-gray-300"
          />
          <span className="text-xs text-gray-500">Seleccionar todas</span>
        </div>
      )}

      {/* Alert list */}
      <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
        {filteredAlerts.length === 0 && (
          <div className="p-8 text-center text-sm text-gray-400">
            No hay alertas
          </div>
        )}

        {filteredAlerts.map((alert) => (
          <AlertRow
            key={alert.id}
            alert={alert}
            isSelected={selected.has(alert.id)}
            isProcessing={processingIds.has(alert.id)}
            onToggleSelect={() => toggleSelect(alert.id)}
            onAcknowledge={() => handleAck(alert.id)}
            userRole={userRole}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AlertRow
// ---------------------------------------------------------------------------

function AlertRow({
  alert,
  isSelected,
  isProcessing,
  onToggleSelect,
  onAcknowledge,
  userRole,
}: {
  alert: AlertItem;
  isSelected: boolean;
  isProcessing: boolean;
  onToggleSelect: () => void;
  onAcknowledge: () => void;
  userRole: string;
}) {
  const isEscalated = alert.impactLevel === 'HIGH'
    && alert.status === 'SENT'
    && alert.sentAt
    && Date.now() - new Date(alert.sentAt).getTime() > 2 * 60 * 60 * 1000;

  const canAck = alert.status === 'SENT' || alert.status === 'APPROVED'
    || (alert.status === 'PENDING_REVIEW' && (userRole === 'PROFESSIONAL' || userRole === 'ADMIN'));

  return (
    <div className={`px-5 py-3 flex items-start gap-3 hover:bg-gray-50 transition-colors ${
      isEscalated ? 'bg-red-50/50' : ''
    }`}>
      {/* Checkbox */}
      <input
        type="checkbox"
        checked={isSelected}
        onChange={onToggleSelect}
        disabled={!canAck}
        className="mt-1 rounded border-gray-300"
      />

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <CountryFlag code={alert.country} size="sm" />
          <Badge variant={impactToBadgeVariant(alert.impactLevel)} size="sm">
            {alert.impactLevel}
          </Badge>
          <Badge
            variant={alert.status === 'ACKNOWLEDGED' ? 'success' : alert.status === 'PENDING_REVIEW' ? 'warning' : 'neutral'}
            size="sm"
          >
            {STATUS_LABELS[alert.status] ?? alert.status}
          </Badge>
          {isEscalated && (
            <Badge variant="high" size="sm">
              ESCALADO
            </Badge>
          )}
        </div>

        <p className="text-sm text-gray-900 line-clamp-2">{alert.message}</p>

        <p className="text-xs text-gray-400 mt-1">
          {formatTime(alert.createdAt)}
          {alert.reviewedBy && ` · Revisado por: ${alert.reviewedBy}`}
          {alert.acknowledgedAt && ` · ACK: ${formatTime(alert.acknowledgedAt)}`}
        </p>
      </div>

      {/* Action */}
      {canAck && (
        <button
          onClick={onAcknowledge}
          disabled={isProcessing}
          className={`flex-shrink-0 text-xs px-3 py-1.5 rounded-md transition-colors ${
            alert.status === 'PENDING_REVIEW'
              ? 'bg-brand-800 text-white hover:bg-brand-700'
              : 'border border-gray-300 text-gray-600 hover:bg-gray-100'
          } disabled:opacity-50`}
        >
          {isProcessing
            ? '...'
            : alert.status === 'PENDING_REVIEW'
              ? 'Aprobar'
              : 'Confirmar'}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------------

const STATUS_LABELS: Record<string, string> = {
  PENDING_REVIEW: 'Pendiente',
  APPROVED: 'Aprobado',
  SENT: 'Enviado',
  ACKNOWLEDGED: 'Confirmado',
  DISMISSED: 'Descartado',
};

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
