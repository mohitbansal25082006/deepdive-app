// Public-Reports/src/components/TrendingWidget.tsx 
// Part 55.9 — Fully Themed Trending Widget
// Server Component — fetches trending reports directly from Supabase.
// Shown in the right sidebar on desktop report pages.
// Excludes the current report from the list.

import Link from 'next/link';
import { supabaseServer } from '@/lib/supabase-server';
import type { TrendingReport } from '@/types/report';

interface Props {
  /** The current report's shareId — excluded from the list */
  currentShareId?: string;
  /** Max items to show */
  limit?: number;
}

const DEPTH_CONFIG = {
  quick: { color: '#10B981', label: 'Quick' },
  deep: { color: '#6C63FF', label: 'Deep' },
  expert: { color: '#F59E0B', label: 'Expert' },
} as const;

function SparklineBar({ rank, total }: { rank: number; total: number }) {
  const pct = Math.round(((total - rank + 1) / total) * 100);
  return (
    <div
      style={{
        height: 3,
        width: 48,
        background: 'var(--theme-background-elevated)',
        borderRadius: 2,
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          height: '100%',
          width: `${pct}%`,
          background: 'linear-gradient(90deg, var(--theme-gradient-primary-1), var(--theme-gradient-primary-2))',
          borderRadius: 2,
          boxShadow: '0 0 8px var(--theme-primary)',
          transition: 'width 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      />
    </div>
  );
}

export default async function TrendingWidget({ currentShareId, limit = 5 }: Props) {
  let trending: TrendingReport[] = [];

  try {
    const { data, error } = await supabaseServer.rpc('get_trending_reports', {
      p_days: 7,
      p_limit: limit + (currentShareId ? 1 : 0),
    });

    if (!error && data) {
      trending = (data as Record<string, unknown>[])
        .map(row => ({
          shareId: String(row.share_id ?? ''),
          viewCount: Number(row.view_count ?? 0),
          cachedTitle: String(row.cached_title ?? ''),
          tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
          depth: (row.depth as 'quick' | 'deep' | 'expert') ?? 'deep',
          ownerUsername: row.owner_username ? String(row.owner_username) : undefined,
          createdAt: String(row.created_at ?? ''),
        }))
        .filter(r => r.shareId !== currentShareId)
        .slice(0, limit);
    }
  } catch (err) {
    console.error('[TrendingWidget] fetch error:', err);
  }

  if (trending.length === 0) return null;

  return (
    <aside
      aria-label="Trending reports"
      className="trending-widget transition-all duration-300 hover:shadow-xl"
      style={{
        background: 'var(--theme-background-card)',
        border: '1px solid var(--theme-border)',
        borderRadius: '20px',
        padding: '20px',
        width: '100%',
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            background: 'var(--theme-warning)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            boxShadow: '0 2px 8px var(--theme-warning)',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
            <polyline points="17 6 23 6 23 12" />
          </svg>
        </div>
        <div>
          <p
            style={{
              fontSize: '0.75rem',
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--theme-text-muted)',
              margin: 0,
            }}
          >
            Trending This Week
          </p>
        </div>
      </div>

      {/* Report list */}
      <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {trending.map((report, i) => {
          const depth = DEPTH_CONFIG[report.depth] ?? DEPTH_CONFIG.deep;
          const totalViews = trending[0]?.viewCount ?? 1;
          const isFirst = i === 0;

          return (
            <li
              key={report.shareId}
              className="trending-item transition-all duration-300"
              style={{
                borderBottom: i < trending.length - 1 ? '1px solid var(--theme-border)' : 'none',
                paddingBottom: i < trending.length - 1 ? 14 : 0,
                paddingTop: i > 0 ? 14 : 0,
              }}
            >
              <Link
                href={`/r/${report.shareId}`}
                style={{ textDecoration: 'none', display: 'block' }}
                className="group"
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                    transition: 'all 0.3s ease',
                  }}
                >
                  {/* Rank number */}
                  <div
                    className="rank-badge transition-all duration-300 group-hover:scale-110"
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 7,
                      background: isFirst
                        ? 'var(--theme-warning)'
                        : 'var(--theme-background-elevated)',
                      border: `1px solid ${isFirst ? 'var(--theme-warning)' : 'var(--theme-border)'}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      fontSize: '0.625rem',
                      fontWeight: 800,
                      color: isFirst ? '#FFFFFF' : 'var(--theme-text-muted)',
                      boxShadow: isFirst ? '0 2px 8px var(--theme-warning)' : 'none',
                    }}
                  >
                    {i + 1}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Title */}
                    <p
                      className="trending-title transition-colors duration-300 group-hover:text-[var(--theme-primary)]"
                      style={{
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        color: 'var(--theme-text-primary)',
                        margin: '0 0 5px',
                        lineHeight: 1.4,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {report.cachedTitle || 'Untitled Report'}
                    </p>

                    {/* Meta row */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        flexWrap: 'wrap',
                      }}
                    >
                      {/* Depth badge */}
                      <span
                        className="depth-badge transition-all duration-300 group-hover:scale-105"
                        style={{
                          fontSize: '0.625rem',
                          fontWeight: 700,
                          color: depth.color,
                          background: `${depth.color}15`,
                          borderRadius: 4,
                          padding: '1px 5px',
                          border: `1px solid ${depth.color}25`,
                        }}
                      >
                        {depth.label}
                      </span>

                      {/* View count */}
                      <span
                        style={{
                          fontSize: '0.6875rem',
                          color: 'var(--theme-text-muted)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 3,
                        }}
                      >
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none"
                          stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                        {report.viewCount >= 1000
                          ? `${(report.viewCount / 1000).toFixed(1)}k`
                          : report.viewCount}
                      </span>

                      {/* Sparkline */}
                      <SparklineBar rank={i + 1} total={trending.length} />
                    </div>

                    {/* Tags */}
                    {report.tags && report.tags.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 5 }}>
                        {report.tags.slice(0, 2).map(tag => (
                          <span
                            key={tag}
                            className="transition-all duration-300 hover:scale-105"
                            style={{
                              fontSize: '0.625rem',
                              color: 'var(--theme-text-secondary)',
                              background: 'var(--theme-background-elevated)',
                              border: '1px solid var(--theme-border)',
                              borderRadius: 4,
                              padding: '1px 6px',
                            }}
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
      </ol>

      {/* Footer link */}
      <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--theme-border)' }}>
        <Link
          href="/discover"
          className="transition-all duration-300 hover:scale-105 hover:shadow-md"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            fontSize: '0.75rem',
            fontWeight: 700,
            color: '#FFFFFF',
            textDecoration: 'none',
            padding: '8px 12px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, var(--theme-gradient-primary-1), var(--theme-gradient-primary-2))',
            boxShadow: '0 2px 12px var(--theme-primary)',
          }}
        >
          Browse Discover Feed
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </Link>
      </div>

      <style>{`
        /* ── Trending widget hover effects ── */
        .trending-widget:hover {
          border-color: var(--theme-primary);
        }

        .trending-item:hover .rank-badge {
          border-color: var(--theme-primary) !important;
          background: var(--theme-primary) !important;
          color: #FFFFFF !important;
          box-shadow: 0 2px 12px var(--theme-primary) !important;
        }

        .trending-item:hover .trending-title {
          color: var(--theme-primary) !important;
        }

        .trending-item:hover .depth-badge {
          border-color: var(--theme-primary) !important;
          background: var(--theme-primary) !important;
          color: #FFFFFF !important;
        }

        /* ── Reduced motion support ── */
        @media (prefers-reduced-motion: reduce) {
          * {
            animation-duration: 0.01ms !important;
            transition-duration: 0.01ms !important;
          }
          
          .trending-widget:hover {
            transform: none !important;
          }
          
          .trending-item:hover .rank-badge {
            transform: none !important;
          }
          
          .trending-item:hover .depth-badge {
            transform: none !important;
          }
        }
      `}</style>
    </aside>
  );
}