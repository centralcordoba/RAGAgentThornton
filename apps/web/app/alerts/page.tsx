// ============================================================================
// FILE: apps/web/app/alerts/page.tsx
// Alerts management page — fetches real data from API.
// ============================================================================

'use client';

import { useState, useEffect, useCallback } from 'react';
import { AlertsPanel } from '@/components/client/AlertsPanel';
import type { AlertItem } from '@/components/client/AlertsPanel';

const API_BASE = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3000';

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAlerts() {
      setLoading(true);
      try {
        const token = sessionStorage.getItem('auth_token') ?? process.env['NEXT_PUBLIC_DEV_TOKEN'];
        const res = await fetch(`${API_BASE}/api/alerts?pageSize=50`, {
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });
        if (res.ok) {
          const body = await res.json();
          setAlerts((body.data ?? []) as AlertItem[]);
        }
      } catch {
        // API not available
      } finally {
        setLoading(false);
      }
    }
    fetchAlerts();
  }, []);

  const stats = {
    total: alerts.length,
    pendingReview: alerts.filter((a) => a.status === 'PENDING_REVIEW').length,
    sent: alerts.filter((a) => a.status === 'SENT').length,
    acknowledged: alerts.filter((a) => a.status === 'ACKNOWLEDGED').length,
  };

  const handleAcknowledge = useCallback(async (id: string) => {
    try {
      const token = sessionStorage.getItem('auth_token') ?? process.env['NEXT_PUBLIC_DEV_TOKEN'] ?? null;
      const res = await fetch(`${API_BASE}/api/alerts/${id}/ack`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ acknowledgedBy: 'user-dev-001' }),
      });
      if (res.ok) {
        const updated = await res.json();
        setAlerts((prev) => prev.map((a) => (a.id === id ? updated : a)));
      }
    } catch {
      // Error acknowledging
    }
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Gestion de Alertas</h1>
          <p className="text-sm text-gray-500 mt-1">
            Revision HITL, aprobacion y seguimiento de alertas regulatorias
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="card px-4 py-3 text-center">
          <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
          <p className="text-xs text-gray-500">Total</p>
        </div>
        <div className="card px-4 py-3 text-center">
          <p className="text-2xl font-bold text-risk-medium">{stats.pendingReview}</p>
          <p className="text-xs text-gray-500">Pendientes HITL</p>
        </div>
        <div className="card px-4 py-3 text-center">
          <p className="text-2xl font-bold text-blue-600">{stats.sent}</p>
          <p className="text-xs text-gray-500">Enviadas</p>
        </div>
        <div className="card px-4 py-3 text-center">
          <p className="text-2xl font-bold text-risk-low">{stats.acknowledged}</p>
          <p className="text-xs text-gray-500">Confirmadas</p>
        </div>
      </div>

      {/* HITL Flow Diagram */}
      <div className="card px-6 py-5">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">
          Flujo de aprobacion (Human-in-the-Loop)
        </h3>

        {/* Flow steps */}
        <div className="flex items-center justify-between gap-2">
          {/* Step 1 */}
          <div className="flex-1 text-center">
            <div className="mx-auto w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center mb-2">
              <span className="text-amber-600 text-lg font-bold">1</span>
            </div>
            <p className="text-xs font-semibold text-gray-900">Pendiente</p>
            <p className="text-[10px] text-gray-400 mt-0.5">PENDING_REVIEW</p>
            <div className="mt-2 inline-block px-2 py-0.5 rounded bg-amber-50 text-[10px] text-amber-700 font-medium">
              Alerta HIGH generada
            </div>
          </div>

          {/* Arrow */}
          <div className="flex flex-col items-center flex-shrink-0 -mt-4">
            <span className="text-gray-300 text-xl">&#8594;</span>
            <span className="text-[9px] text-gray-400 mt-0.5 bg-blue-50 px-1.5 py-0.5 rounded font-medium text-blue-600">
              Aprobar
            </span>
            <span className="text-[9px] text-gray-400">PROFESSIONAL / ADMIN</span>
          </div>

          {/* Step 2 */}
          <div className="flex-1 text-center">
            <div className="mx-auto w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center mb-2">
              <span className="text-blue-600 text-lg font-bold">2</span>
            </div>
            <p className="text-xs font-semibold text-gray-900">Aprobada</p>
            <p className="text-[10px] text-gray-400 mt-0.5">APPROVED</p>
            <div className="mt-2 inline-block px-2 py-0.5 rounded bg-blue-50 text-[10px] text-blue-700 font-medium">
              GT Professional valido
            </div>
          </div>

          {/* Arrow */}
          <div className="flex flex-col items-center flex-shrink-0 -mt-4">
            <span className="text-gray-300 text-xl">&#8594;</span>
            <span className="text-[9px] text-gray-400 mt-0.5 bg-gray-100 px-1.5 py-0.5 rounded font-medium text-gray-600">
              Auto
            </span>
            <span className="text-[9px] text-gray-400">Email / Teams / SSE</span>
          </div>

          {/* Step 3 */}
          <div className="flex-1 text-center">
            <div className="mx-auto w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center mb-2">
              <span className="text-indigo-600 text-lg font-bold">3</span>
            </div>
            <p className="text-xs font-semibold text-gray-900">Enviada</p>
            <p className="text-[10px] text-gray-400 mt-0.5">SENT</p>
            <div className="mt-2 inline-block px-2 py-0.5 rounded bg-indigo-50 text-[10px] text-indigo-700 font-medium">
              Notificada al cliente
            </div>
          </div>

          {/* Arrow */}
          <div className="flex flex-col items-center flex-shrink-0 -mt-4">
            <span className="text-gray-300 text-xl">&#8594;</span>
            <span className="text-[9px] text-gray-400 mt-0.5 bg-green-50 px-1.5 py-0.5 rounded font-medium text-green-600">
              Confirmar
            </span>
            <span className="text-[9px] text-gray-400">Cualquier rol</span>
          </div>

          {/* Step 4 */}
          <div className="flex-1 text-center">
            <div className="mx-auto w-10 h-10 rounded-full bg-green-100 flex items-center justify-center mb-2">
              <span className="text-green-600 text-lg font-bold">4</span>
            </div>
            <p className="text-xs font-semibold text-gray-900">Confirmada</p>
            <p className="text-[10px] text-gray-400 mt-0.5">ACKNOWLEDGED</p>
            <div className="mt-2 inline-block px-2 py-0.5 rounded bg-green-50 text-[10px] text-green-700 font-medium">
              Cliente confirmo recepcion
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="mt-4 pt-3 border-t border-gray-100 flex items-center gap-6 text-[10px] text-gray-400">
          <span>
            <span className="inline-block w-2 h-2 rounded-full bg-amber-500 mr-1" />
            Alertas HIGH requieren aprobacion de GT Professional antes de enviarse al cliente
          </span>
          <span>
            <span className="inline-block w-2 h-2 rounded-full bg-blue-500 mr-1" />
            Alertas MEDIUM/LOW se envian directamente (sin paso de aprobacion)
          </span>
        </div>
      </div>

      {/* Alerts panel */}
      {loading ? (
        <div className="card p-12 text-center">
          <p className="text-sm text-gray-500">Cargando alertas...</p>
        </div>
      ) : alerts.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-sm text-gray-500">No hay alertas registradas</p>
        </div>
      ) : (
        <AlertsPanel
          alerts={alerts}
          onAcknowledge={handleAcknowledge}
          onBulkAcknowledge={async (ids) => {
            for (const id of ids) await handleAcknowledge(id);
          }}
          userRole="PROFESSIONAL"
        />
      )}
    </div>
  );
}
