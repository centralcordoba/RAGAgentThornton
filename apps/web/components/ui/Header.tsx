// ============================================================================
// FILE: apps/web/components/ui/Header.tsx
// Top header with user info, role badge, and search.
// ============================================================================

'use client';

import { Badge } from './Badge';
import { useUIStore } from '@/lib/stores/uiStore';

export function Header() {
  const { toggleChat, chatOpen } = useUIStore();
  // In production: fetch from auth context / Zustand store
  const user = {
    name: 'María González',
    role: 'PROFESSIONAL' as const,
    tenantName: 'Grant Thornton LATAM',
  };

  return (
    <header className="flex h-14 items-center justify-between border-b border-gray-200 bg-white px-6">
      <div className="flex items-center gap-4">
        <h1 className="text-sm font-semibold text-gray-500">
          RegWatch AI
        </h1>
      </div>

      <div className="flex items-center gap-4">
        {/* Search */}
        <div className="hidden md:block">
          <input
            type="search"
            placeholder="Buscar regulaciones, clientes..."
            className="input w-64 text-xs"
          />
        </div>

        {/* Chat toggle */}
        <button
          onClick={toggleChat}
          className={`p-1.5 rounded-md transition-colors ${
            chatOpen ? 'bg-brand-100 text-brand-800' : 'hover:bg-gray-100'
          }`}
          aria-label="Toggle chat"
        >
          <span className="text-lg">💬</span>
        </button>

        {/* Notifications bell */}
        <button
          className="relative p-1.5 rounded-md hover:bg-gray-100 transition-colors"
          aria-label="Notifications"
        >
          <span className="text-lg">🔔</span>
          <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-risk-high text-[10px] font-bold text-white">
            3
          </span>
        </button>

        {/* User */}
        <div className="flex items-center gap-2 pl-4 border-l border-gray-200">
          <div className="text-right">
            <p className="text-sm font-medium text-gray-900">{user.name}</p>
            <p className="text-xs text-gray-500">{user.tenantName}</p>
          </div>
          <Badge variant={getRoleBadgeVariant(user.role)}>
            {formatRole(user.role)}
          </Badge>
        </div>
      </div>
    </header>
  );
}

function getRoleBadgeVariant(role: string): 'info' | 'success' | 'warning' {
  switch (role) {
    case 'ADMIN':
      return 'warning';
    case 'PROFESSIONAL':
      return 'info';
    default:
      return 'success';
  }
}

function formatRole(role: string): string {
  const labels: Record<string, string> = {
    ADMIN: 'Admin',
    PROFESSIONAL: 'Professional',
    CLIENT_VIEWER: 'Client',
  };
  return labels[role] ?? role;
}
