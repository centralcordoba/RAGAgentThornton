// ============================================================================
// FILE: apps/web/components/ui/Header.tsx
// Top header with role badge, search, chat toggle, and notifications panel.
// ============================================================================

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Badge, impactToBadgeVariant } from './Badge';
import { useUIStore } from '@/lib/stores/uiStore';
import { api } from '@/lib/api/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AlertNotification {
  readonly id: string;
  readonly message: string;
  readonly impactLevel: string;
  readonly status: string;
  readonly channel: string;
  readonly createdAt: string;
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

export function Header() {
  const { toggleChat, chatOpen } = useUIStore();
  const [notifOpen, setNotifOpen] = useState(false);
  const [alerts, setAlerts] = useState<AlertNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const user = {
    role: 'PROFESSIONAL' as const,
    tenantName: 'Grant Thornton',
  };

  // Fetch recent alerts
  const fetchAlerts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.alerts.list({ pageSize: '10' });
      const data = res.data as AlertNotification[];
      setAlerts(data);
    } catch {
      // Fallback: no alerts available
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch on mount and every 60s
  useEffect(() => {
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 60_000);
    return () => clearInterval(interval);
  }, [fetchAlerts]);

  // Close panel on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    }
    if (notifOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [notifOpen]);

  const unreadCount = alerts.filter(
    (a) => a.status === 'PENDING_REVIEW' || a.status === 'SENT',
  ).length;

  return (
    <header className="flex h-14 items-center justify-between border-b border-gray-200 bg-white px-6">
      <div className="flex items-center gap-4">
        <h1 className="text-sm font-semibold text-gray-500">
          Grant Thornton
        </h1>
      </div>

      <div className="flex items-center gap-4">
        {/* Search */}
        <div className="hidden md:block">
          <input
            type="search"
            placeholder="Buscar regulaciones, clientes..."
            className="input w-64 text-xs"
          />
        </div>

        {/* Chat toggle */}
        <button
          onClick={toggleChat}
          className={`p-1.5 rounded-md transition-colors ${
            chatOpen ? 'bg-brand-100 text-brand-700' : 'hover:bg-gray-100'
          }`}
          aria-label="Toggle chat"
        >
          <span className="text-lg">💬</span>
        </button>

        {/* Notifications bell */}
        <div className="relative" ref={panelRef}>
          <button
            onClick={() => setNotifOpen(!notifOpen)}
            className={`relative p-1.5 rounded-md transition-colors ${
              notifOpen ? 'bg-brand-100 text-brand-700' : 'hover:bg-gray-100'
            }`}
            aria-label="Notifications"
          >
            <span className="text-lg">🔔</span>
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-risk-high text-[10px] font-bold text-white">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {/* Notifications dropdown panel */}
          {notifOpen && (
            <div className="absolute right-0 top-full mt-2 w-96 bg-white rounded-lg shadow-lg border border-gray-200 z-50 overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
                <h3 className="text-sm font-semibold text-gray-900">Notificaciones</h3>
                {unreadCount > 0 && (
                  <span className="text-xs text-brand-600 font-medium">
                    {unreadCount} sin leer
                  </span>
                )}
              </div>

              {/* Alerts list */}
              <div className="max-h-96 overflow-y-auto">
                {loading && alerts.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-gray-400">
                    Cargando...
                  </div>
                ) : alerts.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-gray-400">
                    No hay notificaciones recientes
                  </div>
                ) : (
                  alerts.map((alert) => (
                    <div
                      key={alert.id}
                      className={`px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors ${
                        alert.status === 'PENDING_REVIEW' || alert.status === 'SENT'
                          ? 'bg-brand-50/30'
                          : ''
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 text-base flex-shrink-0">
                          {getImpactIcon(alert.impactLevel)}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-900 line-clamp-2">
                            {alert.message}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant={impactToBadgeVariant(alert.impactLevel)}>
                              {alert.impactLevel}
                            </Badge>
                            <span className="text-xs text-gray-400">
                              {formatStatusLabel(alert.status)}
                            </span>
                            <span className="text-xs text-gray-400">
                              {formatTimeAgo(alert.createdAt)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Footer */}
              {alerts.length > 0 && (
                <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50">
                  <a
                    href="/alerts"
                    className="text-xs font-medium text-brand-600 hover:text-brand-700 transition-colors"
                  >
                    Ver todas las alertas
                  </a>
                </div>
              )}
            </div>
          )}
        </div>

        {/* User */}
        <div className="flex items-center gap-2 pl-4 border-l border-gray-200">
          <div className="text-right">
            <p className="text-xs text-gray-500">{user.tenantName}</p>
          </div>
          <Badge variant={getRoleBadgeVariant(user.role)}>
            {formatRole(user.role)}
          </Badge>
        </div>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getRoleBadgeVariant(role: string): 'info' | 'success' | 'warning' {
  switch (role) {
    case 'ADMIN':
      return 'warning';
    case 'PROFESSIONAL':
      return 'info';
    default:
      return 'success';
  }
}

function formatRole(role: string): string {
  const labels: Record<string, string> = {
    ADMIN: 'Admin',
    PROFESSIONAL: 'Professional',
    CLIENT_VIEWER: 'Client',
  };
  return labels[role] ?? role;
}

function getImpactIcon(level: string): string {
  switch (level) {
    case 'HIGH': return '🔴';
    case 'MEDIUM': return '🟡';
    case 'LOW': return '🟢';
    default: return '⚪';
  }
}

function formatStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    PENDING_REVIEW: 'Pendiente',
    APPROVED: 'Aprobada',
    SENT: 'Enviada',
    ACKNOWLEDGED: 'Confirmada',
    DISMISSED: 'Descartada',
  };
  return labels[status] ?? status;
}

function formatTimeAgo(dateStr: string): string {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const diffMs = now - date;
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMin < 1) return 'ahora';
  if (diffMin < 60) return `hace ${diffMin}m`;
  if (diffHours < 24) return `hace ${diffHours}h`;
  if (diffDays < 7) return `hace ${diffDays}d`;
  return new Date(dateStr).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
}
