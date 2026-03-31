// ============================================================================
// FILE: apps/web/components/ui/SplashScreen.tsx
// Minimal splash screen — shown once on first page load, then fades out.
// ============================================================================

'use client';

import { useState, useEffect } from 'react';

export function SplashScreen() {
  const [phase, setPhase] = useState<'visible' | 'fading' | 'gone'>('visible');

  useEffect(() => {
    const fadeTimer = setTimeout(() => setPhase('fading'), 1600);
    const goneTimer = setTimeout(() => setPhase('gone'), 2200);
    return () => { clearTimeout(fadeTimer); clearTimeout(goneTimer); };
  }, []);

  if (phase === 'gone') return null;

  return (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center bg-white transition-opacity duration-500 ${
        phase === 'fading' ? 'opacity-0' : 'opacity-100'
      }`}
    >
      <div className="flex flex-col items-center gap-6">
        {/* Logo mark */}
        <div className="relative flex items-center justify-center">
          <div className="absolute h-16 w-16 rounded-full border-[1.5px] border-brand-200 animate-[splash-ring_1.8s_ease-out_forwards]" />
          <div className="h-12 w-12 rounded-full bg-brand-700 flex items-center justify-center animate-[splash-dot_0.6s_ease-out_forwards]">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
              <path d="M12 6v6l4 2" />
            </svg>
          </div>
        </div>

        {/* Text */}
        <div className="text-center">
          <p className="text-[13px] font-semibold tracking-[0.25em] uppercase text-brand-700 animate-[splash-text_0.8s_ease-out_0.3s_both]">
            Grant Thornton
          </p>
          <p className="text-[11px] font-medium tracking-[0.15em] uppercase text-gray-400 mt-1.5 animate-[splash-text_0.8s_ease-out_0.5s_both]">
            RegWatch AI
          </p>
        </div>

        {/* Loading bar */}
        <div className="w-32 h-[2px] bg-gray-100 rounded-full overflow-hidden mt-2 animate-[splash-text_0.8s_ease-out_0.6s_both]">
          <div className="h-full bg-brand-700 rounded-full animate-[splash-bar_1.4s_ease-in-out_0.4s_both]" />
        </div>
      </div>
    </div>
  );
}
