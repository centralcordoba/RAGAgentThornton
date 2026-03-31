// ============================================================================
// FILE: apps/web/app/layout.tsx
// Root layout with collapsible sidebar, header, and global chat panel.
// ============================================================================

import type { Metadata } from 'next';
import './globals.css';
import { Sidebar } from '@/components/ui/Sidebar';
import { Header } from '@/components/ui/Header';
import { ChatProvider } from '@/components/chat/ChatProvider';
import { SplashScreen } from '@/components/ui/SplashScreen';

export const metadata: Metadata = {
  title: 'Grant Thornton — Regulatory Monitoring',
  description: 'Regulatory monitoring platform for Grant Thornton',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="font-sans">
        <div className="flex h-screen overflow-hidden">
          <Sidebar />
          <div className="flex flex-1 flex-col overflow-hidden">
            <Header />
            <main className="flex-1 overflow-y-auto bg-gray-50 p-6">
              {children}
            </main>
          </div>
        </div>
        {/* Splash screen — first load only */}
        <SplashScreen />
        {/* Global chat panel — available on all pages */}
        <ChatProvider />
      </body>
    </html>
  );
}
