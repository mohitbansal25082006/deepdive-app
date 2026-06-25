// Public-Reports/src/app/topic/[tag]/page.tsx
// Part 55.9 — Fully Themed Topic Tag Page
// Server-rendered topic tag page: /topic/[tag]
// - generateStaticParams: pre-renders top 50 tags at build time
// - ISR (60s revalidation) for all other tags
// - Full SEO: Open Graph + JSON-LD CollectionPage
// - Fully theme-integrated with modern design
//
// Fix (this pass): this is a Server Component (no 'use client'), and it had
// numerous <a>/<Link> elements with onMouseEnter/onMouseLeave handlers that
// mutated style imperatively. That throws "Event handlers cannot be passed
// to Client Component props" because function props can't cross the
// server→client serialization boundary on plain DOM elements rendered from
// a Server Component. All instances replaced with CSS :hover classes.

import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { createSupabaseServer } from '@/lib/supabase-server';
import ReportCard from '@/components/ReportCard';
import type { PublicFeedReport, TagCount } from '@/types/report';

// ── ISR ────────────────────────────────────────────────────────────────────────

export const revalidate = 60;

// ── Static params (top 50 tags pre-rendered at build) ─────────────────────────

export async function generateStaticParams(): Promise<{ tag: string }[]> {
  try {
    const supabase = createSupabaseServer();
    const { data } = await supabase.rpc('get_all_public_tags', { p_limit: 50 });
    return ((data ?? []) as TagCount[])
      .filter(t => t.tag && t.tag.length > 0)
      .map(t => ({ tag: encodeURIComponent(t.tag.toLowerCase()) }));
  } catch {
    return [];
  }
}

// ── Metadata ───────────────────────────────────────────────────────────────────

export async function generateMetadata({
  params,
}: {
  params: Promise<{ tag: string }>;
}): Promise<Metadata> {
  const { tag: rawTag } = await params;
  const tag = decodeURIComponent(rawTag).toLowerCase();

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://deepdive-reports.vercel.app';

  return {
    title: `#${tag} Research Reports | DeepDive AI`,
    description: `Browse AI-generated research reports tagged with #${tag}. Discover insights, findings and analysis on ${tag} topics — powered by DeepDive AI.`,
    keywords: [tag, 'research', 'AI report', 'DeepDive AI', 'autonomous research'],
    alternates: { canonical: `${appUrl}/topic/${tag}` },
    openGraph: {
      title: `#${tag} Research | DeepDive AI`,
      description: `AI-powered research reports on ${tag}. Browse insights and analysis.`,
      type: 'website',
      url: `${appUrl}/topic/${tag}`,
    },
    twitter: {
      card: 'summary_large_image',
      title: `#${tag} Research | DeepDive AI`,
      description: `AI research reports tagged #${tag}`,
    },
  };
}

// ── Data fetching ─────────────────────────────────────────────────────────────

async function fetchTagReports(tag: string): Promise<{
  reports: PublicFeedReport[];
  tagCount: number;
  allTags: TagCount[];
}> {
  const supabase = createSupabaseServer();

  const [feedResult, tagsResult] = await Promise.allSettled([
    supabase.rpc('get_public_reports_feed', {
      p_sort: 'trending',
      p_tag: tag,
      p_limit: 48,
      p_offset: 0,
    }),
    supabase.rpc('get_all_public_tags', { p_limit: 20 }),
  ]);

  const feedRows = feedResult.status === 'fulfilled' ? (feedResult.value.data ?? []) : [];
  const tagRows = tagsResult.status === 'fulfilled' ? (tagsResult.value.data ?? []) : [];

  const reports = (feedRows as Record<string, unknown>[]).map(row => ({
    shareId: String(row.share_id ?? ''),
    viewCount: Number(row.view_count ?? 0),
    shareCount: Number(row.share_count ?? 0),
    cachedTitle: String(row.cached_title ?? ''),
    cachedSummary: String(row.cached_summary ?? ''),
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
    depth: (row.depth as 'quick' | 'deep' | 'expert') ?? 'deep',
    researchMode: (row.research_mode as 'standard' | 'academic') ?? 'standard',
    ownerUsername: row.owner_username ? String(row.owner_username) : undefined,
    createdAt: String(row.created_at ?? ''),
    lastViewedAt: row.last_viewed_at ? String(row.last_viewed_at) : undefined,
  } as PublicFeedReport));

  const allTags = (tagRows as Record<string, unknown>[]).map(row => ({
    tag: String(row.tag ?? ''),
    count: Number(row.count ?? 0),
  }));

  const tagCount = allTags.find(t => t.tag === tag)?.count ?? reports.length;

  return { reports, tagCount, allTags };
}

// ── JSON-LD structured data ───────────────────────────────────────────────────

function buildJsonLd(tag: string, reports: PublicFeedReport[], appUrl: string): string {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `#${tag} Research Reports`,
    description: `AI-generated research reports tagged with #${tag}`,
    url: `${appUrl}/topic/${tag}`,
    numberOfItems: reports.length,
    hasPart: reports.slice(0, 10).map(r => ({
      '@type': 'Article',
      headline: r.cachedTitle,
      url: `${appUrl}/r/${r.shareId}`,
      author: r.ownerUsername ? { '@type': 'Person', name: r.ownerUsername } : undefined,
      datePublished: r.createdAt,
    })),
  });
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default async function TopicTagPage({
  params,
}: {
  params: Promise<{ tag: string }>;
}) {
  const { tag: rawTag } = await params;
  const tag = decodeURIComponent(rawTag).toLowerCase().trim();

  if (!tag || tag.length > 50 || !/^[a-z0-9 _-]+$/.test(tag)) notFound();

  const { reports, tagCount, allTags } = await fetchTagReports(tag);

  const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://deepdive-reports.vercel.app';
  const PLAY_STORE = process.env.DEEPDIVE_PLAY_STORE_URL ?? '#';

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: buildJsonLd(tag, reports, APP_URL) }}
      />

      <div className="min-h-screen pb-16" style={{ background: 'var(--theme-background)' }}>
        {/* ── Navbar ── */}
        <header
          className="sticky top-0 z-40 px-4 py-3 transition-all duration-300"
          style={{
            background: 'var(--theme-background)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            borderBottom: '1px solid var(--theme-border)',
          }}
        >
          <div className="max-w-5xl mx-auto flex items-center gap-3">
            <Link
              href="/"
              className="topic-logo-link"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                textDecoration: 'none',
                flexShrink: 0,
                transition: 'transform 0.2s ease',
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 10,
                  overflow: 'hidden',
                  background: '#FFFFFF',
                  border: '1px solid var(--theme-border)',
                }}
              >
                <Image src="/icon.png" alt="DeepDive AI" width={32} height={32} style={{ objectFit: 'contain' }} priority />
              </div>
              <span style={{
                color: 'var(--theme-text-primary)',
                fontWeight: 800,
                fontSize: '0.875rem',
              }}>
                DeepDive <span className="dd-text-gradient">AI</span>
              </span>
            </Link>

            {/* Breadcrumb */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              color: 'var(--theme-text-muted)',
              fontSize: '0.8125rem',
            }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
              <Link
                href="/discover"
                className="topic-breadcrumb-link"
                style={{
                  color: 'var(--theme-text-muted)',
                  textDecoration: 'none',
                  transition: 'color 0.2s ease',
                }}
              >
                Discover
              </Link>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
              <span style={{
                color: 'var(--theme-primary)',
                fontWeight: 700,
              }}>
                #{tag}
              </span>
            </div>

            <div style={{ flex: 1 }} />

            <a
              href={PLAY_STORE}
              target="_blank"
              rel="noopener noreferrer"
              className="topic-getapp-link"
              style={{
                flexShrink: 0,
                padding: '7px 16px',
                borderRadius: '999px',
                background: 'linear-gradient(135deg, var(--theme-gradient-primary-1), var(--theme-gradient-primary-2))',
                color: '#FFFFFF',
                fontWeight: 700,
                fontSize: '0.8125rem',
                textDecoration: 'none',
                boxShadow: '0 2px 12px var(--theme-primary)',
                transition: 'all 0.2s ease',
              }}
            >
              Get App
            </a>
          </div>
        </header>

        <main className="max-w-5xl mx-auto px-4 pt-10">
          {/* ── Tag hero ── */}
          <div className="mb-8">
            {/* Tag badge */}
            <div className="flex items-center gap-4 mb-4">
              <div
                className="topic-badge-icon"
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 16,
                  background: 'var(--theme-primary)',
                  border: '2px solid var(--theme-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.75rem',
                  flexShrink: 0,
                  transition: 'transform 0.3s ease',
                }}
              >
                🔖
              </div>
              <div>
                <h1
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 'clamp(1.5rem, 3.5vw, 2.25rem)',
                    fontWeight: 800,
                    color: 'var(--theme-text-primary)',
                    margin: 0,
                    letterSpacing: '-0.02em',
                  }}
                >
                  #{tag}
                </h1>
                <p style={{
                  color: 'var(--theme-text-secondary)',
                  fontSize: '0.875rem',
                  margin: '3px 0 0',
                }}>
                  {tagCount} public research report{tagCount !== 1 ? 's' : ''}
                </p>
              </div>
            </div>

            <p style={{
              color: 'var(--theme-text-secondary)',
              fontSize: '0.9375rem',
              lineHeight: 1.7,
              maxWidth: 600,
            }}>
              Browse AI-generated research on <strong style={{ color: 'var(--theme-text-primary)' }}>{tag}</strong>{' '}
              — created by the DeepDive AI community using multi-agent autonomous research.
            </p>
          </div>

          {/* ── Related tags ── */}
          {allTags.filter(t => t.tag !== tag).length > 0 && (
            <div className="mb-8">
              <p className="text-xs font-bold uppercase tracking-widest mb-3"
                style={{ color: 'var(--theme-text-muted)' }}>
                Related Topics
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {allTags.filter(t => t.tag !== tag).slice(0, 12).map(t => (
                  <Link
                    key={t.tag}
                    href={`/topic/${encodeURIComponent(t.tag)}`}
                    className="topic-related-chip"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      padding: '6px 14px',
                      borderRadius: '999px',
                      border: '1px solid var(--theme-border)',
                      background: 'var(--theme-background-card)',
                      color: 'var(--theme-text-secondary)',
                      fontSize: '0.8125rem',
                      fontWeight: 600,
                      textDecoration: 'none',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    #{t.tag}
                    <span style={{
                      fontSize: '0.625rem',
                      color: 'var(--theme-text-muted)',
                      fontWeight: 600,
                    }}>
                      {t.count}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* ── Divider ── */}
          <div className="flex items-center gap-4 mb-6">
            <div style={{ flex: 1, height: 1, background: 'var(--theme-border)' }} />
            <span className="text-xs font-bold uppercase tracking-widest"
              style={{ color: 'var(--theme-text-muted)' }}>
              {reports.length > 0 ? `${reports.length} Reports` : 'Reports'}
            </span>
            <div style={{ flex: 1, height: 1, background: 'var(--theme-border)' }} />
          </div>

          {/* ── Report grid ── */}
          {reports.length === 0 ? (
            <div className="text-center py-24">
              <div style={{ fontSize: '3rem', marginBottom: 16 }}>🔭</div>
              <h2 style={{
                fontSize: '1.25rem',
                fontWeight: 700,
                color: 'var(--theme-text-primary)',
                marginBottom: 8,
              }}>
                No reports yet for #{tag}
              </h2>
              <p style={{
                color: 'var(--theme-text-secondary)',
                fontSize: '0.9rem',
                marginBottom: 24,
              }}>
                Be the first to research this topic and share your report!
              </p>
              <a
                href={PLAY_STORE}
                target="_blank"
                rel="noopener noreferrer"
                className="topic-empty-cta"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '12px 28px',
                  borderRadius: '999px',
                  background: 'linear-gradient(135deg, var(--theme-gradient-primary-1), var(--theme-gradient-primary-2))',
                  color: '#FFFFFF',
                  textDecoration: 'none',
                  fontWeight: 700,
                  fontSize: '0.875rem',
                  boxShadow: '0 4px 16px var(--theme-primary)',
                  transition: 'all 0.2s ease',
                }}
              >
                Research #{tag} with DeepDive AI →
              </a>
            </div>
          ) : (
            <div
              className="grid gap-4"
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}
            >
              {reports.map(report => (
                <ReportCard
                  key={report.shareId}
                  report={report}
                  activeTag={tag}
                />
              ))}
            </div>
          )}

          {/* ── Browse all CTA ── */}
          {reports.length > 0 && (
            <div className="text-center mt-12">
              <Link
                href="/discover"
                className="topic-browseall-link"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '12px 28px',
                  borderRadius: '999px',
                  border: '1px solid var(--theme-border)',
                  background: 'var(--theme-background-card)',
                  color: 'var(--theme-text-secondary)',
                  fontWeight: 600,
                  fontSize: '0.875rem',
                  textDecoration: 'none',
                  transition: 'all 0.2s ease',
                }}
              >
                Browse All Research Topics
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </Link>
            </div>
          )}

          {/* ── App CTA ── */}
          <div
            className="mt-14 rounded-3xl p-8 text-center relative overflow-hidden"
            style={{
              background: 'linear-gradient(135deg, var(--theme-background-elevated), var(--theme-background-card))',
              border: '2px solid var(--theme-primary)',
            }}
          >
            <div
              style={{
                position: 'absolute',
                inset: 0,
                pointerEvents: 'none',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: '-50%',
                  left: '-50%',
                  width: '200%',
                  height: '200%',
                  borderRadius: '50%',
                  background: 'radial-gradient(ellipse, var(--theme-primary) 0%, transparent 70%)',
                  opacity: 0.06,
                  animation: 'pulse-slow 6s ease-in-out infinite',
                }}
              />
            </div>
            <div style={{ position: 'relative' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: 16 }}>🔬</div>
              <h2
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 'clamp(1.25rem, 2.5vw, 1.75rem)',
                  fontWeight: 800,
                  color: 'var(--theme-text-primary)',
                  marginBottom: 8,
                  letterSpacing: '-0.02em',
                }}
              >
                Research #{tag} yourself
              </h2>
              <p style={{
                color: 'var(--theme-text-secondary)',
                fontSize: '0.9375rem',
                marginBottom: 24,
                maxWidth: 500,
                marginLeft: 'auto',
                marginRight: 'auto',
                lineHeight: 1.6,
              }}>
                Use DeepDive AI to run autonomous research on any topic.
                Free to start — 20 credits on signup.
              </p>
              <a
                href={PLAY_STORE}
                target="_blank"
                rel="noopener noreferrer"
                className="topic-bottom-cta"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '13px 32px',
                  borderRadius: '999px',
                  background: 'linear-gradient(135deg, var(--theme-gradient-primary-1), var(--theme-gradient-primary-2))',
                  color: '#FFFFFF',
                  textDecoration: 'none',
                  fontWeight: 700,
                  fontSize: '0.9375rem',
                  boxShadow: '0 4px 24px var(--theme-primary)',
                  transition: 'all 0.2s ease',
                }}
              >
                Download DeepDive AI →
              </a>
            </div>
          </div>
        </main>
      </div>

      <style>{`
        .dd-text-gradient {
          background: linear-gradient(135deg, var(--theme-gradient-primary-1), var(--theme-gradient-primary-2));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        @keyframes pulse-slow {
          0%, 100% { opacity: 0.06; }
          50% { opacity: 0.12; }
        }

        .topic-logo-link:hover {
          transform: scale(1.02);
        }

        .topic-breadcrumb-link:hover {
          color: var(--theme-primary);
        }

        .topic-getapp-link:hover {
          transform: scale(1.05);
          box-shadow: 0 4px 20px var(--theme-primary);
        }

        .topic-badge-icon:hover {
          transform: scale(1.05);
        }

        .topic-related-chip:hover {
          border-color: var(--theme-primary);
          color: var(--theme-primary);
          transform: scale(1.05);
        }

        .topic-empty-cta:hover {
          transform: scale(1.05);
          box-shadow: 0 6px 24px var(--theme-primary);
        }

        .topic-browseall-link:hover {
          border-color: var(--theme-primary);
          color: var(--theme-primary);
          transform: scale(1.02);
          box-shadow: 0 4px 16px rgba(0,0,0,0.1);
        }

        .topic-bottom-cta:hover {
          transform: scale(1.05);
          box-shadow: 0 6px 32px var(--theme-primary);
        }

        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after {
            animation-duration: 0.01ms !important;
            transition-duration: 0.01ms !important;
          }
        }
      `}</style>
    </>
  );
}