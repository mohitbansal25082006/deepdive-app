// src/services/agents/podcastScriptAgent.ts
// Part 8 — Generates a realistic two-person podcast dialogue using GPT-4o.
// Takes a topic + optional ResearchReport and returns a structured PodcastScript.

import { chatCompletionJSON } from '../openaiClient';
import {
  ResearchReport,
  PodcastScript,
  PodcastTurn,
  PodcastConfig,
} from '../../types';

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

export interface ScriptAgentResult {
  script: PodcastScript;
  title: string;
  description: string;
}

interface ScriptAgentInput {
  topic: string;
  report?: ResearchReport | null;
  config: PodcastConfig;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Estimate playback duration in ms — ~150 wpm natural speech */
function estimateDurationMs(text: string): number {
  return Math.round((countWords(text) / 150) * 60 * 1000);
}

function buildReportContext(report: ResearchReport): string {
  const stats = Array.isArray(report.statistics) ? report.statistics : [];
  const findings = Array.isArray(report.keyFindings) ? report.keyFindings : [];
  const predictions = Array.isArray(report.futurePredictions) ? report.futurePredictions : [];
  const sections = Array.isArray(report.sections) ? report.sections : [];

  const sectionHighlights = sections.slice(0, 3).map(s => {
    const bullets = (s.bullets ?? []).slice(0, 2).map(b => `  • ${b}`).join('\n');
    return `${s.title}:\n${bullets}`;
  }).join('\n\n');

  return `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RESEARCH REPORT: "${report.title}"

EXECUTIVE SUMMARY (first 500 chars):
${report.executiveSummary?.slice(0, 500) ?? ''}

KEY FINDINGS:
${findings.slice(0, 6).map((f, i) => `${i + 1}. ${f}`).join('\n')}

KEY STATISTICS:
${stats.slice(0, 8).map(s => `• ${s.value}: ${s.context} (${s.source})`).join('\n')}

FUTURE PREDICTIONS:
${predictions.slice(0, 4).map(p => `• ${p}`).join('\n')}

SECTION HIGHLIGHTS:
${sectionHighlights}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Weave these specific data points naturally into the conversation.
The guest should cite these statistics as if they know the research deeply.
`.trim();
}

// ─── Main Agent ───────────────────────────────────────────────────────────────

export async function runPodcastScriptAgent(
  input: ScriptAgentInput
): Promise<ScriptAgentResult> {
  const { topic, report, config } = input;

  // Target ~3 turns per minute of podcast; clamp between 18 and 42
  const targetTurns = Math.max(18, Math.min(42, Math.round(config.targetDurationMinutes * 3)));

  const systemPrompt = `You are an award-winning podcast producer and scriptwriter for a science and technology podcast.
You write natural, engaging conversations that feel like two smart people genuinely talking — not reading from a script.

HOST personality (${config.hostName}):
- Intelligent generalist — curious, genuinely surprised by interesting data
- Asks great follow-up questions, sometimes respectfully pushes back
- Uses natural connectors: "Wow, that's wild", "Wait, so you're saying…", "Right, and that connects to…"

GUEST personality (${config.guestName}):
- Leading expert — enthusiastic, uses concrete analogies to explain complex ideas
- Backs claims with specific data, gives historical context
- Occasionally expresses genuine uncertainty: "The honest answer is we don't fully know yet"

WRITING RULES:
1. Use contractions: "it's", "we're", "that's", "you'd"
2. Vary turn length: some short reactive turns (20-40 words), most medium (50-100 words), occasional longer analysis turns (100-140 words)
3. Natural interruption markers are fine: "—exactly", "—right, yes"
4. Include at least 6 specific statistics or data points
5. No generic filler — every sentence moves the conversation forward
6. The guest must never sound like they're reading from slides`;

  const reportContext = report
    ? buildReportContext(report)
    : `Generate well-researched, data-driven conversation with plausible, realistic industry statistics and expert knowledge on: "${topic}"`;

  const structureGuide = `
EPISODE STRUCTURE (${targetTurns} turns total):
- Turns 1-3:    Hook — host opens with a striking fact or question, introduces guest
- Turns 4-${Math.round(targetTurns * 0.3)}:   First deep dive — current landscape, why this matters NOW
- Turns ${Math.round(targetTurns * 0.3)}-${Math.round(targetTurns * 0.55)}: Key findings — surprising statistics, concrete examples
- Turns ${Math.round(targetTurns * 0.55)}-${Math.round(targetTurns * 0.75)}: Tension & complexity — challenges, controversies, counterarguments
- Turns ${Math.round(targetTurns * 0.75)}-${Math.round(targetTurns * 0.9)}: Future outlook — predictions, expert perspective
- Turns ${Math.round(targetTurns * 0.9)}-${targetTurns}: Wrap-up — key takeaway, what listeners should do next`.trim();

  const userPrompt = `Write a ${config.targetDurationMinutes}-minute podcast episode about: "${topic}"

${reportContext}

${structureGuide}

HOST: ${config.hostName}
GUEST: ${config.guestName}

Create EXACTLY ${targetTurns} dialogue turns.
Start with the host. Alternate naturally (host doesn't have to speak every other turn).

Return ONLY valid JSON, absolutely no markdown fencing:
{
  "title": "Catchy episode title (6-14 words, not generic)",
  "description": "Compelling 2-3 sentence episode description that makes someone want to listen",
  "turns": [
    {
      "speaker": "host",
      "text": "Natural spoken dialogue — use contractions, be specific"
    },
    {
      "speaker": "guest",
      "text": "Expert response with a specific data point or analogy"
    }
  ]
}`;

  const raw = await chatCompletionJSON<RawScriptResponse>(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userPrompt   },
    ],
    { temperature: 0.72, maxTokens: 7000 }
  );

  // ── Validate ──────────────────────────────────────────────────────────────

  if (!raw?.turns || !Array.isArray(raw.turns) || raw.turns.length === 0) {
    throw new Error(
      'Podcast script agent returned an empty dialogue. Please try again.'
    );
  }

  // ── Transform raw turns → PodcastTurn[] ──────────────────────────────────

  const turns: PodcastTurn[] = raw.turns.map((rawTurn, index) => {
    const speaker = rawTurn?.speaker === 'guest' ? 'guest' : 'host';
    const text = (rawTurn?.text ?? '').trim();
    return {
      id:           `turn-${index}`,
      segmentIndex: index,
      speaker,
      speakerName:  speaker === 'host' ? config.hostName : config.guestName,
      text,
      durationMs:   estimateDurationMs(text),
    };
  });

  // ── Compute totals ────────────────────────────────────────────────────────

  const totalWords = turns.reduce((sum, t) => sum + countWords(t.text), 0);
  const estimatedDurationMinutes =
    Math.round((totalWords / 150) * 10) / 10; // 1 decimal place

  const script: PodcastScript = {
    turns,
    totalWords,
    estimatedDurationMinutes,
  };

  return {
    script,
    title:       raw.title?.trim()       ?? `${topic} — A Deep Dive`,
    description: raw.description?.trim() ?? `An in-depth exploration of ${topic}.`,
  };
}