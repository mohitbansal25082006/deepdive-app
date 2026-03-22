// src/constants/slideTemplates.ts
// Part 29 — 20+ Ready-Made Slide Template Library
// ─────────────────────────────────────────────────────────────────────────────
// Categories: Business · Pitch Deck · Academic · Creative · Minimal
//             Data Driven · Storytelling · Corporate
// Each template ships with 3–6 pre-designed slides.
// Accent colors use the theme-primary placeholder '#6C63FF' by default;
// the template applier remaps to the chosen deck theme at insert time.
// ─────────────────────────────────────────────────────────────────────────────

import type { SlideTemplate, TemplateCategoryMeta } from '../types/editor';

// ─── Category metadata ────────────────────────────────────────────────────────

export const TEMPLATE_CATEGORIES: TemplateCategoryMeta[] = [
  { id: 'business',      label: 'Business',      emoji: '💼', description: 'Professional decks for meetings & proposals' },
  { id: 'pitch_deck',   label: 'Pitch Deck',    emoji: '🚀', description: 'Investor-ready startup presentations' },
  { id: 'academic',      label: 'Academic',      emoji: '🎓', description: 'Research & educational slides' },
  { id: 'creative',      label: 'Creative',      emoji: '🎨', description: 'Bold, visual-first designs' },
  { id: 'minimal',       label: 'Minimal',       emoji: '⬜', description: 'Clean, distraction-free layouts' },
  { id: 'data_driven',  label: 'Data Driven',   emoji: '📊', description: 'Stats, charts & metrics focus' },
  { id: 'storytelling',  label: 'Storytelling',  emoji: '📖', description: 'Narrative-led presentation flow' },
  { id: 'corporate',     label: 'Corporate',     emoji: '🏢', description: 'Enterprise & boardroom ready' },
];

// ─── Template Definitions ─────────────────────────────────────────────────────

export const SLIDE_TEMPLATES: SlideTemplate[] = [

  // ── 1. STARTUP PITCH ──────────────────────────────────────────────────────
  {
    id:          'startup-pitch',
    name:        'Startup Pitch',
    description: 'Classic investor deck: problem → solution → market → team → ask',
    category:    'pitch_deck',
    icon:        'rocket-outline',
    gradient:    ['#FF6584', '#F093FB'],
    tag:         'Popular',
    slideCount:  6,
    suggestedTheme: 'dark',
    slides: [
      {
        layout: 'title',
        title:  'Your Startup Name',
        subtitle: 'One-line value proposition that hooks investors',
        badgeText: 'Series A · 2025',
        speakerNotes: 'Open strong. Introduce yourself and why this problem matters personally.',
        accentColor: '#FF6584',
        icon: 'rocket-outline',
      },
      {
        layout: 'content',
        title:  'The Problem',
        body:   'Describe the pain point your target customers experience daily. Use concrete language and avoid jargon. Investors invest in problems as much as solutions.',
        speakerNotes: 'Make the pain tangible. Share a customer story if you have one.',
        accentColor: '#FF6584',
        icon: 'alert-circle-outline',
      },
      {
        layout: 'bullets',
        title:  'Our Solution',
        bullets: [
          'Core product feature that directly solves the problem',
          'Key differentiator that competitors cannot easily copy',
          'Unfair advantage that compounds over time',
          'Technology or IP that creates a moat',
        ],
        speakerNotes: 'Demo the product here if possible. Show, don\'t just tell.',
        accentColor: '#FF6584',
        icon: 'bulb-outline',
      },
      {
        layout: 'stats',
        title:  'Market Opportunity',
        stats: [
          { value: '$50B',  label: 'Total Addressable Market',   color: '#FF6584' },
          { value: '$8B',   label: 'Serviceable Addressable',   color: '#F093FB' },
          { value: '18%',   label: 'CAGR Growth Rate',          color: '#FFA726' },
        ],
        speakerNotes: 'Use bottom-up market sizing. Show you understand where customers come from.',
        accentColor: '#FF6584',
        icon: 'stats-chart-outline',
      },
      {
        layout: 'bullets',
        title:  'Business Model',
        bullets: [
          'Revenue stream: SaaS subscription at $X/month per seat',
          'Current ARR: $Y with Z% month-over-month growth',
          'Unit economics: LTV:CAC ratio of 4:1 and improving',
          'Path to profitability: Q3 2026 at current burn rate',
        ],
        speakerNotes: 'Investors want to understand how you make money and why it scales.',
        accentColor: '#FF6584',
        icon: 'cash-outline',
      },
      {
        layout: 'closing',
        title:  'Join the Journey',
        subtitle: 'We\'re raising $3M to scale to 100 enterprise customers',
        speakerNotes: 'Be specific about the ask and exactly what milestones the money unlocks.',
        accentColor: '#FF6584',
        icon: 'handshake-outline',
      },
    ],
  },

  // ── 2. EXECUTIVE SUMMARY ──────────────────────────────────────────────────
  {
    id:          'executive-summary',
    name:        'Executive Summary',
    description: 'Crisp boardroom update: key metrics, decisions, next steps',
    category:    'corporate',
    icon:        'business-outline',
    gradient:    ['#0052CC', '#4FACFE'],
    tag:         'Popular',
    slideCount:  5,
    suggestedTheme: 'corporate',
    slides: [
      {
        layout: 'title',
        title:  'Q3 2025 Executive Summary',
        subtitle: 'Prepared for the Board of Directors · September 2025',
        badgeText: 'Confidential',
        accentColor: '#0052CC',
        icon: 'business-outline',
      },
      {
        layout: 'stats',
        title:  'Quarter at a Glance',
        stats: [
          { value: '$12.4M', label: 'Revenue (↑22% YoY)',    color: '#0052CC' },
          { value: '94%',    label: 'Customer Retention',    color: '#43E97B' },
          { value: '1,247',  label: 'Active Customers',      color: '#4FACFE' },
          { value: '68',     label: 'NPS Score',             color: '#FFA726' },
        ],
        accentColor: '#0052CC',
        icon: 'stats-chart-outline',
      },
      {
        layout: 'bullets',
        title:  'Strategic Priorities',
        bullets: [
          'Expand enterprise sales motion: target Fortune 500 vertical',
          'Launch APAC region: Singapore office opening October 2025',
          'Platform migration to cloud-native architecture by Q4',
          'Acquire talent: 40 engineers and 12 enterprise AEs',
        ],
        accentColor: '#0052CC',
        icon: 'flag-outline',
      },
      {
        layout: 'content',
        title:  'Decisions Required',
        body:   'The board is asked to approve the following: (1) $8M additional capex for data center expansion in Singapore. (2) Equity top-up of 1.5% for the new CPO hire. (3) Revised revenue guidance of $52M for FY2025.',
        accentColor: '#0052CC',
        icon: 'checkmark-circle-outline',
      },
      {
        layout: 'closing',
        title:  'Thank You',
        subtitle: 'Appendix and detailed financials follow',
        accentColor: '#0052CC',
        icon: 'document-text-outline',
      },
    ],
  },

  // ── 3. RESEARCH BRIEFING ──────────────────────────────────────────────────
  {
    id:          'research-briefing',
    name:        'Research Briefing',
    description: 'AI-research report → visual briefing with findings and predictions',
    category:    'academic',
    icon:        'flask-outline',
    gradient:    ['#8B5CF6', '#6C63FF'],
    tag:         'DeepDive',
    slideCount:  6,
    suggestedTheme: 'dark',
    slides: [
      {
        layout: 'title',
        title:  'Research Briefing',
        subtitle: 'Key Findings & Strategic Implications · DeepDive AI',
        badgeText: 'Expert Analysis',
        accentColor: '#8B5CF6',
        icon: 'flask-outline',
      },
      {
        layout: 'content',
        title:  'Executive Summary',
        body:   'Replace this with your report\'s executive summary. Keep it to 3–4 sentences covering the core insight, supporting evidence, and so-what implication for your audience.',
        accentColor: '#8B5CF6',
        icon: 'document-text-outline',
      },
      {
        layout: 'bullets',
        title:  'Key Findings',
        bullets: [
          'Finding 1: Add your first key insight here',
          'Finding 2: Add your second key insight here',
          'Finding 3: Add your third key insight here',
          'Finding 4: Add your fourth key insight here',
          'Finding 5: Add your fifth key insight here',
        ],
        accentColor: '#8B5CF6',
        icon: 'checkmark-circle-outline',
      },
      {
        layout: 'stats',
        title:  'Key Statistics',
        stats: [
          { value: 'XX%',  label: 'Statistic label from report', color: '#8B5CF6' },
          { value: '$XB',  label: 'Market metric from report',   color: '#6C63FF' },
          { value: 'X.Xx', label: 'Growth multiplier',          color: '#4FACFE' },
        ],
        accentColor: '#8B5CF6',
        icon: 'analytics-outline',
      },
      {
        layout: 'predictions',
        title:  'Future Outlook',
        bullets: [
          'Prediction 1: Short-term (6–12 months) outcome',
          'Prediction 2: Medium-term (1–3 years) market shift',
          'Prediction 3: Long-term (5+ years) structural change',
        ],
        accentColor: '#8B5CF6',
        icon: 'telescope-outline',
      },
      {
        layout: 'closing',
        title:  'Questions & Discussion',
        subtitle: 'Full report available via DeepDive AI',
        accentColor: '#8B5CF6',
        icon: 'chatbubble-ellipses-outline',
      },
    ],
  },

  // ── 4. PRODUCT LAUNCH ─────────────────────────────────────────────────────
  {
    id:          'product-launch',
    name:        'Product Launch',
    description: 'Announcement deck: problem, product reveal, features, roadmap',
    category:    'business',
    icon:        'megaphone-outline',
    gradient:    ['#43E97B', '#38F9D7'],
    slideCount:  5,
    suggestedTheme: 'vibrant',
    slides: [
      {
        layout: 'title',
        title:  'Introducing [Product Name]',
        subtitle: 'The next generation of [what it does] — available now',
        badgeText: 'Now Live',
        accentColor: '#43E97B',
        icon: 'megaphone-outline',
      },
      {
        layout: 'quote',
        quote:  '"We built this because we were tired of [the pain]. Now you don\'t have to be."',
        quoteAttribution: '— Founder, [Company Name]',
        title: 'Why We Built This',
        accentColor: '#43E97B',
        icon: 'chatbubble-ellipses-outline',
      },
      {
        layout: 'bullets',
        title:  'What Makes It Different',
        bullets: [
          '10× faster than alternatives thanks to our proprietary engine',
          'Works with your existing tools — zero migration required',
          'Privacy-first: your data never leaves your infrastructure',
          'One flat price, no seat limits, no hidden fees',
        ],
        accentColor: '#43E97B',
        icon: 'sparkles-outline',
      },
      {
        layout: 'stats',
        title:  'Early Results',
        stats: [
          { value: '87%',   label: 'Time saved per task',    color: '#43E97B' },
          { value: '4.9★',  label: 'Customer rating',        color: '#38F9D7' },
          { value: '2,400', label: 'Beta users onboarded',   color: '#FFA726' },
        ],
        accentColor: '#43E97B',
        icon: 'stats-chart-outline',
      },
      {
        layout: 'closing',
        title:  'Start Free Today',
        subtitle: 'No credit card required · 14-day trial · Cancel anytime',
        accentColor: '#43E97B',
        icon: 'arrow-forward-outline',
      },
    ],
  },

  // ── 5. MARKET ANALYSIS ────────────────────────────────────────────────────
  {
    id:          'market-analysis',
    name:        'Market Analysis',
    description: 'Competitive landscape, TAM/SAM/SOM, trends, positioning',
    category:    'data_driven',
    icon:        'bar-chart-outline',
    gradient:    ['#FFA726', '#FF7043'],
    slideCount:  5,
    suggestedTheme: 'corporate',
    slides: [
      {
        layout: 'title',
        title:  'Market Analysis',
        subtitle: '[Industry Name] · [Year] Landscape Report',
        badgeText: 'Deep Dive',
        accentColor: '#FFA726',
        icon: 'bar-chart-outline',
      },
      {
        layout: 'stats',
        title:  'Market Size',
        stats: [
          { value: '$XXB',  label: 'TAM (Total Addressable)',   color: '#FFA726' },
          { value: '$XXB',  label: 'SAM (Serviceable)',         color: '#FF7043' },
          { value: '$XXM',  label: 'SOM (Obtainable)',          color: '#29B6F6' },
        ],
        accentColor: '#FFA726',
        icon: 'analytics-outline',
      },
      {
        layout: 'bullets',
        title:  'Key Trends Shaping the Market',
        bullets: [
          'Trend 1: Describe the most important macro shift',
          'Trend 2: Technology driver accelerating adoption',
          'Trend 3: Regulatory change creating opportunity',
          'Trend 4: Demographic shift in target customer base',
          'Trend 5: Emerging substitute or complement technology',
        ],
        accentColor: '#FFA726',
        icon: 'trending-up-outline',
      },
      {
        layout: 'chart_ref',
        title:  'Competitive Landscape',
        body:   'Describe the competitive positioning matrix here. Who are the incumbents, challengers, and niche players? Where does whitespace exist for disruption? Which competitors are most direct and why?',
        accentColor: '#FFA726',
        icon: 'git-network-outline',
      },
      {
        layout: 'predictions',
        title:  'Where the Market Is Going',
        bullets: [
          '2025: Consolidation of top 3 players acquires 70% market share',
          '2026: AI-native entrants disrupt traditional pricing models',
          '2027: Regulation enforces data portability across all platforms',
          '2028: Market bifurcates into enterprise-grade and prosumer tiers',
        ],
        accentColor: '#FFA726',
        icon: 'telescope-outline',
      },
    ],
  },

  // ── 6. TEAM INTRODUCTION ──────────────────────────────────────────────────
  {
    id:          'team-introduction',
    name:        'Team Introduction',
    description: 'Introduce team members, roles, track record, and culture',
    category:    'business',
    icon:        'people-outline',
    gradient:    ['#6C63FF', '#8B5CF6'],
    slideCount:  4,
    suggestedTheme: 'dark',
    slides: [
      {
        layout: 'section',
        title:  'Meet the Team',
        sectionTag: 'Our People',
        accentColor: '#6C63FF',
        icon: 'people-outline',
      },
      {
        layout: 'bullets',
        title:  'Leadership Team',
        bullets: [
          'CEO: [Name] — Previously [Company], [X] years in [field]',
          'CTO: [Name] — Built [notable product], [Y] patents',
          'CPO: [Name] — Led product at [Company] from $1M to $100M ARR',
          'CFO: [Name] — Previously [Bank/Fund], [Z] exit experience',
        ],
        accentColor: '#6C63FF',
        icon: 'ribbon-outline',
      },
      {
        layout: 'stats',
        title:  'Collective Track Record',
        stats: [
          { value: '47+',  label: 'Years combined experience', color: '#6C63FF' },
          { value: '3',    label: 'Successful exits',         color: '#43E97B' },
          { value: '$2.1B',label: 'Value created',            color: '#FFA726' },
        ],
        accentColor: '#6C63FF',
        icon: 'trophy-outline',
      },
      {
        layout: 'content',
        title:  'Our Culture',
        body:   'We believe the best products are built by teams that care deeply about the problem and the customer. We operate with radical transparency, hire for trajectory over pedigree, and default to action over analysis paralysis.',
        accentColor: '#6C63FF',
        icon: 'heart-outline',
      },
    ],
  },

  // ── 7. QUARTERLY REVIEW ───────────────────────────────────────────────────
  {
    id:          'quarterly-review',
    name:        'Quarterly Review',
    description: 'OKR progress, wins, misses, and plan for next quarter',
    category:    'corporate',
    icon:        'calendar-outline',
    gradient:    ['#29B6F6', '#4FACFE'],
    slideCount:  5,
    suggestedTheme: 'corporate',
    slides: [
      {
        layout: 'title',
        title:  'Q3 2025 Review',
        subtitle: '[Team / Company Name] · October 2025',
        badgeText: 'Internal',
        accentColor: '#29B6F6',
        icon: 'calendar-outline',
      },
      {
        layout: 'stats',
        title:  'OKR Progress',
        stats: [
          { value: '92%',  label: 'Objective 1 complete',     color: '#43E97B' },
          { value: '74%',  label: 'Objective 2 complete',     color: '#FFA726' },
          { value: '101%', label: 'Objective 3 achieved',     color: '#29B6F6' },
        ],
        accentColor: '#29B6F6',
        icon: 'checkmark-circle-outline',
      },
      {
        layout: 'bullets',
        title:  'Wins This Quarter',
        bullets: [
          '✅ Shipped [Feature] — 3 weeks ahead of schedule',
          '✅ Closed [Customer] — largest deal in company history',
          '✅ Reduced infrastructure costs by 34%',
          '✅ Onboarded 12 new team members with zero regrettable attrition',
        ],
        accentColor: '#29B6F6',
        icon: 'trophy-outline',
      },
      {
        layout: 'bullets',
        title:  'Learnings & Misses',
        bullets: [
          '⚠️ Launch delayed 2 weeks: underestimated QA scope',
          '⚠️ Pipeline missed by 15%: enterprise sales cycle longer than modeled',
          '⚠️ Tech debt slowed feature velocity in August',
          '→ Action: dedicated sprint zero before each major milestone',
        ],
        accentColor: '#29B6F6',
        icon: 'alert-circle-outline',
      },
      {
        layout: 'predictions',
        title:  'Q4 Priorities',
        bullets: [
          'Ship v2.0 platform: target December 1st hard deadline',
          'Close 5 enterprise logos to hit ARR target',
          'Hire VP of Sales with APAC network',
          'Reduce churn from 4.2% → 2.5% monthly',
        ],
        accentColor: '#29B6F6',
        icon: 'flag-outline',
      },
    ],
  },

  // ── 8. CASE STUDY ─────────────────────────────────────────────────────────
  {
    id:          'case-study',
    name:        'Case Study',
    description: 'Customer success story: challenge → approach → results',
    category:    'business',
    icon:        'document-text-outline',
    gradient:    ['#EC4899', '#F093FB'],
    slideCount:  5,
    suggestedTheme: 'light',
    slides: [
      {
        layout: 'title',
        title:  '[Customer Name] Case Study',
        subtitle: 'How [Company] achieved [specific result] with [Solution]',
        badgeText: 'Success Story',
        accentColor: '#EC4899',
        icon: 'star-outline',
      },
      {
        layout: 'content',
        title:  'The Challenge',
        body:   'Describe what the customer was struggling with before they found your solution. Include the scope (team size, volume, time), the impact of the problem (cost, lost opportunity), and what they had tried before.',
        accentColor: '#EC4899',
        icon: 'alert-circle-outline',
      },
      {
        layout: 'bullets',
        title:  'Our Approach',
        bullets: [
          'Phase 1: Discovery and audit of existing workflows (Week 1–2)',
          'Phase 2: Custom configuration and integration (Week 3–4)',
          'Phase 3: Team training and change management (Week 5)',
          'Phase 4: Go-live, monitoring, and optimisation (Week 6+)',
        ],
        accentColor: '#EC4899',
        icon: 'layers-outline',
      },
      {
        layout: 'stats',
        title:  'The Results',
        stats: [
          { value: '3.4×',  label: 'Productivity increase',   color: '#EC4899' },
          { value: '68%',   label: 'Cost reduction',          color: '#43E97B' },
          { value: '$1.2M', label: 'Annual savings',          color: '#FFA726' },
        ],
        accentColor: '#EC4899',
        icon: 'trending-up-outline',
      },
      {
        layout: 'quote',
        quote:  '"Add a direct customer quote here that captures the transformation they experienced."',
        quoteAttribution: '— [Name], [Title] at [Company]',
        title: 'In Their Words',
        accentColor: '#EC4899',
        icon: 'chatbubble-ellipses-outline',
      },
    ],
  },

  // ── 9. TECHNOLOGY OVERVIEW ────────────────────────────────────────────────
  {
    id:          'tech-overview',
    name:        'Technology Overview',
    description: 'Architecture, stack, security, and scalability deep-dive',
    category:    'academic',
    icon:        'cpu-outline',
    gradient:    ['#6C63FF', '#4FACFE'],
    slideCount:  5,
    suggestedTheme: 'dark',
    slides: [
      {
        layout: 'title',
        title:  'Technology Overview',
        subtitle: 'Architecture, Stack & Security · Technical Briefing',
        badgeText: 'Technical',
        accentColor: '#6C63FF',
        icon: 'cpu-outline',
      },
      {
        layout: 'bullets',
        title:  'Technology Stack',
        bullets: [
          'Frontend: [Framework] — chosen for performance and DX',
          'Backend: [Language/Framework] — handles [X] req/sec at P99 <50ms',
          'Database: [DB] with [replication strategy] for 99.99% uptime',
          'Infrastructure: Multi-region [Cloud] with auto-scaling',
          'AI/ML: [Model/Framework] for real-time inference at edge',
        ],
        accentColor: '#6C63FF',
        icon: 'code-outline',
      },
      {
        layout: 'content',
        title:  'Architecture Principles',
        body:   'Our system is designed around three core principles: (1) Reliability — we use event-driven architecture with guaranteed message delivery and idempotent operations. (2) Scalability — every service is stateless and horizontally scalable. (3) Security — zero-trust networking with end-to-end encryption and SOC 2 Type II compliance.',
        accentColor: '#6C63FF',
        icon: 'server-outline',
      },
      {
        layout: 'stats',
        title:  'Performance & Scale',
        stats: [
          { value: '99.99%', label: 'Uptime SLA',           color: '#43E97B' },
          { value: '<50ms',  label: 'P99 response time',    color: '#6C63FF' },
          { value: '50M+',   label: 'Requests / day',       color: '#4FACFE' },
        ],
        accentColor: '#6C63FF',
        icon: 'flash-outline',
      },
      {
        layout: 'bullets',
        title:  'Security & Compliance',
        bullets: [
          'SOC 2 Type II certified (audit report available on request)',
          'End-to-end encryption: AES-256 at rest, TLS 1.3 in transit',
          'GDPR, CCPA, HIPAA compliant with BAA available',
          'Penetration tested quarterly by [Security Firm]',
          'Bug bounty programme via HackerOne',
        ],
        accentColor: '#6C63FF',
        icon: 'shield-checkmark-outline',
      },
    ],
  },

  // ── 10. MINIMAL CLEAN ─────────────────────────────────────────────────────
  {
    id:          'minimal-clean',
    name:        'Minimal Clean',
    description: 'Ultra-minimal design: one idea per slide, maximum whitespace',
    category:    'minimal',
    icon:        'square-outline',
    gradient:    ['#E0E0E0', '#BDBDBD'],
    tag:         'Elegant',
    slideCount:  4,
    suggestedTheme: 'light',
    slides: [
      {
        layout: 'title',
        title:  'One Big Idea',
        subtitle: 'Presented by [Name] · [Date]',
        accentColor: '#6C63FF',
        icon: 'square-outline',
      },
      {
        layout: 'content',
        title:  'The Context',
        body:   'A single focused paragraph that sets up everything that follows. No bullet points. No noise. Just the essential context your audience needs to understand the idea.',
        accentColor: '#6C63FF',
        icon: 'document-text-outline',
      },
      {
        layout: 'quote',
        quote:  '"The best presentations have one crystal-clear idea. Everything else is detail."',
        quoteAttribution: '— Presentation Wisdom',
        title: 'The Big Idea',
        accentColor: '#6C63FF',
        icon: 'bulb-outline',
      },
      {
        layout: 'closing',
        title:  'What We Do Next',
        subtitle: 'The single most important next action',
        accentColor: '#6C63FF',
        icon: 'arrow-forward-circle-outline',
      },
    ],
  },

  // ── 11. DATA STORY ────────────────────────────────────────────────────────
  {
    id:          'data-story',
    name:        'Data Story',
    description: 'Lead with data: metrics dashboard, trend analysis, insights',
    category:    'data_driven',
    icon:        'analytics-outline',
    gradient:    ['#4FACFE', '#00F2FE'],
    slideCount:  5,
    suggestedTheme: 'dark',
    slides: [
      {
        layout: 'title',
        title:  'The Data Behind [Topic]',
        subtitle: 'A metrics-driven analysis · [Period]',
        badgeText: 'Data Report',
        accentColor: '#4FACFE',
        icon: 'analytics-outline',
      },
      {
        layout: 'stats',
        title:  'Headline Numbers',
        stats: [
          { value: 'X.X×', label: 'Key growth metric',  color: '#4FACFE' },
          { value: 'XX%',  label: 'Efficiency gain',    color: '#43E97B' },
          { value: '$XM',  label: 'Value created',      color: '#FFA726' },
          { value: 'X,XXX',label: 'Sample size',        color: '#AB47BC' },
        ],
        accentColor: '#4FACFE',
        icon: 'stats-chart-outline',
      },
      {
        layout: 'chart_ref',
        title:  'Trend Analysis',
        body:   'Describe the trend visible in the chart. What does the slope tell us? What happened at the inflection points? What does the projection suggest for the next 12 months if current conditions persist?',
        accentColor: '#4FACFE',
        icon: 'trending-up-outline',
      },
      {
        layout: 'bullets',
        title:  'What the Data Tells Us',
        bullets: [
          'Insight 1: The strongest correlation is between X and Y',
          'Insight 2: Cohort A outperforms cohort B by 34% on retention',
          'Insight 3: Seasonality peaks in Q2 and Q4 consistently',
          'Insight 4: North region drives 60% of growth despite 40% of spend',
          'Insight 5: The highest-value users have one behaviour in common',
        ],
        accentColor: '#4FACFE',
        icon: 'bulb-outline',
      },
      {
        layout: 'content',
        title:  'Recommendations',
        body:   'Based on the analysis, we recommend three actions: First, reallocate budget toward the highest-ROI channel identified in the cohort study. Second, run an A/B test on the onboarding flow for new user cohorts. Third, instrument the product for the missing metric that would complete our data picture.',
        accentColor: '#4FACFE',
        icon: 'checkmark-done-outline',
      },
    ],
  },

  // ── 12. HERO STORY ────────────────────────────────────────────────────────
  {
    id:          'hero-story',
    name:        'Hero Story',
    description: 'Classic narrative arc: hero, conflict, journey, resolution',
    category:    'storytelling',
    icon:        'book-outline',
    gradient:    ['#FF6584', '#FFA726'],
    slideCount:  5,
    suggestedTheme: 'dark',
    slides: [
      {
        layout: 'title',
        title:  'A Story About [Hero]',
        subtitle: 'How [challenge] became [transformation]',
        accentColor: '#FF6584',
        icon: 'person-outline',
      },
      {
        layout: 'section',
        title:  'Meet the Hero',
        sectionTag: 'Chapter 1',
        accentColor: '#FF6584',
        icon: 'person-outline',
      },
      {
        layout: 'content',
        title:  'The Conflict',
        body:   'Every great story needs conflict. Describe the challenge the hero faces — the external obstacle, the internal fear, and the stakes if they fail. Make it visceral and relatable.',
        accentColor: '#FF6584',
        icon: 'alert-circle-outline',
      },
      {
        layout: 'bullets',
        title:  'The Journey',
        bullets: [
          'First attempt: What they tried and why it failed',
          'The turning point: What changed everything',
          'The helper: Who or what gave them the tools to succeed',
          'The breakthrough: The moment it all clicked',
        ],
        accentColor: '#FF6584',
        icon: 'map-outline',
      },
      {
        layout: 'quote',
        quote:  '"The resolution. In the hero\'s own words — the transformation, the lesson, the new world."',
        quoteAttribution: '— The Hero',
        title: 'The Resolution',
        accentColor: '#FF6584',
        icon: 'sparkles-outline',
      },
    ],
  },

  // ── 13. BEFORE & AFTER ────────────────────────────────────────────────────
  {
    id:          'before-after',
    name:        'Before & After',
    description: 'Contrast old state vs new state with dramatic visual impact',
    category:    'storytelling',
    icon:        'swap-horizontal-outline',
    gradient:    ['#43E97B', '#0052CC'],
    slideCount:  4,
    suggestedTheme: 'dark',
    slides: [
      {
        layout: 'title',
        title:  'The Transformation',
        subtitle: 'What changed and why it matters',
        badgeText: 'Case Study',
        accentColor: '#43E97B',
        icon: 'swap-horizontal-outline',
      },
      {
        layout: 'bullets',
        title:  '⚠️ The Before State',
        bullets: [
          'Pain point 1: The most frustrating daily problem',
          'Pain point 2: The workaround that wasted hours each week',
          'Pain point 3: The error rate that hurt quality and morale',
          'Cost: $X per month in wasted time and rework',
        ],
        accentColor: '#FF4757',
        icon: 'close-circle-outline',
      },
      {
        layout: 'bullets',
        title:  '✅ The After State',
        bullets: [
          'Outcome 1: The same task now takes minutes, not hours',
          'Outcome 2: Error rate dropped to near zero automatically',
          'Outcome 3: Team redirected to higher-value creative work',
          'Saving: $X per month recovered · ROI achieved in 6 weeks',
        ],
        accentColor: '#43E97B',
        icon: 'checkmark-circle-outline',
      },
      {
        layout: 'stats',
        title:  'The Delta',
        stats: [
          { value: '−80%', label: 'Time on manual work',   color: '#43E97B' },
          { value: '+340%',label: 'Output per person',      color: '#4FACFE' },
          { value: '6wks', label: 'Payback period',         color: '#FFA726' },
        ],
        accentColor: '#43E97B',
        icon: 'trending-up-outline',
      },
    ],
  },

  // ── 14. ROADMAP ───────────────────────────────────────────────────────────
  {
    id:          'roadmap',
    name:        'Product Roadmap',
    description: 'Strategic timeline with milestones, owners, and priorities',
    category:    'business',
    icon:        'map-outline',
    gradient:    ['#AB47BC', '#8B5CF6'],
    slideCount:  4,
    suggestedTheme: 'dark',
    slides: [
      {
        layout: 'title',
        title:  '[Product] Roadmap 2025',
        subtitle: 'From vision to execution — quarterly milestones',
        badgeText: 'Strategic',
        accentColor: '#AB47BC',
        icon: 'map-outline',
      },
      {
        layout: 'bullets',
        title:  'Q1 Milestones',
        bullets: [
          '🏁 Launch [Feature A]: resolves top customer request (#1 on roadmap)',
          '🏁 Ship [Integration B]: unlocks enterprise customer segment',
          '🏁 Complete [Infrastructure C]: unlocks 10× scale capacity',
        ],
        accentColor: '#AB47BC',
        icon: 'calendar-outline',
      },
      {
        layout: 'bullets',
        title:  'Q2–Q3 Milestones',
        bullets: [
          '🎯 [Feature D]: AI-powered automation layer (requires Q1 infra)',
          '🎯 [Feature E]: Mobile-first redesign for prosumer segment',
          '🎯 [Feature F]: Self-serve enterprise onboarding cuts sales cycle',
          '🎯 APAC region launch: localization and compliance complete',
        ],
        accentColor: '#AB47BC',
        icon: 'flag-outline',
      },
      {
        layout: 'predictions',
        title:  'Q4 Vision & Beyond',
        bullets: [
          'Platform ecosystem: open API and third-party marketplace',
          'AI co-pilot: proactive suggestions across all workflows',
          'International expansion: EU and LATAM markets',
          'IPO readiness: SOX compliance and public company governance',
        ],
        accentColor: '#AB47BC',
        icon: 'telescope-outline',
      },
    ],
  },

  // ── 15. SWOT ANALYSIS ─────────────────────────────────────────────────────
  {
    id:          'swot-analysis',
    name:        'SWOT Analysis',
    description: 'Structured strategic assessment: strengths, weaknesses, opportunities, threats',
    category:    'corporate',
    icon:        'grid-outline',
    gradient:    ['#FFA726', '#FF7043'],
    slideCount:  3,
    suggestedTheme: 'corporate',
    slides: [
      {
        layout: 'title',
        title:  'SWOT Analysis',
        subtitle: '[Company / Product / Initiative] · Strategic Assessment',
        badgeText: 'Strategy',
        accentColor: '#FFA726',
        icon: 'grid-outline',
      },
      {
        layout: 'bullets',
        title:  'Strengths & Weaknesses',
        bullets: [
          '💪 S: Our strongest differentiator vs competitors',
          '💪 S: Deep customer relationships and high NPS',
          '💪 S: Proprietary technology / data advantage',
          '⚠️ W: Limited brand awareness in new markets',
          '⚠️ W: Technical debt slowing feature velocity',
          '⚠️ W: Single geography concentration risk',
        ],
        accentColor: '#FFA726',
        icon: 'layers-outline',
      },
      {
        layout: 'bullets',
        title:  'Opportunities & Threats',
        bullets: [
          '🚀 O: Regulatory change creates $XB greenfield market',
          '🚀 O: Incumbent [Competitor] product aging out — switching window',
          '🚀 O: AI/ML can automate our biggest cost center',
          '🛡️ T: Well-funded new entrant with 10× our marketing budget',
          '🛡️ T: Platform risk — dependency on [Third Party] for distribution',
          '🛡️ T: Economic slowdown compressing enterprise buying cycles',
        ],
        accentColor: '#FFA726',
        icon: 'shield-checkmark-outline',
      },
    ],
  },

  // ── 16. ACADEMIC LECTURE ──────────────────────────────────────────────────
  {
    id:          'academic-lecture',
    name:        'Academic Lecture',
    description: 'University-style lecture: learning objectives, theory, examples, Q&A',
    category:    'academic',
    icon:        'school-outline',
    gradient:    ['#0052CC', '#8B5CF6'],
    slideCount:  5,
    suggestedTheme: 'light',
    slides: [
      {
        layout: 'title',
        title:  'Lecture [N]: [Topic]',
        subtitle: '[Course Name] · [Institution] · [Term]',
        badgeText: 'Lecture',
        accentColor: '#0052CC',
        icon: 'school-outline',
      },
      {
        layout: 'bullets',
        title:  'Learning Objectives',
        bullets: [
          'By the end of this lecture, you will understand [concept 1]',
          'You will be able to apply [concept 2] to real-world problems',
          'You will critically evaluate [concept 3] in literature',
          'You will design a solution using [framework or method]',
        ],
        accentColor: '#0052CC',
        icon: 'checkmark-circle-outline',
      },
      {
        layout: 'content',
        title:  'Core Theory',
        body:   'Present the foundational concept in plain language. Build from first principles. Use an analogy to make the abstract concrete. Then introduce the formal definition or framework. Cite the seminal paper or thinker.',
        accentColor: '#0052CC',
        icon: 'book-outline',
      },
      {
        layout: 'bullets',
        title:  'Worked Example',
        bullets: [
          'Step 1: Set up the problem — state the givens and unknowns',
          'Step 2: Choose the appropriate model or framework',
          'Step 3: Apply the model — show the working',
          'Step 4: Interpret the result — what does it tell us?',
          'Step 5: Validate — does this make intuitive sense?',
        ],
        accentColor: '#0052CC',
        icon: 'calculator-outline',
      },
      {
        layout: 'closing',
        title:  'Questions?',
        subtitle: 'Next lecture: [Topic] · Reading: [Textbook] Ch. X',
        accentColor: '#0052CC',
        icon: 'chatbubble-ellipses-outline',
      },
    ],
  },

  // ── 17. INVESTOR UPDATE ───────────────────────────────────────────────────
  {
    id:          'investor-update',
    name:        'Investor Update',
    description: 'Monthly/quarterly update for existing investors',
    category:    'pitch_deck',
    icon:        'cash-outline',
    gradient:    ['#43E97B', '#0052CC'],
    slideCount:  5,
    suggestedTheme: 'dark',
    slides: [
      {
        layout: 'title',
        title:  '[Company] Investor Update',
        subtitle: '[Month Year] · Confidential · Not for Distribution',
        badgeText: 'Investor Only',
        accentColor: '#43E97B',
        icon: 'cash-outline',
      },
      {
        layout: 'stats',
        title:  'Headline Metrics',
        stats: [
          { value: '$XXM',  label: 'ARR (↑X% MoM)',         color: '#43E97B' },
          { value: 'XXX',   label: 'Customers (↑X this mo)',  color: '#4FACFE' },
          { value: '$XX k', label: 'MRR from new logos',     color: '#FFA726' },
          { value: 'Xmo',   label: 'Runway remaining',       color: '#AB47BC' },
        ],
        accentColor: '#43E97B',
        icon: 'stats-chart-outline',
      },
      {
        layout: 'bullets',
        title:  'Wins This Month',
        bullets: [
          'Signed [Customer] — our first [industry] enterprise logo',
          'Launched [Feature] — 87% of users adopted in first week',
          'Reduced churn from X% to Y% — new CS playbook working',
          'Press: featured in [Publication] — 4,200 inbound signups',
        ],
        accentColor: '#43E97B',
        icon: 'trophy-outline',
      },
      {
        layout: 'bullets',
        title:  'Where We Need Help',
        bullets: [
          'Intros: VP Sales with healthcare vertical experience',
          'Intros: CISOs at Fortune 500 for enterprise pilot conversations',
          'Expertise: Advice on APAC market entry — who should we hire?',
          'Press: Journalist intros at [Target Publications]',
        ],
        accentColor: '#43E97B',
        icon: 'people-outline',
      },
      {
        layout: 'content',
        title:  'Focus for Next Month',
        body:   'We are heads-down on three things: (1) Close the pipeline of 8 enterprise trials currently in legal review. (2) Ship the self-serve onboarding flow that eliminates the 2-week sales assisted setup. (3) Hire the VP of Sales — three finalists in final round interviews.',
        accentColor: '#43E97B',
        icon: 'flag-outline',
      },
    ],
  },

  // ── 18. CREATIVE PORTFOLIO ────────────────────────────────────────────────
  {
    id:          'creative-portfolio',
    name:        'Creative Portfolio',
    description: 'Visual-first portfolio: work showcase with context and impact',
    category:    'creative',
    icon:        'color-palette-outline',
    gradient:    ['#FF6584', '#AB47BC'],
    tag:         'Visual',
    slideCount:  4,
    suggestedTheme: 'vibrant',
    slides: [
      {
        layout: 'title',
        title:  '[Your Name] Portfolio',
        subtitle: '[Discipline] · [City] · Available for [Type] projects',
        badgeText: '2025',
        accentColor: '#FF6584',
        icon: 'color-palette-outline',
      },
      {
        layout: 'section',
        title:  'Featured Work',
        sectionTag: 'Selected Projects',
        accentColor: '#FF6584',
        icon: 'image-outline',
      },
      {
        layout: 'bullets',
        title:  'My Process',
        bullets: [
          '01 — Discover: Deep dive into the brief, brand, and audience',
          '02 — Define: Frame the creative problem and success criteria',
          '03 — Design: Explore, iterate, and prototype multiple directions',
          '04 — Deliver: Refine, present, and hand off production-ready assets',
        ],
        accentColor: '#FF6584',
        icon: 'layers-outline',
      },
      {
        layout: 'closing',
        title:  "Let's Work Together",
        subtitle: 'hello@[yourname].com · [portfolio URL]',
        accentColor: '#FF6584',
        icon: 'mail-outline',
      },
    ],
  },

  // ── 19. ANNUAL REPORT ─────────────────────────────────────────────────────
  {
    id:          'annual-report',
    name:        'Annual Report',
    description: 'Year in review: milestones, financials, outlook',
    category:    'corporate',
    icon:        'ribbon-outline',
    gradient:    ['#0052CC', '#29B6F6'],
    slideCount:  5,
    suggestedTheme: 'corporate',
    slides: [
      {
        layout: 'title',
        title:  '2025 Annual Report',
        subtitle: '[Company Name] · Fiscal Year 2025 Summary',
        badgeText: 'FY2025',
        accentColor: '#0052CC',
        icon: 'ribbon-outline',
      },
      {
        layout: 'stats',
        title:  'Year in Numbers',
        stats: [
          { value: '$XXM',  label: 'Total Revenue',         color: '#0052CC' },
          { value: 'XX%',   label: 'Revenue Growth YoY',    color: '#43E97B' },
          { value: 'X,XXX', label: 'Employees Worldwide',   color: '#4FACFE' },
          { value: 'XXX',   label: 'Countries Served',      color: '#FFA726' },
        ],
        accentColor: '#0052CC',
        icon: 'stats-chart-outline',
      },
      {
        layout: 'bullets',
        title:  'Year Highlights',
        bullets: [
          'Milestone 1: [Major product launch or partnership]',
          'Milestone 2: [Key market expansion or certification]',
          'Milestone 3: [Award, recognition, or press milestone]',
          'Milestone 4: [Team growth or cultural achievement]',
          'Milestone 5: [Financial milestone or funding round]',
        ],
        accentColor: '#0052CC',
        icon: 'trophy-outline',
      },
      {
        layout: 'content',
        title:  'CEO Letter',
        body:   'Summarise the year with the CEO\'s voice. Acknowledge challenges honestly. Celebrate the team\'s resilience. Paint the vision for the year ahead with specific, believable commitments. End with a call to action for employees, customers, and investors.',
        accentColor: '#0052CC',
        icon: 'person-outline',
      },
      {
        layout: 'predictions',
        title:  '2026 Outlook',
        bullets: [
          'Revenue target: $XXM (↑XX% YoY growth expected)',
          'Product: Ship 3 major platform features and 2 new integrations',
          'Team: Grow from XXX to XXX employees with focus on [department]',
          'Market: Enter [Region] and establish [Vertical] as primary growth vector',
        ],
        accentColor: '#0052CC',
        icon: 'telescope-outline',
      },
    ],
  },

  // ── 20. TRAINING & ONBOARDING ─────────────────────────────────────────────
  {
    id:          'training-onboarding',
    name:        'Training & Onboarding',
    description: 'Step-by-step training with objectives, modules, and knowledge checks',
    category:    'corporate',
    icon:        'construct-outline',
    gradient:    ['#FFA726', '#43E97B'],
    slideCount:  5,
    suggestedTheme: 'light',
    slides: [
      {
        layout: 'title',
        title:  '[Training Name]',
        subtitle: 'Module [N] of [Total] · [Department] · [Duration]',
        badgeText: 'Training',
        accentColor: '#FFA726',
        icon: 'construct-outline',
      },
      {
        layout: 'agenda',
        title:  "What We'll Cover",
        bullets: [
          'Section 1: [Topic] — understanding the foundation',
          'Section 2: [Topic] — hands-on walkthrough',
          'Section 3: [Topic] — common pitfalls and FAQs',
          'Practice: Live exercise with feedback',
          'Knowledge check: Quick assessment',
          'Resources: Where to go for help',
        ],
        accentColor: '#FFA726',
        icon: 'list-outline',
      },
      {
        layout: 'bullets',
        title:  'Key Concepts',
        bullets: [
          'Concept 1: Definition and why it matters for your role',
          'Concept 2: How it connects to other processes you use daily',
          'Concept 3: The most common mistake — and how to avoid it',
          'Concept 4: Pro tip from the team\'s most experienced members',
        ],
        accentColor: '#FFA726',
        icon: 'bulb-outline',
      },
      {
        layout: 'bullets',
        title:  'Knowledge Check',
        bullets: [
          'Q1: What is the first step when [scenario occurs]?',
          'Q2: Who should you contact when [exception happens]?',
          'Q3: What is the SLA for [process] and what are the consequences?',
          'Q4: Name two best practices for [skill being trained]',
        ],
        accentColor: '#FFA726',
        icon: 'help-circle-outline',
      },
      {
        layout: 'closing',
        title:  'You\'re Ready!',
        subtitle: 'Complete the assessment in your LMS to earn your certificate',
        accentColor: '#FFA726',
        icon: 'ribbon-outline',
      },
    ],
  },

  // ── 21. COMPETITIVE TEARDOWN ──────────────────────────────────────────────
  {
    id:          'competitive-teardown',
    name:        'Competitive Teardown',
    description: 'Deep-dive competitor analysis: positioning, gaps, and strategy',
    category:    'data_driven',
    icon:        'git-compare-outline',
    gradient:    ['#FF4757', '#FF6584'],
    slideCount:  4,
    suggestedTheme: 'dark',
    slides: [
      {
        layout: 'title',
        title:  'Competitive Teardown',
        subtitle: '[Competitor Name] — Analysis & Implications',
        badgeText: 'Competitive Intel',
        accentColor: '#FF4757',
        icon: 'git-compare-outline',
      },
      {
        layout: 'bullets',
        title:  'Their Strengths',
        bullets: [
          'Market position: [X]% share, [Y] years as category leader',
          'Product: Best-in-class [feature] with deep enterprise integrations',
          'Brand: Trusted by [# Fortune 500] companies, high switching costs',
          'Distribution: [Channel] gives them [advantage] we must account for',
        ],
        accentColor: '#FF4757',
        icon: 'shield-checkmark-outline',
      },
      {
        layout: 'bullets',
        title:  'Their Weaknesses (Our Openings)',
        bullets: [
          'Gap 1: Product not built for [our target use case] — customers complain',
          'Gap 2: Pricing: [2–3×] more expensive with no self-serve option',
          'Gap 3: Speed: last major release was 18 months ago — roadmap stalled',
          'Gap 4: Support: 72-hour response SLA vs our 4-hour commitment',
          'Gap 5: [New technology] not on their roadmap — our biggest wedge',
        ],
        accentColor: '#FF4757',
        icon: 'trending-down-outline',
      },
      {
        layout: 'content',
        title:  'Our Counter-Strategy',
        body:   'We win by targeting their most dissatisfied segment — [specific customer profile] who have outgrown [their product limitation]. Our positioning is: we give [persona] the power of [competitor] without [their biggest pain], at a price that makes the ROI case in week one.',
        accentColor: '#FF4757',
        icon: 'flag-outline',
      },
    ],
  },

  // ── 22. VISION & STRATEGY ─────────────────────────────────────────────────
  {
    id:          'vision-strategy',
    name:        'Vision & Strategy',
    description: 'Long-term vision, mission, values, and strategic pillars',
    category:    'corporate',
    icon:        'telescope-outline',
    gradient:    ['#6C63FF', '#AB47BC'],
    tag:         'Leadership',
    slideCount:  5,
    suggestedTheme: 'dark',
    slides: [
      {
        layout: 'title',
        title:  'Vision & Strategy 2025–2030',
        subtitle: '[Company Name] · Strategic Planning Session',
        badgeText: 'Confidential',
        accentColor: '#6C63FF',
        icon: 'telescope-outline',
      },
      {
        layout: 'quote',
        quote:  '"Our mission is to [what you do] for [who you serve] so that [the outcome you unlock]."',
        quoteAttribution: '— Our North Star',
        title: 'Our Mission',
        accentColor: '#6C63FF',
        icon: 'compass-outline',
      },
      {
        layout: 'bullets',
        title:  'Our Core Values',
        bullets: [
          'Value 1: [Name] — what it means in practice every day',
          'Value 2: [Name] — how we make decisions when it is hard',
          'Value 3: [Name] — how we treat customers, team, and community',
          'Value 4: [Name] — our commitment to continuous improvement',
        ],
        accentColor: '#6C63FF',
        icon: 'heart-outline',
      },
      {
        layout: 'bullets',
        title:  'Strategic Pillars',
        bullets: [
          'Pillar 1: [Name] — our primary growth engine for 2025–2027',
          'Pillar 2: [Name] — the platform investment that enables everything',
          'Pillar 3: [Name] — the ecosystem play for 2027 and beyond',
        ],
        accentColor: '#6C63FF',
        icon: 'layers-outline',
      },
      {
        layout: 'stats',
        title:  '2030 Targets',
        stats: [
          { value: '$1B',   label: 'Revenue Target',         color: '#6C63FF' },
          { value: '50+',   label: 'Countries',              color: '#AB47BC' },
          { value: '10,000',label: 'Employees',              color: '#43E97B' },
          { value: '#1',    label: 'Category Position',      color: '#FFA726' },
        ],
        accentColor: '#6C63FF',
        icon: 'rocket-outline',
      },
    ],
  },

];

// ─── Lookup helpers ───────────────────────────────────────────────────────────

export function getTemplateById(id: string): SlideTemplate | undefined {
  return SLIDE_TEMPLATES.find(t => t.id === id);
}

export function getTemplatesByCategory(category: string): SlideTemplate[] {
  if (category === 'all') return SLIDE_TEMPLATES;
  return SLIDE_TEMPLATES.filter(t => t.category === category);
}

export const TEMPLATE_COUNT = SLIDE_TEMPLATES.length; // 22