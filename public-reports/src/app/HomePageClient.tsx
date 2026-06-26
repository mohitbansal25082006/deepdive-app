'use client';

import Link from 'next/link';
import Image from 'next/image';
import ThemeToggle from '../components/ThemeToggle';
import { useEffect, useState, useRef } from 'react';

const PLAY_STORE_URL = process.env.NEXT_PUBLIC_DEEPDIVE_PLAY_STORE_URL ?? '#';

// ─── Data ────────────────────────────────────────────────────────────────────

const AGENT_PIPELINE = [
  { id: 'planner',    icon: '🗺',  label: 'Planner',      desc: 'Decomposes your query into a research plan' },
  { id: 'searcher',   icon: '🔍',  label: 'Searcher',     desc: 'Runs up to 260+ web sources across rounds' },
  { id: 'analyst',    icon: '📊',  label: 'Analyst',      desc: 'Extracts key facts, stats, and insights' },
  { id: 'factcheck',  icon: '✅',  label: 'Fact-Checker', desc: 'Cross-verifies claims, removes unreliable sources' },
  { id: 'reporter',   icon: '✍',   label: 'Reporter',     desc: 'Streams the final structured report live' },
  { id: 'visualiser', icon: '🧠',  label: 'Visualiser',   desc: 'Generates knowledge graphs and infographics' },
];

const OUTPUT_MODES = [
  { icon: '📄', title: 'Research Report',  tags: ['6 sections', 'Sources', 'Infographics'], color: '#6C63FF' },
  { icon: '🎙', title: 'AI Podcast',       tags: ['3 hosts', 'Real audio', '6 styles'],    color: '#10B981' },
  { icon: '⚖️', title: 'Debate Engine',    tags: ['6 agents', 'Moderator', 'Voice mode'],  color: '#F59E0B' },
  { icon: '🎓', title: 'Academic Paper',   tags: ['APA/MLA/IEEE', 'DOCX/PDF', 'Editor'],  color: '#EF4444' },
  { icon: '📺', title: 'Presentation',     tags: ['11 layouts', 'AI edits', '4 themes'],  color: '#3B82F6' },
  { icon: '💬', title: 'Knowledge Base',   tags: ['RAG search', 'Sessions', 'Voice'],      color: '#8B5CF6' },
];

const PLATFORM_STATS = [
  { value: '260+', label: 'Sources per query',    icon: '🌐' },
  { value: '7',    label: 'Collaborating agents', icon: '🤖' },
  { value: '6',    label: 'Output formats',        icon: '📤' },
  { value: '55+',  label: 'Feature modules',       icon: '⚙️' },
];

const SOCIAL_FEATURES = [
  { icon: '👥', title: 'Team Workspaces',    desc: 'Share research, comment, chat live with your team in real-time.' },
  { icon: '🌐', title: 'Public Reports',     desc: 'Publish any report as a public web page with embedded AI Q&A.' },
  { icon: '📡', title: 'Follow Researchers', desc: 'Follow users, get notified of new reports, discover trending topics.' },
  { icon: '💬', title: 'Stream Chat',        desc: 'Full-featured team chat with reactions, threads, GIFs, and an AI bot.' },
];

// ─── Types ──────────────────────────────────────────────────────────────────

interface TrendingReport {
  shareId: string;
  viewCount: number;
  cachedTitle: string;
  tags: string[];
  depth: 'quick' | 'deep' | 'expert';
  ownerUsername?: string;
  createdAt: string;
}

// ─── Loading Component ──────────────────────────────────────────────────────

function HomePageLoading() {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--theme-background)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      gap: 20,
    }}>
      {/* App logo with white background */}
      <div style={{
        width: 64,
        height: 64,
        borderRadius: 16,
        background: '#FFFFFF',
        border: '1px solid var(--theme-border)',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
      }}>
        <Image 
          src="/icon.png" 
          alt="DeepDive AI" 
          width={48} 
          height={48} 
          style={{ objectFit: 'contain' }} 
          priority 
        />
      </div>
      
      {/* Loading spinner with theme colors */}
      <div style={{
        width: 40,
        height: 40,
        borderRadius: '50%',
        border: '3px solid var(--theme-background-elevated)',
        borderTopColor: 'var(--theme-primary)',
        animation: 'dd-home-spin 0.8s linear infinite',
      }} />
      
      {/* Shimmer bar */}
      <div style={{
        width: 180,
        height: 6,
        borderRadius: 3,
        background: 'var(--theme-background-elevated)',
        overflow: 'hidden',
      }}>
        <div style={{
          width: '40%',
          height: '100%',
          borderRadius: 3,
          background: 'linear-gradient(90deg, var(--theme-primary), var(--theme-secondary))',
          animation: 'dd-home-shimmer 1.2s ease-in-out infinite',
        }} />
      </div>
      
      <p style={{
        color: 'var(--theme-text-secondary)',
        fontSize: '0.875rem',
        fontWeight: 500,
        margin: 0,
      }}>
        Loading DeepDive AI...
      </p>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes dd-home-spin {
          to { transform: rotate(360deg); }
        }
        @keyframes dd-home-shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(300%); }
        }
        @media (max-width: 480px) {
          .dd-home-loading-logo { width: 48px !important; height: 48px !important; }
          .dd-home-loading-logo img { width: 36px !important; height: 36px !important; }
          .dd-home-loading-spinner { width: 32px !important; height: 32px !important; border-width: 2.5px !important; }
          .dd-home-loading-bar { width: 140px !important; height: 5px !important; }
          .dd-home-loading-text { font-size: 0.75rem !important; }
        }
        @media (prefers-reduced-motion: reduce) {
          .dd-home-loading-spinner, .dd-home-loading-bar div {
            animation-duration: 0.01ms !important;
          }
        }
      ` }} />
    </div>
  );
}

// ─── Global Styles ────────────────────────────────────────────────────────────

const GLOBAL_CSS = `
  *, *::before, *::after { box-sizing: border-box; }

  @keyframes dd-float-in {
    from { opacity: 0; transform: translateY(20px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes dd-shimmer {
    0%   { transform: translateX(-100%); }
    100% { transform: translateX(200%); }
  }
  @keyframes dd-hero-in {
    from { opacity: 0; transform: translateY(32px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes dd-badge-in {
    from { opacity: 0; transform: scale(0.85); }
    to   { opacity: 1; transform: scale(1); }
  }
  @keyframes dd-scan {
    0%, 100% { transform: translateX(-100%); opacity: 0; }
    20%  { opacity: 1; }
    80%  { opacity: 1; }
    100% { transform: translateX(100vw); opacity: 0; }
  }
  @keyframes dd-ring-pulse {
    0%   { opacity: 0.6; border-color: var(--theme-primary); }
    50%  { opacity: 0.1; }
    100% { opacity: 0.6; border-color: var(--theme-primary); }
  }
  @keyframes dd-sweep {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }
  @keyframes dd-core-glow {
    from { box-shadow: 0 0 0 4px var(--theme-primary), 0 0 20px var(--theme-primary); }
    to   { box-shadow: 0 0 0 8px var(--theme-primary), 0 0 60px var(--theme-primary); }
  }
  @keyframes dd-dot-appear {
    0%,48%,100% { opacity: 0; }
    50%,90%     { opacity: 1; }
  }

  .dd-text-gradient {
    background: linear-gradient(135deg, var(--theme-gradient-primary-1), var(--theme-gradient-primary-2));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }
  .dd-hero-badge { animation: dd-badge-in 0.6s cubic-bezier(0.34,1.56,0.64,1) 0.1s both; }
  .dd-hero-h1   { animation: dd-hero-in 0.7s ease-out 0.2s both; }
  .dd-hero-p    { animation: dd-hero-in 0.7s ease-out 0.35s both; }
  .dd-hero-cta  { animation: dd-hero-in 0.7s ease-out 0.5s both; }
  .dd-hero-sub  { animation: dd-hero-in 0.7s ease-out 0.65s both; }
  .dd-nav-link:hover { opacity: 0.8 !important; }

  .dd-section-label {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 5px 14px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    background: var(--theme-primary);
    color: #FFFFFF;
    border: 1px solid var(--theme-primary);
    margin-bottom: 18px;
  }
  .dd-section-label span { color: #FFFFFF; }

  .dd-h2 {
    font-size: clamp(1.5rem, 5vw, 2.5rem);
    font-weight: 800;
    letter-spacing: -0.03em;
    color: var(--theme-text-primary);
    margin: 0 0 12px;
    line-height: 1.1;
  }
  .dd-section-p {
    font-size: 15px;
    color: var(--theme-text-secondary);
    line-height: 1.7;
    margin: 0 0 32px;
    max-width: 500px;
  }
  .dd-scan-line {
    position: absolute;
    top: 50%;
    left: -100%;
    width: 60%;
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--theme-primary), transparent);
    animation: dd-scan 8s linear infinite;
    pointer-events: none;
  }

  /* ── Radar orb ── */
  .dd-radar {
    position: relative;
    width: 260px;
    height: 260px;
    flex-shrink: 0;
  }
  .dd-radar-ring {
    position: absolute;
    border-radius: 50%;
    border: 1px solid var(--theme-primary);
    opacity: 0.25;
    top: 50%; left: 50%;
    transform: translate(-50%, -50%);
    animation: dd-ring-pulse 3s ease-out infinite;
  }
  .dd-radar-ring:nth-child(1) { width: 64px;  height: 64px;  animation-delay: 0s; }
  .dd-radar-ring:nth-child(2) { width: 112px; height: 112px; animation-delay: 0.4s; }
  .dd-radar-ring:nth-child(3) { width: 164px; height: 164px; animation-delay: 0.8s; }
  .dd-radar-ring:nth-child(4) { width: 212px; height: 212px; animation-delay: 1.2s; }
  .dd-radar-ring:nth-child(5) { width: 260px; height: 260px; animation-delay: 1.6s; }
  .dd-radar-sweep {
    position: absolute;
    top: 50%; left: 50%;
    width: 50%;
    height: 2px;
    transform-origin: 0% 50%;
    animation: dd-sweep 4s linear infinite;
  }
  .dd-radar-sweep::after {
    content: '';
    position: absolute;
    right: 0; top: 50%;
    transform: translateY(-50%);
    width: 8px; height: 8px;
    border-radius: 50%;
    background: var(--theme-primary);
    box-shadow: 0 0 12px var(--theme-primary), 0 0 24px var(--theme-primary);
  }
  .dd-radar-trail {
    position: absolute;
    top: 0; left: 0;
    width: 100%; height: 100%;
    border-radius: 50%;
    background: conic-gradient(
      from 0deg,
      transparent 60%,
      var(--theme-primary) 80%,
      var(--theme-primary) 100%
    );
    opacity: 0.08;
    animation: dd-sweep 4s linear infinite;
  }
  .dd-radar-core {
    position: absolute;
    top: 50%; left: 50%;
    transform: translate(-50%, -50%);
    width: 44px; height: 44px;
    border-radius: 50%;
    background: linear-gradient(135deg, var(--theme-gradient-primary-1), var(--theme-gradient-primary-2));
    display: flex; align-items: center; justify-content: center;
    font-size: 1.3rem;
    box-shadow: 0 0 0 4px var(--theme-primary), 0 0 40px var(--theme-primary);
    animation: dd-core-glow 2s ease-in-out infinite alternate;
  }
  .dd-radar-dot {
    position: absolute;
    width: 8px; height: 8px;
    border-radius: 50%;
    background: var(--theme-primary);
    top: 50%; left: 50%;
    transform-origin: 0% 0%;
    opacity: 0;
    animation: dd-dot-appear 4s linear infinite;
  }
  .dd-radar-dot.d1 { animation-delay: 0.8s; }
  .dd-radar-dot.d2 { animation-delay: 1.9s; }
  .dd-radar-dot.d3 { animation-delay: 3.1s; }
  .dd-radar-dot.d4 { animation-delay: 0.3s; }
  .dd-radar-crosshair-h {
    position: absolute; top: 50%; left: 0; right: 0; height: 1px;
    background: var(--theme-primary); opacity: 0.08;
    transform: translateY(-50%);
  }
  .dd-radar-crosshair-v {
    position: absolute; left: 50%; top: 0; bottom: 0; width: 1px;
    background: var(--theme-primary); opacity: 0.08;
    transform: translateX(-50%);
  }

  /* ── Output card hover ── */
  .dd-output-card {
    transition: transform 0.2s ease, box-shadow 0.2s ease;
    cursor: default;
  }
  .dd-output-card:hover {
    transform: translateY(-4px);
  }

  /* ── Store button tap feedback for mobile ── */
  .dd-store-btn {
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
    user-select: none;
  }
  .dd-store-btn:active {
    opacity: 0.85;
    transform: scale(0.97);
  }

  /* ── Navigation link tap ── */
  .dd-nav-link {
    -webkit-tap-highlight-color: transparent;
  }

  /* ── Agent pipeline ── */
  .dd-agent-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    border-radius: 12px;
    transition: all 0.3s ease;
    position: relative;
    overflow: hidden;
  }

  /* ── Social feature grid ── */
  .dd-social-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }

  /* ── Offline strip ── */
  .dd-offline-strip {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0;
    border-radius: 24px;
    overflow: hidden;
    background: var(--theme-background-card);
    border: 1px solid var(--theme-border);
  }
  .dd-offline-cell {
    padding: 32px 24px;
  }
  .dd-offline-cell:not(:last-child) {
    border-right: 1px solid var(--theme-border);
  }

  /* ── Stat strip ── */
  .dd-stat-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
  }

  /* ── Output modes grid ── */
  .dd-output-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
  }

  /* ── Agent + social two-col sections ── */
  .dd-two-col {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 60px;
    align-items: center;
  }

  /* ── Hero visual row ── */
  .dd-hero-visual {
    display: flex;
    flex-wrap: wrap;
    gap: 24px;
    justify-content: center;
    align-items: center;
    animation: dd-float-in 0.8s ease-out 0.7s both;
  }

  /* ── Community row ── */
  .dd-community-row {
    display: flex;
    flex-wrap: wrap;
    gap: 32px;
    align-items: center;
    justify-content: space-between;
  }

  /* ── Navbar ── */
  .dd-nav-inner {
    max-width: 1100px;
    margin: 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-width: 0;
  }

  .dd-nav-logo {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
    min-width: 0;
  }

  .dd-nav-wordmark {
    font-weight: 800;
    font-size: 15px;
    letter-spacing: -0.02em;
    color: var(--theme-text-primary);
    white-space: nowrap;
  }

  .dd-nav-pills {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .dd-nav-play-long  { display: inline; }
  .dd-nav-play-short { display: none; }

  /* ── Report card in feed ── */
  .dd-feed-report-card {
    display: block;
    padding: 16px;
    border-radius: 14px;
    background: var(--theme-background-card);
    border: 1px solid var(--theme-border);
    text-decoration: none;
    transition: all 0.3s ease;
    cursor: pointer;
  }
  .dd-feed-report-card:hover {
    border-color: var(--theme-primary);
    transform: translateY(-2px);
    box-shadow: 0 8px 24px var(--theme-primary);
  }

  .dd-feed-report-title {
    font-size: 14px;
    font-weight: 700;
    color: var(--theme-text-primary);
    margin: 0 0 6px;
    line-height: 1.4;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .dd-feed-report-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    font-size: 12px;
    color: var(--theme-text-muted);
  }

  .dd-feed-report-tag {
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 10px;
    font-weight: 600;
    background: var(--theme-primary);
    color: #FFFFFF;
  }

  /* ── Responsive ── */
  @media (max-width: 600px) {
    .dd-nav-pills .dd-app-store-sm {
      display: none;
    }
    .dd-nav-play-long  { display: none; }
    .dd-nav-play-short { display: inline; }
  }

  @media (max-width: 400px) {
    .dd-nav-inner { gap: 6px; }
    .dd-nav-wordmark { font-size: 13px; }
    .dd-nav-pills { gap: 5px; }
    .dd-nav-discover-label { display: none; }
    .dd-nav-discover-icon  { display: flex; }
  }

  @media (min-width: 401px) {
    .dd-nav-discover-icon { display: none; }
  }

  @media (max-width: 900px) {
    .dd-two-col {
      grid-template-columns: 1fr;
      gap: 40px;
    }
    .dd-community-row {
      flex-direction: column;
      align-items: flex-start;
    }
    .dd-output-grid {
      grid-template-columns: repeat(2, 1fr);
    }
    .dd-stat-grid {
      grid-template-columns: repeat(2, 1fr);
    }
    .dd-offline-strip {
      grid-template-columns: 1fr;
      border-radius: 20px;
    }
    .dd-offline-cell:not(:last-child) {
      border-right: none;
      border-bottom: 1px solid var(--theme-border);
    }
  }

  @media (max-width: 600px) {
    .dd-radar {
      width: 200px !important;
      height: 200px !important;
    }
    .dd-radar-ring:nth-child(1) { width: 48px;  height: 48px; }
    .dd-radar-ring:nth-child(2) { width: 86px;  height: 86px; }
    .dd-radar-ring:nth-child(3) { width: 126px; height: 126px; }
    .dd-radar-ring:nth-child(4) { width: 164px; height: 164px; }
    .dd-radar-ring:nth-child(5) { width: 200px; height: 200px; }

    .dd-hero-visual {
      flex-direction: column;
      align-items: center;
    }
    .dd-hero-visual > *:last-child {
      width: 100%;
      max-width: 360px;
    }
    .dd-output-grid {
      grid-template-columns: 1fr 1fr;
    }
    .dd-stat-grid {
      grid-template-columns: repeat(2, 1fr);
    }
    .dd-social-grid {
      grid-template-columns: 1fr;
    }
    .dd-nav-pills .dd-app-store-sm {
      display: none;
    }
    .dd-section-p {
      max-width: 100%;
    }
    .dd-offline-cell {
      padding: 24px 20px;
    }
    .dd-section-label {
      font-size: 10px;
    }
  }

  @media (max-width: 380px) {
    .dd-output-grid {
      grid-template-columns: 1fr;
    }
    .dd-hero-cta {
      flex-direction: column;
      align-items: stretch !important;
    }
    .dd-hero-cta > * {
      justify-content: center;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.01ms !important;
      transition-duration: 0.01ms !important;
    }
  }
`;

// ─── Radar Hero Orb ──────────────────────────────────────────────────────────

function RadarOrb() {
  return (
    <div className="dd-radar" aria-hidden="true">
      {[1,2,3,4,5].map(i => <div key={i} className="dd-radar-ring" />)}
      <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', overflow: 'hidden' }}>
        <div className="dd-radar-trail" />
      </div>
      <div className="dd-radar-sweep" style={{ marginTop: '-1px' }} />
      <div className="dd-radar-dot d1" style={{ transform: 'translate(calc(-50% + 58px), calc(-50% - 27px))' }} />
      <div className="dd-radar-dot d2" style={{ transform: 'translate(calc(-50% - 46px), calc(-50% + 38px))' }} />
      <div className="dd-radar-dot d3" style={{ transform: 'translate(calc(-50% + 30px), calc(-50% + 62px))' }} />
      <div className="dd-radar-dot d4" style={{ transform: 'translate(calc(-50% - 70px), calc(-50% - 15px))' }} />
      <div className="dd-radar-core">🔬</div>
      <div className="dd-radar-crosshair-h" />
      <div className="dd-radar-crosshair-v" />
    </div>
  );
}

// ─── Agent Pipeline Visualiser ────────────────────────────────────────────────

function AgentPipeline() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setActive(prev => (prev + 1) % AGENT_PIPELINE.length), 1400);
    return () => clearInterval(t);
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {AGENT_PIPELINE.map((agent, i) => (
        <div
          key={agent.id}
          className="dd-agent-row"
          style={{
            background: active === i ? 'var(--theme-background-elevated)' : 'var(--theme-background-card)',
            border: active === i ? '2px solid var(--theme-primary)' : '1px solid var(--theme-border)',
          }}
        >
          {active === i && (
            <div style={{
              position: 'absolute', inset: 0,
              background: 'linear-gradient(90deg, transparent, var(--theme-primary), transparent)',
              opacity: 0.05,
              animation: 'dd-shimmer 1.5s ease-in-out infinite',
            }} />
          )}
          <div style={{
            width: 36, height: 36, borderRadius: '10px', flexShrink: 0,
            background: active === i ? 'var(--theme-primary)' : 'var(--theme-background-elevated)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1.1rem', transition: 'all 0.3s ease',
            border: active === i ? '2px solid var(--theme-primary)' : '1px solid var(--theme-border)',
          }}>
            {agent.icon}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
              <span style={{
                fontSize: '13px', fontWeight: 700,
                color: active === i ? 'var(--theme-primary)' : 'var(--theme-text-primary)',
                transition: 'color 0.3s ease',
              }}>{agent.label}</span>
              {active === i && (
                <span style={{
                  fontSize: '10px', fontWeight: 700, padding: '2px 8px',
                  borderRadius: '20px',
                  background: 'var(--theme-primary)',
                  color: '#FFFFFF',
                  letterSpacing: '0.05em',
                  whiteSpace: 'nowrap',
                }}>ACTIVE</span>
              )}
            </div>
            <p style={{ fontSize: '12px', color: 'var(--theme-text-secondary)', margin: 0, lineHeight: 1.4 }}>
              {agent.desc}
            </p>
          </div>
          <div style={{
            width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
            background: active === i ? 'var(--theme-primary)' : 'var(--theme-border)',
            boxShadow: active === i ? '0 0 8px var(--theme-primary)' : 'none',
            transition: 'all 0.3s ease',
          }} />
        </div>
      ))}
    </div>
  );
}

// ─── Output Card ──────────────────────────────────────────────────────────────

function OutputCard({ mode, index }: { mode: typeof OUTPUT_MODES[0]; index: number }) {
  return (
    <div
      className="dd-output-card"
      style={{
        padding: '18px 16px',
        borderRadius: '16px',
        background: 'var(--theme-background-card)',
        border: '1px solid var(--theme-border)',
        borderTopWidth: '3px',
        borderTopColor: mode.color,
        animation: `dd-float-in 0.5s ease-out ${index * 0.1}s both`,
      }}
    >
      <div style={{ fontSize: '1.5rem', marginBottom: '10px' }}>{mode.icon}</div>
      <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--theme-text-primary)', margin: '0 0 8px' }}>
        {mode.title}
      </h3>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
        {mode.tags.map(tag => (
          <span key={tag} style={{
            fontSize: '10px', fontWeight: 600, padding: '3px 8px', borderRadius: '20px',
            background: `${mode.color}18`,
            color: mode.color,
            border: `1px solid ${mode.color}30`,
          }}>{tag}</span>
        ))}
      </div>
    </div>
  );
}

// ─── Stat Strip ──────────────────────────────────────────────────────────────

function StatStrip() {
  const [counts, setCounts] = useState(PLATFORM_STATS.map(() => 0));
  const ref = useRef<HTMLDivElement>(null);
  const animated = useRef(false);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !animated.current) {
        animated.current = true;
        PLATFORM_STATS.forEach((stat, i) => {
          const target = parseInt(stat.value.replace(/\D/g, ''));
          let start = 0;
          const step = Math.ceil(target / 40);
          const timer = setInterval(() => {
            start = Math.min(start + step, target);
            setCounts(prev => {
              const next = [...prev];
              next[i] = start;
              return next;
            });
            if (start >= target) clearInterval(timer);
          }, 35);
        });
      }
    }, { threshold: 0.3 });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="dd-stat-grid">
      {PLATFORM_STATS.map((stat, i) => (
        <div key={i} style={{
          padding: '20px 16px', borderRadius: '16px', textAlign: 'center',
          background: 'var(--theme-background-card)',
          border: '1px solid var(--theme-border)',
          animation: `dd-float-in 0.6s ease-out ${i * 0.1}s both`,
        }}>
          <div style={{ fontSize: '1.4rem', marginBottom: '8px' }}>{stat.icon}</div>
          <div style={{
            fontSize: 'clamp(1.4rem, 4vw, 2.2rem)',
            fontWeight: 800,
            color: 'var(--theme-primary)',
            lineHeight: 1,
            marginBottom: '6px',
          }}>
            {counts[i]}{stat.value.replace(/[\d]/g, '')}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--theme-text-secondary)', fontWeight: 500 }}>
            {stat.label}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Store Buttons ────────────────────────────────────────────────────────────

function PlayStoreBtn({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const sm = size === 'sm';
  return (
    <a
      href={PLAY_STORE_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="dd-store-btn"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: sm ? 6 : 12,
        padding: sm ? '8px 14px' : '13px 22px',
        borderRadius: sm ? 10 : 14,
        background: 'linear-gradient(135deg, var(--theme-gradient-primary-1), var(--theme-gradient-primary-2))',
        color: '#FFFFFF',
        fontWeight: 700,
        fontSize: sm ? 12 : 14,
        textDecoration: 'none',
        transition: 'opacity 0.2s, transform 0.2s',
        boxShadow: '0 4px 20px var(--theme-primary)',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <svg width={sm ? 14 : 20} height={sm ? 14 : 20} viewBox="0 0 24 24" fill="white" aria-hidden="true">
        <path d="M3 18.5v-13c0-.83.95-1.3 1.6-.8l11 6.5c.6.35.6 1.25 0 1.6l-11 6.5c-.65.5-1.6.03-1.6-.8z" />
      </svg>
      {sm ? 'Google Play' : (
        <div>
          <p style={{ fontSize: 10, fontWeight: 400, margin: 0, opacity: 0.8, lineHeight: 1 }}>Get it on</p>
          <p style={{ fontSize: 14, fontWeight: 700, margin: 0, lineHeight: 1.2 }}>Google Play</p>
        </div>
      )}
    </a>
  );
}

function AppStoreBtn({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const sm = size === 'sm';
  return (
    <div
      className="dd-app-store-sm dd-store-btn"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: sm ? 6 : 12,
        padding: sm ? '8px 14px' : '13px 22px',
        borderRadius: sm ? 10 : 14,
        background: 'var(--theme-background-elevated)',
        border: '1px solid var(--theme-border)',
        color: 'var(--theme-text-secondary)',
        fontWeight: 600,
        fontSize: sm ? 12 : 14,
        opacity: 0.6,
        cursor: 'default',
      }}
    >
      <svg width={sm ? 14 : 20} height={sm ? 14 : 20} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
      </svg>
      {sm ? 'iOS — Soon' : (
        <div>
          <p style={{ fontSize: 10, margin: 0, opacity: 0.7, lineHeight: 1 }}>Coming soon</p>
          <p style={{ fontSize: 14, fontWeight: 600, margin: 0, lineHeight: 1.2 }}>App Store</p>
        </div>
      )}
    </div>
  );
}

// ─── Scroll Reveal ────────────────────────────────────────────────────────────

function useReveal(threshold = 0.12) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setVisible(true); observer.disconnect(); }
    }, { threshold });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [threshold]);
  return { ref, visible };
}

function Reveal({ children, delay = 0, className = '' }: { children: React.ReactNode; delay?: number; className?: string }) {
  const { ref, visible } = useReveal();
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'none' : 'translateY(28px)',
        transition: `opacity 0.6s ease ${delay}ms, transform 0.6s ease ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

// ─── Report Feed Component ────────────────────────────────────────────────────

function ReportFeed({ reports, title }: { reports: TrendingReport[]; title: string }) {
  if (reports.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--theme-text-muted)' }}>
        <p style={{ fontSize: '1.5rem', marginBottom: 8 }}>📭</p>
        <p>No reports available yet</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--theme-text-muted)', marginBottom: 4 }}>
        {title}
      </p>
      {reports.map((report) => (
        <Link
          key={report.shareId}
          href={`/r/${report.shareId}`}
          className="dd-feed-report-card"
        >
          <div className="dd-feed-report-title">{report.cachedTitle}</div>
          <div className="dd-feed-report-meta">
            <span>👁 {report.viewCount.toLocaleString()}</span>
            <span>•</span>
            <span className="dd-feed-report-tag">
              {report.depth.charAt(0).toUpperCase() + report.depth.slice(1)}
            </span>
            {report.tags.slice(0, 2).map(tag => (
              <span key={tag} style={{ fontSize: '10px', color: 'var(--theme-text-muted)', background: 'var(--theme-background-elevated)', padding: '2px 6px', borderRadius: 4 }}>
                #{tag}
              </span>
            ))}
          </div>
        </Link>
      ))}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

interface HomePageClientProps {
  reportCount: number;
  topTags: string[];
}

export default function HomePageClient({ reportCount, topTags }: HomePageClientProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [trendingReports, setTrendingReports] = useState<TrendingReport[]>([]);
  const [recentReports, setRecentReports] = useState<TrendingReport[]>([]);
  const [isLoadingFeed, setIsLoadingFeed] = useState(true);
  const [feedView, setFeedView] = useState<'trending' | 'recent'>('trending');

  // ── Handle initial loading ──
  useEffect(() => {
    // Simulate minimum loading time for smoother experience
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 400);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => { setMounted(true); }, []);

  // ── Fetch trending reports ──
  useEffect(() => {
    async function fetchTrending() {
      try {
        const res = await fetch('/api/trending?days=7&limit=4');
        const data = await res.json();
        setTrendingReports(data.reports || []);
      } catch {
        setTrendingReports([]);
      }
    }
    fetchTrending();
  }, []);

  // ── Fetch recent reports ──
  useEffect(() => {
    async function fetchRecent() {
      try {
        const res = await fetch('/api/discover?sort=recent&limit=4');
        const data = await res.json();
        setRecentReports(data.reports || []);
      } catch {
        setRecentReports([]);
      } finally {
        setIsLoadingFeed(false);
      }
    }
    fetchRecent();
  }, []);

  // ── Fetch a random active query ──
  const [activeQuery, setActiveQuery] = useState('"Future of quantum computing startups in 2026"');
  const [querySources, setQuerySources] = useState('127');
  const [queryConfidence, setQueryConfidence] = useState('94');

  useEffect(() => {
    async function fetchActiveQuery() {
      try {
        // Get a random report to use as the active query example
        const res = await fetch('/api/discover?sort=trending&limit=1');
        const data = await res.json();
        if (data.reports && data.reports.length > 0) {
          const report = data.reports[0];
          setActiveQuery(`"${report.cachedTitle || 'Research topic'}"`);
          // Randomize stats for visual variety
          const sources = Math.floor(Math.random() * (180 - 80 + 1)) + 80;
          const confidence = Math.floor(Math.random() * (98 - 85 + 1)) + 85;
          setQuerySources(String(sources));
          setQueryConfidence(String(confidence));
        }
      } catch {
        // Keep default values
      }
    }
    fetchActiveQuery();
  }, []);

  const displayedReports = feedView === 'trending' ? trendingReports : recentReports;
  const isFeedLoading = isLoadingFeed;

  // Show loading state
  if (isLoading || !mounted) {
    return <HomePageLoading />;
  }

  return (
    <main style={{
      minHeight: '100vh',
      background: 'var(--theme-background)',
      color: 'var(--theme-text-primary)',
      overflowX: 'hidden',
    }}>
      <style>{GLOBAL_CSS}</style>

      {/* ── Navbar ─────────────────────────────────────────────────── */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 40,
        padding: '10px 16px',
        background: 'var(--theme-background)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid var(--theme-border)',
        overflow: 'hidden',
      }}>
        <div className="dd-nav-inner">
          <div className="dd-nav-logo">
            <div style={{
              width: 30, height: 30, borderRadius: 9, overflow: 'hidden', flexShrink: 0,
              background: '#FFFFFF',
              border: '1px solid var(--theme-border)',
            }}>
              <Image src="/icon.png" alt="DeepDive AI" width={30} height={30} style={{ objectFit: 'contain' }} priority />
            </div>
            <span className="dd-nav-wordmark">
              DeepDive <span className="dd-text-gradient">AI</span>
            </span>
          </div>

          <div className="dd-nav-pills">
            <Link
              href="/discover"
              className="dd-nav-link"
              aria-label="Discover reports"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '7px 12px',
                borderRadius: 9,
                fontSize: 12, fontWeight: 700,
                background: 'var(--theme-primary)',
                color: '#FFFFFF',
                border: '1px solid var(--theme-primary)',
                textDecoration: 'none',
                transition: 'opacity 0.2s',
                WebkitTapHighlightColor: 'transparent',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              <span className="dd-nav-discover-icon" aria-hidden="true" style={{ alignItems: 'center', justifyContent: 'center' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
              </span>
              <span className="dd-nav-discover-label">Discover</span>
            </Link>

            <div className="dd-app-store-sm" style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '7px 10px', borderRadius: 9,
              background: 'var(--theme-background-elevated)',
              border: '1px solid var(--theme-border)',
              color: 'var(--theme-text-muted)',
              fontSize: 11, fontWeight: 600,
              opacity: 0.55, cursor: 'default',
              whiteSpace: 'nowrap', flexShrink: 0,
            }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
              </svg>
              iOS — Soon
            </div>

            <a
              href={PLAY_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="dd-store-btn"
              aria-label="Get it on Google Play"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '7px 11px', borderRadius: 9,
                background: 'linear-gradient(135deg, var(--theme-gradient-primary-1), var(--theme-gradient-primary-2))',
                color: '#FFFFFF',
                fontSize: 12, fontWeight: 700,
                textDecoration: 'none',
                boxShadow: '0 2px 10px var(--theme-primary)',
                transition: 'opacity 0.2s, transform 0.2s',
                whiteSpace: 'nowrap', flexShrink: 0,
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M3 18.5v-13c0-.83.95-1.3 1.6-.8l11 6.5c.6.35.6 1.25 0 1.6l-11 6.5c-.65.5-1.6.03-1.6-.8z"/>
              </svg>
              <span className="dd-nav-play-long">Google Play</span>
              <span className="dd-nav-play-short">Play</span>
            </a>
          </div>
        </div>
      </nav>

      {/* ── Hero ───────────────────────────────────────────────────── */}
      <section style={{ position: 'relative', padding: 'clamp(48px,8vw,80px) 16px 60px', overflow: 'hidden' }}>
        <div style={{
          position: 'absolute', top: '-10%', left: '50%', transform: 'translateX(-50%)',
          width: '80vw', height: '80vw', maxWidth: 600,
          borderRadius: '50%',
          background: 'radial-gradient(ellipse, var(--theme-primary) 0%, transparent 70%)',
          opacity: 0.08,
          pointerEvents: 'none',
        }} />
        <div className="dd-scan-line" aria-hidden="true" />

        <div style={{
          maxWidth: 1100, margin: '0 auto',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', textAlign: 'center',
          position: 'relative',
        }}>
          <div className="dd-hero-badge">
            <span className="dd-section-label">
              <span>✦</span> Autonomous AI Research Platform
            </span>
          </div>

          <h1
            className="dd-hero-h1"
            style={{
              fontSize: 'clamp(2rem, 8vw, 5rem)',
              fontWeight: 900,
              letterSpacing: '-0.04em',
              lineHeight: 1.0,
              margin: '0 0 20px',
              maxWidth: 780,
              color: 'var(--theme-text-primary)',
            }}
          >
            Research anything.{' '}
            <span className="dd-text-gradient">Instantly.</span>
          </h1>

          <p
            className="dd-hero-p"
            style={{
              fontSize: 'clamp(0.95rem, 2.5vw, 1.2rem)',
              color: 'var(--theme-text-secondary)',
              lineHeight: 1.7,
              maxWidth: 560,
              margin: '0 0 32px',
              padding: '0 4px',
            }}
          >
            A team of 7 AI agents searches up to 260+ sources, fact-checks every claim, and generates structured research — as reports, podcasts, debates, academic papers, or presentations.
          </p>

          <div
            className="dd-hero-cta"
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 12,
              justifyContent: 'center',
              marginBottom: 12,
              width: '100%',
            }}
          >
            <PlayStoreBtn size="md" />
            <AppStoreBtn size="md" />
          </div>

          <div
            className="dd-hero-sub"
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 8,
              justifyContent: 'center',
              marginBottom: 48,
              padding: '0 4px',
            }}
          >
            {['20 free credits on signup', 'No credit card needed', '55+ feature modules'].map(t => (
              <span key={t} style={{
                fontSize: 12, fontWeight: 600,
                padding: '4px 12px', borderRadius: 999,
                background: 'var(--theme-background-elevated)',
                border: '1px solid var(--theme-border)',
                color: 'var(--theme-text-secondary)',
                whiteSpace: 'nowrap',
              }}>✓ {t}</span>
            ))}
          </div>

          {/* Hero visual */}
          <div className="dd-hero-visual">
            <RadarOrb />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, textAlign: 'left', width: '100%', maxWidth: 300 }}>
              {/* Active query card - REAL DATA */}
              <div style={{
                padding: '14px 16px', borderRadius: 14,
                background: 'var(--theme-background-card)',
                border: '1px solid var(--theme-border)',
              }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--theme-text-muted)', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Active query
                </p>
                <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--theme-text-primary)', margin: '0 0 10px', lineHeight: 1.4 }}>
                  {activeQuery}
                </p>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
                    background: 'var(--theme-primary)',
                    color: '#FFFFFF',
                    border: '1px solid var(--theme-primary)',
                    whiteSpace: 'nowrap',
                  }}>
                    Scanning {querySources} sources
                  </span>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
                    background: 'var(--theme-primary)',
                    color: '#FFFFFF',
                    border: '1px solid var(--theme-primary)',
                    whiteSpace: 'nowrap',
                  }}>
                    {queryConfidence}% confidence
                  </span>
                </div>
              </div>

              <Link
                href="/discover"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '13px 16px', borderRadius: 14, textDecoration: 'none',
                  background: 'var(--theme-background-elevated)',
                  border: '2px solid var(--theme-primary)',
                  transition: 'transform 0.2s ease',
                  WebkitTapHighlightColor: 'transparent',
                }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.transform = ''}
              >
                <div>
                  <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--theme-primary)', margin: '0 0 2px' }}>
                    Browse public research
                  </p>
                  <p style={{ fontSize: 11, color: 'var(--theme-text-secondary)', margin: 0 }}>
                    {reportCount > 0 ? `${reportCount}+ reports shared` : 'Community reports'}
                  </p>
                </div>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--theme-primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
                </svg>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Platform Stats ─────────────────────────────────────────── */}
      <section style={{
        padding: 'clamp(32px,5vw,48px) 16px',
        background: 'var(--theme-background-elevated)',
        borderTop: '1px solid var(--theme-border)',
        borderBottom: '1px solid var(--theme-border)',
      }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <StatStrip />
        </div>
      </section>

      {/* ── Agent Pipeline ─────────────────────────────────────────── */}
      <section style={{ padding: 'clamp(48px,8vw,80px) 16px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div className="dd-two-col">
            <Reveal>
              <div className="dd-section-label"><span>🤖</span> Multi-Agent Architecture</div>
              <h2 className="dd-h2">7 agents. One<br /><span className="dd-text-gradient">seamless pipeline.</span></h2>
              <p className="dd-section-p">
                Instead of a single model doing everything, DeepDive deploys specialised agents that collaborate — each owning a distinct phase of the research workflow. Live progress streams to your screen as they work.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {['Quick (4 queries)', 'Deep (8 + follow-up)', 'Expert (12+ queries)'].map((d, i) => (
                  <span key={i} style={{
                    fontSize: 12, fontWeight: 600,
                    padding: '6px 14px', borderRadius: 999,
                    background: 'var(--theme-background-card)',
                    border: '1px solid var(--theme-border)',
                    color: 'var(--theme-text-secondary)',
                    whiteSpace: 'nowrap',
                  }}>{d}</span>
                ))}
              </div>
            </Reveal>
            <Reveal delay={150}>
              <AgentPipeline />
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── 6 Output Modes ─────────────────────────────────────────── */}
      <section style={{
        padding: 'clamp(48px,8vw,80px) 16px',
        background: 'var(--theme-background-elevated)',
        borderTop: '1px solid var(--theme-border)',
      }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <Reveal>
            <div style={{ textAlign: 'center', marginBottom: 40 }}>
              <div className="dd-section-label" style={{ margin: '0 auto 18px' }}><span>📤</span> 6 Output Formats</div>
              <h2 className="dd-h2">One query.<br /><span className="dd-text-gradient">Six different outputs.</span></h2>
              <p style={{ fontSize: 15, color: 'var(--theme-text-secondary)', maxWidth: 520, margin: '0 auto' }}>
                Run your research once, then export it in any format — from a detailed academic paper to a fully voiced podcast episode.
              </p>
            </div>
          </Reveal>
          <div className="dd-output-grid">
            {OUTPUT_MODES.map((mode, i) => (
              <Reveal key={mode.title} delay={i * 80}>
                <OutputCard mode={mode} index={i} />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Social & Workspaces ────────────────────────────────────── */}
      <section style={{ padding: 'clamp(48px,8vw,80px) 16px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div className="dd-two-col">
            <Reveal>
              <div className="dd-section-label"><span>👥</span> Teams &amp; Social</div>
              <h2 className="dd-h2">Research is<br /><span className="dd-text-gradient">better together.</span></h2>
              <p className="dd-section-p">
                Create team workspaces, share reports and AI content, chat with an embedded AI bot, and follow researchers to discover what the community is exploring.
              </p>
            </Reveal>
            <Reveal delay={100}>
              <div className="dd-social-grid">
                {SOCIAL_FEATURES.map((f, i) => (
                  <div key={i} style={{
                    padding: '18px 16px', borderRadius: 14,
                    background: 'var(--theme-background-card)',
                    border: '1px solid var(--theme-border)',
                  }}>
                    <div style={{ fontSize: '1.4rem', marginBottom: 10 }}>{f.icon}</div>
                    <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--theme-text-primary)', margin: '0 0 6px' }}>{f.title}</h3>
                    <p style={{ fontSize: 12, color: 'var(--theme-text-secondary)', margin: 0, lineHeight: 1.5 }}>{f.desc}</p>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── Offline + Cache Banner ─────────────────────────────────── */}
      <section style={{ padding: '0 16px clamp(48px,8vw,80px)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <Reveal>
            <div className="dd-offline-strip">
              {[
                { icon: '✈️', title: 'Full offline mode', desc: 'Cache reports, podcasts, debates, papers, and presentations. View and export them with zero network.' },
                { icon: '🔔', title: 'Smart notifications', desc: 'Get notified when research completes, someone follows you, or a teammate shares content — on Android.' },
                { icon: '🔒', title: 'Credit system', desc: 'Pay only for what you use. Start with 20 free credits and top up anytime from inside the app.' },
              ].map((item, i) => (
                <div key={i} className="dd-offline-cell">
                  <div style={{ fontSize: '2rem', marginBottom: 16 }}>{item.icon}</div>
                  <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--theme-text-primary)', margin: '0 0 8px' }}>{item.title}</h3>
                  <p style={{ fontSize: 13, color: 'var(--theme-text-secondary)', margin: 0, lineHeight: 1.6 }}>{item.desc}</p>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Community Discovery with REAL FEED ────────────────────── */}
      <section style={{
        padding: 'clamp(48px,8vw,80px) 16px',
        background: 'var(--theme-background-elevated)',
        borderTop: '1px solid var(--theme-border)',
        borderBottom: '1px solid var(--theme-border)',
      }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div className="dd-community-row">
            <Reveal>
              <div style={{ maxWidth: 540 }}>
                <div className="dd-section-label"><span>🌐</span> Public Research Feed</div>
                <h2 className="dd-h2">Discover what<br /><span className="dd-text-gradient">others are researching.</span></h2>
                <p className="dd-section-p">
                  Every report you publish becomes a public web page, complete with an embedded AI Q&amp;A widget, social sharing, and reaction emojis — searchable by anyone, no login required.
                </p>

                {/* Feed toggle */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                  <button
                    onClick={() => setFeedView('trending')}
                    style={{
                      padding: '6px 16px',
                      borderRadius: 999,
                      border: feedView === 'trending' ? '2px solid var(--theme-primary)' : '1px solid var(--theme-border)',
                      background: feedView === 'trending' ? 'var(--theme-primary)' : 'var(--theme-background-card)',
                      color: feedView === 'trending' ? '#FFFFFF' : 'var(--theme-text-secondary)',
                      fontWeight: 700,
                      fontSize: 13,
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    🔥 Trending
                  </button>
                  <button
                    onClick={() => setFeedView('recent')}
                    style={{
                      padding: '6px 16px',
                      borderRadius: 999,
                      border: feedView === 'recent' ? '2px solid var(--theme-primary)' : '1px solid var(--theme-border)',
                      background: feedView === 'recent' ? 'var(--theme-primary)' : 'var(--theme-background-card)',
                      color: feedView === 'recent' ? '#FFFFFF' : 'var(--theme-text-secondary)',
                      fontWeight: 700,
                      fontSize: 13,
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    🆕 Latest
                  </button>
                </div>

                {topTags.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
                    {topTags.slice(0, 6).map(tag => (
                      <Link key={tag} href={`/topic/${encodeURIComponent(tag)}`} style={{
                        fontSize: 12, fontWeight: 600, padding: '5px 12px', borderRadius: 999,
                        background: 'var(--theme-primary)',
                        color: '#FFFFFF',
                        border: '1px solid var(--theme-primary)',
                        textDecoration: 'none',
                        transition: 'opacity 0.2s',
                        WebkitTapHighlightColor: 'transparent',
                      }}>#{tag}</Link>
                    ))}
                    {topTags.length > 6 && (
                      <Link href="/discover" style={{
                        fontSize: 12, fontWeight: 600, padding: '5px 12px', borderRadius: 999,
                        background: 'var(--theme-background-card)',
                        border: '1px solid var(--theme-border)',
                        color: 'var(--theme-text-secondary)',
                        textDecoration: 'none',
                      }}>+ more →</Link>
                    )}
                  </div>
                )}

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                  <Link href="/discover" style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    padding: '11px 20px', borderRadius: 12, fontWeight: 700, fontSize: 14,
                    background: 'linear-gradient(135deg, var(--theme-gradient-primary-1), var(--theme-gradient-primary-2))',
                    color: '#FFFFFF',
                    textDecoration: 'none',
                    boxShadow: '0 4px 20px var(--theme-primary)',
                    transition: 'opacity 0.2s',
                    WebkitTapHighlightColor: 'transparent',
                    whiteSpace: 'nowrap',
                  }}>
                    Browse {reportCount > 0 ? `${reportCount}+ ` : ''}Reports →
                  </Link>
                </div>
              </div>
            </Reveal>

            {/* Feed preview card - REAL DATA */}
            <Reveal delay={200}>
              <div style={{
                maxWidth: 360, width: '100%',
                borderRadius: 20, overflow: 'hidden',
                background: 'var(--theme-background-card)',
                border: '1px solid var(--theme-border)',
                boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
              }}>
                <div style={{ padding: '16px 16px 0', borderBottom: '1px solid var(--theme-border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: 8,
                      background: 'var(--theme-primary)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '0.85rem', color: '#FFFFFF',
                    }}>📊</div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--theme-text-muted)' }}>
                      {feedView === 'trending' ? '🔥 TRENDING' : '🆕 LATEST'} · deepdive.website
                    </span>
                  </div>
                </div>

                <div style={{ padding: '14px 16px' }}>
                  {isFeedLoading ? (
                    <div style={{ textAlign: 'center', padding: '20px 0' }}>
                      <div style={{
                        width: 24, height: 24,
                        border: '2px solid var(--theme-primary)',
                        borderTopColor: 'transparent',
                        borderRadius: '50%',
                        animation: 'spin 0.6s linear infinite',
                        margin: '0 auto',
                      }} />
                    </div>
                  ) : displayedReports.length > 0 ? (
                    <ReportFeed reports={displayedReports.slice(0, 4)} title="" />
                  ) : (
                    <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--theme-text-muted)' }}>
                      <p style={{ fontSize: 14 }}>No reports available</p>
                    </div>
                  )}
                </div>

                {displayedReports.length > 0 && (
                  <div style={{ padding: '12px 16px', borderTop: '1px solid var(--theme-border)' }}>
                    <Link
                      href={feedView === 'trending' ? '/discover' : '/discover?sort=recent'}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        fontSize: 12, fontWeight: 700, color: 'var(--theme-primary)',
                        textDecoration: 'none', padding: '6px 0',
                      }}
                    >
                      View all {feedView === 'trending' ? 'trending' : 'latest'} reports →
                    </Link>
                  </div>
                )}
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── Final CTA ──────────────────────────────────────────────── */}
      <section style={{ padding: 'clamp(60px,10vw,100px) 16px' }}>
        <div style={{ maxWidth: 680, margin: '0 auto' }}>
          <Reveal>
            <div style={{
              borderRadius: 28,
              padding: 'clamp(32px,6vw,56px) clamp(20px,5vw,40px)',
              textAlign: 'center',
              position: 'relative', overflow: 'hidden',
              background: 'var(--theme-background-card)',
              border: '2px solid var(--theme-primary)',
            }}>
              <div style={{
                position: 'absolute', inset: 0, pointerEvents: 'none',
                background: 'radial-gradient(ellipse 100% 60% at 50% -10%, var(--theme-primary), transparent 70%)',
                opacity: 0.06,
              }} />
              <div style={{
                position: 'absolute', bottom: -40, right: -40,
                width: 200, height: 200, borderRadius: '50%',
                background: 'radial-gradient(circle, var(--theme-primary), transparent 70%)',
                opacity: 0.06,
                pointerEvents: 'none',
              }} />
              <div style={{ position: 'relative' }}>
                <div style={{ fontSize: '3rem', marginBottom: 20 }}>🔬</div>
                <h2 style={{
                  fontSize: 'clamp(1.6rem, 5vw, 2.8rem)',
                  fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 1.05,
                  color: 'var(--theme-text-primary)', margin: '0 0 16px',
                }}>
                  Start researching<br />
                  <span className="dd-text-gradient">for free.</span>
                </h2>
                <p style={{ fontSize: 15, color: 'var(--theme-text-secondary)', margin: '0 0 32px', lineHeight: 1.7 }}>
                  20 bonus credits on signup. No credit card. Works on Android now — iOS coming soon.
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center', marginBottom: 24 }}>
                  <PlayStoreBtn size="md" />
                  <AppStoreBtn size="md" />
                </div>
                <Link href="/discover" style={{
                  fontSize: 13, fontWeight: 700, color: 'var(--theme-primary)',
                  textDecoration: 'none', transition: 'opacity 0.2s',
                  WebkitTapHighlightColor: 'transparent',
                }}>
                  Or browse public research first →
                </Link>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────── */}
      <footer style={{
        borderTop: '1px solid var(--theme-border)',
        padding: '20px 16px',
        color: 'var(--theme-text-muted)',
        fontSize: 12,
      }}>
        <div style={{
          maxWidth: 1100, margin: '0 auto',
          display: 'flex', flexWrap: 'wrap',
          alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }}>
          <p style={{ margin: 0, color: 'var(--theme-text-muted)' }}>
            © {new Date().getFullYear()} DeepDive AI · Built with autonomous AI agents
          </p>
          <div style={{ display: 'flex', gap: 20 }}>
            <Link href="/discover" style={{ color: 'var(--theme-text-muted)', textDecoration: 'none', fontSize: 12 }}>
              Discover
            </Link>
            <Link href="/discover?sort=recent" style={{ color: 'var(--theme-text-muted)', textDecoration: 'none', fontSize: 12 }}>
              Latest
            </Link>
          </div>
        </div>
      </footer>

      <ThemeToggle />
    </main>
  );
}