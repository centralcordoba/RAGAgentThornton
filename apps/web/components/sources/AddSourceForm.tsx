// ============================================================================
// FILE: apps/web/components/sources/AddSourceForm.tsx
// Modal form to add a new regulatory source with connection test + preview.
// ============================================================================

'use client';

import { useState } from 'react';
import { CountryFlag, getCountryName } from '../ui/CountryFlag';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Props {
  readonly onClose: () => void;
  readonly onCreated: () => void;
}

interface HeaderEntry {
  key: string;
  value: string;
}

interface PreviewDoc {
  readonly title: string;
  readonly date: string;
  readonly url: string;
  readonly snippet: string;
}

interface TestResult {
  readonly success: boolean;
  readonly statusCode: number | null;
  readonly errorMessage: string | null;
  readonly preview: readonly PreviewDoc[];
}

const COUNTRIES = ['US', 'EU', 'ES', 'MX', 'BR', 'AR', 'CL', 'CO', 'PE', 'UY'] as const;

const CONNECTOR_TYPES = [
  { value: 'API', label: 'API REST' },
  { value: 'RSS', label: 'RSS + XML' },
  { value: 'SCRAPING', label: 'Scraping' },
] as const;

const FREQUENCIES = [
  { value: 'every_10min', label: 'Cada 10 minutos' },
  { value: 'hourly', label: 'Cada hora' },
  { value: 'daily', label: 'Diario' },
] as const;

const API_BASE = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3000';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AddSourceForm({ onClose, onCreated }: Props) {
  // Form state
  const [name, setName] = useState('');
  const [country, setCountry] = useState('US');
  const [type, setType] = useState<'API' | 'RSS' | 'SCRAPING'>('API');
  const [baseUrl, setBaseUrl] = useState('');
  const [headers, setHeaders] = useState<HeaderEntry[]>([]);
  const [frequency, setFrequency] = useState<'every_10min' | 'hourly' | 'daily'>('hourly');
  const [regulatoryArea, setRegulatoryArea] = useState('');

  // Test state
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  // Save state
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const headersRecord = (): Record<string, string> => {
    const record: Record<string, string> = {};
    for (const h of headers) {
      if (h.key.trim()) record[h.key.trim()] = h.value;
    }
    return record;
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);

    try {
      const token = sessionStorage.getItem('auth_token') ?? process.env['NEXT_PUBLIC_DEV_TOKEN'] ?? null;
      const res = await fetch(`${API_BASE}/api/sources/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          type,
          baseUrl,
          headers: headersRecord(),
        }),
      });
      const result: TestResult = await res.json();
      setTestResult(result);
    } catch (err) {
      setTestResult({
        success: false,
        statusCode: null,
        errorMessage: err instanceof Error ? err.message : 'Connection failed',
        preview: [],
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);

    try {
      const token = sessionStorage.getItem('auth_token') ?? process.env['NEXT_PUBLIC_DEV_TOKEN'] ?? null;
      const res = await fetch(`${API_BASE}/api/sources`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          name,
          country,
          type,
          frequency,
          baseUrl,
          headers: headersRecord(),
          regulatoryArea,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error(body.message ?? `HTTP ${res.status}`);
      }

      onCreated();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const isValid = name.trim() && baseUrl.trim() && regulatoryArea.trim();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-xl shadow-2xl w-[640px] max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">Nueva Fuente Regulatoria</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Row 1: Type + Country */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Tipo de conector</label>
              <div className="flex gap-2">
                {CONNECTOR_TYPES.map((ct) => (
                  <button
                    key={ct.value}
                    onClick={() => setType(ct.value as 'API' | 'RSS' | 'SCRAPING')}
                    className={`flex-1 text-xs px-3 py-2 rounded-md border transition-colors ${
                      type === ct.value
                        ? 'bg-brand-700 text-white border-brand-700'
                        : 'border-gray-200 text-gray-600 hover:border-brand-700'
                    }`}
                  >
                    {ct.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="label">País</label>
              <select
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="input"
              >
                {COUNTRIES.map((c) => (
                  <option key={c} value={c}>
                    {getCountryName(c)} ({c})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Row 2: Name */}
          <div>
            <label className="label">Nombre del regulador</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: SEC EDGAR, CMF Chile, Infoleg Argentina"
              className="input"
            />
          </div>

          {/* Row 3: URL */}
          <div>
            <label className="label">URL base</label>
            <input
              type="url"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.regulador.gov/v1/documents"
              className="input font-mono text-xs"
            />
          </div>

          {/* Row 4: Headers */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="label mb-0">Headers opcionales</label>
              <button
                onClick={() => setHeaders([...headers, { key: '', value: '' }])}
                className="text-xs text-brand-700 hover:underline"
              >
                + Agregar header
              </button>
            </div>
            {headers.length > 0 && (
              <div className="space-y-2">
                {headers.map((h, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      type="text"
                      value={h.key}
                      onChange={(e) => {
                        const updated = [...headers];
                        updated[i] = { ...h, key: e.target.value };
                        setHeaders(updated);
                      }}
                      placeholder="Key"
                      className="input flex-1 font-mono text-xs"
                    />
                    <input
                      type="text"
                      value={h.value}
                      onChange={(e) => {
                        const updated = [...headers];
                        updated[i] = { ...h, value: e.target.value };
                        setHeaders(updated);
                      }}
                      placeholder="Value"
                      className="input flex-1 font-mono text-xs"
                    />
                    <button
                      onClick={() => setHeaders(headers.filter((_, j) => j !== i))}
                      className="text-gray-400 hover:text-red-500 px-1"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Row 5: Frequency + Area */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Frecuencia</label>
              <select
                value={frequency}
                onChange={(e) => setFrequency(e.target.value as 'every_10min' | 'hourly' | 'daily')}
                className="input"
              >
                {FREQUENCIES.map((f) => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="label">Área regulatoria</label>
              <input
                type="text"
                value={regulatoryArea}
                onChange={(e) => setRegulatoryArea(e.target.value)}
                placeholder="Ej: banking, securities"
                className="input"
              />
            </div>
          </div>

          {/* Test connection */}
          <div className="border-t border-gray-100 pt-4">
            <button
              onClick={handleTest}
              disabled={!baseUrl.trim() || testing}
              className="btn-secondary flex items-center gap-2"
            >
              {testing ? (
                <>
                  <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Testeando...
                </>
              ) : (
                <>🔌 Testear conexión</>
              )}
            </button>

            {/* Test result */}
            {testResult && (
              <div className={`mt-3 rounded-lg border p-3 ${
                testResult.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
              }`}>
                <p className={`text-sm font-medium ${testResult.success ? 'text-green-700' : 'text-red-700'}`}>
                  {testResult.success
                    ? `✅ Conexión exitosa (HTTP ${testResult.statusCode})`
                    : `❌ ${testResult.errorMessage}`
                  }
                  {testResult.statusCode && !testResult.success && (
                    <span className="ml-1 text-xs">(HTTP {testResult.statusCode})</span>
                  )}
                </p>

                {/* Preview docs */}
                {testResult.preview.length > 0 && (
                  <div className="mt-3 space-y-2">
                    <p className="text-xs font-medium text-gray-500 uppercase">
                      Preview ({testResult.preview.length} documentos)
                    </p>
                    {testResult.preview.map((doc, i) => (
                      <div key={i} className="bg-white rounded border border-gray-200 p-2.5 text-xs">
                        <p className="font-medium text-gray-900 line-clamp-1">{doc.title}</p>
                        {doc.date && (
                          <p className="text-gray-400 mt-0.5">{doc.date}</p>
                        )}
                        <p className="text-gray-500 mt-1 line-clamp-2">{doc.snippet}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Save error */}
          {saveError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
              {saveError}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl">
          <button onClick={onClose} className="btn-secondary">
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={!isValid || saving}
            className="btn-primary flex items-center gap-2"
          >
            {saving ? (
              <>
                <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Guardando...
              </>
            ) : (
              'Guardar y activar'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
