// ============================================================================
// FILE: apps/web/app/clients/page.tsx
// Clients list — fetches real data from API. Soft delete support.
// ============================================================================

'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const API_BASE = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3000';

interface Client {
  readonly id: string;
  readonly name: string;
  readonly countries: readonly string[];
  readonly companyType: string;
  readonly industries: readonly string[];
  readonly contactEmail: string;
  readonly isActive: boolean;
  readonly onboardedAt: string;
}

const COUNTRY_FLAGS: Record<string, string> = {
  US: '🇺🇸', EU: '🇪🇺', ES: '🇪🇸', DE: '🇩🇪', FR: '🇫🇷', BR: '🇧🇷',
  MX: '🇲🇽', AR: '🇦🇷', IT: '🇮🇹', NL: '🇳🇱', SG: '🇸🇬',
};

export default function ClientsPage() {
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [confirmClient, setConfirmClient] = useState<Client | null>(null);

  const fetchClients = useCallback(async () => {
    try {
      const token = sessionStorage.getItem('auth_token') ?? process.env['NEXT_PUBLIC_DEV_TOKEN'] ?? null;
      const res = await fetch(`${API_BASE}/api/clients?pageSize=50`, {
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (res.ok) {
        const body = await res.json();
        setClients((body.data ?? []) as Client[]);
      }
    } catch {
      // API not available
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchClients(); }, [fetchClients]);

  const handleDeleteClick = (e: React.MouseEvent, client: Client) => {
    e.preventDefault();
    e.stopPropagation();
    setConfirmClient(client);
  };

  const handleConfirmDelete = async () => {
    if (!confirmClient) return;
    setDeletingId(confirmClient.id);
    setConfirmClient(null);
    try {
      const token = sessionStorage.getItem('auth_token') ?? process.env['NEXT_PUBLIC_DEV_TOKEN'] ?? null;
      const res = await fetch(`${API_BASE}/api/clients/${confirmClient.id}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const updated = await res.json();
        setClients((prev) => prev.map((c) => (c.id === confirmClient.id ? updated : c)));
      }
    } catch {
      // Error
    } finally {
      setDeletingId(null);
    }
  };

  const activeClients = clients.filter((c) => c.isActive);
  const inactiveClients = clients.filter((c) => !c.isActive);
  const displayClients = showInactive ? clients : activeClients;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Clientes</h1>
          <p className="text-sm text-gray-500 mt-1">
            {activeClients.length} activos
            {inactiveClients.length > 0 && (
              <span className="text-gray-400"> · {inactiveClients.length} inactivos</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {inactiveClients.length > 0 && (
            <button
              onClick={() => setShowInactive(!showInactive)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                showInactive ? 'bg-gray-100 border-gray-300 text-gray-700' : 'border-gray-200 text-gray-400'
              }`}
            >
              {showInactive ? 'Ocultar inactivos' : 'Mostrar inactivos'}
            </button>
          )}
          <Link href="/onboarding" className="btn-primary text-sm">
            + Nuevo cliente
          </Link>
        </div>
      </div>

      {/* Client list */}
      {loading ? (
        <div className="card p-12 text-center">
          <p className="text-sm text-gray-500">Cargando clientes...</p>
        </div>
      ) : displayClients.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-sm text-gray-500">No hay clientes registrados</p>
          <Link href="/onboarding" className="text-sm text-brand-700 hover:underline mt-2 inline-block">
            Crear primer cliente
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {displayClients.map((client) => (
            <div
              key={client.id}
              className={`card p-5 transition-all group relative ${
                client.isActive
                  ? 'hover:border-brand-300 hover:shadow-md'
                  : 'opacity-50 border-dashed'
              }`}
            >
              {/* Clickable area — navigate to detail */}
              <Link href={`/clients/${client.id}`} className="block">
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-gray-900 group-hover:text-brand-700 truncate">
                      {client.name}
                    </h3>
                    <p className="text-xs text-gray-500 mt-0.5">{client.companyType}</p>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${
                    client.isActive
                      ? 'bg-green-100 text-green-700'
                      : 'bg-gray-100 text-gray-500'
                  }`}>
                    {client.isActive ? 'Activo' : 'Inactivo'}
                  </span>
                </div>

                {/* Countries */}
                <div className="flex items-center gap-1.5 mt-3">
                  {client.countries.map((c) => (
                    <span key={c} className="inline-flex items-center gap-1 text-xs text-gray-600 bg-gray-50 px-2 py-0.5 rounded">
                      <span>{COUNTRY_FLAGS[c] ?? ''}</span>
                      {c}
                    </span>
                  ))}
                </div>

                {/* Industries */}
                <div className="flex flex-wrap gap-1 mt-2">
                  {client.industries.slice(0, 3).map((ind) => (
                    <span key={ind} className="text-[10px] text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded">
                      {ind}
                    </span>
                  ))}
                  {client.industries.length > 3 && (
                    <span className="text-[10px] text-gray-400">+{client.industries.length - 3}</span>
                  )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-50">
                  <span className="text-[10px] text-gray-400">{client.contactEmail}</span>
                  <span className="text-[10px] text-gray-400">
                    {new Date(client.onboardedAt).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                </div>
              </Link>

              {/* Delete button — bottom right, separate from link */}
              {client.isActive && (
                <div className="flex justify-end mt-2">
                  <button
                    onClick={(e) => handleDeleteClick(e, client)}
                    disabled={deletingId === client.id}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-xs text-gray-400 hover:text-red-500 disabled:opacity-30 flex items-center gap-1"
                    title="Desactivar cliente"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Desactivar
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {/* Confirm deactivate modal */}
      {confirmClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setConfirmClient(null)}
          />

          {/* Modal */}
          <div className="relative bg-white rounded-xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
            {/* Header strip */}
            <div className="h-1.5 bg-gradient-to-r from-red-500 to-amber-500" />

            <div className="p-6">
              {/* Icon */}
              <div className="mx-auto w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
              </div>

              {/* Content */}
              <h3 className="text-lg font-semibold text-gray-900 text-center">
                Desactivar cliente
              </h3>
              <p className="text-sm text-gray-500 text-center mt-2">
                Estas por desactivar a <span className="font-semibold text-gray-700">{confirmClient.name}</span>.
                El cliente no sera eliminado de la base de datos.
              </p>

              {/* Info box */}
              <div className="mt-4 p-3 rounded-lg bg-amber-50 border border-amber-200">
                <div className="flex gap-2">
                  <svg className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div className="text-xs text-amber-800">
                    <p className="font-medium">Que implica desactivar?</p>
                    <ul className="mt-1 space-y-0.5 text-amber-700">
                      <li>El cliente dejara de recibir alertas</li>
                      <li>Sus obligaciones quedaran en estado actual</li>
                      <li>Los datos historicos se mantienen intactos</li>
                      <li>Podes reactivarlo en cualquier momento</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Client summary */}
              <div className="mt-4 p-3 rounded-lg bg-gray-50 border border-gray-100 flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-sm font-bold">
                  {confirmClient.name.charAt(0)}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{confirmClient.name}</p>
                  <p className="text-[11px] text-gray-500">
                    {confirmClient.companyType} — {confirmClient.countries.join(', ')}
                  </p>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-3">
              <button
                onClick={() => setConfirmClient(null)}
                className="text-sm px-4 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmDelete}
                className="text-sm px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors font-medium"
              >
                Desactivar cliente
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
