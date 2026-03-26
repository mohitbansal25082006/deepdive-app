'use client';
// Public-Reports/src/app/discover/page.tsx
// Part 34 Update — Mobile-optimised rewrite:
//   • Responsive navbar (stacked on xs, row on sm+)
//   • Touch-friendly tap targets (min 44px)
//   • Horizontal-scroll tag chips / sort tabs
//   • Single-col grid on mobile, auto-fill on md+
//   • Sticky CTA condensed for small screens
//   • All hover effects replaced/augmented with active states
//   • Fluid typography via clamp()
//   • Tag browse panel full-width on mobile

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams }  from 'next/navigation';
import ReportCard                      from '@/components/ReportCard';
import PublicSearchBar                 from '@/components/PublicSearchBar';
import type { PublicFeedReport, TagCount } from '@/types/report';

const PLAY_STORE_URL =
  typeof window !== 'undefined'
    ? (process.env.NEXT_PUBLIC_DEEPDIVE_PLAY_STORE_URL ?? process.env.NEXT_PUBLIC_PLAY_STORE_URL ?? '#')
    : '#';

// ── Global mobile styles injected once ────────────────────────────────────────

const GLOBAL_STYLES = `
  @keyframes spin  { to { transform: rotate(360deg); } }
  @keyframes shimmer {
    0%   { background-position: -400px 0; }
    100% { background-position:  400px 0; }
  }

  /* Hide scrollbar everywhere */
  * { -webkit-tap-highlight-color: transparent; }
  ::-webkit-scrollbar { display: none; }

  .scroll-row {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    overflow-y: hidden;
    padding-bottom: 4px;
    scrollbar-width: none;
    -webkit-overflow-scrolling: touch;
    flex-wrap: nowrap;
  }
  .scroll-row > * { flex-shrink: 0; }

  .report-grid {
    display: grid;
    gap: 14px;
    grid-template-columns: 1fr;
  }
  @media (min-width: 480px) {
    .report-grid { grid-template-columns: repeat(2, 1fr); }
  }
  @media (min-width: 768px) {
    .report-grid { grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }
  }

  .shimmer-card {
    height: 200px;
    border-radius: 16px;
    background: linear-gradient(90deg, var(--bg-elevated) 25%, rgba(108,99,255,0.06) 50%, var(--bg-elevated) 75%);
    background-size: 800px 100%;
    animation: shimmer 1.4s infinite linear;
  }

  /* Tap feedback */
  .tap-btn:active { opacity: 0.7; transform: scale(0.97); }

  /* Prevent body scroll when tag panel open on mobile */
  .tag-panel-wrap { width: 100%; }

  @media (max-width: 479px) {
    .hero-badge  { font-size: 0.7rem !important; }
    .hero-title  { font-size: 1.5rem !important; }
    .hero-sub    { font-size: 0.875rem !important; }
    .sort-row    { gap: 6px !important; }
    .tag-chip    { font-size: 0.75rem !important; padding: 6px 10px !important; }
  }
`;

// ── Tag chip ──────────────────────────────────────────────────────────────────

function TagChip({ tag, count, active, onClick }: {
  tag: string; count?: number; active: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="tap-btn tag-chip"
      style={{
        display:      'inline-flex',
        alignItems:   'center',
        gap:          4,
        padding:      '7px 13px',
        minHeight:    36,
        borderRadius: '999px',
        border:       '1px solid ' + (active ? 'rgba(108,99,255,0.5)' : 'var(--border)'),
        background:   active ? 'rgba(108,99,255,0.15)' : 'var(--bg-elevated)',
        cursor:       'pointer',
        fontSize:     '0.8125rem',
        fontWeight:   active ? 700 : 500,
        color:        active ? '#A78BFA' : 'var(--text-muted)',
        transition:   'all 0.15s ease',
        whiteSpace:   'nowrap',
        userSelect:   'none',
      }}
    >
      #{tag}
      {count !== undefined && count > 0 && (
        <span style={{
          fontSize:  '0.6rem',
          color:     active ? 'rgba(167,139,250,0.7)' : 'rgba(255,255,255,0.25)',
          fontWeight: 600,
        }}>
          {count}
        </span>
      )}
    </button>
  );
}

// ── Sort tab ──────────────────────────────────────────────────────────────────

function SortTab({ label, icon, active, onClick }: {
  label: string; icon: React.ReactNode; active: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="tap-btn"
      style={{
        display:    'inline-flex',
        alignItems: 'center',
        gap:        6,
        padding:    '8px 15px',
        minHeight:  40,
        borderRadius: '10px',
        border:     'none',
        background: active
          ? 'linear-gradient(135deg, #6C63FF, #8B5CF6)'
          : 'var(--bg-elevated)',
        cursor:     'pointer',
        fontSize:   '0.8125rem',
        fontWeight: 700,
        color:      active ? '#fff' : 'var(--text-muted)',
        transition: 'all 0.15s ease',
        boxShadow:  active ? '0 4px 12px rgba(108,99,255,0.3)' : 'none',
        whiteSpace: 'nowrap',
        userSelect: 'none',
      }}
    >
      {icon}{label}
    </button>
  );
}

// ── Tag browse panel ──────────────────────────────────────────────────────────

function TagBrowsePanel({ tags, onTagClick, onClose }: {
  tags:       TagCount[];
  onTagClick: (tag: string) => void;
  onClose:    () => void;
}) {
  const router = useRouter();

  if (tags.length === 0) {
    return (
      <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
        <p style={{ fontSize: '1.5rem', marginBottom: 8 }}>🏷</p>
        <p style={{ fontSize: '0.875rem' }}>No topic tags yet. Share a report to add tags!</p>
      </div>
    );
  }

  return (
    <div
      className="tag-panel-wrap"
      style={{
        background:   'var(--bg-card)',
        border:       '1px solid rgba(108,99,255,0.3)',
        borderRadius: '16px',
        overflow:     'hidden',
        marginBottom: 12,
      }}
    >
      {/* Header */}
      <div style={{
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        padding:        '12px 14px',
        borderBottom:   '1px solid var(--border)',
        background:     'var(--bg-elevated)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8,
            background: 'rgba(108,99,255,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#A78BFA" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
              <line x1="7" y1="7" x2="7.01" y2="7"/>
            </svg>
          </div>
          <div>
            <p style={{ color: 'var(--text-primary)', fontSize: '0.875rem', fontWeight: 700, margin: 0 }}>Browse by Topic</p>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.7rem', margin: '2px 0 0' }}>
              {tags.length} topics · tap to view reports
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="tap-btn"
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color:      'var(--text-muted)',
            padding:    '8px', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            minWidth:   40, minHeight: 40,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      {/* Tag grid */}
      <div style={{ padding: '14px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {tags.map(t => (
            <button
              key={t.tag}
              onClick={() => {
                onTagClick(t.tag);
                router.push(`/topic/${encodeURIComponent(t.tag)}`);
              }}
              className="tap-btn"
              style={{
                display:      'inline-flex',
                alignItems:   'center',
                gap:          6,
                padding:      '8px 14px',
                minHeight:    40,
                borderRadius: '999px',
                border:       '1px solid var(--border)',
                background:   'var(--bg-elevated)',
                cursor:       'pointer',
                fontSize:     '0.8125rem',
                fontWeight:   600,
                color:        'var(--text-secondary)',
                transition:   'all 0.15s ease',
                userSelect:   'none',
              }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
                <line x1="7" y1="7" x2="7.01" y2="7"/>
              </svg>
              #{t.tag}
              <span style={{
                fontSize:     '0.65rem',
                color:        'rgba(255,255,255,0.25)',
                fontWeight:   600,
                background:   'rgba(255,255,255,0.06)',
                borderRadius: 6,
                padding:      '1px 5px',
              }}>
                {t.count}
              </span>
            </button>
          ))}
        </div>
        <p style={{ marginTop: 12, fontSize: '0.7rem', color: 'var(--text-muted)', textAlign: 'center' }}>
          Tap any topic to browse all reports →
        </p>
      </div>
    </div>
  );
}

// ── Discover Client ────────────────────────────────────────────────────────────

function DiscoverClient() {
  const router       = useRouter();
  const searchParams = useSearchParams();

  const [sort,         setSort]         = useState<'trending' | 'recent'>(() =>
    searchParams.get('sort') === 'recent' ? 'recent' : 'trending',
  );
  const [activeTag,    setActiveTag]    = useState<string | null>(() => searchParams.get('tag') || null);
  const [activeSearch, setActiveSearch] = useState<string>(() => searchParams.get('q') || '');
  const [showTagPanel, setShowTagPanel] = useState(false);

  const [reports,       setReports]       = useState<PublicFeedReport[]>([]);
  const [tags,          setTags]          = useState<TagCount[]>([]);
  const [isLoading,     setIsLoading]     = useState(true);
  const [hasMore,       setHasMore]       = useState(false);
  const [offset,        setOffset]        = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const isSearchMode = activeSearch.trim().length >= 2;

  // Fetch tags on mount
  useEffect(() => {
    fetch('/api/discover/tags')
      .then(r => r.ok ? r.json() : { tags: [] })
      .then(d => setTags(d.tags ?? []))
      .catch(() => {});
  }, []);

  // Fetch feed
  const fetchReports = useCallback(async (
    newSort:   'trending' | 'recent',
    newTag:    string | null,
    newOffset: number,
    append:    boolean,
  ) => {
    if (newOffset === 0) setIsLoading(true); else setIsLoadingMore(true);
    try {
      const params = new URLSearchParams({ sort: newSort, limit: '24', offset: String(newOffset) });
      if (newTag) params.set('tag', newTag);
      const res  = await fetch(`/api/discover?${params}`);
      const data = await res.json() as { reports: PublicFeedReport[]; hasMore: boolean };
      if (append) setReports(prev => [...prev, ...(data.reports ?? [])]);
      else        setReports(data.reports ?? []);
      setHasMore(data.hasMore ?? false);
      setOffset(newOffset + (data.reports?.length ?? 0));
    } catch {
      if (!append) setReports([]);
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    if (isSearchMode) return;
    setOffset(0);
    fetchReports(sort, activeTag, 0, false);
  }, [sort, activeTag, isSearchMode, fetchReports]);

  useEffect(() => {
    const p = new URLSearchParams();
    if (sort !== 'trending') p.set('sort', sort);
    if (activeTag)           p.set('tag',  activeTag);
    if (activeSearch)        p.set('q',    activeSearch);
    const qs = p.toString();
    router.replace(qs ? `/discover?${qs}` : '/discover', { scroll: false });
  }, [sort, activeTag, activeSearch, router]);

  const handleSortChange = (newSort: 'trending' | 'recent') => {
    setSort(newSort);
    setActiveSearch('');
    setShowTagPanel(false);
  };

  const handleTagClick = (tag: string) => {
    setActiveTag(prev => (prev === tag ? null : tag));
    setActiveSearch('');
    setShowTagPanel(false);
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', overflowX: 'hidden' }}>

      {/* ── Navbar ────────────────────────────────────────────────────────── */}
      <header
        className="sticky top-0 z-40"
        style={{
          background:    'rgba(10,10,26,0.92)',
          backdropFilter:'blur(20px)',
          borderBottom:  '1px solid var(--border)',
          padding:       '0 12px',
        }}
      >
        {/* Row: logo + get-app */}
        <div style={{
          maxWidth:       '1000px',
          margin:         '0 auto',
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          gap:            10,
          height:         52,
        }}>
          <a href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
            <div style={{
              width: 30, height: 30, borderRadius: 10,
              background: 'linear-gradient(135deg, #6C63FF, #8B5CF6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
            </div>
            <span style={{ color: 'var(--text-primary)', fontSize: '0.9rem', fontWeight: 700 }}>DeepDive AI</span>
          </a>

          {/* Search — hidden on very small, shown on sm+ */}
          <div style={{ flex: 1, maxWidth: 420, display: 'none' }} className="nav-search-desktop">
            <PublicSearchBar
              mode="dropdown"
              placeholder="Search all research…"
              style={{ width: '100%' }}
            />
          </div>

          <a
            href={PLAY_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="tap-btn"
            style={{
              flexShrink:  0,
              display:     'flex',
              alignItems:  'center',
              gap:         6,
              padding:     '7px 14px',
              minHeight:   36,
              borderRadius:'999px',
              background:  'linear-gradient(135deg, #6C63FF, #8B5CF6)',
              color:       '#fff',
              fontSize:    '0.8125rem',
              fontWeight:  700,
              textDecoration: 'none',
              whiteSpace:  'nowrap',
            }}
          >
            Get App
          </a>
        </div>

        {/* Mobile search row — visible below navbar row */}
        <div
          className="nav-search-mobile"
          style={{ paddingBottom: 10, maxWidth: '1000px', margin: '0 auto' }}
        >
          <PublicSearchBar
            mode="dropdown"
            placeholder="Search all research…"
            style={{ width: '100%' }}
          />
        </div>
      </header>

      <main style={{ maxWidth: '1000px', margin: '0 auto', padding: '24px 12px 120px' }}>

        {/* ── Hero ──────────────────────────────────────────────────────── */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div
            className="hero-badge"
            style={{
              display:      'inline-flex',
              alignItems:   'center',
              gap:           6,
              padding:      '5px 14px',
              borderRadius: '999px',
              fontSize:     '0.75rem',
              fontWeight:   700,
              marginBottom: 12,
              background:   'rgba(108,99,255,0.12)',
              border:       '1px solid rgba(108,99,255,0.3)',
              color:        '#6C63FF',
            }}
          >
            ✦ Research Discovery
          </div>
          <h1
            className="hero-title"
            style={{
              fontFamily:    'var(--font-display)',
              fontSize:      'clamp(1.5rem, 5vw, 2.5rem)',
              fontWeight:    800,
              color:         'var(--text-primary)',
              letterSpacing: '-0.02em',
              marginBottom:  10,
              lineHeight:    1.15,
            }}
          >
            Discover Public Research
          </h1>
          <p
            className="hero-sub"
            style={{
              color:     'var(--text-muted)',
              fontSize:  'clamp(0.875rem, 2.5vw, 1rem)',
              maxWidth:  460,
              margin:    '0 auto',
              lineHeight: 1.5,
            }}
          >
            Browse AI-generated research reports shared by the DeepDive community.
          </p>
        </div>

        {/* ── Main search bar ────────────────────────────────────────────── */}
        <div style={{ marginBottom: 20 }}>
          <PublicSearchBar
            mode="dropdown"
            placeholder="Search by topic, keyword, or author…"
            initialQuery={activeSearch}
            onSelect={(shareId) => router.push(`/r/${shareId}`)}
            style={{ maxWidth: 600, margin: '0 auto', width: '100%' }}
          />
        </div>

        {/* ── Sort + Tag controls ────────────────────────────────────────── */}
        {!isSearchMode && (
          <div style={{ marginBottom: 18 }}>

            {/* Scrollable row: Sort tabs + Tags toggle */}
            <div className="scroll-row sort-row" style={{ marginBottom: 10 }}>
              <SortTab
                label="Trending"
                active={sort === 'trending'}
                onClick={() => handleSortChange('trending')}
                icon={
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}>
                    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
                    <polyline points="17 6 23 6 23 12"/>
                  </svg>
                }
              />
              <SortTab
                label="Recent"
                active={sort === 'recent'}
                onClick={() => handleSortChange('recent')}
                icon={
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}>
                    <circle cx="12" cy="12" r="10"/>
                    <polyline points="12 6 12 12 16 14"/>
                  </svg>
                }
              />

              {/* Browse by Tags toggle */}
              <button
                onClick={() => { setShowTagPanel(v => !v); setActiveSearch(''); }}
                className="tap-btn"
                style={{
                  display:     'inline-flex',
                  alignItems:  'center',
                  gap:         6,
                  padding:     '8px 14px',
                  minHeight:   40,
                  borderRadius:'10px',
                  border:      '1px solid ' + (showTagPanel ? 'rgba(108,99,255,0.5)' : 'var(--border)'),
                  background:  showTagPanel ? 'rgba(108,99,255,0.12)' : 'var(--bg-elevated)',
                  cursor:      'pointer',
                  fontSize:    '0.8125rem',
                  fontWeight:  700,
                  color:       showTagPanel ? '#A78BFA' : 'var(--text-muted)',
                  transition:  'all 0.15s ease',
                  whiteSpace:  'nowrap',
                  userSelect:  'none',
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
                  <line x1="7" y1="7" x2="7.01" y2="7"/>
                </svg>
                Browse by Tags
                {tags.length > 0 && (
                  <span style={{
                    background:   'rgba(108,99,255,0.15)',
                    borderRadius: '999px',
                    padding:      '1px 7px',
                    fontSize:     '0.65rem',
                    fontWeight:   700,
                  }}>
                    {tags.length}
                  </span>
                )}
                <svg
                  width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                  style={{ transform: showTagPanel ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s', flexShrink: 0 }}
                >
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </button>

              {/* Active tag clear badge */}
              {activeTag && (
                <div style={{
                  display:     'inline-flex',
                  alignItems:  'center',
                  gap:         7,
                  padding:     '6px 12px',
                  minHeight:   40,
                  borderRadius:'999px',
                  background:  'rgba(108,99,255,0.1)',
                  border:      '1px solid rgba(108,99,255,0.3)',
                  whiteSpace:  'nowrap',
                }}>
                  <span style={{ color: '#A78BFA', fontSize: '0.8125rem', fontWeight: 600 }}>#{activeTag}</span>
                  <button
                    onClick={() => setActiveTag(null)}
                    className="tap-btn"
                    style={{
                      background: 'none',
                      border:     'none',
                      cursor:     'pointer',
                      color:      'rgba(167,139,250,0.6)',
                      display:    'flex',
                      padding:    '4px',
                      lineHeight: 1,
                      minWidth:   28,
                      minHeight:  28,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <line x1="18" y1="6" x2="6" y2="18"/>
                      <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                </div>
              )}
            </div>

            {/* Tag browse panel */}
            {showTagPanel && (
              <TagBrowsePanel
                tags={tags}
                onTagClick={handleTagClick}
                onClose={() => setShowTagPanel(false)}
              />
            )}

            {/* Quick tag chip row */}
            {!showTagPanel && tags.length > 0 && (
              <div className="scroll-row">
                <TagChip tag="all" active={!activeTag} onClick={() => setActiveTag(null)} />
                {tags.slice(0, 20).map(t => (
                  <TagChip
                    key={t.tag}
                    tag={t.tag}
                    count={t.count}
                    active={activeTag === t.tag}
                    onClick={() => handleTagClick(t.tag)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Report grid ────────────────────────────────────────────────── */}
        {isLoading ? (
          <div className="report-grid">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="shimmer-card" />
            ))}
          </div>
        ) : reports.length === 0 && !isSearchMode ? (
          <div style={{ textAlign: 'center', paddingTop: 60, paddingBottom: 60 }}>
            <p style={{ fontSize: '2.5rem', marginBottom: 14 }}>{activeTag ? '🔖' : '🔬'}</p>
            <h2 style={{ fontSize: 'clamp(1rem, 4vw, 1.25rem)', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
              {activeTag ? `No reports tagged #${activeTag} yet` : 'No public reports yet'}
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: 24, maxWidth: 320, margin: '0 auto 24px' }}>
              {activeTag
                ? 'Try clearing the tag filter or browsing all reports.'
                : 'Be the first to share a research report!'}
            </p>
            <a
              href={PLAY_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="tap-btn"
              style={{
                display:        'inline-flex',
                alignItems:     'center',
                gap:            8,
                padding:        '12px 24px',
                borderRadius:   '999px',
                background:     'linear-gradient(135deg, #6C63FF, #8B5CF6)',
                color:          '#fff',
                textDecoration: 'none',
                fontWeight:     700,
                fontSize:       '0.875rem',
              }}
            >
              Download DeepDive AI →
            </a>
          </div>
        ) : (
          <>
            {!isSearchMode && (
              <p style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 12 }}>
                {activeTag
                  ? `Reports tagged #${activeTag}`
                  : sort === 'trending' ? 'Most viewed reports' : 'Latest reports'}
                {reports.length > 0 && ` · ${reports.length}${hasMore ? '+' : ''} shown`}
              </p>
            )}
            <div className="report-grid">
              {reports.map(report => (
                <ReportCard
                  key={report.shareId}
                  report={report}
                  activeTag={activeTag ?? undefined}
                />
              ))}
            </div>
            {hasMore && (
              <div style={{ textAlign: 'center', marginTop: 28 }}>
                <button
                  onClick={() => fetchReports(sort, activeTag, offset, true)}
                  disabled={isLoadingMore}
                  className="tap-btn"
                  style={{
                    padding:      '12px 32px',
                    borderRadius: '999px',
                    border:       '1px solid var(--border)',
                    background:   isLoadingMore ? 'var(--bg-elevated)' : 'transparent',
                    cursor:       isLoadingMore ? 'wait' : 'pointer',
                    color:        'var(--text-secondary)',
                    fontSize:     '0.875rem',
                    fontWeight:   600,
                    display:      'inline-flex',
                    alignItems:   'center',
                    gap:          8,
                    transition:   'all 0.15s',
                    minHeight:    48,
                    userSelect:   'none',
                  }}
                >
                  {isLoadingMore ? (
                    <>
                      <div style={{
                        width: 14, height: 14,
                        border: '2px solid rgba(108,99,255,0.3)',
                        borderTopColor: '#6C63FF',
                        borderRadius: '50%',
                        animation: 'spin 0.6s linear infinite',
                      }} />
                      Loading…
                    </>
                  ) : 'Load more reports'}
                </button>
              </div>
            )}
          </>
        )}
      </main>

      {/* ── Sticky app CTA ─────────────────────────────────────────────────── */}
      <div style={{
        position:       'fixed',
        bottom:         0,
        left:           0,
        right:          0,
        background:     'rgba(10,10,26,0.97)',
        backdropFilter: 'blur(20px)',
        borderTop:      '1px solid var(--border)',
        padding:        '10px 14px',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        gap:            10,
        zIndex:         40,
        /* Safe area for iPhone home indicator */
        paddingBottom:  'calc(10px + env(safe-area-inset-bottom))',
      }}>
        <p style={{ margin: 0, fontSize: 'clamp(0.7rem, 2.5vw, 0.8125rem)', color: 'var(--text-muted)', lineHeight: 1.3 }}>
          Create reports like these
        </p>
        <a
          href={PLAY_STORE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="tap-btn"
          style={{
            flexShrink:     0,
            display:        'flex',
            alignItems:     'center',
            gap:            6,
            padding:        '9px 16px',
            minHeight:      40,
            borderRadius:   '999px',
            background:     'linear-gradient(135deg, #6C63FF, #8B5CF6)',
            color:          '#fff',
            fontWeight:     700,
            fontSize:       '0.8125rem',
            textDecoration: 'none',
            whiteSpace:     'nowrap',
          }}
        >
          Get DeepDive AI Free →
        </a>
      </div>

      {/* ── Responsive overrides ──────────────────────────────────────────── */}
      <style>{`
        ${GLOBAL_STYLES}

        /* Show desktop nav search on sm+ */
        @media (min-width: 560px) {
          .nav-search-desktop { display: block !important; }
          .nav-search-mobile  { display: none !important; }
        }
        /* Default: show mobile search row, hide desktop search */
        .nav-search-desktop { display: none; }
        .nav-search-mobile  { display: block; }
      `}</style>
    </div>
  );
}

export default function DiscoverPage() {
  return (
    <Suspense
      fallback={
        <div style={{
          minHeight:      '100vh',
          background:     'var(--bg-base)',
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
        }}>
          <div style={{
            width:          32,
            height:         32,
            border:         '3px solid rgba(108,99,255,0.3)',
            borderTopColor: '#6C63FF',
            borderRadius:   '50%',
            animation:      'spin 0.7s linear infinite',
          }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      }
    >
      <DiscoverClient />
    </Suspense>
  );
}