'use client';
// Public-Reports/src/components/ReadingProgressBar.tsx
// Part 55.9 — Fully Themed Reading Progress Bar
// Fixed reading progress bar that fills as the user scrolls through the report.
// Placed above the sticky header (z-index: 9999) so it's always visible.
// Uses passive scroll listener for performance.

import { useEffect, useState, useRef } from 'react';

export default function ReadingProgressBar() {
  const [progress, setProgress] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const update = () => {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const pct = docHeight > 0
        ? Math.min(100, Math.max(0, (scrollTop / docHeight) * 100))
        : 0;
      setProgress(pct);
    };

    const onScroll = () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(update);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    update(); // initialise on mount

    return () => {
      window.removeEventListener('scroll', onScroll);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const glowing = progress > 5;

  return (
    <div
      aria-hidden="true"
      role="progressbar"
      aria-valuenow={Math.round(progress)}
      aria-valuemin={0}
      aria-valuemax={100}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: '4px',
        zIndex: 9999,
        pointerEvents: 'none',
        background: 'var(--theme-background-elevated)',
        opacity: progress > 0 ? 1 : 0.3,
        transition: 'opacity 0.3s ease',
      }}
    >
      <div
        style={{
          height: '100%',
          width: `${progress}%`,
          background: progress > 80
            ? 'linear-gradient(90deg, var(--theme-gradient-primary-1), var(--theme-warning), var(--theme-error))'
            : 'linear-gradient(90deg, var(--theme-gradient-primary-1), var(--theme-gradient-primary-2))',
          transition: 'width 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
          boxShadow: glowing
            ? `0 0 20px var(--theme-primary), 0 0 8px var(--theme-primary), inset 0 0 4px rgba(255,255,255,0.2)`
            : 'none',
          borderRadius: '0 4px 4px 0',
          position: 'relative',
        }}
      >
        {/* Glow shimmer effect when progress > 5% */}
        {glowing && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)',
              animation: 'shimmer 2s ease-in-out infinite',
              borderRadius: '0 4px 4px 0',
            }}
          />
        )}
      </div>

      {/* Percentage indicator - visible on larger screens */}
      {progress > 5 && (
        <div
          style={{
            position: 'absolute',
            right: '12px',
            top: '50%',
            transform: 'translateY(-50%)',
            fontSize: '9px',
            fontWeight: 700,
            color: 'var(--theme-text-muted)',
            letterSpacing: '0.05em',
            background: 'var(--theme-background-elevated)',
            padding: '2px 6px',
            borderRadius: '4px',
            border: '1px solid var(--theme-border)',
            opacity: 0.7,
            pointerEvents: 'none',
          }}
        >
          {Math.round(progress)}%
        </div>
      )}

      <style>{`
        @keyframes shimmer {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(200%);
          }
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