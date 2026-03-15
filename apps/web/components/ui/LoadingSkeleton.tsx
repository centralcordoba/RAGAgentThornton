// ============================================================================
// FILE: apps/web/components/ui/LoadingSkeleton.tsx
// Animated loading skeletons for various content shapes.
// ============================================================================

'use client';

interface SkeletonProps {
  readonly className?: string;
}

export function Skeleton({ className = '' }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse rounded bg-gray-200 ${className}`}
    />
  );
}

export function CardSkeleton() {
  return (
    <div className="card p-5 space-y-3">
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-8 w-1/2" />
      <Skeleton className="h-3 w-2/3" />
    </div>
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="card divide-y divide-gray-100">
      {/* Header */}
      <div className="px-5 py-3 flex gap-4">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-3 w-16" />
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="px-5 py-3.5 flex gap-4 items-center">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-48" />
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-3 w-20" />
        </div>
      ))}
    </div>
  );
}

export function GraphSkeleton() {
  return (
    <div className="card p-5">
      <Skeleton className="h-4 w-40 mb-4" />
      <div className="flex items-center justify-center h-64">
        <div className="relative">
          <Skeleton className="h-12 w-12 rounded-full" />
          {[0, 60, 120, 180, 240, 300].map((angle) => (
            <div
              key={angle}
              className="absolute"
              style={{
                top: `${50 - 40 * Math.cos((angle * Math.PI) / 180)}%`,
                left: `${50 + 40 * Math.sin((angle * Math.PI) / 180)}%`,
                transform: 'translate(-50%, -50%)',
              }}
            >
              <Skeleton className="h-8 w-8 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ChatSkeleton() {
  return (
    <div className="space-y-4 p-4">
      {/* Assistant message */}
      <div className="flex gap-3">
        <Skeleton className="h-8 w-8 rounded-full flex-shrink-0" />
        <div className="space-y-2 flex-1">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-5/6" />
          <Skeleton className="h-3 w-3/4" />
        </div>
      </div>
      {/* User message */}
      <div className="flex gap-3 justify-end">
        <div className="space-y-2 max-w-[70%]">
          <Skeleton className="h-3 w-48 ml-auto" />
        </div>
        <Skeleton className="h-8 w-8 rounded-full flex-shrink-0" />
      </div>
    </div>
  );
}
