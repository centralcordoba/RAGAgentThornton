// ============================================================================
// FILE: apps/web/components/sources/TriggerDrawer.tsx
// Slide-in drawer showing real-time SSE progress for a manual source trigger.
// ============================================================================

'use client';

import { useEffect, useRef, useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Source {
  readonly id: string;
  readonly name: string;
  readonly country: string;
}

interface TriggerEvent {
  readonly event: string;
  readonly source: string;
  readonly timestamp: string;
  readonly count?: number;
  readonly cached?: number;
  readonly impactLevel?: string;
  readonly duration_ms?: number;
  readonly status?: string;
  readonly error?: string;
}

interface Props {
  readonly source: Source;
  readonly onClose: () => void;
}

const API_BASE = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3000';

const EVENT_LABELS: Record<string, { label: string; icon: string }> = {
  fetch_start: { label: 'Conectando a la fuente...', icon: '🔄' },
  docs_fetched: { label: 'Documentos obtenidos', icon: '📄' },
  changes_detected: { label: 'Cambios regulatorios detectados', icon: '🔍' },
  embeddings_generated: { label: 'Embeddings generados', icon: '🧠' },
  alerts_triggered: { label: 'Alertas disparadas', icon: '🔔' },
  complete: { label: 'Ingestion completada', icon: '✅' },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TriggerDrawer({ source, onClose }: Props) {
  const [events, setEvents] = useState<TriggerEvent[]>([]);
  const [isRunning, setIsRunning] = useState(true);
  const [progress, setProgress] = useState(0);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const token = sessionStorage.getItem('auth_token') ?? process.env['NEXT_PUBLIC_DEV_TOKEN'];

    const trigger = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/sources/${source.id}/trigger`, {
          method: 'POST',
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });

        if (!res.ok || !res.body) {
          setEvents([{
            event: 'complete',
            source: source.name,
            timestamp: new Date().toISOString(),
            status: 'ERROR',
            error: `HTTP ${res.status}`,
          }]);
          setIsRunning(false);
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        const progressMap: Record<string, number> = {
          fetch_start: 10,
          docs_fetched: 30,
          changes_detected: 50,
          embeddings_generated: 75,
          alerts_triggered: 90,
          complete: 100,
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Parse SSE data lines
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const event = JSON.parse(line.slice(6)) as TriggerEvent;
                setEvents((prev) => [...prev, event]);
                setProgress(progressMap[event.event] ?? 0);

                if (event.event === 'complete') {
                  setIsRunning(false);
                }
              } catch {
                // Skip malformed lines
              }
            }
          }
        }

        setIsRunning(false);
      } catch (err) {
        setEvents((prev) => [...prev, {
          event: 'complete',
          source: source.name,
          timestamp: new Date().toISOString(),
          status: 'ERROR',
          error: err instanceof Error ? err.message : 'Connection failed',
        }]);
        setIsRunning(false);
      }
    };

    trigger();
  }, [source]);

  // Auto-scroll to bottom
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [events]);

  const lastEvent = events[events.length - 1];
  const isError = lastEvent?.status === 'ERROR';
  const isComplete = lastEvent?.event === 'complete' && !isError;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30" onClick={!isRunning ? onClose : undefined} />

      {/* Drawer */}
      <div className="relative w-[420px] bg-white shadow-2xl flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 bg-brand-700 text-white">
          <div>
            <h3 className="text-sm font-semibold">Ejecutando: {source.name}</h3>
            <p className="text-xs text-brand-200 mt-0.5">Ingestion manual</p>
          </div>
          <button
            onClick={onClose}
            disabled={isRunning}
            className="text-brand-200 hover:text-white disabled:opacity-30 text-lg"
          >
            ✕
          </button>
        </div>

        {/* Progress bar */}
        <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
          <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
            <span>{isRunning ? 'Procesando...' : isError ? 'Error' : 'Completado'}</span>
            <span>{progress}%</span>
          </div>
          <div className="h-2 w-full bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ease-out ${
                isError ? 'bg-red-500' : isComplete ? 'bg-green-500' : 'bg-brand-700'
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Event log */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {events.map((evt, i) => {
            const meta = EVENT_LABELS[evt.event];
            const icon = meta?.icon ?? '📌';
            const label = meta?.label ?? evt.event;

            return (
              <div key={i} className="flex gap-3 text-sm">
                <span className="text-base flex-shrink-0 mt-0.5">{icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-gray-900 font-medium">{label}</p>
                  <div className="text-xs text-gray-500 space-y-0.5 mt-0.5">
                    {evt.count !== undefined && (
                      <p>Cantidad: <span className="font-mono font-medium text-gray-700">{evt.count}</span></p>
                    )}
                    {evt.cached !== undefined && (
                      <p>En cache: <span className="font-mono font-medium text-gray-700">{evt.cached}</span></p>
                    )}
                    {evt.impactLevel && (
                      <p>
                        Impacto:{' '}
                        <span className={`font-medium ${
                          evt.impactLevel === 'HIGH' ? 'text-red-600' :
                          evt.impactLevel === 'MEDIUM' ? 'text-amber-600' : 'text-green-600'
                        }`}>
                          {evt.impactLevel}
                        </span>
                      </p>
                    )}
                    {evt.duration_ms !== undefined && (
                      <p>Duración: <span className="font-mono font-medium text-gray-700">{(evt.duration_ms / 1000).toFixed(1)}s</span></p>
                    )}
                    {evt.error && (
                      <p className="text-red-500">{evt.error}</p>
                    )}
                    <p className="text-gray-400">
                      {new Date(evt.timestamp).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}

          {isRunning && (
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Esperando próximo evento...
            </div>
          )}

          <div ref={logEndRef} />
        </div>

        {/* Summary footer */}
        {!isRunning && (
          <div className={`px-5 py-4 border-t ${isError ? 'bg-red-50' : 'bg-green-50'}`}>
            {isError ? (
              <div className="flex items-center gap-2 text-sm text-red-700">
                <span className="text-base">❌</span>
                <span>Error en la ingestion: {lastEvent?.error ?? 'Error desconocido'}</span>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-green-700">
                  <span className="text-base">✅</span>
                  <span>Ingestion completada exitosamente</span>
                </div>
                <button
                  onClick={onClose}
                  className="w-full btn-primary text-center"
                >
                  Cerrar
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
