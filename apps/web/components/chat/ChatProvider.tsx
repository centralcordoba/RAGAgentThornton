// ============================================================================
// FILE: apps/web/components/chat/ChatProvider.tsx
// Wrapper that renders ComplianceChat only on the client side.
// Reads context from Zustand store (chatClientId, chatOpen).
// ============================================================================

'use client';

import { ComplianceChat } from './ComplianceChat';
import { useUIStore } from '@/lib/stores/uiStore';

export function ChatProvider() {
  const { chatOpen, chatClientId } = useUIStore();

  if (!chatOpen) return null;

  return (
    <ComplianceChat
      clientId={chatClientId ?? undefined}
    />
  );
}
