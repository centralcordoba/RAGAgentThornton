// ============================================================================
// FILE: apps/web/components/ui/CountryFlag.tsx
// Country flag emoji + name component.
// ============================================================================

'use client';

interface CountryFlagProps {
  readonly code: string;
  readonly showName?: boolean;
  readonly size?: 'xs' | 'sm' | 'md' | 'lg';
}

const COUNTRY_DATA: Readonly<Record<string, { flag: string; name: string }>> = {
  AR: { flag: '🇦🇷', name: 'Argentina' },
  BR: { flag: '🇧🇷', name: 'Brasil' },
  MX: { flag: '🇲🇽', name: 'México' },
  ES: { flag: '🇪🇸', name: 'España' },
  US: { flag: '🇺🇸', name: 'Estados Unidos' },
  SG: { flag: '🇸🇬', name: 'Singapur' },
  EU: { flag: '🇪🇺', name: 'Unión Europea' },
};

const SIZE_CLASSES = {
  xs: 'text-xs',
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-xl',
} as const;

export function CountryFlag({ code, showName = false, size = 'md' }: CountryFlagProps) {
  const country = COUNTRY_DATA[code];
  const flag = country?.flag ?? '🏳️';
  const name = country?.name ?? code;

  return (
    <span className={`inline-flex items-center gap-1.5 ${SIZE_CLASSES[size]}`}>
      <span role="img" aria-label={name}>{flag}</span>
      {showName && <span className="text-sm text-gray-700">{name}</span>}
    </span>
  );
}

export function getCountryName(code: string): string {
  return COUNTRY_DATA[code]?.name ?? code;
}
