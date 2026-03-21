// ============================================================================
// FILE: apps/web/components/impact/RegulationDiff.tsx
// Side-by-side diff viewer for regulation text changes.
// Pure CSS implementation — no external diff library needed.
// ============================================================================

'use client';

interface Props {
  readonly before: string;
  readonly after: string;
}

export function RegulationDiff({ before, after }: Props) {
  const beforeLines = before.split('\n');
  const afterLines = after.split('\n');
  const diff = computeDiff(beforeLines, afterLines);

  return (
    <div className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
          Diff de regulación
        </span>
        <span className="text-xs text-red-500 flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-red-400" />
          Eliminado
        </span>
        <span className="text-xs text-green-600 flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-green-500" />
          Agregado
        </span>
      </div>

      <div className="grid grid-cols-2 gap-px bg-gray-200 rounded-lg overflow-hidden text-xs font-mono">
        {/* Before header */}
        <div className="bg-red-50 px-3 py-2 text-red-700 font-medium font-sans">
          Versión anterior
        </div>
        {/* After header */}
        <div className="bg-green-50 px-3 py-2 text-green-700 font-medium font-sans">
          Versión nueva
        </div>

        {/* Diff lines */}
        {diff.map((row, i) => (
          <DiffRow key={i} row={row} />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Diff computation (simple LCS-based)
// ---------------------------------------------------------------------------

interface DiffLine {
  readonly type: 'equal' | 'removed' | 'added' | 'changed';
  readonly before: string;
  readonly after: string;
}

function DiffRow({ row }: { row: DiffLine }) {
  switch (row.type) {
    case 'equal':
      return (
        <>
          <div className="bg-white px-3 py-1 text-gray-600 leading-relaxed">{row.before}</div>
          <div className="bg-white px-3 py-1 text-gray-600 leading-relaxed">{row.after}</div>
        </>
      );
    case 'removed':
      return (
        <>
          <div className="bg-red-50 px-3 py-1 text-red-700 leading-relaxed line-through decoration-red-400">
            {row.before}
          </div>
          <div className="bg-gray-50 px-3 py-1" />
        </>
      );
    case 'added':
      return (
        <>
          <div className="bg-gray-50 px-3 py-1" />
          <div className="bg-green-50 px-3 py-1 text-green-700 leading-relaxed font-medium">
            {row.after}
          </div>
        </>
      );
    case 'changed':
      return (
        <>
          <div className="bg-red-50 px-3 py-1 text-red-700 leading-relaxed line-through decoration-red-400">
            {row.before}
          </div>
          <div className="bg-green-50 px-3 py-1 text-green-700 leading-relaxed font-medium">
            {row.after}
          </div>
        </>
      );
  }
}

function computeDiff(beforeLines: string[], afterLines: string[]): DiffLine[] {
  const result: DiffLine[] = [];
  let bi = 0;
  let ai = 0;

  while (bi < beforeLines.length || ai < afterLines.length) {
    const bLine = bi < beforeLines.length ? beforeLines[bi]! : null;
    const aLine = ai < afterLines.length ? afterLines[ai]! : null;

    if (bLine === aLine) {
      result.push({ type: 'equal', before: bLine ?? '', after: aLine ?? '' });
      bi++;
      ai++;
    } else if (bLine !== null && aLine !== null) {
      // Check if the after line exists later in before (added line)
      const bLookAhead = beforeLines.indexOf(aLine, bi);
      const aLookAhead = afterLines.indexOf(bLine, ai);

      if (aLookAhead >= 0 && (bLookAhead < 0 || aLookAhead - ai < bLookAhead - bi)) {
        // before line was removed
        while (ai < aLookAhead) {
          result.push({ type: 'added', before: '', after: afterLines[ai]! });
          ai++;
        }
      } else if (bLookAhead >= 0) {
        // before lines until match were removed
        while (bi < bLookAhead) {
          result.push({ type: 'removed', before: beforeLines[bi]!, after: '' });
          bi++;
        }
      } else {
        // Lines are different — changed
        result.push({ type: 'changed', before: bLine, after: aLine });
        bi++;
        ai++;
      }
    } else if (bLine !== null) {
      result.push({ type: 'removed', before: bLine, after: '' });
      bi++;
    } else if (aLine !== null) {
      result.push({ type: 'added', before: '', after: aLine });
      ai++;
    }
  }

  return result;
}
