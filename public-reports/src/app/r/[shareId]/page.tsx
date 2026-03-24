// src/app/r/[shareId]/page.tsx
// Public-Reports — Main public report page (Server Component)
// - Play Store: DEEPDIVE_PLAY_STORE_URL env var
// - App Store: greyed out "Coming Soon"

import { notFound }           from 'next/navigation';
import type { Metadata }      from 'next';
import { supabaseServer }     from '@/lib/supabase-server';
import { buildMetadata, buildJsonLd } from '@/components/ShareMeta';
import { CopyLinkIsland }     from './CopyLinkIsland';
import ReportHeader           from '@/components/ReportHeader';
import ReportStats            from '@/components/ReportStats';
import ReportSectionCard      from '@/components/ReportSectionCard';
import FindingsPanel          from '@/components/FindingsPanel';
import SourcesList            from '@/components/SourcesList';
import StatCards              from '@/components/StatCards';
import ChatWidget             from '@/components/ChatWidget';
import DeepDiveBanner         from '@/components/DeepDiveBanner';
import type { PublicReport }  from '@/types/report';

// ── generateMetadata ──────────────────────────────────────────────────────────

export async function generateMetadata(
  { params }: { params: Promise<{ shareId: string }> }
): Promise<Metadata> {
  const { shareId } = await params;
  const report = await fetchReport(shareId);
  if (!report) return { title: 'Report Not Found | DeepDive AI' };
  return buildMetadata(report, shareId);
}

// ── Data fetching ─────────────────────────────────────────────────────────────

async function fetchReport(shareId: string): Promise<PublicReport | null> {
  if (!shareId || shareId.length > 20 || !/^[a-z0-9]+$/.test(shareId)) return null;

  const { data, error } = await supabaseServer.rpc('get_report_by_share_id', {
    p_share_id: shareId,
  });

  if (error) {
    console.error('[PublicReportPage] RPC error:', error.message);
    return null;
  }
  if (!data || data.length === 0) return null;

  const row = data[0];

  // Increment view count (non-blocking)
  supabaseServer
    .rpc('increment_share_view', { p_share_id: shareId })
    .then(({ error: e }) => { if (e) console.warn('[PublicReportPage] View increment:', e.message); });

  return {
    reportId:          row.report_id,
    shareLinkId:       row.share_link_id,
    viewCount:         row.view_count         ?? 0,
    query:             row.query,
    depth:             row.depth,
    title:             row.title              ?? row.query,
    executiveSummary:  row.executive_summary  ?? '',
    sections:          Array.isArray(row.sections)           ? row.sections           : [],
    keyFindings:       Array.isArray(row.key_findings)       ? row.key_findings       : [],
    futurePredictions: Array.isArray(row.future_predictions) ? row.future_predictions : [],
    citations:         Array.isArray(row.citations)          ? row.citations          : [],
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

// ── Store buttons ─────────────────────────────────────────────────────────────

function AppStoreBtn() {
  return (
    <div
      className="inline-flex items-center gap-3 py-3 px-5 rounded-xl text-sm"
      title="Not on App Store yet"
      style={{
        background:  'rgba(255,255,255,0.03)',
        border:      '1px solid rgba(255,255,255,0.08)',
        cursor:      'default',
        opacity:     0.45,
      }}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="rgba(255,255,255,0.5)">
        <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
      </svg>
      <div>
        <p className="text-xs font-normal leading-none mb-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>Not available yet</p>
        <p className="font-bold text-sm leading-none"          style={{ color: 'rgba(255,255,255,0.3)' }}>iOS — Coming Soon</p>
      </div>
    </div>
  );
}

function PlayStoreBtn({ url }: { url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-3 py-3 px-5 rounded-xl font-bold text-sm transition-opacity hover:opacity-90"
      style={{ background: 'linear-gradient(135deg, #6C63FF 0%, #8B5CF6 100%)', color: '#fff', textDecoration: 'none' }}
    >
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

// ── Helper components ─────────────────────────────────────────────────────────

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
      <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--text-muted)' }}>
        📸 Source Images
      </p>
      <div className="flex gap-2 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none' }}>
        {images.slice(0, 8).map((img, i) => (
          <a key={i} href={img.url} target="_blank" rel="noopener noreferrer" title={img.title}
             className="flex-shrink-0 w-24 h-16 rounded-xl overflow-hidden transition-opacity hover:opacity-80"
             style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img.thumbnailUrl ?? img.url} alt={img.title ?? ''}
                 className="w-full h-full object-cover" loading="lazy" />
          </a>
        ))}
      </div>
    </div>
  );
}

// ── Report key stats strip ────────────────────────────────────────────────────
// Displayed inside BottomCTA to showcase the report's numbers

interface ReportStatChipProps { label: string; value: string; color: string; icon: string; change?: string; }

function ReportStatChip({ label, value, color, icon, change }: ReportStatChipProps) {
  const isPositive = change?.startsWith('↑');
  const isNegative = change?.startsWith('↓');
  const changeColor = isPositive ? '#10B981' : isNegative ? '#EF4444' : 'rgba(255,255,255,0.4)';

  return (
    <div
      className="flex flex-col gap-1.5 p-3 rounded-2xl flex-1 min-w-0"
      style={{
        background:      'var(--bg-elevated)',
        border:          '1px solid var(--border)',
        borderTopWidth:  '2px',
        borderTopColor:  color,
      }}
    >
      <div className="flex items-center gap-1.5">
        <span className="text-base leading-none">{icon}</span>
        <p className="text-xs font-semibold uppercase tracking-wide truncate"
           style={{ color: 'var(--text-muted)' }}>
          {label}
        </p>
      </div>
      <p className="font-extrabold text-lg leading-none" style={{ color }}>{value}</p>
      {change && (
        <p className="text-xs font-semibold flex items-center gap-1" style={{ color: changeColor }}>
          {(isPositive || isNegative) && (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              {isPositive
                ? <><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></>
                : <><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></>
              }
            </svg>
          )}
          {change.replace('↑', '').replace('↓', '').trim()}
        </p>
      )}
    </div>
  );
}

function BottomCTA({ report, playStoreUrl }: { report: PublicReport; playStoreUrl: string }) {
  const reliabilityColor =
    report.reliabilityScore >= 8 ? '#10B981'
    : report.reliabilityScore >= 6 ? '#6C63FF'
    : '#F59E0B';

  return (
    <div
      className="rounded-2xl p-6 text-center"
      style={{
        background: 'linear-gradient(135deg, #1A1A35 0%, #12122A 100%)',
        border:     '1px solid rgba(108,99,255,0.3)',
        position:   'relative',
        overflow:   'hidden',
      }}
    >
      <div className="absolute inset-0 pointer-events-none"
           style={{ background: 'radial-gradient(ellipse 70% 50% at 50% 0%, rgba(108,99,255,0.15) 0%, transparent 70%)' }} />

      <div className="relative">
        <div
          className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg, #6C63FF 0%, #8B5CF6 100%)', boxShadow: '0 0 32px rgba(108,99,255,0.4)' }}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
               stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/>
            <path d="m21 21-4.35-4.35"/>
          </svg>
        </div>

        <h3
          className="text-xl font-extrabold mb-2"
          style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)', letterSpacing: '-0.02em' }}
        >
          Create your own AI research report
        </h3>

        <p className="text-sm mb-5 max-w-md mx-auto" style={{ color: 'var(--text-muted)', lineHeight: 1.6 }}>
          DeepDive AI runs autonomous multi-agent research on any topic — like this one on{' '}
          <em style={{ color: 'var(--text-secondary)' }}>
            &ldquo;{report.title.slice(0, 55)}{report.title.length > 55 ? '…' : ''}&rdquo;
          </em>
          {' '}— in minutes.
        </p>

        {/* Report stat chips */}
        <div className="flex gap-2 mb-5 flex-wrap">
          <ReportStatChip
            icon="🌐" label="Sources"
            value={String(report.sourcesCount)}
            change="↑ verified"
            color="#3B82F6"
          />
          <ReportStatChip
            icon="🔗" label="Citations"
            value={String(report.citations.length)}
            change={`${report.sections.length} sections`}
            color="#6C63FF"
          />
          <ReportStatChip
            icon="🛡" label="Reliability"
            value={`${report.reliabilityScore}/10`}
            change={report.reliabilityScore >= 7 ? '↑ high quality' : 'moderate'}
            color={reliabilityColor}
          />
        </div>

        {/* Feature pills */}
        <div className="flex flex-wrap justify-center gap-2 mb-5">
          {['🔬 Multi-agent research', '📊 AI infographics', '🎙 Podcast mode',
            '⚖️ Debate engine', '🎓 Academic papers', '📱 iOS & Android'].map(f => (
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

// ── Main page ─────────────────────────────────────────────────────────────────

export default async function PublicReportPage({
  params,
}: {
  params: Promise<{ shareId: string }>;
}) {
  const { shareId }   = await params;
  const report        = await fetchReport(shareId);
  if (!report) notFound();

  const jsonLd        = buildJsonLd(report, shareId);
  const APP_URL       = process.env.NEXT_PUBLIC_APP_URL ?? '';
  const PLAY_STORE    = process.env.DEEPDIVE_PLAY_STORE_URL ?? '#';
  const chatLimit     = parseInt(process.env.PUBLIC_CHAT_QUESTION_LIMIT ?? '3', 10);

  const hasInfographics = !!(
    report.infographicData &&
    (report.infographicData.stats.length > 0 || report.infographicData.charts.length > 0)
  );
  const hasSourceImages = (report.sourceImages?.length ?? 0) > 0;

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />

      <div className="min-h-screen pb-24" style={{ background: 'var(--bg-base)' }}>

        {/* ── Navbar ── */}
        <header
          className="sticky top-0 z-40 px-4 py-3"
          style={{ background: 'rgba(10,10,26,0.85)', backdropFilter: 'blur(20px)', borderBottom: '1px solid var(--border)' }}
        >
          <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
            <a href="/" className="flex items-center gap-2 transition-opacity hover:opacity-80"
               style={{ textDecoration: 'none' }}>
              <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                   style={{ background: 'linear-gradient(135deg, #6C63FF 0%, #8B5CF6 100%)' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                     stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"/>
                  <path d="m21 21-4.35-4.35"/>
                </svg>
              </div>
              <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>DeepDive AI</span>
            </a>

            <div className="flex items-center gap-3">
              {report.viewCount > 0 && (
                <span className="text-xs hidden sm:block" style={{ color: 'var(--text-muted)' }}>
                  👁 {report.viewCount.toLocaleString()} views
                </span>
              )}
              <CopyLinkIsland url={`${APP_URL}/r/${shareId}`} />
            </div>
          </div>
        </header>

        {/* ── Content ── */}
        <main className="max-w-3xl mx-auto px-4 pt-8">

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
            {report.sections.map((section, i) => (
              <ReportSectionCard
                key={section.id ?? i}
                section={section}
                citations={report.citations}
                index={i}
              />
            ))}
          </section>

          <Divider label="Ask AI" />
          <section aria-label="AI research assistant">
            <ChatWidget
              shareId={shareId}
              reportTitle={report.title}
              questionsMax={chatLimit}
            />
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

          <div className="mt-12 mb-6">
            <BottomCTA report={report} playStoreUrl={PLAY_STORE} />
          </div>

        </main>
      </div>

      <DeepDiveBanner />
    </>
  );
}