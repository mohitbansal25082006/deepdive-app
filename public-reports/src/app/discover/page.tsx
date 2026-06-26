'use client';
// Public-Reports/src/app/discover/page.tsx
// Part 55.11 — Fix: search updates report grid, tag filter case-insensitive,
//              search bar stays in sync with state changes.
//
// Bugs fixed vs 55.9:
//  1. PublicSearchBar was mode="dropdown" — results only appeared in floating panel,
//     never updated the main report grid. Replaced with DiscoverSearchBar (controlled).
//  2. activeSearch state was only ever read from URL params on mount; the search
//     bar never wrote back to it. Now the search input is fully controlled and
//     drives both the URL and the grid.
//  3. Tag chips were passing lowercase tags (from old get_all_public_tags LOWER output)
//     to /api/discover which did exact-match against Title Case stored tags → 0 results.
//     The DB RPC is now fixed (Schema 55.11) to do case-insensitive matching.
//     The UI preserves the canonical tag casing returned by the API.
//  4. When switching tabs or clearing tags, the search bar input was not reset.
//     Fixed via controlled value prop + clearing searchInput state directly.
//  5. DiscoverSearchBar key prop was being passed as both key and inputKey —
//     only key is needed to remount; inputKey was redundant and is removed.
//  6. Search useEffect had an implicit stale-closure risk on isReportTab.
//     Now the effect reads activeTab directly from state instead.
//  7. hasMore / offset were not reset when switching between search mode and
//     feed mode, causing phantom "Load more" buttons.

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import ReportCard from '@/components/ReportCard';
import ResearcherCard from '@/components/ResearcherCard';
import type { PublicFeedReport, TagCount } from '@/types/report';
import type { ResearcherRow } from '@/app/api/researchers/route';

// ─── Constants ────────────────────────────────────────────────────────────────

const PLAY_STORE_URL =
  process.env.NEXT_PUBLIC_DEEPDIVE_PLAY_STORE_URL ??
  process.env.NEXT_PUBLIC_PLAY_STORE_URL ??
  'https://play.google.com/store/apps/details?id=com.deepdive.ai';

// ─── Global styles ────────────────────────────────────────────────────────────

const GLOBAL_STYLES = `
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes shimmer {
    0%   { background-position: -400px 0; }
    100% { background-position:  400px 0; }
  }
  @keyframes fadeInUp {
    from { opacity: 0; transform: translateY(20px); }
    to   { opacity: 1; transform: translateY(0);    }
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
    background: linear-gradient(90deg, var(--theme-background-elevated) 25%, var(--theme-primary) 50%, var(--theme-background-elevated) 75%);
    background-size: 800px 100%;
    animation: shimmer 1.4s infinite linear;
  }

  .shimmer-researcher {
    height: 260px;
    border-radius: 20px;
    background: linear-gradient(90deg, var(--theme-background-elevated) 25%, var(--theme-primary) 50%, var(--theme-background-elevated) 75%);
    background-size: 800px 100%;
    animation: shimmer 1.4s infinite linear;
  }

  .tap-btn:active { opacity: 0.7; transform: scale(0.97); }
  .tap-btn { transition: all 0.2s ease; }

  .dd-text-gradient {
    background: linear-gradient(135deg, var(--theme-gradient-primary-1), var(--theme-gradient-primary-2));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .discover-fade-in { animation: fadeInUp 0.5s ease-out both; }

  .discover-search-input::-webkit-search-cancel-button,
  .discover-search-input::-webkit-search-decoration { display: none; }

  @media (max-width: 479px) {
    .hero-badge  { font-size: 0.7rem !important; }
    .hero-title  { font-size: 1.5rem !important; }
    .hero-sub    { font-size: 0.875rem !important; }
    .sort-row    { gap: 6px !important; }
    .tag-chip    { font-size: 0.75rem !important; padding: 6px 10px !important; }
  }
`;

// ─── Primitives ───────────────────────────────────────────────────────────────

function TagChip({
  tag, count, active, onClick,
}: { tag: string; count?: number; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="tap-btn tag-chip"
      style={{
        display:    'inline-flex',
        alignItems: 'center',
        gap:        4,
        padding:    '7px 13px',
        minHeight:  36,
        borderRadius: '999px',
        border:     active ? '2px solid var(--theme-primary)' : '1px solid var(--theme-border)',
        background: active ? 'var(--theme-primary)' : 'var(--theme-background-card)',
        cursor:     'pointer',
        fontSize:   '0.8125rem',
        fontWeight: active ? 700 : 500,
        color:      active ? '#FFFFFF' : 'var(--theme-text-secondary)',
        transition: 'all 0.15s ease',
        whiteSpace: 'nowrap',
        userSelect: 'none',
      }}
    >
      #{tag}
      {count !== undefined && count > 0 && (
        <span style={{ fontSize: '0.6rem', color: active ? 'rgba(255,255,255,0.7)' : 'var(--theme-text-muted)', fontWeight: 600 }}>
          {count}
        </span>
      )}
    </button>
  );
}

type DiscoverTab = 'trending' | 'recent' | 'researchers';

function MainTab({
  label, icon, active, onClick,
}: { label: string; icon: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="tap-btn"
      style={{
        display:    'inline-flex',
        alignItems: 'center',
        gap:        6,
        padding:    '9px 16px',
        minHeight:  40,
        borderRadius: '10px',
        border:     active ? '2px solid var(--theme-primary)' : '1px solid var(--theme-border)',
        background: active
          ? 'linear-gradient(135deg, var(--theme-gradient-primary-1), var(--theme-gradient-primary-2))'
          : 'var(--theme-background-card)',
        cursor:     'pointer',
        fontSize:   '0.8125rem',
        fontWeight: 700,
        color:      active ? '#FFFFFF' : 'var(--theme-text-secondary)',
        transition: 'all 0.15s ease',
        boxShadow:  active ? '0 4px 12px var(--theme-primary)' : 'none',
        whiteSpace: 'nowrap',
        userSelect: 'none',
      }}
    >
      {icon}{label}
    </button>
  );
}

// ─── Inline search bar ────────────────────────────────────────────────────────
// FIX: Fully controlled. Accepts value + onChange from parent so the parent
// drives both the input display and the search state. The `key` prop on this
// component (set by parent) remounts it to reset when tabs change.

interface DiscoverSearchBarProps {
  value:      string;
  onChange:   (q: string) => void;
  isLoading?: boolean;
}

function DiscoverSearchBar({ value, onChange, isLoading }: DiscoverSearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      style={{
        display:    'flex',
        alignItems: 'center',
        gap:        10,
        padding:    '0 14px',
        height:     48,
        borderRadius: 16,
        border:     `2px solid ${value.length >= 2 ? 'var(--theme-primary)' : 'var(--theme-border)'}`,
        background: 'var(--theme-background-elevated)',
        transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
        boxShadow:  value.length >= 2 ? '0 0 0 4px var(--theme-primary)' : 'none',
        maxWidth:   600,
        margin:     '0 auto',
        width:      '100%',
      }}
    >
      {isLoading ? (
        <div style={{
          width: 16, height: 16, flexShrink: 0,
          border: '2px solid var(--theme-primary)',
          borderTopColor: 'transparent',
          borderRadius: '50%',
          animation: 'spin 0.6s linear infinite',
        }} />
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
          stroke={value.length >= 2 ? 'var(--theme-primary)' : 'var(--theme-text-muted)'}
          strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0 }}>
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
      )}

      <input
        ref={inputRef}
        type="search"
        className="discover-search-input"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="Search by topic, keyword, or author…"
        autoComplete="off"
        spellCheck={false}
        style={{
          flex:       1,
          background: 'transparent',
          border:     'none',
          outline:    'none',
          color:      'var(--theme-text-primary)',
          fontSize:   '0.875rem',
          padding:    0,
        }}
      />

      {value && (
        <button
          type="button"
          onClick={() => { onChange(''); inputRef.current?.focus(); }}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            padding: 4, flexShrink: 0, display: 'flex',
            alignItems: 'center', color: 'var(--theme-text-muted)',
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
    </div>
  );
}

// ─── Tag browse panel ─────────────────────────────────────────────────────────

function TagBrowsePanel({ tags, onTagClick, onClose }: {
  tags: TagCount[]; onTagClick: (tag: string) => void; onClose: () => void;
}) {
  const router = useRouter();
  if (tags.length === 0) return (
    <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--theme-text-muted)' }}>
      <p style={{ fontSize: '1.5rem', marginBottom: 8 }}>🏷</p>
      <p style={{ fontSize: '0.875rem' }}>No topic tags yet. Share a report to add tags!</p>
    </div>
  );
  return (
    <div style={{
      background:   'var(--theme-background-card)',
      border:       '2px solid var(--theme-primary)',
      borderRadius: '16px',
      overflow:     'hidden',
      marginBottom: 12,
    }}>
      <div style={{
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        padding:        '12px 14px',
        borderBottom:   '1px solid var(--theme-border)',
        background:     'var(--theme-background-elevated)',
      }}>
        <p style={{ color: 'var(--theme-text-primary)', fontSize: '0.875rem', fontWeight: 700, margin: 0 }}>
          Browse by Topic
        </p>
        <button onClick={onClose} className="tap-btn" style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--theme-text-muted)', padding: 8,
          display: 'flex', alignItems: 'center', minWidth: 40, minHeight: 40,
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
      <div style={{ padding: 14 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {tags.map(t => (
            <button
              key={t.tag}
              onClick={() => {
                onTagClick(t.tag);
                router.push(`/topic/${encodeURIComponent(t.tag.toLowerCase())}`);
              }}
              className="tap-btn"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '8px 14px', minHeight: 40, borderRadius: '999px',
                border: '1px solid var(--theme-border)',
                background: 'var(--theme-background-elevated)',
                cursor: 'pointer', fontSize: '0.8125rem', fontWeight: 600,
                color: 'var(--theme-text-secondary)', userSelect: 'none',
              }}
            >
              #{t.tag}
              <span style={{
                fontSize: '0.65rem', color: 'var(--theme-text-muted)', fontWeight: 600,
                background: 'var(--theme-background-card)', borderRadius: 6, padding: '1px 5px',
              }}>{t.count}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Researcher sort / section ────────────────────────────────────────────────

type ResearcherSort = 'followers' | 'active' | 'newest';

function ResearcherSortBar({ sort, onChange }: { sort: ResearcherSort; onChange: (s: ResearcherSort) => void }) {
  const options: { value: ResearcherSort; label: string }[] = [
    { value: 'followers', label: '⭐ Most Followed' },
    { value: 'active',    label: '🔥 Most Active' },
    { value: 'newest',    label: '🆕 Newest' },
  ];
  return (
    <div className="scroll-row" style={{ marginBottom: 14 }}>
      {options.map(opt => (
        <button key={opt.value} onClick={() => onChange(opt.value)} className="tap-btn" style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '7px 14px', minHeight: 36, borderRadius: '10px',
          border: sort === opt.value ? '2px solid var(--theme-primary)' : '1px solid var(--theme-border)',
          background: sort === opt.value ? 'var(--theme-primary)' : 'var(--theme-background-card)',
          cursor: 'pointer', fontSize: '0.8125rem', fontWeight: 700,
          color: sort === opt.value ? '#FFFFFF' : 'var(--theme-text-secondary)',
          whiteSpace: 'nowrap', userSelect: 'none',
        }}>{opt.label}</button>
      ))}
    </div>
  );
}

function ResearchersCTAStrip() {
  return (
    <div style={{
      marginBottom: 20,
      background:   'linear-gradient(135deg, var(--theme-background-elevated), var(--theme-background-card))',
      border:       '2px solid var(--theme-primary)',
      borderRadius: 16, padding: '16px 20px',
      display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
    }}>
      <div style={{ flex: 1, minWidth: 200 }}>
        <p style={{ color: 'var(--theme-text-primary)', fontSize: '0.9375rem', fontWeight: 800, marginBottom: 4 }}>
          Join DeepDive to follow researchers
        </p>
        <p style={{ color: 'var(--theme-text-secondary)', fontSize: '0.8rem', lineHeight: 1.5 }}>
          Get notified when your favourite researchers publish new AI-powered reports. Free to join — 20 credits on signup.
        </p>
      </div>
      <a href={PLAY_STORE_URL} target="_blank" rel="noopener noreferrer" className="tap-btn" style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        padding: '10px 20px', borderRadius: '999px',
        background: 'linear-gradient(135deg, var(--theme-gradient-primary-1), var(--theme-gradient-primary-2))',
        color: '#FFFFFF', fontWeight: 700, fontSize: '0.875rem',
        textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0,
        boxShadow: '0 4px 16px var(--theme-primary)',
      }}>
        Get DeepDive Free →
      </a>
    </div>
  );
}

function ResearchersSection() {
  const [sort, setSort]                 = useState<ResearcherSort>('followers');
  const [rawSearch, setRawSearch]       = useState('');
  const [searchQuery, setSearchQuery]   = useState('');
  const [researchers, setResearchers]   = useState<ResearcherRow[]>([]);
  const [isLoading, setIsLoading]       = useState(true);
  const [hasMore, setHasMore]           = useState(false);
  const [offset, setOffset]             = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const PAGE_SIZE = 24;

  const fetchResearchers = useCallback(async (
    newSort: ResearcherSort, newSearch: string, newOffset: number, append: boolean,
  ) => {
    if (newOffset === 0) setIsLoading(true); else setIsLoadingMore(true);
    try {
      const params = new URLSearchParams({ sort: newSort, limit: String(PAGE_SIZE), offset: String(newOffset) });
      if (newSearch.trim()) params.set('search', newSearch.trim());
      const res  = await fetch(`/api/researchers?${params}`);
      const data = await res.json() as { researchers: ResearcherRow[]; hasMore: boolean };
      const rows = data.researchers ?? [];
      if (append) setResearchers(prev => [...prev, ...rows]);
      else setResearchers(rows);
      setHasMore(data.hasMore ?? false);
      setOffset(newOffset + rows.length);
    } catch {
      if (!append) setResearchers([]);
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setSearchQuery(rawSearch), 300);
    return () => clearTimeout(t);
  }, [rawSearch]);

  useEffect(() => {
    setOffset(0);
    fetchResearchers(sort, searchQuery, 0, false);
  }, [sort, searchQuery, fetchResearchers]);

  return (
    <div>
      <ResearchersCTAStrip />

      <div style={{ marginBottom: 14 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: 'var(--theme-background-card)',
          border: '1px solid var(--theme-border)',
          borderRadius: 12, padding: '10px 14px',
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="var(--theme-text-muted)" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            value={rawSearch}
            onChange={e => setRawSearch(e.target.value)}
            placeholder="Search by name, username, or interest…"
            style={{
              flex: 1, background: 'none', border: 'none', outline: 'none',
              color: 'var(--theme-text-primary)', fontSize: '0.875rem',
            }}
          />
          {rawSearch && (
            <button onClick={() => setRawSearch('')} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--theme-text-muted)', display: 'flex', padding: 4,
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          )}
        </div>
      </div>

      <ResearcherSortBar sort={sort} onChange={newSort => { setSort(newSort); setOffset(0); }} />

      {isLoading ? (
        <div className="researcher-grid">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="shimmer-researcher" />)}
        </div>
      ) : researchers.length === 0 ? (
        <div style={{ textAlign: 'center', paddingTop: 60, paddingBottom: 60 }}>
          <p style={{ fontSize: '2.5rem', marginBottom: 14 }}>👩‍🔬</p>
          <h2 style={{ fontSize: 'clamp(1rem, 4vw, 1.25rem)', fontWeight: 700, color: 'var(--theme-text-primary)', marginBottom: 8 }}>
            {rawSearch ? `No researchers matching "${rawSearch}"` : 'No public researchers yet'}
          </h2>
          <p style={{ color: 'var(--theme-text-secondary)', fontSize: '0.875rem', maxWidth: 320, margin: '0 auto 24px' }}>
            {rawSearch ? 'Try a different search term.' : 'Be the first to make your profile public in the DeepDive app!'}
          </p>
          {rawSearch && (
            <button onClick={() => setRawSearch('')} className="tap-btn" style={{
              padding: '10px 24px', borderRadius: '999px',
              border: '1px solid var(--theme-border)',
              background: 'var(--theme-background-card)',
              cursor: 'pointer', color: 'var(--theme-text-secondary)',
              fontSize: '0.875rem', fontWeight: 600,
            }}>Clear search</button>
          )}
        </div>
      ) : (
        <>
          <p style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--theme-text-muted)', marginBottom: 12 }}>
            {researchers.length}{hasMore ? '+' : ''} researchers{rawSearch ? ` matching "${rawSearch}"` : ''}
          </p>
          <div className="researcher-grid">
            {researchers.map(r => (
              <ResearcherCard key={r.id} researcher={r} playStoreUrl={PLAY_STORE_URL} />
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
                  border: '1px solid var(--theme-border)',
                  background: isLoadingMore ? 'var(--theme-background-elevated)' : 'var(--theme-background-card)',
                  cursor: isLoadingMore ? 'wait' : 'pointer',
                  color: 'var(--theme-text-secondary)',
                  fontSize: '0.875rem', fontWeight: 600,
                  display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 48,
                }}
              >
                {isLoadingMore ? (
                  <>
                    <div style={{ width: 14, height: 14, border: '2px solid var(--theme-primary)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
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

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function DiscoverPageLoading() {
  return (
    <div style={{
      minHeight: '100vh', background: 'var(--theme-background)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: 24, gap: 20,
    }}>
      <div style={{
        width: 56, height: 56, borderRadius: 14,
        background: '#FFFFFF', border: '1px solid var(--theme-border)',
        overflow: 'hidden', display: 'flex',
        alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
      }}>
        <Image src="/icon.png" alt="DeepDive AI" width={40} height={40} style={{ objectFit: 'contain' }} priority />
      </div>
      <div style={{
        width: 36, height: 36,
        border: '3px solid var(--theme-background-elevated)',
        borderTopColor: 'var(--theme-primary)',
        borderRadius: '50%', animation: 'spin 0.8s linear infinite',
      }} />
      <p style={{ color: 'var(--theme-text-secondary)', fontSize: '0.875rem', fontWeight: 500, margin: 0 }}>
        Loading Discover...
      </p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─── DiscoverClient ────────────────────────────────────────────────────────────

function DiscoverClient() {
  const router       = useRouter();
  const searchParams = useSearchParams();

  const [isClientReady, setIsClientReady] = useState(false);

  // ── Tab / filter state ──
  const [activeTab, setActiveTab] = useState<DiscoverTab>(() => {
    const t = searchParams.get('tab');
    if (t === 'researchers') return 'researchers';
    if (t === 'recent')      return 'recent';
    return 'trending';
  });
  const [activeTag, setActiveTag]       = useState<string | null>(() => searchParams.get('tag') || null);
  const [showTagPanel, setShowTagPanel] = useState(false);

  // ── Search state ──
  // searchInput  : what the user has typed (controlled input value)
  // debouncedSearch : fires the actual fetch after 320 ms of no typing
  // FIX: both are reset together when tab/tag changes
  const [searchInput, setSearchInput]         = useState(() => searchParams.get('q') || '');
  const [debouncedSearch, setDebouncedSearch] = useState(() => searchParams.get('q') || '');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Report data ──
  const [reports, setReports]             = useState<PublicFeedReport[]>([]);
  const [searchResults, setSearchResults] = useState<PublicFeedReport[]>([]);
  const [tags, setTags]                   = useState<TagCount[]>([]);
  const [isLoading, setIsLoading]         = useState(true);
  const [isSearching, setIsSearching]     = useState(false);
  const [hasMore, setHasMore]             = useState(false);
  const [offset, setOffset]               = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // FIX: derive isSearchMode from debouncedSearch (not searchInput) so the
  // grid only switches to search mode once the debounce has settled.
  const isSearchMode = debouncedSearch.trim().length >= 2;
  const isReportTab  = activeTab === 'trending' || activeTab === 'recent';

  // ── Mount ──
  useEffect(() => { setIsClientReady(true); }, []);

  // ── Sync URL ──
  useEffect(() => {
    const p = new URLSearchParams();
    if (activeTab !== 'trending')          p.set('tab', activeTab);
    if (activeTag)                          p.set('tag', activeTag);
    if (debouncedSearch.trim().length >= 2) p.set('q',   debouncedSearch.trim());
    const qs = p.toString();
    router.replace(qs ? `/discover?${qs}` : '/discover', { scroll: false });
  }, [activeTab, activeTag, debouncedSearch, router]);

  // ── Debounce search input ──
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(searchInput);
    }, 320);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchInput]);

  // ── Fetch tags (once on mount) ──
  useEffect(() => {
    fetch('/api/discover/tags')
      .then(r => r.ok ? r.json() : { tags: [] })
      .then(d => setTags(d.tags ?? []))
      .catch(() => {});
  }, []);

  // ── Fetch search results ──
  // FIX: depends on activeTab directly (not derived isReportTab which could
  // be stale in the closure). Resets searchResults when leaving search mode.
  useEffect(() => {
    const tab = activeTab;
    const q   = debouncedSearch.trim();

    if ((tab !== 'trending' && tab !== 'recent') || q.length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    let cancelled = false;
    setIsSearching(true);

    fetch(`/api/search?q=${encodeURIComponent(q)}&limit=48`)
      .then(r => r.ok ? r.json() : { results: [] })
      .then(d => { if (!cancelled) setSearchResults(d.results ?? []); })
      .catch(() => { if (!cancelled) setSearchResults([]); })
      .finally(() => { if (!cancelled) setIsSearching(false); });

    return () => { cancelled = true; };
  }, [debouncedSearch, activeTab]);

  // ── Fetch discover feed ──
  // FIX: skip when in search mode so we don't do a redundant feed fetch
  // while the user is typing. Also resets hasMore + offset on new params.
  const fetchReports = useCallback(async (
    sort: 'trending' | 'recent', tag: string | null, off: number, append: boolean,
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

  useEffect(() => {
    if (!isReportTab || isSearchMode) return;
    setOffset(0);
    setHasMore(false);
    fetchReports(activeTab as 'trending' | 'recent', activeTag, 0, false);
  }, [activeTab, activeTag, isReportTab, isSearchMode, fetchReports]);

  // ── Handlers ──

  // FIX: reset search + searchKey on tab change so the input is visually cleared
  const handleTabChange = (tab: DiscoverTab) => {
    setActiveTab(tab);
    setSearchInput('');
    setDebouncedSearch('');
    setSearchResults([]);
    setShowTagPanel(false);
  };

  // FIX: clear search when tag is selected; clear tag when search is active
  const handleTagClick = (tag: string) => {
    setActiveTag(prev => (prev?.toLowerCase() === tag.toLowerCase() ? null : tag));
    setSearchInput('');
    setDebouncedSearch('');
    setSearchResults([]);
    setShowTagPanel(false);
    if (activeTab === 'researchers') setActiveTab('trending');
  };

  const handleSearchChange = (q: string) => {
    setSearchInput(q);
    // FIX: clear active tag as soon as user starts a search (2+ chars)
    if (q.trim().length >= 2 && activeTag) {
      setActiveTag(null);
    }
  };

  const clearSearch = () => {
    setSearchInput('');
    setDebouncedSearch('');
    setSearchResults([]);
  };

  if (!isClientReady) return <DiscoverPageLoading />;

  // What to render in the report grid area
  const showSearchResults = isReportTab && isSearchMode;
  const displayReports    = showSearchResults ? searchResults : reports;
  const isGridLoading     = showSearchResults ? isSearching : isLoading;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--theme-background)', overflowX: 'hidden' }}>

      {/* ── Navbar ── */}
      <header className="sticky top-0 z-40" style={{
        background: 'var(--theme-background)',
        backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid var(--theme-border)',
        padding: '0 12px',
      }}>
        <div style={{
          maxWidth: '1000px', margin: '0 auto',
          display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', gap: 10, height: 56,
        }}>
          <Link href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <div style={{ width: 32, height: 32, borderRadius: 10, overflow: 'hidden', background: '#FFFFFF', border: '1px solid var(--theme-border)' }}>
              <Image src="/icon.png" alt="DeepDive AI" width={32} height={32} style={{ objectFit: 'contain' }} priority />
            </div>
            <span style={{ color: 'var(--theme-text-primary)', fontSize: '0.9rem', fontWeight: 800 }}>
              DeepDive <span className="dd-text-gradient">AI</span>
            </span>
          </Link>
          <div style={{ flex: 1 }} />
          <a href={PLAY_STORE_URL} target="_blank" rel="noopener noreferrer" className="tap-btn" style={{
            flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6,
            padding: '7px 14px', minHeight: 36, borderRadius: '999px',
            background: 'linear-gradient(135deg, var(--theme-gradient-primary-1), var(--theme-gradient-primary-2))',
            color: '#FFFFFF', fontSize: '0.8125rem', fontWeight: 700,
            textDecoration: 'none', boxShadow: '0 2px 12px var(--theme-primary)',
          }}>
            Get App
          </a>
        </div>
      </header>

      <main style={{ maxWidth: '1000px', margin: '0 auto', padding: '24px 12px 120px' }}>

        {/* ── Hero ── */}
        <div style={{ textAlign: 'center', marginBottom: 24 }} className="discover-fade-in">
          <div className="hero-badge" style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '5px 14px', borderRadius: '999px',
            fontSize: '0.75rem', fontWeight: 700, marginBottom: 12,
            background: 'var(--theme-primary)', color: '#FFFFFF',
            border: '1px solid var(--theme-primary)',
          }}>
            ✦ Research Discovery
          </div>
          <h1 className="hero-title" style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(1.5rem, 5vw, 2.5rem)', fontWeight: 800,
            color: 'var(--theme-text-primary)', letterSpacing: '-0.02em',
            marginBottom: 10, lineHeight: 1.15,
          }}>
            Discover <span className="dd-text-gradient">Public Research</span>
          </h1>
          <p className="hero-sub" style={{
            color: 'var(--theme-text-secondary)',
            fontSize: 'clamp(0.875rem, 2.5vw, 1rem)',
            maxWidth: 460, margin: '0 auto', lineHeight: 1.5,
          }}>
            Browse AI-generated research reports shared by the DeepDive community.
          </p>
        </div>

        {/* ── Search bar (FIX: now fully controlled, drives grid) ── */}
        <div style={{ marginBottom: 20 }}>
          {/* FIX: key on DiscoverSearchBar causes it to remount (clearing focus
              state etc.) when tabs switch, while value prop clears the text */}
          <DiscoverSearchBar
            key={activeTab}
            value={searchInput}
            onChange={handleSearchChange}
            isLoading={isSearching}
          />
          {searchInput.trim().length > 0 && searchInput.trim().length < 2 && (
            <p style={{ textAlign: 'center', color: 'var(--theme-text-muted)', fontSize: '0.75rem', marginTop: 8 }}>
              Type at least 2 characters to search…
            </p>
          )}
        </div>

        {/* ── Tab bar ── */}
        <div style={{ marginBottom: 18 }}>
          <div className="scroll-row sort-row" style={{ marginBottom: 10 }}>
            <MainTab
              label="Trending" active={activeTab === 'trending'}
              onClick={() => handleTabChange('trending')}
              icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>}
            />
            <MainTab
              label="Recent" active={activeTab === 'recent'}
              onClick={() => handleTabChange('recent')}
              icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>}
            />
            <MainTab
              label="Researchers" active={activeTab === 'researchers'}
              onClick={() => handleTabChange('researchers')}
              icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>}
            />

            {isReportTab && !isSearchMode && (
              <button onClick={() => setShowTagPanel(v => !v)} className="tap-btn" style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '9px 14px', minHeight: 40, borderRadius: '10px',
                border: showTagPanel ? '2px solid var(--theme-primary)' : '1px solid var(--theme-border)',
                background: showTagPanel ? 'var(--theme-primary)' : 'var(--theme-background-card)',
                cursor: 'pointer', fontSize: '0.8125rem', fontWeight: 700,
                color: showTagPanel ? '#FFFFFF' : 'var(--theme-text-secondary)',
                whiteSpace: 'nowrap',
              }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
                  <line x1="7" y1="7" x2="7.01" y2="7"/>
                </svg>
                Browse by Tags
                {tags.length > 0 && (
                  <span style={{
                    background: showTagPanel ? 'rgba(255,255,255,0.2)' : 'var(--theme-primary)',
                    borderRadius: '999px', padding: '1px 7px',
                    fontSize: '0.65rem', fontWeight: 700, color: '#FFFFFF',
                  }}>{tags.length}</span>
                )}
              </button>
            )}

            {/* Active tag pill */}
            {activeTag && isReportTab && !isSearchMode && (
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                padding: '6px 12px', minHeight: 40, borderRadius: '999px',
                background: 'var(--theme-primary)', border: '1px solid var(--theme-primary)',
              }}>
                <span style={{ color: '#FFFFFF', fontSize: '0.8125rem', fontWeight: 600 }}>
                  #{activeTag}
                </span>
                <button onClick={() => setActiveTag(null)} className="tap-btn" style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'rgba(255,255,255,0.6)', display: 'flex', padding: 4,
                  minWidth: 28, minHeight: 28, alignItems: 'center', justifyContent: 'center',
                }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
            )}

            {/* Search mode active indicator */}
            {isSearchMode && isReportTab && (
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                padding: '6px 12px', minHeight: 40, borderRadius: '999px',
                background: 'var(--theme-background-elevated)',
                border: '1px solid var(--theme-border)',
              }}>
                <span style={{ color: 'var(--theme-text-secondary)', fontSize: '0.8125rem', fontWeight: 600 }}>
                  🔍 &ldquo;{debouncedSearch.trim()}&rdquo;
                </span>
                <button onClick={clearSearch} className="tap-btn" style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--theme-text-muted)', display: 'flex', padding: 4,
                  minWidth: 28, minHeight: 28, alignItems: 'center', justifyContent: 'center',
                }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
            )}
          </div>

          {/* Tag browse panel */}
          {showTagPanel && isReportTab && !isSearchMode && (
            <TagBrowsePanel
              tags={tags}
              onTagClick={handleTagClick}
              onClose={() => setShowTagPanel(false)}
            />
          )}

          {/* Tag chips row (hidden during search) */}
          {!showTagPanel && tags.length > 0 && isReportTab && !isSearchMode && (
            <div className="scroll-row">
              <TagChip tag="all" active={!activeTag} onClick={() => setActiveTag(null)} />
              {tags.slice(0, 20).map(t => (
                <TagChip
                  key={t.tag}
                  tag={t.tag}
                  count={t.count}
                  // FIX: case-insensitive comparison for active state
                  active={activeTag?.toLowerCase() === t.tag.toLowerCase()}
                  onClick={() => handleTagClick(t.tag)}
                />
              ))}
            </div>
          )}
        </div>

        {/* ── Researchers tab ── */}
        {activeTab === 'researchers' ? (
          <ResearchersSection />
        ) : (
          /* ── Report grid ── */
          isGridLoading ? (
            <div className="report-grid">
              {Array.from({ length: 8 }).map((_, i) => <div key={i} className="shimmer-card" />)}
            </div>
          ) : displayReports.length === 0 ? (
            <div style={{ textAlign: 'center', paddingTop: 60, paddingBottom: 60 }}>
              <p style={{ fontSize: '2.5rem', marginBottom: 14 }}>
                {isSearchMode ? '🔍' : activeTag ? '🔖' : '🔬'}
              </p>
              <h2 style={{ fontSize: 'clamp(1rem, 4vw, 1.25rem)', fontWeight: 700, color: 'var(--theme-text-primary)', marginBottom: 8 }}>
                {isSearchMode
                  ? `No results for "${debouncedSearch.trim()}"`
                  : activeTag
                    ? `No reports tagged #${activeTag} yet`
                    : 'No public reports yet'}
              </h2>
              <p style={{ color: 'var(--theme-text-secondary)', fontSize: '0.9rem', marginBottom: 24, maxWidth: 320, margin: '0 auto 24px' }}>
                {isSearchMode
                  ? 'Try different keywords or browse the feed below.'
                  : activeTag
                    ? 'Try clearing the tag filter.'
                    : 'Be the first to share a research report!'}
              </p>
              {isSearchMode ? (
                <button onClick={clearSearch} className="tap-btn" style={{
                  padding: '12px 24px', borderRadius: '999px',
                  border: '1px solid var(--theme-border)',
                  background: 'var(--theme-background-card)',
                  cursor: 'pointer', color: 'var(--theme-text-secondary)',
                  fontSize: '0.875rem', fontWeight: 600, display: 'inline-flex',
                  alignItems: 'center', gap: 8,
                }}>
                  Clear search
                </button>
              ) : (
                <a href={PLAY_STORE_URL} target="_blank" rel="noopener noreferrer" className="tap-btn" style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  padding: '12px 24px', borderRadius: '999px',
                  background: 'linear-gradient(135deg, var(--theme-gradient-primary-1), var(--theme-gradient-primary-2))',
                  color: '#FFFFFF', textDecoration: 'none', fontWeight: 700,
                  fontSize: '0.875rem', boxShadow: '0 4px 16px var(--theme-primary)',
                }}>
                  Download DeepDive AI →
                </a>
              )}
            </div>
          ) : (
            <>
              <p style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--theme-text-muted)', marginBottom: 12 }}>
                {isSearchMode
                  ? `${displayReports.length} result${displayReports.length !== 1 ? 's' : ''} for "${debouncedSearch.trim()}"`
                  : activeTag
                    ? `Reports tagged #${activeTag} · ${displayReports.length}${hasMore ? '+' : ''} shown`
                    : `${activeTab === 'trending' ? 'Most viewed reports' : 'Latest reports'} · ${displayReports.length}${hasMore ? '+' : ''} shown`}
              </p>
              <div className="report-grid">
                {displayReports.map(report => (
                  <ReportCard key={report.shareId} report={report} activeTag={activeTag ?? undefined} />
                ))}
              </div>
              {/* FIX: Load more is hidden in search mode since we fetch all search
                  results in one shot (limit=48). Pagination only applies to the feed. */}
              {!isSearchMode && hasMore && (
                <div style={{ textAlign: 'center', marginTop: 28 }}>
                  <button
                    onClick={() => fetchReports(activeTab as 'trending' | 'recent', activeTag, offset, true)}
                    disabled={isLoadingMore}
                    className="tap-btn"
                    style={{
                      padding: '12px 32px', borderRadius: '999px',
                      border: '1px solid var(--theme-border)',
                      background: isLoadingMore ? 'var(--theme-background-elevated)' : 'var(--theme-background-card)',
                      cursor: isLoadingMore ? 'wait' : 'pointer',
                      color: 'var(--theme-text-secondary)',
                      fontSize: '0.875rem', fontWeight: 600,
                      display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 48,
                    }}
                  >
                    {isLoadingMore ? (
                      <>
                        <div style={{ width: 14, height: 14, border: '2px solid var(--theme-primary)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
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
        background: 'var(--theme-background)',
        backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        borderTop: '1px solid var(--theme-border)',
        padding: 'calc(10px + env(safe-area-inset-bottom)) 14px 10px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 10, zIndex: 40,
      }}>
        <p style={{ margin: 0, fontSize: 'clamp(0.7rem, 2.5vw, 0.8125rem)', color: 'var(--theme-text-secondary)', lineHeight: 1.3 }}>
          {activeTab === 'researchers' ? 'Follow researchers & get notified' : 'Create reports like these'}
        </p>
        <a href={PLAY_STORE_URL} target="_blank" rel="noopener noreferrer" className="tap-btn" style={{
          flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6,
          padding: '9px 16px', minHeight: 40, borderRadius: '999px',
          background: 'linear-gradient(135deg, var(--theme-gradient-primary-1), var(--theme-gradient-primary-2))',
          color: '#FFFFFF', fontWeight: 700, fontSize: '0.8125rem',
          textDecoration: 'none', whiteSpace: 'nowrap',
          boxShadow: '0 4px 16px var(--theme-primary)',
        }}>
          Get DeepDive AI Free →
        </a>
      </div>

      <style>{GLOBAL_STYLES}</style>
    </div>
  );
}

export default function DiscoverPage() {
  return (
    <Suspense fallback={<DiscoverPageLoading />}>
      <DiscoverClient />
    </Suspense>
  );
}