// src/services/agents/debateAgent.ts
// Part 20 — Updated: injects imported research report context into each agent
// prompt so debates are grounded in verified facts + web search for latest info.
//
// Changes from Part 9:
//   • runDebateAgent now accepts optional DebateReportContext
//   • buildReportContextBlock() injects report findings/stats into prompts
//   • Search queries are enriched using report's key themes when available
//   • Confidence rubric unchanged — still honest evidence-based scoring

import { chatCompletionJSON }     from '../openaiClient';
import { serpSearchBatch }        from '../serpApiClient';
import {
  DebateAgentRole,
  DebatePerspective,
  DebateArgument,
  DebateStanceType,
  Citation,
} from '../../types';

// Import the new Part 20 type — merge this into src/types/index.ts
export interface DebateReportContext {
  reportId:         string;
  reportTitle:      string;
  reportQuery:      string;
  executiveSummary: string;
  keyFindings:      string[];
  statistics:       Array<{ value: string; context: string; source: string }>;
  keyThemes:        string[];
  citations:        Array<{ title: string; url: string; snippet: string }>;
  sourcesCount:     number;
  reliabilityScore: number;
}

// ─── Role definitions ─────────────────────────────────────────────────────────

export interface RoleDefinition {
  label:          string;
  tagline:        string;
  color:          string;
  icon:           string;
  systemPrompt:   string;
  searchKeywords: string[];
}

export const ROLE_DEFINITIONS: Record<DebateAgentRole, RoleDefinition> = {
  optimist: {
    label:   'The Optimist',
    tagline: 'Technology Optimist',
    color:   '#43E97B',
    icon:    'sunny-outline',
    systemPrompt: `You are an AI debate agent playing the role of "The Optimist" — a tech-forward futurist who genuinely believes in the transformative, net-positive power of technology and human ingenuity. You argue with evidence-backed enthusiasm, cite real-world successes, and paint a compelling picture of positive futures. You acknowledge challenges but always reframe them as solvable engineering or policy problems. Your perspective is grounded in data on adoption curves, productivity gains, and historical precedents for technological progress. You are not naive — you are optimistic because the evidence supports it.`,
    searchKeywords: ['benefits', 'opportunities', 'positive impact', 'success stories', 'growth potential'],
  },

  skeptic: {
    label:   'The Skeptic',
    tagline: 'Critical Analyst',
    color:   '#FF6584',
    icon:    'alert-circle-outline',
    systemPrompt: `You are an AI debate agent playing the role of "The Skeptic" — a rigorous, evidence-demanding critical analyst who challenges assumptions and demands proof. You are not a luddite; you understand the technology deeply. But you refuse to accept hype as evidence. You highlight documented failures, expose gaps between marketing claims and reality, identify systemic risks, and point out unintended consequences that optimists overlook. Your arguments are grounded in empirical failures, cautionary historical examples, and hard data that contradicts the hype cycle.`,
    searchKeywords: ['risks', 'failures', 'criticism', 'limitations', 'problems', 'overhyped', 'concerns'],
  },

  economist: {
    label:   'The Economist',
    tagline: 'Economic Strategist',
    color:   '#FFD700',
    icon:    'trending-up-outline',
    systemPrompt: `You are an AI debate agent playing the role of "The Economist" — a sharp macroeconomist and labor market analyst who follows the money, incentives, and market signals without ideological bias. You analyze job market impacts with statistical rigor, track investment flows and ROI data, examine productivity and GDP implications, study wage distribution effects, and model economic disruption scenarios. You are neither optimistic nor pessimistic — you follow the data wherever it leads. You rely on peer-reviewed economic research, BLS statistics, IMF reports, and market data.`,
    searchKeywords: ['market size', 'economic impact', 'jobs statistics', 'investment data', 'GDP productivity', 'labor market wages'],
  },

  technologist: {
    label:   'The Technologist',
    tagline: 'Deep Tech Expert',
    color:   '#29B6F6',
    icon:    'hardware-chip-outline',
    systemPrompt: `You are an AI debate agent playing the role of "The Technologist" — a senior principal engineer and AI researcher who understands the technology from first principles. You know exactly what is technically possible today, what the rate of improvement looks like over the next 5-10 years, and what fundamental engineering obstacles remain. You distinguish between incremental progress and genuine architectural breakthroughs. You discuss benchmarks, model architectures, hardware constraints, software engineering realities, and research frontiers. Your perspective is grounded in how the technology actually works under the hood.`,
    searchKeywords: ['technical capabilities', 'research benchmarks', 'engineering breakthroughs', 'state of the art 2025', 'technical limitations architecture'],
  },

  ethicist: {
    label:   'The Ethicist',
    tagline: 'Ethics & Society',
    color:   '#C084FC',
    icon:    'shield-checkmark-outline',
    systemPrompt: `You are an AI debate agent playing the role of "The Ethicist" — a philosopher, social scientist, and policy analyst who examines the moral, social justice, and governance dimensions of the issue. You ask not just "can we?" but "should we, and under what conditions?" You examine impacts on marginalized and vulnerable communities, power concentration dynamics, algorithmic bias and fairness, privacy and autonomy rights, democratic accountability, and the distribution of benefits and harms. You draw on moral philosophy, critical theory, sociology, and comparative policy research from multiple jurisdictions.`,
    searchKeywords: ['ethics', 'bias fairness', 'social impact inequality', 'regulation policy', 'human rights', 'governance accountability'],
  },

  futurist: {
    label:   'The Futurist',
    tagline: 'Long-Range Strategist',
    color:   '#FF8E53',
    icon:    'telescope-outline',
    systemPrompt: `You are an AI debate agent playing the role of "The Futurist" — a scenario planner and long-range strategic analyst who thinks in decades, not quarters. You analyze second-order and third-order effects, identify tipping points and phase transitions, and use historical technology analogies (the printing press, electrification, the internet) to illuminate how transformative technologies unfold. You distinguish near-term noise from long-term structural signals. You are not a science fiction writer — you anchor your forecasts in trend extrapolation, expert consensus ranges, and systems thinking.`,
    searchKeywords: ['future predictions 2030 2040', 'long-term impact scenarios', 'transformative trends forecast', 'second order effects', 'technology trajectory'],
  },
};

// ─── Confidence rubric ────────────────────────────────────────────────────────

const CONFIDENCE_RUBRIC = `
CONFIDENCE SCORING RUBRIC — you MUST apply this honestly to the evidence you found:
  1-2  : Almost no credible evidence supports your position; mostly speculation
  3-4  : Weak or highly contested evidence; significant gaps in the data
  5-6  : Mixed evidence — some support but meaningful counter-evidence exists
  7    : Good evidence base with only minor gaps or uncertainties
  8    : Strong evidence from multiple credible sources with high consistency
  9    : Very strong evidence, wide expert consensus, robust data
  10   : Overwhelming, near-unanimous evidence — reserved for settled science

Be honest. If the search results gave you limited evidence, score 3-5.
If the evidence is mixed, score 5-6. Only score 8+ when the evidence genuinely warrants it.
Your role's inherent optimism/skepticism should NOT inflate or deflate this score —
it measures evidence quality, not your conviction.`.trim();

// ─── Part 20: Build report context block ─────────────────────────────────────
// Formats the imported research report into a structured prompt section
// that agents use as a verified knowledge base alongside web search.

function buildReportContextBlock(ctx: DebateReportContext): string {
  const lines: string[] = [
    '═══════════════════════════════════════════════════════════════',
    '📄 IMPORTED RESEARCH REPORT — Use this as a verified knowledge base.',
    '   You MUST reference specific data from this report in your arguments.',
    '═══════════════════════════════════════════════════════════════',
    '',
    `Report Title: "${ctx.reportTitle}"`,
    `Original Query: "${ctx.reportQuery}"`,
    `Sources: ${ctx.sourcesCount} verified sources | Reliability: ${Math.round(ctx.reliabilityScore * 100)}%`,
    '',
    '── Executive Summary ──────────────────────────────────────────',
    ctx.executiveSummary || '(not available)',
    '',
  ];

  if (ctx.keyFindings.length > 0) {
    lines.push('── Key Findings ───────────────────────────────────────────────');
    ctx.keyFindings.forEach((f, i) => lines.push(`  ${i + 1}. ${f}`));
    lines.push('');
  }

  if (ctx.statistics.length > 0) {
    lines.push('── Statistics & Data Points ───────────────────────────────────');
    ctx.statistics.forEach(s => {
      lines.push(`  • ${s.value} — ${s.context}`);
      if (s.source) lines.push(`    Source: ${s.source}`);
    });
    lines.push('');
  }

  if (ctx.keyThemes.length > 0) {
    lines.push(`── Key Themes: ${ctx.keyThemes.join(', ')}`);
    lines.push('');
  }

  if (ctx.citations.length > 0) {
    lines.push('── Report Citations (use these in your arguments) ─────────────');
    ctx.citations.slice(0, 8).forEach((c, i) => {
      lines.push(`  [R${i + 1}] ${c.title}`);
      if (c.snippet) lines.push(`       "${c.snippet.slice(0, 150)}"`);
      if (c.url)     lines.push(`       URL: ${c.url}`);
    });
    lines.push('');
  }

  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('');
  return lines.join('\n');
}

// ─── Search query generation ──────────────────────────────────────────────────
// Part 20: enriches queries with report themes when a report is available

async function generateSearchQueries(
  topic:         string,
  role:          DebateAgentRole,
  roleDef:       RoleDefinition,
  reportContext: DebateReportContext | null,
): Promise<string[]> {
  // Build a hint about what the report already covers so web search
  // adds NEW information rather than duplicating report content.
  const reportHint = reportContext
    ? `\nNote: We already have a research report covering: ${reportContext.keyThemes.slice(0, 4).join(', ')}. Your web searches should find RECENT updates (2024-2025) and angles NOT already in the report.`
    : '';

  try {
    const result = await chatCompletionJSON<{ queries: string[] }>(
      [
        {
          role:    'system',
          content: 'You generate highly targeted web search queries for AI research agents. Return only valid JSON.',
        },
        {
          role:    'user',
          content: `Topic for debate: "${topic}"
Agent role: ${roleDef.label} — ${roleDef.tagline}
Search focus areas: ${roleDef.searchKeywords.join(', ')}
${reportHint}

Generate exactly 4 specific, diverse web search queries to find the best recent evidence supporting the ${roleDef.label}'s analytical perspective on this topic.

Rules:
- Each query should target a different angle (data, expert opinion, case study, news)
- Include "2024" or "2025" in at least 2 queries for recency
- Be specific — no vague single-word queries
- Queries should surface evidence relevant to this role's specific lens
- Do NOT duplicate what a research report would already cover

Return ONLY valid JSON: {"queries": ["query 1", "query 2", "query 3", "query 4"]}`,
        },
      ],
      { temperature: 0.3, maxTokens: 400 },
    );

    if (Array.isArray(result?.queries) && result.queries.length > 0) {
      return result.queries.slice(0, 4);
    }
    return getFallbackQueries(topic, roleDef);
  } catch {
    return getFallbackQueries(topic, roleDef);
  }
}

function getFallbackQueries(topic: string, roleDef: RoleDefinition): string[] {
  return [
    `${topic} ${roleDef.searchKeywords[0]} 2025`,
    `${topic} ${roleDef.searchKeywords[1]} statistics data`,
    `${topic} ${roleDef.searchKeywords[2] ?? 'analysis'} research`,
    `${topic} expert analysis ${new Date().getFullYear()}`,
  ];
}

// ─── Perspective generation ───────────────────────────────────────────────────

interface DebatePerspectiveRaw {
  stanceLabel:  string;
  stanceType:   DebateStanceType;
  summary:      string;
  arguments: {
    point:      string;
    evidence:   string;
    sourceUrl?: string;
    strength:   'strong' | 'moderate' | 'weak';
  }[];
  keyQuote:   string;
  confidence: number;
}

async function generatePerspective(
  topic:             string,
  question:          string,
  roleDef:           RoleDefinition,
  searchContext:     string,
  searchResultCount: number,
  reportContext:     DebateReportContext | null,
): Promise<DebatePerspectiveRaw> {
  const evidenceQualityHint =
    searchResultCount === 0
      ? 'NOTE: No web search results returned. Use the research report data above. Your confidence score should reflect limited external verification (likely 4-6).'
      : searchResultCount < 5
      ? 'NOTE: Limited web search results available. Supplement with the research report data above. Calibrate confidence accordingly (likely 4-6).'
      : 'Both the research report AND fresh web search results are available above. Calibrate confidence based on consistency between them.';

  // Part 20: prepend report context block if available
  const reportBlock = reportContext
    ? buildReportContextBlock(reportContext)
    : '';

  // Part 20: add instruction to reference report when available
  const reportInstruction = reportContext
    ? `\nIMPORTANT: You have an imported research report above with verified findings and statistics. You MUST:\n  1. Reference specific data points from the report (cite as "per the research report" or use the report's citation URLs)\n  2. Combine report data with new web search findings to create the strongest possible argument\n  3. If web search CONTRADICTS the report, acknowledge the discrepancy honestly\n`
    : '';

  const userPrompt = `${reportBlock}DEBATE TOPIC: "${topic}"
CENTRAL QUESTION: "${question}"

REAL-TIME WEB SEARCH EVIDENCE (latest information — use alongside the report above):
${searchContext || '(No web search results — rely on research report data above)'}

─────────────────────────────────────────────

You are playing: ${roleDef.label} (${roleDef.tagline})
${reportInstruction}
${evidenceQualityHint}

${CONFIDENCE_RUBRIC}

Analyse ALL evidence above (both the research report AND web search) through your unique lens and form a well-argued, evidence-backed perspective.

Return ONLY valid JSON with NO markdown fences:
{
  "stanceLabel": "Your clear, memorable one-line position on this specific question (< 20 words)",
  "stanceType": "strongly_for" or "for" or "neutral" or "against" or "strongly_against",
  "summary": "Three substantial paragraphs separated by newlines. Paragraph 1: Your overall position and why. Paragraph 2: Key evidence — cite specific data, numbers, and sources from BOTH the research report and web results. Paragraph 3: Implications and what this means going forward. Be specific throughout.",
  "arguments": [
    {
      "point": "Argument headline — punchy and clear (< 15 words)",
      "evidence": "2-3 sentences of detailed evidence with specific data points — cite report findings OR web sources by name",
      "sourceUrl": "exact URL from report citations or web search only if this argument directly uses that source — omit if not applicable",
      "strength": "strong"
    },
    {
      "point": "Second argument headline",
      "evidence": "2-3 sentences of evidence",
      "strength": "strong"
    },
    {
      "point": "Third argument headline",
      "evidence": "2-3 sentences of evidence",
      "strength": "moderate"
    },
    {
      "point": "Fourth argument headline",
      "evidence": "2-3 sentences of evidence",
      "strength": "moderate"
    }
  ],
  "keyQuote": "Your single most powerful, memorable, quotable statement that captures your view perfectly.",
  "confidence": <INTEGER 1-10 — apply the rubric above honestly based on combined evidence quality>
}

IMPORTANT: The confidence field must be an integer you have genuinely computed using the rubric. If report + web evidence align strongly, score higher. If they conflict or evidence is sparse, score lower.`;

  return chatCompletionJSON<DebatePerspectiveRaw>(
    [
      { role: 'system', content: roleDef.systemPrompt },
      { role: 'user',   content: userPrompt },
    ],
    { temperature: 0.65, maxTokens: 2600 },
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function runDebateAgent(
  topic:         string,
  question:      string,
  role:          DebateAgentRole,
  onProgress?:   (detail: string) => void,
  reportContext: DebateReportContext | null = null,  // Part 20: new param
): Promise<DebatePerspective> {
  const roleDef = ROLE_DEFINITIONS[role];

  // ── Step 1: Generate search queries ──────────────────────────────────────

  onProgress?.(`${roleDef.label}: Planning research queries...`);
  const searchQueries = await generateSearchQueries(topic, role, roleDef, reportContext);

  // ── Step 2: Web search ────────────────────────────────────────────────────

  onProgress?.(`${roleDef.label}: Searching for latest evidence...`);
  const searchBatches = await serpSearchBatch(searchQueries);
  const allResults = searchBatches.flatMap(b =>
    Array.isArray(b?.results) ? b.results : [],
  );

  const searchContext = allResults
    .slice(0, 14)
    .map((r, i) =>
      [
        `[Web Source ${i + 1}]`,
        r.title   ? `Title: ${r.title}`     : '',
        r.snippet ? `Excerpt: ${r.snippet}` : '',
        r.date    ? `Date: ${r.date}`       : '',
        r.url     ? `URL: ${r.url}`         : '',
      ]
        .filter(Boolean)
        .join('\n'),
    )
    .join('\n\n');

  // Build citations from web results
  const sourcesUsed: Citation[] = allResults.slice(0, 7).map((r, i) => ({
    id:      `${role}-src-${i}`,
    title:   r.title   ?? 'Untitled',
    url:     r.url     ?? '',
    source:  r.source  ?? r.url ?? '',
    date:    r.date,
    snippet: (r.snippet ?? '').slice(0, 200),
  }));

  // Part 20: also include report citations as sources
  if (reportContext) {
    reportContext.citations.slice(0, 4).forEach((c, i) => {
      sourcesUsed.push({
        id:      `${role}-rep-${i}`,
        title:   c.title,
        url:     c.url,
        source:  'Research Report',
        snippet: c.snippet,
      });
    });
  }

  // ── Step 3: Generate perspective ──────────────────────────────────────────

  onProgress?.(`${roleDef.label}: Forming arguments...`);
  const raw = await generatePerspective(
    topic,
    question,
    roleDef,
    searchContext,
    allResults.length,
    reportContext,
  );

  // ── Step 4: Hydrate, validate, clamp confidence ───────────────────────────

  const hydratedArguments: DebateArgument[] = (raw.arguments ?? [])
    .slice(0, 4)
    .map((a, i) => ({
      id:        `${role}-arg-${i}`,
      point:     a.point    ?? '',
      evidence:  a.evidence ?? '',
      sourceUrl: a.sourceUrl,
      strength:  (['strong', 'moderate', 'weak'].includes(a.strength)
        ? a.strength
        : 'moderate') as DebateArgument['strength'],
    }));

  const validStanceTypes: DebateStanceType[] = [
    'strongly_for', 'for', 'neutral', 'against', 'strongly_against',
  ];

  const rawConfidence = raw.confidence;
  const parsedConfidence = typeof rawConfidence === 'number'
    ? rawConfidence
    : typeof rawConfidence === 'string'
    ? parseFloat(rawConfidence as string)
    : NaN;

  // Part 20: if report context is present, baseline fallback is slightly higher
  // because we at least have report data even if web search was sparse
  const confidenceFallback = reportContext
    ? (allResults.length === 0 ? 5 : allResults.length < 4 ? 6 : 7)
    : (allResults.length === 0 ? 3 : allResults.length < 4 ? 4 : 6);

  const confidence = Number.isFinite(parsedConfidence)
    ? Math.min(10, Math.max(1, Math.round(parsedConfidence)))
    : confidenceFallback;

  return {
    agentRole:       role,
    agentName:       roleDef.label,
    tagline:         roleDef.tagline,
    stanceLabel:     raw.stanceLabel ?? `${roleDef.label}'s view on ${topic}`,
    stanceType:      validStanceTypes.includes(raw.stanceType)
      ? raw.stanceType
      : 'neutral',
    summary:         raw.summary  ?? '',
    arguments:       hydratedArguments,
    keyQuote:        raw.keyQuote ?? '',
    confidence,
    searchedQueries: searchQueries,
    sourcesUsed,
    color:           roleDef.color,
    icon:            roleDef.icon,
  };
}