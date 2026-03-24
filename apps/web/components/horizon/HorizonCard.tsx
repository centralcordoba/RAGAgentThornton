// ============================================================================
// FILE: apps/web/components/horizon/HorizonCard.tsx
// Card for a proposed regulation with probability, timeline, and stage badge.
// ============================================================================

'use client';

import { CountryFlag } from '../ui/CountryFlag';

interface Proposal {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly country: string;
  readonly impactLevel: string;
  readonly stage: string;
  readonly approvalProbability: number | null;
  readonly commentDeadline: string | null;
  readonly proposedEffectiveDate: string | null;
  readonly estimatedFinalDate: string | null;
  readonly proposingAgency: string | null;
  readonly publishedDate: string;
  readonly sourceUrl: string;
  readonly affectedAreas: readonly string[];
}

interface Props {
  readonly proposal: Proposal;
}

const STAGE_STYLE: Record<string, { bg: string; text: string; label: string; dot: string }> = {
  PROPOSED: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Propuesta', dot: 'bg-blue-500' },
  COMMENT_PERIOD: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Periodo de Comentarios', dot: 'bg-amber-500' },
  FINAL_RULE: { bg: 'bg-purple-100', text: 'text-purple-700', label: 'Regla Final', dot: 'bg-purple-500' },
};

const IMPACT_STYLE: Record<string, { bg: string; text: string }> = {
  HIGH: { bg: 'bg-red-100', text: 'text-red-700' },
  MEDIUM: { bg: 'bg-amber-100', text: 'text-amber-700' },
  LOW: { bg: 'bg-green-100', text: 'text-green-700' },
};

export function HorizonCard({ proposal }: Props) {
  const stageStyle = STAGE_STYLE[proposal.stage] ?? STAGE_STYLE['PROPOSED']!;
  const impactStyle = IMPACT_STYLE[proposal.impactLevel] ?? IMPACT_STYLE['MEDIUM']!;
  const probability = proposal.approvalProbability != null ? Math.round(proposal.approvalProbability * 100) : null;

  const commentDaysLeft = proposal.commentDeadline
    ? Math.ceil((new Date(proposal.commentDeadline).getTime() - Date.now()) / 86_400_000)
    : null;

  const probColor = probability !== null
    ? probability >= 70 ? '#ef4444' : probability >= 50 ? '#f59e0b' : '#22c55e'
    : '#9ca3af';

  return (
    <div className="card p-4 hover:border-brand-300 hover:shadow-md transition-all group">
      <div className="flex items-start gap-4">
        {/* Probability ring */}
        <div className="flex-shrink-0 relative">
          <svg className="w-14 h-14" viewBox="0 0 56 56">
            {/* Background ring */}
            <circle cx="28" cy="28" r="24" fill="none" stroke="#f0f0f0" strokeWidth="4" />
            {/* Progress ring */}
            {probability !== null && (
              <circle
                cx="28" cy="28" r="24"
                fill="none"
                stroke={probColor}
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray={`${(probability / 100) * 150.8} 150.8`}
                transform="rotate(-90 28 28)"
                className="transition-all duration-700"
              />
            )}
            {/* Center text */}
            <text x="28" y="25" textAnchor="middle" className="text-[11px] font-bold" fill={probColor}>
              {probability ?? '?'}%
            </text>
            <text x="28" y="35" textAnchor="middle" className="text-[7px]" fill="#9ca3af">
              prob.
            </text>
          </svg>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Header: stage + impact + country */}
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 ${stageStyle.bg} ${stageStyle.text}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${stageStyle.dot}`} />
              {stageStyle.label}
            </span>
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${impactStyle.bg} ${impactStyle.text}`}>
              {proposal.impactLevel}
            </span>
            <CountryFlag code={proposal.country} size="sm" />
            {proposal.proposingAgency && (
              <span className="text-[10px] text-gray-400">{proposal.proposingAgency}</span>
            )}
          </div>

          {/* Title */}
          <h3 className="text-sm font-semibold text-gray-900 group-hover:text-brand-700 line-clamp-2">
            {proposal.title}
          </h3>

          {/* Summary */}
          <p className="text-[11px] text-gray-500 mt-1 line-clamp-2">{proposal.summary}</p>

          {/* Timeline row */}
          <div className="flex items-center gap-4 mt-2.5 flex-wrap">
            {/* Comment deadline */}
            {commentDaysLeft !== null && (
              <div className={`flex items-center gap-1 text-[11px] ${
                commentDaysLeft < 0 ? 'text-gray-400' :
                commentDaysLeft <= 14 ? 'text-red-600 font-semibold' :
                commentDaysLeft <= 30 ? 'text-amber-600' : 'text-gray-600'
              }`}>
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                {commentDaysLeft < 0
                  ? `Comentarios cerrados`
                  : `${commentDaysLeft}d para comentar`}
              </div>
            )}

            {/* Estimated final date */}
            {proposal.estimatedFinalDate && (
              <div className="flex items-center gap-1 text-[11px] text-gray-500">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Final est: {proposal.estimatedFinalDate.split('T')[0]}
              </div>
            )}

            {/* Published date */}
            <span className="text-[10px] text-gray-400">
              Pub: {proposal.publishedDate.split('T')[0]}
            </span>
          </div>

          {/* Areas */}
          <div className="flex flex-wrap gap-1 mt-2">
            {proposal.affectedAreas.slice(0, 4).map((area) => (
              <span key={area} className="text-[9px] text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded">
                {area}
              </span>
            ))}
          </div>
        </div>

        {/* Source link */}
        <a
          href={proposal.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-shrink-0 text-gray-300 hover:text-brand-600 transition-colors mt-1"
          title="Ver fuente"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
          </svg>
        </a>
      </div>
    </div>
  );
}
