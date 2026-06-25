// src/components/SignupWall.tsx
// Public-Reports — Part 55.9 Fully Themed Signup Wall
// Signup wall shown when the 3-question limit is reached.
// - No dismiss/cross button (permanent once limit hit)
// - App Store button: greyed out "Coming Soon" (no redirect)
// - Play Store button: redirects to NEXT_PUBLIC_PLAY_STORE_URL

'use client';

interface SignupWallProps {
  questionsUsed: number;
  questionsMax: number;
  reportTitle?: string;
}

export default function SignupWall({
  questionsMax,
  reportTitle,
}: SignupWallProps) {
  const playStoreUrl = process.env.NEXT_PUBLIC_PLAY_STORE_URL ?? '#';

  const FEATURES = [
    { icon: '🔬', label: 'Autonomous AI research' },
    { icon: '📊', label: 'Multi-agent analysis' },
    { icon: '🎓', label: 'Academic paper mode' },
    { icon: '🎙', label: 'AI podcast generator' },
    { icon: '⚖️', label: 'AI debate engine' },
    { icon: '📱', label: 'iOS & Android app' },
  ];

  return (
    <div
      className="rounded-2xl overflow-hidden animate-fade-in-up transition-all duration-300 hover:shadow-xl"
      style={{
        background: 'linear-gradient(135deg, var(--theme-background-elevated), var(--theme-background-card))',
        border: '2px solid var(--theme-primary)',
        position: 'relative',
      }}
    >
      {/* Glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 60% 40% at 50% 0%, var(--theme-primary) 0%, transparent 70%)',
          opacity: 0.08,
        }}
      />

      {/* Decorative dots */}
      <div
        className="absolute top-4 right-4 flex gap-1 opacity-20"
        style={{ pointerEvents: 'none' }}
      >
        {[1, 2, 3].map(i => (
          <div
            key={i}
            style={{
              width: 4,
              height: 4,
              borderRadius: '50%',
              background: 'var(--theme-primary)',
            }}
          />
        ))}
      </div>

      <div className="relative p-6">
        {/* Icon */}
        <div className="flex justify-center mb-4">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-300 hover:scale-105 hover:rotate-3"
            style={{
              background: 'linear-gradient(135deg, var(--theme-gradient-primary-1), var(--theme-gradient-primary-2))',
              boxShadow: '0 0 40px var(--theme-primary)',
            }}
          >
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none"
              stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
          </div>
        </div>

        {/* Headline */}
        <h3
          className="text-center text-xl font-extrabold mb-2"
          style={{
            fontFamily: 'var(--font-display)',
            color: 'var(--theme-text-primary)',
            letterSpacing: '-0.02em',
          }}
        >
          You've used your {questionsMax} free questions
        </h3>

        <p
          className="text-center text-sm mb-5"
          style={{ color: 'var(--theme-text-secondary)', lineHeight: 1.7 }}
        >
          {reportTitle
            ? `Want to keep exploring "${reportTitle.slice(0, 50)}${reportTitle.length > 50 ? '…' : ''}"? `
            : 'Want to keep exploring this report? '}
          Download DeepDive AI for unlimited AI research — free to start.
        </p>

        {/* Feature chips */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-5">
          {FEATURES.map(f => (
            <div
              key={f.label}
              className="flex items-center gap-2 px-3 py-2 rounded-xl transition-all duration-300 hover:scale-105 hover:shadow-md"
              style={{
                background: 'var(--theme-background-card)',
                border: '1px solid var(--theme-border)',
              }}
            >
              <span className="text-sm">{f.icon}</span>
              <span className="text-xs font-medium" style={{ color: 'var(--theme-text-secondary)' }}>
                {f.label}
              </span>
            </div>
          ))}
        </div>

        {/* Store buttons */}
        <div className="flex flex-col sm:flex-row gap-3">

          {/* App Store — not available yet, no link */}
          <div
            className="flex-1 flex items-center gap-3 py-3 px-4 rounded-xl transition-all duration-300"
            style={{
              background: 'var(--theme-background-elevated)',
              border: '1px solid var(--theme-border)',
              cursor: 'default',
              opacity: 0.5,
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="var(--theme-text-muted)"
              className="flex-shrink-0">
              <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
            </svg>
            <div>
              <p className="text-xs leading-none mb-0.5" style={{ color: 'var(--theme-text-muted)' }}>
                Not available yet
              </p>
              <p className="text-sm font-bold leading-none" style={{ color: 'var(--theme-text-muted)' }}>
                iOS — Coming Soon
              </p>
            </div>
          </div>

          {/* Play Store — live */}
          <a
            href={playStoreUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 flex items-center gap-3 py-3 px-4 rounded-xl transition-all duration-300 hover:scale-105 hover:shadow-lg"
            style={{
              background: 'linear-gradient(135deg, var(--theme-gradient-primary-1), var(--theme-gradient-primary-2))',
              textDecoration: 'none',
              boxShadow: '0 4px 20px var(--theme-primary)',
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="white" className="flex-shrink-0">
              <path d="M3 18.5v-13c0-.83.95-1.3 1.6-.8l11 6.5c.6.35.6 1.25 0 1.6l-11 6.5c-.65.5-1.6.03-1.6-.8z" />
            </svg>
            <div>
              <p className="text-xs leading-none mb-0.5" style={{ color: 'rgba(255,255,255,0.75)' }}>
                Get it on
              </p>
              <p className="text-sm font-bold leading-none" style={{ color: '#fff' }}>
                Google Play
              </p>
            </div>
          </a>
        </div>

        <p className="text-center text-xs mt-4" style={{ color: 'var(--theme-text-muted)' }}>
          ✦ Free to start · No credit card required · 20 bonus credits on signup
        </p>
      </div>

      <style>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(16px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fade-in-up {
          animation: fadeInUp 0.5s ease-out both;
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