// ============================================================================
// FILE: apps/web/components/onboarding/StepBasicInfo.tsx
// Step 1: Client basic info — name, company type, industries, email.
// ============================================================================

'use client';

interface StepBasicInfoProps {
  readonly data: BasicInfoData;
  readonly onChange: (data: BasicInfoData) => void;
  readonly onNext: () => void;
}

export interface BasicInfoData {
  name: string;
  companyType: string;
  industries: string[];
  contactEmail: string;
}

const COMPANY_TYPES = [
  'Public Company',
  'Financial Institution',
  'Private Company',
] as const;

const INDUSTRIES = [
  { id: 'banking', label: 'Banca' },
  { id: 'insurance', label: 'Seguros' },
  { id: 'securities', label: 'Valores' },
  { id: 'asset-management', label: 'Gestión de Activos' },
  { id: 'fintech', label: 'Fintech' },
  { id: 'energy', label: 'Energía' },
  { id: 'technology', label: 'Tecnología' },
  { id: 'manufacturing', label: 'Manufactura' },
  { id: 'retail', label: 'Retail' },
  { id: 'healthcare', label: 'Salud' },
] as const;

export function StepBasicInfo({ data, onChange, onNext }: StepBasicInfoProps) {
  const isValid =
    data.name.trim().length > 0 &&
    data.companyType.length > 0 &&
    data.industries.length > 0 &&
    data.contactEmail.includes('@');

  const toggleIndustry = (id: string) => {
    const next = data.industries.includes(id)
      ? data.industries.filter((i) => i !== id)
      : [...data.industries, id];
    onChange({ ...data, industries: next });
  };

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h2 className="text-lg font-bold text-gray-900">Datos del cliente</h2>
        <p className="text-sm text-gray-500 mt-1">
          Información básica para generar el mapa de compliance.
        </p>
      </div>

      {/* Name */}
      <div>
        <label htmlFor="name" className="label">Nombre de la empresa</label>
        <input
          id="name"
          type="text"
          value={data.name}
          onChange={(e) => onChange({ ...data, name: e.target.value })}
          placeholder="Ej: Acme Financial Corp"
          className="input"
        />
      </div>

      {/* Company type */}
      <div>
        <label className="label">Tipo de empresa</label>
        <div className="grid grid-cols-3 gap-2">
          {COMPANY_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => onChange({ ...data, companyType: type })}
              className={`px-3 py-2.5 rounded-md border text-sm transition-colors ${
                data.companyType === type
                  ? 'border-brand-700 bg-brand-50 text-brand-700 font-medium'
                  : 'border-gray-200 text-gray-600 hover:border-gray-300'
              }`}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      {/* Industries */}
      <div>
        <label className="label">Industrias (seleccionar todas las aplicables)</label>
        <div className="flex flex-wrap gap-2">
          {INDUSTRIES.map((ind) => (
            <button
              key={ind.id}
              type="button"
              onClick={() => toggleIndustry(ind.id)}
              className={`px-3 py-1.5 rounded-full border text-xs transition-colors ${
                data.industries.includes(ind.id)
                  ? 'border-brand-700 bg-brand-700 text-white'
                  : 'border-gray-200 text-gray-600 hover:border-gray-300'
              }`}
            >
              {ind.label}
            </button>
          ))}
        </div>
      </div>

      {/* Email */}
      <div>
        <label htmlFor="email" className="label">Email de contacto compliance</label>
        <input
          id="email"
          type="email"
          value={data.contactEmail}
          onChange={(e) => onChange({ ...data, contactEmail: e.target.value })}
          placeholder="compliance@empresa.com"
          className="input"
        />
      </div>

      {/* Next */}
      <div className="flex justify-end pt-4">
        <button
          onClick={onNext}
          disabled={!isValid}
          className="btn-primary"
        >
          Siguiente: Seleccionar países →
        </button>
      </div>
    </div>
  );
}
