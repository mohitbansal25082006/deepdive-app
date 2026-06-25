// Public-Reports/src/app/r/[shareId]/page.tsx
// Part 55.9 — Fully Themed Report Page with Modern Design

import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { createHash } from 'crypto';
import type { Metadata } from 'next';
import { supabaseServer } from '@/lib/supabase-server';
import { buildMetadata, buildJsonLd } from '@/components/ShareMeta';
import { CopyLinkIsland } from './CopyLinkIsland';
import ReportHeader from '@/components/ReportHeader';
import ReportStats from '@/components/ReportStats';
import ReportSectionCard from '@/components/ReportSectionCard';
import FindingsPanel from '@/components/FindingsPanel';
import SourcesList from '@/components/SourcesList';
import StatCards from '@/components/StatCards';
import ChatWidget from '@/components/ChatWidget';
import DeepDiveBanner from '@/components/DeepDiveBanner';
import ReadingProgressBar from '@/components/ReadingProgressBar';
import TableOfContents from '@/components/TableOfContents';
import TrendingWidget from '@/components/TrendingWidget';
import PublicSearchBar from '@/components/PublicSearchBar';
import MobileActionBar from '@/components/MobileActionBar';
import type { PublicReport, ReactionEmoji } from '@/types/report';
import { enrichCitations } from '@/lib/sourceTrustScorer';
import Link from 'next/link';
import Image from 'next/image';

// ─────────────────────────────────────────────────────────────────────────────
// Layout constants
// ─────────────────────────────────────────────────────────────────────────────

const LEFT_SIDEBAR_W = 220;
const SIDEBAR_GAP = 32;
const TOC_W = 220;
const TOC_GAP = 32;
const OUTER_MAX_W = LEFT_SIDEBAR_W + SIDEBAR_GAP + 672 + TOC_GAP + TOC_W;

// ─────────────────────────────────────────────────────────────────────────────
// generateMetadata
// ─────────────────────────────────────────────────────────────────────────────

export async function generateMetadata(
  { params }: { params: Promise<{ shareId: string }> },
): Promise<Metadata> {
  const { shareId } = await params;
  const report = await fetchReport(shareId);
  if (!report) return { title: 'Report Not Found | DeepDive AI' };
  const base = buildMetadata(report, shareId);
  return {
    ...base,
    keywords: [
      ...(Array.isArray(base.keywords) ? base.keywords : []),
      ...report.tags,
    ],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function getIpHash(): Promise<string> {
  const hdrs = await headers();
  const forwarded = hdrs.get('x-forwarded-for');
  const realIp = hdrs.get('x-real-ip');
  const ip = forwarded?.split(',')[0]?.trim() ?? realIp ?? '127.0.0.1';
  return createHash('sha256')
    .update(ip + 'deepdive-ai-salt-2025')
    .digest('hex')
    .slice(0, 32);
}

// ─────────────────────────────────────────────────────────────────────────────
// Data fetching
// ─────────────────────────────────────────────────────────────────────────────

async function fetchReport(shareId: string): Promise<PublicReport | null> {
  if (!shareId || shareId.length > 20 || !/^[a-z0-9]+$/.test(shareId)) return null;

  const { data, error } = await supabaseServer.rpc('get_report_by_share_id', {
    p_share_id: shareId,
  });

  if (error || !data || data.length === 0) return null;

  const row = data[0];

  supabaseServer
    .rpc('increment_share_view', { p_share_id: shareId })
    .then(({ error: e }) => { if (e) console.warn('[PublicReportPage] view increment:', e.message); });

  return {
    reportId: row.report_id,
    shareLinkId: row.share_link_id,
    viewCount: row.view_count ?? 0,
    shareCount: row.share_count ?? 0,
    tags: Array.isArray(row.tags) ? row.tags : [],
    query: row.query,
    depth: row.depth,
    title: row.title ?? row.query,
    executiveSummary: row.executive_summary ?? '',
    sections: Array.isArray(row.sections) ? row.sections : [],
    keyFindings: Array.isArray(row.key_findings) ? row.key_findings : [],
    futurePredictions: Array.isArray(row.future_predictions) ? row.future_predictions : [],
    citations: enrichCitations(Array.isArray(row.citations) ? [...row.citations] : []),
    statistics: Array.isArray(row.statistics) ? row.statistics : [],
    sourcesCount: row.sources_count ?? 0,
    reliabilityScore: row.reliability_score ?? 0,
    infographicData: row.infographic_data ?? undefined,
    sourceImages: row.source_images ?? [],
    researchMode: row.research_mode ?? 'standard',
    completedAt: row.completed_at,
    createdAt: row.created_at,
    ownerUsername: row.owner_username ?? undefined,
    ownerAvatarUrl: row.owner_avatar_url ?? undefined,
  };
}

async function fetchReactions(
  shareId: string,
  ipHash: string,
): Promise<Record<string, Partial<Record<ReactionEmoji, { count: number; hasReacted: boolean }>>>> {
  try {
    const { data, error } = await supabaseServer.rpc('get_report_reactions', {
      p_share_id: shareId,
      p_ip_hash: ipHash,
    });
    if (error || !data) return {};
    const bySection: Record<string, Partial<Record<ReactionEmoji, { count: number; hasReacted: boolean }>>> = {};
    for (const row of data as Array<{ section_id: string; emoji: string; count: number; has_reacted: boolean }>) {
      if (!bySection[row.section_id]) bySection[row.section_id] = {};
      bySection[row.section_id][row.emoji as ReactionEmoji] = {
        count: Number(row.count ?? 0),
        hasReacted: Boolean(row.has_reacted),
      };
    }
    return bySection;
  } catch {
    return {};
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Store buttons - Themed
// ─────────────────────────────────────────────────────────────────────────────

function AppStoreBtn() {
  return (
    <div className="inline-flex items-center gap-3 py-3 px-5 rounded-xl text-sm transition-all duration-300"
         title="Not on App Store yet"
         style={{
           background: 'var(--theme-background-elevated)',
           border: '1px solid var(--theme-border)',
           cursor: 'default',
           opacity: 0.6,
           color: 'var(--theme-text-secondary)',
         }}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
      </svg>
      <div>
        <p className="text-xs font-normal leading-none mb-0.5" style={{ color: 'var(--theme-text-muted)' }}>
          Coming soon
        </p>
        <p className="font-bold text-sm leading-none" style={{ color: 'var(--theme-text-secondary)' }}>
          App Store
        </p>
      </div>
    </div>
  );
}

function PlayStoreBtn({ url }: { url: string }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
       className="inline-flex items-center gap-3 py-3 px-5 rounded-xl font-bold text-sm transition-all duration-300 hover:scale-105 hover:shadow-xl"
       style={{
         background: 'linear-gradient(135deg, var(--theme-gradient-primary-1), var(--theme-gradient-primary-2))',
         color: '#FFFFFF',
         textDecoration: 'none',
         boxShadow: '0 4px 20px var(--theme-primary)',
       }}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
        <path d="M3 18.5v-13c0-.83.95-1.3 1.6-.8l11 6.5c.6.35.6 1.25 0 1.6l-11 6.5c-.65.5-1.6.03-1.6-.8z"/>
      </svg>
      <div>
        <p className="text-xs font-normal leading-none mb-0.5" style={{ color: 'rgba(255,255,255,0.75)' }}>Get it on</p>
        <p className="font-bold text-sm leading-none">Google Play</p>
      </div>
    </a>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper components - Themed
// ─────────────────────────────────────────────────────────────────────────────

function Divider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-4 my-8">
      <div className="flex-1 h-px" style={{ background: 'var(--theme-border)' }} />
      <span className="text-xs font-bold uppercase tracking-widest px-3" style={{ color: 'var(--theme-text-muted)' }}>
        {label}
      </span>
      <div className="flex-1 h-px" style={{ background: 'var(--theme-border)' }} />
    </div>
  );
}

function SourceImagesStrip({ images }: { images: { url: string; title?: string; thumbnailUrl?: string }[] }) {
  if (!images || images.length === 0) return null;
  return (
    <div className="mb-6">
      <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--theme-text-muted)' }}>
        📸 Source Images
      </p>
      <div className="flex gap-2 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none' }}>
        {images.slice(0, 8).map((img, i) => (
          <a key={i} href={img.url} target="_blank" rel="noopener noreferrer" title={img.title}
             className="flex-shrink-0 w-24 h-16 rounded-xl overflow-hidden transition-all duration-300 hover:scale-105 hover:shadow-lg"
             style={{
               background: 'var(--theme-background-card)',
               border: '1px solid var(--theme-border)',
             }}>
            <img src={img.thumbnailUrl ?? img.url} alt={img.title ?? ''} className="w-full h-full object-cover" loading="lazy" />
          </a>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BottomCTA - Themed
// ─────────────────────────────────────────────────────────────────────────────

function BottomCTA({ report, playStoreUrl }: { report: PublicReport; playStoreUrl: string }) {
  return (
    <div className="rounded-3xl p-8 text-center relative overflow-hidden"
         style={{
           background: 'linear-gradient(135deg, var(--theme-background-elevated), var(--theme-background-card))',
           border: '2px solid var(--theme-primary)',
         }}>
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-1/2 -left-1/2 w-full h-full rounded-full blur-3xl opacity-10 animate-pulse"
             style={{
               background: 'var(--theme-primary)',
               animationDuration: '6s',
             }} />
        <div className="absolute -bottom-1/2 -right-1/2 w-full h-full rounded-full blur-3xl opacity-10 animate-pulse"
             style={{
               background: 'var(--theme-secondary)',
               animationDuration: '8s',
               animationDelay: '3s',
             }} />
      </div>
      <div className="relative">
        <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center transition-all duration-300 hover:scale-110"
             style={{
               background: 'linear-gradient(135deg, var(--theme-gradient-primary-1), var(--theme-gradient-primary-2))',
               boxShadow: '0 0 40px var(--theme-primary)',
             }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
        </div>
        <h3 className="text-2xl font-extrabold mb-3"
            style={{
              fontFamily: 'var(--font-display)',
              color: 'var(--theme-text-primary)',
              letterSpacing: '-0.02em',
            }}>
          Create Your Own AI Research Report
        </h3>
        <p className="text-sm mb-6 max-w-md mx-auto" style={{ color: 'var(--theme-text-secondary)', lineHeight: 1.7 }}>
          DeepDive AI runs autonomous multi-agent research on any topic — like this one on{' '}
          <em style={{ color: 'var(--theme-text-primary)' }}>
            &ldquo;{report.title.slice(0, 55)}{report.title.length > 55 ? '…' : ''}&rdquo;
          </em>{' '}— in minutes.
        </p>
        <div className="flex flex-wrap justify-center gap-2 mb-6">
          {['🔬 Multi-agent', '📊 Infographics', '🎙 Podcast', '⚖️ Debate', '🎓 Papers', '📱 iOS & Android'].map(f => (
            <span key={f} className="px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-300 hover:scale-105"
                  style={{
                    background: 'var(--theme-primary)',
                    color: '#FFFFFF',
                    border: '1px solid var(--theme-primary)',
                  }}>
              {f}
            </span>
          ))}
        </div>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <AppStoreBtn />
          <PlayStoreBtn url={playStoreUrl} />
        </div>
        <p className="text-xs mt-4" style={{ color: 'var(--theme-text-muted)' }}>
          🎁 Free to start · 20 credits on signup · No credit card required
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────

export default async function PublicReportPage({
  params,
}: {
  params: Promise<{ shareId: string }>;
}) {
  const { shareId } = await params;
  const report = await fetchReport(shareId);
  if (!report) notFound();

  const ipHash = await getIpHash();
  const reactions = await fetchReactions(shareId, ipHash);

  const jsonLd = buildJsonLd(report, shareId);
  const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? '';
  const PLAY_STORE = process.env.DEEPDIVE_PLAY_STORE_URL ?? '#';
  const chatLimit = parseInt(process.env.PUBLIC_CHAT_QUESTION_LIMIT ?? '3', 10);

  const hasInfographics = !!(
    report.infographicData &&
    (report.infographicData.stats.length > 0 || report.infographicData.charts.length > 0)
  );
  const hasSourceImages = (report.sourceImages?.length ?? 0) > 0;

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />

      <ReadingProgressBar />

      <div className="min-h-screen pb-24" style={{ background: 'var(--theme-background)' }}>

        {/* ════════════════════════════════════════════════════════
            NAVBAR - Fully Themed
        ════════════════════════════════════════════════════════ */}
        <header
          className="sticky top-0 z-40 px-4 py-3 transition-all duration-300"
          style={{
            background: 'var(--theme-background)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            borderBottom: '1px solid var(--theme-border)',
          }}
        >
          <div className="max-w-3xl mx-auto flex items-center gap-3">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-2 transition-all duration-300 hover:scale-105 flex-shrink-0"
                  style={{ textDecoration: 'none' }}>
              <div className="w-8 h-8 rounded-lg overflow-hidden flex-shrink-0"
                   style={{
                     background: '#FFFFFF',
                     border: '1px solid var(--theme-border)',
                   }}>
                <Image src="/icon.png" alt="DeepDive AI" width={32} height={32} style={{ objectFit: 'contain' }} priority />
              </div>
              <span className="text-sm font-bold hidden sm:block" style={{ color: 'var(--theme-text-primary)' }}>
                DeepDive <span className="dd-text-gradient">AI</span>
              </span>
            </Link>

            {/* Search bar — desktop only (md+) */}
            <div className="flex-1 hidden md:block">
              <PublicSearchBar mode="page" placeholder="Search all research…"
                style={{ width: '100%', maxWidth: 360 }} />
            </div>

            {/* Right side stats + actions */}
            <div className="flex items-center gap-2 ml-auto">
              {/* View count */}
              {report.viewCount > 0 && (
                <span className="hidden sm:flex items-center gap-1.5 text-xs" style={{ color: 'var(--theme-text-muted)' }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                  </svg>
                  {report.viewCount.toLocaleString()}
                </span>
              )}
              {/* Share count */}
              {report.shareCount > 0 && (
                <span className="hidden sm:flex items-center gap-1.5 text-xs" style={{ color: 'var(--theme-text-muted)' }}
                      title={`Shared ${report.shareCount} times`}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
                  </svg>
                  {report.shareCount.toLocaleString()}
                </span>
              )}
              {/* Discover link — desktop */}
              <Link href="/discover"
                 className="hidden lg:flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all duration-300 hover:scale-105"
                 style={{
                   color: '#FFFFFF',
                   background: 'linear-gradient(135deg, var(--theme-gradient-primary-1), var(--theme-gradient-primary-2))',
                   border: '1px solid var(--theme-primary)',
                   textDecoration: 'none',
                   boxShadow: '0 2px 12px var(--theme-primary)',
                 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                </svg>
                Discover
              </Link>
              {/* Copy link */}
              <CopyLinkIsland url={`${APP_URL}/r/${shareId}`} shareId={shareId} />
            </div>
          </div>
        </header>

        {/* ════════════════════════════════════════════════════════
            MOBILE ACTION BAR
        ════════════════════════════════════════════════════════ */}
        <MobileActionBar
          shareUrl={`${APP_URL}/r/${shareId}`}
          shareId={shareId}
          viewCount={report.viewCount}
          shareCount={report.shareCount}
        />

        {/* ════════════════════════════════════════════════════════
            TABLE OF CONTENTS
        ════════════════════════════════════════════════════════ */}
        {report.sections.length > 1 && (
          <TableOfContents
            sections={report.sections}
            outerMaxWidth={OUTER_MAX_W}
            tocWidth={TOC_W}
          />
        )}

        {/* ════════════════════════════════════════════════════════
            3-COLUMN OUTER WRAPPER
        ════════════════════════════════════════════════════════ */}
        <div
          className="mx-auto px-4 pt-8"
          style={{ maxWidth: OUTER_MAX_W }}
        >
          <div
            className="xl:flex xl:gap-8"
            style={{ alignItems: 'flex-start' }}
          >

            {/* ── LEFT SIDEBAR: Trending widget ── */}
            <aside
              aria-label="Trending reports"
              className="hidden xl:block xl:flex-shrink-0"
              style={{ width: LEFT_SIDEBAR_W }}
            >
              <div
                style={{
                  position: 'sticky',
                  top: 88,
                  width: LEFT_SIDEBAR_W,
                  maxHeight: 'calc(100vh - 108px)',
                  overflowY: 'auto',
                  scrollbarWidth: 'none',
                }}
              >
                <TrendingWidget currentShareId={shareId} limit={5} />
              </div>
            </aside>

            {/* ── MAIN CONTENT ── */}
            <main
              className="flex-1 min-w-0"
            >
              <div className="report-main-inner">

                <ReportHeader report={report} />

                <div className="mt-6 mb-6">
                  <ReportStats report={report} />
                </div>

                {hasInfographics && (
                  <>
                    <Divider label="Visual insights" />
                    <StatCards data={report.infographicData!} />
                  </>
                )}

                {hasSourceImages && (
                  <>
                    <Divider label="Source images" />
                    <SourceImagesStrip images={report.sourceImages ?? []} />
                  </>
                )}

                <Divider label="Full report" />
                <section className="space-y-3" aria-label="Report sections">
                  {report.sections.map((section, i) => {
                    const sectionReactionId = section.id || `sec-${i}`;
                    const initialReactions = reactions[sectionReactionId] ?? {};
                    return (
                      <ReportSectionCard
                        key={section.id ?? i}
                        section={section}
                        citations={report.citations}
                        index={i}
                        shareId={shareId}
                        initialReactions={initialReactions}
                      />
                    );
                  })}
                </section>

                <Divider label="Ask AI" />
                <section aria-label="AI research assistant">
                  <ChatWidget shareId={shareId} reportTitle={report.title} questionsMax={chatLimit} />
                </section>

                <Divider label="Key findings & predictions" />
                <section aria-label="Key findings">
                  <FindingsPanel report={report} />
                </section>

                {report.citations.length > 0 && (
                  <>
                    <Divider label="Sources & citations" />
                    <section aria-label="Sources and citations">
                      <SourcesList citations={report.citations} />
                    </section>
                  </>
                )}

                {/* ── TRENDING: Mobile / non-xl inline ── */}
                {report.sections.length > 0 && (
                  <div className="xl:hidden">
                    <Divider label="Trending this week" />
                    <section aria-label="Trending public research">
                      <div className="flex items-center justify-between mb-4">
                        <p className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>
                          Most viewed in the last 7 days across the DeepDive community.
                        </p>
                        <Link href="/discover" className="text-xs font-bold transition-all duration-300 hover:scale-105"
                           style={{ color: 'var(--theme-primary)', textDecoration: 'none' }}>
                          Browse all →
                        </Link>
                      </div>
                      <TrendingWidget currentShareId={shareId} limit={5} />
                    </section>
                  </div>
                )}

                <div className="mt-12 mb-6">
                  <BottomCTA report={report} playStoreUrl={PLAY_STORE} />
                </div>

              </div>
            </main>

          </div>
        </div>
      </div>

      <DeepDiveBanner />

      <style>{`
        .dd-text-gradient {
          background: linear-gradient(135deg, var(--theme-gradient-primary-1), var(--theme-gradient-primary-2));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .report-main-inner {
          width: 100%;
          max-width: 672px;
        }

        @media (min-width: 1280px) {
          .report-main-inner {
            padding-right: ${TOC_W + TOC_GAP}px;
            max-width: none;
          }
        }

        @keyframes pulse-slow {
          0%, 100% { opacity: 0.1; }
          50% { opacity: 0.2; }
        }
        
        .animate-pulse-slow {
          animation: pulse-slow 3s ease-in-out infinite;
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