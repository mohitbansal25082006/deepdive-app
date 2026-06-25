'use client';
// Public-Reports/src/components/PublicSearchBar.tsx
// Part 55.9 — Fully Themed Full-text Search Bar
// Two modes:
//  - 'dropdown' (default): shows floating results panel below the input
//  - 'page': navigates to /discover?q=... on submit (no dropdown)
// Used in the /discover page header and report page navbar.

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { PublicFeedReport } from '@/types/report';

interface Props {
  mode?: 'dropdown' | 'page';
  placeholder?: string;
  initialQuery?: string;
  onSelect?: (shareId: string) => void;
  className?: string;
  style?: React.CSSProperties;
  showInlineResults?: boolean;
}

const DEPTH_COLORS = {
  quick: '#10B981',
  deep: '#6C63FF',
  expert: '#F59E0B',
} as const;

function formatRelative(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export default function PublicSearchBar({
  mode = 'dropdown',
  placeholder = 'Search public research reports…',
  initialQuery = '',
  onSelect,
  className = '',
  style,
  showInlineResults = false,
}: Props) {
  const router = useRouter();

  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<(PublicFeedReport & { rank: number })[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // ── Debounced search ──────────────────────────────────────────────────────

  const doSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setResults([]);
      setIsOpen(false);
      setSearched(false);
      return;
    }

    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    setLoading(true);
    try {
      const res = await fetch(
        `/api/search?q=${encodeURIComponent(q.trim())}&limit=8`,
        { signal: abortRef.current.signal },
      );
      if (!res.ok) throw new Error('Search failed');
      const data = await res.json();
      setResults(data.results ?? []);
      setSearched(true);
      if (mode === 'dropdown') setIsOpen(true);
    } catch (err: unknown) {
      if ((err as Error).name !== 'AbortError') {
        setResults([]);
        setSearched(true);
      }
    } finally {
      setLoading(false);
    }
  }, [mode]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(query), 320);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, doSearch]);

  // ── Close dropdown on outside click ──────────────────────────────────────

  useEffect(() => {
    if (mode !== 'dropdown') return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [mode]);

  // ── Handle submit ─────────────────────────────────────────────────────────

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;

    if (mode === 'page') {
      router.push(`/discover?q=${encodeURIComponent(q)}`);
    }
  };

  // ── Handle result click ───────────────────────────────────────────────────

  const handleResultClick = (shareId: string) => {
    setIsOpen(false);
    if (onSelect) {
      onSelect(shareId);
    } else {
      router.push(`/r/${shareId}`);
    }
  };

  // ── Handle keyboard navigation ────────────────────────────────────────────

  const [focusedIdx, setFocusedIdx] = useState(-1);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIdx(i => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIdx(i => Math.max(i - 1, -1));
    } else if (e.key === 'Enter' && focusedIdx >= 0) {
      e.preventDefault();
      handleResultClick(results[focusedIdx].shareId);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      setFocusedIdx(-1);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const showDropdown = mode === 'dropdown' && isOpen && searched;
  const showFullGrid = showInlineResults && searched && query.trim().length >= 2;
  const hasResults = results.length > 0;

  return (
    <div
      ref={containerRef}
      className={`relative ${className}`}
      style={style}
    >
      {/* Input */}
      <form onSubmit={handleSubmit} role="search">
        <div
          className="flex items-center gap-3 px-4 rounded-2xl transition-all duration-300"
          style={{
            background: 'var(--theme-background-elevated)',
            border: `2px solid ${query.length >= 2 ? 'var(--theme-primary)' : 'var(--theme-border)'}`,
            boxShadow: query.length >= 2 ? '0 0 0 4px var(--theme-primary)' : 'none',
          }}
        >
          {/* Search icon */}
          {loading
            ? (
              <div
                style={{
                  width: 16,
                  height: 16,
                  border: '2px solid var(--theme-primary)',
                  borderTopColor: 'transparent',
                  borderRadius: '50%',
                  animation: 'spin 0.6s linear infinite',
                  flexShrink: 0,
                }}
              />
            )
            : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                stroke={query.length >= 2 ? 'var(--theme-primary)' : 'var(--theme-text-muted)'}
                strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                style={{ flexShrink: 0 }}>
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
            )
          }

          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={e => { setQuery(e.target.value); setFocusedIdx(-1); }}
            onFocus={() => { if (searched && results.length > 0 && mode === 'dropdown') setIsOpen(true); }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            autoComplete="off"
            spellCheck={false}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--theme-text-primary)',
              fontSize: '0.875rem',
              padding: '12px 0',
              WebkitAppearance: 'none',
            }}
          />

          {/* Clear button */}
          {query && (
            <button
              type="button"
              onClick={() => { setQuery(''); setResults([]); setIsOpen(false); setSearched(false); inputRef.current?.focus(); }}
              className="transition-all duration-200 hover:scale-110"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '2px',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--theme-text-muted)',
                borderRadius: '50%',
              }}
              aria-label="Clear search"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}

          {/* Submit (page mode) */}
          {mode === 'page' && (
            <button
              type="submit"
              className="transition-all duration-300 hover:scale-105 hover:shadow-lg"
              style={{
                background: 'linear-gradient(135deg, var(--theme-gradient-primary-1), var(--theme-gradient-primary-2))',
                border: 'none',
                cursor: 'pointer',
                padding: '6px 14px',
                borderRadius: '10px',
                color: '#FFFFFF',
                fontSize: '0.8125rem',
                fontWeight: 700,
                flexShrink: 0,
                boxShadow: '0 2px 12px var(--theme-primary)',
              }}
            >
              Search
            </button>
          )}
        </div>
      </form>

      {/* ── Dropdown results (dropdown mode) ── */}
      {showDropdown && (
        <div
          role="listbox"
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            left: 0,
            right: 0,
            background: 'var(--theme-background-card)',
            border: '2px solid var(--theme-primary)',
            borderRadius: '16px',
            overflow: 'hidden',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3), 0 0 0 4px var(--theme-primary)',
            zIndex: 1000,
            maxHeight: '400px',
            overflowY: 'auto',
          }}
        >
          {hasResults ? (
            <>
              <div
                className="flex items-center justify-between px-4 py-2.5"
                style={{
                  borderBottom: '1px solid var(--theme-border)',
                  background: 'var(--theme-background-elevated)',
                }}
              >
                <span className="text-xs font-bold" style={{ color: 'var(--theme-text-muted)' }}>
                  {results.length} result{results.length !== 1 ? 's' : ''}
                </span>
                <span className="text-xs" style={{ color: 'var(--theme-primary)' }}>
                  ↑↓ navigate · ↵ open
                </span>
              </div>

              {results.map((r, i) => (
                <button
                  key={r.shareId}
                  role="option"
                  aria-selected={focusedIdx === i}
                  onClick={() => handleResultClick(r.shareId)}
                  onMouseEnter={() => setFocusedIdx(i)}
                  className="transition-all duration-200"
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 12,
                    width: '100%',
                    padding: '12px 16px',
                    background: focusedIdx === i ? 'var(--theme-primary)' : 'transparent',
                    border: 'none',
                    borderBottom: i < results.length - 1 ? '1px solid var(--theme-border)' : 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  {/* Depth dot */}
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: DEPTH_COLORS[r.depth] ?? 'var(--theme-primary)',
                      flexShrink: 0,
                      marginTop: 5,
                      boxShadow: focusedIdx === i ? '0 0 12px var(--theme-primary)' : 'none',
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p
                      style={{
                        color: focusedIdx === i ? '#FFFFFF' : 'var(--theme-text-primary)',
                        fontSize: '0.875rem',
                        fontWeight: 600,
                        margin: 0,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {r.cachedTitle}
                    </p>
                    {r.cachedSummary && (
                      <p
                        style={{
                          color: focusedIdx === i ? 'rgba(255,255,255,0.8)' : 'var(--theme-text-muted)',
                          fontSize: '0.75rem',
                          margin: '3px 0 0',
                          display: '-webkit-box',
                          WebkitLineClamp: 1,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                        }}
                      >
                        {r.cachedSummary}
                      </p>
                    )}
                  </div>
                  <span style={{
                    color: focusedIdx === i ? 'rgba(255,255,255,0.6)' : 'var(--theme-text-muted)',
                    fontSize: '0.7rem',
                    flexShrink: 0,
                    marginTop: 2,
                  }}>
                    {formatRelative(r.createdAt)}
                  </span>
                </button>
              ))}

              {/* View all link */}
              <button
                onClick={() => { router.push(`/discover?q=${encodeURIComponent(query.trim())}`); setIsOpen(false); }}
                className="transition-all duration-300 hover:scale-[1.01]"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  width: '100%',
                  padding: '10px 16px',
                  background: 'var(--theme-background-elevated)',
                  border: 'none',
                  borderTop: '1px solid var(--theme-border)',
                  cursor: 'pointer',
                  color: 'var(--theme-primary)',
                  fontSize: '0.8125rem',
                  fontWeight: 700,
                }}
              >
                View all results for &ldquo;{query.trim()}&rdquo;
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </button>
            </>
          ) : (
            <div
              style={{
                padding: '24px 16px',
                textAlign: 'center',
                color: 'var(--theme-text-muted)',
                fontSize: '0.875rem',
              }}
            >
              <p style={{ fontSize: '1.5rem', marginBottom: 8 }}>🔍</p>
              <p>No reports found for &ldquo;{query.trim()}&rdquo;</p>
            </div>
          )}
        </div>
      )}

      {/* ── Inline full results grid (discover page mode) ── */}
      {showFullGrid && (
        <div style={{ marginTop: 24 }}>
          {hasResults ? (
            <>
              <p
                className="text-xs font-bold uppercase tracking-widest mb-4"
                style={{ color: 'var(--theme-text-muted)' }}
              >
                {results.length} result{results.length !== 1 ? 's' : ''} for &ldquo;{query.trim()}&rdquo;
              </p>
              <div
                className="grid gap-4"
                style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}
              >
                {results.map(r => (
                  <button
                    key={r.shareId}
                    onClick={() => handleResultClick(r.shareId)}
                    className="search-result-card transition-all duration-300 hover:scale-[1.02] hover:shadow-xl"
                    style={{
                      display: 'block',
                      width: '100%',
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <div
                      className="search-result-card-inner p-5 rounded-2xl"
                      style={{
                        background: 'var(--theme-background-card)',
                        border: '1px solid var(--theme-border)',
                        transition: 'border-color 0.3s ease',
                      }}
                    >
                      <div className="flex items-center gap-2 mb-3">
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold"
                          style={{
                            color: DEPTH_COLORS[r.depth] ?? 'var(--theme-primary)',
                            background: `${DEPTH_COLORS[r.depth] ?? 'var(--theme-primary)'}18`,
                          }}
                        >
                          {r.depth.charAt(0).toUpperCase() + r.depth.slice(1)}
                        </span>
                        <span className="text-xs ml-auto" style={{ color: 'var(--theme-text-muted)' }}>
                          👁 {r.viewCount}
                        </span>
                      </div>
                      <p className="font-bold text-sm mb-2 line-clamp-2" style={{ color: 'var(--theme-text-primary)' }}>
                        {r.cachedTitle}
                      </p>
                      <p className="text-xs line-clamp-2 mb-3" style={{ color: 'var(--theme-text-secondary)', lineHeight: 1.6 }}>
                        {r.cachedSummary}
                      </p>
                      {r.tags && r.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {r.tags.slice(0, 3).map(tag => (
                            <span key={tag} className="text-xs px-1.5 py-0.5 rounded-md"
                              style={{
                                background: 'var(--theme-background-elevated)',
                                color: 'var(--theme-text-secondary)',
                                border: '1px solid var(--theme-border)',
                              }}>
                              #{tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div
              className="text-center py-16"
              style={{ color: 'var(--theme-text-muted)' }}
            >
              <p style={{ fontSize: '3rem', marginBottom: 12 }}>🔍</p>
              <p className="font-bold mb-1" style={{ color: 'var(--theme-text-primary)' }}>No results found</p>
              <p className="text-sm" style={{ color: 'var(--theme-text-secondary)' }}>Try different keywords or browse the discover feed</p>
            </div>
          )}
        </div>
      )}

      {/* Spin keyframe */}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        input[type="search"]::-webkit-search-cancel-button { display: none; }
        input[type="search"]::-webkit-search-decoration { display: none; }

        .search-result-card:hover .search-result-card-inner {
          border-color: var(--theme-primary);
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