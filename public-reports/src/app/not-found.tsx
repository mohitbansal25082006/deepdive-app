// src/app/not-found.tsx
// Public-Reports — 404 Page

import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="min-h-screen flex items-center justify-center px-4"
          style={{ background: 'var(--bg-base)' }}>
      <div className="text-center max-w-md animate-fade-in">
        {/* Icon */}
        <div className="w-20 h-20 rounded-2xl mx-auto mb-6 flex items-center justify-center"
             style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none"
               stroke="var(--brand)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/>
            <path d="m21 21-4.35-4.35"/>
            <path d="M11 8v4m0 4h.01"/>
          </svg>
        </div>

        <h1 className="text-3xl font-bold mb-3" style={{ fontFamily: 'var(--font-display)' }}>
          Report Not Found
        </h1>
        <p className="mb-2" style={{ color: 'var(--text-muted)', fontSize: '0.9375rem', lineHeight: '1.6' }}>
          This research report doesn't exist or the share link may have been deactivated by its owner.
        </p>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
          Double-check the URL or ask the person who shared it with you.
        </p>

        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          <a
            href={process.env.DEEPDIVE_APP_STORE_URL ?? '#'}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold transition-opacity hover:opacity-80"
            style={{
              background: 'linear-gradient(135deg, #6C63FF 0%, #8B5CF6 100%)',
              color: '#fff',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
            </svg>
            Get DeepDive AI
          </a>
        </div>
      </div>
    </main>
  );
}