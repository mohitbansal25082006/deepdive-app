// src/components/DeepDiveBanner.tsx
// Public-Reports — Part 55.9 Fully Themed Sticky Branding + Download CTA Banner
// - App Store: greyed out "Coming Soon" (no redirect)
// - Play Store: redirects to NEXT_PUBLIC_DEEPDIVE_PLAY_STORE_URL
// Fix (this pass): removed onMouseEnter/onMouseLeave from the Play Store <a>
// tag — event handlers were being passed to elements in a way that broke the
// Server/Client boundary ("Event handlers cannot be passed to Client Component
// props"). Replaced with a pure CSS hover class.

'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';

export default function DeepDiveBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 1200);
    return () => clearTimeout(t);
  }, []);

  const playStoreUrl = process.env.NEXT_PUBLIC_DEEPDIVE_PLAY_STORE_URL ?? '#';

  return (
    <div
      className="fixed bottom-0 inset-x-0 z-50 transition-all duration-700 ease-out"
      style={{
        transform: visible ? 'translateY(0)' : 'translateY(100%)',
        opacity: visible ? 1 : 0,
      }}
    >
      <div
        className="w-full px-4 py-3"
        style={{
          background: 'var(--theme-background)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderTop: '2px solid var(--theme-primary)',
          boxShadow: '0 -4px 30px var(--theme-primary)',
        }}
      >
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4 flex-wrap">
          {/* Branding */}
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden transition-all duration-300 hover:scale-105"
              style={{
                background: '#FFFFFF',
                border: '1px solid var(--theme-border)',
              }}
            >
              <Image src="/icon.png" alt="DeepDive AI" width={36} height={36} style={{ objectFit: 'contain' }} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold leading-none mb-0.5" style={{ color: 'var(--theme-text-primary)' }}>
                Made with{' '}
                <span className="dd-text-gradient">
                  DeepDive AI
                </span>
              </p>
              <p className="text-xs truncate" style={{ color: 'var(--theme-text-secondary)' }}>
                Autonomous research · Multi-agent analysis · AI reports
              </p>
            </div>
          </div>

          {/* Buttons */}
          <div className="flex items-center gap-2 flex-shrink-0">

            {/* App Store — disabled */}
            <div
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all duration-300"
              style={{
                background: 'var(--theme-background-elevated)',
                border: '1px solid var(--theme-border)',
                color: 'var(--theme-text-muted)',
                cursor: 'default',
                opacity: 0.5,
              }}
              title="Not on App Store yet"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
              </svg>
              <span>iOS — Soon</span>
            </div>

            {/* Play Store — live */}
            <a
              href={playStoreUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="dd-play-store-link flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-300 hover:scale-105 hover:shadow-lg"
              style={{
                background: 'linear-gradient(135deg, var(--theme-gradient-primary-1), var(--theme-gradient-primary-2))',
                color: '#FFFFFF',
                textDecoration: 'none',
                boxShadow: '0 2px 12px var(--theme-primary)',
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3 18.5v-13c0-.83.95-1.3 1.6-.8l11 6.5c.6.35.6 1.25 0 1.6l-11 6.5c-.65.5-1.6.03-1.6-.8z"/>
              </svg>
              <span>Google Play</span>
            </a>
          </div>
        </div>
      </div>

      <style>{`
        .dd-text-gradient {
          background: linear-gradient(135deg, var(--theme-gradient-primary-1), var(--theme-gradient-primary-2));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .dd-play-store-link:hover {
          box-shadow: 0 4px 20px var(--theme-primary);
        }

        @keyframes slideUp {
          from {
            transform: translateY(100%);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }

        .dd-banner-slide {
          animation: slideUp 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) both;
        }

        @media (prefers-reduced-motion: reduce) {
          * {
            animation-duration: 0.01ms !important;
            transition-duration: 0.01ms !important;
          }
        }
      `}</style>
    </div>
  );
}