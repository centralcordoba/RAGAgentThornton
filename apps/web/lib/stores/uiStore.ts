// ============================================================================
// FILE: apps/web/lib/stores/uiStore.ts
// Zustand store for UI state: sidebar, filters, chat session.
// ============================================================================

'use client';

import { create } from 'zustand';

interface UIState {
  // Sidebar
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;

  // Global filters
  selectedCountry: string | null;
  selectedImpactLevel: string | null;
  setSelectedCountry: (country: string | null) => void;
  setSelectedImpactLevel: (level: string | null) => void;
  clearFilters: () => void;

  // Chat
  chatOpen: boolean;
  chatClientId: string | null;
  chatConversationId: string | null;
  toggleChat: () => void;
  openChatForClient: (clientId: string) => void;
  setChatConversationId: (id: string) => void;
  closeChat: () => void;

  // Notifications
  unreadAlerts: number;
  setUnreadAlerts: (count: number) => void;
}

export const useUIStore = create<UIState>((set) => ({
  // Sidebar
  sidebarCollapsed: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

  // Global filters
  selectedCountry: null,
  selectedImpactLevel: null,
  setSelectedCountry: (country) => set({ selectedCountry: country }),
  setSelectedImpactLevel: (level) => set({ selectedImpactLevel: level }),
  clearFilters: () => set({ selectedCountry: null, selectedImpactLevel: null }),

  // Chat
  chatOpen: false,
  chatClientId: null,
  chatConversationId: null,
  toggleChat: () => set((s) => ({ chatOpen: !s.chatOpen })),
  openChatForClient: (clientId) =>
    set({ chatOpen: true, chatClientId: clientId, chatConversationId: null }),
  setChatConversationId: (id) => set({ chatConversationId: id }),
  closeChat: () => set({ chatOpen: false, chatClientId: null, chatConversationId: null }),

  // Notifications
  unreadAlerts: 0,
  setUnreadAlerts: (count) => set({ unreadAlerts: count }),
}));
