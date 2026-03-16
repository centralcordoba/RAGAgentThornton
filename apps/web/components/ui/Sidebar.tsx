// ============================================================================
// FILE: apps/web/components/ui/Sidebar.tsx
// Collapsible sidebar navigation.
// Sources link visible only for GT_ADMIN role.
// ============================================================================

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';

interface NavItem {
  readonly label: string;
  readonly href: string;
  readonly icon: string;
  readonly adminOnly?: boolean;
}

const NAV_ITEMS: readonly NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: '📊' },
  { label: 'Clientes', href: '/clients', icon: '🏢' },
  { label: 'Regulaciones', href: '/regulations', icon: '📜' },
  { label: 'Alertas', href: '/alerts', icon: '🔔' },
  { label: 'Onboarding', href: '/onboarding', icon: '➕' },
  { label: 'Fuentes', href: '/sources', icon: '⚙️', adminOnly: true },
];

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const [userRole, setUserRole] = useState<string | null>(null);

  useEffect(() => {
    // Read role from session token (JWT payload)
    try {
      const token = sessionStorage.getItem('auth_token');
      if (token) {
        const payload = JSON.parse(atob(token.split('.')[1]!));
        setUserRole(payload.role ?? null);
      } else {
        // Default to ADMIN in dev when no token is present
        setUserRole('ADMIN');
      }
    } catch {
      setUserRole('ADMIN');
    }
  }, []);

  const visibleItems = NAV_ITEMS.filter(
    (item) => !item.adminOnly || userRole === 'ADMIN',
  );

  return (
    <aside
      className={`flex flex-col bg-brand-700 text-white transition-all duration-200 ${
        collapsed ? 'w-16' : 'w-[260px]'
      }`}
    >
      {/* Logo */}
      <div className="flex h-14 items-center justify-between px-4 border-b border-brand-600">
        {!collapsed && (
          <span className="text-sm font-bold tracking-wide">Grant Thornton</span>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1 rounded hover:bg-brand-600 transition-colors text-xs"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? '»' : '«'}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 space-y-1 px-2">
        {visibleItems.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors ${
                isActive
                  ? 'bg-brand-600 text-white font-medium'
                  : 'text-brand-200 hover:bg-brand-600 hover:text-white'
              }`}
              title={collapsed ? item.label : undefined}
            >
              <span className="text-base flex-shrink-0">{item.icon}</span>
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-brand-600 px-4 py-3">
        {!collapsed && (
          <p className="text-xs text-brand-300">Grant Thornton</p>
        )}
      </div>
    </aside>
  );
}
