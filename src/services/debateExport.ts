// src/services/debateExport.ts
// Part 9 — Export utilities for debate sessions.
//
// Three export actions:
//   exportDebateAsPDF(session)      — HTML → PDF via expo-print, then share sheet
//   copyDebateSummary(session)      — plain-text to clipboard via expo-clipboard
//   shareDebateText(session)        — native share sheet with rich text

import * as Print     from 'expo-print';
import * as Sharing   from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';
import { Share }      from 'react-native';
import { DebateSession, DebatePerspective, DebateModerator } from '../types';

// ─── Colour palette (light theme — matches podcast export) ───────────────────

const COLORS = {
  // Brand
  primary:    '#6C63FF',
  secondary:  '#FF6584',
  accent:     '#43E97B',
  info:       '#29B6F6',
  warning:    '#FFA726',

  // Surfaces
  bg:         '#FFFFFF',
  surface:    '#F8F7FF',
  surfaceAlt: '#FFF0F4',
  border:     '#EBE9FF',
  borderAlt:  '#FFE0E8',

  // Text
  textPrimary: '#1A1A2E',
  textSecond:  '#555577',
  textMuted:   '#999AAA',

  // Stance tints
  forBg:         '#F0FFF6',
  forBorder:     '#B2EDD0',
  againstBg:     '#FFF2F5',
  againstBorder: '#FFBFCC',
  neutralBg:     '#F5F5FF',
  neutralBorder: '#D5D5EE',
};

// ─── Stance helpers ───────────────────────────────────────────────────────────

function stanceColor(stanceType: string): string {
  switch (stanceType) {
    case 'strongly_for':     return '#22C55E';
    case 'for':              return '#3DAE7C';
    case 'neutral':          return '#8888AA';
    case 'against':          return '#F97316';
    case 'strongly_against': return '#EF4444';
    default:                 return '#8888AA';
  }
}

function stanceBg(stanceType: string): string {
  switch (stanceType) {
    case 'strongly_for':     return '#EDFFF4';
    case 'for':              return '#F0FFF8';
    case 'neutral':          return '#F5F5FC';
    case 'against':          return '#FFF6ED';
    case 'strongly_against': return '#FFF2F2';
    default:                 return '#F5F5FC';
  }
}

function stanceLabel(stanceType: string): string {
  switch (stanceType) {
    case 'strongly_for':     return 'Strongly For';
    case 'for':              return 'For';
    case 'neutral':          return 'Neutral';
    case 'against':          return 'Against';
    case 'strongly_against': return 'Strongly Against';
    default:                 return 'Neutral';
  }
}

function strengthDotColor(strength: string): string {
  switch (strength) {
    case 'strong':   return '#22C55E';
    case 'moderate': return '#F97316';
    default:         return '#AAAACC';
  }
}

function strengthLabel(strength: string): string {
  switch (strength) {
    case 'strong':   return 'Strong';
    case 'moderate': return 'Moderate';
    default:         return 'Weak';
  }
}

// ─── HTML escaping ────────────────────────────────────────────────────────────

function escapeHtml(text: string): string {
  return (text ?? '')
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#39;')
    .replace(/\n/g, '<br/>');
}

// ─── Perspective block ────────────────────────────────────────────────────────

function buildPerspectiveBlock(p: DebatePerspective, index: number): string {
  const sc  = stanceColor(p.stanceType);
  const sl  = stanceLabel(p.stanceType);
  const sbg = stanceBg(p.stanceType);

  // Arguments
  const argsHtml = p.arguments.map((a) => {
    const dot  = strengthDotColor(a.strength);
    const slbl = strengthLabel(a.strength);
    const badge = `<span style="
        background:${dot}18; color:${dot};
        border:1px solid ${dot}40; border-radius:99px;
        font-size:9px; font-weight:700; letter-spacing:.5px;
        padding:2px 8px; vertical-align:middle; margin-left:6px;
        text-transform:uppercase;
      ">${slbl}</span>`;

    const srcHtml = a.sourceUrl
      ? `<div style="margin-top:6px; padding-left:20px; font-size:10px; color:${COLORS.textMuted};">
           <span style="color:${p.color}; margin-right:3px;">↗</span>
           <a href="${escapeHtml(a.sourceUrl)}" style="color:${p.color}; text-decoration:underline; word-break:break-all;">
             ${escapeHtml(a.sourceUrl.replace(/^https?:\/\//, '').slice(0, 72))}
           </a>
         </div>`
      : '';

    return `
      <div style="
        background:#FAFAFE; border:1px solid ${COLORS.border};
        border-left:3px solid ${p.color}; border-radius:10px;
        padding:14px 16px; margin-bottom:10px;
      ">
        <div style="display:flex; align-items:flex-start; gap:10px; margin-bottom:6px;">
          <span style="
            width:8px; height:8px; border-radius:50%;
            background:${dot}; flex-shrink:0; margin-top:5px; display:inline-block;
          "></span>
          <span style="font-size:13px; font-weight:700; color:${COLORS.textPrimary}; line-height:1.5; flex:1;">
            ${escapeHtml(a.point)}${badge}
          </span>
        </div>
        <div style="font-size:12px; color:${COLORS.textSecond}; line-height:1.65; padding-left:18px;">
          ${escapeHtml(a.evidence)}
        </div>
        ${srcHtml}
      </div>`;
  }).join('');

  // Sources list
  const srcListHtml = p.sourcesUsed.slice(0, 5).map(s => `
    <div style="
      display:flex; align-items:baseline; gap:6px;
      font-size:11px; color:${COLORS.textSecond};
      margin-bottom:6px; padding-left:4px;
    ">
      <span style="color:${p.color}; font-size:14px; line-height:1;">•</span>
      ${s.url
        ? `<a href="${escapeHtml(s.url)}" style="color:${p.color}; text-decoration:underline; word-break:break-all;">${escapeHtml(s.title || s.url)}</a>`
        : `<span>${escapeHtml(s.title || '')}</span>`}
      ${s.date ? `<span style="color:${COLORS.textMuted}; white-space:nowrap;"> · ${escapeHtml(s.date)}</span>` : ''}
    </div>`).join('');

  // Confidence
  const pct  = Math.round((p.confidence / 10) * 100);
  const clbl =
    p.confidence <= 2 ? 'Very Low'  :
    p.confidence <= 4 ? 'Low'       :
    p.confidence <= 6 ? 'Mixed'     :
    p.confidence <= 8 ? 'Strong'    :
    'Very Strong';

  return `
  <!-- ── Perspective ${index + 1}: ${escapeHtml(p.agentName)} ── -->
  <div style="
    background:${COLORS.bg}; border:1px solid ${COLORS.border};
    border-top:4px solid ${p.color}; border-radius:14px;
    padding:28px 30px; margin-bottom:28px;
    box-shadow:0 2px 12px rgba(108,99,255,.07);
    page-break-inside:avoid;
  ">
    <!-- Agent header row -->
    <div style="display:flex; align-items:center; gap:14px; margin-bottom:18px;">
      <div style="
        width:52px; height:52px; border-radius:14px;
        background:${p.color}18; border:2px solid ${p.color}40;
        display:flex; align-items:center; justify-content:center; flex-shrink:0;
      ">
        <div style="width:20px; height:20px; border-radius:50%; background:${p.color};"></div>
      </div>
      <div style="flex:1; min-width:0;">
        <div style="
          font-size:9px; font-weight:800; letter-spacing:1px;
          text-transform:uppercase; color:${p.color}; margin-bottom:3px;
        ">${escapeHtml(p.tagline)}</div>
        <div style="font-size:17px; font-weight:800; color:${COLORS.textPrimary};">
          ${escapeHtml(p.agentName)}
        </div>
      </div>
      <div style="
        background:${sbg}; border:1.5px solid ${sc}50; border-radius:99px;
        padding:6px 14px; font-size:11px; font-weight:700; color:${sc};
        white-space:nowrap; flex-shrink:0;
      ">${sl}</div>
    </div>

    <!-- Stance label -->
    <div style="
      background:${p.color}0D; border-left:3px solid ${p.color};
      border-radius:0 8px 8px 0; padding:10px 14px;
      font-size:13px; font-weight:600; color:${COLORS.textPrimary};
      margin-bottom:16px; font-style:italic;
    ">"${escapeHtml(p.stanceLabel)}"</div>

    <!-- Summary -->
    <div style="
      font-size:13.5px; color:${COLORS.textSecond}; line-height:1.75;
      margin-bottom:22px; white-space:pre-line;
    ">${escapeHtml(p.summary)}</div>

    <!-- Key Arguments label -->
    <div style="
      font-size:9px; font-weight:800; letter-spacing:.8px;
      text-transform:uppercase; color:${COLORS.textMuted};
      margin-bottom:10px; padding-bottom:6px;
      border-bottom:1px solid ${COLORS.border};
    ">Key Arguments</div>
    ${argsHtml}

    <!-- Key Quote -->
    ${p.keyQuote ? `
    <div style="
      border:1px solid ${p.color}30; border-radius:10px;
      background:${p.color}06; padding:16px;
      display:flex; gap:8px; align-items:flex-start; margin:16px 0;
    ">
      <span style="color:${p.color}; font-size:28px; line-height:.8; flex-shrink:0;">"</span>
      <em style="font-size:13.5px; color:${COLORS.textSecond}; line-height:1.6; flex:1;">
        ${escapeHtml(p.keyQuote)}
      </em>
      <span style="color:${p.color}; font-size:28px; line-height:.8; flex-shrink:0; align-self:flex-end;">"</span>
    </div>` : ''}

    <!-- Confidence bar -->
    <div style="
      display:flex; align-items:center; gap:10px;
      padding:14px 16px; background:${COLORS.surface}; border-radius:10px;
      margin-bottom:${p.sourcesUsed.length > 0 ? '18px' : '0'};
    ">
      <span style="font-size:10px; font-weight:700; color:${COLORS.textMuted}; white-space:nowrap;">
        Evidence Confidence
      </span>
      <div style="
        flex:1; height:6px; background:${COLORS.border};
        border-radius:3px; overflow:hidden;
      ">
        <div style="
          width:${pct}%; height:100%;
          background:linear-gradient(90deg, ${p.color}99, ${p.color});
          border-radius:3px;
        "></div>
      </div>
      <span style="font-size:12px; font-weight:800; color:${p.color}; min-width:34px; text-align:right;">
        ${p.confidence}/10
      </span>
      <span style="font-size:11px; color:${COLORS.textMuted}; font-style:italic; white-space:nowrap;">
        (${clbl})
      </span>
    </div>

    <!-- Sources -->
    ${p.sourcesUsed.length > 0 ? `
    <div style="margin-top:16px; padding-top:14px; border-top:1px solid ${COLORS.border};">
      <div style="
        font-size:9px; font-weight:800; letter-spacing:.8px;
        text-transform:uppercase; color:${COLORS.textMuted}; margin-bottom:10px;
      ">Sources Researched</div>
      ${srcListHtml}
    </div>` : ''}
  </div>`;
}

// ─── Moderator block ──────────────────────────────────────────────────────────

function buildModeratorBlock(moderator: DebateModerator): string {
  const forItems     = moderator.argumentsFor.map(a =>
    `<li style="margin-bottom:8px;">${escapeHtml(a)}</li>`).join('');
  const againstItems = moderator.argumentsAgainst.map(a =>
    `<li style="margin-bottom:8px;">${escapeHtml(a)}</li>`).join('');

  const consensusHtml = moderator.consensusPoints.map(c => `
    <div style="
      display:flex; gap:10px; align-items:flex-start;
      padding:10px 14px; background:#EDFFF5;
      border-left:3px solid #22C55E; border-radius:0 8px 8px 0;
      margin-bottom:8px; font-size:13px; color:${COLORS.textSecond}; line-height:1.6;
    ">
      <span style="color:#22C55E; font-weight:800; flex-shrink:0;">✓</span>
      ${escapeHtml(c)}
    </div>`).join('');

  const tensionHtml = moderator.keyTensions.map(t => `
    <div style="
      display:flex; gap:10px; align-items:flex-start;
      padding:10px 14px; background:#FFF7ED;
      border-left:3px solid #F97316; border-radius:0 8px 8px 0;
      margin-bottom:8px; font-size:13px; color:${COLORS.textSecond}; line-height:1.6;
    ">
      <span style="color:#F97316; font-weight:800; flex-shrink:0;">⚡</span>
      ${escapeHtml(t)}
    </div>`).join('');

  return `
  <div style="
    background:${COLORS.bg}; border:1px solid ${COLORS.border};
    border-top:4px solid ${COLORS.primary}; border-radius:14px;
    padding:32px 34px; box-shadow:0 2px 14px rgba(108,99,255,.08);
  ">
    <!-- Header -->
    <div style="
      display:flex; align-items:center; gap:14px;
      margin-bottom:24px; padding-bottom:18px;
      border-bottom:1px solid ${COLORS.border};
    ">
      <div style="
        width:52px; height:52px; border-radius:14px;
        background:${COLORS.primary}18; border:2px solid ${COLORS.primary}40;
        display:flex; align-items:center; justify-content:center;
        font-size:24px; flex-shrink:0;
      ">⚖️</div>
      <div>
        <div style="font-size:18px; font-weight:800; color:${COLORS.textPrimary};">
          Moderator's Synthesis
        </div>
        <div style="font-size:12px; color:${COLORS.textMuted}; margin-top:2px;">
          Balanced analysis of all perspectives
        </div>
      </div>
    </div>

    <!-- Balanced Verdict -->
    <div style="
      background:linear-gradient(135deg, ${COLORS.primary}10, ${COLORS.secondary}08);
      border:1.5px solid ${COLORS.primary}30; border-radius:12px;
      padding:22px 24px; margin-bottom:28px;
    ">
      <div style="
        font-size:9px; font-weight:800; letter-spacing:1px;
        text-transform:uppercase; color:${COLORS.primary}; margin-bottom:10px;
      ">Balanced Verdict</div>
      <div style="
        font-size:15px; font-weight:600; color:${COLORS.textPrimary};
        line-height:1.65; font-style:italic;
      ">"${escapeHtml(moderator.balancedVerdict)}"</div>
    </div>

    <!-- Perspective Comparison -->
    <div style="margin-bottom:26px;">
      <div style="font-size:13px; font-weight:700; color:${COLORS.textPrimary}; margin-bottom:10px;">
        Perspective Comparison
      </div>
      <div style="
        font-size:13px; color:${COLORS.textSecond}; line-height:1.75; white-space:pre-line;
      ">${escapeHtml(moderator.summary)}</div>
    </div>

    <!-- For vs Against columns -->
    <div style="display:flex; gap:16px; margin-bottom:26px;">
      <div style="flex:1;">
        <div style="
          font-size:11px; font-weight:700; padding:9px 14px;
          background:#EDFFF5; border:1px solid #B2EDD0;
          border-radius:8px; color:#22C55E; margin-bottom:12px;
        ">↑ Arguments For</div>
        <ul style="list-style:none; padding:0; margin:0; color:${COLORS.textSecond}; font-size:12.5px; line-height:1.65;">
          ${forItems || `<li style="color:#ccc; font-style:italic;">None noted</li>`}
        </ul>
      </div>
      <div style="flex:1;">
        <div style="
          font-size:11px; font-weight:700; padding:9px 14px;
          background:#FFF2F5; border:1px solid #FFBFCC;
          border-radius:8px; color:#EF4444; margin-bottom:12px;
        ">↓ Arguments Against</div>
        <ul style="list-style:none; padding:0; margin:0; color:${COLORS.textSecond}; font-size:12.5px; line-height:1.65;">
          ${againstItems || `<li style="color:#ccc; font-style:italic;">None noted</li>`}
        </ul>
      </div>
    </div>

    <!-- Consensus Points -->
    ${moderator.consensusPoints.length > 0 ? `
    <div style="margin-bottom:22px;">
      <div style="font-size:13px; font-weight:700; color:${COLORS.textPrimary}; margin-bottom:12px;">
        ✓ Consensus Points
      </div>
      ${consensusHtml}
    </div>` : ''}

    <!-- Key Tensions -->
    ${moderator.keyTensions.length > 0 ? `
    <div style="margin-bottom:22px;">
      <div style="font-size:13px; font-weight:700; color:${COLORS.textPrimary}; margin-bottom:12px;">
        ⚡ Key Tensions
      </div>
      ${tensionHtml}
    </div>` : ''}

    <!-- Neutral Conclusion -->
    <div>
      <div style="font-size:13px; font-weight:700; color:${COLORS.textPrimary}; margin-bottom:10px;">
        Neutral Conclusion
      </div>
      <div style="
        background:#EFF8FF; border-left:3px solid ${COLORS.info};
        border-radius:0 8px 8px 0; padding:16px 18px;
        font-size:13.5px; color:${COLORS.textSecond}; line-height:1.75; white-space:pre-line;
      ">${escapeHtml(moderator.neutralConclusion)}</div>
    </div>
  </div>`;
}

// ─── Full HTML document ───────────────────────────────────────────────────────

function buildDebateHTML(session: DebateSession): string {
  const generatedDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const forCount     = session.perspectives.filter(
    p => p.stanceType === 'for' || p.stanceType === 'strongly_for').length;
  const againstCount = session.perspectives.filter(
    p => p.stanceType === 'against' || p.stanceType === 'strongly_against').length;
  const neutralCount = session.perspectives.length - forCount - againstCount;

  const total      = Math.max(session.perspectives.length, 1);
  const barFor     = Math.round((forCount / total) * 100);
  const barAgainst = Math.round((againstCount / total) * 100);
  const barNeutral = 100 - barFor - barAgainst;

  const perspectivesHtml = session.perspectives
    .map((p, i) => buildPerspectiveBlock(p, i))
    .join('');

  const moderatorHtml = session.moderator
    ? buildModeratorBlock(session.moderator)
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>AI Debate: ${escapeHtml(session.topic)}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif;
      background: #FFFFFF;
      color: #1A1A2E;
      font-size: 13px;
      line-height: 1.6;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    a { color: inherit; }
    .stats-bar {
      display: flex;
      background: #F8F7FF;
      padding: 20px 52px;
      gap: 40px;
      border-bottom: 2px solid #EBE9FF;
    }
    .stat-item { text-align: center; flex: 1; }
    .stat-item .value { font-size: 22px; font-weight: 800; color: #6C63FF; display: block; }
    .stat-item .label {
      font-size: 10px; color: #999;
      text-transform: uppercase; letter-spacing: .5px;
      margin-top: 3px; display: block;
    }
    .page-section { padding: 44px 52px; }
    .page-section + .page-section { border-top: 2px solid #EBE9FF; }
    .section-heading {
      font-size: 12px; font-weight: 800; letter-spacing: 1.5px;
      text-transform: uppercase; color: #6C63FF;
      margin-bottom: 24px; padding-bottom: 12px;
      border-bottom: 2px solid #EBE9FF;
    }
    .footer {
      background: #F8F7FF; padding: 22px 52px;
      text-align: center; font-size: 11px; color: #BBBBCC;
      border-top: 1px solid #EBE9FF;
    }
    .footer strong { color: #6C63FF; }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>

<!-- ════════ COVER ════════ -->
<div style="
  background: linear-gradient(135deg, #6C63FF 0%, #9B59FF 45%, #FF6584 100%);
  color: #FFFFFF; padding: 56px 52px 48px;
  page-break-after: always;
">
  <div style="
    font-size:11px; font-weight:700; letter-spacing:2px;
    text-transform:uppercase; opacity:.75;
    display:flex; align-items:center; gap:6px; margin-bottom:18px;
  ">🎯 DeepDive AI · Debate Report</div>

  <h1 style="font-size:30px; font-weight:800; line-height:1.3; margin-bottom:16px; max-width:680px;">
    ${escapeHtml(session.topic)}
  </h1>

  <div style="
    background:rgba(255,255,255,.15); border-left:4px solid rgba(255,255,255,.6);
    border-radius:0 10px 10px 0; padding:14px 18px;
    font-size:14px; line-height:1.6; opacity:.93; max-width:640px; margin-bottom:30px;
  ">
    <span style="
      font-size:9px; font-weight:800; letter-spacing:.8px;
      text-transform:uppercase; opacity:.75; display:block; margin-bottom:6px;
    ">Central Question</span>
    ${escapeHtml(session.question)}
  </div>

  <div style="display:flex; gap:18px; flex-wrap:wrap; font-size:12.5px; opacity:.82; margin-bottom:28px;">
    <span>🤖 ${session.perspectives.length} AI Agents</span>
    <span>📚 ${session.searchResultsCount} Sources</span>
    <span style="color:rgba(255,255,255,.65);">|</span>
    ${forCount     > 0 ? `<span>✅ ${forCount} For</span>` : ''}
    ${neutralCount > 0 ? `<span>⚪ ${neutralCount} Neutral</span>` : ''}
    ${againstCount > 0 ? `<span>❌ ${againstCount} Against</span>` : ''}
  </div>

  <!-- Stance distribution bar -->
  <div style="margin-bottom:26px;">
    <div style="
      font-size:9px; font-weight:700; letter-spacing:.7px;
      text-transform:uppercase; opacity:.65; margin-bottom:8px;
    ">Stance Distribution</div>
    <div style="
      display:flex; height:10px; border-radius:5px;
      overflow:hidden; gap:2px; max-width:500px;
    ">
      ${barFor     > 0 ? `<div style="flex:${barFor};     background:#43E97B; border-radius:4px 0 0 4px;"></div>` : ''}
      ${barNeutral > 0 ? `<div style="flex:${barNeutral}; background:rgba(255,255,255,.3);"></div>` : ''}
      ${barAgainst > 0 ? `<div style="flex:${barAgainst}; background:#FF6584; border-radius:0 4px 4px 0;"></div>` : ''}
    </div>
    <div style="display:flex; gap:18px; margin-top:8px; font-size:10px; opacity:.65;">
      ${forCount     > 0 ? `<span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#43E97B;margin-right:4px;"></span>${forCount} For</span>` : ''}
      ${neutralCount > 0 ? `<span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:rgba(255,255,255,.4);margin-right:4px;"></span>${neutralCount} Neutral</span>` : ''}
      ${againstCount > 0 ? `<span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#FF6584;margin-right:4px;"></span>${againstCount} Against</span>` : ''}
    </div>
  </div>

  <!-- Moderator verdict preview -->
  ${session.moderator?.balancedVerdict ? `
  <div style="
    background:rgba(255,255,255,.15); border:1px solid rgba(255,255,255,.3);
    border-radius:12px; padding:18px 22px; max-width:640px;
  ">
    <div style="
      font-size:9px; font-weight:800; letter-spacing:1px;
      text-transform:uppercase; opacity:.65; margin-bottom:8px;
    ">Moderator's Verdict</div>
    <div style="font-size:14px; font-style:italic; line-height:1.6; opacity:.93;">
      "${escapeHtml(session.moderator.balancedVerdict)}"
    </div>
  </div>` : ''}

  <!-- Cover footer -->
  <div style="
    margin-top:36px; padding-top:20px;
    border-top:1px solid rgba(255,255,255,.2);
    display:flex; justify-content:space-between; align-items:center;
    font-size:10.5px; opacity:.6;
  ">
    <span>Generated by <strong style="opacity:1; font-weight:800;">DeepDive AI</strong></span>
    <span>${generatedDate}</span>
  </div>
</div>

<!-- ════════ STATS BAR ════════ -->
<div class="stats-bar">
  <div class="stat-item">
    <span class="value">${session.perspectives.length}</span>
    <span class="label">AI Agents</span>
  </div>
  <div class="stat-item">
    <span class="value" style="color:#22C55E;">${forCount}</span>
    <span class="label">For</span>
  </div>
  <div class="stat-item">
    <span class="value" style="color:#EF4444;">${againstCount}</span>
    <span class="label">Against</span>
  </div>
  <div class="stat-item">
    <span class="value" style="color:#8888AA;">${neutralCount}</span>
    <span class="label">Neutral</span>
  </div>
  <div class="stat-item">
    <span class="value" style="color:#29B6F6;">${session.searchResultsCount}</span>
    <span class="label">Sources</span>
  </div>
</div>

<!-- ════════ PERSPECTIVES ════════ -->
<div class="page-section">
  <div class="section-heading">🤖 Agent Perspectives (${session.perspectives.length})</div>
  ${perspectivesHtml}
</div>

<!-- ════════ MODERATOR ════════ -->
${moderatorHtml ? `
<div class="page-section">
  <div class="section-heading">⚖️ Moderator Synthesis</div>
  ${moderatorHtml}
</div>` : ''}

<!-- ════════ FOOTER ════════ -->
<div class="footer">
  Generated by <strong>DeepDive AI</strong> · ${generatedDate} · deepdive.app
</div>

</body>
</html>`;
}

// ─── PDF Export ───────────────────────────────────────────────────────────────

export async function exportDebateAsPDF(session: DebateSession): Promise<void> {
  const html = buildDebateHTML(session);

  const { uri } = await Print.printToFileAsync({
    html,
    base64: false,
  });

  const isAvailable = await Sharing.isAvailableAsync();
  if (isAvailable) {
    await Sharing.shareAsync(uri, {
      mimeType:    'application/pdf',
      dialogTitle: `Debate: ${session.topic}`,
      UTI:         'com.adobe.pdf',
    });
  } else {
    // Fallback on platforms where Sharing is unavailable
    await Print.printAsync({ uri });
  }
}

// ─── Plain-text builder (for copy & share) ───────────────────────────────────

function buildDebatePlainText(session: DebateSession): string {
  const separator = '─'.repeat(60);

  const header = [
    '🎯 AI DEBATE REPORT — DeepDive AI',
    separator,
    `TOPIC:    ${session.topic}`,
    `QUESTION: ${session.question}`,
    `AGENTS:   ${session.perspectives.length}  |  SOURCES: ${session.searchResultsCount}`,
    separator,
  ].join('\n');

  const stances = session.perspectives
    .map(p =>
      `  • ${p.agentName.padEnd(18)} ${stanceLabel(p.stanceType).padEnd(18)} Confidence: ${p.confidence}/10`,
    )
    .join('\n');

  const stanceBlock = [
    'STANCE OVERVIEW',
    separator,
    stances,
    separator,
  ].join('\n');

  const perspectivesBlock = session.perspectives.map(p => {
    const argLines = p.arguments
      .map(a => `  [${a.strength.toUpperCase()}] ${a.point}\n  ${a.evidence}`)
      .join('\n\n');

    return [
      `\n${p.agentName.toUpperCase()} — ${p.tagline}`,
      `Stance: ${p.stanceLabel}  (${stanceLabel(p.stanceType)}, confidence ${p.confidence}/10)`,
      '',
      p.summary,
      '',
      'Key Arguments:',
      argLines,
      '',
      p.keyQuote ? `"${p.keyQuote}"` : '',
    ]
      .filter(l => l !== undefined)
      .join('\n');
  }).join(`\n\n${separator}\n`);

  const moderatorBlock = session.moderator
    ? [
        `\n${separator}`,
        '⚖️  MODERATOR SYNTHESIS',
        separator,
        '',
        `VERDICT: "${session.moderator.balancedVerdict}"`,
        '',
        'PERSPECTIVE COMPARISON:',
        session.moderator.summary,
        '',
        'ARGUMENTS FOR:',
        session.moderator.argumentsFor.map(a => `  ✓ ${a}`).join('\n'),
        '',
        'ARGUMENTS AGAINST:',
        session.moderator.argumentsAgainst.map(a => `  ✗ ${a}`).join('\n'),
        '',
        session.moderator.consensusPoints.length > 0
          ? [
              'CONSENSUS POINTS:',
              session.moderator.consensusPoints.map(c => `  • ${c}`).join('\n'),
            ].join('\n')
          : '',
        '',
        session.moderator.keyTensions.length > 0
          ? [
              'KEY TENSIONS:',
              session.moderator.keyTensions.map(t => `  ⚡ ${t}`).join('\n'),
            ].join('\n')
          : '',
        '',
        'NEUTRAL CONCLUSION:',
        session.moderator.neutralConclusion,
      ]
        .filter(l => l !== undefined)
        .join('\n')
    : '';

  const footer = [
    `\n${separator}`,
    `Generated by DeepDive AI  ·  ${new Date().toLocaleDateString()}`,
    separator,
  ].join('\n');

  return [header, stanceBlock, perspectivesBlock, moderatorBlock, footer]
    .filter(Boolean)
    .join('\n');
}

// ─── Copy to clipboard ────────────────────────────────────────────────────────

export async function copyDebateSummary(session: DebateSession): Promise<void> {
  const text = buildDebatePlainText(session);
  await Clipboard.setStringAsync(text);
}

// ─── Native share sheet ───────────────────────────────────────────────────────

export async function shareDebateText(session: DebateSession): Promise<void> {
  const text = buildDebatePlainText(session);
  await Share.share(
    {
      message: text,
      title:   `AI Debate: ${session.topic}`,
    },
    {
      dialogTitle: `Share debate: ${session.topic}`,
    },
  );
}