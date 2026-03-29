// ============================================================================
// FILE: apps/web/components/chat/SuggestedQuestions.tsx
// Context-aware suggested questions based on client state and available data.
// ============================================================================

'use client';

interface SuggestedQuestionsProps {
  readonly clientId: string | null;
  readonly clientName?: string;
  readonly countries?: readonly string[];
  readonly pendingObligations?: number;
  readonly onSelect: (question: string) => void;
}

/** Countries with active connectors and data in the system. */
const AVAILABLE_TOPICS: readonly { text: string; icon: string }[] = [
  { text: 'Regulaciones recientes de la SEC sobre crypto', icon: '🇺🇸' },
  { text: 'Propuestas regulatorias de Singapur (MAS)', icon: '🇸🇬' },
  { text: 'Regulaciones de Argentina sobre fintech', icon: '🇦🇷' },
  { text: 'Cambios normativos en Brasil', icon: '🇧🇷' },
  { text: 'Regulaciones europeas sobre ESG y DORA', icon: '🇪🇺' },
  { text: 'Nuevas normas fiscales en Mexico', icon: '🇲🇽' },
];

export function SuggestedQuestions({
  clientId,
  clientName,
  countries,
  pendingObligations,
  onSelect,
}: SuggestedQuestionsProps) {
  const questions = clientId
    ? generateClientQuestions(clientName, countries, pendingObligations)
    : generateGlobalQuestions();

  if (questions.length === 0) return null;

  return (
    <div className="px-4 py-3 space-y-2">
      <p className="text-[10px] text-gray-400 uppercase tracking-wide font-medium">
        Preguntas sugeridas
      </p>
      <div className="flex flex-wrap gap-1.5">
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

function generateGlobalQuestions(): SuggestedQuestion[] {
  // Pick 3 random topics from available data so it doesn't feel static
  const shuffled = [...AVAILABLE_TOPICS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 3);
}

function generateClientQuestions(
  clientName?: string,
  countries?: readonly string[],
  pendingObligations?: number,
): SuggestedQuestion[] {
  const name = clientName ?? 'este cliente';
  const questions: SuggestedQuestion[] = [];

  if (pendingObligations && pendingObligations > 0) {
    questions.push({
      text: `Obligaciones pendientes de ${name} y como priorizarlas`,
      icon: '📋',
    });
  }

  if (countries && countries.length > 0) {
    const countryList = countries.slice(0, 2).join(' y ');
    questions.push({
      text: `Cambios regulatorios recientes que afectan a ${name} en ${countryList}`,
      icon: '🔔',
    });
  }

  questions.push({
    text: `Proximos deadlines criticos para ${name}`,
    icon: '⏰',
  });

  return questions.slice(0, 3);
}
