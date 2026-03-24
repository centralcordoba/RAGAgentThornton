// ============================================================================
// FILE: apps/web/components/regulations/RegulatoryDiff.tsx
// Visual diff viewer showing changed clauses, deadlines, and affected clients.
// ============================================================================

'use client';

interface ChangedClause {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly deadline: string;
  readonly status: string;
  readonly priority: string;
  readonly clientName: string;
}

interface AffectedClient {
  readonly id: string;
  readonly name: string;
  readonly countries: readonly string[];
}

interface Props {
  readonly clauses: readonly ChangedClause[];
  readonly clients: readonly AffectedClient[];
  readonly regulationTitle: string;
}

const STATUS_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  OVERDUE: { bg: 'bg-red-100', text: 'text-red-700', label: 'Vencido' },
  PENDING: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Pendiente' },
  IN_PROGRESS: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'En progreso' },
  COMPLETED: { bg: 'bg-green-100', text: 'text-green-700', label: 'Completado' },
};

const PRIORITY_STYLE: Record<string, { icon: string; color: string }> = {
  HIGH: { icon: '▲', color: 'text-red-500' },
  MEDIUM: { icon: '●', color: 'text-amber-500' },
  LOW: { icon: '▼', color: 'text-green-500' },
};

export function RegulatoryDiff({ clauses, clients, regulationTitle }: Props) {
  if (clauses.length === 0 && clients.length === 0) return null;

  const overdueCount = clauses.filter((c) => c.status === 'OVERDUE').length;
  const pendingCount = clauses.filter((c) => c.status === 'PENDING').length;

  return (
    <div className="space-y-4">
      {/* Section header */}
      <div className="flex items-center gap-2">
        <svg className="w-4 h-4 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
        </svg>
        <h3 className="text-sm font-bold text-gray-900">Impacto Regulatorio</h3>
      </div>

      {/* Impact summary bar */}
      <div className="flex items-center gap-4 p-3 rounded-lg bg-gray-50 border border-gray-100">
        <div className="flex items-center gap-4 text-[11px]">
          <span className="flex items-center gap-1.5">
            <span className="w-5 h-5 rounded bg-brand-100 text-brand-700 flex items-center justify-center text-[10px] font-bold">
              {clauses.length}
            </span>
            <span className="text-gray-600">obligaciones</span>
          </span>
          <span className="text-gray-300">|</span>
          <span className="flex items-center gap-1.5">
            <span className="w-5 h-5 rounded bg-blue-100 text-blue-700 flex items-center justify-center text-[10px] font-bold">
              {clients.length}
            </span>
            <span className="text-gray-600">clientes afectados</span>
          </span>
          {overdueCount > 0 && (
            <>
              <span className="text-gray-300">|</span>
              <span className="flex items-center gap-1.5">
                <span className="w-5 h-5 rounded bg-red-100 text-red-700 flex items-center justify-center text-[10px] font-bold">
                  {overdueCount}
                </span>
                <span className="text-red-600 font-medium">vencidas</span>
              </span>
            </>
          )}
        </div>
      </div>

      {/* Changed clauses / obligations */}
      {clauses.length > 0 && (
        <div className="rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
            <svg className="w-3.5 h-3.5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
            <span className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide">
              Obligaciones derivadas
            </span>
          </div>

          <div className="divide-y divide-gray-100">
            {clauses.map((clause) => {
              const statusStyle = STATUS_STYLE[clause.status] ?? STATUS_STYLE['PENDING']!;
              const priorityStyle = PRIORITY_STYLE[clause.priority] ?? PRIORITY_STYLE['MEDIUM']!;
              const daysUntil = Math.ceil((new Date(clause.deadline).getTime() - Date.now()) / 86_400_000);
              const isOverdue = daysUntil < 0;

              return (
                <div key={clause.id} className={`px-3 py-3 ${isOverdue ? 'bg-red-50/30' : ''}`}>
                  <div className="flex items-start gap-2">
                    {/* Priority indicator */}
                    <span className={`text-[10px] mt-0.5 ${priorityStyle.color}`}>
                      {priorityStyle.icon}
                    </span>

                    <div className="flex-1 min-w-0">
                      {/* Title */}
                      <p className="text-sm font-medium text-gray-900">{clause.title}</p>

                      {/* Description */}
                      {clause.description && (
                        <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-2">{clause.description}</p>
                      )}

                      {/* Meta row */}
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        {/* Status badge */}
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${statusStyle.bg} ${statusStyle.text}`}>
                          {statusStyle.label}
                        </span>

                        {/* Deadline */}
                        <span className={`text-[10px] ${isOverdue ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
                          {clause.deadline}
                          {isOverdue ? ` (${Math.abs(daysUntil)}d vencido)` : ` (${daysUntil}d)`}
                        </span>

                        {/* Client */}
                        <span className="text-[10px] text-gray-400">
                          {clause.clientName}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Affected clients */}
      {clients.length > 0 && (
        <div className="rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
            <svg className="w-3.5 h-3.5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
            </svg>
            <span className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide">
              Clientes afectados
            </span>
          </div>

          <div className="px-3 py-2 flex flex-wrap gap-2">
            {clients.map((client) => (
              <a
                key={client.id}
                href={`/clients/${client.id}`}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-200 hover:border-brand-300 hover:bg-brand-50 transition-colors text-xs"
              >
                <span className="w-5 h-5 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-[9px] font-bold">
                  {client.name.charAt(0)}
                </span>
                <span className="text-gray-800 font-medium">{client.name}</span>
                <span className="text-gray-400">{client.countries.join(', ')}</span>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
