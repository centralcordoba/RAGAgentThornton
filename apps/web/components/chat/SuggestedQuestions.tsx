// ============================================================================
// FILE: apps/web/components/chat/SuggestedQuestions.tsx
// Context-aware suggested questions based on client state.
// ============================================================================

'use client';

interface SuggestedQuestionsProps {
  readonly clientId: string | null;
  readonly clientName?: string;
  readonly countries?: readonly string[];
  readonly pendingObligations?: number;
  readonly onSelect: (question: string) => void;
}

export function SuggestedQuestions({
  clientId,
  clientName,
  countries,
  pendingObligations,
  onSelect,
}: SuggestedQuestionsProps) {
  const questions = generateQuestions(clientId, clientName, countries, pendingObligations);

  if (questions.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 px-4 py-3">
      {questions.map((q, i) => (
        <button
          key={i}
          onClick={() => onSelect(q.text)}
          className="text-xs px-3 py-1.5 rounded-full border border-brand-200 text-brand-700
                     bg-brand-50 hover:bg-brand-100 transition-colors text-left"
        >
          {q.icon} {q.text}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Question generation
// ---------------------------------------------------------------------------

interface SuggestedQuestion {
  readonly text: string;
  readonly icon: string;
}

function generateQuestions(
  clientId: string | null,
  clientName?: string,
  countries?: readonly string[],
  pendingObligations?: number,
): SuggestedQuestion[] {
  if (!clientId) {
    return [
      { text: '¿Cuáles son los cambios regulatorios más recientes?', icon: '📜' },
      { text: '¿Qué deadlines son críticos este mes?', icon: '⏰' },
      { text: '¿Qué países tienen mayor riesgo regulatorio?', icon: '🌍' },
    ];
  }

  const questions: SuggestedQuestion[] = [];

  if (pendingObligations && pendingObligations > 0) {
    questions.push({
      text: `¿Cuáles son las ${pendingObligations} obligaciones pendientes y cómo priorizarlas?`,
      icon: '📋',
    });
  }

  if (countries && countries.length > 0) {
    const countryList = countries.slice(0, 2).join(' y ');
    questions.push({
      text: `¿Qué cambios regulatorios recientes afectan a ${clientName ?? 'este cliente'} en ${countryList}?`,
      icon: '🔔',
    });
  }

  questions.push({
    text: `¿Cuáles son los próximos deadlines críticos para ${clientName ?? 'este cliente'}?`,
    icon: '⏰',
  });

  return questions.slice(0, 3);
}
