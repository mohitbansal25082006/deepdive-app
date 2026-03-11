// src/services/agents/researchAssistantAgent.ts
// Part 6 — AI Research Assistant Agent
//
// Upgrades the plain follow-up chat into a true research assistant with 7 modes:
//
//   general        → Expert RAG-powered Q&A using semantic search context
//   beginner       → ELI5 / simplified explanations with analogies
//   compare        → Structured comparison with another topic
//   contradictions → Critical analysis: find gaps, flaws, inconsistencies
//   questions      → Generate deeper research questions (tiered by depth)
//   summarize      → Concise, structured summary on demand
//   factcheck      → Verify claims against report data with confidence rating
//
// The mode is either:
//   (a) explicitly set by the user via the mode picker UI, or
//   (b) auto-detected from the user's query text via detectAssistantMode()
//
// Each mode has:
//   • A dedicated system prompt with specific output instructions
//   • Tuned temperature and token limits
//   • Suggested follow-up prompts tailored to the topic

import { chatCompletion, ChatMessage }                    from '../openaiClient';
import { ResearchReport, AssistantMode, AssistantMessage } from '../../types';
import { RAGContext }                                      from '../ragService';

// ─── Re-export convenience ───────────────────────────────────────────────────

export type { AssistantMode };

// ─── Mode Config (used by UI: ModeSelector, chips, etc.) ─────────────────────

export interface ModeConfig {
  mode:            AssistantMode;
  label:           string;
  description:     string;
  icon:            string;   // Ionicons name
  color:           string;   // hex colour
  examplePrompts:  string[];
}

export const MODE_CONFIGS: ModeConfig[] = [
  {
    mode:        'general',
    label:       'Ask Anything',
    description: 'RAG-powered Q&A using your report',
    icon:        'chatbubble-ellipses-outline',
    color:       '#6C63FF',
    examplePrompts: [
      'What are the main takeaways?',
      'Who are the key companies involved?',
      'What should I know most about this topic?',
    ],
  },
  {
    mode:        'beginner',
    label:       'Explain Simply',
    description: 'Break this down for a complete beginner',
    icon:        'school-outline',
    color:       '#43E97B',
    examplePrompts: [
      'Explain this like I\'m a beginner',
      'What does this mean in simple terms?',
      'Can you use an analogy?',
    ],
  },
  {
    mode:        'compare',
    label:       'Compare Topics',
    description: 'Side-by-side comparison with another topic',
    icon:        'git-compare-outline',
    color:       '#29B6F6',
    examplePrompts: [
      'Compare this with traditional approaches',
      'How does this compare to 5 years ago?',
      'What\'s the difference between X and Y here?',
    ],
  },
  {
    mode:        'contradictions',
    label:       'Find Flaws',
    description: 'Identify gaps, contradictions & weak claims',
    icon:        'alert-circle-outline',
    color:       '#FF6584',
    examplePrompts: [
      'Find contradictions in this research',
      'What are the weakest claims here?',
      'What important things are missing?',
    ],
  },
  {
    mode:        'questions',
    label:       'Go Deeper',
    description: 'Generate follow-up research questions',
    icon:        'telescope-outline',
    color:       '#FFA726',
    examplePrompts: [
      'What should I research next?',
      'Generate 10 deeper questions',
      'What gaps exist in this research?',
    ],
  },
  {
    mode:        'summarize',
    label:       'Summarize',
    description: 'Get a concise structured overview',
    icon:        'document-text-outline',
    color:       '#8B5CF6',
    examplePrompts: [
      'Give me a quick TL;DR',
      'What are the 5 most important points?',
      'Summarize just the market trends',
    ],
  },
  {
    mode:        'factcheck',
    label:       'Fact Check',
    description: 'Verify claims with confidence ratings',
    icon:        'shield-checkmark-outline',
    color:       '#FF8C00',
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

/**
 * Detect the most appropriate assistant mode from the user's query text.
 * Uses regex keyword matching — fast, no extra API call needed.
 *
 * Falls back to 'general' when no specific mode matches.
 */
export function detectAssistantMode(query: string): AssistantMode {
  const q = query.toLowerCase().trim();

  // Beginner / ELI5
  if (/\b(explain|eli5|simple|simpli|basic|beginner|layman|dummy|5[\s-]?year|child|newbie|clear|easy|understand|break\s*down|no jargon)\b/.test(q))
    return 'beginner';

  // Contradiction / Critical
  if (/\b(contradict|inconsisten|conflict|disagree|flaw|weak|wrong|bias|gaps?|miss|incomplete|problem with|issue with|challenge|dispute|unreliable|question the)\b/.test(q))
    return 'contradictions';

  // Questions / Go Deeper
  if (/\b(what else|what (more|other)|question|dig deeper|explore more|research more|further|next steps?|should (i|we) (look|research|explore)|investigate|follow.?up)\b/.test(q))
    return 'questions';

  // Compare
  if (/\b(compar|vs\.?|versus|differ|similar|contrast|how does .+ compar|relationship between|side by side|benchmark|against)\b/.test(q))
    return 'compare';

  // Summarize
  if (/\b(summar|brief|short(en)?|tl;?dr|recap|overview|key points|main points|bottom line|distill|condense|in a nutshell|quick)\b/.test(q))
    return 'summarize';

  // Fact check
  if (/\b(fact.?check|verify|is it true|is .+ true|accurate|correct|source|evidence|proof|cite|citation|reliable|credible)\b/.test(q))
    return 'factcheck';

  return 'general';
}

// ─── System Prompt Builder ────────────────────────────────────────────────────

function buildSystemPrompt(
  mode:       AssistantMode,
  report:     ResearchReport,
  ragContext: RAGContext,
): string {

  // ── Report metadata header ────────────────────────────────────────────────
  const reportHeader = `
RESEARCH REPORT: "${report.title}"
ORIGINAL QUERY: ${report.query}
RESEARCH DEPTH: ${report.depth.toUpperCase()}
RELIABILITY SCORE: ${report.reliabilityScore}/10
SOURCES ANALYZED: ${report.sourcesCount}
CITATIONS: ${report.citations?.length ?? 0}
`.trim();

  // ── Context block ─────────────────────────────────────────────────────────
  // If RAG retrieved relevant chunks, use them. Otherwise use the executive summary.
  const contextBlock = ragContext.contextText?.trim()
    ? `\n\nRESEARCH CONTEXT (semantically matched to your question):\n${ragContext.contextText}`
    : `\n\nREPORT SUMMARY:\n${(report.executiveSummary ?? '').slice(0, 1200)}`;

  const ragBadge = ragContext.usedVectorSearch
    ? `\n\n[RAG: ${ragContext.chunks.length} relevant sections retrieved via semantic search]`
    : '\n\n[Context: fallback keyword match — first-message or embedding pending]';

  const baseContext = `${reportHeader}${contextBlock}${ragBadge}`;

  // ── Mode-specific system prompts ──────────────────────────────────────────
  const coreInstruction = `You are DeepDive AI, an expert research assistant. You have just completed a comprehensive research report and are now helping the user explore it further.\n\n${baseContext}`;

  switch (mode) {

    // ── General ──────────────────────────────────────────────────────────────
    case 'general':
      return `${coreInstruction}

ROLE: Expert Research Analyst
TASK: Answer the user's questions using the research context above.

RULES:
- Prioritize information from the research context; say "beyond the report's scope" if needed
- Cite specific statistics and data points when available: "According to the research, [fact]"
- Be concise and direct — no filler phrases
- Structure longer answers with clear headings or numbered points
- Suggest a follow-up angle at the end if relevant`;

    // ── Beginner ─────────────────────────────────────────────────────────────
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
- Use bullet points freely for readability`;

    // ── Compare ───────────────────────────────────────────────────────────────
    case 'compare':
      return `${coreInstruction}

ROLE: Comparative Analyst
TASK: Compare the topic of this research with whatever subject the user mentions.

OUTPUT FORMAT:
## Overview
One paragraph framing the comparison.

## Similarities
Bullet list — what both share.

## Key Differences
Bullet list — what sets them apart (be specific with data from the report).

## Advantages & Disadvantages
Two columns: pros/cons for each side.

## Bottom Line
1–2 sentences: which is better in what context?

RULES:
- Use specific numbers and data from the report where available
- Be balanced — do not favour one side without evidence
- If you lack info on the comparison topic, say so explicitly`;

    // ── Contradictions ────────────────────────────────────────────────────────
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
**Issue**: [brief title]
**Evidence**: [what the report says vs. what's problematic]
**Severity**: High / Medium / Low
**Suggested Fix**: [how this could be addressed]

Be constructive — the goal is stronger research, not tearing it down.`;

    // ── Questions ─────────────────────────────────────────────────────────────
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
- Avoid vague questions — be specific and researchable`;

    // ── Summarize ─────────────────────────────────────────────────────────────
    case 'summarize':
      return `${coreInstruction}

ROLE: Editorial Summarizer
TASK: Produce a concise, structured summary of the requested aspect of the report.

FORMAT:
## TL;DR
One sentence capturing the single most important insight.

## What's happening
2–3 bullet points on the current state.

## Why it matters
2–3 bullet points on implications.

## Key Numbers
3–5 statistics from the report (bold the values).

## What's next
2–3 bullet points on future outlook.

RULES:
- Total response under 350 words (unless user asks for more)
- Bold every statistic and key data point
- Avoid adjective-heavy sentences — let the data speak
- If the user asks to summarize a specific section, focus only on that`;

    // ── Fact Check ────────────────────────────────────────────────────────────
    case 'factcheck':
      return `${coreInstruction}

ROLE: Research Fact Checker
TASK: Evaluate the accuracy and reliability of claims in or about this research.

FOR EACH CLAIM, output:
**Claim**: [exact claim being evaluated]
**Status**: ✅ Well-supported / ⚠️ Partially supported / ❌ Unsupported / ❓ Needs verification
**Evidence**: [what the report does/doesn't say to support this]
**Confidence**: High / Medium / Low
**Note**: [any caveats, regional limitations, date sensitivity]

OVERALL ASSESSMENT at the end:
- Overall reliability: X/10
- Strongest evidence: ...
- Most important caveat: ...

RULES:
- Only evaluate claims that are verifiable against the research context
- Be precise — distinguish "not in the report" from "contradicted by the report"
- Note when claims are time-sensitive (data may have changed since research)`;

    default:
      return `${coreInstruction}\n\nAnswer questions clearly and accurately using the research context above.`;
  }
}

// ─── Temperature & Token Config per Mode ─────────────────────────────────────

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
      'What\'s the most important thing to remember?',
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
      'What\'s the most actionable insight from this?',
      'Expand just the future predictions for me',
    ],
    factcheck: [
      'Which claims need the most independent verification?',
      'Where can I cross-check this data externally?',
      'What\'s the overall trustworthiness of this report?',
    ],
  };

  return suggestions[mode] ?? suggestions.general;
}

// ─── Response Type ────────────────────────────────────────────────────────────

export interface AssistantResponse {
  content:             string;
  mode:                AssistantMode;
  detectedMode:        AssistantMode;   // mode auto-detected from query
  appliedMode:         AssistantMode;   // mode actually used (may differ if forced)
  suggestedFollowUps:  string[];
  usedRAG:             boolean;
  retrievedChunkCount: number;
  confidence:          'high' | 'medium' | 'low';
}

// ─── Main Agent Function ──────────────────────────────────────────────────────

/**
 * Run the Research Assistant Agent for one turn.
 *
 * @param userQuery          The user's message
 * @param report             The research report being discussed
 * @param conversationHistory Previous messages (used for multi-turn context)
 * @param ragContext          Pre-fetched RAG context (chunks + contextText)
 * @param forcedMode         If provided, override auto-detection
 */
export async function runResearchAssistantAgent(
  userQuery:           string,
  report:              ResearchReport,
  conversationHistory: AssistantMessage[],
  ragContext:          RAGContext,
  forcedMode?:         AssistantMode,
): Promise<AssistantResponse> {

  // ── Determine mode ────────────────────────────────────────────────────────
  const detectedMode = detectAssistantMode(userQuery);
  const appliedMode  = forcedMode ?? detectedMode;

  // ── Build system prompt ───────────────────────────────────────────────────
  const systemPrompt = buildSystemPrompt(appliedMode, report, ragContext);

  // ── Conversation history (last 12 messages for context) ──────────────────
  const historyMsgs: ChatMessage[] = conversationHistory
    .slice(-12)
    .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));

  // ── Enrich query with mode hint for non-general modes ────────────────────
  // This helps the LLM maintain the right format even mid-conversation
  const enrichedQuery = appliedMode !== 'general' && !forcedMode
    ? `[Detected mode: ${appliedMode.toUpperCase()}]\n${userQuery}`
    : userQuery;

  // ── Call GPT-4o ───────────────────────────────────────────────────────────
  const params = MODE_PARAMS[appliedMode];

  const content = await chatCompletion(
    [
      { role: 'system', content: systemPrompt },
      ...historyMsgs,
      { role: 'user', content: enrichedQuery },
    ],
    {
      temperature: params.temperature,
      maxTokens:   params.maxTokens,
    }
  );

  // ── Confidence ────────────────────────────────────────────────────────────
  // High  = 3+ chunks with good similarity
  // Medium = 1–2 chunks OR fallback context
  // Low   = no vector context
  const avgSimilarity = ragContext.chunks.length > 0
    ? ragContext.chunks.reduce((s, c) => s + c.similarity, 0) / ragContext.chunks.length
    : 0;

  const confidence: 'high' | 'medium' | 'low' =
    ragContext.chunks.length >= 3 && avgSimilarity >= 0.5 ? 'high'
    : ragContext.chunks.length >= 1 || ragContext.isEmbedded           ? 'medium'
    : 'low';

  return {
    content,
    mode:                appliedMode,
    detectedMode,
    appliedMode,
    suggestedFollowUps:  getFollowUpSuggestions(appliedMode, report.query),
    usedRAG:             ragContext.usedVectorSearch && ragContext.chunks.length > 0,
    retrievedChunkCount: ragContext.chunks.length,
    confidence,
  };
}

// ─── Preset Prompts ───────────────────────────────────────────────────────────

/**
 * Pre-built query + mode pairs for the quick-action chips in the UI.
 * Each maps a user-facing label to a specific (query, mode) combination.
 */
export interface QuickAction {
  label:   string;
  query:   string;
  mode:    AssistantMode;
  icon:    string;
  color:   string;
}

export const QUICK_ACTIONS: QuickAction[] = [
  {
    label: 'Explain Simply',
    query: 'Explain this research like I am a complete beginner with no background knowledge',
    mode:  'beginner',
    icon:  'school-outline',
    color: '#43E97B',
  },
  {
    label: 'Find Contradictions',
    query: 'Find all contradictions, weak claims, and important gaps in this research',
    mode:  'contradictions',
    icon:  'alert-circle-outline',
    color: '#FF6584',
  },
  {
    label: 'Deeper Questions',
    query: 'Generate a comprehensive list of follow-up research questions at surface, intermediate, and expert levels',
    mode:  'questions',
    icon:  'telescope-outline',
    color: '#FFA726',
  },
  {
    label: 'Quick Summary',
    query: 'Give me a concise TL;DR summary of the most important findings and what they mean',
    mode:  'summarize',
    icon:  'document-text-outline',
    color: '#8B5CF6',
  },
  {
    label: 'Fact Check',
    query: 'Evaluate the reliability of the key claims and statistics in this report',
    mode:  'factcheck',
    icon:  'shield-checkmark-outline',
    color: '#FF8C00',
  },
];