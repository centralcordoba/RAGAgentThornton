// ============================================================================
// FILE: apps/web/app/onboarding/page.tsx
// 4-step onboarding wizard.
// Step 1: Basic info → Step 2: Countries → Step 3: Analyzing → Step 4: Result
// ============================================================================

'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Stepper, ONBOARDING_STEPS } from '@/components/onboarding/Stepper';
import { StepBasicInfo } from '@/components/onboarding/StepBasicInfo';
import type { BasicInfoData } from '@/components/onboarding/StepBasicInfo';
import { StepCountries } from '@/components/onboarding/StepCountries';
import { StepAnalyzing } from '@/components/onboarding/StepAnalyzing';
import { StepResult } from '@/components/onboarding/StepResult';
import type { ComplianceMapResult } from '@/components/onboarding/StepResult';

export default function OnboardingPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [isSaving, setIsSaving] = useState(false);

  // Form state
  const [basicInfo, setBasicInfo] = useState<BasicInfoData>({
    name: '',
    companyType: '',
    industries: [],
    contactEmail: '',
  });
  const [countries, setCountries] = useState<string[]>([]);
  const [result, setResult] = useState<ComplianceMapResult | null>(null);

  // Step 3 → Step 4: simulate API call
  const startAnalysis = useCallback(async () => {
    setCurrentStep(2); // Show analyzing animation

    // In production: call api.clients.create() then wait for ComplianceMap
    // const client = await api.clients.create({ ...basicInfo, countries });
    // const complianceMap = await pollForComplianceMap(client.id);

    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 12_000));

    // Set mock result
    setResult(generateMockResult(basicInfo, countries));
    setCurrentStep(3); // Show result
  }, [basicInfo, countries]);

  // Save client
  const handleSave = useCallback(async () => {
    setIsSaving(true);
    // In production: api.clients.create() if not already created
    await new Promise((resolve) => setTimeout(resolve, 1500));
    setIsSaving(false);
    router.push('/clients');
  }, [router]);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-xl font-bold text-gray-900">Onboarding de nuevo cliente</h1>
        <p className="text-sm text-gray-500 mt-1">
          Genera un mapa de compliance personalizado en minutos
        </p>
      </div>

      {/* Stepper */}
      <Stepper steps={ONBOARDING_STEPS} currentStep={currentStep} />

      {/* Step content */}
      <div className="mt-8">
        {currentStep === 0 && (
          <StepBasicInfo
            data={basicInfo}
            onChange={setBasicInfo}
            onNext={() => setCurrentStep(1)}
          />
        )}

        {currentStep === 1 && (
          <StepCountries
            selected={countries}
            onChange={setCountries}
            onNext={() => void startAnalysis()}
            onBack={() => setCurrentStep(0)}
          />
        )}

        {currentStep === 2 && (
          <StepAnalyzing
            countries={countries}
            clientName={basicInfo.name}
          />
        )}

        {currentStep === 3 && result && (
          <StepResult
            result={result}
            clientName={basicInfo.name}
            onSave={() => void handleSave()}
            onBack={() => setCurrentStep(1)}
            isSaving={isSaving}
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mock result generator
// ---------------------------------------------------------------------------

function generateMockResult(info: BasicInfoData, countries: string[]): ComplianceMapResult {
  const countryResults = countries.map((code) => {
    const oblCount = 5 + Math.floor(Math.random() * 6);
    const areas = ['fiscal', 'labor', 'corporate'];
    const regulators: Record<string, string> = {
      US: 'IRS / SEC', AR: 'AFIP / CNV', BR: 'Receita Federal / CVM',
      MX: 'SAT / CNBV', ES: 'AEAT / CNMV', CL: 'SII / CMF',
    };

    const obligations = Array.from({ length: oblCount }, (_, i) => {
      const area = areas[i % areas.length]!;
      const urgencyRoll = Math.random();
      const urgency = urgencyRoll < 0.2 ? 'CRITICAL' : urgencyRoll < 0.5 ? 'IMPORTANT' : 'NORMAL';
      const daysAhead = urgency === 'CRITICAL' ? 10 + i * 3 : urgency === 'IMPORTANT' ? 40 + i * 10 : 100 + i * 15;
      const dueDate = new Date(Date.now() + daysAhead * 86_400_000).toISOString().split('T')[0]!;

      return {
        id: `obl-${code}-${i}`,
        title: `${area === 'fiscal' ? 'Declaración' : area === 'labor' ? 'Registro' : 'Informe'} ${code}-${i + 1}`,
        area,
        regulator: regulators[code] ?? 'Regulador local',
        dueDate,
        urgency,
        penaltyInfo: urgency === 'CRITICAL' ? 'Multa por incumplimiento' : 'Recargo por presentación tardía',
      };
    });

    const criticalDeadlines = obligations
      .filter((o) => o.urgency === 'CRITICAL')
      .map((o) => ({
        obligationTitle: o.title,
        dueDate: o.dueDate,
        daysUntilDue: Math.ceil((new Date(o.dueDate).getTime() - Date.now()) / 86_400_000),
        urgency: o.urgency,
      }));

    return {
      country: code,
      riskScore: 20 + Math.floor(Math.random() * 60),
      obligations,
      criticalDeadlines,
    };
  });

  const totalObligations = countryResults.reduce((sum, c) => sum + c.obligations.length, 0);
  const criticalCount = countryResults.reduce((sum, c) => sum + c.criticalDeadlines.length, 0);
  const importantCount = countryResults.reduce(
    (sum, c) => sum + c.obligations.filter((o) => o.urgency === 'IMPORTANT').length, 0,
  );

  return {
    countries: countryResults,
    executiveSummary: {
      es: `${info.name} opera como ${info.companyType} en ${countries.length} jurisdicciones. Se identificaron ${totalObligations} obligaciones regulatorias, de las cuales ${criticalCount} son críticas (vencen en menos de 30 días) y ${importantCount} son importantes (vencen en menos de 90 días). Se recomienda priorizar las obligaciones fiscales en las jurisdicciones con mayor riesgo y establecer un calendario unificado de cumplimiento.`,
      en: `${info.name} operates as ${info.companyType} across ${countries.length} jurisdictions. ${totalObligations} regulatory obligations were identified, of which ${criticalCount} are critical (due within 30 days) and ${importantCount} are important (due within 90 days). It is recommended to prioritize fiscal obligations in higher-risk jurisdictions and establish a unified compliance calendar.`,
    },
    immediateActions: [
      `URGENTE: ${criticalCount} obligaciones vencen en menos de 30 días. Revisar y asignar responsables inmediatamente.`,
      ...countryResults.flatMap((c) =>
        c.criticalDeadlines.slice(0, 2).map((d) =>
          `→ ${d.obligationTitle} (${c.country}): vence ${d.dueDate} (${d.daysUntilDue} días)`,
        ),
      ),
      `PLANIFICAR: ${importantCount} obligaciones vencen entre 30 y 90 días. Iniciar preparación.`,
      `COORDINAR: Se detectaron áreas regulatorias comunes en múltiples países. Consolidar gestión.`,
    ],
    stats: {
      totalObligations,
      criticalCount,
      importantCount,
      countriesCount: countries.length,
    },
  };
}
