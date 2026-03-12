// src/services/agents/debateAgent.ts
// Part 9 — AI Debate Agent
// FIX: Confidence score was always 8 because the prompt used 8 as an inline
//      example value and the model copied it literally. Fixed by:
//      1. Removing the hardcoded example from the JSON template
//      2. Adding an explicit scoring rubric the model must follow
//      3. Validating the parsed value is actually in 1-10 range

import { chatCompletionJSON } from '../openaiClient';
import { serpSearchBatch }    from '../serpApiClient';
import {
  DebateAgentRole,
  DebatePerspective,
  DebateArgument,
  DebateStanceType,
  Citation,
} from '../../types';

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

// ─── Confidence rubric (used verbatim in the prompt) ──────────────────────────
// This is the key fix — giving the model a clear rubric prevents it from
// defaulting to a memorised "typical" value like 8.

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

// ─── Search query generation ──────────────────────────────────────────────────

async function generateSearchQueries(
  topic:   string,
  role:    DebateAgentRole,
  roleDef: RoleDefinition,
): Promise<string[]> {
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

Generate exactly 4 specific, diverse web search queries to find the best recent evidence supporting the ${roleDef.label}'s analytical perspective on this topic.

Rules:
- Each query should target a different angle (data, expert opinion, case study, news)
- Include "2024" or "2025" in at least 2 queries for recency
- Be specific — no vague single-word queries
- Queries should surface evidence relevant to this role's specific lens

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
    point:     string;
    evidence:  string;
    sourceUrl?: string;
    strength:  'strong' | 'moderate' | 'weak';
  }[];
  keyQuote:   string;
  // FIX: typed as number, not a literal — forces the model to compute it
  confidence: number;
}

async function generatePerspective(
  topic:         string,
  question:      string,
  roleDef:       RoleDefinition,
  searchContext: string,
  searchResultCount: number,
): Promise<DebatePerspectiveRaw> {
  // FIX: build an evidence-quality hint based on how many results we got
  const evidenceQualityHint =
    searchResultCount === 0
      ? 'NOTE: No search results were returned. Your confidence score should reflect this (likely 2-4).'
      : searchResultCount < 5
      ? 'NOTE: Limited search results available. Calibrate confidence accordingly (likely 3-6).'
      : 'Search results are available above. Calibrate confidence based on their quality and consistency.';

  const userPrompt = `DEBATE TOPIC: "${topic}"
CENTRAL QUESTION: "${question}"

REAL-TIME SEARCH EVIDENCE (use this to ground your arguments in current facts):
${searchContext || '(No search results available — base response on general knowledge and be explicit about uncertainty)'}

─────────────────────────────────────────────

You are playing: ${roleDef.label} (${roleDef.tagline})

${evidenceQualityHint}

${CONFIDENCE_RUBRIC}

Analyse the evidence above through your unique lens and form a well-argued, evidence-backed perspective.

Return ONLY valid JSON with NO markdown fences:
{
  "stanceLabel": "Your clear, memorable one-line position on this specific question (< 20 words)",
  "stanceType": "strongly_for" or "for" or "neutral" or "against" or "strongly_against",
  "summary": "Three substantial paragraphs separated by newlines. Paragraph 1: Your overall position and why. Paragraph 2: Key evidence from the search results supporting your view — cite specific data, numbers, and sources by name. Paragraph 3: Implications and what this means going forward. Be specific throughout.",
  "arguments": [
    {
      "point": "Argument headline — punchy and clear (< 15 words)",
      "evidence": "2-3 sentences of detailed evidence with specific data points or examples from the search results",
      "sourceUrl": "exact URL from search results only if this argument directly uses that source — omit field entirely if not applicable",
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
  "keyQuote": "Your single most powerful, memorable, quotable statement — the one sentence that captures your view perfectly.",
  "confidence": <INTEGER 1-10 — apply the rubric above honestly based on evidence quality>
}

IMPORTANT: The confidence field must be an integer you have genuinely computed using the rubric. Do NOT default to 7 or 8. If evidence is weak, score 3-4. If mixed, score 5-6. If strong, score 7-9.`;

  return chatCompletionJSON<DebatePerspectiveRaw>(
    [
      { role: 'system', content: roleDef.systemPrompt },
      { role: 'user',   content: userPrompt },
    ],
    { temperature: 0.65, maxTokens: 2400 },
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function runDebateAgent(
  topic:      string,
  question:   string,
  role:       DebateAgentRole,
  onProgress?: (detail: string) => void,
): Promise<DebatePerspective> {
  const roleDef = ROLE_DEFINITIONS[role];

  // ── Step 1: Generate search queries ──────────────────────────────────────

  onProgress?.(`${roleDef.label}: Planning research queries...`);
  const searchQueries = await generateSearchQueries(topic, role, roleDef);

  // ── Step 2: Web search ────────────────────────────────────────────────────

  onProgress?.(`${roleDef.label}: Searching for evidence...`);
  const searchBatches = await serpSearchBatch(searchQueries);
  const allResults = searchBatches.flatMap(b =>
    Array.isArray(b?.results) ? b.results : [],
  );

  // Build rich search context for the LLM
  const searchContext = allResults
    .slice(0, 14)
    .map((r, i) =>
      [
        `[Source ${i + 1}]`,
        r.title   ? `Title: ${r.title}`   : '',
        r.snippet ? `Excerpt: ${r.snippet}` : '',
        r.date    ? `Date: ${r.date}`     : '',
        r.url     ? `URL: ${r.url}`       : '',
      ]
        .filter(Boolean)
        .join('\n'),
    )
    .join('\n\n');

  const sourcesUsed: Citation[] = allResults.slice(0, 7).map((r, i) => ({
    id:      `${role}-src-${i}`,
    title:   r.title   ?? 'Untitled',
    url:     r.url     ?? '',
    source:  r.source  ?? r.url ?? '',
    date:    r.date,
    snippet: (r.snippet ?? '').slice(0, 200),
  }));

  // ── Step 3: Generate perspective ──────────────────────────────────────────

  onProgress?.(`${roleDef.label}: Forming arguments...`);
  const raw = await generatePerspective(
    topic,
    question,
    roleDef,
    searchContext,
    allResults.length,
  );

  // ── Step 4: Hydrate, validate, and clamp confidence ───────────────────────

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

  // FIX: parse as number, clamp strictly to 1-10, reject non-numeric
  const rawConfidence = raw.confidence;
  const parsedConfidence = typeof rawConfidence === 'number'
    ? rawConfidence
    : typeof rawConfidence === 'string'
    ? parseFloat(rawConfidence as string)
    : NaN;

  // If the model still returned something invalid, derive a fallback from
  // evidence quality rather than defaulting to 8
  const confidenceFallback = allResults.length === 0 ? 3
    : allResults.length < 4                           ? 4
    : 6; // genuine "we have data but nothing exceptional" default

  const confidence = Number.isFinite(parsedConfidence)
    ? Math.min(10, Math.max(1, Math.round(parsedConfidence)))
    : confidenceFallback;

  return {
    agentRole:       role,
    agentName:       roleDef.label,
    tagline:         roleDef.tagline,
    stanceLabel:     raw.stanceLabel   ?? `${roleDef.label}'s view on ${topic}`,
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