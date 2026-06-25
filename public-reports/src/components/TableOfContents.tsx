'use client';
// Public-Reports/src/components/TableOfContents.tsx
// Part 55.9 — Fully Themed Table of Contents
// Rich table of contents with scroll-spy highlighting.
//
// Desktop (≥1280px):
//   - Fixed sidebar on the RIGHT of the 3-column layout.
//   - Position is computed from outerMaxWidth + tocWidth props passed by the
//     page, so it always aligns with the outer wrapper regardless of viewport.
//   - Highlights the current section as the reader scrolls.
//
// Mobile (<1280px):
//   - Floating "≡ Contents" button fixed bottom-right.
//   - Tapping opens a full-height slide-in drawer from the right.
//
// Scroll-spy uses IntersectionObserver for reliability.
// Section IDs must be set on the corresponding DOM elements (done by ReportSectionCard).

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  calculateSectionReadTime,
  formatReadTime,
  getSectionAnchorId,
} from '@/lib/readTime';
import type { ReportSection } from '@/types/report';

interface Props {
  sections: ReportSection[];
  outerMaxWidth?: number;
  tocWidth?: number;
}

// ── Desktop TOC Item ──────────────────────────────────────────────────────────

function TocItem({
  section,
  index,
  isActive,
  onClick,
}: {
  section: ReportSection;
  index: number;
  isActive: boolean;
  onClick: () => void;
}) {
  const readMins = calculateSectionReadTime(section);

  return (
    <li>
      <button
        onClick={onClick}
        className="toc-item transition-all duration-300 hover:scale-[1.01]"
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
          width: '100%',
          background: isActive ? 'var(--theme-primary)' : 'transparent',
          border: 'none',
          borderLeft: `3px solid ${isActive ? 'var(--theme-primary)' : 'transparent'}`,
          borderRadius: '0 8px 8px 0',
          padding: '7px 10px 7px 8px',
          cursor: 'pointer',
          textAlign: 'left',
        }}
        aria-current={isActive ? 'step' : undefined}
      >
        {/* Number */}
        <span
          style={{
            fontSize: '0.625rem',
            fontWeight: 800,
            color: isActive ? '#FFFFFF' : 'var(--theme-text-muted)',
            minWidth: 14,
            paddingTop: 2,
            flexShrink: 0,
            transition: 'color 0.3s ease',
          }}
        >
          {String(index + 1).padStart(2, '0')}
        </span>

        {/* Title + read time */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p
            style={{
              fontSize: '0.7375rem',
              fontWeight: isActive ? 700 : 500,
              color: isActive ? '#FFFFFF' : 'var(--theme-text-secondary)',
              margin: 0,
              lineHeight: 1.4,
              whiteSpace: 'normal',
              wordBreak: 'break-word',
              transition: 'all 0.3s ease',
            }}
          >
            {section.title}
          </p>
          <p
            style={{
              fontSize: '0.625rem',
              color: isActive ? 'rgba(255,255,255,0.7)' : 'var(--theme-text-muted)',
              margin: '2px 0 0',
              transition: 'color 0.3s ease',
            }}
          >
            {formatReadTime(readMins)} read
          </p>
        </div>

        {/* Active indicator dot */}
        {isActive && (
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: '#FFFFFF',
              flexShrink: 0,
              marginTop: 5,
              boxShadow: '0 0 12px rgba(255,255,255,0.6)',
            }}
          />
        )}
      </button>
    </li>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function TableOfContents({
  sections,
  outerMaxWidth = 1176,
  tocWidth = 220,
}: Props) {
  const [activeId, setActiveId] = useState<string>('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [bannerHeight, setBannerHeight] = useState(56);
  const [tocRight, setTocRight] = useState<number>(16);
  const observerRef = useRef<IntersectionObserver | null>(null);

  // ── Detect desktop breakpoint ─────────────────────────────────────────────

  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth >= 1280);
    check();
    window.addEventListener('resize', check, { passive: true });
    return () => window.removeEventListener('resize', check);
  }, []);

  // ── Compute right offset for the fixed TOC ────────────────────────────────

  useEffect(() => {
    const PADDING = 16;

    const compute = () => {
      const vw = window.innerWidth;
      const outerRight = Math.max(0, (vw - outerMaxWidth) / 2) + PADDING;
      setTocRight(Math.round(outerRight));
    };

    compute();
    window.addEventListener('resize', compute, { passive: true });
    return () => window.removeEventListener('resize', compute);
  }, [outerMaxWidth]);

  // ── Measure DeepDiveBanner height ──────────────────────────────────────────

  useEffect(() => {
    const measure = () => {
      const candidates = Array.from(document.body.children) as HTMLElement[];
      let maxH = 0;
      for (const el of candidates) {
        const style = window.getComputedStyle(el);
        if (style.position === 'fixed' && style.bottom === '0px') {
          maxH = Math.max(maxH, el.getBoundingClientRect().height);
        }
      }
      setBannerHeight((maxH > 0 ? maxH : 56) + 16);
    };

    measure();
    window.addEventListener('resize', measure, { passive: true });
    return () => window.removeEventListener('resize', measure);
  }, []);

  // ── Close drawer when switching to desktop ────────────────────────────────

  useEffect(() => {
    if (isDesktop) setDrawerOpen(false);
  }, [isDesktop]);

  // ── Scroll-spy via IntersectionObserver ───────────────────────────────────

  useEffect(() => {
    if (sections.length === 0) return;

    observerRef.current?.disconnect();

    const anchorIds = sections.map((s, i) => getSectionAnchorId(s, i));
    const entries: Map<string, IntersectionObserverEntry> = new Map();

    observerRef.current = new IntersectionObserver(
      (newEntries) => {
        for (const entry of newEntries) {
          entries.set(entry.target.id, entry);
        }

        let bestId = '';
        let bestTop = Infinity;

        for (const [id, entry] of entries) {
          if (entry.isIntersecting) {
            const top = entry.boundingClientRect.top;
            if (top < bestTop) {
              bestTop = top;
              bestId = id;
            }
          }
        }

        if (bestId) setActiveId(bestId);
      },
      {
        rootMargin: '-64px 0px -40% 0px',
        threshold: [0, 0.1, 0.25],
      },
    );

    for (const id of anchorIds) {
      const el = document.getElementById(id);
      if (el) observerRef.current.observe(el);
    }

    setActiveId(anchorIds[0] ?? '');

    return () => observerRef.current?.disconnect();
  }, [sections]);

  // ── Scroll to section ─────────────────────────────────────────────────────

  const scrollToSection = useCallback((section: ReportSection, index: number) => {
    const anchorId = getSectionAnchorId(section, index);
    const el = document.getElementById(anchorId);
    if (!el) return;

    const offset = 72;
    const y = el.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top: y, behavior: 'smooth' });

    setActiveId(anchorId);
    setDrawerOpen(false);
  }, []);

  if (sections.length === 0) return null;

  // ── Shared TOC list ───────────────────────────────────────────────────────

  const tocList = (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {sections.map((section, i) => {
        const anchorId = getSectionAnchorId(section, i);
        return (
          <TocItem
            key={section.id ?? i}
            section={section}
            index={i}
            isActive={activeId === anchorId}
            onClick={() => scrollToSection(section, i)}
          />
        );
      })}
    </ul>
  );

  // ── Progress count ────────────────────────────────────────────────────────

  const activeIndex = sections.findIndex(
    (s, i) => getSectionAnchorId(s, i) === activeId,
  );
  const progress = activeIndex >= 0
    ? Math.round(((activeIndex + 1) / sections.length) * 100)
    : 0;

  return (
    <>
      {/* ── Desktop: Fixed right sidebar ── */}
      <nav
        aria-label="Table of contents"
        style={{
          position: 'fixed',
          top: 88,
          right: isDesktop ? tocRight : -9999,
          width: tocWidth,
          maxHeight: 'calc(100vh - 110px)',
          overflowY: 'auto',
          zIndex: 30,
          scrollbarWidth: 'none',
          transition: 'right 0.3s ease, opacity 0.3s ease',
          opacity: isDesktop ? 1 : 0,
          pointerEvents: isDesktop ? 'auto' : 'none',
        }}
      >
        <div
          style={{
            background: 'var(--theme-background-card)',
            border: '1px solid var(--theme-border)',
            borderRadius: '16px',
            padding: '16px 0',
            overflow: 'hidden',
            boxShadow: '0 4px 24px rgba(0,0,0,0.1)',
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '0 14px 12px',
              borderBottom: '1px solid var(--theme-border)',
              marginBottom: 8,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <p
                style={{
                  fontSize: '0.6875rem',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: 'var(--theme-text-muted)',
                  margin: 0,
                }}
              >
                Contents
              </p>
              <span
                style={{
                  fontSize: '0.625rem',
                  color: 'var(--theme-text-muted)',
                  background: 'var(--theme-background-elevated)',
                  borderRadius: 6,
                  padding: '2px 8px',
                  fontWeight: 700,
                  border: '1px solid var(--theme-border)',
                }}
              >
                {sections.length} sections
              </span>
            </div>

            {/* Progress bar */}
            <div
              style={{
                height: 3,
                background: 'var(--theme-background-elevated)',
                borderRadius: 2,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${progress}%`,
                  background: 'linear-gradient(90deg, var(--theme-gradient-primary-1), var(--theme-gradient-primary-2))',
                  borderRadius: 2,
                  transition: 'width 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
                  boxShadow: '0 0 12px var(--theme-primary)',
                }}
              />
            </div>
            <p style={{ fontSize: '0.625rem', color: 'var(--theme-text-muted)', margin: '4px 0 0', fontWeight: 600 }}>
              {progress > 0 ? `${progress}% read` : 'Start reading'}
            </p>
          </div>

          {tocList}
        </div>
      </nav>

      {/* ── Mobile: Floating button + drawer ── */}
      {!isDesktop && (
        <>
          {/* Toggle button */}
          <button
            onClick={() => setDrawerOpen(v => !v)}
            aria-label="Open table of contents"
            aria-expanded={drawerOpen}
            className="transition-all duration-300 hover:scale-105 active:scale-95"
            style={{
              position: 'fixed',
              bottom: bannerHeight,
              right: 16,
              zIndex: 50,
              width: 48,
              height: 48,
              borderRadius: '50%',
              background: drawerOpen
                ? 'linear-gradient(135deg, var(--theme-gradient-primary-1), var(--theme-gradient-primary-2))'
                : 'var(--theme-background-card)',
              border: `2px solid ${drawerOpen ? 'var(--theme-primary)' : 'var(--theme-border)'}`,
              boxShadow: drawerOpen
                ? '0 4px 24px var(--theme-primary)'
                : '0 4px 24px rgba(0,0,0,0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            {drawerOpen ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                stroke="var(--theme-text-secondary)" strokeWidth="2.5" strokeLinecap="round">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="15" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            )}
          </button>

          {/* Backdrop */}
          {drawerOpen && (
            <div
              onClick={() => setDrawerOpen(false)}
              style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0,0,0,0.5)',
                zIndex: 48,
                backdropFilter: 'blur(4px)',
                WebkitBackdropFilter: 'blur(4px)',
                animation: 'fadeIn 0.3s ease-out',
              }}
            />
          )}

          {/* Drawer */}
          <nav
            aria-label="Table of contents"
            style={{
              position: 'fixed',
              top: 0,
              right: 0,
              bottom: 0,
              width: Math.min(320, typeof window !== 'undefined' ? window.innerWidth - 40 : 320),
              background: 'var(--theme-background-card)',
              borderLeft: '1px solid var(--theme-border)',
              zIndex: 49,
              transform: drawerOpen ? 'translateX(0)' : 'translateX(100%)',
              transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '-4px 0 40px rgba(0,0,0,0.2)',
            }}
          >
            {/* Drawer header */}
            <div
              style={{
                padding: '20px 20px 16px',
                borderBottom: '1px solid var(--theme-border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexShrink: 0,
                position: 'sticky',
                top: 0,
                background: 'var(--theme-background-card)',
                zIndex: 1,
              }}
            >
              <div>
                <p style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--theme-text-primary)', margin: 0 }}>
                  Contents
                </p>
                <p style={{ fontSize: '0.75rem', color: 'var(--theme-text-muted)', margin: '2px 0 0' }}>
                  {sections.length} sections · {progress}% read
                </p>
              </div>
              <button
                onClick={() => setDrawerOpen(false)}
                className="transition-all duration-300 hover:scale-105 hover:rotate-90"
                style={{
                  background: 'var(--theme-background-elevated)',
                  border: '1px solid var(--theme-border)',
                  borderRadius: '50%',
                  width: 32,
                  height: 32,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: 'var(--theme-text-muted)',
                }}
                aria-label="Close"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Progress bar */}
            <div style={{ padding: '10px 20px 0', flexShrink: 0 }}>
              <div style={{ height: 3, background: 'var(--theme-background-elevated)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${progress}%`,
                  background: 'linear-gradient(90deg, var(--theme-gradient-primary-1), var(--theme-gradient-primary-2))',
                  borderRadius: 2,
                  transition: 'width 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
                  boxShadow: '0 0 12px var(--theme-primary)',
                }} />
              </div>
            </div>

            {/* TOC list */}
            <div style={{ padding: '12px 0', flex: 1, overflowY: 'auto' }}>
              {tocList}
            </div>
          </nav>
        </>
      )}

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .toc-item:hover {
          background: var(--theme-primary) !important;
          border-left-color: var(--theme-primary) !important;
        }

        .toc-item:hover span {
          color: #FFFFFF !important;
        }

        .toc-item:hover p {
          color: #FFFFFF !important;
        }

        .toc-item:hover .toc-read-time {
          color: rgba(255,255,255,0.7) !important;
        }

        @media (prefers-reduced-motion: reduce) {
          * {
            animation-duration: 0.01ms !important;
            transition-duration: 0.01ms !important;
          }
        }
      `}</style>
    </>
  );
}