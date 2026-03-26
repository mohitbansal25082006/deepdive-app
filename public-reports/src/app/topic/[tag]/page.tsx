// Public-Reports/src/app/topic/[tag]/page.tsx
// Server-rendered topic tag page: /topic/[tag]
// - generateStaticParams: pre-renders top 50 tags at build time
// - ISR (60s revalidation) for all other tags
// - Full SEO: Open Graph + JSON-LD CollectionPage
// - Accessible via tag chips in ReportCard and filter chips in /discover

import { notFound }           from 'next/navigation';
import type { Metadata }      from 'next';
import Link                   from 'next/link';
import { createSupabaseServer } from '@/lib/supabase-server';
import ReportCard             from '@/components/ReportCard';
import type { PublicFeedReport, TagCount } from '@/types/report';

// ── ISR ────────────────────────────────────────────────────────────────────────

export const revalidate = 60;

// ── Static params (top 50 tags pre-rendered at build) ─────────────────────────

export async function generateStaticParams(): Promise<{ tag: string }[]> {
  try {
    const supabase = createSupabaseServer();
    const { data }  = await supabase.rpc('get_all_public_tags', { p_limit: 50 });
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
    title:       `#${tag} Research Reports | DeepDive AI`,
    description: `Browse AI-generated research reports tagged with #${tag}. Discover insights, findings and analysis on ${tag} topics — powered by DeepDive AI.`,
    keywords:    [tag, 'research', 'AI report', 'DeepDive AI', 'autonomous research'],
    alternates:  { canonical: `${appUrl}/topic/${tag}` },
    openGraph: {
      title:       `#${tag} Research | DeepDive AI`,
      description: `AI-powered research reports on ${tag}. Browse insights and analysis.`,
      type:        'website',
      url:         `${appUrl}/topic/${tag}`,
    },
    twitter: {
      card:        'summary_large_image',
      title:       `#${tag} Research | DeepDive AI`,
      description: `AI research reports tagged #${tag}`,
    },
  };
}

// ── Data fetching ─────────────────────────────────────────────────────────────

async function fetchTagReports(tag: string): Promise<{
  reports:   PublicFeedReport[];
  tagCount:  number;
  allTags:   TagCount[];
}> {
  const supabase = createSupabaseServer();

  const [feedResult, tagsResult] = await Promise.allSettled([
    supabase.rpc('get_public_reports_feed', {
      p_sort:   'trending',
      p_tag:    tag,
      p_limit:  48,
      p_offset: 0,
    }),
    supabase.rpc('get_all_public_tags', { p_limit: 20 }),
  ]);

  const feedRows = feedResult.status === 'fulfilled' ? (feedResult.value.data ?? []) : [];
  const tagRows  = tagsResult.status  === 'fulfilled' ? (tagsResult.value.data  ?? []) : [];

  const reports = (feedRows as Record<string, unknown>[]).map(row => ({
    shareId:       String(row.share_id      ?? ''),
    viewCount:     Number(row.view_count    ?? 0),
    shareCount:    Number(row.share_count   ?? 0),
    cachedTitle:   String(row.cached_title  ?? ''),
    cachedSummary: String(row.cached_summary ?? ''),
    tags:          Array.isArray(row.tags) ? (row.tags as string[]) : [],
    depth:         (row.depth as 'quick' | 'deep' | 'expert') ?? 'deep',
    researchMode:  (row.research_mode as 'standard' | 'academic') ?? 'standard',
    ownerUsername: row.owner_username ? String(row.owner_username) : undefined,
    createdAt:     String(row.created_at     ?? ''),
    lastViewedAt:  row.last_viewed_at ? String(row.last_viewed_at) : undefined,
  } as PublicFeedReport));

  const allTags = (tagRows as Record<string, unknown>[]).map(row => ({
    tag:   String(row.tag   ?? ''),
    count: Number(row.count ?? 0),
  }));

  const tagCount = allTags.find(t => t.tag === tag)?.count ?? reports.length;

  return { reports, tagCount, allTags };
}

// ── JSON-LD structured data ───────────────────────────────────────────────────

function buildJsonLd(tag: string, reports: PublicFeedReport[], appUrl: string): string {
  return JSON.stringify({
    '@context':        'https://schema.org',
    '@type':           'CollectionPage',
    name:              `#${tag} Research Reports`,
    description:       `AI-generated research reports tagged with #${tag}`,
    url:               `${appUrl}/topic/${tag}`,
    numberOfItems:     reports.length,
    hasPart:           reports.slice(0, 10).map(r => ({
      '@type':   'Article',
      headline:  r.cachedTitle,
      url:       `${appUrl}/r/${r.shareId}`,
      author:    r.ownerUsername ? { '@type': 'Person', name: r.ownerUsername } : undefined,
      datePublished: r.createdAt,
    })),
  });
}

// ── Depth config (reused from ReportCard) ──────────────────────────────────────

const DEPTH_CONFIG = {
  quick:  { color: '#10B981', label: 'Quick'  },
  deep:   { color: '#6C63FF', label: 'Deep'   },
  expert: { color: '#F59E0B', label: 'Expert' },
} as const;

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function TopicTagPage({
  params,
}: {
  params: Promise<{ tag: string }>;
}) {
  const { tag: rawTag } = await params;
  const tag = decodeURIComponent(rawTag).toLowerCase().trim();

  if (!tag || tag.length > 50 || !/^[a-z0-9 _-]+$/.test(tag)) notFound();

  const { reports, tagCount, allTags } = await fetchTagReports(tag);

  const APP_URL    = process.env.NEXT_PUBLIC_APP_URL ?? 'https://deepdive-reports.vercel.app';
  const PLAY_STORE = process.env.DEEPDIVE_PLAY_STORE_URL ?? '#';

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: buildJsonLd(tag, reports, APP_URL) }}
      />

      <div className="min-h-screen pb-16" style={{ background: 'var(--bg-base)' }}>
        {/* ── Navbar ── */}
        <header
          className="sticky top-0 z-40 px-4 py-3"
          style={{
            background:    'rgba(10,10,26,0.9)',
            backdropFilter: 'blur(20px)',
            borderBottom:  '1px solid var(--border)',
          }}
        >
          <div className="max-w-5xl mx-auto flex items-center gap-3">
            <Link href="/"
              style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', flexShrink: 0 }}>
              <div
                style={{
                  width: 28, height: 28, borderRadius: 9,
                  background: 'linear-gradient(135deg, #6C63FF, #8B5CF6)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                     stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"/>
                  <path d="m21 21-4.35-4.35"/>
                </svg>
              </div>
              <span style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: '0.875rem' }}>
                DeepDive AI
              </span>
            </Link>

            {/* Breadcrumb */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', fontSize: '0.8125rem' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
              <Link href="/discover"
                style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>
                Discover
              </Link>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
              <span style={{ color: '#A78BFA', fontWeight: 600 }}>#{tag}</span>
            </div>

            <div style={{ flex: 1 }} />

            <a
              href={PLAY_STORE}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                flexShrink: 0,
                padding: '7px 14px', borderRadius: '999px',
                background: 'linear-gradient(135deg, #6C63FF, #8B5CF6)',
                color: '#fff', fontWeight: 700, fontSize: '0.8125rem',
                textDecoration: 'none',
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
            <div className="flex items-center gap-3 mb-4">
              <div
                style={{
                  width: 48, height: 48, borderRadius: 14,
                  background: 'rgba(108,99,255,0.15)',
                  border: '1px solid rgba(108,99,255,0.3)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '1.5rem',
                  flexShrink: 0,
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
                    color: 'var(--text-primary)',
                    margin: 0,
                    letterSpacing: '-0.02em',
                  }}
                >
                  #{tag}
                </h1>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', margin: '3px 0 0' }}>
                  {tagCount} public research report{tagCount !== 1 ? 's' : ''}
                </p>
              </div>
            </div>

            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9375rem', lineHeight: 1.6, maxWidth: 600 }}>
              Browse AI-generated research on <strong style={{ color: 'var(--text-primary)' }}>{tag}</strong>{' '}
              — created by the DeepDive AI community using multi-agent autonomous research.
            </p>
          </div>

          {/* ── Related tags ── */}
          {allTags.filter(t => t.tag !== tag).length > 0 && (
            <div className="mb-8">
              <p className="text-xs font-bold uppercase tracking-widest mb-3"
                 style={{ color: 'var(--text-muted)' }}>
                Related Topics
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {allTags.filter(t => t.tag !== tag).slice(0, 12).map(t => (
                  <Link
                    key={t.tag}
                    href={`/topic/${encodeURIComponent(t.tag)}`}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      padding: '5px 12px', borderRadius: '999px',
                      border: '1px solid var(--border)',
                      background: 'var(--bg-elevated)',
                      color: 'var(--text-muted)',
                      fontSize: '0.8125rem', fontWeight: 500,
                      textDecoration: 'none',
                      transition: 'all 0.15s',
                    }}
                  >
                    #{t.tag}
                    <span style={{ fontSize: '0.625rem', color: 'rgba(255,255,255,0.2)' }}>
                      {t.count}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* ── Divider ── */}
          <div className="flex items-center gap-3 mb-6">
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            <span className="text-xs font-bold uppercase tracking-widest"
                  style={{ color: 'var(--text-muted)' }}>
              {reports.length > 0 ? `${reports.length} Reports` : 'Reports'}
            </span>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          </div>

          {/* ── Report grid ── */}
          {reports.length === 0 ? (
            <div className="text-center py-24">
              <p style={{ fontSize: '3rem', marginBottom: 16 }}>🔭</p>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
                No reports yet for #{tag}
              </h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: 24 }}>
                Be the first to research this topic and share your report!
              </p>
              <a
                href={PLAY_STORE}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  padding: '12px 24px', borderRadius: '999px',
                  background: 'linear-gradient(135deg, #6C63FF, #8B5CF6)',
                  color: '#fff', textDecoration: 'none',
                  fontWeight: 700, fontSize: '0.875rem',
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
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  padding: '12px 28px', borderRadius: '999px',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-elevated)',
                  color: 'var(--text-secondary)',
                  fontWeight: 600, fontSize: '0.875rem',
                  textDecoration: 'none',
                  transition: 'all 0.15s',
                }}
              >
                Browse All Research Topics
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
              </Link>
            </div>
          )}

          {/* ── App CTA ── */}
          <div
            className="mt-14 rounded-2xl p-6 text-center"
            style={{
              background: 'linear-gradient(135deg, #1A1A35 0%, #12122A 100%)',
              border: '1px solid rgba(108,99,255,0.3)',
              position: 'relative', overflow: 'hidden',
            }}
          >
            <div
              style={{
                position: 'absolute', inset: 0, pointerEvents: 'none',
                background: 'radial-gradient(ellipse 70% 50% at 50% 0%, rgba(108,99,255,0.15) 0%, transparent 70%)',
              }}
            />
            <div style={{ position: 'relative' }}>
              <p style={{ fontSize: '2rem', marginBottom: 12 }}>🔬</p>
              <h2
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '1.25rem', fontWeight: 800,
                  color: 'var(--text-primary)', marginBottom: 8,
                  letterSpacing: '-0.02em',
                }}
              >
                Research #{tag} yourself
              </h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: 20 }}>
                Use DeepDive AI to run autonomous research on any topic.
                Free to start — 20 credits on signup.
              </p>
              <a
                href={PLAY_STORE}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  padding: '12px 28px', borderRadius: '999px',
                  background: 'linear-gradient(135deg, #6C63FF, #8B5CF6)',
                  color: '#fff', textDecoration: 'none',
                  fontWeight: 700, fontSize: '0.875rem',
                  boxShadow: '0 4px 16px rgba(108,99,255,0.4)',
                }}
              >
                Download DeepDive AI →
              </a>
            </div>
          </div>
        </main>
      </div>
    </>
  );
}