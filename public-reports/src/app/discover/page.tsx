'use client';
// Public-Reports/src/app/discover/page.tsx
// Part 34 — Initial discover feed (Trending / Recent tabs, tag filtering, search)
// Part 37 — Added: "Researchers" tab showing public researcher directory.
//           All Part 34 feed functionality is 100% preserved.

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams }  from 'next/navigation';
import ReportCard                      from '@/components/ReportCard';
import ResearcherCard                  from '@/components/ResearcherCard';
import PublicSearchBar                 from '@/components/PublicSearchBar';
import type { PublicFeedReport, TagCount } from '@/types/report';
import type { ResearcherRow }          from '@/app/api/researchers/route';

const PLAY_STORE_URL =
  typeof window !== 'undefined'
    ? (process.env.NEXT_PUBLIC_DEEPDIVE_PLAY_STORE_URL ?? process.env.NEXT_PUBLIC_PLAY_STORE_URL ?? '#')
    : '#';

// ─── Global mobile + grid styles ──────────────────────────────────────────────

const GLOBAL_STYLES = `
  @keyframes spin    { to { transform: rotate(360deg); } }
  @keyframes shimmer {
    0%   { background-position: -400px 0; }
    100% { background-position:  400px 0; }
  }

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

  /* Report grid */
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

  /* Researcher grid (Part 37) */
  .researcher-grid {
    display: grid;
    gap: 14px;
    grid-template-columns: 1fr;
  }
  @media (min-width: 480px) {
    .researcher-grid { grid-template-columns: repeat(2, 1fr); }
  }
  @media (min-width: 768px) {
    .researcher-grid { grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px; }
  }

  .shimmer-card {
    height: 200px;
    border-radius: 16px;
    background: linear-gradient(90deg, var(--bg-elevated) 25%, rgba(108,99,255,0.06) 50%, var(--bg-elevated) 75%);
    background-size: 800px 100%;
    animation: shimmer 1.4s infinite linear;
  }

  .shimmer-researcher {
    height: 260px;
    border-radius: 20px;
    background: linear-gradient(90deg, var(--bg-elevated) 25%, rgba(108,99,255,0.06) 50%, var(--bg-elevated) 75%);
    background-size: 800px 100%;
    animation: shimmer 1.4s infinite linear;
  }

  .tap-btn:active { opacity: 0.7; transform: scale(0.97); }
  .tag-panel-wrap { width: 100%; }

  @media (max-width: 479px) {
    .hero-badge  { font-size: 0.7rem !important; }
    .hero-title  { font-size: 1.5rem !important; }
    .hero-sub    { font-size: 0.875rem !important; }
    .sort-row    { gap: 6px !important; }
    .tag-chip    { font-size: 0.75rem !important; padding: 6px 10px !important; }
  }
`;

// ─── Shared primitives ────────────────────────────────────────────────────────

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
        <span style={{ fontSize: '0.6rem', color: active ? 'rgba(167,139,250,0.7)' : 'rgba(255,255,255,0.25)', fontWeight: 600 }}>
          {count}
        </span>
      )}
    </button>
  );
}

type DiscoverTab = 'trending' | 'recent' | 'researchers';

function MainTab({ label, icon, active, onClick }: {
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

// ─── Tag browse panel (Part 34 — unchanged) ───────────────────────────────────

function TagBrowsePanel({ tags, onTagClick, onClose }: {
  tags: TagCount[]; onTagClick: (tag: string) => void; onClose: () => void;
}) {
  const router = useRouter();
  if (tags.length === 0) return (
    <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
      <p style={{ fontSize: '1.5rem', marginBottom: 8 }}>🏷</p>
      <p style={{ fontSize: '0.875rem' }}>No topic tags yet. Share a report to add tags!</p>
    </div>
  );

  return (
    <div className="tag-panel-wrap" style={{
      background: 'var(--bg-card)', border: '1px solid rgba(108,99,255,0.3)',
      borderRadius: '16px', overflow: 'hidden', marginBottom: 12,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 14px', borderBottom: '1px solid var(--border)',
        background: 'var(--bg-elevated)',
      }}>
        <p style={{ color: 'var(--text-primary)', fontSize: '0.875rem', fontWeight: 700, margin: 0 }}>
          Browse by Topic
        </p>
        <button onClick={onClose} className="tap-btn" style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--text-muted)', padding: '8px',
          display: 'flex', alignItems: 'center', minWidth: 40, minHeight: 40,
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
      <div style={{ padding: '14px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {tags.map(t => (
            <button key={t.tag} onClick={() => { onTagClick(t.tag); router.push(`/topic/${encodeURIComponent(t.tag)}`); }}
              className="tap-btn" style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '8px 14px', minHeight: 40, borderRadius: '999px',
                border: '1px solid var(--border)', background: 'var(--bg-elevated)',
                cursor: 'pointer', fontSize: '0.8125rem', fontWeight: 600,
                color: 'var(--text-secondary)', userSelect: 'none',
              }}>
              #{t.tag}
              <span style={{
                fontSize: '0.65rem', color: 'rgba(255,255,255,0.25)', fontWeight: 600,
                background: 'rgba(255,255,255,0.06)', borderRadius: 6, padding: '1px 5px',
              }}>{t.count}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Researcher sort options (Part 37) ────────────────────────────────────────

type ResearcherSort = 'followers' | 'active' | 'newest';

function ResearcherSortBar({ sort, onChange }: {
  sort: ResearcherSort; onChange: (s: ResearcherSort) => void;
}) {
  const options: { value: ResearcherSort; label: string }[] = [
    { value: 'followers', label: '⭐ Most Followed' },
    { value: 'active',    label: '🔥 Most Active'   },
    { value: 'newest',    label: '🆕 Newest'         },
  ];
  return (
    <div className="scroll-row" style={{ marginBottom: 14 }}>
      {options.map(opt => (
        <button key={opt.value} onClick={() => onChange(opt.value)} className="tap-btn"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '7px 14px', minHeight: 36, borderRadius: '10px',
            border: '1px solid ' + (sort === opt.value ? 'rgba(108,99,255,0.45)' : 'var(--border)'),
            background: sort === opt.value ? 'rgba(108,99,255,0.12)' : 'var(--bg-elevated)',
            cursor: 'pointer', fontSize: '0.8125rem', fontWeight: 700,
            color: sort === opt.value ? '#A78BFA' : 'var(--text-muted)',
            whiteSpace: 'nowrap', userSelect: 'none',
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ─── Researchers CTA strip (Part 37) ─────────────────────────────────────────

function ResearchersCTAStrip() {
  return (
    <div style={{
      marginBottom: 20,
      background:   'linear-gradient(135deg, #1A1A35 0%, #0E0E28 100%)',
      border:       '1px solid rgba(108,99,255,0.25)',
      borderRadius: 16,
      padding:      '16px 20px',
      display:      'flex',
      alignItems:   'center',
      gap:          16,
      flexWrap:     'wrap',
    }}>
      <div style={{ flex: 1, minWidth: 200 }}>
        <p style={{
          color: 'var(--text-primary, #F0F0FF)', fontSize: '0.9375rem',
          fontWeight: 800, marginBottom: 4, letterSpacing: '-0.01em',
        }}>
          Join DeepDive to follow researchers
        </p>
        <p style={{ color: 'var(--text-muted, #6060A0)', fontSize: '0.8rem', lineHeight: 1.5 }}>
          Get notified when your favourite researchers publish new AI-powered reports.
          Free to join — 20 credits on signup.
        </p>
      </div>
      <a
        href={PLAY_STORE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="tap-btn"
        style={{
          display:        'inline-flex',
          alignItems:     'center',
          gap:            8,
          padding:        '10px 20px',
          borderRadius:   '999px',
          background:     'linear-gradient(135deg, #6C63FF, #8B5CF6)',
          color:          '#fff',
          fontWeight:     700,
          fontSize:       '0.875rem',
          textDecoration: 'none',
          whiteSpace:     'nowrap',
          flexShrink:     0,
        }}
      >
        Get DeepDive Free →
      </a>
    </div>
  );
}

// ─── Researchers section (Part 37) ────────────────────────────────────────────

function ResearchersSection() {
  const [sort,           setSort]           = useState<ResearcherSort>('followers');
  const [searchQuery,    setSearchQuery]    = useState('');
  const [researchers,    setResearchers]    = useState<ResearcherRow[]>([]);
  const [isLoading,      setIsLoading]      = useState(true);
  const [hasMore,        setHasMore]        = useState(false);
  const [offset,         setOffset]         = useState(0);
  const [isLoadingMore,  setIsLoadingMore]  = useState(false);

  const PAGE_SIZE = 24;

  const fetchResearchers = useCallback(async (
    newSort:   ResearcherSort,
    newSearch: string,
    newOffset: number,
    append:    boolean,
  ) => {
    if (newOffset === 0) setIsLoading(true); else setIsLoadingMore(true);
    try {
      const params = new URLSearchParams({
        sort:   newSort,
        limit:  String(PAGE_SIZE),
        offset: String(newOffset),
      });
      if (newSearch.trim()) params.set('search', newSearch.trim());

      const res  = await fetch(`/api/researchers?${params}`);
      const data = await res.json() as {
        researchers: ResearcherRow[];
        hasMore:     boolean;
      };
      const rows = data.researchers ?? [];
      if (append) setResearchers(prev => [...prev, ...rows]);
      else        setResearchers(rows);
      setHasMore(data.hasMore ?? false);
      setOffset(newOffset + rows.length);
    } catch {
      if (!append) setResearchers([]);
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, []);

  // Fetch on sort/search change
  useEffect(() => {
    setOffset(0);
    fetchResearchers(sort, searchQuery, 0, false);
  }, [sort, searchQuery, fetchResearchers]);

  // Debounce search input
  const [rawSearch, setRawSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setSearchQuery(rawSearch), 300);
    return () => clearTimeout(t);
  }, [rawSearch]);

  return (
    <div>
      {/* CTA strip */}
      <ResearchersCTAStrip />

      {/* Search bar */}
      <div style={{ marginBottom: 14 }}>
        <div style={{
          display:         'flex',
          alignItems:      'center',
          gap:             10,
          backgroundColor: 'var(--bg-elevated, #141430)',
          border:          '1px solid var(--border)',
          borderRadius:    12,
          padding:         '10px 14px',
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            value={rawSearch}
            onChange={e => setRawSearch(e.target.value)}
            placeholder="Search by name, username, or interest…"
            style={{
              flex:        1,
              background:  'none',
              border:      'none',
              outline:     'none',
              color:       'var(--text-primary, #F0F0FF)',
              fontSize:    '0.875rem',
            }}
          />
          {rawSearch && (
            <button
              onClick={() => setRawSearch('')}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text-muted)', display: 'flex', padding: 4,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Sort bar */}
      <ResearcherSortBar sort={sort} onChange={newSort => { setSort(newSort); setOffset(0); }} />

      {/* Grid */}
      {isLoading ? (
        <div className="researcher-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="shimmer-researcher" />
          ))}
        </div>
      ) : researchers.length === 0 ? (
        <div style={{ textAlign: 'center', paddingTop: 60, paddingBottom: 60 }}>
          <p style={{ fontSize: '2.5rem', marginBottom: 14 }}>👩‍🔬</p>
          <h2 style={{ fontSize: 'clamp(1rem, 4vw, 1.25rem)', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
            {rawSearch ? `No researchers matching "${rawSearch}"` : 'No public researchers yet'}
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', maxWidth: 320, margin: '0 auto 24px' }}>
            {rawSearch
              ? 'Try a different search term.'
              : 'Be the first to make your profile public in the DeepDive app!'}
          </p>
          {rawSearch && (
            <button onClick={() => setRawSearch('')} className="tap-btn" style={{
              padding: '10px 24px', borderRadius: '999px', border: '1px solid var(--border)',
              background: 'transparent', cursor: 'pointer', color: 'var(--text-secondary)',
              fontSize: '0.875rem', fontWeight: 600,
            }}>
              Clear search
            </button>
          )}
        </div>
      ) : (
        <>
          <p style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 12 }}>
            {researchers.length}{hasMore ? '+' : ''} researchers
            {rawSearch ? ` matching "${rawSearch}"` : ''}
          </p>
          <div className="researcher-grid">
            {researchers.map(r => (
              <ResearcherCard
                key={r.id}
                researcher={r}
                playStoreUrl={PLAY_STORE_URL}
              />
            ))}
          </div>
          {hasMore && (
            <div style={{ textAlign: 'center', marginTop: 28 }}>
              <button
                onClick={() => fetchResearchers(sort, searchQuery, offset, true)}
                disabled={isLoadingMore}
                className="tap-btn"
                style={{
                  padding: '12px 32px', borderRadius: '999px',
                  border: '1px solid var(--border)',
                  background: isLoadingMore ? 'var(--bg-elevated)' : 'transparent',
                  cursor: isLoadingMore ? 'wait' : 'pointer',
                  color: 'var(--text-secondary)', fontSize: '0.875rem', fontWeight: 600,
                  display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 48,
                }}
              >
                {isLoadingMore ? (
                  <>
                    <div style={{
                      width: 14, height: 14,
                      border: '2px solid rgba(108,99,255,0.3)',
                      borderTopColor: '#6C63FF', borderRadius: '50%',
                      animation: 'spin 0.6s linear infinite',
                    }} />
                    Loading…
                  </>
                ) : 'Load more researchers'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── DiscoverClient ────────────────────────────────────────────────────────────

function DiscoverClient() {
  const router       = useRouter();
  const searchParams = useSearchParams();

  // Part 37: tab is now 'trending' | 'recent' | 'researchers'
  const [activeTab,    setActiveTab]    = useState<DiscoverTab>(() => {
    const t = searchParams.get('tab');
    if (t === 'researchers') return 'researchers';
    if (t === 'recent')      return 'recent';
    return 'trending';
  });
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
  const isReportTab  = activeTab === 'trending' || activeTab === 'recent';

  // Sync URL params
  useEffect(() => {
    const p = new URLSearchParams();
    if (activeTab !== 'trending') p.set('tab', activeTab);
    if (activeTag)                p.set('tag', activeTag);
    if (activeSearch)             p.set('q',   activeSearch);
    const qs = p.toString();
    router.replace(qs ? `/discover?${qs}` : '/discover', { scroll: false });
  }, [activeTab, activeTag, activeSearch, router]);

  // Fetch tags on mount
  useEffect(() => {
    fetch('/api/discover/tags')
      .then(r => r.ok ? r.json() : { tags: [] })
      .then(d => setTags(d.tags ?? []))
      .catch(() => {});
  }, []);

  // Fetch feed (reports only)
  const fetchReports = useCallback(async (
    sort:      'trending' | 'recent',
    tag:       string | null,
    off:       number,
    append:    boolean,
  ) => {
    if (off === 0) setIsLoading(true); else setIsLoadingMore(true);
    try {
      const params = new URLSearchParams({ sort, limit: '24', offset: String(off) });
      if (tag) params.set('tag', tag);
      const res  = await fetch(`/api/discover?${params}`);
      const data = await res.json() as { reports: PublicFeedReport[]; hasMore: boolean };
      if (append) setReports(prev => [...prev, ...(data.reports ?? [])]);
      else        setReports(data.reports ?? []);
      setHasMore(data.hasMore ?? false);
      setOffset(off + (data.reports?.length ?? 0));
    } catch {
      if (!append) setReports([]);
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, []);

  // Re-fetch when feed tab / tag changes
  useEffect(() => {
    if (!isReportTab || isSearchMode) return;
    setOffset(0);
    fetchReports(activeTab as 'trending' | 'recent', activeTag, 0, false);
  }, [activeTab, activeTag, isReportTab, isSearchMode, fetchReports]);

  const handleTabChange = (tab: DiscoverTab) => {
    setActiveTab(tab);
    setActiveSearch('');
    setShowTagPanel(false);
  };

  const handleTagClick = (tag: string) => {
    setActiveTag(prev => (prev === tag ? null : tag));
    setActiveSearch('');
    setShowTagPanel(false);
    if (activeTab === 'researchers') setActiveTab('trending');
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', overflowX: 'hidden' }}>

      {/* ── Navbar ── */}
      <header className="sticky top-0 z-40" style={{
        background: 'rgba(10,10,26,0.92)', backdropFilter: 'blur(20px)',
        borderBottom: '1px solid var(--border)', padding: '0 12px',
      }}>
        <div style={{
          maxWidth: '1000px', margin: '0 auto',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 10, height: 52,
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
            <span style={{ color: 'var(--text-primary)', fontSize: '0.9rem', fontWeight: 700 }}>
              DeepDive AI
            </span>
          </a>
          <div style={{ flex: 1, maxWidth: 420, display: 'none' }} className="nav-search-desktop">
            <PublicSearchBar mode="dropdown" placeholder="Search all research…" style={{ width: '100%' }} />
          </div>
          <a href={PLAY_STORE_URL} target="_blank" rel="noopener noreferrer" className="tap-btn" style={{
            flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6,
            padding: '7px 14px', minHeight: 36, borderRadius: '999px',
            background: 'linear-gradient(135deg, #6C63FF, #8B5CF6)',
            color: '#fff', fontSize: '0.8125rem', fontWeight: 700, textDecoration: 'none',
          }}>
            Get App
          </a>
        </div>
        <div className="nav-search-mobile" style={{ paddingBottom: 10, maxWidth: '1000px', margin: '0 auto' }}>
          <PublicSearchBar mode="dropdown" placeholder="Search all research…" style={{ width: '100%' }} />
        </div>
      </header>

      <main style={{ maxWidth: '1000px', margin: '0 auto', padding: '24px 12px 120px' }}>

        {/* ── Hero ── */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div className="hero-badge" style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '5px 14px', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 700,
            marginBottom: 12, background: 'rgba(108,99,255,0.12)',
            border: '1px solid rgba(108,99,255,0.3)', color: '#6C63FF',
          }}>
            ✦ Research Discovery
          </div>
          <h1 className="hero-title" style={{
            fontFamily: 'var(--font-display)', fontSize: 'clamp(1.5rem, 5vw, 2.5rem)',
            fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em',
            marginBottom: 10, lineHeight: 1.15,
          }}>
            Discover Public Research
          </h1>
          <p className="hero-sub" style={{
            color: 'var(--text-muted)', fontSize: 'clamp(0.875rem, 2.5vw, 1rem)',
            maxWidth: 460, margin: '0 auto', lineHeight: 1.5,
          }}>
            Browse AI-generated research reports shared by the DeepDive community.
          </p>
        </div>

        {/* ── Main search bar ── */}
        <div style={{ marginBottom: 20 }}>
          <PublicSearchBar
            mode="dropdown"
            placeholder="Search by topic, keyword, or author…"
            initialQuery={activeSearch}
            onSelect={(shareId) => router.push(`/r/${shareId}`)}
            style={{ maxWidth: 600, margin: '0 auto', width: '100%' }}
          />
        </div>

        {/* ── Tab bar: Trending | Recent | Researchers (Part 37) ── */}
        <div style={{ marginBottom: 18 }}>
          <div className="scroll-row sort-row" style={{ marginBottom: 10 }}>
            <MainTab
              label="Trending"
              active={activeTab === 'trending'}
              onClick={() => handleTabChange('trending')}
              icon={
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}>
                  <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>
                </svg>
              }
            />
            <MainTab
              label="Recent"
              active={activeTab === 'recent'}
              onClick={() => handleTabChange('recent')}
              icon={
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}>
                  <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                </svg>
              }
            />
            {/* Part 37 — Researchers tab */}
            <MainTab
              label="Researchers"
              active={activeTab === 'researchers'}
              onClick={() => handleTabChange('researchers')}
              icon={
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}>
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
              }
            />

            {/* Browse by Tags — only show on report tabs */}
            {isReportTab && (
              <button onClick={() => { setShowTagPanel(v => !v); setActiveSearch(''); }}
                className="tap-btn" style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '8px 14px', minHeight: 40, borderRadius: '10px',
                  border: '1px solid ' + (showTagPanel ? 'rgba(108,99,255,0.5)' : 'var(--border)'),
                  background: showTagPanel ? 'rgba(108,99,255,0.12)' : 'var(--bg-elevated)',
                  cursor: 'pointer', fontSize: '0.8125rem', fontWeight: 700,
                  color: showTagPanel ? '#A78BFA' : 'var(--text-muted)', whiteSpace: 'nowrap',
                }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
                  <line x1="7" y1="7" x2="7.01" y2="7"/>
                </svg>
                Browse by Tags
                {tags.length > 0 && (
                  <span style={{
                    background: 'rgba(108,99,255,0.15)', borderRadius: '999px',
                    padding: '1px 7px', fontSize: '0.65rem', fontWeight: 700,
                  }}>{tags.length}</span>
                )}
              </button>
            )}

            {/* Active tag clear */}
            {activeTag && isReportTab && (
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                padding: '6px 12px', minHeight: 40, borderRadius: '999px',
                background: 'rgba(108,99,255,0.1)', border: '1px solid rgba(108,99,255,0.3)',
              }}>
                <span style={{ color: '#A78BFA', fontSize: '0.8125rem', fontWeight: 600 }}>
                  #{activeTag}
                </span>
                <button onClick={() => setActiveTag(null)} className="tap-btn" style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'rgba(167,139,250,0.6)', display: 'flex', padding: '4px',
                  minWidth: 28, minHeight: 28, alignItems: 'center', justifyContent: 'center',
                }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
            )}
          </div>

          {/* Tag browse panel (report tabs only) */}
          {showTagPanel && isReportTab && (
            <TagBrowsePanel tags={tags} onTagClick={handleTagClick} onClose={() => setShowTagPanel(false)} />
          )}

          {/* Quick tag chips (report tabs, no panel) */}
          {!showTagPanel && tags.length > 0 && isReportTab && (
            <div className="scroll-row">
              <TagChip tag="all" active={!activeTag} onClick={() => setActiveTag(null)} />
              {tags.slice(0, 20).map(t => (
                <TagChip key={t.tag} tag={t.tag} count={t.count}
                  active={activeTag === t.tag} onClick={() => handleTagClick(t.tag)} />
              ))}
            </div>
          )}
        </div>

        {/* ── Researchers tab content (Part 37) ── */}
        {activeTab === 'researchers' ? (
          <ResearchersSection />
        ) : (
          /* ── Report feed (Part 34 — unchanged) ── */
          isLoading ? (
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
                {activeTag ? 'Try clearing the tag filter.' : 'Be the first to share a research report!'}
              </p>
              <a href={PLAY_STORE_URL} target="_blank" rel="noopener noreferrer" className="tap-btn" style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '12px 24px', borderRadius: '999px',
                background: 'linear-gradient(135deg, #6C63FF, #8B5CF6)',
                color: '#fff', textDecoration: 'none', fontWeight: 700, fontSize: '0.875rem',
              }}>
                Download DeepDive AI →
              </a>
            </div>
          ) : (
            <>
              {!isSearchMode && (
                <p style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 12 }}>
                  {activeTag
                    ? `Reports tagged #${activeTag}`
                    : activeTab === 'trending' ? 'Most viewed reports' : 'Latest reports'}
                  {reports.length > 0 && ` · ${reports.length}${hasMore ? '+' : ''} shown`}
                </p>
              )}
              <div className="report-grid">
                {reports.map(report => (
                  <ReportCard key={report.shareId} report={report} activeTag={activeTag ?? undefined} />
                ))}
              </div>
              {hasMore && (
                <div style={{ textAlign: 'center', marginTop: 28 }}>
                  <button
                    onClick={() => fetchReports(activeTab as 'trending' | 'recent', activeTag, offset, true)}
                    disabled={isLoadingMore}
                    className="tap-btn"
                    style={{
                      padding: '12px 32px', borderRadius: '999px',
                      border: '1px solid var(--border)',
                      background: isLoadingMore ? 'var(--bg-elevated)' : 'transparent',
                      cursor: isLoadingMore ? 'wait' : 'pointer',
                      color: 'var(--text-secondary)', fontSize: '0.875rem', fontWeight: 600,
                      display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 48,
                    }}
                  >
                    {isLoadingMore ? (
                      <>
                        <div style={{
                          width: 14, height: 14,
                          border: '2px solid rgba(108,99,255,0.3)',
                          borderTopColor: '#6C63FF', borderRadius: '50%',
                          animation: 'spin 0.6s linear infinite',
                        }} />
                        Loading…
                      </>
                    ) : 'Load more reports'}
                  </button>
                </div>
              )}
            </>
          )
        )}
      </main>

      {/* ── Sticky app CTA ── */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: 'rgba(10,10,26,0.97)', backdropFilter: 'blur(20px)',
        borderTop: '1px solid var(--border)',
        padding: 'calc(10px + env(safe-area-inset-bottom)) 14px 10px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 10, zIndex: 40,
      }}>
        <p style={{ margin: 0, fontSize: 'clamp(0.7rem, 2.5vw, 0.8125rem)', color: 'var(--text-muted)', lineHeight: 1.3 }}>
          {activeTab === 'researchers'
            ? 'Follow researchers & get notified'
            : 'Create reports like these'}
        </p>
        <a href={PLAY_STORE_URL} target="_blank" rel="noopener noreferrer" className="tap-btn" style={{
          flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6,
          padding: '9px 16px', minHeight: 40, borderRadius: '999px',
          background: 'linear-gradient(135deg, #6C63FF, #8B5CF6)',
          color: '#fff', fontWeight: 700, fontSize: '0.8125rem',
          textDecoration: 'none', whiteSpace: 'nowrap',
        }}>
          Get DeepDive AI Free →
        </a>
      </div>

      <style>{`
        ${GLOBAL_STYLES}
        @media (min-width: 560px) {
          .nav-search-desktop { display: block !important; }
          .nav-search-mobile  { display: none  !important; }
        }
        .nav-search-desktop { display: none; }
        .nav-search-mobile  { display: block; }
      `}</style>
    </div>
  );
}

export default function DiscoverPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', background: 'var(--bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{
          width: 32, height: 32, border: '3px solid rgba(108,99,255,0.3)',
          borderTopColor: '#6C63FF', borderRadius: '50%', animation: 'spin 0.7s linear infinite',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    }>
      <DiscoverClient />
    </Suspense>
  );
}