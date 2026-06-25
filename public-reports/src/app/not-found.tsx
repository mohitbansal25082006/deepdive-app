// src/app/not-found.tsx
// Public-Reports — Part 55.9 Fully Themed 404 Page
//
// Fix (this pass): this is a Server Component (no 'use client'). The
// support-email <a> had onMouseEnter/onMouseLeave handlers that mutated
// style imperatively, which throws "Event handlers cannot be passed to
// Client Component props" since function props can't cross the
// server→client boundary on a plain element. Replaced with a CSS class.

import Link from 'next/link';
import Image from 'next/image';

export default function NotFound() {
  const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://deepdive-reports.vercel.app';
  const PLAY_STORE_URL = process.env.DEEPDIVE_PLAY_STORE_URL ?? '#';

  return (
    <main 
      className="min-h-screen flex items-center justify-center px-4"
      style={{ 
        background: 'var(--theme-background)',
        color: 'var(--theme-text-primary)',
      }}
    >
      {/* Ambient glow */}
      <div style={{
        position: 'fixed',
        top: '-20%',
        left: '50%',
        transform: 'translateX(-50%)',
        width: '60vw',
        height: '60vw',
        maxWidth: 600,
        borderRadius: '50%',
        background: 'radial-gradient(ellipse, var(--theme-primary) 0%, transparent 70%)',
        opacity: 0.06,
        pointerEvents: 'none',
        zIndex: 0,
      }} />

      <div className="text-center max-w-md relative z-10" style={{
        animation: 'fadeInUp 0.6s ease-out both',
      }}>
        {/* Logo */}
        <Link 
          href="/" 
          className="inline-flex items-center gap-3 mb-8 transition-all duration-300 hover:scale-105"
          style={{ textDecoration: 'none' }}
        >
          <div style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            overflow: 'hidden',
            background: '#FFFFFF',
            border: '1px solid var(--theme-border)',
          }}>
            <Image src="/icon.png" alt="DeepDive AI" width={40} height={40} style={{ objectFit: 'contain' }} priority />
          </div>
          <span style={{
            fontWeight: 800,
            fontSize: '1.1rem',
            color: 'var(--theme-text-primary)',
          }}>
            DeepDive <span className="dd-text-gradient">AI</span>
          </span>
        </Link>

        {/* 404 Icon */}
        <div 
          className="mx-auto mb-6 flex items-center justify-center transition-all duration-300 hover:scale-105 hover:rotate-6"
          style={{
            width: 88,
            height: 88,
            borderRadius: 24,
            background: 'var(--theme-background-card)',
            border: '2px solid var(--theme-border)',
          }}
        >
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none"
            stroke="var(--theme-primary)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/>
            <path d="m21 21-4.35-4.35"/>
            <path d="M11 8v4m0 4h.01"/>
          </svg>
        </div>

        {/* 404 Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold mb-4"
          style={{
            background: 'var(--theme-primary)',
            color: '#FFFFFF',
            border: '1px solid var(--theme-primary)',
          }}
        >
          <span>404</span>
          <span style={{
            width: 3,
            height: 3,
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.5)',
          }} />
          <span>Not Found</span>
        </div>

        <h1 
          className="text-3xl font-bold mb-3"
          style={{
            fontFamily: 'var(--font-display)',
            color: 'var(--theme-text-primary)',
            letterSpacing: '-0.02em',
          }}
        >
          Report Not Found
        </h1>
        
        <p style={{
          color: 'var(--theme-text-secondary)',
          fontSize: '0.9375rem',
          lineHeight: 1.7,
          marginBottom: 8,
        }}>
          This research report doesn't exist or the share link may have been deactivated by its owner.
        </p>
        
        <p style={{
          color: 'var(--theme-text-muted)',
          fontSize: '0.875rem',
        }}>
          Double-check the URL or ask the person who shared it with you.
        </p>

        {/* Action Buttons */}
        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/discover"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-sm font-bold transition-all duration-300 hover:scale-105 hover:shadow-xl"
            style={{
              background: 'linear-gradient(135deg, var(--theme-gradient-primary-1), var(--theme-gradient-primary-2))',
              color: '#FFFFFF',
              textDecoration: 'none',
              boxShadow: '0 4px 20px var(--theme-primary)',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <circle cx="11" cy="11" r="8"/>
              <path d="m21 21-4.35-4.35"/>
            </svg>
            Browse Research
          </Link>

          <a
            href={PLAY_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-sm font-bold transition-all duration-300 hover:scale-105 hover:shadow-lg"
            style={{
              background: 'var(--theme-background-card)',
              border: '1px solid var(--theme-border)',
              color: 'var(--theme-text-secondary)',
              textDecoration: 'none',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
            </svg>
            Get DeepDive AI
          </a>
        </div>

        {/* Back to Home Link */}
        <Link
          href="/"
          className="inline-flex items-center gap-2 mt-6 text-sm font-semibold transition-all duration-300 hover:scale-105"
          style={{
            color: 'var(--theme-text-muted)',
            textDecoration: 'none',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"/>
            <polyline points="12 19 5 12 12 5"/>
          </svg>
          Back to Home
        </Link>

        {/* Footer note */}
        <p className="mt-8 text-xs" style={{ color: 'var(--theme-text-muted)' }}>
          Need help? Contact us at{' '}
          <a 
            href="mailto:support@deepdive.ai"
            className="not-found-support-link"
            style={{ 
              color: 'var(--theme-primary)',
              textDecoration: 'none',
              transition: 'opacity 0.2s ease',
            }}
          >
            support@deepdive.ai
          </a>
        </p>
      </div>

      <style>{`
        @keyframes fadeInUp {
          from { 
            opacity: 0; 
            transform: translateY(30px); 
          }
          to { 
            opacity: 1; 
            transform: translateY(0); 
          }
        }

        .dd-text-gradient {
          background: linear-gradient(135deg, var(--theme-gradient-primary-1), var(--theme-gradient-primary-2));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .not-found-support-link:hover {
          opacity: 0.8;
        }

        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after {
            animation-duration: 0.01ms !important;
            transition-duration: 0.01ms !important;
          }
        }
      `}</style>
    </main>
  );
}