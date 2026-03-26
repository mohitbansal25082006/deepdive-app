// Public-Reports/src/app/r/[shareId]/page.tsx
// Part 34 Update:
//   • Trending widget: LEFT sidebar on desktop (≥1280px), inline on mobile
//   • Mobile action bar below navbar: Search, Copy, Browse buttons
//   • Share count visible on mobile
//   • All Play Store buttons use DEEPDIVE_PLAY_STORE_URL
//   • Mobile overall-report reaction bar (floating bottom sheet trigger)
//   • Part 35 Fix: Correct 3-column layout — left trending (220px) + main (max-w-2xl) + right TOC (220px)
//     TableOfContents receives `mainContentOffset` so it can position itself correctly.

import { notFound }          from 'next/navigation';
import { headers }           from 'next/headers';
import { createHash }        from 'crypto';
import type { Metadata }     from 'next';
import { supabaseServer }    from '@/lib/supabase-server';
import { buildMetadata, buildJsonLd } from '@/components/ShareMeta';
import { CopyLinkIsland }    from './CopyLinkIsland';
import ReportHeader          from '@/components/ReportHeader';
import ReportStats           from '@/components/ReportStats';
import ReportSectionCard     from '@/components/ReportSectionCard';
import FindingsPanel         from '@/components/FindingsPanel';
import SourcesList           from '@/components/SourcesList';
import StatCards             from '@/components/StatCards';
import ChatWidget            from '@/components/ChatWidget';
import DeepDiveBanner        from '@/components/DeepDiveBanner';
import ReadingProgressBar    from '@/components/ReadingProgressBar';
import TableOfContents       from '@/components/TableOfContents';
import TrendingWidget        from '@/components/TrendingWidget';
import PublicSearchBar       from '@/components/PublicSearchBar';
import MobileActionBar       from '@/components/MobileActionBar';
import type { PublicReport, ReactionEmoji } from '@/types/report';
import { enrichCitations }   from '@/lib/sourceTrustScorer';

// ─────────────────────────────────────────────────────────────────────────────
// Layout constants — single source of truth for the 3-column desktop layout.
// These are used both in JSX (inline styles) and passed to TableOfContents so
// it can compute its own `left` offset without duplicating magic numbers.
// ─────────────────────────────────────────────────────────────────────────────

/** Width of the left trending sidebar (px) */
const LEFT_SIDEBAR_W = 220;
/** Gap between left sidebar and main content (px, matches xl:gap-8 = 2rem = 32px) */
const SIDEBAR_GAP    = 32;
/** Width of the right TOC sidebar (px) */
const TOC_W          = 220;
/** Gap between main content and right TOC (px) */
const TOC_GAP        = 32;
/** Max width of the outer 3-col wrapper (px) — keeps everything centred */
const OUTER_MAX_W    = LEFT_SIDEBAR_W + SIDEBAR_GAP + 672 + TOC_GAP + TOC_W; // ≈ 1176

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
  const hdrs      = await headers();
  const forwarded = hdrs.get('x-forwarded-for');
  const realIp    = hdrs.get('x-real-ip');
  const ip        = forwarded?.split(',')[0]?.trim() ?? realIp ?? '127.0.0.1';
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
    reportId:          row.report_id,
    shareLinkId:       row.share_link_id,
    viewCount:         row.view_count         ?? 0,
    shareCount:        row.share_count        ?? 0,
    tags:              Array.isArray(row.tags)  ? row.tags  : [],
    query:             row.query,
    depth:             row.depth,
    title:             row.title              ?? row.query,
    executiveSummary:  row.executive_summary  ?? '',
    sections:          Array.isArray(row.sections)           ? row.sections           : [],
    keyFindings:       Array.isArray(row.key_findings)       ? row.key_findings       : [],
    futurePredictions: Array.isArray(row.future_predictions) ? row.future_predictions : [],
    citations:         enrichCitations(Array.isArray(row.citations) ? [...row.citations] : []),
    statistics:        Array.isArray(row.statistics)         ? row.statistics         : [],
    sourcesCount:      row.sources_count      ?? 0,
    reliabilityScore:  row.reliability_score  ?? 0,
    infographicData:   row.infographic_data   ?? undefined,
    sourceImages:      row.source_images      ?? [],
    researchMode:      row.research_mode      ?? 'standard',
    completedAt:       row.completed_at,
    createdAt:         row.created_at,
    ownerUsername:     row.owner_username     ?? undefined,
    ownerAvatarUrl:    row.owner_avatar_url   ?? undefined,
  };
}

async function fetchReactions(
  shareId: string,
  ipHash:  string,
): Promise<Record<string, Partial<Record<ReactionEmoji, { count: number; hasReacted: boolean }>>>> {
  try {
    const { data, error } = await supabaseServer.rpc('get_report_reactions', {
      p_share_id: shareId,
      p_ip_hash:  ipHash,
    });
    if (error || !data) return {};
    const bySection: Record<string, Partial<Record<ReactionEmoji, { count: number; hasReacted: boolean }>>> = {};
    for (const row of data as Array<{ section_id: string; emoji: string; count: number; has_reacted: boolean }>) {
      if (!bySection[row.section_id]) bySection[row.section_id] = {};
      bySection[row.section_id][row.emoji as ReactionEmoji] = {
        count:      Number(row.count      ?? 0),
        hasReacted: Boolean(row.has_reacted),
      };
    }
    return bySection;
  } catch {
    return {};
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Store buttons
// ─────────────────────────────────────────────────────────────────────────────

function AppStoreBtn() {
  return (
    <div className="inline-flex items-center gap-3 py-3 px-5 rounded-xl text-sm"
         title="Not on App Store yet"
         style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', cursor: 'default', opacity: 0.45 }}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="rgba(255,255,255,0.5)">
        <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
      </svg>
      <div>
        <p className="text-xs font-normal leading-none mb-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>Not available yet</p>
        <p className="font-bold text-sm leading-none" style={{ color: 'rgba(255,255,255,0.3)' }}>iOS — Coming Soon</p>
      </div>
    </div>
  );
}

function PlayStoreBtn({ url }: { url: string }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
       className="inline-flex items-center gap-3 py-3 px-5 rounded-xl font-bold text-sm transition-opacity hover:opacity-90"
       style={{ background: 'linear-gradient(135deg, #6C63FF 0%, #8B5CF6 100%)', color: '#fff', textDecoration: 'none' }}>
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
// Helper components
// ─────────────────────────────────────────────────────────────────────────────

function Divider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 my-6">
      <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
      <span className="text-xs font-bold uppercase tracking-widest px-2" style={{ color: 'var(--text-muted)' }}>
        {label}
      </span>
      <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
    </div>
  );
}

function SourceImagesStrip({ images }: { images: { url: string; title?: string; thumbnailUrl?: string }[] }) {
  if (!images || images.length === 0) return null;
  return (
    <div className="mb-6">
      <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--text-muted)' }}>📸 Source Images</p>
      <div className="flex gap-2 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none' }}>
        {images.slice(0, 8).map((img, i) => (
          <a key={i} href={img.url} target="_blank" rel="noopener noreferrer" title={img.title}
             className="flex-shrink-0 w-24 h-16 rounded-xl overflow-hidden transition-opacity hover:opacity-80"
             style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img.thumbnailUrl ?? img.url} alt={img.title ?? ''} className="w-full h-full object-cover" loading="lazy" />
          </a>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BottomCTA
// ─────────────────────────────────────────────────────────────────────────────

function BottomCTA({ report, playStoreUrl }: { report: PublicReport; playStoreUrl: string }) {
  return (
    <div className="rounded-2xl p-6 text-center"
         style={{ background: 'linear-gradient(135deg, #1A1A35 0%, #12122A 100%)', border: '1px solid rgba(108,99,255,0.3)', position: 'relative', overflow: 'hidden' }}>
      <div className="absolute inset-0 pointer-events-none"
           style={{ background: 'radial-gradient(ellipse 70% 50% at 50% 0%, rgba(108,99,255,0.15) 0%, transparent 70%)' }} />
      <div className="relative">
        <div className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center"
             style={{ background: 'linear-gradient(135deg, #6C63FF 0%, #8B5CF6 100%)', boxShadow: '0 0 32px rgba(108,99,255,0.4)' }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
        </div>
        <h3 className="text-xl font-extrabold mb-2"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
          Create your own AI research report
        </h3>
        <p className="text-sm mb-5 max-w-md mx-auto" style={{ color: 'var(--text-muted)', lineHeight: 1.6 }}>
          DeepDive AI runs autonomous multi-agent research on any topic — like this one on{' '}
          <em style={{ color: 'var(--text-secondary)' }}>
            &ldquo;{report.title.slice(0, 55)}{report.title.length > 55 ? '…' : ''}&rdquo;
          </em>{' '}— in minutes.
        </p>
        <div className="flex flex-wrap justify-center gap-2 mb-5">
          {['🔬 Multi-agent research', '📊 AI infographics', '🎙 Podcast mode', '⚖️ Debate engine', '🎓 Academic papers', '📱 iOS & Android'].map(f => (
            <span key={f} className="px-3 py-1 rounded-full text-xs font-medium"
                  style={{ background: 'rgba(108,99,255,0.1)', border: '1px solid rgba(108,99,255,0.25)', color: 'var(--text-secondary)' }}>
              {f}
            </span>
          ))}
        </div>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <AppStoreBtn />
          <PlayStoreBtn url={playStoreUrl} />
        </div>
        <p className="text-xs mt-3" style={{ color: 'var(--text-muted)' }}>
          Free to start · 20 credits on signup · No credit card required
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
  const report      = await fetchReport(shareId);
  if (!report) notFound();

  const ipHash    = await getIpHash();
  const reactions = await fetchReactions(shareId, ipHash);

  const jsonLd     = buildJsonLd(report, shareId);
  const APP_URL    = process.env.NEXT_PUBLIC_APP_URL ?? '';
  const PLAY_STORE = process.env.DEEPDIVE_PLAY_STORE_URL ?? '#';
  const chatLimit  = parseInt(process.env.PUBLIC_CHAT_QUESTION_LIMIT ?? '3', 10);

  const hasInfographics = !!(
    report.infographicData &&
    (report.infographicData.stats.length > 0 || report.infographicData.charts.length > 0)
  );
  const hasSourceImages = (report.sourceImages?.length ?? 0) > 0;

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />

      {/* Reading progress bar — fixed top, z-9999 */}
      <ReadingProgressBar />

      <div className="min-h-screen pb-24" style={{ background: 'var(--bg-base)' }}>

        {/* ════════════════════════════════════════════════════════
            NAVBAR
        ════════════════════════════════════════════════════════ */}
        <header
          className="sticky top-0 z-40 px-4 py-3"
          style={{ background: 'rgba(10,10,26,0.85)', backdropFilter: 'blur(20px)', borderBottom: '1px solid var(--border)' }}
        >
          <div className="max-w-3xl mx-auto flex items-center gap-3">
            {/* Logo */}
            <a href="/" className="flex items-center gap-2 transition-opacity hover:opacity-80 flex-shrink-0"
               style={{ textDecoration: 'none' }}>
              <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                   style={{ background: 'linear-gradient(135deg, #6C63FF 0%, #8B5CF6 100%)' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                </svg>
              </div>
              <span className="text-sm font-bold hidden sm:block" style={{ color: 'var(--text-primary)' }}>DeepDive AI</span>
            </a>

            {/* Search bar — desktop only (md+) */}
            <div className="flex-1 hidden md:block">
              <PublicSearchBar mode="page" placeholder="Search all research…"
                style={{ width: '100%', maxWidth: 360 }} />
            </div>

            {/* Right side stats + actions */}
            <div className="flex items-center gap-2 ml-auto">
              {/* View count */}
              {report.viewCount > 0 && (
                <span className="hidden sm:flex items-center gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                  </svg>
                  {report.viewCount.toLocaleString()}
                </span>
              )}
              {/* Share count */}
              {report.shareCount > 0 && (
                <span className="hidden sm:flex items-center gap-1 text-xs" style={{ color: 'var(--text-muted)' }}
                      title={`Shared ${report.shareCount} times`}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
                  </svg>
                  {report.shareCount.toLocaleString()}
                </span>
              )}
              {/* Discover link — desktop */}
              <a href="/discover"
                 className="hidden lg:flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-opacity hover:opacity-80"
                 style={{ color: 'var(--text-muted)', background: 'var(--bg-elevated)', border: '1px solid var(--border)', textDecoration: 'none' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                </svg>
                Discover
              </a>
              {/* Copy link */}
              <CopyLinkIsland url={`${APP_URL}/r/${shareId}`} shareId={shareId} />
            </div>
          </div>
        </header>

        {/* ════════════════════════════════════════════════════════
            MOBILE ACTION BAR — shown on <md screens only
        ════════════════════════════════════════════════════════ */}
        <MobileActionBar
          shareUrl={`${APP_URL}/r/${shareId}`}
          shareId={shareId}
          viewCount={report.viewCount}
          shareCount={report.shareCount}
        />

        {/* ════════════════════════════════════════════════════════
            TABLE OF CONTENTS
            Desktop: fixed right sidebar, offset aware of left sidebar.
            Mobile: floating button + drawer (handled internally).
        ════════════════════════════════════════════════════════ */}
        {report.sections.length > 1 && (
          <TableOfContents
            sections={report.sections}
            outerMaxWidth={OUTER_MAX_W}
            tocWidth={TOC_W}
          />
        )}

        {/* ════════════════════════════════════════════════════════
            3-COLUMN OUTER WRAPPER  (desktop ≥1280px)
            ┌──────────────┬──────────────────────┬──────────────┐
            │ LEFT SIDEBAR │     MAIN CONTENT      │  (TOC fixed) │
            │  220px       │    flex-1 / max 672px │   220px      │
            └──────────────┴──────────────────────┴──────────────┘
            On mobile: single column, left sidebar hidden.
        ════════════════════════════════════════════════════════ */}
        <div
          className="mx-auto px-4 pt-8"
          style={{ maxWidth: OUTER_MAX_W }}
        >
          {/*
            Inner flex row — only active at ≥1280px.
            We add padding-right on desktop to reserve space for the fixed TOC
            so the main content doesn't slide under it.
          */}
          <div
            className="xl:flex xl:gap-8"
            style={{
              alignItems: 'flex-start',
            }}
          >

            {/* ── LEFT SIDEBAR: Trending widget (desktop ≥1280px only) ── */}
            <aside
              aria-label="Trending reports"
              className="hidden xl:block xl:flex-shrink-0"
              style={{ width: LEFT_SIDEBAR_W }}
            >
              <div
                style={{
                  position:   'sticky',
                  top:        88,
                  width:      LEFT_SIDEBAR_W,
                  maxHeight:  'calc(100vh - 108px)',
                  overflowY:  'auto',
                  scrollbarWidth: 'none',
                }}
              >
                <TrendingWidget currentShareId={shareId} limit={5} />
              </div>
            </aside>

            {/* ── MAIN CONTENT ── */}
            {/*
              On desktop we add padding-right = TOC_W + TOC_GAP so the fixed TOC
              doesn't overlap the text. The TOC itself uses position:fixed and is
              positioned relative to the viewport, not this element.
            */}
            <main
              className="flex-1 min-w-0"
              style={{
                // Reserve space on the right for the fixed TOC on xl screens.
                // On smaller screens this resolves to 0 via the CSS below.
              }}
            >
              {/* Inner centering wrapper — caps the prose width */}
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
                    const initialReactions  = reactions[sectionReactionId] ?? {};
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
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          Most viewed in the last 7 days across the DeepDive community.
                        </p>
                        <a href="/discover" className="text-xs font-bold transition-opacity hover:opacity-80"
                           style={{ color: '#6C63FF', textDecoration: 'none' }}>
                          Browse all →
                        </a>
                      </div>
                      <TrendingWidget currentShareId={shareId} limit={5} />
                    </section>
                  </div>
                )}

                <div className="mt-12 mb-6">
                  <BottomCTA report={report} playStoreUrl={PLAY_STORE} />
                </div>

              </div>{/* /report-main-inner */}
            </main>

          </div>{/* /xl:flex */}
        </div>{/* /outer wrapper */}
      </div>

      <DeepDiveBanner />

      {/*
        Layout CSS:
        - .report-main-inner caps prose at ~672px and on xl adds right padding
          so the fixed TOC (220px) doesn't overlap the content.
        - We keep utility overrides minimal and use a single <style> block here
          rather than repeating Tailwind classes for xl breakpoints.
      */}
      <style>{`
        /* ── Main content inner wrapper ── */
        .report-main-inner {
          width: 100%;
          max-width: 672px;          /* keeps prose readable on all screen sizes */
        }

        @media (min-width: 1280px) {
          .report-main-inner {
            /* Add right breathing room so fixed TOC (220px + 32px gap) doesn't
               overlap the prose. The TOC is fixed to the viewport so it sits
               outside the normal flow — we compensate with padding here. */
            padding-right: ${TOC_W + TOC_GAP}px;
            max-width: none;         /* let it fill the flex column on xl */
          }
        }
      `}</style>
    </>
  );
}