// ============================================================================
// FILE: apps/web/app/page.tsx
// Root page — redirects to /dashboard.
// ============================================================================

import { redirect } from 'next/navigation';

export default function Home() {
  redirect('/dashboard');
}
