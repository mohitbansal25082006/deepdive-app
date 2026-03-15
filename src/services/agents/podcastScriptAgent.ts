// src/services/agents/podcastScriptAgent.ts
// Part 19 — DURATION FIX v2:
//
// ROOT CAUSE of "10 min → 5 min" bug:
//   GPT-4o in JSON mode tends to write short turns (~50-70 words each)
//   regardless of instructions. With 16 turns × 60 avg = ~960 words = ~7.5 min.
//   For longer durations it gets worse — GPT front-loads effort then tapers off.
//
// THE REAL FIX — two-pronged approach:
//
//   1. CHUNKED GENERATION: For durations > 7 min, split into 2 GPT calls:
//      • Call A generates turns 1..N/2 (first half of episode)
//      • Call B generates turns N/2+1..N (second half, given first half as context)
//      This prevents GPT from "running out of steam" and writing filler/short turns.
//
//   2. HIGHER WORD FLOOR: MIN_WORDS_PER_TURN raised to 80, avgWordsPerTurn = 120.
//      Turns are asked to be "paragraph-length" — 80-160 words each.
//      At 120 avg × 14 turns = 1,680 words ≈ 13.4 min (safely over 10 min target).
//
//   3. VALIDATION + TOP-UP: After generation, if totalWords < 90% of target,
//      a top-up call asks GPT to expand the shortest turns until the word
//      budget is met.
//
// TTS RATE: OpenAI TTS-1 speaks at 130-140 WPM. We use 120 as a conservative
//   floor (some voices speak slightly slower on long sentences).

import { chatCompletionJSON } from '../openaiClient';
import { serpSearchBatch }    from '../serpApiClient';
import {
  ResearchReport,
  PodcastScript,
  PodcastTurn,
  PodcastConfig,
  SearchBatch,
} from '../../types';

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Conservative TTS words-per-minute.
 * OpenAI TTS-1 actual rate: 130-140 WPM. Using 120 as a safe floor so
 * we always generate MORE than enough rather than less.
 */
const TTS_WPM = 120;

/**
 * Target average words per turn. Higher than before — we want paragraph-length
 * turns so each GPT call contributes substantial audio time.
 */
const AVG_WORDS_PER_TURN = 120;

/**
 * Hard floor per turn. Turns below this feel too clipped.
 */
const MIN_WORDS_PER_TURN = 80;

/**
 * Soft ceiling per turn. Keeps individual TTS calls short enough to be fast.
 */
const MAX_WORDS_PER_TURN = 180;

/**
 * Durations above this threshold use chunked generation (2 GPT calls).
 * Below it, a single call is fine.
 */
const CHUNKED_THRESHOLD_MINS = 7;

/**
 * If actual word count is below this fraction of target, run a top-up call.
 */
const WORD_COUNT_TOLERANCE = 0.88;

// ─── Types ────────────────────────────────────────────────────────────────────

interface RawTurn {
  speaker: 'host' | 'guest';
  text: string;
}

interface RawScriptResponse {
  title: string;
  description: string;
  turns: RawTurn[];
}

interface RawTurnsOnly {
  turns: RawTurn[];
}

export interface ScriptAgentResult {
  script: PodcastScript;
  title: string;
  description: string;
  webSearchUsed: boolean;
  searchQueries: string[];
}

export interface ScriptAgentInput {
  topic: string;
  report?: ResearchReport | null;
  config: PodcastConfig;
  presetStyle?: VoicePresetStyle;
}

export type VoicePresetStyle =
  | 'casual'
  | 'expert'
  | 'tech'
  | 'narrative'
  | 'debate'
  | 'news';

// ─── Word / Turn Math ─────────────────────────────────────────────────────────

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function estimateTTSDurationMs(text: string): number {
  return Math.round((countWords(text) / TTS_WPM) * 60 * 1000);
}

/**
 * How many total words are needed to fill targetMinutes at TTS_WPM.
 * 20% buffer to account for GPT writing shorter turns than instructed.
 */
function requiredWordCount(targetMinutes: number): number {
  return Math.round(targetMinutes * TTS_WPM * 1.2);
}

/**
 * How many turns to request from GPT.
 * Uses AVG_WORDS_PER_TURN as the denominator, with a sensible min/max.
 */
function calculateTargetTurns(targetMinutes: number): number {
  const needed = requiredWordCount(targetMinutes);
  const raw    = Math.round(needed / AVG_WORDS_PER_TURN);
  // Min 14 turns (even for 5 min), max 60 turns (even for 20 min)
  return Math.min(60, Math.max(14, raw));
}

/**
 * Max tokens for a GPT call generating `turns` turns of ~AVG_WORDS_PER_TURN words.
 * Each word ≈ 1.35 tokens on average for dialogue. Add 600 tokens for JSON overhead.
 */
function maxTokensForTurns(turns: number): number {
  return Math.min(16000, turns * AVG_WORDS_PER_TURN * 2 + 600);
}

// ─── SerpAPI ──────────────────────────────────────────────────────────────────

function buildSearchQueries(topic: string): string[] {
  return [
    `${topic} latest news 2025`,
    `${topic} statistics data research`,
    `${topic} expert analysis trends`,
    `${topic} key developments breakthroughs`,
  ];
}

function formatSearchResults(batches: SearchBatch[]): string {
  const lines: string[] = ['━━━ LIVE WEB RESEARCH (weave 6+ of these into dialogue) ━━━'];
  let count = 0;
  for (const batch of batches) {
    if (count >= 18) break;
    for (const r of batch.results.slice(0, 3)) {
      if (!r.snippet || count >= 18) continue;
      lines.push(`• [${r.source ?? r.url}] ${r.snippet}`);
      count++;
    }
  }
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  return lines.join('\n');
}

// ─── Report Context ───────────────────────────────────────────────────────────

function buildReportContext(report: ResearchReport): string {
  const stats       = (report.statistics    ?? []).slice(0, 10);
  const findings    = (report.keyFindings   ?? []).slice(0, 8);
  const predictions = (report.futurePredictions ?? []).slice(0, 5);
  const sections    = (report.sections      ?? []).slice(0, 4);

  const sectionText = sections.map(s => {
    const bullets = (s.bullets ?? []).slice(0, 3).map(b => `  • ${b}`).join('\n');
    const content = s.content ? `  ${s.content.slice(0, 250)}` : '';
    return `${s.title}:\n${bullets || content}`;
  }).join('\n\n');

  return `
━━━━ RESEARCH REPORT: "${report.title}" ━━━━
SUMMARY: ${report.executiveSummary?.slice(0, 500) ?? ''}

KEY FINDINGS:
${findings.map((f, i) => `${i + 1}. ${f}`).join('\n')}

STATISTICS (use exact numbers):
${stats.map(s => `• ${s.value}: ${s.context} (${s.source})`).join('\n')}

PREDICTIONS:
${predictions.map(p => `• ${p}`).join('\n')}

SECTIONS:
${sectionText}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`.trim();
}

// ─── Style Guides ─────────────────────────────────────────────────────────────

function getStyleGuide(
  style:     VoicePresetStyle,
  hostName:  string,
  guestName: string
): string {
  const guides: Record<VoicePresetStyle, string> = {
    casual: `STYLE: Casual Conversation. ${hostName} is curious and warm. ${guestName} is a knowledgeable friend. Tone: two smart friends over coffee. Use contractions, informal phrases, humor. Some very short reactions (20-30 words), most turns paragraph-length (80-160 words).`,
    expert: `STYLE: Expert Interview. ${hostName} is a sharp journalist. ${guestName} is a leading authority. Tone: NPR Fresh Air. Substantive, precise, probing. Most turns 100-160 words. Include expert data, historical context, follow-up challenges.`,
    tech:   `STYLE: Tech Podcast. ${hostName} is a tech journalist. ${guestName} is a senior engineer. Tone: Changelog meets Lex Fridman. Technical depth, plain-English explanations, real product examples. 100-160 words per turn.`,
    narrative: `STYLE: Storytelling. ${hostName} narrates a journey. ${guestName} is an eyewitness insider. Tone: Serial podcast. Scene-setting, suspense, human stories, revelations. 100-180 words per turn.`,
    debate: `STYLE: Debate. ${hostName} is a neutral moderator. ${guestName} is a passionate advocate. Tone: Intelligence Squared. Steel-man opposing views, evidence-based rebuttals. 100-160 words per turn.`,
    news:   `STYLE: News Analysis. ${hostName} is a news anchor. ${guestName} is an expert analyst. Tone: BBC World Service. Authoritative, current, explanatory. Ground every claim in recent data. 90-160 words per turn.`,
  };
  return guides[style] ?? guides.casual;
}

// ─── Single-pass generation (≤ CHUNKED_THRESHOLD_MINS) ───────────────────────

async function generateSinglePass(
  topic:         string,
  targetTurns:   number,
  requiredWords: number,
  hostName:      string,
  guestName:     string,
  styleGuide:    string,
  reportContext: string,
  searchContext: string,
  targetMins:    number,
): Promise<{ turns: RawTurn[]; title: string; description: string }> {
  const systemPrompt = buildSystemPrompt(
    styleGuide, requiredWords, targetMins, hostName, guestName
  );

  const userPrompt = `Write a complete ${targetMins}-minute podcast episode about: "${topic}"

${reportContext}

${searchContext ? searchContext + '\n\n' : ''}

HOST: ${hostName} | GUEST: ${guestName}

Write EXACTLY ${targetTurns} turns.
EVERY turn must be ${MIN_WORDS_PER_TURN}-${MAX_WORDS_PER_TURN} words — paragraph length, NOT one sentence.
Total word count across all turns: AT LEAST ${requiredWords} words.

Return ONLY valid JSON:
{
  "title": "Compelling episode title (8-16 words)",
  "description": "2-3 sentence description that makes someone want to listen",
  "turns": [
    { "speaker": "host", "text": "80-180 word paragraph of natural spoken dialogue..." },
    { "speaker": "guest", "text": "80-180 word paragraph of natural spoken dialogue..." }
  ]
}`;

  const raw = await chatCompletionJSON<RawScriptResponse>(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userPrompt   },
    ],
    {
      temperature: 0.72,
      maxTokens:   maxTokensForTurns(targetTurns),
    }
  );

  return {
    turns:       raw?.turns       ?? [],
    title:       raw?.title?.trim()       ?? `${topic} — Deep Dive`,
    description: raw?.description?.trim() ?? '',
  };
}

// ─── Chunked generation (> CHUNKED_THRESHOLD_MINS) ───────────────────────────

async function generateChunked(
  topic:         string,
  targetTurns:   number,
  requiredWords: number,
  hostName:      string,
  guestName:     string,
  styleGuide:    string,
  reportContext: string,
  searchContext: string,
  targetMins:    number,
): Promise<{ turns: RawTurn[]; title: string; description: string }> {
  const halfTurns      = Math.ceil(targetTurns / 2);
  const secondHalf     = targetTurns - halfTurns;
  const wordsPerHalf   = Math.ceil(requiredWords / 2);

  const systemPrompt = buildSystemPrompt(
    styleGuide, requiredWords, targetMins, hostName, guestName
  );

  // ── Call A: First half ─────────────────────────────────────────────────

  const promptA = `Write the FIRST HALF of a ${targetMins}-minute podcast about: "${topic}"

${reportContext}

${searchContext ? searchContext + '\n\n' : ''}

HOST: ${hostName} | GUEST: ${guestName}

This is turns 1-${halfTurns} of a ${targetTurns}-turn episode.
Write EXACTLY ${halfTurns} turns, each ${MIN_WORDS_PER_TURN}-${MAX_WORDS_PER_TURN} words.
Total words for this half: AT LEAST ${wordsPerHalf} words.

Cover: hook/intro, context & background, first deep dive into data.
End mid-conversation — the second half continues from here.

Return ONLY valid JSON:
{
  "title": "Episode title (8-16 words)",
  "description": "2-3 sentence compelling description",
  "turns": [
    { "speaker": "host", "text": "80-180 word paragraph..." }
  ]
}`;

  const rawA = await chatCompletionJSON<RawScriptResponse>(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: promptA      },
    ],
    {
      temperature: 0.72,
      maxTokens:   maxTokensForTurns(halfTurns),
    }
  );

  const turnsA    = rawA?.turns ?? [];
  const title     = rawA?.title?.trim()       ?? `${topic} — Deep Dive`;
  const description = rawA?.description?.trim() ?? '';

  // ── Call B: Second half (given first half as context) ─────────────────

  // Build a compact summary of the first half to give GPT context
  const firstHalfSummary = turnsA.slice(-4).map(
    t => `${t.speaker === 'host' ? hostName : guestName}: "${t.text.slice(0, 120)}..."`
  ).join('\n');

  const promptB = `Continue the podcast episode about: "${topic}"

The first half just ended with this conversation:
---
${firstHalfSummary}
---

Now write the SECOND HALF — turns ${halfTurns + 1}-${targetTurns}.
Write EXACTLY ${secondHalf} turns, each ${MIN_WORDS_PER_TURN}-${MAX_WORDS_PER_TURN} words.
Total words for this half: AT LEAST ${wordsPerHalf} words.

Cover: complexity & challenges, future outlook & predictions, wrap-up & key takeaway.
This is the CONCLUSION — end with a memorable closing statement.

Return ONLY valid JSON (no title/description — just turns):
{
  "turns": [
    { "speaker": "guest", "text": "80-180 word paragraph continuing the conversation..." }
  ]
}`;

  const rawB = await chatCompletionJSON<RawTurnsOnly>(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: promptB      },
    ],
    {
      temperature: 0.72,
      maxTokens:   maxTokensForTurns(secondHalf),
    }
  );

  const turnsB = rawB?.turns ?? [];

  return {
    turns:       [...turnsA, ...turnsB],
    title,
    description,
  };
}

// ─── Top-up call (when word count falls short) ────────────────────────────────

async function topUpShortTurns(
  turns:        RawTurn[],
  targetWords:  number,
  hostName:     string,
  guestName:    string,
): Promise<RawTurn[]> {
  const currentWords = turns.reduce((s, t) => s + countWords(t.text), 0);
  const shortfall    = targetWords - currentWords;

  if (shortfall <= 0) return turns;

  // Find the 6 shortest turns to expand
  const indexed    = turns.map((t, i) => ({ ...t, idx: i, wc: countWords(t.text) }));
  const shortest   = [...indexed].sort((a, b) => a.wc - b.wc).slice(0, 6);

  const expansionPrompt = `The following podcast turns are too short. Expand each one to be 120-160 words while keeping the same speaker voice and content direction. Add specific details, examples, or statistics. Do NOT change what is being said — only make it longer and richer.

${shortest.map((t, i) => `TURN ${i + 1} (${t.speaker === 'host' ? hostName : guestName}, currently ${t.wc} words):\n"${t.text}"`).join('\n\n')}

We need ${shortfall} more words total across these ${shortest.length} turns.

Return ONLY valid JSON:
{
  "expanded": [
    { "index": 0, "text": "Expanded turn text 120-160 words..." },
    { "index": 1, "text": "..." }
  ]
}`;

  try {
    const result = await chatCompletionJSON<{ expanded: { index: number; text: string }[] }>(
      [{ role: 'user', content: expansionPrompt }],
      { temperature: 0.65, maxTokens: shortfall * 2 + 400 }
    );

    if (result?.expanded) {
      const updated = [...turns];
      for (const item of result.expanded) {
        const origIdx = shortest[item.index]?.idx;
        if (origIdx !== undefined && item.text?.trim()) {
          updated[origIdx] = { ...updated[origIdx], text: item.text.trim() };
        }
      }
      return updated;
    }
  } catch (err) {
    console.warn('[PodcastScriptAgent] Top-up call failed (non-fatal):', err);
  }

  return turns;
}

// ─── Shared system prompt builder ─────────────────────────────────────────────

function buildSystemPrompt(
  styleGuide:    string,
  requiredWords: number,
  targetMins:    number,
  hostName:      string,
  guestName:     string,
): string {
  return `You are an award-winning podcast scriptwriter for Radiolab, 99% Invisible, and Lex Fridman.

${styleGuide}

CRITICAL DURATION RULES:
- This podcast must produce ${targetMins} minutes of audio when read aloud at ${TTS_WPM} WPM
- That requires AT LEAST ${requiredWords} total spoken words
- EVERY turn must be ${MIN_WORDS_PER_TURN}-${MAX_WORDS_PER_TURN} words — full paragraphs, NOT one-liners
- Short filler turns ("Great point!") waste word budget — write substantive paragraphs

WRITING RULES:
1. Use contractions: "it's", "we're", "that's", "you'd"
2. Natural speech: "I mean...", "What's fascinating is...", "Here's the thing—"  
3. Flowing prose ONLY — no bullet points, no lists
4. Include specific data points, company names, statistics, dates
5. Every sentence moves the conversation forward`;
}

// ─── Main Agent ───────────────────────────────────────────────────────────────

export async function runPodcastScriptAgent(
  input: ScriptAgentInput
): Promise<ScriptAgentResult> {
  const { topic, report, config } = input;
  const style       = input.presetStyle ?? 'casual';
  const targetMins  = config.targetDurationMinutes;
  const targetTurns = calculateTargetTurns(targetMins);
  const requiredWords = requiredWordCount(targetMins);

  // ── SerpAPI web search ────────────────────────────────────────────────────

  let searchContext = '';
  let webSearchUsed = false;
  const searchQueriesUsed: string[] = [];

  try {
    const serpKey = process.env.EXPO_PUBLIC_SERPAPI_KEY;
    if (serpKey && serpKey.trim() && serpKey !== 'your_serpapi_key_here') {
      const queries = buildSearchQueries(topic);
      searchQueriesUsed.push(...queries);
      const batches = await serpSearchBatch(queries);
      const hasReal = batches.some(b =>
        b.results.some(r => !r.url.includes('example.com'))
      );
      if (hasReal) {
        searchContext = formatSearchResults(batches);
        webSearchUsed = true;
      }
    }
  } catch (err) {
    console.warn('[PodcastScriptAgent] SerpAPI failed, continuing:', err);
  }

  // ── Build shared context ──────────────────────────────────────────────────

  const reportContext = report
    ? buildReportContext(report)
    : `Topic: "${topic}"\nUse realistic, specific industry statistics and expert knowledge.`;

  const styleGuide = getStyleGuide(style, config.hostName, config.guestName);

  // ── Generate script (single-pass or chunked) ──────────────────────────────

  let rawTurns: RawTurn[];
  let title:    string;
  let desc:     string;

  if (targetMins > CHUNKED_THRESHOLD_MINS) {
    // CHUNKED: 2 GPT calls for longer episodes (> 7 min)
    const result = await generateChunked(
      topic, targetTurns, requiredWords,
      config.hostName, config.guestName,
      styleGuide, reportContext, searchContext, targetMins,
    );
    rawTurns = result.turns;
    title    = result.title;
    desc     = result.description;
  } else {
    // SINGLE-PASS: one GPT call for shorter episodes (≤ 7 min)
    const result = await generateSinglePass(
      topic, targetTurns, requiredWords,
      config.hostName, config.guestName,
      styleGuide, reportContext, searchContext, targetMins,
    );
    rawTurns = result.turns;
    title    = result.title;
    desc     = result.description;
  }

  if (!rawTurns || rawTurns.length === 0) {
    throw new Error('Podcast script agent returned an empty dialogue. Please try again.');
  }

  // ── Top-up if word count is too low ──────────────────────────────────────

  const currentWords = rawTurns.reduce((s, t) => s + countWords(t.text ?? ''), 0);
  if (currentWords < requiredWords * WORD_COUNT_TOLERANCE) {
    console.log(
      `[PodcastScriptAgent] Word count ${currentWords} < ${Math.round(requiredWords * WORD_COUNT_TOLERANCE)} target — running top-up`
    );
    rawTurns = await topUpShortTurns(
      rawTurns, requiredWords, config.hostName, config.guestName
    );
  }

  // ── Transform raw turns → PodcastTurn[] ──────────────────────────────────

  const turns: PodcastTurn[] = rawTurns.map((raw, index) => {
    const speaker = raw?.speaker === 'guest' ? 'guest' : 'host';
    const text    = (raw?.text ?? '').trim();
    return {
      id:           `turn-${index}`,
      segmentIndex: index,
      speaker,
      speakerName:  speaker === 'host' ? config.hostName : config.guestName,
      text,
      durationMs:   estimateTTSDurationMs(text),
    };
  });

  // ── Compute totals ────────────────────────────────────────────────────────

  const totalWords = turns.reduce((sum, t) => sum + countWords(t.text), 0);
  const estimatedDurationMinutes = Math.round((totalWords / TTS_WPM) * 10) / 10;

  const script: PodcastScript = { turns, totalWords, estimatedDurationMinutes };

  return {
    script,
    title:         title || `${topic} — Deep Dive`,
    description:   desc  || `An in-depth ${targetMins}-minute exploration of ${topic}.`,
    webSearchUsed,
    searchQueries: searchQueriesUsed,
  };
}