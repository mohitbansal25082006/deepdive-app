// Public-Reports/src/app/page.tsx
// Fix: STATS changeType widened to union type so === 'negative' comparison is valid.
// All other code identical to the Part 34 Update version.

import type { Metadata } from 'next';
import Link             from 'next/link';
import { createSupabaseServer } from '@/lib/supabase-server';

export const metadata: Metadata = {
  title: 'DeepDive AI — AI-Powered Research Reports',
  description:
    'DeepDive AI runs autonomous multi-agent research on any topic and generates structured, cited reports in minutes. Download the app to get started.',
};

const PLAY_STORE_URL = process.env.DEEPDIVE_PLAY_STORE_URL ?? '#';

const FEATURES = [
  { icon: '🔬', title: 'Multi-Agent Research',   desc: 'Planner, searcher, analyst, fact-checker, and reporter agents collaborate automatically.' },
  { icon: '📊', title: 'AI Infographics',         desc: 'Auto-generated charts, stat cards, and knowledge graphs from every report.' },
  { icon: '🎙', title: 'Podcast Mode',            desc: 'Turn any report into a two-host AI podcast with real audio generation.' },
  { icon: '⚖️', title: 'Debate Engine',           desc: '6 AI agents debate any topic from Optimist, Skeptic, Economist, and more perspectives.' },
  { icon: '🎓', title: 'Academic Papers',         desc: 'Convert reports into full peer-review–quality papers with APA/MLA/IEEE citations.' },
  { icon: '🌐', title: 'Public Sharing',          desc: 'Share any report as a public webpage with an embedded AI Q&A widget.' },
];

// ── FIX: explicit type annotation so changeType is the full union, not a literal ──
interface StatCardData {
  label:       string;
  value:       string;
  change?:     string;
  changeType?: 'positive' | 'negative' | 'neutral';   // ← widened union
  color:       string;
  icon:        string;
}

const STATS: StatCardData[] = [
  { label: 'Research Depth',  value: '260+', change: 'sources/query',         changeType: 'positive', color: '#6C63FF', icon: '🔬' },
  { label: 'AI Agents',       value: '7',    change: 'collaborating',          changeType: 'positive', color: '#10B981', icon: '🤖' },
  { label: 'Export Formats',  value: '5',    change: 'PPTX·PDF·HTML·MD·Audio', changeType: 'neutral',  color: '#F59E0B', icon: '📤' },
  { label: 'Signup Credits',  value: '20',   change: '↑ free to start',        changeType: 'positive', color: '#3B82F6', icon: '✦'  },
];

// ── Fetch discovery stats ────────────────────────────────────────────────────

async function fetchDiscoverStats(): Promise<{ reportCount: number; topTags: string[] }> {
  try {
    const supabase = createSupabaseServer();
    const [feedRes, tagsRes] = await Promise.allSettled([
      supabase.rpc('get_public_reports_feed', { p_sort: 'trending', p_limit: 100, p_offset: 0 }),
      supabase.rpc('get_all_public_tags', { p_limit: 6 }),
    ]);
    const count = feedRes.status === 'fulfilled' ? (feedRes.value.data?.length ?? 0) : 0;
    const tags  = tagsRes.status === 'fulfilled'
      ? (tagsRes.value.data ?? []).map((t: { tag: string }) => t.tag).slice(0, 6)
      : [];
    return { reportCount: count, topTags: tags };
  } catch {
    return { reportCount: 0, topTags: [] };
  }
}

// ── Store buttons ─────────────────────────────────────────────────────────────

function AppStoreBtn({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const cls = size === 'sm'
    ? 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs'
    : 'inline-flex items-center gap-3 py-3 px-5 rounded-xl font-bold text-sm';
  return (
    <div className={cls} title="Not on App Store yet"
      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', cursor: 'default', opacity: 0.45 }}>
      <svg width={size === 'sm' ? 13 : 20} height={size === 'sm' ? 13 : 20} viewBox="0 0 24 24" fill="rgba(255,255,255,0.5)">
        <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
      </svg>
      {size === 'sm'
        ? <span style={{ color: 'rgba(255,255,255,0.3)' }}>iOS — Soon</span>
        : <div>
            <p className="text-xs font-normal leading-none mb-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>Not available yet</p>
            <p className="font-bold text-sm leading-none" style={{ color: 'rgba(255,255,255,0.3)' }}>iOS — Coming Soon</p>
          </div>
      }
    </div>
  );
}

function PlayStoreBtn({ url, size = 'md' }: { url: string; size?: 'sm' | 'md' }) {
  const cls = size === 'sm'
    ? 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-opacity hover:opacity-80'
    : 'inline-flex items-center gap-3 py-3 px-5 rounded-xl font-bold text-sm transition-opacity hover:opacity-90';
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className={cls}
       style={{ background: 'linear-gradient(135deg, #6C63FF 0%, #8B5CF6 100%)', color: '#fff', textDecoration: 'none' }}>
      <svg width={size === 'sm' ? 13 : 20} height={size === 'sm' ? 13 : 20} viewBox="0 0 24 24" fill="white">
        <path d="M3 18.5v-13c0-.83.95-1.3 1.6-.8l11 6.5c.6.35.6 1.25 0 1.6l-11 6.5c-.65.5-1.6.03-1.6-.8z"/>
      </svg>
      {size === 'sm'
        ? 'Google Play'
        : <div>
            <p className="text-xs font-normal leading-none mb-0.5" style={{ color: 'rgba(255,255,255,0.75)' }}>Get it on</p>
            <p className="font-bold text-sm leading-none">Google Play</p>
          </div>
      }
    </a>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ stat }: { stat: StatCardData }) {
  // Now TypeScript is happy: changeType is 'positive' | 'negative' | 'neutral'
  // so the comparison with 'negative' is valid.
  const arrowColor =
    stat.changeType === 'positive' ? '#10B981'
    : stat.changeType === 'negative' ? '#EF4444'
    : 'rgba(255,255,255,0.4)';
  const hasArrow = stat.change?.startsWith('↑') || stat.change?.startsWith('↓');

  return (
    <div className="flex flex-col gap-2 p-4 rounded-2xl"
         style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderTopWidth: '3px', borderTopColor: stat.color }}>
      <div className="flex items-center gap-2">
        <span className="text-lg leading-none">{stat.icon}</span>
        <p className="text-xs font-semibold uppercase tracking-wider leading-none" style={{ color: 'var(--text-muted)' }}>
          {stat.label}
        </p>
      </div>
      <p className="font-extrabold leading-none" style={{ color: stat.color, fontSize: 'clamp(1.5rem, 3vw, 2rem)' }}>
        {stat.value}
      </p>
      {stat.change && (
        <p className="text-xs font-semibold flex items-center gap-1" style={{ color: arrowColor }}>
          {hasArrow && (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              {stat.change.startsWith('↑')
                ? <><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></>
                : <><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></>
              }
            </svg>
          )}
          {stat.change.replace('↑', '').replace('↓', '').trim()}
        </p>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default async function HomePage() {
  const { reportCount, topTags } = await fetchDiscoverStats();

  return (
    <main className="min-h-screen" style={{ background: 'var(--bg-base)', color: 'var(--text-primary)' }}>

      {/* ── Navbar ── */}
      <nav className="sticky top-0 z-40 px-4 py-3"
           style={{ background: 'rgba(10,10,26,0.85)', backdropFilter: 'blur(20px)', borderBottom: '1px solid var(--border)' }}>
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center"
                 style={{ background: 'linear-gradient(135deg, #6C63FF 0%, #8B5CF6 100%)' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
            </div>
            <span className="font-bold text-base" style={{ color: 'var(--text-primary)' }}>DeepDive AI</span>
          </div>

          <div className="flex items-center gap-2">
            <Link href="/discover"
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-opacity hover:opacity-80"
              style={{ background: 'rgba(108,99,255,0.1)', border: '1px solid rgba(108,99,255,0.25)', color: '#A78BFA', textDecoration: 'none' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
              Discover
            </Link>
            <AppStoreBtn size="sm" />
            <PlayStoreBtn url={PLAY_STORE_URL} size="sm" />
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="max-w-4xl mx-auto px-4 pt-16 pb-12 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold mb-6"
             style={{ background: 'rgba(108,99,255,0.12)', border: '1px solid rgba(108,99,255,0.3)', color: '#6C63FF' }}>
          <span>✦</span>
          Autonomous AI Research
        </div>

        <h1 className="mb-5 leading-tight"
            style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.9rem, 6vw, 3.5rem)', fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--text-primary)' }}>
          Research anything.{' '}
          <span style={{ background: 'linear-gradient(135deg, #6C63FF 0%, #A78BFA 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Instantly.
          </span>
        </h1>

        <p className="max-w-xl mx-auto mb-8 text-base sm:text-lg leading-relaxed px-2" style={{ color: 'var(--text-muted)' }}>
          DeepDive AI deploys a team of AI agents to search the web, analyse sources,
          fact-check claims, and generate structured research reports — all automatically.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center mb-3">
          <AppStoreBtn size="md" />
          <PlayStoreBtn url={PLAY_STORE_URL} size="md" />
        </div>
        <div className="flex justify-center mb-2">
          <Link href="/discover"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm transition-all hover:opacity-90"
            style={{ background: 'rgba(108,99,255,0.12)', border: '1px solid rgba(108,99,255,0.3)', color: '#A78BFA', textDecoration: 'none' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            Browse Public Research
            {reportCount > 0 && (
              <span style={{ background: 'rgba(108,99,255,0.2)', borderRadius: '999px', padding: '2px 7px', fontSize: '0.7rem', fontWeight: 700 }}>
                {reportCount}+
              </span>
            )}
          </Link>
        </div>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          Free to start · 20 credits on signup · No credit card required
        </p>
      </section>

      {/* ── Stats grid ── */}
      <section className="max-w-4xl mx-auto px-4 mb-12">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {STATS.map((stat, i) => <StatCard key={i} stat={stat} />)}
        </div>
      </section>

      {/* ── Discover Community Research (Fully Optimized for Mobile) ── */}
      <section className="max-w-4xl mx-auto px-4 mb-12">
        <div className="rounded-2xl overflow-hidden"
             style={{ background: 'linear-gradient(135deg, #1A1A35 0%, #12122A 100%)', border: '1px solid rgba(108,99,255,0.3)', position: 'relative' }}>
          <div className="absolute inset-0 pointer-events-none"
               style={{ background: 'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(108,99,255,0.12) 0%, transparent 70%)' }} />
          <div className="relative p-5 sm:p-8">
            <div className="flex flex-col gap-6">
              {/* Content Section - Full width on mobile */}
              <div className="flex-1 min-w-0">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold mb-3"
                     style={{ background: 'rgba(108,99,255,0.15)', border: '1px solid rgba(108,99,255,0.3)', color: '#A78BFA' }}>
                  🌐 Community Research
                </div>
                <h2 className="text-xl sm:text-2xl font-extrabold mb-2"
                    style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                  Discover public research
                </h2>
                <p className="text-sm mb-4" style={{ color: 'var(--text-muted)', lineHeight: 1.6 }}>
                  Browse{reportCount > 0 ? ` ${reportCount}+` : ''} AI-generated research reports shared by the DeepDive community — sorted by views, recency, or topic.
                </p>

                {/* Tags - Horizontal scroll on mobile, wrap on desktop */}
                {topTags.length > 0 && (
                  <div className="mb-5 overflow-x-auto pb-2 -mx-1 px-1 sm:overflow-visible sm:pb-0 sm:mx-0 sm:px-0">
                    <div className="flex flex-nowrap gap-2 sm:flex-wrap min-w-min">
                      {topTags.map(tag => (
                        <Link key={tag} href={`/topic/${encodeURIComponent(tag)}`}
                          className="inline-flex items-center whitespace-nowrap px-2.5 py-1 rounded-full text-xs font-semibold transition-opacity hover:opacity-80"
                          style={{ background: 'rgba(108,99,255,0.12)', border: '1px solid rgba(108,99,255,0.25)', color: '#A78BFA', textDecoration: 'none' }}>
                          #{tag}
                        </Link>
                      ))}
                      <Link href="/discover"
                        className="inline-flex items-center whitespace-nowrap px-2.5 py-1 rounded-full text-xs font-semibold transition-opacity hover:opacity-80"
                        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', color: 'var(--text-muted)', textDecoration: 'none' }}>
                        + more →
                      </Link>
                    </div>
                  </div>
                )}

                {/* Buttons - Stack vertically on mobile, row on desktop */}
                <div className="flex flex-col sm:flex-row gap-3">
                  <Link href="/discover"
                    className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all hover:opacity-90"
                    style={{ background: 'linear-gradient(135deg, #6C63FF, #8B5CF6)', color: '#fff', textDecoration: 'none', boxShadow: '0 4px 16px rgba(108,99,255,0.35)' }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                    </svg>
                    Browse Research
                  </Link>
                  <Link href="/discover?sort=recent"
                    className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all hover:opacity-80"
                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--text-secondary)', textDecoration: 'none' }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                    </svg>
                    Latest Reports
                  </Link>
                </div>
              </div>

              {/* Stats Cards - Horizontal scroll on mobile, grid on desktop */}
              <div className="overflow-x-auto pb-2 -mx-2 px-2 sm:overflow-visible sm:pb-0 sm:mx-0 sm:px-0">
                <div className="flex gap-3 sm:grid sm:grid-cols-3 min-w-min sm:min-w-0">
                  {[
                    { icon: '👁', value: reportCount > 0 ? `${reportCount}+` : '—', label: 'Public Reports'    },
                    { icon: '🔖', value: topTags.length  > 0 ? `${topTags.length}+` : '—', label: 'Research Topics' },
                    { icon: '🌍', value: 'Free',                                            label: 'No Login Needed' },
                  ].map(item => (
                    <div key={item.label} className="flex items-center gap-3 px-4 py-3 rounded-xl flex-shrink-0 sm:flex-shrink"
                         style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', minWidth: '140px' }}>
                      <span style={{ fontSize: '1.25rem', lineHeight: 1 }}>{item.icon}</span>
                      <div>
                        <p className="font-extrabold text-base leading-none mb-0.5" style={{ color: '#6C63FF' }}>{item.value}</p>
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{item.label}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Shared report finder ── */}
      <section className="max-w-4xl mx-auto px-4 mb-12">
        <div className="rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start gap-4"
             style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
               style={{ background: 'rgba(108,99,255,0.15)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6C63FF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/>
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm mb-1" style={{ color: 'var(--text-primary)' }}>Looking for a shared report?</p>
            <p className="text-sm" style={{ color: 'var(--text-muted)', lineHeight: 1.6 }}>
              Public report links look like{' '}
              <code className="px-1.5 py-0.5 rounded-md text-xs break-all"
                    style={{ background: 'rgba(108,99,255,0.15)', color: '#A78BFA', fontFamily: 'monospace' }}>
                /r/abc123xy
              </code>
              . If someone shared a report with you, use the full URL they gave you.
            </p>
          </div>
        </div>
      </section>

      {/* ── Features grid ── */}
      <section className="max-w-4xl mx-auto px-4 mb-14">
        <h2 className="text-center text-2xl font-bold mb-8"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
          Everything in one app
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map((f, i) => (
            <div key={i} className="p-5 rounded-2xl"
                 style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
              <span className="text-2xl mb-3 block">{f.icon}</span>
              <h3 className="font-bold text-sm mb-1.5" style={{ color: 'var(--text-primary)' }}>{f.title}</h3>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Bottom CTA ── */}
      <section className="max-w-2xl mx-auto px-4 pb-20 text-center">
        <div className="rounded-2xl p-6 sm:p-8"
             style={{ background: 'linear-gradient(135deg, #1A1A35 0%, #12122A 100%)', border: '1px solid rgba(108,99,255,0.3)', position: 'relative', overflow: 'hidden' }}>
          <div className="absolute inset-0 pointer-events-none"
               style={{ background: 'radial-gradient(ellipse 80% 50% at 50% 0%, rgba(108,99,255,0.15) 0%, transparent 70%)' }} />
          <div className="relative">
            <p className="text-3xl mb-3">🔬</p>
            <h2 className="text-xl font-extrabold mb-2"
                style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
              Start researching for free
            </h2>
            <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
              20 bonus credits on signup. No credit card needed.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center mb-4">
              <AppStoreBtn size="md" />
              <PlayStoreBtn url={PLAY_STORE_URL} size="md" />
            </div>
            <Link href="/discover"
              className="inline-flex items-center gap-2 text-sm font-semibold transition-opacity hover:opacity-80"
              style={{ color: '#A78BFA', textDecoration: 'none' }}>
              Or browse public research first →
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="text-center px-4 py-6"
              style={{ borderTop: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <p>© {new Date().getFullYear()} DeepDive AI · Built with autonomous AI agents</p>
          <div className="flex items-center gap-4">
            <Link href="/discover" style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '0.75rem' }}>
              Discover
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}