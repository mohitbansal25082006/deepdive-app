// src/services/agents/researchAssistantAgent.ts
// ─────────────────────────────────────────────────────────────────────────────
// AI Research Assistant Agent — FULL THEME COMPATIBILITY
//
// 7 modes: general, beginner, compare, contradictions, questions, summarize, factcheck
//
// Part 56 — Cost: the single LLM call (runResearchAssistantAgent) is routed to
//   the STANDARD tier (gpt-4.1-mini) via modelFor('assistantChat'). RAG answers
//   are quality-sensitive but mini matches gpt-4o on grounded Q&A for ~6x less.
//   MODE_PARAMS (temperature/maxTokens per mode) are unchanged.
//
// Part 55 — THEME INTEGRATION
//   Previously, every ModeConfig and QuickAction stored a hardcoded hex string
//   for its `color` field (e.g. '#6C63FF', '#43E97B'). These were frozen at
//   module-load time and never updated when the user switched the app theme,
//   causing chips, badges and icons to render in stale, off-palette colors.
//
//   APPROACH — semantic token mapping (zero React dependency):
//   ────────────────────────────────────────────────────────────
//   This file is a pure service module (no JSX, no hooks). It cannot call
//   useTheme(). Instead we use the live COLORS singleton from theme.ts, which
//   is mutated in-place by applyTheme() before any component re-renders. Every
//   color accessor in this file reads COLORS fresh on each call, so the values
//   it returns are always aligned with the active palette — no stale closures.
//
//   Each mode is assigned a SEMANTIC TOKEN KEY (a keyof ThemePalette) that
//   captures the mode's *intent*, not a fixed hex. For example:
//     • 'general'       → primary   (brand / default)
//     • 'beginner'      → success   (positive, approachable green)
//     • 'compare'       → info      (calm analytical blue)
//     • 'contradictions'→ secondary (alert / contrast)
//     • 'questions'     → warning   (exploration / orange)
//     • 'summarize'     → accent    (creative purple-adjacent)
//     • 'factcheck'     → pro       (gold / trustworthy authority)
//
//   The static `color` field on ModeConfig / QuickAction is kept for backward
//   compatibility (it seeds the value at module-load time from the DEFAULT
//   palette's token). UI components that need a *live* color at render time
//   should call `getModeColor(mode)` or `getThemeAwareModeColor(mode)` instead
//   of reading `config.color` directly.
//
//   New exports:
//     getThemeAwareModeColor(mode, opacity?)  — reads COLORS live
//     getThemeAwareModeColors()               — full map, read live
//     MODE_TOKEN_KEYS                         — the semantic mapping table
// ─────────────────────────────────────────────────────────────────────────────

import { chatCompletion, ChatMessage } from '../openaiClient';
import { modelFor }                     from '../../constants/aiModels';
import { ResearchReport, AssistantMode, AssistantMessage } from '../../types';
import { RAGContext } from '../ragService';
import { COLORS }    from '../../constants/theme';
import type { ThemePalette } from '../../constants/themes';

// ─── Re-export convenience ───────────────────────────────────────────────────

export type { AssistantMode };

// ─── Semantic token mapping ───────────────────────────────────────────────────
// Each mode maps to a key on ThemePalette. getModeColor() reads COLORS[key]
// at call time so it always returns the live, theme-aware value.
// The mapping choices:
//   general       → primary      brand default — the "home base" tone
//   beginner      → success      welcoming, positive, easy-going green
//   compare       → info         analytical, calm, data-oriented blue
//   contradictions→ secondary    contrast / alert — stands out intentionally
//   questions     → warning      exploration, curiosity, amber energy
//   summarize     → accent       creative, slightly different from primary
//   factcheck     → pro          authority, trust, gold-standard credibility

export const MODE_TOKEN_KEYS: Record<AssistantMode, keyof ThemePalette> = {
  general:        'primary',
  beginner:       'success',
  compare:        'info',
  contradictions: 'secondary',
  questions:      'warning',
  summarize:      'accent',
  factcheck:      'pro',
};

// ─── Mode Config (used by UI: ModeSelector, chips, etc.) ─────────────────────
// `color` is seeded from the DEFAULT palette at module-load time so existing
// code that reads config.color gets a reasonable value on first paint.
// For live, theme-responsive colors call getModeColor() / getThemeAwareModeColor().

export interface ModeConfig {
  mode: AssistantMode;
  label: string;
  description: string;
  icon: string;
  /** Seeded from default palette at module load. Read live via getModeColor(). */
  color: string;
  examplePrompts: string[];
}

export const MODE_CONFIGS: ModeConfig[] = [
  {
    mode: 'general',
    label: 'Ask Anything',
    description: 'RAG-powered Q&A using your report',
    icon: 'chatbubble-ellipses-outline',
    color: COLORS.primary,
    examplePrompts: [
      'What are the main takeaways?',
      'Who are the key companies involved?',
      'What should I know most about this topic?',
    ],
  },
  {
    mode: 'beginner',
    label: 'Explain Simply',
    description: 'Break this down for a complete beginner',
    icon: 'school-outline',
    color: COLORS.success,
    examplePrompts: [
      "Explain this like I'm a beginner",
      'What does this mean in simple terms?',
      'Can you use an analogy?',
    ],
  },
  {
    mode: 'compare',
    label: 'Compare Topics',
    description: 'Side-by-side comparison with another topic',
    icon: 'git-compare-outline',
    color: COLORS.info,
    examplePrompts: [
      'Compare this with traditional approaches',
      'How does this compare to 5 years ago?',
      "What's the difference between X and Y here?",
    ],
  },
  {
    mode: 'contradictions',
    label: 'Find Flaws',
    description: 'Identify gaps, contradictions & weak claims',
    icon: 'alert-circle-outline',
    color: COLORS.secondary,
    examplePrompts: [
      'Find contradictions in this research',
      'What are the weakest claims here?',
      'What important things are missing?',
    ],
  },
  {
    mode: 'questions',
    label: 'Go Deeper',
    description: 'Generate follow-up research questions',
    icon: 'telescope-outline',
    color: COLORS.warning,
    examplePrompts: [
      'What should I research next?',
      'Generate 10 deeper questions',
      'What gaps exist in this research?',
    ],
  },
  {
    mode: 'summarize',
    label: 'Summarize',
    description: 'Get a concise structured overview',
    icon: 'document-text-outline',
    color: COLORS.accent,
    examplePrompts: [
      'Give me a quick TL;DR',
      'What are the 5 most important points?',
      'Summarize just the market trends',
    ],
  },
  {
    mode: 'factcheck',
    label: 'Fact Check',
    description: 'Verify claims with confidence ratings',
    icon: 'shield-checkmark-outline',
    color: COLORS.pro,
    examplePrompts: [
      'How reliable is this data?',
      'Verify the statistics in this report',
      'Which claims are well-supported vs weak?',
    ],
  },
];

export const MODE_CONFIG_MAP: Record<AssistantMode, ModeConfig> =
  Object.fromEntries(MODE_CONFIGS.map(c => [c.mode, c])) as Record<AssistantMode, ModeConfig>;

// ─── Mode Auto-Detection ──────────────────────────────────────────────────────

export function detectAssistantMode(query: string): AssistantMode {
  const q = query.toLowerCase().trim();

  if (/\b(explain|eli5|simple|simpli|basic|beginner|layman|dummy|5[\s-]?year|child|newbie|clear|easy|understand|break\s*down|no jargon)\b/.test(q))
    return 'beginner';

  if (/\b(contradict|inconsisten|conflict|disagree|flaw|weak|wrong|bias|gaps?|miss|incomplete|problem with|issue with|challenge|dispute|unreliable|question the)\b/.test(q))
    return 'contradictions';

  if (/\b(what else|what (more|other)|question|dig deeper|explore more|research more|further|next steps?|should (i|we) (look|research|explore)|investigate|follow.?up)\b/.test(q))
    return 'questions';

  if (/\b(compar|vs\.?|versus|differ|similar|contrast|how does .+ compar|relationship between|side by side|benchmark|against)\b/.test(q))
    return 'compare';

  if (/\b(summar|brief|short(en)?|tl;?dr|recap|overview|key points|main points|bottom line|distill|condense|in a nutshell|quick)\b/.test(q))
    return 'summarize';

  if (/\b(fact.?check|verify|is it true|is .+ true|accurate|correct|source|evidence|proof|cite|citation|reliable|credible)\b/.test(q))
    return 'factcheck';

  return 'general';
}

// ─── System Prompt Builder ────────────────────────────────────────────────────

function buildSystemPrompt(
  mode: AssistantMode,
  report: ResearchReport,
  ragContext: RAGContext,
): string {

  const reportHeader = `
RESEARCH REPORT: "${report.title}"
ORIGINAL QUERY: ${report.query}
RESEARCH DEPTH: ${report.depth.toUpperCase()}
RELIABILITY SCORE: ${report.reliabilityScore}/10
SOURCES ANALYZED: ${report.sourcesCount}
CITATIONS: ${report.citations?.length ?? 0}
`.trim();

  const contextBlock = ragContext.contextText?.trim()
    ? `\n\nRESEARCH CONTEXT (semantically matched to your question):\n${ragContext.contextText}`
    : `\n\nREPORT SUMMARY:\n${(report.executiveSummary ?? '').slice(0, 1200)}`;

  const ragBadge = ragContext.usedVectorSearch
    ? `\n\n[RAG: ${ragContext.chunks.length} relevant sections retrieved via semantic search]`
    : '\n\n[Context: fallback keyword match — first-message or embedding pending]';

  const baseContext = `${reportHeader}${contextBlock}${ragBadge}`;

  const coreInstruction = `You are DeepDive AI, an expert research assistant. You have just completed a comprehensive research report and are now helping the user explore it further.\n\n${baseContext}`;

  switch (mode) {

    case 'general':
      return `${coreInstruction}

ROLE: Expert Research Analyst
TASK: Answer the user's questions using the research context above.

RULES:
- Prioritize information from the research context; say "beyond the report's scope" if needed
- Cite specific statistics and data points when available: "According to the research, [fact]"
- Be concise and direct — no filler phrases
- Structure longer answers with clear headings or numbered points
- Suggest a follow-up angle at the end if relevant
- Use markdown formatting: **bold** for emphasis, *italic* for terms, \`code\` for data points
- Format lists with - or 1. 2. 3.
- Separate sections with --- for visual clarity`;

    case 'beginner':
      return `${coreInstruction}

ROLE: Patient, Friendly Educator
TASK: Explain concepts from this research report in the simplest possible way.

RULES:
- Use ONLY everyday language — zero technical jargon
- Every explanation must include a real-world analogy or example
- Structure: What is it? → Why does it exist? → Why does it matter? → Simple example
- If you catch yourself using a technical term, immediately explain it in plain English
- Use short sentences (max 20 words each where possible)
- Aim for "could a curious 14-year-old understand this?" as your bar
- Use bullet points freely for readability
- Format with **bold** for key concepts and \`code\` for data points
- Use emojis sparingly to add warmth (🎯, 💡, ✅)`;

    case 'compare':
      return `${coreInstruction}

ROLE: Comparative Analyst
TASK: Compare the topic of this research with whatever subject the user mentions.

OUTPUT FORMAT:
## 📊 Overview
One paragraph framing the comparison.

## ✅ Similarities
Bullet list — what both share.

## 🔄 Key Differences
Bullet list — what sets them apart (be specific with data from the report).

## ⚖️ Advantages & Disadvantages
Two columns: pros/cons for each side.

## 🎯 Bottom Line
1–2 sentences: which is better in what context?

RULES:
- Use specific numbers and data from the report where available
- Be balanced — do not favour one side without evidence
- If you lack info on the comparison topic, say so explicitly
- Use **bold** for key comparison points
- Use \`code\` for statistical differences`;

    case 'contradictions':
      return `${coreInstruction}

ROLE: Critical Research Analyst / Devil's Advocate
TASK: Identify weaknesses, contradictions, and gaps in this research.

LOOK FOR:
1. Internal inconsistencies — claims that contradict each other within the report
2. Unsupported assertions — bold claims with no cited evidence
3. Selection bias — only certain sources / perspectives represented
4. Recency bias — outdated data presented as current
5. Missing perspectives — important viewpoints not considered
6. Overstated conclusions — data that doesn't fully justify the claim
7. Methodological gaps — what research approach might have found different results

FORMAT for each issue:
## 🔍 Issue: [brief title]
**Evidence**: [what the report says vs. what's problematic]
**Severity**: 🔴 High / 🟡 Medium / 🟢 Low
**Suggested Fix**: [how this could be addressed]

Be constructive — the goal is stronger research, not tearing it down.
Use **bold** for key terms and \`code\` for data points.`;

    case 'questions':
      return `${coreInstruction}

ROLE: Research Strategist
TASK: Generate insightful follow-up research questions to deepen understanding.

OUTPUT FORMAT:

## 🔍 Surface Questions (3–4)
Questions answerable with basic research:
1. [Question] — *Why it matters: ...*

## 🔬 Intermediate Questions (3–4)
Require deeper investigation:
1. [Question] — *Why it matters: ...*

## 🧠 Expert Questions (3–4)
Require domain expertise or primary research:
1. [Question] — *Why it matters: ...*

## 🚀 Research Tip
"Start with [most impactful question] because [reason]."

RULES:
- Each question must lead to genuinely NEW insights not already in the report
- Cover different angles: technical, business, societal, regulatory, historical
- Avoid vague questions — be specific and researchable
- Use **bold** for key terms in each question
- Number questions clearly`;

    case 'summarize':
      return `${coreInstruction}

ROLE: Editorial Summarizer
TASK: Produce a concise, structured summary of the requested aspect of the report.

FORMAT:
## 📌 TL;DR
One sentence capturing the single most important insight.

## 📋 What's happening
2–3 bullet points on the current state.

## 💡 Why it matters
2–3 bullet points on implications.

## 📊 Key Numbers
3–5 statistics from the report (bold the values).

## 🔮 What's next
2–3 bullet points on future outlook.

RULES:
- Total response under 350 words (unless user asks for more)
- Bold every statistic and key data point using **value**
- Use \`code\` for precise figures
- Avoid adjective-heavy sentences — let the data speak
- If the user asks to summarize a specific section, focus only on that
- Use emojis sparingly for visual structure (📌, 📋, 💡, 📊, 🔮)`;

    case 'factcheck':
      return `${coreInstruction}

ROLE: Research Fact Checker
TASK: Evaluate the accuracy and reliability of claims in or about this research.

FOR EACH CLAIM, output:
## 📋 Claim: [exact claim being evaluated]
**Status**: ✅ Well-supported / ⚠️ Partially supported / ❌ Unsupported / ❓ Needs verification
**Evidence**: [what the report does/doesn't say to support this]
**Confidence**: 🔵 High / 🟡 Medium / 🔴 Low
**Note**: [any caveats, regional limitations, date sensitivity]

## 📊 OVERALL ASSESSMENT
- **Overall reliability**: X/10
- **Strongest evidence**: ...
- **Most important caveat**: ...

RULES:
- Only evaluate claims that are verifiable against the research context
- Be precise — distinguish "not in the report" from "contradicted by the report"
- Note when claims are time-sensitive (data may have changed since research)
- Use **bold** for key findings and \`code\` for data points
- Use emojis for visual status indicators`;

    default:
      return `${coreInstruction}\n\nAnswer questions clearly and accurately using the research context above. Use **bold** for emphasis and \`code\` for data points.`;
  }
}

// ─── Temperature & Token Config per Mode ──────────────────────────────────────

const MODE_PARAMS: Record<AssistantMode, { temperature: number; maxTokens: number }> = {
  general:        { temperature: 0.40, maxTokens: 1000 },
  beginner:       { temperature: 0.70, maxTokens: 900  },
  compare:        { temperature: 0.40, maxTokens: 1200 },
  contradictions: { temperature: 0.45, maxTokens: 1400 },
  questions:      { temperature: 0.75, maxTokens: 1500 },
  summarize:      { temperature: 0.30, maxTokens: 800  },
  factcheck:      { temperature: 0.25, maxTokens: 1200 },
};

// ─── Follow-up Suggestions ────────────────────────────────────────────────────

function getFollowUpSuggestions(mode: AssistantMode, topic: string): string[] {
  const shortTopic = topic.length > 40 ? topic.slice(0, 37) + '…' : topic;

  const suggestions: Record<AssistantMode, string[]> = {
    general: [
      `What are the biggest risks in ${shortTopic}?`,
      'Who are the most important companies here?',
      'What would a beginner need to know first?',
    ],
    beginner: [
      'Can you give me another real-world analogy?',
      "What's the most important thing to remember?",
      'How does this affect everyday people?',
    ],
    compare: [
      'Which option is better for someone just starting out?',
      'What are the long-term cost differences?',
      'Which has stronger growth potential?',
    ],
    contradictions: [
      'Which contradiction is the most serious?',
      'How could these issues be fixed in future research?',
      'Which sources are the most reliable here?',
    ],
    questions: [
      'Help me prioritize which question to answer first',
      'What research tools would help answer these?',
      'Which question has the best short-term ROI?',
    ],
    summarize: [
      'Give me more detail on the most important finding',
      "What's the most actionable insight from this?",
      'Expand just the future predictions for me',
    ],
    factcheck: [
      'Which claims need the most independent verification?',
      'Where can I cross-check this data externally?',
      "What's the overall trustworthiness of this report?",
    ],
  };

  return suggestions[mode] ?? suggestions.general;
}

// ─── Response Type ────────────────────────────────────────────────────────────

export interface AssistantResponse {
  content: string;
  mode: AssistantMode;
  detectedMode: AssistantMode;
  appliedMode: AssistantMode;
  suggestedFollowUps: string[];
  usedRAG: boolean;
  retrievedChunkCount: number;
  confidence: 'high' | 'medium' | 'low';
}

// ─── Main Agent Function ──────────────────────────────────────────────────────

export async function runResearchAssistantAgent(
  userQuery: string,
  report: ResearchReport,
  conversationHistory: AssistantMessage[],
  ragContext: RAGContext,
  forcedMode?: AssistantMode,
): Promise<AssistantResponse> {

  const detectedMode = detectAssistantMode(userQuery);
  const appliedMode  = forcedMode ?? detectedMode;

  const systemPrompt = buildSystemPrompt(appliedMode, report, ragContext);

  const historyMsgs: ChatMessage[] = conversationHistory
    .slice(-12)
    .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));

  const enrichedQuery = appliedMode !== 'general' && !forcedMode
    ? `[Detected mode: ${appliedMode.toUpperCase()}]\n${userQuery}`
    : userQuery;

  const params = MODE_PARAMS[appliedMode];

  // Part 56: STANDARD tier (gpt-4.1-mini) instead of gpt-4o.
  const content = await chatCompletion(
    [
      { role: 'system', content: systemPrompt },
      ...historyMsgs,
      { role: 'user', content: enrichedQuery },
    ],
    {
      temperature: params.temperature,
      maxTokens:   params.maxTokens,
      model:       modelFor('assistantChat'),
    },
  );

  const avgSimilarity = ragContext.chunks.length > 0
    ? ragContext.chunks.reduce((s, c) => s + c.similarity, 0) / ragContext.chunks.length
    : 0;

  const confidence: 'high' | 'medium' | 'low' =
    ragContext.chunks.length >= 3 && avgSimilarity >= 0.5 ? 'high'
      : ragContext.chunks.length >= 1 || ragContext.isEmbedded ? 'medium'
        : 'low';

  return {
    content,
    mode: appliedMode,
    detectedMode,
    appliedMode,
    suggestedFollowUps: getFollowUpSuggestions(appliedMode, report.query),
    usedRAG:             ragContext.usedVectorSearch && ragContext.chunks.length > 0,
    retrievedChunkCount: ragContext.chunks.length,
    confidence,
  };
}

// ─── Preset Prompts ───────────────────────────────────────────────────────────
// `color` seeds from live COLORS at module-load time; call
// getThemeAwareModeColor(action.mode) at render time for live updates.

export interface QuickAction {
  label: string;
  query: string;
  mode: AssistantMode;
  icon: string;
  /** Seeded at module-load time. Use getThemeAwareModeColor() at render time. */
  color: string;
}

export const QUICK_ACTIONS: QuickAction[] = [
  {
    label: 'Explain Simply',
    query: 'Explain this research like I am a complete beginner with no background knowledge. Use analogies and simple language.',
    mode:  'beginner',
    icon:  'school-outline',
    color: COLORS.success,
  },
  {
    label: 'Find Contradictions',
    query: 'Find all contradictions, weak claims, and important gaps in this research. Be thorough and constructive.',
    mode:  'contradictions',
    icon:  'alert-circle-outline',
    color: COLORS.secondary,
  },
  {
    label: 'Deeper Questions',
    query: 'Generate a comprehensive list of follow-up research questions at surface, intermediate, and expert levels. Cover technical, business, and societal angles.',
    mode:  'questions',
    icon:  'telescope-outline',
    color: COLORS.warning,
  },
  {
    label: 'Quick Summary',
    query: 'Give me a concise TL;DR summary of the most important findings and what they mean. Include key statistics.',
    mode:  'summarize',
    icon:  'document-text-outline',
    color: COLORS.accent,
  },
  {
    label: 'Fact Check',
    query: 'Evaluate the reliability of the key claims and statistics in this report. Rate each claim and provide an overall assessment.',
    mode:  'factcheck',
    icon:  'shield-checkmark-outline',
    color: COLORS.pro,
  },
];

// ─── Live Color Accessors ─────────────────────────────────────────────────────
// These read from the COLORS singleton at call-time, so they always return the
// current-theme value regardless of when the module was first imported.

/**
 * Returns the live, theme-aware color for a given mode, with optional opacity.
 * Reads COLORS fresh on every call — safe to use in render functions.
 *
 * @example
 *   // In a React component:
 *   <View style={{ backgroundColor: getThemeAwareModeColor(mode, 0.15) }} />
 */
export function getThemeAwareModeColor(mode: AssistantMode, opacity: number = 1): string {
  const tokenKey = MODE_TOKEN_KEYS[mode] ?? 'primary';
  const hex      = String(COLORS[tokenKey]);
  if (opacity === 1) return hex;
  return hexWithOpacity(hex, opacity);
}

/**
 * Returns the full map of live, theme-aware colors for every mode.
 * Computed fresh on every call — never stale.
 */
export function getThemeAwareModeColors(): Record<AssistantMode, string> {
  return Object.fromEntries(
    (Object.keys(MODE_TOKEN_KEYS) as AssistantMode[]).map(mode => [
      mode,
      getThemeAwareModeColor(mode),
    ]),
  ) as Record<AssistantMode, string>;
}

/**
 * Legacy helper — kept for backward compatibility with existing callers.
 * Now reads the live COLORS singleton via the semantic token mapping instead
 * of a frozen hex string, so it IS theme-aware even though it hasn't been
 * renamed. Existing call sites (getModeColor(mode)) require no changes.
 */
export function getModeColor(mode: AssistantMode, opacity: number = 1): string {
  return getThemeAwareModeColor(mode, opacity);
}

export function getModeIcon(mode: AssistantMode): string {
  return MODE_CONFIG_MAP[mode]?.icon ?? 'chatbubble-ellipses-outline';
}

export function getModeLabel(mode: AssistantMode): string {
  return MODE_CONFIG_MAP[mode]?.label ?? 'Ask Anything';
}

export function getModeDescription(mode: AssistantMode): string {
  return MODE_CONFIG_MAP[mode]?.description ?? 'RAG-powered Q&A using your report';
}

export function getModeExamples(mode: AssistantMode): string[] {
  return MODE_CONFIG_MAP[mode]?.examplePrompts ?? MODE_CONFIGS[0].examplePrompts;
}

// ─── Derived maps — computed fresh on import from live COLORS ─────────────────
// MODE_COLORS is the one map that must stay live. We expose it as a getter
// function rather than a frozen object so callers always get current values.

export const ALL_MODES   = MODE_CONFIGS.map(c => c.mode);
export const MODE_LABELS = Object.fromEntries(MODE_CONFIGS.map(c => [c.mode, c.label]));
export const MODE_ICONS  = Object.fromEntries(MODE_CONFIGS.map(c => [c.mode, c.icon]));

/**
 * @deprecated Use getThemeAwareModeColors() for a live snapshot, or
 *   getThemeAwareModeColor(mode) per-mode inside render functions.
 *   This export is kept for backward compatibility but reflects the palette at
 *   the time this module was first imported, not the current theme.
 */
export const MODE_COLORS = Object.fromEntries(
  MODE_CONFIGS.map(c => [c.mode, c.color]),
);

// ─── Internal utility ─────────────────────────────────────────────────────────

function hexWithOpacity(hex: string, opacity: number): string {
  const clean = hex.replace('#', '');
  const full  = clean.length === 3
    ? clean.split('').map(ch => ch + ch).join('')
    : clean;
  const r = parseInt(full.substring(0, 2), 16) || 0;
  const g = parseInt(full.substring(2, 4), 16) || 0;
  const b = parseInt(full.substring(4, 6), 16) || 0;
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

// ─── Error Handling Helpers ───────────────────────────────────────────────────

export interface AssistantError {
  code: 'RAG_UNAVAILABLE' | 'CONTEXT_TOO_LONG' | 'API_ERROR' | 'RATE_LIMIT' | 'UNKNOWN';
  message: string;
  retryable: boolean;
}

export function formatAssistantError(error: unknown): AssistantError {
  const err     = error as any;
  const message = err?.message ?? 'An unexpected error occurred.';

  if (message.includes('rate limit') || message.includes('429')) {
    return {
      code:      'RATE_LIMIT',
      message:   'Too many requests. Please wait a moment before trying again.',
      retryable: true,
    };
  }

  if (message.includes('context') || message.includes('token')) {
    return {
      code:      'CONTEXT_TOO_LONG',
      message:   'The conversation is getting long. Please start a new chat or simplify your question.',
      retryable: false,
    };
  }

  if (message.includes('RAG') || message.includes('embedding') || message.includes('vector')) {
    return {
      code:      'RAG_UNAVAILABLE',
      message:   'Semantic search is unavailable. Using keyword fallback mode. Please try again.',
      retryable: true,
    };
  }

  return {
    code:      'API_ERROR',
    message:   'Something went wrong. Please try again in a moment.',
    retryable: true,
  };
}

export function isRetryableError(error: AssistantError): boolean {
  return error.retryable;
}

// ─── Streaming Support (interface ready; uses non-streaming under the hood) ───

export interface StreamChunk {
  type: 'start' | 'content' | 'end' | 'error';
  content?: string;
  metadata?: {
    mode?: AssistantMode;
    confidence?: 'high' | 'medium' | 'low';
    retrievedChunkCount?: number;
  };
  error?: AssistantError;
}

export async function* streamResearchAssistantAgent(
  userQuery: string,
  report: ResearchReport,
  conversationHistory: AssistantMessage[],
  ragContext: RAGContext,
  forcedMode?: AssistantMode,
): AsyncGenerator<StreamChunk, void, unknown> {
  try {
    const response = await runResearchAssistantAgent(
      userQuery,
      report,
      conversationHistory,
      ragContext,
      forcedMode,
    );

    yield {
      type:     'start',
      metadata: {
        mode:                response.mode,
        confidence:          response.confidence,
        retrievedChunkCount: response.retrievedChunkCount,
      },
    };

    const words = response.content.split(' ');
    let buffer  = '';
    for (let i = 0; i < words.length; i++) {
      buffer += words[i] + ' ';
      if (buffer.length > 20 || i % 3 === 0) {
        yield { type: 'content', content: buffer };
        buffer = '';
        await new Promise(resolve => setImmediate(resolve));
      }
    }
    if (buffer) yield { type: 'content', content: buffer };

    yield { type: 'end' };

  } catch (error) {
    yield {
      type:  'error',
      error: formatAssistantError(error),
    };
  }
}