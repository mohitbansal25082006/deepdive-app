'use client';
// Public-Reports/src/components/MobileActionBar.tsx
// Part 55.9 — Fully Themed Mobile Action Bar
// - Share button removed
// - Fully mobile-optimised: safe-area insets, tap targets, touch UX
// Fix: replaced .catch() with .then(null, () => {}) — PostgrestFilterBuilder is
// a PromiseLike (has .then) but not a full Promise (no .catch).

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  shareUrl: string;
  shareId?: string;
  viewCount: number;
  shareCount: number;
}

export default function MobileActionBar({ viewCount, shareCount }: Props) {
  const router = useRouter();
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (q.length < 2) return;
    router.push(`/discover?q=${encodeURIComponent(q)}`);
    setShowSearch(false);
    setSearchQuery('');
  };

  return (
    <>
      <style>{`
        /* ── Reset ── */
        *, *::before, *::after { box-sizing: border-box; }

        /* ── Suppress native search input chrome ── */
        input[type="search"]::-webkit-search-cancel-button { display: none; }
        input[type="search"]::-webkit-search-decoration    { display: none; }
        input[type="search"] { -webkit-appearance: none; }

        /* ── Action bar wrapper ── */
        .mab-bar {
          background: var(--theme-background);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border-bottom: 1px solid var(--theme-border);
          box-shadow: 0 2px 20px rgba(0,0,0,0.08);
          /* Push content above system UI on notched devices */
          padding: 8px 16px env(safe-area-inset-bottom, 0px);
        }

        .mab-row {
          display: flex;
          align-items: center;
          gap: 8px;
          /* hard ceiling so nothing overflows on 320px devices */
          max-width: 100%;
          overflow: hidden;
        }

        /* ── Shared pill base ── */
        .mab-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 8px 13px;
          border-radius: 10px;
          font-size: 12px;
          font-weight: 600;
          line-height: 1;
          white-space: nowrap;
          flex-shrink: 0;
          cursor: pointer;
          border: 1px solid var(--theme-border);
          background: var(--theme-background-elevated);
          color: var(--theme-text-secondary);
          /* Touch UX */
          -webkit-tap-highlight-color: transparent;
          touch-action: manipulation;
          user-select: none;
          transition: background 0.2s ease, border-color 0.2s ease,
                      color 0.2s ease, box-shadow 0.2s ease, transform 0.15s ease;
          text-decoration: none;
        }
        .mab-pill:active {
          transform: scale(0.95);
          opacity: 0.85;
        }

        /* Search — active state */
        .mab-pill-search-active {
          background: var(--theme-primary);
          border-color: var(--theme-primary);
          color: #FFFFFF;
          box-shadow: 0 2px 12px var(--theme-primary);
        }

        /* Browse hover */
        .mab-pill:hover {
          border-color: var(--theme-primary);
          color: var(--theme-primary);
        }
        .mab-pill-search-active:hover {
          color: #FFFFFF;
        }

        /* ── Stats strip ── */
        .mab-stats {
          display: flex;
          align-items: center;
          gap: 10px;
          flex: 1;
          justify-content: flex-end;
          min-width: 0;
          overflow: hidden;
        }

        .mab-stat {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 11px;
          font-weight: 600;
          color: var(--theme-text-muted);
          white-space: nowrap;
          flex-shrink: 0;
        }

        /* ── Search panel ── */
        .mab-search-panel {
          background: var(--theme-background);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border-bottom: 1px solid var(--theme-border);
          padding: 10px 16px;
          box-shadow: 0 4px 24px rgba(0,0,0,0.12);
        }

        .mab-search-field {
          display: flex;
          align-items: center;
          gap: 10px;
          background: var(--theme-background-elevated);
          border: 2px solid var(--theme-primary);
          border-radius: 12px;
          padding: 0 10px;
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--theme-primary) 15%, transparent);
        }

        .mab-search-input {
          flex: 1;
          min-width: 0;
          background: transparent;
          border: none;
          outline: none;
          color: var(--theme-text-primary);
          font-size: 14px;
          padding: 11px 0;
          caret-color: var(--theme-primary);
        }
        .mab-search-input::placeholder {
          color: var(--theme-text-muted);
        }

        .mab-search-clear {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          border-radius: 8px;
          border: none;
          background: var(--theme-background-card);
          color: var(--theme-text-muted);
          cursor: pointer;
          flex-shrink: 0;
          -webkit-tap-highlight-color: transparent;
          touch-action: manipulation;
          transition: background 0.15s ease, color 0.15s ease;
        }
        .mab-search-clear:active { opacity: 0.7; }
        .mab-search-clear:hover  { background: var(--theme-border); color: var(--theme-text-primary); }

        .mab-search-go {
          display: flex;
          align-items: center;
          padding: 7px 14px;
          border-radius: 8px;
          border: none;
          background: linear-gradient(135deg, var(--theme-gradient-primary-1), var(--theme-gradient-primary-2));
          color: #FFFFFF;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          flex-shrink: 0;
          box-shadow: 0 2px 10px var(--theme-primary);
          -webkit-tap-highlight-color: transparent;
          touch-action: manipulation;
          transition: opacity 0.2s ease, transform 0.15s ease;
        }
        .mab-search-go:active  { transform: scale(0.95); opacity: 0.85; }
        .mab-search-go:hover   { opacity: 0.9; }

        .mab-search-hint {
          margin-top: 7px;
          font-size: 11px;
          color: var(--theme-text-muted);
          text-align: center;
        }

        .mab-hint-link {
          color: var(--theme-primary);
          font-weight: 600;
          text-decoration: none;
          -webkit-tap-highlight-color: transparent;
          transition: opacity 0.2s ease;
        }
        .mab-hint-link:hover   { opacity: 0.8; }
        .mab-hint-link:active  { opacity: 0.6; }

        /* ── Very small screens ≤ 360px ── */
        @media (max-width: 360px) {
          .mab-bar {
            padding-left: 12px;
            padding-right: 12px;
          }
          .mab-pill {
            padding: 8px 10px;
            font-size: 11px;
            gap: 5px;
          }
          .mab-pill-label {
            display: none;
          }
          .mab-stat {
            font-size: 10px;
          }
        }

        /* ── Reduced motion ── */
        @media (prefers-reduced-motion: reduce) {
          .mab-pill,
          .mab-search-clear,
          .mab-search-go {
            transition-duration: 0.01ms !important;
          }
        }
      `}</style>

      {/* ── Action bar (mobile only, hidden on md+) ── */}
      <div className="md:hidden mab-bar">
        <div className="mab-row">

          {/* Search toggle */}
          <button
            type="button"
            onClick={() => setShowSearch(v => !v)}
            aria-label="Search public research"
            aria-expanded={showSearch}
            className={`mab-pill${showSearch ? ' mab-pill-search-active' : ''}`}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <span className="mab-pill-label">Search</span>
          </button>

          {/* Browse / Discover */}
          <a
            href="/discover"
            className="mab-pill"
            aria-label="Browse all research"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
              <line x1="8"  y1="6"  x2="21" y2="6"/>
              <line x1="8"  y1="12" x2="21" y2="12"/>
              <line x1="8"  y1="18" x2="21" y2="18"/>
              <line x1="3"  y1="6"  x2="3.01" y2="6"/>
              <line x1="3"  y1="12" x2="3.01" y2="12"/>
              <line x1="3"  y1="18" x2="3.01" y2="18"/>
            </svg>
            <span className="mab-pill-label">Browse</span>
          </a>

          {/* Spacer */}
          <div style={{ flex: 1 }} aria-hidden="true" />

          {/* Stats */}
          <div className="mab-stats" aria-label="Report statistics">
            {viewCount > 0 && (
              <span className="mab-stat" title={`${viewCount} views`}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
                {viewCount >= 1000
                  ? `${(viewCount / 1000).toFixed(1)}k`
                  : viewCount}
              </span>
            )}
            {shareCount > 0 && (
              <span className="mab-stat" title={`${shareCount} shares`}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="18" cy="5"  r="3"/>
                  <circle cx="6"  cy="12" r="3"/>
                  <circle cx="18" cy="19" r="3"/>
                  <line x1="8.59"  y1="13.51" x2="15.42" y2="17.49"/>
                  <line x1="15.41" y1="6.51"  x2="8.59"  y2="10.49"/>
                </svg>
                {shareCount}
              </span>
            )}
          </div>

        </div>
      </div>

      {/* ── Inline search panel ── */}
      {showSearch && (
        <div className="md:hidden mab-search-panel" role="search">
          <form onSubmit={handleSearch}>
            <div className="mab-search-field">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                stroke="var(--theme-primary)" strokeWidth="2.5" strokeLinecap="round"
                style={{ flexShrink: 0 }} aria-hidden="true">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>

              <input
                className="mab-search-input"
                type="search"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search all public research…"
                autoFocus
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                enterKeyHint="search"
                aria-label="Search query"
              />

              {searchQuery && (
                <button
                  type="button"
                  className="mab-search-clear"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                    <line x1="18" y1="6"  x2="6"  y2="18"/>
                    <line x1="6"  y1="6"  x2="18" y2="18"/>
                  </svg>
                </button>
              )}

              <button
                type="submit"
                className="mab-search-go"
                aria-label="Submit search"
              >
                Go
              </button>
            </div>

            <p className="mab-search-hint">
              Search across all public research · or{' '}
              <a href="/discover" className="mab-hint-link">
                browse by topic →
              </a>
            </p>
          </form>
        </div>
      )}
    </>
  );
}