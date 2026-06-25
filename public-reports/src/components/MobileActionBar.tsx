'use client';
// Public-Reports/src/components/MobileActionBar.tsx
// Part 55.9 — Fully Themed Mobile Action Bar
// Fix: replaced .catch() with .then(null, () => {}) — PostgrestFilterBuilder is
// a PromiseLike (has .then) but not a full Promise (no .catch).
// Fix (this pass): removed onMouseEnter/onMouseLeave from <a> tags — event
// handlers were being passed to elements in a way that broke the Server/Client
// boundary ("Event handlers cannot be passed to Client Component props").
// Replaced with pure CSS hover classes, matching the ReportCard.tsx pattern.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseClient } from '@/lib/supabase-client';

interface Props {
  shareUrl: string;
  shareId?: string;
  viewCount: number;
  shareCount: number;
}

export default function MobileActionBar({ shareUrl, shareId, viewCount, shareCount }: Props) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);

      if (shareId) {
        supabaseClient
          .rpc('increment_share_count', { p_share_id: shareId })
          .then(null, () => { /* silent error — non-critical */ });
      }
    } catch {
      // clipboard API unavailable — silent fail
    }
  };

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
      {/* ── Action bar (mobile only, hidden on md+) ── */}
      <div
        className="md:hidden"
        style={{
          background: 'var(--theme-background)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: '1px solid var(--theme-border)',
          padding: '8px 16px',
          boxShadow: '0 2px 20px rgba(0,0,0,0.1)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>

          {/* Search button */}
          <button
            onClick={() => setShowSearch(v => !v)}
            aria-label="Search public research"
            aria-expanded={showSearch}
            className="transition-all duration-300 hover:scale-105"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '7px 12px',
              borderRadius: '10px',
              background: showSearch ? 'var(--theme-primary)' : 'var(--theme-background-elevated)',
              border: `1px solid ${showSearch ? 'var(--theme-primary)' : 'var(--theme-border)'}`,
              color: showSearch ? '#FFFFFF' : 'var(--theme-text-muted)',
              cursor: 'pointer',
              fontSize: '0.75rem',
              fontWeight: 600,
              transition: 'all 0.3s ease',
              flexShrink: 0,
              boxShadow: showSearch ? '0 2px 12px var(--theme-primary)' : 'none',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
            Search
          </button>

          {/* Browse / Discover link */}
          <a
            href="/discover"
            className="mab-browse-link transition-all duration-300 hover:scale-105 hover:shadow-md"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '7px 12px',
              borderRadius: '10px',
              background: 'var(--theme-background-elevated)',
              border: '1px solid var(--theme-border)',
              color: 'var(--theme-text-muted)',
              cursor: 'pointer',
              fontSize: '0.75rem',
              fontWeight: 600,
              textDecoration: 'none',
              flexShrink: 0,
              transition: 'all 0.3s ease',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="8" y1="6" x2="21" y2="6" />
              <line x1="8" y1="12" x2="21" y2="12" />
              <line x1="8" y1="18" x2="21" y2="18" />
              <line x1="3" y1="6" x2="3.01" y2="6" />
              <line x1="3" y1="12" x2="3.01" y2="12" />
              <line x1="3" y1="18" x2="3.01" y2="18" />
            </svg>
            Browse
          </a>

          {/* Flex spacer */}
          <div style={{ flex: 1 }} />

          {/* View + share count */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {viewCount > 0 && (
              <span style={{
                display: 'flex',
                alignItems: 'center',
                gap: 3,
                fontSize: '0.7rem',
                color: 'var(--theme-text-muted)',
                fontWeight: 600,
              }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                {viewCount >= 1000 ? `${(viewCount / 1000).toFixed(1)}k` : viewCount}
              </span>
            )}
            {shareCount > 0 && (
              <span style={{
                display: 'flex',
                alignItems: 'center',
                gap: 3,
                fontSize: '0.7rem',
                color: 'var(--theme-text-muted)',
                fontWeight: 600,
              }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
                  <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                  <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                </svg>
                {shareCount}
              </span>
            )}
          </div>

          {/* Copy / Share button */}
          <button
            onClick={handleCopy}
            aria-label={copied ? 'Copied!' : 'Copy share link'}
            className="transition-all duration-300 hover:scale-105"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '7px 12px',
              borderRadius: '10px',
              background: copied ? 'var(--theme-success)' : 'var(--theme-primary)',
              border: `1px solid ${copied ? 'var(--theme-success)' : 'var(--theme-primary)'}`,
              color: '#FFFFFF',
              cursor: 'pointer',
              fontSize: '0.75rem',
              fontWeight: 700,
              transition: 'all 0.3s ease',
              flexShrink: 0,
              boxShadow: copied ? '0 2px 12px var(--theme-success)' : '0 2px 12px var(--theme-primary)',
            }}
          >
            {copied ? (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
              </svg>
            )}
            {copied ? 'Copied!' : 'Share'}
          </button>
        </div>
      </div>

      {/* ── Inline search panel (expands below the action bar) ── */}
      {showSearch && (
        <div
          className="md:hidden"
          style={{
            background: 'var(--theme-background)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            borderBottom: '1px solid var(--theme-border)',
            padding: '10px 16px',
            boxShadow: '0 4px 24px rgba(0,0,0,0.15)',
          }}
        >
          <form onSubmit={handleSearch}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              background: 'var(--theme-background-elevated)',
              border: '2px solid var(--theme-primary)',
              borderRadius: '12px',
              padding: '0 12px',
              boxShadow: '0 0 0 4px var(--theme-primary)',
            }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                stroke="var(--theme-primary)" strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0 }}>
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
              </svg>
              <input
                type="search"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search all public research…"
                autoFocus
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: 'var(--theme-text-primary)',
                  fontSize: '0.875rem',
                  padding: '11px 0',
                  WebkitAppearance: 'none',
                }}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="transition-all duration-200 hover:scale-110"
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--theme-text-muted)',
                    padding: 2,
                    lineHeight: 1,
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              )}
              <button
                type="submit"
                className="transition-all duration-300 hover:scale-105 hover:shadow-lg"
                style={{
                  background: 'linear-gradient(135deg, var(--theme-gradient-primary-1), var(--theme-gradient-primary-2))',
                  border: 'none',
                  cursor: 'pointer',
                  borderRadius: 8,
                  padding: '6px 14px',
                  color: '#FFFFFF',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  flexShrink: 0,
                  boxShadow: '0 2px 12px var(--theme-primary)',
                }}
              >
                Go
              </button>
            </div>
            <p style={{
              marginTop: 6,
              fontSize: '0.7rem',
              color: 'var(--theme-text-muted)',
              textAlign: 'center',
            }}>
              Search across all public research · or{' '}
              <a
                href="/discover"
                className="mab-browse-topic-link"
                style={{
                  color: 'var(--theme-primary)',
                  textDecoration: 'none',
                  fontWeight: 600,
                  transition: 'opacity 0.2s ease',
                }}
              >
                browse by topic →
              </a>
            </p>
          </form>
        </div>
      )}

      <style>{`
        input[type="search"]::-webkit-search-cancel-button { display: none; }
        input[type="search"]::-webkit-search-decoration    { display: none; }

        .mab-browse-link:hover {
          border-color: var(--theme-primary);
          color: var(--theme-primary);
        }

        .mab-browse-topic-link:hover {
          opacity: 0.8;
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