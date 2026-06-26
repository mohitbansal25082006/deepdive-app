// F:\DeepDiveAI\deepdive-app\public-reports\src\app\u\[username]\page.tsx
// Part 55.9 — Fully Themed Public Profile Page with Loading
// Part 55.11 — Theme button added to navbar (left of Discover button)
// Part 55.12 — Fixed report links to properly navigate to report pages
// Part 55.13 — Fixed Server Component event handler errors (no onClick in Server Components)
// Part 55.14 — Fixed nested <a> tags (tags are non-clickable spans within clickable cards)
// Part 55.15 — Consistent theme modal styling with global CSS
// Full theme integration with all CSS custom properties from theme system

import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { Suspense } from 'react';
import { createSupabaseServer } from '@/lib/supabase-server';
import ThemeToggle from '@/components/ThemeToggle';

// ─── Types ────────────────────────────────────────────────────────────────────

interface WebPublicProfile {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  occupation: string | null;
  interests: string[] | null;
  is_public: boolean;
  follower_count: number;
  following_count: number;
  public_reports: number;
  total_views: number;
}

interface WebPublicReport {
  share_id: string;
  title: string;
  query: string;
  depth: 'quick' | 'deep' | 'expert';
  executive_summary: string;
  tags: string[];
  sources_count: number;
  reliability_score: number;
  view_count: number;
  created_at: string;
}

// ─── Loading Component - Fully Themed ──────────────────────────────────────

function ProfilePageLoading() {
  return (
    <div style={{ 
      minHeight: '100vh', 
      background: 'var(--theme-background)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
    }}>
      <div style={{
        width: 48,
        height: 48,
        borderRadius: '50%',
        border: `4px solid var(--theme-background-elevated)`,
        borderTopColor: 'var(--theme-primary)',
        animation: 'spin 0.8s linear infinite',
        marginBottom: 24,
      }} />
      
      <div style={{
        width: 200,
        height: 8,
        borderRadius: 4,
        background: 'var(--theme-background-elevated)',
        overflow: 'hidden',
        marginBottom: 12,
      }}>
        <div style={{
          width: '40%',
          height: '100%',
          borderRadius: 4,
          background: `linear-gradient(90deg, var(--theme-primary), var(--theme-secondary))`,
          animation: 'shimmer 1.2s ease-in-out infinite',
        }} />
      </div>
      
      <p style={{
        color: 'var(--theme-text-secondary)',
        fontSize: '0.875rem',
        fontWeight: 500,
        margin: 0,
      }}>
        Loading profile...
      </p>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(300%); }
        }
      ` }} />
    </div>
  );
}

// ─── Data fetching ────────────────────────────────────────────────────────────

async function fetchProfile(username: string): Promise<WebPublicProfile | null> {
  const sb = createSupabaseServer();
  try {
    const { data, error } = await sb.rpc('get_public_profile', { p_username: username });
    if (error || !data) {
      if (error) console.error('[profile] RPC error:', error.message, error.code);
      return null;
    }
    const raw = data as Record<string, unknown>;
    return {
      id: String(raw.id ?? ''),
      username: raw.username != null ? String(raw.username) : null,
      full_name: raw.full_name != null ? String(raw.full_name) : null,
      avatar_url: raw.avatar_url != null ? String(raw.avatar_url) : null,
      bio: raw.bio != null ? String(raw.bio) : null,
      occupation: raw.occupation != null ? String(raw.occupation) : null,
      interests: Array.isArray(raw.interests) ? (raw.interests as string[]) : [],
      is_public: Boolean(raw.is_public ?? false),
      follower_count: Number(raw.follower_count ?? 0),
      following_count: Number(raw.following_count ?? 0),
      public_reports: Number(raw.public_reports ?? 0),
      total_views: Number(raw.total_views ?? 0),
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
      p_limit: 30,
      p_offset: 0,
    });
    if (error) console.error('[reports] RPC error:', error.message);

    const rows: Record<string, unknown>[] = Array.isArray(data)
      ? (data as Record<string, unknown>[])
      : [];

    return rows.map(raw => ({
      share_id: String(raw.share_id ?? ''),
      title: String(raw.title ?? ''),
      query: String(raw.query ?? ''),
      depth: ((raw.depth as string) ?? 'quick') as WebPublicReport['depth'],
      executive_summary: String(raw.executive_summary ?? ''),
      tags: Array.isArray(raw.tags)
        ? (raw.tags as string[])
        : typeof raw.tags === 'string'
          ? (() => { try { return JSON.parse(raw.tags as string) as string[]; } catch { return []; } })()
          : [],
      sources_count: Number(raw.sources_count ?? 0),
      reliability_score: Number(raw.reliability_score ?? 0),
      view_count: Number(raw.view_count ?? 0),
      created_at: String(raw.created_at ?? new Date().toISOString()),
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
    title: `${displayName} | DeepDive AI`,
    description,
    openGraph: {
      type: 'profile',
      siteName: 'DeepDive AI',
      title: `${displayName} on DeepDive AI`,
      description,
      images: profile.avatar_url ? [{ url: profile.avatar_url, width: 400, height: 400, alt: displayName }] : [],
      url: `${APP_URL}/u/${username}`,
    },
    twitter: {
      card: 'summary',
      title: `${displayName} on DeepDive AI`,
      description,
      images: profile.avatar_url ? [profile.avatar_url] : [],
    },
    alternates: { canonical: `${APP_URL}/u/${username}` },
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DEPTH_CONFIG: Record<string, { label: string; color: string }> = {
  quick: { label: 'Quick', color: 'var(--theme-success)' },
  deep: { label: 'Deep Dive', color: 'var(--theme-primary)' },
  expert: { label: 'Expert', color: 'var(--theme-warning)' },
};

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return ''; }
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

// ─── SVG icons ─────────────────────────────────────────────────────────────────

const SearchIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
  </svg>
);

const DocIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
  </svg>
);

const EyeIcon = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const PlayIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <path d="M3 18.5v-13c0-.83.95-1.3 1.6-.8l11 6.5c.6.35.6 1.25 0 1.6l-11 6.5c-.65.5-1.6.03-1.6-.8z" />
  </svg>
);

const PersonAddIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <line x1="19" y1="8" x2="19" y2="14" />
    <line x1="22" y1="11" x2="16" y2="11" />
  </svg>
);

const BriefcaseIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <rect x="2" y="7" width="20" height="14" rx="2" />
    <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
  </svg>
);

const GlobeIcon = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <circle cx="12" cy="12" r="10" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
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

  const displayName = profile.full_name ?? `@${username}`;
  const firstName = profile.full_name?.split(' ')[0] ?? username;
  const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://public-reports-three.vercel.app';
  const PLAY_STORE_URL = process.env.DEEPDIVE_PLAY_STORE_URL ?? '#';

  const initials = displayName
    .split(' ').map((w: string) => w[0] ?? '').join('').slice(0, 2).toUpperCase();

  return (
    <Suspense fallback={<ProfilePageLoading />}>
      <>
        {/* JSON-LD */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'Person',
              name: displayName,
              url: `${APP_URL}/u/${username}`,
              image: profile.avatar_url ?? undefined,
              description: profile.bio ?? undefined,
            }),
          }}
        />

        <style dangerouslySetInnerHTML={{ __html: `
          .text-gradient {
            background: linear-gradient(135deg, var(--theme-gradient-primary-1), var(--theme-gradient-primary-2));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
          }
          .tap-btn {
            -webkit-tap-highlight-color: transparent;
            touch-action: manipulation;
            user-select: none;
            cursor: pointer;
            transition: all 0.2s ease;
          }
          .tap-btn:active {
            opacity: 0.7;
            transform: scale(0.97);
          }
          .card {
            background: var(--theme-background-card);
            border: 1px solid var(--theme-border);
            border-radius: 14px;
            transition: background 0.3s ease, border-color 0.3s ease;
          }
          .card-elevated {
            background: var(--theme-background-elevated);
            border: 1px solid var(--theme-border);
            border-radius: 14px;
            transition: background 0.3s ease, border-color 0.3s ease;
          }
          .card-brand {
            background: linear-gradient(135deg, var(--theme-background-elevated), var(--theme-background-card));
            border: 1px solid var(--theme-primary);
            border-radius: 20px;
            transition: background 0.3s ease, border-color 0.3s ease;
          }
          .depth-chip {
            padding: 2px 10px;
            border-radius: 999px;
            font-size: 0.63rem;
            font-weight: 700;
          }
          .report-card:hover {
            border-color: var(--theme-primary);
            transform: translateY(-3px);
            box-shadow: 0 8px 32px rgba(108,99,255,0.12);
          }
          .report-card:hover .report-title {
            color: var(--theme-primary);
          }
          @media (max-width: 640px) {
            .profile-grid {
              grid-template-columns: 1fr !important;
              gap: 20px !important;
            }
            .profile-sidebar {
              position: relative !important;
              top: 0 !important;
            }
          }
          @media (prefers-reduced-motion: reduce) {
            *, *::before, *::after {
              animation-duration: 0.01ms !important;
              transition-duration: 0.01ms !important;
            }
          }
        ` }} />

        <div style={{ 
          minHeight: '100vh', 
          background: 'var(--theme-background)',
          color: 'var(--theme-text-primary)'
        }}>

          {/* ─── Navbar ─── */}
          <header
            className="sticky top-0 z-40 px-4 py-3 transition-all duration-300"
            style={{
              background: 'var(--theme-background)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              borderBottom: '1px solid var(--theme-border)',
            }}
          >
            <div style={{
              maxWidth: '1120px',
              margin: '0 auto',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
            }}>
              <Link
                href="/"
                className="tap-btn"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  textDecoration: 'none',
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    overflow: 'hidden',
                    background: '#FFFFFF',
                    border: '1px solid var(--theme-border)',
                  }}
                >
                  <Image src="/icon.png" alt="DeepDive AI" width={28} height={28} style={{ objectFit: 'contain' }} priority />
                </div>
                <span style={{
                  color: 'var(--theme-text-primary)',
                  fontWeight: 800,
                  fontSize: '0.85rem',
                }}>
                  DeepDive <span className="text-gradient">AI</span>
                </span>
              </Link>

              <div style={{ flex: 1, minWidth: 8 }} />

              {/* ─── Navbar Actions ─── */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                flexShrink: 0,
              }}>
                {/* Theme Toggle - Left of Discover button */}
                <ThemeToggle variant="navbar" size="sm" />
                
                {/* Discover Button */}
                <Link
                  href="/discover"
                  className="tap-btn"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '6px 12px',
                    borderRadius: 10,
                    background: 'var(--theme-background-elevated)',
                    border: '1px solid var(--theme-border)',
                    color: 'var(--theme-text-muted)',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    textDecoration: 'none',
                    transition: 'all 0.2s ease',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <SearchIcon />
                  <span className="hidden sm:inline">Discover</span>
                </Link>
              </div>
            </div>
          </header>

          <div style={{ maxWidth: '1120px', margin: '0 auto', padding: '32px 20px 100px' }}>
            <div className="profile-grid" style={{
              display: 'grid',
              gridTemplateColumns: '288px 1fr',
              gap: '24px',
              alignItems: 'start',
            }}>
              {/* ─── Left sidebar: Profile ─── */}
              <aside className="profile-sidebar">
                <div
                  className="card"
                  style={{
                    overflow: 'hidden',
                    position: 'sticky',
                    top: '72px',
                  }}
                >
                  <div
                    style={{
                      height: 72,
                      background: 'linear-gradient(135deg, var(--theme-background-elevated) 0%, var(--theme-background-card) 100%)',
                      position: 'relative',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        background: 'radial-gradient(ellipse 80% 120% at 50% 110%, var(--theme-primary) 0%, transparent 65%)',
                        opacity: 0.15,
                      }}
                    />
                  </div>

                  <div style={{ padding: '14px 20px 0', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                    <div
                      style={{
                        width: 74,
                        height: 74,
                        borderRadius: '50%',
                        border: '3px solid var(--theme-background-card)',
                        background: 'var(--theme-background)',
                        flexShrink: 0,
                        overflow: 'hidden',
                      }}
                    >
                      {profile.avatar_url ? (
                        <img src={profile.avatar_url} alt={displayName} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                      ) : (
                        <div
                          style={{
                            width: '100%',
                            height: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: 'linear-gradient(135deg, var(--theme-primary), var(--theme-secondary))',
                            color: 'var(--theme-background-card)',
                            fontWeight: 800,
                            fontSize: '1.6rem',
                            letterSpacing: '-0.02em',
                          }}
                        >
                          {initials || '?'}
                        </div>
                      )}
                    </div>
                    <a
                      href={PLAY_STORE_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="tap-btn"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '8px 16px',
                        borderRadius: '999px',
                        background: 'linear-gradient(135deg, var(--theme-primary), var(--theme-secondary))',
                        color: 'var(--theme-background-card)',
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        whiteSpace: 'nowrap',
                        flexShrink: 0,
                        marginTop: 4,
                        boxShadow: '0 2px 12px var(--theme-primary)',
                        textDecoration: 'none',
                      }}
                    >
                      <PersonAddIcon />
                      Follow
                    </a>
                  </div>

                  <div style={{ padding: '12px 20px 22px' }}>
                    <h1 style={{ fontSize: '1.18rem', fontWeight: 800, color: 'var(--theme-text-primary)', letterSpacing: '-0.015em', lineHeight: 1.2, marginBottom: 2 }}>
                      {displayName}
                    </h1>
                    <p style={{ color: 'var(--theme-primary)', fontSize: '0.8rem', marginBottom: 10 }}>@{username}</p>

                    {profile.occupation && (
                      <p style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--theme-text-secondary)', fontSize: '0.75rem', marginBottom: 10 }}>
                        <BriefcaseIcon />
                        {profile.occupation}
                      </p>
                    )}

                    {profile.bio && <p style={{ color: 'var(--theme-text-secondary)', fontSize: '0.8rem', lineHeight: 1.65, marginBottom: 14 }}>{profile.bio}</p>}

                    {(profile.interests?.length ?? 0) > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 16 }}>
                        {profile.interests!.slice(0, 8).map(tag => (
                          <span
                            key={tag}
                            className="tap-btn"
                            style={{
                              padding: '3px 10px',
                              borderRadius: '999px',
                              background: 'var(--theme-primary)',
                              border: '1px solid var(--theme-primary)',
                              color: 'var(--theme-background-card)',
                              fontSize: '0.68rem',
                              fontWeight: 600,
                            }}
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
                      {[
                        { label: 'Followers', value: formatCount(profile.follower_count) },
                        { label: 'Following', value: formatCount(profile.following_count) },
                        { label: 'Reports', value: String(reports.length) },
                        { label: 'Views', value: formatCount(profile.total_views) },
                      ].map(s => (
                        <div
                          key={s.label}
                          className="card-elevated"
                          style={{
                            padding: '10px 12px',
                            textAlign: 'center',
                          }}
                        >
                          <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--theme-text-primary)', lineHeight: 1 }}>
                            {s.value}
                          </div>
                          <div style={{ fontSize: '0.6rem', color: 'var(--theme-text-muted)', marginTop: 3, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                            {s.label}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Download CTA */}
                <div
                  className="card-brand"
                  style={{
                    marginTop: 16,
                    padding: '24px 20px',
                    textAlign: 'center',
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                >
                  <div style={{ position: 'relative' }}>
                    <div
                      style={{
                        width: 50,
                        height: 50,
                        borderRadius: 14,
                        margin: '0 auto 12px',
                        background: 'linear-gradient(135deg, var(--theme-primary), var(--theme-secondary))',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 0 28px var(--theme-primary)',
                      }}
                    >
                      <SearchIcon />
                    </div>
                    <h3 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--theme-text-primary)', letterSpacing: '-0.01em', marginBottom: 6, lineHeight: 1.3 }}>
                      Follow {firstName} on DeepDive
                    </h3>
                    <p style={{ color: 'var(--theme-text-secondary)', fontSize: '0.75rem', lineHeight: 1.6, marginBottom: 16 }}>
                      Get notified when {firstName} publishes new AI research — plus run your own reports free.
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                      <a
                        href={PLAY_STORE_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="tap-btn"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 9,
                          padding: '11px 20px',
                          borderRadius: 11,
                          background: 'linear-gradient(135deg, var(--theme-primary), var(--theme-secondary))',
                          color: 'var(--theme-background-card)',
                          fontWeight: 700,
                          fontSize: '0.85rem',
                          textDecoration: 'none',
                          boxShadow: '0 4px 16px var(--theme-primary)',
                        }}
                      >
                        <PlayIcon />
                        <div>
                          <div style={{ fontSize: '0.58rem', opacity: 0.7, lineHeight: 1 }}>Get it on</div>
                          <div style={{ lineHeight: 1.2 }}>Google Play</div>
                        </div>
                      </a>
                      <p style={{ fontSize: '0.67rem', color: 'var(--theme-text-muted)' }}>🎁 Free · 20 credits on signup</p>
                    </div>
                  </div>
                </div>
              </aside>

              {/* ─── Right: Reports ─── */}
              <main>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <h2 style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '1rem', fontWeight: 700, color: 'var(--theme-text-primary)' }}>
                    <span
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 8,
                        flexShrink: 0,
                        background: 'linear-gradient(135deg, var(--theme-primary), var(--theme-secondary))',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <DocIcon />
                    </span>
                    Published Reports
                  </h2>
                  {reports.length > 0 && (
                    <span
                      style={{
                        padding: '2px 10px',
                        borderRadius: '999px',
                        background: 'var(--theme-primary)',
                        border: '1px solid var(--theme-primary)',
                        color: 'var(--theme-background-card)',
                        fontSize: '0.68rem',
                        fontWeight: 700,
                      }}
                    >
                      {reports.length}
                    </span>
                  )}
                </div>

                {reports.length === 0 ? (
                  <div
                    className="card"
                    style={{
                      textAlign: 'center',
                      padding: '48px 20px',
                      border: '1px dashed var(--theme-border)',
                    }}
                  >
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 12,
                        background: 'var(--theme-background-elevated)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        margin: '0 auto 14px',
                      }}
                    >
                      <DocIcon />
                    </div>
                    <p style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--theme-text-primary)', marginBottom: 5 }}>
                      No public reports yet
                    </p>
                    <p style={{ fontSize: '0.77rem', color: 'var(--theme-text-muted)', lineHeight: 1.6, maxWidth: 260, margin: '0 auto' }}>
                      {displayName} hasn&apos;t published any research reports publicly yet.
                    </p>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gap: 11 }}>
                    {reports.map(report => {
                      const dc = DEPTH_CONFIG[report.depth] ?? DEPTH_CONFIG.deep;
                      return (
                        <div
                          key={report.share_id}
                          className="card report-card"
                          style={{
                            overflow: 'hidden',
                            transition: 'all 0.3s ease',
                          }}
                        >
                          <Link
                            href={`/r/${report.share_id}`}
                            className="tap-btn"
                            style={{
                              display: 'block',
                              padding: '14px 16px',
                              textDecoration: 'none',
                              color: 'inherit',
                              position: 'relative',
                              zIndex: 1,
                            }}
                          >
                            <div style={{ height: 3, background: dc.color, opacity: 0.65 }} />

                            <h3
                              className="report-title"
                              style={{
                                fontSize: '0.88rem',
                                fontWeight: 700,
                                color: 'var(--theme-text-primary)',
                                lineHeight: 1.45,
                                marginBottom: 6,
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden',
                                transition: 'color 0.2s ease',
                              }}
                            >
                              {report.title}
                            </h3>

                            {report.executive_summary && (
                              <p
                                style={{
                                  color: 'var(--theme-text-secondary)',
                                  fontSize: '0.74rem',
                                  lineHeight: 1.6,
                                  marginBottom: 9,
                                  display: '-webkit-box',
                                  WebkitLineClamp: 2,
                                  WebkitBoxOrient: 'vertical',
                                  overflow: 'hidden',
                                }}
                              >
                                {report.executive_summary}
                              </p>
                            )}

                            {/* Tags as non-clickable spans - no nested <a> tags! */}
                            {report.tags.length > 0 && (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 9 }}>
                                {report.tags.slice(0, 3).map(tag => (
                                  <span
                                    key={tag}
                                    style={{
                                      padding: '2px 10px',
                                      background: 'var(--theme-primary)',
                                      border: '1px solid var(--theme-primary)',
                                      borderRadius: '999px',
                                      fontSize: '0.63rem',
                                      color: 'var(--theme-background-card)',
                                      fontWeight: 600,
                                      pointerEvents: 'none',
                                    }}
                                  >
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            )}

                            <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                              <span
                                className="depth-chip"
                                style={{
                                  background: dc.color,
                                  color: 'var(--theme-background-card)',
                                  border: `1px solid ${dc.color}`,
                                }}
                              >
                                {dc.label}
                              </span>

                              {report.view_count > 0 && (
                                <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: '0.68rem', color: 'var(--theme-text-secondary)' }}>
                                  <EyeIcon />
                                  {formatCount(report.view_count)}
                                </span>
                              )}

                              {report.sources_count > 0 && (
                                <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: '0.68rem', color: 'var(--theme-text-secondary)' }}>
                                  <GlobeIcon />
                                  {report.sources_count}
                                </span>
                              )}

                              <span style={{ fontSize: '0.63rem', color: 'var(--theme-text-muted)', marginLeft: 'auto' }}>
                                {formatDate(report.created_at)}
                              </span>
                            </div>
                          </Link>
                        </div>
                      );
                    })}
                  </div>
                )}
              </main>

            </div>
          </div>
        </div>

        {/* Sticky footer */}
        <footer
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 50,
            background: 'var(--theme-background)',
            backdropFilter: 'blur(18px)',
            WebkitBackdropFilter: 'blur(18px)',
            borderTop: '1px solid var(--theme-border)',
            padding: '10px 16px',
          }}
        >
          <div style={{ maxWidth: '1120px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  flexShrink: 0,
                  background: '#FFFFFF',
                  border: '1px solid var(--theme-border)',
                  overflow: 'hidden',
                }}
              >
                <Image src="/icon.png" alt="DeepDive AI" width={28} height={28} style={{ objectFit: 'contain' }} />
              </div>
              <div>
                <p style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--theme-text-primary)', lineHeight: 1 }}>
                  DeepDive <span className="text-gradient">AI</span>
                </p>
                <p style={{ fontSize: '0.6rem', color: 'var(--theme-text-muted)', marginTop: 2, lineHeight: 1 }}>
                  Follow {displayName} &amp; run your own research
                </p>
              </div>
            </div>
            <a
              href={PLAY_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="tap-btn"
              style={{
                padding: '8px 16px',
                borderRadius: '999px',
                background: 'linear-gradient(135deg, var(--theme-primary), var(--theme-secondary))',
                color: 'var(--theme-background-card)',
                fontSize: '0.75rem',
                fontWeight: 700,
                whiteSpace: 'nowrap',
                flexShrink: 0,
                textDecoration: 'none',
                boxShadow: '0 2px 12px var(--theme-primary)',
              }}
            >
              Get the App
            </a>
          </div>
        </footer>
      </>
    </Suspense>
  );
}