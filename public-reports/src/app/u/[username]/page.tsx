// Public-Reports/src/app/u/[username]/page.tsx
// DeepDive AI — Part 36: Web Public User Profile Page
//
// FIXES & IMPROVEMENTS:
//  1. Avatar fully visible — removed negative margin hack that cut it in half.
//     Avatar now sits cleanly below the banner, fully contained.
//  2. Full responsive layout — proper two-column grid on desktop (≥769px),
//     stacked single column on mobile with correct padding/spacing.
//  3. Profile card sidebar is sticky on desktop, static on mobile.
//  4. Tags parsed correctly from jsonb arrays.
//  5. Sticky footer is always visible and doesn't overlap content (padding-bottom on page).
//  6. Report cards link to actual share URLs.
//  7. Clean, polished dark theme with glass cards and gradient accents.

import { notFound }      from 'next/navigation';
import type { Metadata } from 'next';
import Link              from 'next/link';
import { createSupabaseServer } from '@/lib/supabase-server';

// ─── Types ────────────────────────────────────────────────────────────────────

interface WebPublicProfile {
  id:              string;
  username:        string | null;
  full_name:       string | null;
  avatar_url:      string | null;
  bio:             string | null;
  occupation:      string | null;
  interests:       string[] | null;
  is_public:       boolean;
  follower_count:  number;
  following_count: number;
  public_reports:  number;
  total_views:     number;
}

interface WebPublicReport {
  share_id:          string;
  title:             string;
  query:             string;
  depth:             'quick' | 'deep' | 'expert';
  executive_summary: string;
  tags:              string[];
  sources_count:     number;
  reliability_score: number;
  view_count:        number;
  created_at:        string;
}

// ─── Data fetching ────────────────────────────────────────────────────────────

async function fetchProfile(username: string): Promise<WebPublicProfile | null> {
  const sb = createSupabaseServer();
  try {
    const { data, error } = await sb.rpc('get_public_profile', { p_username: username });
    if (error || !data) return null;
    const raw = data as Record<string, unknown>;
    return {
      id:              String(raw.id              ?? ''),
      username:        raw.username  != null ? String(raw.username)  : null,
      full_name:       raw.full_name != null ? String(raw.full_name) : null,
      avatar_url:      raw.avatar_url != null ? String(raw.avatar_url) : null,
      bio:             raw.bio        != null ? String(raw.bio)        : null,
      occupation:      raw.occupation != null ? String(raw.occupation) : null,
      interests:       Array.isArray(raw.interests) ? (raw.interests as string[]) : [],
      is_public:       Boolean(raw.is_public      ?? false),
      follower_count:  Number(raw.follower_count  ?? 0),
      following_count: Number(raw.following_count ?? 0),
      public_reports:  Number(raw.public_reports  ?? 0),
      total_views:     Number(raw.total_views      ?? 0),
    };
  } catch (e) {
    console.error('[profile] fetch error:', e);
    return null;
  }
}

async function fetchReports(username: string): Promise<WebPublicReport[]> {
  const sb = createSupabaseServer();
  try {
    const { data, error } = await sb.rpc('get_public_reports_for_user', {
      p_username: username,
      p_limit:    30,
      p_offset:   0,
    });
    if (error) console.error('[reports] RPC error:', error.message);

    const rows: Record<string, unknown>[] = Array.isArray(data)
      ? (data as Record<string, unknown>[])
      : [];

    return rows.map(raw => ({
      share_id:          String(raw.share_id          ?? ''),
      title:             String(raw.title             ?? ''),
      query:             String(raw.query             ?? ''),
      depth:             ((raw.depth as string) ?? 'quick') as WebPublicReport['depth'],
      executive_summary: String(raw.executive_summary ?? ''),
      tags: Array.isArray(raw.tags)
        ? (raw.tags as string[])
        : typeof raw.tags === 'string'
          ? (() => { try { return JSON.parse(raw.tags as string) as string[]; } catch { return []; } })()
          : [],
      sources_count:     Number(raw.sources_count     ?? 0),
      reliability_score: Number(raw.reliability_score ?? 0),
      view_count:        Number(raw.view_count        ?? 0),
      created_at:        String(raw.created_at        ?? new Date().toISOString()),
    }));
  } catch (e) {
    console.error('[reports] fetch error:', e);
    return [];
  }
}

// ─── Metadata ─────────────────────────────────────────────────────────────────

export async function generateMetadata(
  { params }: { params: Promise<{ username: string }> },
): Promise<Metadata> {
  const { username } = await params;
  const profile = await fetchProfile(username);
  if (!profile) return { title: 'Profile Not Found | DeepDive AI' };

  const displayName = profile.full_name ?? `@${username}`;
  const description = profile.bio
    ?? `${displayName} has published ${profile.public_reports} research report${profile.public_reports !== 1 ? 's' : ''} on DeepDive AI.`;
  const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://public-reports-three.vercel.app';

  return {
    title:       `${displayName} | DeepDive AI`,
    description,
    openGraph: {
      type:        'profile',
      siteName:    'DeepDive AI',
      title:       `${displayName} on DeepDive AI`,
      description,
      images:      profile.avatar_url ? [{ url: profile.avatar_url, width: 400, height: 400, alt: displayName }] : [],
      url:         `${APP_URL}/u/${username}`,
    },
    twitter: {
      card:        'summary',
      title:       `${displayName} on DeepDive AI`,
      description,
      images:      profile.avatar_url ? [profile.avatar_url] : [],
    },
    alternates: { canonical: `${APP_URL}/u/${username}` },
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DEPTH_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  quick:  { label: 'Quick',     color: '#10B981', bg: 'rgba(16,185,129,0.12)',  border: 'rgba(16,185,129,0.3)'  },
  deep:   { label: 'Deep Dive', color: '#6C63FF', bg: 'rgba(108,99,255,0.12)', border: 'rgba(108,99,255,0.3)' },
  expert: { label: 'Expert',    color: '#F59E0B', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.3)'  },
};

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return ''; }
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

// ─── SVG icons (inline, no extra deps) ───────────────────────────────────────

const SearchIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
  </svg>
);

const DocIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
  </svg>
);

const EyeIcon = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
);

const PlayIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
    <path d="M3 18.5v-13c0-.83.95-1.3 1.6-.8l11 6.5c.6.35.6 1.25 0 1.6l-11 6.5c-.65.5-1.6.03-1.6-.8z"/>
  </svg>
);

const PersonAddIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <line x1="19" y1="8" x2="19" y2="14"/>
    <line x1="22" y1="11" x2="16" y2="11"/>
  </svg>
);

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  if (!username || username.length > 50) notFound();

  const [profile, reports] = await Promise.all([
    fetchProfile(username),
    fetchReports(username),
  ]);

  if (!profile) notFound();

  const displayName    = profile.full_name ?? `@${username}`;
  const firstName      = profile.full_name?.split(' ')[0] ?? username;
  const APP_URL        = process.env.NEXT_PUBLIC_APP_URL ?? 'https://public-reports-three.vercel.app';
  const PLAY_STORE_URL = process.env.DEEPDIVE_PLAY_STORE_URL ?? '#';

  const initials = displayName
    .split(' ').map((w: string) => w[0] ?? '').join('').slice(0, 2).toUpperCase();

  return (
    <>
      {/* JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type':    'Person',
            name:       displayName,
            url:        `${APP_URL}/u/${username}`,
            image:      profile.avatar_url ?? undefined,
            description: profile.bio ?? undefined,
          }),
        }}
      />

      <style dangerouslySetInnerHTML={{ __html: `
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
          --bg:        #0A0A1A;
          --bg-card:   #0F0F23;
          --bg-elev:   #141430;
          --border:    rgba(255,255,255,0.07);
          --border-hi: rgba(108,99,255,0.35);
          --text-1:    #F0F0FF;
          --text-2:    #B0B0D0;
          --text-3:    #6060A0;
          --purple:    #6C63FF;
          --purple-lt: #A78BFA;
          --green:     #10B981;
          --amber:     #F59E0B;
          --radius-sm: 10px;
          --radius-md: 14px;
          --radius-lg: 20px;
          --radius-xl: 24px;
        }

        html { scroll-behavior: smooth; }
        body {
          background: var(--bg);
          color: var(--text-1);
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          -webkit-font-smoothing: antialiased;
          min-height: 100vh;
        }
        a { text-decoration: none; color: inherit; }

        /* ── Navbar ── */
        .nav {
          position: sticky; top: 0; z-index: 40;
          background: rgba(10,10,26,0.88);
          backdrop-filter: blur(18px);
          -webkit-backdrop-filter: blur(18px);
          border-bottom: 1px solid var(--border);
        }
        .nav-inner {
          max-width: 1120px; margin: 0 auto;
          padding: 0 20px; height: 56px;
          display: flex; align-items: center; gap: 12px;
        }
        .nav-brand {
          display: flex; align-items: center; gap: 9px;
        }
        .nav-brand-icon {
          width: 30px; height: 30px; border-radius: 8px; flex-shrink: 0;
          background: linear-gradient(135deg,#6C63FF,#8B5CF6);
          display: flex; align-items: center; justify-content: center;
        }
        .nav-brand-name {
          font-size: 0.9rem; font-weight: 700; color: var(--text-1);
        }
        .nav-spacer { flex: 1; }
        .nav-link {
          display: flex; align-items: center; gap: 5px;
          padding: 6px 12px; border-radius: var(--radius-sm);
          background: var(--bg-elev); border: 1px solid var(--border);
          color: var(--text-3); font-size: 0.78rem; font-weight: 600;
          transition: color 0.18s, border-color 0.18s;
        }
        .nav-link:hover { color: var(--text-1); border-color: var(--border-hi); }

        /* ── Page shell ── */
        .shell {
          max-width: 1120px; margin: 0 auto;
          padding: 32px 20px 100px;
        }
        @media (max-width: 640px) {
          .shell { padding: 20px 14px 96px; }
        }

        /* ── Two-col layout ── */
        .grid {
          display: grid;
          grid-template-columns: 288px 1fr;
          gap: 24px;
          align-items: start;
        }
        @media (max-width: 768px) {
          .grid { grid-template-columns: 1fr; gap: 20px; }
        }

        /* ── Profile card ── */
        .profile-card {
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: var(--radius-xl);
          overflow: hidden;
        }
        /* sticky only on desktop */
        @media (min-width: 769px) {
          .profile-card { position: sticky; top: 72px; }
        }

        /* Banner */
        .banner {
          height: 72px;
          background: linear-gradient(135deg, #1A1A40 0%, #0E0E2E 100%);
          position: relative; overflow: hidden;
        }
        .banner::after {
          content: '';
          position: absolute; inset: 0;
          background: radial-gradient(ellipse 80% 120% at 50% 110%, rgba(108,99,255,0.28) 0%, transparent 65%);
        }

        /* Avatar — sits BELOW the banner, not overlapping it */
        .avatar-section {
          padding: 14px 20px 0;
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 10px;
        }
        .avatar-ring {
          width: 74px; height: 74px; border-radius: 50%;
          border: 3px solid var(--bg-card);
          background: var(--bg);
          flex-shrink: 0;
          overflow: hidden;
          /* FIX: no negative margin — avatar is fully visible */
        }
        .avatar-img {
          width: 100%; height: 100%;
          object-fit: cover; display: block;
        }
        .avatar-initials {
          width: 100%; height: 100%;
          display: flex; align-items: center; justify-content: center;
          background: linear-gradient(135deg,#6C63FF,#8B5CF6);
          color: #fff; font-weight: 800; font-size: 1.6rem;
          letter-spacing: -0.02em;
        }
        .follow-pill {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 8px 16px; border-radius: 999px;
          background: linear-gradient(135deg,#6C63FF,#8B5CF6);
          color: #fff; font-size: 0.78rem; font-weight: 700;
          transition: opacity 0.18s, transform 0.15s;
          white-space: nowrap; flex-shrink: 0;
          margin-top: 4px;
        }
        .follow-pill:hover { opacity: 0.88; transform: translateY(-1px); }

        /* Profile body */
        .profile-body { padding: 12px 20px 22px; }
        .profile-name {
          font-size: 1.18rem; font-weight: 800; color: var(--text-1);
          letter-spacing: -0.015em; line-height: 1.2; margin-bottom: 2px;
        }
        .profile-handle { color: var(--purple-lt); font-size: 0.8rem; margin-bottom: 10px; }
        .profile-occupation {
          display: flex; align-items: center; gap: 5px;
          color: var(--text-3); font-size: 0.75rem; margin-bottom: 10px;
        }
        .profile-bio {
          color: var(--text-2); font-size: 0.8rem; line-height: 1.65;
          margin-bottom: 14px;
        }

        /* Interests */
        .interests { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 16px; }
        .interest-tag {
          padding: 3px 9px; border-radius: 999px;
          background: rgba(108,99,255,0.1);
          border: 1px solid rgba(108,99,255,0.22);
          color: var(--purple); font-size: 0.68rem; font-weight: 600;
        }

        /* Stats grid */
        .stats-grid {
          display: grid; grid-template-columns: 1fr 1fr;
          gap: 7px;
        }
        .stat-box {
          background: var(--bg-elev); border: 1px solid var(--border);
          border-radius: var(--radius-sm); padding: 10px 12px;
          text-align: center;
        }
        .stat-val { font-size: 1.1rem; font-weight: 800; color: var(--text-1); line-height: 1; }
        .stat-lbl {
          font-size: 0.6rem; color: var(--text-3); margin-top: 3px;
          font-weight: 600; text-transform: uppercase; letter-spacing: 0.07em;
        }

        /* ── CTA card (below profile on desktop) ── */
        .cta-card {
          margin-top: 16px;
          background: linear-gradient(135deg, #1A1A35 0%, #0E0E28 100%);
          border: 1px solid rgba(108,99,255,0.22);
          border-radius: var(--radius-xl); padding: 24px 20px;
          text-align: center; position: relative; overflow: hidden;
        }
        .cta-card::before {
          content: '';
          position: absolute; inset: 0; pointer-events: none;
          background: radial-gradient(ellipse 70% 40% at 50% 0%, rgba(108,99,255,0.18) 0%, transparent 70%);
        }
        .cta-inner { position: relative; }
        .cta-app-icon {
          width: 50px; height: 50px; border-radius: 14px; margin: 0 auto 12px;
          background: linear-gradient(135deg,#6C63FF,#8B5CF6);
          display: flex; align-items: center; justify-content: center;
          box-shadow: 0 0 28px rgba(108,99,255,0.3);
        }
        .cta-title {
          font-size: 1rem; font-weight: 800; color: var(--text-1);
          letter-spacing: -0.01em; margin-bottom: 6px; line-height: 1.3;
        }
        .cta-desc {
          color: var(--text-3); font-size: 0.75rem;
          line-height: 1.6; margin-bottom: 16px;
        }
        .play-btn {
          display: inline-flex; align-items: center; gap: 9px;
          padding: 11px 20px; border-radius: 11px;
          background: linear-gradient(135deg,#6C63FF,#8B5CF6);
          color: #fff; font-weight: 700; font-size: 0.85rem;
          transition: opacity 0.18s, transform 0.15s; margin-bottom: 8px;
        }
        .play-btn:hover { opacity: 0.88; transform: translateY(-1px); }
        .play-top { font-size: 0.58rem; opacity: 0.7; line-height: 1; }
        .play-main { line-height: 1.2; }
        .cta-note { font-size: 0.67rem; color: var(--text-3); }

        /* ── Reports column ── */
        .reports-header {
          display: flex; align-items: center;
          justify-content: space-between; margin-bottom: 16px;
        }
        .reports-heading {
          display: flex; align-items: center; gap: 10px;
          font-size: 1rem; font-weight: 700; color: var(--text-1);
        }
        .heading-icon {
          width: 28px; height: 28px; border-radius: 8px; flex-shrink: 0;
          background: linear-gradient(135deg,#6C63FF,#8B5CF6);
          display: flex; align-items: center; justify-content: center;
        }
        .count-badge {
          padding: 2px 9px; border-radius: 999px;
          background: rgba(108,99,255,0.1);
          border: 1px solid rgba(108,99,255,0.22);
          color: var(--purple); font-size: 0.68rem; font-weight: 700;
        }

        .reports-list { display: grid; gap: 11px; }

        /* Report card */
        .rcard {
          display: block;
          background: var(--bg-card); border: 1px solid var(--border);
          border-radius: var(--radius-md); overflow: hidden;
          transition: border-color 0.2s, transform 0.15s, box-shadow 0.2s;
        }
        .rcard:hover {
          border-color: rgba(108,99,255,0.38);
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(108,99,255,0.1);
        }
        .rcard-accent { height: 3px; }
        .rcard-body { padding: 14px 16px; }
        .rcard-title {
          font-size: 0.88rem; font-weight: 700; color: var(--text-1);
          line-height: 1.45; margin-bottom: 6px;
          display: -webkit-box; -webkit-line-clamp: 2;
          -webkit-box-orient: vertical; overflow: hidden;
        }
        .rcard-summary {
          color: var(--text-3); font-size: 0.74rem; line-height: 1.6;
          margin-bottom: 9px;
          display: -webkit-box; -webkit-line-clamp: 2;
          -webkit-box-orient: vertical; overflow: hidden;
        }
        .rcard-tags { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 9px; }
        .rcard-tag {
          padding: 2px 8px;
          background: rgba(108,99,255,0.09);
          border: 1px solid rgba(108,99,255,0.18);
          border-radius: 999px; font-size: 0.63rem;
          color: var(--purple-lt); font-weight: 600;
          transition: background 0.15s;
        }
        .rcard-tag:hover { background: rgba(108,99,255,0.18); }
        .rcard-meta {
          display: flex; align-items: center; gap: 7px; flex-wrap: wrap;
        }
        .depth-chip {
          padding: 2px 8px; border-radius: 999px;
          font-size: 0.63rem; font-weight: 700;
        }
        .view-ct {
          display: flex; align-items: center; gap: 3px;
          font-size: 0.68rem; color: var(--text-3);
        }
        .rcard-date { font-size: 0.63rem; color: var(--text-3); margin-left: auto; }

        /* Empty state */
        .empty {
          text-align: center; padding: 48px 20px;
          background: var(--bg-card); border-radius: var(--radius-lg);
          border: 1px dashed rgba(255,255,255,0.06);
        }
        .empty-icon {
          width: 44px; height: 44px; border-radius: 12px;
          background: var(--bg-elev);
          display: flex; align-items: center; justify-content: center;
          margin: 0 auto 14px;
        }
        .empty-title { font-size: 0.92rem; font-weight: 700; color: var(--text-1); margin-bottom: 5px; }
        .empty-desc  { font-size: 0.77rem; color: var(--text-3); line-height: 1.6; max-width: 260px; margin: 0 auto; }

        /* ── Sticky footer ── */
        .footer {
          position: fixed; bottom: 0; left: 0; right: 0; z-index: 50;
          background: rgba(10,10,26,0.95);
          backdrop-filter: blur(18px);
          -webkit-backdrop-filter: blur(18px);
          border-top: 1px solid var(--border);
          padding: 10px 20px;
        }
        .footer-inner {
          max-width: 1120px; margin: 0 auto;
          display: flex; align-items: center;
          justify-content: space-between; gap: 16px;
        }
        .footer-brand { display: flex; align-items: center; gap: 9px; }
        .footer-icon {
          width: 30px; height: 30px; border-radius: 8px; flex-shrink: 0;
          background: linear-gradient(135deg,#6C63FF,#8B5CF6);
          display: flex; align-items: center; justify-content: center;
        }
        .footer-name { font-size: 0.82rem; font-weight: 700; color: var(--text-1); line-height: 1; }
        .footer-tag  { font-size: 0.62rem; color: var(--text-3); margin-top: 2px; line-height: 1; }
        .footer-cta {
          padding: 8px 18px; border-radius: 999px;
          background: linear-gradient(135deg,#6C63FF,#8B5CF6);
          color: #fff; font-size: 0.78rem; font-weight: 700;
          white-space: nowrap; flex-shrink: 0;
          transition: opacity 0.18s;
        }
        .footer-cta:hover { opacity: 0.88; }

        /* Mobile adjustments */
        @media (max-width: 480px) {
          .profile-name { font-size: 1rem; }
          .footer-tag { display: none; }
        }
      ` }} />

      <div style={{ minHeight: '100vh', background: '#0A0A1A' }}>

        {/* Navbar */}
        <header className="nav">
          <div className="nav-inner">
            <Link href="/" className="nav-brand">
              <div className="nav-brand-icon"><SearchIcon /></div>
              <span className="nav-brand-name">DeepDive AI</span>
            </Link>
            <div className="nav-spacer" />
            <Link href="/discover" className="nav-link">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
              Discover
            </Link>
          </div>
        </header>

        <div className="shell">
          <div className="grid">

            {/* ─── Left sidebar: Profile ─── */}
            <aside>
              <div className="profile-card">

                {/* Gradient banner — no avatar overlap */}
                <div className="banner" />

                {/* Avatar row — fully below banner, no negative margin */}
                <div className="avatar-section">
                  <div className="avatar-ring">
                    {profile.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={profile.avatar_url}
                        alt={displayName}
                        className="avatar-img"
                      />
                    ) : (
                      <div className="avatar-initials">{initials || '?'}</div>
                    )}
                  </div>
                  <a
                    href={PLAY_STORE_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="follow-pill"
                  >
                    <PersonAddIcon />
                    Follow
                  </a>
                </div>

                {/* Profile body */}
                <div className="profile-body">
                  <h1 className="profile-name">{displayName}</h1>
                  <p className="profile-handle">@{username}</p>

                  {profile.occupation && (
                    <p className="profile-occupation">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <rect x="2" y="7" width="20" height="14" rx="2"/>
                        <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
                      </svg>
                      {profile.occupation}
                    </p>
                  )}

                  {profile.bio && <p className="profile-bio">{profile.bio}</p>}

                  {(profile.interests?.length ?? 0) > 0 && (
                    <div className="interests">
                      {profile.interests!.slice(0, 8).map(tag => (
                        <span key={tag} className="interest-tag">{tag}</span>
                      ))}
                    </div>
                  )}

                  <div className="stats-grid">
                    {[
                      { label: 'Followers', value: formatCount(profile.follower_count)  },
                      { label: 'Following', value: formatCount(profile.following_count) },
                      { label: 'Reports',   value: String(reports.length)               },
                      { label: 'Views',     value: formatCount(profile.total_views)     },
                    ].map(s => (
                      <div key={s.label} className="stat-box">
                        <div className="stat-val">{s.value}</div>
                        <div className="stat-lbl">{s.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Download CTA — desktop sidebar */}
              <div className="cta-card">
                <div className="cta-inner">
                  <div className="cta-app-icon"><SearchIcon /></div>
                  <h3 className="cta-title">Follow {firstName} on DeepDive</h3>
                  <p className="cta-desc">
                    Get notified when {firstName} publishes new AI research — plus run your own reports free.
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                    <a href={PLAY_STORE_URL} target="_blank" rel="noopener noreferrer" className="play-btn">
                      <PlayIcon />
                      <div>
                        <div className="play-top">Get it on</div>
                        <div className="play-main">Google Play</div>
                      </div>
                    </a>
                    <p className="cta-note">Free · 20 credits on signup</p>
                  </div>
                </div>
              </div>
            </aside>

            {/* ─── Right: Reports ─── */}
            <main>
              <div className="reports-header">
                <h2 className="reports-heading">
                  <span className="heading-icon"><DocIcon /></span>
                  Published Reports
                </h2>
                {reports.length > 0 && (
                  <span className="count-badge">{reports.length}</span>
                )}
              </div>

              {reports.length === 0 ? (
                <div className="empty">
                  <div className="empty-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="1.5" strokeLinecap="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                      <polyline points="14 2 14 8 20 8"/>
                    </svg>
                  </div>
                  <p className="empty-title">No public reports yet</p>
                  <p className="empty-desc">
                    {displayName} hasn&apos;t published any research reports publicly yet.
                  </p>
                </div>
              ) : (
                <div className="reports-list">
                  {reports.map(report => {
                    const dc = DEPTH_CONFIG[report.depth] ?? DEPTH_CONFIG.deep;
                    return (
                      <a
                        key={report.share_id}
                        href={`${APP_URL}/r/${report.share_id}`}
                        className="rcard"
                      >
                        <div className="rcard-accent" style={{ background: dc.color, opacity: 0.65 }} />
                        <div className="rcard-body">
                          <h3 className="rcard-title">{report.title}</h3>

                          {report.executive_summary && (
                            <p className="rcard-summary">{report.executive_summary}</p>
                          )}

                          {report.tags.length > 0 && (
                            <div className="rcard-tags">
                              {report.tags.slice(0, 3).map(tag => (
                                <a
                                  key={tag}
                                  href={`/topic/${encodeURIComponent(tag.toLowerCase())}`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="rcard-tag"
                                >
                                  {tag}
                                </a>
                              ))}
                            </div>
                          )}

                          <div className="rcard-meta">
                            <span
                              className="depth-chip"
                              style={{ background: dc.bg, border: `1px solid ${dc.border}`, color: dc.color }}
                            >
                              {dc.label}
                            </span>

                            {report.view_count > 0 && (
                              <span className="view-ct">
                                <EyeIcon />
                                {formatCount(report.view_count)}
                              </span>
                            )}

                            {report.sources_count > 0 && (
                              <span className="view-ct">
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                  <circle cx="12" cy="12" r="10"/>
                                  <line x1="2" y1="12" x2="22" y2="12"/>
                                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                                </svg>
                                {report.sources_count}
                              </span>
                            )}

                            <span className="rcard-date">{formatDate(report.created_at)}</span>
                          </div>
                        </div>
                      </a>
                    );
                  })}
                </div>
              )}
            </main>

          </div>
        </div>
      </div>

      {/* Sticky footer */}
      <footer className="footer">
        <div className="footer-inner">
          <div className="footer-brand">
            <div className="footer-icon"><SearchIcon /></div>
            <div>
              <p className="footer-name">DeepDive AI</p>
              <p className="footer-tag">Follow {displayName} &amp; run your own research</p>
            </div>
          </div>
          <a href={PLAY_STORE_URL} target="_blank" rel="noopener noreferrer" className="footer-cta">
            Get the App
          </a>
        </div>
      </footer>
    </>
  );
}