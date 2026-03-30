// ============================================================================
// FILE: apps/web/components/impact/ImpactDrawer.tsx
// Slide-in drawer with 3 sections: diff, reasoning stream, affected clients.
// Triggers the ImpactAnalyzerAgent via SSE.
// HITL: approve button calls PATCH /api/impact/reports/:id/approve
// Export: PDF export calls POST /api/impact/reports/:id/export-pdf
// ============================================================================

'use client';

import { useEffect, useState } from 'react';
import { RegulationDiff } from './RegulationDiff';
import { AgentReasoningLog } from './AgentReasoningLog';
import { SeverityGauge } from './SeverityGauge';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Props {
  readonly jurisdiction: string;
  readonly area: string;
  readonly score: number;
  readonly onClose: () => void;
}

interface ReasoningStep {
  readonly step: number;
  readonly type: string;
  readonly message: string;
  readonly timestamp: string;
  readonly data?: Record<string, unknown>;
}

interface ClientImpact {
  readonly clientId: string;
  readonly clientName: string;
  readonly severityScore: number;
  readonly affectedObligations: readonly string[];
  readonly deadlineChange: { from: string; to: string } | null;
  readonly recommendedAction: string;
}

interface ImpactReport {
  readonly id: string;
  readonly diff: { before: string; after: string };
  readonly reasoning: readonly ReasoningStep[];
  readonly affectedClients: readonly ClientImpact[];
  readonly severityScore: number;
  readonly confidence: number;
  readonly relatedRegulations: readonly string[];
  readonly changeId?: string;
  readonly reviewedBy: string | null;
}

const API_BASE = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3000';

type TabId = 'diff' | 'reasoning' | 'clients';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ImpactDrawer({ jurisdiction, area, score, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>('reasoning');
  const [steps, setSteps] = useState<ReasoningStep[]>([]);
  const [report, setReport] = useState<ImpactReport | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const token = sessionStorage.getItem('auth_token') ?? process.env['NEXT_PUBLIC_DEV_TOKEN'] ?? null;
    const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

    const runAnalysis = async () => {
      try {
        // Find a real regulation ID for this jurisdiction + area
        const regRes = await fetch(
          `${API_BASE}/api/regulations?country=${encodeURIComponent(jurisdiction)}&pageSize=1`,
          { headers: authHeaders },
        );
        let changeId: string | null = null;
        if (regRes.ok) {
          const regData = await regRes.json();
          changeId = regData.data?.[0]?.id ?? null;
        }

        if (!changeId) {
          setError(`No se encontraron regulaciones para ${jurisdiction}`);
          setIsAnalyzing(false);
          return;
        }

        const res = await fetch(`${API_BASE}/api/impact/analyze/${changeId}`, {
          method: 'POST',
          headers: authHeaders,
        });

        if (!res.ok || !res.body) {
          setError(`HTTP ${res.status}`);
          setIsAnalyzing(false);
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            try {
              const payload = JSON.parse(line.slice(6));
              if (payload.type === 'step') {
                setSteps((prev) => [...prev, payload.step]);
              } else if (payload.type === 'report') {
                setReport(payload.report);
                setIsAnalyzing(false);
              } else if (payload.type === 'error') {
                setError(payload.error);
                setIsAnalyzing(false);
              }
            } catch {
              // Skip malformed lines
            }
          }
        }
        setIsAnalyzing(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Connection failed');
        setIsAnalyzing(false);
      }
    };

    runAnalysis();
  }, [jurisdiction, area]);

  // -------------------------------------------------------------------------
  // HITL Approve
  // -------------------------------------------------------------------------

  const handleApprove = async () => {
    if (!report) return;
    setApproving(true);

    try {
      const token = sessionStorage.getItem('auth_token') ?? process.env['NEXT_PUBLIC_DEV_TOKEN'] ?? null;
      const reportId = report.changeId ?? report.id;
      const res = await fetch(`${API_BASE}/api/impact/reports/${reportId}/approve`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ reviewedBy: 'GT Professional' }),
      });

      if (res.ok) {
        const approved = await res.json();
        setReport(approved);
      } else {
        const err = await res.json().catch(() => ({ message: `HTTP ${res.status}` }));
        setError(err.message ?? 'Error al aprobar');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de conexion');
    } finally {
      setApproving(false);
    }
  };

  // -------------------------------------------------------------------------
  // Export PDF
  // -------------------------------------------------------------------------

  const handleExportPdf = async () => {
    if (!report) return;
    setExporting(true);

    try {
      const token = sessionStorage.getItem('auth_token') ?? process.env['NEXT_PUBLIC_DEV_TOKEN'] ?? null;
      const reportId = report.changeId ?? report.id;
      const res = await fetch(`${API_BASE}/api/impact/reports/${reportId}/export-pdf`, {
        method: 'POST',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `regwatch-impact-report-${report.id.slice(0, 8)}.html`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        setError('Error al exportar reporte');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de conexion');
    } finally {
      setExporting(false);
    }
  };

  const TABS: { id: TabId; label: string }[] = [
    { id: 'reasoning', label: 'Razonamiento' },
    { id: 'diff', label: 'Diff regulatorio' },
    { id: 'clients', label: 'Clientes afectados' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={!isAnalyzing ? onClose : undefined} />

      <div className="relative w-[560px] bg-white shadow-2xl flex flex-col h-full">
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-200 bg-brand-700 text-white">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold">Impact Analyzer</h3>
              <p className="text-xs text-brand-200 mt-0.5">
                {jurisdiction} / {area} — Score: {score}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {report && (
                <button
                  onClick={handleExportPdf}
                  disabled={exporting}
                  className="text-xs bg-white/20 hover:bg-white/30 text-white px-2.5 py-1 rounded transition-colors disabled:opacity-50"
                  title="Generar reporte PDF"
                >
                  {exporting ? 'Exportando...' : 'Exportar PDF'}
                </button>
              )}
              <button onClick={onClose} disabled={isAnalyzing} className="text-brand-200 hover:text-white disabled:opacity-30">
                ✕
              </button>
            </div>
          </div>
        </div>

        {/* Severity gauge (when complete) */}
        {report && (
          <div className="flex items-center justify-around px-5 py-4 bg-gray-50 border-b border-gray-100">
            <SeverityGauge score={report.severityScore} size={100} />
            <div className="text-center">
              <p className="text-2xl font-bold text-gray-900">{report.confidence}%</p>
              <p className="text-xs text-gray-500">Confianza</p>
              {report.confidence < 70 && (
                <p className="text-[10px] text-amber-600 font-medium mt-1">Revision humana requerida</p>
              )}
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-gray-900">{report.affectedClients.length}</p>
              <p className="text-xs text-gray-500">Clientes afectados</p>
            </div>
          </div>
        )}

        {/* Tab bar */}
        <div className="flex border-b border-gray-200">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 px-4 py-2.5 text-xs font-medium transition-colors ${
                activeTab === tab.id
                  ? 'text-brand-700 border-b-2 border-brand-700'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
              {tab.id === 'clients' && report && (
                <span className="ml-1 bg-brand-100 text-brand-700 px-1.5 py-0.5 rounded-full text-[10px]">
                  {report.affectedClients.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto">
          {error && (
            <div className="m-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              Error: {error}
            </div>
          )}

          {activeTab === 'reasoning' && (
            <AgentReasoningLog steps={steps} isRunning={isAnalyzing} />
          )}

          {activeTab === 'diff' && report && (
            <RegulationDiff before={report.diff.before} after={report.diff.after} />
          )}

          {activeTab === 'diff' && !report && isAnalyzing && (
            <div className="flex items-center justify-center h-48 text-sm text-gray-400">
              Esperando analisis para mostrar diff...
            </div>
          )}

          {activeTab === 'clients' && report && (
            <ClientsTab clients={report.affectedClients} />
          )}

          {activeTab === 'clients' && !report && isAnalyzing && (
            <div className="flex items-center justify-center h-48 text-sm text-gray-400">
              Identificando clientes afectados...
            </div>
          )}
        </div>

        {/* HITL footer — approve needed */}
        {report && !report.reviewedBy && report.severityScore > 70 && (
          <div className="px-5 py-4 border-t border-gray-200 bg-amber-50">
            <p className="text-xs text-amber-700 mb-3">
              Severity {'>'} 70 — requiere aprobacion de un profesional GT antes de notificar al cliente.
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleApprove}
                disabled={approving}
                className="btn-primary flex-1 text-xs"
              >
                {approving ? 'Aprobando...' : 'Aprobar y enviar alerta'}
              </button>
              <button className="btn-secondary flex-1 text-xs">
                Modificar analisis
              </button>
            </div>
          </div>
        )}

        {/* HITL footer — already approved */}
        {report && report.reviewedBy && (
          <div className="px-5 py-4 border-t border-gray-200 bg-green-50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-green-500" />
                <p className="text-xs text-green-700 font-medium">
                  Aprobado por {report.reviewedBy}
                </p>
              </div>
              <button
                onClick={handleExportPdf}
                disabled={exporting}
                className="btn-secondary text-xs"
              >
                {exporting ? 'Exportando...' : 'Descargar reporte'}
              </button>
            </div>
          </div>
        )}

        {/* Confidence warning footer */}
        {report && report.confidence < 70 && !report.reviewedBy && report.severityScore <= 70 && (
          <div className="px-5 py-3 border-t border-amber-200 bg-amber-50">
            <p className="text-xs text-amber-700 font-medium">
              Confianza {report.confidence}% — se recomienda revision humana detallada antes de notificar.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Clients sub-tab
// ---------------------------------------------------------------------------

function ClientsTab({ clients }: { clients: readonly ClientImpact[] }) {
  const sorted = [...clients].sort((a, b) => b.severityScore - a.severityScore);

  return (
    <div className="p-4 space-y-3">
      {sorted.map((client) => {
        const level =
          client.severityScore >= 80 ? 'CRITICO' :
          client.severityScore >= 60 ? 'ALTO' :
          client.severityScore >= 30 ? 'MEDIO' : 'BAJO';
        const levelColor =
          client.severityScore >= 80 ? 'text-red-600 bg-red-50' :
          client.severityScore >= 60 ? 'text-orange-600 bg-orange-50' :
          client.severityScore >= 30 ? 'text-amber-600 bg-amber-50' : 'text-green-600 bg-green-50';
        const barColor =
          client.severityScore >= 80 ? 'bg-red-500' :
          client.severityScore >= 60 ? 'bg-orange-500' :
          client.severityScore >= 30 ? 'bg-amber-500' : 'bg-green-500';

        return (
          <div key={client.clientId} className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="font-semibold text-sm text-gray-900">{client.clientName}</p>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${levelColor}`}>
                {level}
              </span>
            </div>

            {/* Severity bar */}
            <div className="flex items-center gap-3 mb-3">
              <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${barColor}`}
                  style={{ width: `${client.severityScore}%` }}
                />
              </div>
              <span className="text-sm font-bold text-gray-700 w-10 text-right">
                {client.severityScore}%
              </span>
            </div>

            {/* Details */}
            <div className="space-y-1.5 text-xs text-gray-600">
              {client.deadlineChange && (
                <p>
                  Deadline: <span className="line-through text-red-500">{client.deadlineChange.from}</span>
                  {' → '}
                  <span className="font-medium text-gray-900">{client.deadlineChange.to}</span>
                </p>
              )}
              <p>Obligaciones: {client.affectedObligations.join(', ')}</p>
              <p className="text-brand-700 font-medium">{client.recommendedAction}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
