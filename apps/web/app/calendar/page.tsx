// ============================================================================
// FILE: apps/web/app/calendar/page.tsx
// Compliance Calendar — monthly, weekly, and list views.
// Suspense boundary required because CalendarPage uses useSearchParams().
// ============================================================================

import { Suspense } from 'react';
import { CalendarPage } from '@/components/calendar/CalendarPage';

export default function Calendar() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-2 text-sm text-gray-400">
          Cargando calendario...
        </div>
      </div>
    }>
      <CalendarPage />
    </Suspense>
  );
}
