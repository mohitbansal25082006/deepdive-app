// src/services/agents/podcastScriptAgent.ts
// Part 39 — Advanced Podcast Script Agent V2
//
// MAJOR UPGRADES over V1 (podcastScriptAgent.ts):
//
// 1. THREE-SPEAKER SUPPORT
//    - host + guest1 + guest2 with distinct AI personas
//    - Guest chemistry system (tension/agreement based on persona combos)
//    - Dynamic speaker alternation weighted by persona role
//
// 2. ADVANCED SCRIPT STRUCTURE
//    - cold_open    → hook statement before intro (10-30s)
//    - intro        → host introduces topic + guests
//    - chapter      → natural topic transitions (3-5 chapters per episode)
//    - listener_qa  → 3 AI-generated fictional listener questions
//    - hot_take     → each speaker's most controversial opinion
//    - rapid_fire   → quick Q&A at episode end (proportional to duration)
//    - outro        → wrap-up + teaser for follow-up episode
//    - Callback moments (references to earlier dialogue)
//    - Inside joke established in turn 1, referenced later
//    - Cliff-hanger at episode midpoint
//
// 3. NATURAL SPEECH PATTERNS
//    - Filler words at appropriate frequency
//    - [laughs], [stressed], [pause] prosody markers
//    - Statistic storytelling (stats as narratives, not raw numbers)
//    - Disagreement escalation across episode
//
// 4. WEB SEARCH GROUNDING
//    - SerpAPI search before script generation
//    - Facts woven into dialogue naturally
//
// 5. CHUNKED GENERATION (preserved from V1)
//    - Episodes > 7 min use 2 GPT calls to prevent quality drop-off
//    - Top-up call if word count falls short
//
// BACKWARD COMPATIBILITY:
//    - runPodcastScriptAgent() still exported for V1 orchestrator usage
//    - runPodcastScriptAgentV2() is the new entry point

import { chatCompletionJSON }    from '../openaiClient';
import { serpSearchBatch }       from '../serpApiClient';
import type {
  ResearchReport,
  PodcastScript,
  PodcastConfig,
  SearchBatch,
} from '../../types';
import type {
  PodcastScriptV2,
  PodcastTurnV2,
  ChapterMarker,
  ScriptSegmentType,
  SpeakerConfig,
  VoicePresetStyleV2,
  GuestPersona,
} from '../../types/podcast_v2';
import {
  GUEST_PERSONA_CONFIG,
  GUEST_CHEMISTRY,
} from '../../constants/podcastV2';

// ─── Re-export original type for backward compat ──────────────────────────────
export type VoicePresetStyle = VoicePresetStyleV2;

// ─── Constants ─────────────────────────────────────────────────────────────────

const TTS_WPM            = 120;
const AVG_WORDS_PER_TURN = 120;
const MIN_WORDS_PER_TURN = 70;
const MAX_WORDS_PER_TURN = 180;
const CHUNKED_THRESHOLD  = 7; // minutes
const WORD_TOLERANCE     = 0.88;

// ─── Types ─────────────────────────────────────────────────────────────────────

interface RawTurnV2 {
  speaker:     'host' | 'guest1' | 'guest2';
  text:        string;
  segmentType?: ScriptSegmentType;
  chapterId?:  string;
}

interface RawScriptV2 {
  title:        string;
  description:  string;
  chapters:     { id: string; title: string; startTurnIdx: number }[];
  turns:        RawTurnV2[];
  teaser?:      string;
}

interface RawTurnsOnly {
  turns:     RawTurnV2[];
  chapters?: { id: string; title: string; startTurnIdx: number }[];
}

export interface ScriptAgentV2Result {
  script:           PodcastScriptV2;
  title:            string;
  description:      string;
  teaser:           string;
  webSearchUsed:    boolean;
  searchQueries:    string[];
}

export interface ScriptAgentV2Input {
  topic:        string;
  report?:      ResearchReport | null;
  speakers:     SpeakerConfig[];
  speakerCount: 2 | 3;
  targetDurationMinutes: number;
  presetStyleV2: VoicePresetStyleV2;
  /** Legacy compat */
  config?: PodcastConfig;
}

// ─── Word / Turn Math ──────────────────────────────────────────────────────────

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function estimateTTSDurationMs(text: string): number {
  // Strip prosody hints before estimating
  const cleaned = text.replace(/\[(laughs|stressed|pause|sighs|chuckles)\]/gi, '');
  return Math.round((countWords(cleaned) / TTS_WPM) * 60 * 1000);
}

function requiredWordCount(mins: number): number {
  return Math.round(mins * TTS_WPM * 1.2);
}

function calculateTargetTurns(mins: number): number {
  const raw = Math.round(requiredWordCount(mins) / AVG_WORDS_PER_TURN);
  return Math.min(70, Math.max(14, raw));
}

function maxTokensForTurns(turns: number): number {
  return Math.min(16000, turns * AVG_WORDS_PER_TURN * 2 + 800);
}

// ─── Strip prosody hints for TTS ──────────────────────────────────────────────

function stripProsodyHints(text: string): string {
  return text.replace(/\[(laughs|stressed|pause|sighs|chuckles|clears throat)\]/gi, '').replace(/\s+/g, ' ').trim();
}

function hasProsodyHints(text: string): boolean {
  return /\[(laughs|stressed|pause|sighs|chuckles)\]/i.test(text);
}

// ─── SerpAPI ──────────────────────────────────────────────────────────────────

function buildPodcastSearchQueries(topic: string): string[] {
  return [
    `${topic} latest news 2025`,
    `${topic} statistics data research`,
    `${topic} expert analysis trends`,
    `${topic} key developments breakthroughs`,
  ];
}

function formatSearchContext(batches: SearchBatch[]): string {
  const lines = ['━━━ LIVE WEB RESEARCH (weave 6+ facts naturally into dialogue) ━━━'];
  let count = 0;
  for (const batch of batches) {
    if (count >= 20) break;
    for (const r of batch.results.slice(0, 3)) {
      if (!r.snippet || count >= 20) continue;
      lines.push(`• [${r.source ?? r.url}] ${r.snippet}`);
      count++;
    }
  }
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  return lines.join('\n');
}

// ─── Report Context ────────────────────────────────────────────────────────────

function buildReportContext(report: ResearchReport): string {
  const stats    = (report.statistics    ?? []).slice(0, 10);
  const findings = (report.keyFindings   ?? []).slice(0, 8);
  const preds    = (report.futurePredictions ?? []).slice(0, 5);
  const sections = (report.sections      ?? []).slice(0, 4);

  const secText = sections.map(s => {
    const bullets = (s.bullets ?? []).slice(0, 3).map(b => `  • ${b}`).join('\n');
    // FIX: wrap the ?? operand in parentheses to avoid mixing || and ?? without parens
    return `${s.title}:\n${bullets || (s.content?.slice(0, 300) ?? '')}`;
  }).join('\n\n');

  return `━━━━ RESEARCH REPORT: "${report.title}" ━━━━
SUMMARY: ${report.executiveSummary?.slice(0, 500) ?? ''}
KEY FINDINGS:\n${findings.map((f, i) => `${i + 1}. ${f}`).join('\n')}
STATISTICS (use exact numbers):\n${stats.map(s => `• ${s.value}: ${s.context} (${s.source})`).join('\n')}
PREDICTIONS:\n${preds.map(p => `• ${p}`).join('\n')}
SECTIONS:\n${secText}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`.trim();
}

// ─── Speaker System Prompt Builder ────────────────────────────────────────────

function buildSpeakerDescriptions(speakers: SpeakerConfig[]): string {
  return speakers.map(s => {
    const persona = s.persona ? GUEST_PERSONA_CONFIG[s.persona] : null;
    const catchphrases = (s.catchphrases?.length ?? 0) > 0
      ? `\n  Catchphrases to use occasionally: ${s.catchphrases?.join(', ')}`
      : '';
    return `${s.role.toUpperCase()} — ${s.name}:
  Style: ${s.style ?? 'engaging conversationalist'}
  ${persona ? `Persona: ${persona.label} — ${persona.styleGuide}` : ''}${catchphrases}`;
  }).join('\n\n');
}

function getChemistryNote(speakers: SpeakerConfig[]): string {
  if (speakers.length < 3) return '';
  const p1 = speakers[1]?.persona;
  const p2 = speakers[2]?.persona;
  if (!p1 || !p2) return '';
  const key = `${p1}+${p2}`;
  const tension = GUEST_CHEMISTRY[key] ?? GUEST_CHEMISTRY[`${p2}+${p1}`] ?? 0.5;
  if (tension >= 0.7) return '\n⚡ HIGH TENSION: These two guests naturally disagree. Let their conflict build naturally — escalate across the episode.';
  if (tension <= 0.3) return '\n🤝 COLLABORATIVE: These guests agree often. Create harmony and build on each other\'s points.';
  return '\n⚖️ BALANCED: These guests respectfully challenge each other with occasional disagreements.';
}

function buildStyleGuide(style: VoicePresetStyleV2, speakers: SpeakerConfig[]): string {
  const [host, g1, g2] = speakers;
  const names = g2 ? `${host?.name}, ${g1?.name}, and ${g2?.name}` : `${host?.name} and ${g1?.name}`;

  const styleGuides: Record<VoicePresetStyleV2, string> = {
    casual:            `STYLE: Casual Conversation. ${names} are like smart friends over coffee. Use contractions, informal language, humor, tangents. Short punchy reactions (20-40w) mixed with paragraph-length (80-160w) turns.`,
    expert:            `STYLE: Expert Interview. ${host?.name} is a sharp journalist probing ${g1?.name}, a leading authority. Substantive, precise, data-driven. Most turns 100-160w. Include historical context and expert challenges.`,
    tech:              `STYLE: Tech Podcast. Technical depth with plain-English explanations. Real product examples, engineering war stories. 100-160w per turn. ${names} debate implementation details.`,
    narrative:         `STYLE: Documentary Storytelling. Scene-setting, suspense, revelation. ${names} build a story with insider perspectives. 100-180w per turn. Cinematic pacing.`,
    debate:            `STYLE: Structured Debate. ${host?.name} moderates while guests take opposing positions. Steel-man every argument. Evidence-based rebuttals. Tension escalates toward midpoint.`,
    news:              `STYLE: News Analysis. Authoritative, current, explanatory. Ground every claim in recent data. ${names} analyze implications. 90-160w per turn.`,
    formal_broadcaster:`STYLE: Formal Broadcast. BBC-level gravitas. Precise language, no slang. ${names} report and analyze with authority. Measured pace, 110-160w per turn.`,
    casual_youtuber:   `STYLE: Casual YouTube energy. Loud, reactive, Gen-Z vibes. Short bursts (30-60w) of hype mixed with longer explanations. Lots of "no cap", "lowkey", "that's insane". Tangents are good.`,
    npr_journalist:    `STYLE: NPR-style. Empathetic, nuanced, human-centered. Stories about real people impacted by the topic. Thoughtful pauses and follow-up questions. 100-160w per turn.`,
    joe_rogan:         `STYLE: Long-form conversational. Unfiltered opinions, genuine curiosity, tangents welcomed. ${host?.name} challenges everything. Some turns very long (150-180w), some short. "That's insane dude" energy.`,
    bbc_documentary:   `STYLE: BBC Documentary narration. ${host?.name} narrates the story, guests provide expert context. Slow, deliberate, authoritative. Sense of gravity. 120-180w per turn.`,
  };

  return (styleGuides[style] ?? styleGuides.casual) + getChemistryNote(speakers);
}

// ─── Script Structure Planner ──────────────────────────────────────────────────

function buildStructurePlan(targetTurns: number, speakerCount: 2 | 3, targetMins: number): string {
  const hasRapidFire = targetMins >= 10;
  const chapterCount = targetMins <= 7 ? 2 : targetMins <= 12 ? 3 : 4;

  return `REQUIRED SCRIPT STRUCTURE (${targetTurns} total turns):

1. COLD OPEN (turns 1-2): Hook statement — start mid-thought, NOT "welcome to the podcast". Something provocative or fascinating about the topic. ${speakerCount === 3 ? 'All three speakers react.' : ''}

2. INTRO (turns 3-4): Brief intro of topic and speakers.

3. CHAPTERS (${chapterCount} chapters): Natural topic progression. Mark each with a chapter transition phrase like "Let's shift to..." or "Here's what most people miss about..."
   - Chapter 1: Context & background (turns ~5-${Math.round(targetTurns * 0.3)})
   - Chapter 2: Deep dive into data & mechanisms (turns ~${Math.round(targetTurns * 0.3)}-${Math.round(targetTurns * 0.55)})
   ${chapterCount >= 3 ? `- Chapter 3: Controversies, challenges, real examples (turns ~${Math.round(targetTurns * 0.55)}-${Math.round(targetTurns * 0.72)})` : ''}
   ${chapterCount >= 4 ? `- Chapter 4: Future outlook & predictions (turns ~${Math.round(targetTurns * 0.72)}-${Math.round(targetTurns * 0.82)})` : ''}

4. MIDPOINT CLIFF-HANGER (around turn ${Math.round(targetTurns * 0.5)}): Peak tension or a surprising revelation. Make the listener NEED to keep going.

5. LISTENER Q&A (3 turns): Host reads 3 fictional listener questions relevant to the topic. Guests answer each in 1-2 turns.

6. HOT TAKES (${speakerCount} turns): Each speaker gives their most controversial opinion on the topic.
${hasRapidFire ? `
7. RAPID FIRE ROUND (~4 turns): Host fires short yes/no or one-word questions. Guests must answer quickly. Fast, punchy, fun.
` : ''}
8. OUTRO (turns ${targetTurns - 2}-${targetTurns}): Wrap up key takeaways. Tease the follow-up episode topic.

CALLBACKS: Reference something from earlier turns at least 2 times ("Like we said earlier about X...", "Remember what you mentioned about Y...").
INSIDE JOKE: Establish a running joke or phrase in turn 2-3. Reference it again in turns ~${Math.round(targetTurns * 0.6)} and ${targetTurns - 1}.`;
}

// ─── System Prompt Builder ─────────────────────────────────────────────────────

function buildSystemPromptV2(
  styleGuide:    string,
  speakers:      SpeakerConfig[],
  requiredWords: number,
  targetMins:    number,
): string {
  return `You are an award-winning podcast scriptwriter. You write for Radiolab, NPR, Lex Fridman, and BBC Documentaries.

${styleGuide}

SPEAKERS:
${buildSpeakerDescriptions(speakers)}

DURATION RULES:
- This podcast must produce ${targetMins} minutes of audio when read aloud at ${TTS_WPM} WPM
- Requires AT LEAST ${requiredWords} total spoken words
- Most turns must be ${MIN_WORDS_PER_TURN}-${MAX_WORDS_PER_TURN} words — full paragraphs, not one-liners
- Short "reaction" turns (20-40 words) are allowed sparingly for natural flow

NATURAL SPEECH RULES:
1. Use contractions: "it's", "we're", "that's", "you'd"
2. Add filler phrases: "I mean...", "Here's the thing—", "What's fascinating is..."
3. Use prosody markers sparingly: [laughs], [pause], [stressed] — 1-2 per 10 turns max
4. Present statistics as stories: NOT "revenue grew 47%" BUT "they went from nearly bankrupt to a $2 billion valuation in just three years"
5. Flowing prose ONLY — no bullet points, no lists in dialogue
6. ${speakers.length === 3 ? 'All three speakers must contribute throughout — no speaker should be silent for more than 4 consecutive turns' : 'Both speakers must contribute throughout'}
7. DISAGREEMENT ESCALATION: Early turns are polite agreement. Middle turns have gentle pushback. Later turns have stronger, more direct challenges.`;
}

// ─── Chapter Builder ───────────────────────────────────────────────────────────

function buildChaptersFromRaw(
  rawChapters: { id: string; title: string; startTurnIdx: number }[],
  turns:       PodcastTurnV2[],
): ChapterMarker[] {
  return (rawChapters ?? []).map((rc, idx) => {
    const nextStart = rawChapters[idx + 1]?.startTurnIdx ?? turns.length;
    const chTurns   = turns.slice(rc.startTurnIdx, nextStart);
    const timeMs    = turns.slice(0, rc.startTurnIdx).reduce((s, t) => s + (t.durationMs ?? 0), 0);
    return {
      id:           rc.id,
      title:        rc.title,
      startTurnIdx: rc.startTurnIdx,
      endTurnIdx:   nextStart - 1,
      timeMs,
    };
  });
}

// ─── Single-pass Generation ────────────────────────────────────────────────────

async function generateSinglePassV2(
  topic:         string,
  targetTurns:   number,
  requiredWords: number,
  speakers:      SpeakerConfig[],
  speakerCount:  2 | 3,
  styleGuide:    string,
  reportContext: string,
  searchContext: string,
  targetMins:    number,
): Promise<RawScriptV2> {
  const structure  = buildStructurePlan(targetTurns, speakerCount, targetMins);
  const systemPrompt = buildSystemPromptV2(styleGuide, speakers, requiredWords, targetMins);

  const speakerRoles = speakerCount === 3
    ? `Speakers: host="${speakers[0]?.name}", guest1="${speakers[1]?.name}", guest2="${speakers[2]?.name}"`
    : `Speakers: host="${speakers[0]?.name}", guest1="${speakers[1]?.name}"`;

  const userPrompt = `Write a complete ${targetMins}-minute podcast episode about: "${topic}"

${reportContext}

${searchContext ? searchContext + '\n\n' : ''}

${speakerRoles}

${structure}

TOTAL TURNS: Exactly ${targetTurns} turns
TOTAL WORDS: At least ${requiredWords} words

Return ONLY valid JSON:
{
  "title": "Compelling episode title (8-16 words)",
  "description": "2-3 sentence description that makes someone want to listen",
  "teaser": "1 sentence teasing the next episode topic",
  "chapters": [
    { "id": "ch1", "title": "Chapter title", "startTurnIdx": 4 }
  ],
  "turns": [
    { "speaker": "host", "text": "70-180 word paragraph...", "segmentType": "cold_open", "chapterId": null },
    { "speaker": "guest1", "text": "70-180 word paragraph...", "segmentType": "cold_open", "chapterId": null }
  ]
}

segmentType must be one of: cold_open, intro, chapter, listener_qa, hot_take, rapid_fire, outro, normal`;

  const raw = await chatCompletionJSON<RawScriptV2>(
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
    title:       raw?.title?.trim()       ?? `${topic} — Deep Dive`,
    description: raw?.description?.trim() ?? '',
    teaser:      raw?.teaser?.trim()      ?? '',
    chapters:    raw?.chapters            ?? [],
    turns:       raw?.turns               ?? [],
  };
}

// ─── Chunked Generation ────────────────────────────────────────────────────────

async function generateChunkedV2(
  topic:         string,
  targetTurns:   number,
  requiredWords: number,
  speakers:      SpeakerConfig[],
  speakerCount:  2 | 3,
  styleGuide:    string,
  reportContext: string,
  searchContext: string,
  targetMins:    number,
): Promise<RawScriptV2> {
  const halfTurns    = Math.ceil(targetTurns / 2);
  const secondHalf   = targetTurns - halfTurns;
  const wordsPerHalf = Math.ceil(requiredWords / 2);
  const structurePlan = buildStructurePlan(targetTurns, speakerCount, targetMins);
  const systemPrompt  = buildSystemPromptV2(styleGuide, speakers, requiredWords, targetMins);
  const speakerRoles  = speakerCount === 3
    ? `host="${speakers[0]?.name}", guest1="${speakers[1]?.name}", guest2="${speakers[2]?.name}"`
    : `host="${speakers[0]?.name}", guest1="${speakers[1]?.name}"`;

  // ── Call A: First half ──────────────────────────────────────────────────────

  const promptA = `Write the FIRST HALF of a ${targetMins}-minute podcast about: "${topic}"

${reportContext}

${searchContext ? searchContext + '\n\n' : ''}

Speakers: ${speakerRoles}

STRUCTURE OVERVIEW (full episode):
${structurePlan}

FIRST HALF INSTRUCTIONS (turns 1-${halfTurns}):
- Include: cold_open, intro, and the first 2 chapters
- End with the CLIFF-HANGER — the tension peak that makes listeners stay
- Words for this half: at least ${wordsPerHalf}
- Establish the inside joke/running phrase that will be called back later

Return ONLY valid JSON:
{
  "title": "Episode title (8-16 words)",
  "description": "2-3 sentence description",
  "teaser": "",
  "chapters": [
    { "id": "ch1", "title": "Chapter title", "startTurnIdx": 4 }
  ],
  "turns": [
    { "speaker": "host", "text": "...", "segmentType": "cold_open", "chapterId": null }
  ]
}`;

  const rawA = await chatCompletionJSON<RawScriptV2>(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: promptA      },
    ],
    {
      temperature: 0.72,
      maxTokens:   maxTokensForTurns(halfTurns),
    }
  );

  const turnsA      = rawA?.turns    ?? [];
  const chaptersA   = rawA?.chapters ?? [];
  const title       = rawA?.title?.trim()       ?? `${topic} — Deep Dive`;
  const description = rawA?.description?.trim() ?? '';

  // Build context for second half
  const firstHalfContext = turnsA.slice(-5).map(
    t => `${t.speaker === 'host' ? speakers[0]?.name : t.speaker === 'guest1' ? speakers[1]?.name : speakers[2]?.name}: "${t.text.slice(0, 150)}..."`
  ).join('\n');

  // ── Call B: Second half ──────────────────────────────────────────────────────

  const promptB = `Continue the podcast episode about: "${topic}"

The first half just ended here:
---
${firstHalfContext}
---

SECOND HALF INSTRUCTIONS (turns ${halfTurns + 1}-${targetTurns}):
- Include: remaining chapters, listener Q&A, hot takes, ${targetMins >= 10 ? 'rapid fire round,' : ''} and outro
- CALLBACK: Reference something from the first half at least twice
- INSIDE JOKE: Call back the running phrase established in the first half  
- Outro must tease a follow-up episode topic
- Words for this half: at least ${wordsPerHalf}
- This is the CONCLUSION — build to a memorable close

Speakers: ${speakerRoles}

Return ONLY valid JSON:
{
  "turns": [
    { "speaker": "guest1", "text": "...", "segmentType": "chapter", "chapterId": "ch2" }
  ],
  "chapters": [
    { "id": "ch3", "title": "Chapter title", "startTurnIdx": ${halfTurns + 5} }
  ],
  "teaser": "One sentence teasing the follow-up episode topic"
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

  const turnsB    = rawB?.turns    ?? [];
  const chaptersB = (rawB?.chapters ?? []).map(ch => ({
    ...ch,
    startTurnIdx: ch.startTurnIdx, // already offset from B's perspective
  }));

  return {
    title,
    description,
    teaser:   (rawB as any)?.teaser?.trim() ?? '',
    chapters: [...chaptersA, ...chaptersB],
    turns:    [...turnsA, ...turnsB],
  };
}

// ─── Top-up call ────────────────────────────────────────────────────────────────

async function topUpShortTurns(
  turns:        RawTurnV2[],
  targetWords:  number,
  speakers:     SpeakerConfig[],
): Promise<RawTurnV2[]> {
  const currentWords = turns.reduce((s, t) => s + countWords(t.text), 0);
  const shortfall    = targetWords - currentWords;
  if (shortfall <= 0) return turns;

  const indexed  = turns.map((t, i) => ({ ...t, idx: i, wc: countWords(t.text) }));
  const shortest = [...indexed].sort((a, b) => a.wc - b.wc).slice(0, 6);

  const getSpeakerName = (role: string) => {
    if (role === 'host')   return speakers[0]?.name ?? 'Host';
    if (role === 'guest2') return speakers[2]?.name ?? 'Guest 2';
    return speakers[1]?.name ?? 'Guest';
  };

  const expansionPrompt = `Expand each podcast turn to be 120-160 words while keeping the same voice, content, and speaker personality. Add specific details, examples, or statistics.

${shortest.map((t, i) => `TURN ${i + 1} (${getSpeakerName(t.speaker)}, ${t.wc} words):\n"${t.text}"`).join('\n\n')}

Need ${shortfall} more total words. Return ONLY valid JSON:
{
  "expanded": [
    { "index": 0, "text": "Expanded text 120-160 words..." }
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
    console.warn('[PodcastScriptAgentV2] Top-up failed (non-fatal):', err);
  }
  return turns;
}

// ─── Main V2 Agent ─────────────────────────────────────────────────────────────

export async function runPodcastScriptAgentV2(
  input: ScriptAgentV2Input,
): Promise<ScriptAgentV2Result> {
  const { topic, report, speakers, speakerCount, targetDurationMinutes, presetStyleV2 } = input;
  const targetMins    = targetDurationMinutes;
  const targetTurns   = calculateTargetTurns(targetMins);
  const requiredWords = requiredWordCount(targetMins);

  // ── Web search ────────────────────────────────────────────────────────────

  let searchContext  = '';
  let webSearchUsed  = false;
  const searchQueries: string[] = [];

  try {
    const serpKey = process.env.EXPO_PUBLIC_SERPAPI_KEY;
    if (serpKey && serpKey.trim() && serpKey !== 'your_serpapi_key_here') {
      const queries = buildPodcastSearchQueries(topic);
      searchQueries.push(...queries);
      const batches = await serpSearchBatch(queries);
      const hasReal = batches.some(b => b.results.some(r => !r.url.includes('example.com')));
      if (hasReal) {
        searchContext = formatSearchContext(batches);
        webSearchUsed = true;
      }
    }
  } catch (err) {
    console.warn('[PodcastScriptAgentV2] SerpAPI failed (non-fatal):', err);
  }

  // ── Build contexts ─────────────────────────────────────────────────────────

  const reportContext = report
    ? buildReportContext(report)
    : `Topic: "${topic}"\nUse realistic, specific industry statistics and expert knowledge.`;

  const styleGuide = buildStyleGuide(presetStyleV2, speakers);

  // ── Generate script ────────────────────────────────────────────────────────

  let rawScript: RawScriptV2;

  if (targetMins > CHUNKED_THRESHOLD) {
    rawScript = await generateChunkedV2(
      topic, targetTurns, requiredWords,
      speakers, speakerCount, styleGuide,
      reportContext, searchContext, targetMins,
    );
  } else {
    rawScript = await generateSinglePassV2(
      topic, targetTurns, requiredWords,
      speakers, speakerCount, styleGuide,
      reportContext, searchContext, targetMins,
    );
  }

  if (!rawScript.turns || rawScript.turns.length === 0) {
    throw new Error('Script agent returned empty dialogue. Please try again.');
  }

  // ── Top-up if needed ───────────────────────────────────────────────────────

  let rawTurns = rawScript.turns;
  const currentWords = rawTurns.reduce((s, t) => s + countWords(t.text ?? ''), 0);
  if (currentWords < requiredWords * WORD_TOLERANCE) {
    console.log(`[PodcastScriptAgentV2] Topping up: ${currentWords} < ${Math.round(requiredWords * WORD_TOLERANCE)} target`);
    rawTurns = await topUpShortTurns(rawTurns, requiredWords, speakers);
  }

  // ── Transform to PodcastTurnV2[] ──────────────────────────────────────────

  const turns: PodcastTurnV2[] = rawTurns.map((raw, index) => {
    const speaker     = (raw?.speaker ?? 'host') as 'host' | 'guest1' | 'guest2';
    const rawText     = (raw?.text ?? '').trim();
    const cleanText   = stripProsodyHints(rawText);
    const segmentType = (raw?.segmentType ?? 'normal') as ScriptSegmentType;

    const speakerName =
      speaker === 'host'   ? (speakers[0]?.name ?? 'Host') :
      speaker === 'guest2' ? (speakers[2]?.name ?? 'Guest 2') :
                             (speakers[1]?.name ?? 'Guest');

    return {
      id:               `turn-${index}`,
      segmentIndex:     index,
      speaker,
      speakerName,
      text:             cleanText, // TTS gets clean text
      audioPath:        undefined,
      durationMs:       estimateTTSDurationMs(cleanText),
      segmentType,
      chapterId:        raw?.chapterId ?? undefined,
      hasProsodyHints:  hasProsodyHints(rawText),
    };
  });

  // ── Build chapter markers ──────────────────────────────────────────────────

  const chapters = buildChaptersFromRaw(rawScript.chapters ?? [], turns);

  const totalWords = turns.reduce((sum, t) => sum + countWords(t.text), 0);
  const estimatedDurationMinutes = Math.round((totalWords / TTS_WPM) * 10) / 10;

  const script: PodcastScriptV2 = {
    turns,
    chapters,
    totalWords,
    estimatedDurationMinutes,
    speakerCount,
    webSearchUsed,
  };

  return {
    script,
    title:         rawScript.title       || `${topic} — Deep Dive`,
    description:   rawScript.description || `An in-depth ${targetMins}-minute exploration of ${topic}.`,
    teaser:        rawScript.teaser      || '',
    webSearchUsed,
    searchQueries,
  };
}

// ─── Backward-compat V1 wrapper ────────────────────────────────────────────────
// Allows podcastOrchestrator.ts (V1) to still call this without changes.

export interface ScriptAgentInput {
  topic:        string;
  report?:      ResearchReport | null;
  config:       PodcastConfig;
  presetStyle?: VoicePresetStyle;
}

export interface ScriptAgentResult {
  script:         PodcastScript;
  title:          string;
  description:    string;
  webSearchUsed:  boolean;
  searchQueries:  string[];
}

export async function runPodcastScriptAgent(
  input: ScriptAgentInput,
): Promise<ScriptAgentResult> {
  const { topic, report, config, presetStyle } = input;

  const speakers: SpeakerConfig[] = [
    { name: config.hostName,  voice: config.hostVoice,  role: 'host'   },
    { name: config.guestName, voice: config.guestVoice, role: 'guest1' },
  ];

  const v2Input: ScriptAgentV2Input = {
    topic,
    report:                report ?? null,
    speakers,
    speakerCount:          2,
    targetDurationMinutes: config.targetDurationMinutes,
    presetStyleV2:         (presetStyle as VoicePresetStyleV2) ?? 'casual',
    config,
  };

  const v2Result = await runPodcastScriptAgentV2(v2Input);

  // Convert PodcastScriptV2 → PodcastScript (V1 format)
  const v1Script: PodcastScript = {
    turns: v2Result.script.turns.map(t => ({
      id:           t.id,
      segmentIndex: t.segmentIndex,
      speaker:      t.speaker === 'host' ? 'host' : 'guest',
      speakerName:  t.speakerName,
      text:         t.text,
      audioPath:    t.audioPath,
      durationMs:   t.durationMs,
    })),
    totalWords:               v2Result.script.totalWords,
    estimatedDurationMinutes: v2Result.script.estimatedDurationMinutes,
  };

  return {
    script:       v1Script,
    title:        v2Result.title,
    description:  v2Result.description,
    webSearchUsed: v2Result.webSearchUsed,
    searchQueries: v2Result.searchQueries,
  };
}