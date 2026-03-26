'use client';
// Public-Reports/src/components/TableOfContents.tsx
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
  /**
   * Max-width of the outer 3-column wrapper (px).
   * Used to compute the fixed right position of the desktop TOC panel.
   * Defaults to 1176 (matches page.tsx OUTER_MAX_W).
   */
  outerMaxWidth?: number;
  /**
   * Width of this TOC sidebar (px). Defaults to 220.
   */
  tocWidth?: number;
}

// ── Desktop TOC Item ──────────────────────────────────────────────────────────

function TocItem({
  section,
  index,
  isActive,
  onClick,
}: {
  section:  ReportSection;
  index:    number;
  isActive: boolean;
  onClick:  () => void;
}) {
  const readMins = calculateSectionReadTime(section);

  return (
    <li>
      <button
        onClick={onClick}
        style={{
          display:      'flex',
          alignItems:   'flex-start',
          gap:          10,
          width:        '100%',
          background:   isActive ? 'rgba(108,99,255,0.1)' : 'transparent',
          border:       'none',
          borderLeft:   `2px solid ${isActive ? '#6C63FF' : 'transparent'}`,
          borderRadius: '0 8px 8px 0',
          padding:      '7px 10px 7px 8px',
          cursor:       'pointer',
          textAlign:    'left',
          transition:   'all 0.15s ease',
        }}
        aria-current={isActive ? 'step' : undefined}
      >
        {/* Number */}
        <span
          style={{
            fontSize:   '0.625rem',
            fontWeight: 800,
            color:      isActive ? '#6C63FF' : 'var(--text-muted)',
            minWidth:   14,
            paddingTop: 2,
            flexShrink: 0,
            transition: 'color 0.15s',
          }}
        >
          {String(index + 1).padStart(2, '0')}
        </span>

        {/* Title + read time */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p
            style={{
              fontSize:   '0.7375rem',
              fontWeight: isActive ? 700 : 500,
              color:      isActive ? 'var(--text-primary)' : 'var(--text-muted)',
              margin:     0,
              lineHeight: 1.4,
              whiteSpace: 'normal',
              wordBreak:  'break-word',
              transition: 'all 0.15s',
            }}
          >
            {section.title}
          </p>
          <p
            style={{
              fontSize:   '0.625rem',
              color:      isActive ? 'rgba(108,99,255,0.7)' : 'rgba(255,255,255,0.2)',
              margin:     '2px 0 0',
              transition: 'color 0.15s',
            }}
          >
            {formatReadTime(readMins)} read
          </p>
        </div>

        {/* Active indicator dot */}
        {isActive && (
          <div
            style={{
              width:        6,
              height:       6,
              borderRadius: '50%',
              background:   '#6C63FF',
              flexShrink:   0,
              marginTop:    5,
              boxShadow:    '0 0 6px rgba(108,99,255,0.8)',
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
  tocWidth      = 220,
}: Props) {
  const [activeId,      setActiveId]      = useState<string>('');
  const [drawerOpen,    setDrawerOpen]    = useState(false);
  const [isDesktop,     setIsDesktop]     = useState(false);
  const [bannerHeight,  setBannerHeight]  = useState(56);
  // The computed CSS `right` value for the fixed desktop TOC.
  const [tocRight,      setTocRight]      = useState<number>(16);
  const observerRef = useRef<IntersectionObserver | null>(null);

  // ── Detect desktop breakpoint (≥1280px = xl) ─────────────────────────────

  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth >= 1280);
    check();
    window.addEventListener('resize', check, { passive: true });
    return () => window.removeEventListener('resize', check);
  }, []);

  // ── Compute right offset for the fixed TOC ────────────────────────────────
  //
  // The TOC must sit immediately to the right of the main content column.
  // Because the outer wrapper is max-width: outerMaxWidth and centred with
  // mx-auto + px-4 (16px), we derive the right edge of the wrapper from the
  // viewport width, then add px-4 (16px) padding.
  //
  // right = max(16px, (vw - outerMaxWidth) / 2 + 16px)
  //
  // At vw = 1280px and outerMaxWidth = 1176px:
  //   right = (1280 - 1176) / 2 + 16 = 52 + 16 = 68px  ✓
  //
  // At vw > outerMaxWidth: right grows proportionally, keeping the TOC inside
  // the outer wrapper's right edge.

  useEffect(() => {
    const PADDING = 16; // matches px-4

    const compute = () => {
      const vw = window.innerWidth;
      const outerRight = Math.max(0, (vw - outerMaxWidth) / 2) + PADDING;
      setTocRight(Math.round(outerRight));
    };

    compute();
    window.addEventListener('resize', compute, { passive: true });
    return () => window.removeEventListener('resize', compute);
  }, [outerMaxWidth]);

  // ── Measure DeepDiveBanner height so the mobile button clears it ──────────

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

        // Find the topmost visible section
        let bestId  = '';
        let bestTop = Infinity;

        for (const [id, entry] of entries) {
          if (entry.isIntersecting) {
            const top = entry.boundingClientRect.top;
            if (top < bestTop) {
              bestTop = top;
              bestId  = id;
            }
          }
        }

        if (bestId) setActiveId(bestId);
      },
      {
        rootMargin: '-64px 0px -40% 0px',
        threshold:  [0, 0.1, 0.25],
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
    const el       = document.getElementById(anchorId);
    if (!el) return;

    const offset = 72;
    const y      = el.getBoundingClientRect().top + window.scrollY - offset;
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
      {/*
        Positioned using `right: tocRight` (computed from viewport width and
        outerMaxWidth), so it always sits flush with the right edge of the
        outer wrapper — regardless of viewport width.
      */}
      <nav
        aria-label="Table of contents"
        style={{
          position:    'fixed',
          top:         88,
          right:       isDesktop ? tocRight : -9999, // hide off-screen when not desktop
          width:       tocWidth,
          maxHeight:   'calc(100vh - 110px)',
          overflowY:   'auto',
          zIndex:      30,
          scrollbarWidth: 'none',
          // Smooth in/out when desktop state changes
          transition:  'right 0.2s ease, opacity 0.2s ease',
          opacity:     isDesktop ? 1 : 0,
          pointerEvents: isDesktop ? 'auto' : 'none',
        }}
      >
        <div
          style={{
            background:   'var(--bg-card)',
            border:       '1px solid var(--border)',
            borderRadius: '16px',
            padding:      '16px 0',
            overflow:     'hidden',
          }}
        >
          {/* Header */}
          <div
            style={{
              padding:      '0 14px 12px',
              borderBottom: '1px solid var(--border)',
              marginBottom: 8,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <p
                style={{
                  fontSize:      '0.6875rem',
                  fontWeight:    800,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color:         'var(--text-muted)',
                  margin:        0,
                }}
              >
                Contents
              </p>
              <span
                style={{
                  fontSize:     '0.625rem',
                  color:        'var(--text-muted)',
                  background:   'var(--bg-elevated)',
                  borderRadius: 6,
                  padding:      '2px 6px',
                  fontWeight:   600,
                }}
              >
                {sections.length} sections
              </span>
            </div>

            {/* Progress bar */}
            <div
              style={{
                height:       3,
                background:   'var(--bg-elevated)',
                borderRadius: 2,
                overflow:     'hidden',
              }}
            >
              <div
                style={{
                  height:       '100%',
                  width:        `${progress}%`,
                  background:   'linear-gradient(90deg, #6C63FF, #A78BFA)',
                  borderRadius: 2,
                  transition:   'width 0.4s ease',
                }}
              />
            </div>
            <p style={{ fontSize: '0.625rem', color: 'var(--text-muted)', margin: '4px 0 0' }}>
              {progress > 0 ? `${progress}% read` : 'Start reading'}
            </p>
          </div>

          {tocList}
        </div>
      </nav>

      {/* ── Mobile: Floating button + drawer ── */}
      {!isDesktop && (
        <>
          {/* Toggle button — sits above DeepDiveBanner */}
          <button
            onClick={() => setDrawerOpen(v => !v)}
            aria-label="Open table of contents"
            aria-expanded={drawerOpen}
            style={{
              position:        'fixed',
              bottom:          bannerHeight,
              right:           16,
              zIndex:          50,
              width:           48,
              height:          48,
              borderRadius:    '50%',
              background:      drawerOpen
                ? 'linear-gradient(135deg, #6C63FF, #8B5CF6)'
                : 'var(--bg-card)',
              border:          `1px solid ${drawerOpen ? 'transparent' : 'var(--border)'}`,
              boxShadow:       '0 4px 24px rgba(0,0,0,0.35)',
              display:         'flex',
              alignItems:      'center',
              justifyContent:  'center',
              cursor:          'pointer',
              transition:      'all 0.2s ease',
            }}
          >
            {drawerOpen ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                   stroke="white" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                   stroke="var(--text-secondary)" strokeWidth="2" strokeLinecap="round">
                <line x1="3"  y1="6"  x2="21" y2="6"/>
                <line x1="3"  y1="12" x2="15" y2="12"/>
                <line x1="3"  y1="18" x2="21" y2="18"/>
              </svg>
            )}
          </button>

          {/* Backdrop */}
          {drawerOpen && (
            <div
              onClick={() => setDrawerOpen(false)}
              style={{
                position:       'fixed',
                inset:          0,
                background:     'rgba(0,0,0,0.5)',
                zIndex:         48,
                backdropFilter: 'blur(2px)',
              }}
            />
          )}

          {/* Drawer */}
          <nav
            aria-label="Table of contents"
            style={{
              position:      'fixed',
              top:           0,
              right:         0,
              bottom:        0,
              width:         Math.min(320, typeof window !== 'undefined' ? window.innerWidth - 40 : 320),
              background:    'var(--bg-card)',
              borderLeft:    '1px solid var(--border)',
              zIndex:        49,
              transform:     drawerOpen ? 'translateX(0)' : 'translateX(100%)',
              transition:    'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              overflowY:     'auto',
              display:       'flex',
              flexDirection: 'column',
            }}
          >
            {/* Drawer header */}
            <div
              style={{
                padding:        '20px 20px 16px',
                borderBottom:   '1px solid var(--border)',
                display:        'flex',
                alignItems:     'center',
                justifyContent: 'space-between',
                flexShrink:     0,
                position:       'sticky',
                top:            0,
                background:     'var(--bg-card)',
                zIndex:         1,
              }}
            >
              <div>
                <p style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                  Contents
                </p>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '2px 0 0' }}>
                  {sections.length} sections · {progress}% read
                </p>
              </div>
              <button
                onClick={() => setDrawerOpen(false)}
                style={{
                  background:     'var(--bg-elevated)',
                  border:         '1px solid var(--border)',
                  borderRadius:   '50%',
                  width:          32,
                  height:         32,
                  display:        'flex',
                  alignItems:     'center',
                  justifyContent: 'center',
                  cursor:         'pointer',
                  color:          'var(--text-muted)',
                }}
                aria-label="Close"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            {/* Progress bar */}
            <div style={{ padding: '10px 20px 0', flexShrink: 0 }}>
              <div style={{ height: 3, background: 'var(--bg-elevated)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{
                  height:       '100%',
                  width:        `${progress}%`,
                  background:   'linear-gradient(90deg, #6C63FF, #A78BFA)',
                  borderRadius: 2,
                  transition:   'width 0.4s ease',
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
    </>
  );
}