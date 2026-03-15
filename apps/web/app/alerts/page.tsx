// ============================================================================
// FILE: apps/web/app/alerts/page.tsx
// Alerts management page — list all alerts with HITL actions.
// ============================================================================

'use client';

import { useState } from 'react';
import { AlertsPanel } from '@/components/client/AlertsPanel';
import type { AlertItem } from '@/components/client/AlertsPanel';
import { Badge } from '@/components/ui/Badge';

export default function AlertsPage() {
  const [alerts] = useState<AlertItem[]>(getMockAlerts());

  const stats = {
    total: alerts.length,
    pendingReview: alerts.filter((a) => a.status === 'PENDING_REVIEW').length,
    sent: alerts.filter((a) => a.status === 'SENT').length,
    acknowledged: alerts.filter((a) => a.status === 'ACKNOWLEDGED').length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Gestión de Alertas</h1>
          <p className="text-sm text-gray-500 mt-1">
            Revisión HITL, aprobación y seguimiento de alertas regulatorias
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

      {/* Alerts panel */}
      <AlertsPanel
        alerts={alerts}
        onAcknowledge={async (id) => {
          // In production: api.alerts.acknowledge(id, { acknowledgedBy: userId })
          console.log('ACK:', id);
        }}
        onBulkAcknowledge={async (ids) => {
          console.log('BULK ACK:', ids);
        }}
        userRole="PROFESSIONAL"
      />
    </div>
  );
}

function getMockAlerts(): AlertItem[] {
  return [
    { id: 'a-1', changeId: 'c-1', message: 'AFIP RG 5616 — Nuevo régimen de retenciones IVA afecta operaciones de Acme Financial en Argentina. Plazo: 30 días para adecuar sistemas.', impactLevel: 'HIGH', status: 'PENDING_REVIEW', channel: 'EMAIL', country: 'AR', createdAt: '2026-03-14T14:30:00Z', sentAt: null, acknowledgedAt: null, reviewedBy: null },
    { id: 'a-2', changeId: 'c-2', message: 'SEC Rule 10b-5 Amendment requiere actualización de divulgación de derivados para Q2 2026. Acme Financial tiene exposición notional >$100M.', impactLevel: 'HIGH', status: 'PENDING_REVIEW', channel: 'EMAIL', country: 'US', createdAt: '2026-03-12T18:00:00Z', sentAt: null, acknowledgedAt: null, reviewedBy: null },
    { id: 'a-3', changeId: 'c-6', message: 'DORA Implementation Technical Standards publicados. BankCo EU debe cumplir requisitos de resiliencia operativa digital antes de julio 2026.', impactLevel: 'HIGH', status: 'SENT', channel: 'EMAIL', country: 'EU', createdAt: '2026-03-05T10:00:00Z', sentAt: '2026-03-05T12:00:00Z', acknowledgedAt: null, reviewedBy: 'user-pro-001' },
    { id: 'a-4', changeId: 'c-3', message: 'Receita Federal modifica DCTF simplificada — verificar impacto en filial brasileña de GlobalTrade Inc.', impactLevel: 'MEDIUM', status: 'SENT', channel: 'TEAMS', country: 'BR', createdAt: '2026-03-13T12:00:00Z', sentAt: '2026-03-13T12:05:00Z', acknowledgedAt: null, reviewedBy: null },
    { id: 'a-5', changeId: 'c-4', message: 'SAT actualiza CFDI 4.0 — MexiFinance debe actualizar validación de RFC receptor.', impactLevel: 'MEDIUM', status: 'ACKNOWLEDGED', channel: 'TEAMS', country: 'MX', createdAt: '2026-03-09T08:00:00Z', sentAt: '2026-03-09T08:05:00Z', acknowledgedAt: '2026-03-10T10:00:00Z', reviewedBy: null },
    { id: 'a-6', changeId: 'c-5', message: 'CNMV actualiza requisitos ESG — impacto menor en fondos gestionados por IberiaCapital.', impactLevel: 'MEDIUM', status: 'SENT', channel: 'SSE', country: 'ES', createdAt: '2026-03-07T09:00:00Z', sentAt: '2026-03-07T09:00:00Z', acknowledgedAt: null, reviewedBy: null },
    { id: 'a-7', changeId: 'c-7', message: 'BOE corrección modelo 303 IVA — cambio menor en instrucciones. Solo informativo.', impactLevel: 'LOW', status: 'ACKNOWLEDGED', channel: 'SSE', country: 'ES', createdAt: '2026-03-08T09:00:00Z', sentAt: '2026-03-08T09:00:00Z', acknowledgedAt: '2026-03-08T14:00:00Z', reviewedBy: null },
    { id: 'a-8', changeId: 'c-8', message: 'CNV Resolución 1002 — Nuevo reporte de activos digitales para fondos argentinos.', impactLevel: 'MEDIUM', status: 'PENDING_REVIEW', channel: 'EMAIL', country: 'AR', createdAt: '2026-03-11T10:00:00Z', sentAt: null, acknowledgedAt: null, reviewedBy: null },
  ];
}
