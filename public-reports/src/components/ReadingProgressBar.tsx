'use client';
// Public-Reports/src/components/ReadingProgressBar.tsx
// Fixed reading progress bar that fills as the user scrolls through the report.
// Placed above the sticky header (z-index: 9999) so it's always visible.
// Uses passive scroll listener for performance.

import { useEffect, useState, useRef } from 'react';

export default function ReadingProgressBar() {
  const [progress, setProgress] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const update = () => {
      const scrollTop  = window.scrollY;
      const docHeight  = document.documentElement.scrollHeight - window.innerHeight;
      const pct        = docHeight > 0
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
        position:      'fixed',
        top:           0,
        left:          0,
        right:         0,
        height:        '3px',
        zIndex:        9999,
        pointerEvents: 'none',
        background:    'rgba(255,255,255,0.04)',
      }}
    >
      <div
        style={{
          height:     '100%',
          width:      `${progress}%`,
          background: 'linear-gradient(90deg, #6C63FF 0%, #A78BFA 50%, #8B5CF6 100%)',
          transition: 'width 0.15s ease-out',
          boxShadow:  glowing
            ? '0 0 12px rgba(108,99,255,0.8), 0 0 4px rgba(167,139,250,0.6)'
            : 'none',
          borderRadius: '0 2px 2px 0',
        }}
      />
    </div>
  );
}