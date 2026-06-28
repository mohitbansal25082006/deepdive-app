// src/services/agents/podcastScriptAgentV2.ts
// Part 35 — Podcast Script Agent V2 (multi-speaker + dynamic length + outline-first).
// Part 56 — Cost routing:
//   • All V2 generation calls (outline, single-pass, chunked halves) → STANDARD
//     (gpt-4.1-mini). Creative multi-speaker dialogue matches gpt-4o for ~6x less.
//   • topUpShortTurns → NANO — purely mechanical "make these turns longer".
//   The backward-compat `runPodcastScriptAgent` V1 wrapper just delegates to V2,
//   so it inherits the same routing automatically.

import { chatCompletionJSON } from '../openaiClient';
import { serpSearchBatch }    from '../serpApiClient';
import { modelFor }           from '../../constants/aiModels';
import {
  ResearchReport,
  PodcastScript,
  PodcastTurn,
  PodcastConfig,
  PodcastVoice,
  SearchBatch,
} from '../../types';
import type { SpeakerConfig } from '../../types/podcast_v2';
import type { ScriptAgentInput, ScriptAgentResult, VoicePresetStyle } from './podcastScriptAgent';

// Re-export the script-agent types so callers can import them from this V2 module
// too (usePodcast.ts and podcastOrchestrator.ts both do). Without this re-export,
// `import { VoicePresetStyle } from './podcastScriptAgentV2'` fails because a plain
// `import type … from` brings the name in locally but does NOT re-expose it.
export type { ScriptAgentInput, ScriptAgentResult, VoicePresetStyle };

// ─── Local agent types ────────────────────────────────────────────────────────
// podcast_v2.ts (Part 39) defines SpeakerConfig but not an internal "speaker with
// a stable string id" shape or an outline shape, so Part 35's agent declares them
// here. PodcastSpeakerConfig adds a string `id` used to tag turns; the public V2
// entry point also accepts the richer SpeakerConfig[] and adapts it.

export interface PodcastSpeakerConfig {
  id:       string;        // 'host' | 'guest' | 'guest2' | 'guest3'
  name:     string;
  role:     'host' | 'guest' | 'guest2' | 'guest3';
  voice?:   PodcastVoice;
  persona?: string;
  style?:   string;
}

export interface PodcastSegmentPlan {
  title:         string;
  goal:          string;
  talkingPoints: string[];
}

export interface PodcastOutline {
  segments: PodcastSegmentPlan[];
}

// ─── Constants ────────────────────────────────────────────────────────────────
// Part 57 — Duration calibration fix.
//   The previous math overshot badly: TTS_WPM was 120 with a ×1.2 inflation, and
//   calculateTargetTurns floored every podcast at 14 turns. A 5-min request then
//   became 14 turns × ~115 words ≈ 1600 words ≈ 11 min of audio.
//   tts-1 / tts-1-hd actually speak at ~150 words/min (≈825 chars/min). We now:
//     • set SPEAKING_WPM = 150 to match real playback,
//     • drop the ×1.2 inflation (target the requested length directly),
//     • derive turn count from the word budget with a low, speaker-aware floor so
//       short podcasts get few turns and long ones get many,
//     • keep MIN/MAX per-turn bounds but compute an explicit AVG that fits budget.

const SPEAKING_WPM = 150;          // real tts-1 playback rate (≈825 chars/min)
const TTS_WPM = SPEAKING_WPM;      // kept for estimateTTSDurationMs back-compat
// Part 57d — Conversational pacing: prefer MANY SHORT turns over a few long ones.
// Total spoken words (and thus duration) is unchanged — the same word budget is
// just spread across more, snappier turns so it reads like a real back-and-forth
// podcast instead of alternating monologues.
//   AVG 115 → 55   (≈22s/turn at 150 wpm → quicker exchanges)
//   MIN  70 → 25   (allow brief reactions/interjections: "Right, but…", "Exactly.")
//   MAX 185 → 90   (hard cap; splitLongTurns enforces it as a safety net)
const AVG_WORDS_PER_TURN = 55;
const MIN_WORDS_PER_TURN = 25;
const MAX_WORDS_PER_TURN = 90;
const CHUNKED_THRESHOLD_MINS = 11; // only split very long episodes now
// Part 57c: the short-script top-up trigger lives inline at the call site
// (TOPUP_TRIGGER = 0.70) so the extra LLM call only fires on a real shortfall.

// ─── Types ────────────────────────────────────────────────────────────────────

interface RawTurnV2 {
  speaker: string;   // speaker id (host/guest/guest2/...) — validated against config
  text: string;
}

interface RawScriptResponseV2 {
  title: string;
  description: string;
  turns: RawTurnV2[];
}

interface RawTurnsOnlyV2 {
  turns: RawTurnV2[];
}

export interface ScriptAgentV2Input {
  topic: string;
  report?: ResearchReport | null;
  config: PodcastConfig;
  // Accepts either the role-based SpeakerConfig (from the UI/orchestrator) or the
  // id-based PodcastSpeakerConfig; normalizeSpeakers() unifies them at runtime.
  speakers: Array<SpeakerConfig | PodcastSpeakerConfig>;
  speakerCount?: 2 | 3;
  presetStyleV2?: string;
  presetStyle?: VoicePresetStyle;
  onProgress?: (label: string) => void;
}

// ─── Word / Turn Math ─────────────────────────────────────────────────────────

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function estimateTTSDurationMs(text: string): number {
  return Math.round((countWords(text) / SPEAKING_WPM) * 60 * 1000);
}

// Part 57: target the requested duration directly (no inflation).
function requiredWordCount(targetMinutes: number): number {
  return Math.round(targetMinutes * SPEAKING_WPM);
}

// Part 57: turn count follows the word budget. The floor is small and scales
// with speaker count only so every speaker gets at least a couple of turns.
// Part 57d: with the shorter AVG_WORDS_PER_TURN (55), this naturally yields ~2×
// as many turns for the same duration, so the ceiling is raised to fit them.
function calculateTargetTurns(targetMinutes: number, speakerCount: number): number {
  const needed = requiredWordCount(targetMinutes);
  const raw    = Math.round(needed / AVG_WORDS_PER_TURN);
  const floor  = Math.max(speakerCount * 2, 6);
  const ceil   = 160;                                // Part 57d: was 80
  return Math.min(ceil, Math.max(floor, raw));
}

function maxTokensForTurns(turns: number): number {
  // ~AVG words/turn × ~1.6 tokens/word + per-turn JSON overhead (~12 tokens).
  return Math.min(16000, turns * (AVG_WORDS_PER_TURN * 2 + 12) + 700);
}

// Part 57b: split text into sentences for safe turn-splitting. Keeps the
// punctuation attached. Falls back to the whole string if no sentence breaks.
function splitIntoSentences(text: string): string[] {
  const matches = text.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g);
  if (!matches) return [text.trim()].filter(Boolean);
  return matches.map(s => s.trim()).filter(Boolean);
}

// Part 57b: break any turn longer than maxWords into consecutive turns by the
// SAME speaker, split at sentence boundaries. This keeps each TTS segment a sane
// length (good pacing + safely under the 4096-char tts-1 request limit) without
// changing who says what. A single 320-word monologue becomes e.g. three ~110-
// word turns from the same speaker, which sounds natural.
function splitLongTurns(turns: RawTurnV2[], maxWords: number): RawTurnV2[] {
  const out: RawTurnV2[] = [];

  for (const turn of turns) {
    const text = (turn.text ?? '').trim();
    if (!text) continue;

    if (countWords(text) <= maxWords) {
      out.push({ speaker: turn.speaker, text });
      continue;
    }

    // Accumulate sentences into chunks of <= maxWords.
    const sentences = splitIntoSentences(text);
    let buffer: string[] = [];
    let bufferWords = 0;

    const flush = () => {
      if (buffer.length === 0) return;
      out.push({ speaker: turn.speaker, text: buffer.join(' ').trim() });
      buffer = [];
      bufferWords = 0;
    };

    for (const sentence of sentences) {
      const w = countWords(sentence);
      // A single sentence longer than the cap: hard-wrap it by words so it can't
      // exceed the limit on its own.
      if (w > maxWords) {
        flush();
        const words = sentence.split(/\s+/);
        for (let i = 0; i < words.length; i += maxWords) {
          out.push({ speaker: turn.speaker, text: words.slice(i, i + maxWords).join(' ').trim() });
        }
        continue;
      }
      if (bufferWords + w > maxWords) flush();
      buffer.push(sentence);
      bufferWords += w;
    }
    flush();
  }

  return out;
}

// ─── Speaker helpers ──────────────────────────────────────────────────────────

function buildSpeakerRoster(speakers: PodcastSpeakerConfig[]): string {
  return speakers
    .map(s => `  - id "${s.id}" → ${s.name} (${s.role}${s.persona ? `; ${s.persona}` : ''})`)
    .join('\n');
}

function validSpeakerId(id: string, speakers: PodcastSpeakerConfig[]): string {
  const found = speakers.find(s => s.id === id);
  if (found) return found.id;
  const byName = speakers.find(s => s.name.toLowerCase() === id.toLowerCase());
  if (byName) return byName.id;
  return speakers[0].id;
}

// Part 57: collapse the 5 celebrity V2 styles onto the 6 base styles that
// getStyleGuide understands, so style is never silently dropped.
function mapV2StyleToBase(v2: string): VoicePresetStyle {
  switch (v2) {
    case 'formal_broadcaster': return 'news';
    case 'npr_journalist':     return 'narrative';
    case 'bbc_documentary':    return 'narrative';
    case 'casual_youtuber':    return 'casual';
    case 'joe_rogan':          return 'expert';
    default:                   return 'casual';
  }
}

// Part 57: unify the two speaker shapes used across the app.
// SpeakerConfig (UI/orchestrator): { name, voice, role: 'host'|'guest1'|'guest2' }
// PodcastSpeakerConfig (agent):     { id, name, role: 'host'|'guest'|'guest2'|'guest3', voice }
function normalizeSpeakers(
  raw: Array<SpeakerConfig | PodcastSpeakerConfig>,
): PodcastSpeakerConfig[] {
  return raw.map((s, i) => {
    // already in agent shape?
    if ((s as PodcastSpeakerConfig).id) {
      const p = s as PodcastSpeakerConfig;
      return { id: p.id, name: p.name, role: p.role, voice: p.voice, persona: p.persona, style: p.style };
    }
    const sc = s as SpeakerConfig;
    const id =
      sc.role === 'host'   ? 'host'   :
      sc.role === 'guest1' ? 'guest'  :
      sc.role === 'guest2' ? 'guest2' :
      `speaker${i}`;
    const role: PodcastSpeakerConfig['role'] =
      sc.role === 'host'   ? 'host'   :
      sc.role === 'guest1' ? 'guest'  :
      sc.role === 'guest2' ? 'guest2' :
      'guest';
    return {
      id,
      name:    sc.name,
      role,
      voice:   sc.voice,
      persona: sc.persona,
      style:   sc.style,
    };
  });
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

function getStyleGuide(style: VoicePresetStyle, speakers: PodcastSpeakerConfig[]): string {
  const roster = speakers.map(s => `${s.name} (${s.role})`).join(', ');
  const guides: Record<VoicePresetStyle, string> = {
    casual:    `STYLE: Casual multi-voice conversation between ${roster}. Warm, curious, friends-over-coffee energy. Contractions, humor, natural interruptions. Mix short reactions with substantive paragraphs.`,
    expert:    `STYLE: Expert panel/interview with ${roster}. NPR Fresh Air calibre. Substantive, precise, probing follow-ups. Most turns 100-160 words with data and historical context.`,
    tech:      `STYLE: Tech roundtable with ${roster}. Changelog meets Lex Fridman. Technical depth, plain-English explanations, real product examples.`,
    narrative: `STYLE: Storytelling with ${roster}. Serial-podcast scene-setting, suspense, human stories and revelations.`,
    debate:    `STYLE: Moderated debate among ${roster}. Intelligence Squared. Steel-man opposing views, evidence-based rebuttals, a moderator keeping order.`,
    news:      `STYLE: News analysis desk with ${roster}. BBC World Service authority. Current, explanatory, every claim grounded in recent data.`,
  };
  return guides[style] ?? guides.casual;
}

// ─── Shared system prompt builder ─────────────────────────────────────────────

function buildSystemPromptV2(
  styleGuide:    string,
  requiredWords: number,
  targetMins:    number,
  speakers:      PodcastSpeakerConfig[],
): string {
  return `You are an award-winning podcast scriptwriter for Radiolab, 99% Invisible, and Lex Fridman.

${styleGuide}

SPEAKER ROSTER (use these EXACT speaker ids in the "speaker" field):
${buildSpeakerRoster(speakers)}

CRITICAL DURATION RULES:
- This podcast must produce ${targetMins} minutes of audio when read aloud at ${TTS_WPM} WPM
- That requires AT LEAST ${requiredWords} total spoken words
- Reach that total through MANY SHORT TURNS, not a few long ones
- Each turn is ${MIN_WORDS_PER_TURN}-${MAX_WORDS_PER_TURN} words (aim for ~${AVG_WORDS_PER_TURN}); 2-4 sentences max
- Keep it a fast, natural back-and-forth — speakers react to and build on each other
- Distribute turns across ALL speakers; do not let one speaker monologue
- Brief reactions/interjections ARE welcome ("Right, but here's the catch…", "Wait—say more.") as long as the conversation keeps advancing with real substance

CONVERSATIONAL FLOW:
- Hand off frequently: ask a question, then the other speaker answers and adds a new angle
- Vary turn length naturally — a punchy 25-word reaction, then a 70-word explanation
- Speakers can interrupt, agree, push back, and riff — like a real podcast, not a lecture

WRITING RULES:
1. Use contractions: "it's", "we're", "that's", "you'd"
2. Natural speech: "I mean...", "What's fascinating is...", "Here's the thing—"
3. Flowing prose ONLY — no bullet points, no lists
4. Include specific data points, company names, statistics, dates
5. Every turn moves the conversation forward
6. The "speaker" field of every turn MUST be one of the exact ids in the roster above`;
}

// ─── Outline generation (STANDARD) ────────────────────────────────────────────

async function generateOutline(
  topic:         string,
  targetMins:    number,
  speakers:      PodcastSpeakerConfig[],
  reportContext: string,
): Promise<PodcastOutline | null> {
  try {
    const segmentCount = Math.max(3, Math.min(7, Math.round(targetMins / 2.5)));
    const raw = await chatCompletionJSON<PodcastOutline>(
      [
        {
          role: 'system',
          content: 'You are a podcast producer. Plan a tight segment outline before scripting. Return only valid JSON.',
        },
        {
          role: 'user',
          content: `Plan a ${targetMins}-minute podcast about: "${topic}"

Speakers: ${speakers.map(s => `${s.name} (${s.role})`).join(', ')}

${reportContext}

Create EXACTLY ${segmentCount} segments forming a narrative arc (hook → context → deep dives → future → wrap).

Return ONLY valid JSON:
{
  "segments": [
    { "title": "Segment title", "goal": "What this segment accomplishes", "talkingPoints": ["point 1", "point 2", "point 3"] }
  ]
}`,
        },
      ],
      { temperature: 0.5, maxTokens: 1200, model: modelFor('podcastScript') }, // ← Part 56 STANDARD
    );

    if (Array.isArray(raw?.segments) && raw.segments.length > 0) {
      return { segments: raw.segments.slice(0, segmentCount) };
    }
    return null;
  } catch {
    return null;
  }
}

function outlineToText(outline: PodcastOutline | null): string {
  if (!outline?.segments?.length) return '';
  return [
    '━━━ EPISODE OUTLINE (follow this arc) ━━━',
    ...outline.segments.map((seg: PodcastSegmentPlan, i: number) =>
      `${i + 1}. ${seg.title} — ${seg.goal}\n   Points: ${(seg.talkingPoints ?? []).join('; ')}`,
    ),
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
  ].join('\n');
}

// ─── Single-pass generation (STANDARD) ───────────────────────────────────────

async function generateSinglePassV2(
  topic:         string,
  targetTurns:   number,
  requiredWords: number,
  speakers:      PodcastSpeakerConfig[],
  styleGuide:    string,
  reportContext: string,
  searchContext: string,
  outlineText:   string,
  targetMins:    number,
): Promise<{ turns: RawTurnV2[]; title: string; description: string }> {
  const systemPrompt = buildSystemPromptV2(styleGuide, requiredWords, targetMins, speakers);

  const userPrompt = `Write a complete ${targetMins}-minute podcast episode about: "${topic}"

${reportContext}

${outlineText ? outlineText + '\n\n' : ''}${searchContext ? searchContext + '\n\n' : ''}

Write EXACTLY ${targetTurns} turns across all ${speakers.length} speakers.
Each turn is ${MIN_WORDS_PER_TURN}-${MAX_WORDS_PER_TURN} words (aim ~${AVG_WORDS_PER_TURN}) — short, punchy, conversational; 2-4 sentences, NOT long paragraphs.
Keep a fast natural back-and-forth: speakers react, question, and build on each other.
Total word count across all turns: AT LEAST ${requiredWords} words.

Return ONLY valid JSON:
{
  "title": "Compelling episode title (8-16 words)",
  "description": "2-3 sentence description that makes someone want to listen",
  "turns": [
    { "speaker": "${speakers[0].id}", "text": "Short ${MIN_WORDS_PER_TURN}-${MAX_WORDS_PER_TURN} word spoken turn..." },
    { "speaker": "${speakers[1]?.id ?? speakers[0].id}", "text": "Reacts and adds a new angle, ${MIN_WORDS_PER_TURN}-${MAX_WORDS_PER_TURN} words..." }
  ]
}`;

  const raw = await chatCompletionJSON<RawScriptResponseV2>(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userPrompt   },
    ],
    {
      temperature: 0.72,
      maxTokens:   maxTokensForTurns(targetTurns),
      model:       modelFor('podcastScript'), // ← Part 56 STANDARD
    }
  );

  return {
    turns:       raw?.turns       ?? [],
    title:       raw?.title?.trim()       ?? `${topic} — Deep Dive`,
    description: raw?.description?.trim() ?? '',
  };
}

// ─── Chunked generation (STANDARD) ───────────────────────────────────────────

async function generateChunkedV2(
  topic:         string,
  targetTurns:   number,
  requiredWords: number,
  speakers:      PodcastSpeakerConfig[],
  styleGuide:    string,
  reportContext: string,
  searchContext: string,
  outlineText:   string,
  targetMins:    number,
): Promise<{ turns: RawTurnV2[]; title: string; description: string }> {
  const halfTurns    = Math.ceil(targetTurns / 2);
  const secondHalf   = targetTurns - halfTurns;
  const wordsPerHalf = Math.ceil(requiredWords / 2);

  const systemPrompt = buildSystemPromptV2(styleGuide, requiredWords, targetMins, speakers);

  const promptA = `Write the FIRST HALF of a ${targetMins}-minute podcast about: "${topic}"

${reportContext}

${outlineText ? outlineText + '\n\n' : ''}${searchContext ? searchContext + '\n\n' : ''}

This is turns 1-${halfTurns} of a ${targetTurns}-turn episode across ${speakers.length} speakers.
Write EXACTLY ${halfTurns} turns, each ${MIN_WORDS_PER_TURN}-${MAX_WORDS_PER_TURN} words (aim ~${AVG_WORDS_PER_TURN}) — short, punchy, conversational; fast back-and-forth, NOT long paragraphs.
Total words for this half: AT LEAST ${wordsPerHalf} words.

Cover: hook/intro, context & background, first deep dive into data.
End mid-conversation — the second half continues from here.

Return ONLY valid JSON:
{
  "title": "Episode title (8-16 words)",
  "description": "2-3 sentence compelling description",
  "turns": [ { "speaker": "${speakers[0].id}", "text": "Short ${MIN_WORDS_PER_TURN}-${MAX_WORDS_PER_TURN} word spoken turn..." } ]
}`;

  const rawA = await chatCompletionJSON<RawScriptResponseV2>(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: promptA      },
    ],
    {
      temperature: 0.72,
      maxTokens:   maxTokensForTurns(halfTurns),
      model:       modelFor('podcastScript'), // ← Part 56 STANDARD
    }
  );

  const turnsA      = rawA?.turns ?? [];
  const title       = rawA?.title?.trim()       ?? `${topic} — Deep Dive`;
  const description = rawA?.description?.trim() ?? '';

  const firstHalfSummary = turnsA.slice(-4).map(t => {
    const spk = speakers.find(s => s.id === t.speaker)?.name ?? t.speaker;
    return `${spk}: "${t.text.slice(0, 120)}..."`;
  }).join('\n');

  const promptB = `Continue the podcast episode about: "${topic}"

The first half just ended with this conversation:
---
${firstHalfSummary}
---

Now write the SECOND HALF — turns ${halfTurns + 1}-${targetTurns} across ${speakers.length} speakers.
Write EXACTLY ${secondHalf} turns, each ${MIN_WORDS_PER_TURN}-${MAX_WORDS_PER_TURN} words (aim ~${AVG_WORDS_PER_TURN}) — short, conversational, fast back-and-forth.
Total words for this half: AT LEAST ${wordsPerHalf} words.

Cover: complexity & challenges, future outlook & predictions, wrap-up & key takeaway.
This is the CONCLUSION — end with a memorable closing statement.

Return ONLY valid JSON (no title/description — just turns):
{
  "turns": [ { "speaker": "${speakers[1]?.id ?? speakers[0].id}", "text": "Short ${MIN_WORDS_PER_TURN}-${MAX_WORDS_PER_TURN} word spoken turn..." } ]
}`;

  const rawB = await chatCompletionJSON<RawTurnsOnlyV2>(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: promptB      },
    ],
    {
      temperature: 0.72,
      maxTokens:   maxTokensForTurns(secondHalf),
      model:       modelFor('podcastScript'), // ← Part 56 STANDARD
    }
  );

  const turnsB = rawB?.turns ?? [];

  return { turns: [...turnsA, ...turnsB], title, description };
}

// ─── Top-up call (NANO) ───────────────────────────────────────────────────────

async function topUpShortTurns(
  turns:       RawTurnV2[],
  targetWords: number,
  speakers:    PodcastSpeakerConfig[],
): Promise<RawTurnV2[]> {
  const currentWords = turns.reduce((s, t) => s + countWords(t.text), 0);
  const shortfall    = targetWords - currentWords;

  if (shortfall <= 0) return turns;

  const indexed  = turns.map((t, i) => ({ ...t, idx: i, wc: countWords(t.text) }));
  const shortest = [...indexed].sort((a, b) => a.wc - b.wc).slice(0, 6);

  const nameFor = (id: string) => speakers.find(s => s.id === id)?.name ?? id;

  const expansionPrompt = `The following podcast turns are too short. Expand each one to about ${AVG_WORDS_PER_TURN}-${MAX_WORDS_PER_TURN} words while keeping the same speaker voice and content direction. Add a specific detail, example, or statistic. Keep it conversational and natural — do NOT turn it into a long monologue, and do NOT change what is being said.

${shortest.map((t, i) => `TURN ${i + 1} (${nameFor(t.speaker)}, currently ${t.wc} words):\n"${t.text}"`).join('\n\n')}

We need ${shortfall} more words total across these ${shortest.length} turns.

Return ONLY valid JSON:
{ "expanded": [ { "index": 0, "text": "Expanded turn ${AVG_WORDS_PER_TURN}-${MAX_WORDS_PER_TURN} words..." } ] }`;

  try {
    const result = await chatCompletionJSON<{ expanded: { index: number; text: string }[] }>(
      [{ role: 'user', content: expansionPrompt }],
      { temperature: 0.65, maxTokens: shortfall * 2 + 400, model: modelFor('podcastTopUp') } // ← Part 56 NANO
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
    console.warn('[PodcastScriptAgentV2] Top-up call failed (non-fatal):', err);
  }

  return turns;
}

// ─── Main Agent V2 ────────────────────────────────────────────────────────────

export async function runPodcastScriptAgentV2(
  input: ScriptAgentV2Input
): Promise<ScriptAgentResult> {
  const { topic, report, config } = input;
  // Part 57: accept presetStyleV2 (orchestrator) as well as presetStyle (V1).
  // getStyleGuide only knows the 6 base styles, so map celebrity V2 styles down.
  const rawStyle = (input.presetStyle ?? input.presetStyleV2 ?? 'casual') as string;
  const style: VoicePresetStyle = ([
    'casual', 'expert', 'tech', 'narrative', 'debate', 'news',
  ].includes(rawStyle) ? rawStyle : mapV2StyleToBase(rawStyle)) as VoicePresetStyle;
  const targetMins    = config.targetDurationMinutes;

  // Part 57 FIX (3-speaker bug): the orchestrator/screen pass speakers shaped as
  // SpeakerConfig (role 'host'|'guest1'|'guest2', NO `id`). The agent tags turns
  // by a stable string `id` and builds the model roster from it, so without
  // normalization every turn collapsed onto speaker[0] and 3-speaker episodes
  // produced nothing usable. Normalize any incoming shape into PodcastSpeakerConfig.
  const speakers: PodcastSpeakerConfig[] = normalizeSpeakers(input.speakers);

  const targetTurns   = calculateTargetTurns(targetMins, speakers.length);
  const requiredWords = requiredWordCount(targetMins);

  if (!speakers || speakers.length < 2) {
    throw new Error('Podcast V2 requires at least 2 speakers.');
  }

  // ── Web research ───────────────────────────────────────────────────────────

  let searchContext = '';
  let webSearchUsed = false;
  const searchQueriesUsed: string[] = [];

  input.onProgress?.('Searching the web for the latest information...');
  try {
    const serpKey = process.env.EXPO_PUBLIC_SERPAPI_KEY;
    if (serpKey && serpKey.trim() && serpKey !== 'your_serpapi_key_here') {
      const queries = buildSearchQueries(topic);
      searchQueriesUsed.push(...queries);
      const batches = await serpSearchBatch(queries);
      const hasReal = batches.some(b => b.results.some(r => !r.url.includes('example.com')));
      if (hasReal) {
        searchContext = formatSearchResults(batches);
        webSearchUsed = true;
      }
    }
  } catch (err) {
    console.warn('[PodcastScriptAgentV2] SerpAPI failed, continuing:', err);
  }

  const reportContext = report
    ? buildReportContext(report)
    : `Topic: "${topic}"\nUse realistic, specific industry statistics and expert knowledge.`;

  const styleGuide = getStyleGuide(style, speakers);

  // ── Outline first (only when it pays for itself) ───────────────────────────
  // Part 57c COST: the outline is a separate LLM call. For short episodes the
  // single-pass writer already produces a coherent arc, so we skip the outline
  // entirely (saves one call per podcast). We only spend it on longer episodes
  // (chunked path) where a shared outline keeps the chunks consistent.
  const useOutline = targetMins > CHUNKED_THRESHOLD_MINS;
  let outlineText = '';
  if (useOutline) {
    input.onProgress?.('Planning the episode outline...');
    const outline = await generateOutline(topic, targetMins, speakers, reportContext);
    outlineText   = outlineToText(outline);
  }

  // ── Script generation ──────────────────────────────────────────────────────

  input.onProgress?.(`Writing the ${targetMins}-minute script...`);

  let rawTurns: RawTurnV2[];
  let title:    string;
  let desc:     string;

  if (targetMins > CHUNKED_THRESHOLD_MINS) {
    const result = await generateChunkedV2(
      topic, targetTurns, requiredWords, speakers,
      styleGuide, reportContext, searchContext, outlineText, targetMins,
    );
    rawTurns = result.turns; title = result.title; desc = result.description;
  } else {
    const result = await generateSinglePassV2(
      topic, targetTurns, requiredWords, speakers,
      styleGuide, reportContext, searchContext, outlineText, targetMins,
    );
    rawTurns = result.turns; title = result.title; desc = result.description;
  }

  if (!rawTurns || rawTurns.length === 0) {
    throw new Error('Podcast script agent V2 returned an empty dialogue. Please try again.');
  }

  // Part 57b: enforce a hard per-turn length cap. The model sometimes emits one
  // huge monologue (300+ words) which (a) reads badly as a single TTS segment and
  // (b) can blow past the 4096-char TTS request limit. Split any overlong turn
  // into consecutive turns by the SAME speaker, broken at sentence boundaries.
  rawTurns = splitLongTurns(rawTurns, MAX_WORDS_PER_TURN);

  // ── Top-up if short ────────────────────────────────────────────────────────

  // ── Top-up only on a real shortfall ────────────────────────────────────────
  // Part 57c COST: the top-up is a third LLM call. The single-pass writer is
  // already prompted to hit the word target, so we only pay for a top-up when the
  // script comes in well short (< 70% of target) — not merely a little under.
  // This makes the extra call rare while still rescuing genuinely thin scripts.
  const currentWords = rawTurns.reduce((s, t) => s + countWords(t.text ?? ''), 0);
  const TOPUP_TRIGGER = 0.70;   // was WORD_COUNT_TOLERANCE (0.85)
  if (currentWords < requiredWords * TOPUP_TRIGGER) {
    input.onProgress?.('Enriching the conversation to hit target length...');
    rawTurns = await topUpShortTurns(rawTurns, requiredWords, speakers);
    // Re-split in case the top-up produced any overlong turns.
    rawTurns = splitLongTurns(rawTurns, MAX_WORDS_PER_TURN);
  }

  // ── Hydrate turns ──────────────────────────────────────────────────────────
  // Part 57: emit a V2-style `speaker` role ('host' | 'guest1' | 'guest2') so the
  // orchestrator's getSpeakerVoiceForV2Turn() can route each speaker — including
  // the 3rd — to its own voice. `speakerId` is kept as extra metadata.
  const idToV2Role = (id: string, role: PodcastSpeakerConfig['role']): 'host' | 'guest1' | 'guest2' => {
    if (role === 'host' || id === 'host') return 'host';
    if (role === 'guest2' || id === 'guest2') return 'guest2';
    return 'guest1';
  };

  const turns: PodcastTurn[] = rawTurns.map((raw, index) => {
    const speakerId = validSpeakerId(raw?.speaker ?? speakers[0].id, speakers);
    const spk       = speakers.find(s => s.id === speakerId) ?? speakers[0];
    const text      = (raw?.text ?? '').trim();
    const v2Role    = idToV2Role(spk.id, spk.role);
    // `speaker` carries the V2 role for voice routing; `speakerId` is extra
    // metadata. Cast keeps both on the object without changing shared types.
    return {
      id:           `turn-${index}`,
      segmentIndex: index,
      speaker:      v2Role,
      speakerId,
      speakerName:  spk.name,
      text,
      durationMs:   estimateTTSDurationMs(text),
    } as unknown as PodcastTurn;
  });

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

// ─── Backward-compat V1 wrapper ───────────────────────────────────────────────
// Part 35 introduced V2; older call sites still import runPodcastScriptAgent from
// this module. It maps the single host/guest V1 config to a 2-speaker V2 roster
// and delegates. Part 56 routing is inherited automatically (no model strings here).

export async function runPodcastScriptAgent(
  input: ScriptAgentInput
): Promise<ScriptAgentResult> {
  // hostVoice/guestVoice may not exist on the base PodcastConfig type; read them
  // defensively so V1 callers compile whether or not those fields are declared.
  const cfg = input.config as PodcastConfig & { hostVoice?: PodcastVoice; guestVoice?: PodcastVoice };
  const speakers: PodcastSpeakerConfig[] = [
    { id: 'host',  name: cfg.hostName,  role: 'host',  voice: cfg.hostVoice  ?? 'alloy' },
    { id: 'guest', name: cfg.guestName, role: 'guest', voice: cfg.guestVoice ?? 'onyx'  },
  ];

  return runPodcastScriptAgentV2({
    topic:       input.topic,
    report:      input.report,
    config:      input.config,
    speakers,
    presetStyle: input.presetStyle,
  });
}

// ─── Adapter: SpeakerConfig[] → agent roster (kept for external callers) ───────
// Thin alias over normalizeSpeakers so any caller holding a PodcastConfigV2's
// SpeakerConfig[] can pre-convert. normalizeSpeakers also runs internally, so
// passing raw SpeakerConfig[] straight to runPodcastScriptAgentV2 works too.
export function speakerConfigsToRoster(speakers: SpeakerConfig[]): PodcastSpeakerConfig[] {
  return normalizeSpeakers(speakers);
}