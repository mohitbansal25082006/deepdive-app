// src/services/agents/voiceDebateScriptAgent.ts
// Part 40 — Voice Debate Engine
//
// Two-phase dialectic script agent.
//
// PHASE 1 — Each of the 6 agents generates independently:
//   • Opening statement grounded in the debate's existing perspectives
//   • 2–3 key argument lines
//   • A memorable key quote
//   • Confidence score
//
// PHASE 2 — Each agent receives a digest of ALL other Phase 1 outputs:
//   • 2 cross-examination challenges targeting specific opponents
//   • A rebuttal responding to the strongest incoming challenge
//   • Optional honest concession
//   • Closing argument
//   • Updated confidence score (may change after seeing others)
//
// ASSEMBLY — Moderator generates:
//   • Intro/transition lines for each segment
//   • 3 AI audience questions drawn from key tensions
//   • Final balanced verdict
//
// OUTPUT — VoiceDebateScript with:
//   • Fully ordered turns across 6 segments
//   • ArgumentRef threading (who challenged whom)
//   • Per-turn confidence
//   • Segment boundary markers

import { chatCompletionJSON } from '../openaiClient';
import {
  VOICE_PERSONAS,
  SEGMENT_LABELS,
  AUDIENCE_QUESTIONS_COUNT,
  MAX_TURN_TEXT_CHARS,
  DEBATE_WPM,
} from '../../constants/voiceDebate';
import type {
  VoiceDebateTurn,
  VoiceDebateScript,
  DebateSegment,
  AgentPhase1Raw,
  AgentPhase2Raw,
  DebateSegmentType,
} from '../../types/voiceDebate';
import type { DebateAgentRole, DebatePerspective, DebateModerator } from '../../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

let _turnId = 0;
function nextId(): string {
  return `vdt-${Date.now()}-${++_turnId}`;
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function estimateDurationMs(text: string): number {
  return Math.round((wordCount(text) / DEBATE_WPM) * 60 * 1000);
}

// Truncate text to stay within gpt-4o-mini-tts 2000-token limit
function truncateToLimit(text: string, maxChars = MAX_TURN_TEXT_CHARS): string {
  if (text.length <= maxChars) return text;
  const truncated = text.slice(0, maxChars);
  const lastPeriod = truncated.lastIndexOf('.');
  return lastPeriod > maxChars * 0.6
    ? truncated.slice(0, lastPeriod + 1)
    : truncated.slice(0, truncated.lastIndexOf(' ')) + '...';
}

// Strip prosody markers that TTS can't speak (e.g. [laughs], [pause])
function cleanForTTS(text: string): string {
  return text
    .replace(/\[.*?\]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// Build a readable digest of a perspective for cross-analysis
function buildPerspectiveDigest(p: DebatePerspective): string {
  const args = (p.arguments ?? []).slice(0, 3)
    .map((a, i) => `  ${i + 1}. ${a.point}: ${a.evidence.slice(0, 120)}`)
    .join('\n');
  return [
    `${p.agentName} (${p.stanceLabel}):`,
    `  Confidence: ${p.confidence}/10`,
    `  Summary: ${(p.summary ?? '').slice(0, 200)}`,
    args ? `  Arguments:\n${args}` : '',
  ].filter(Boolean).join('\n');
}

// ─── PHASE 1: Generate opening arguments for one agent ────────────────────────

async function generatePhase1(
  topic:       string,
  question:    string,
  perspective: DebatePerspective,
): Promise<AgentPhase1Raw> {
  const persona = VOICE_PERSONAS[perspective.agentRole];

  const prompt = `You are generating the SPOKEN OPENING STATEMENT for a voice debate.

DEBATE TOPIC: "${topic}"
CENTRAL QUESTION: "${question}"

YOUR ROLE: ${persona.displayName} (${perspective.tagline})
YOUR EXISTING STANCE: ${perspective.stanceLabel}
YOUR EXISTING SUMMARY (reference for consistency):
${(perspective.summary ?? '').slice(0, 400)}

YOUR KEY ARGUMENTS (reference):
${(perspective.arguments ?? []).slice(0, 3).map(a => `• ${a.point}: ${a.evidence.slice(0, 120)}`).join('\n')}

TASK: Write your OPENING STATEMENT as if you are SPEAKING it aloud in a live debate.
- Must sound natural when spoken (no bullet points, no markdown, no brackets)
- 100–150 words maximum (will be read aloud by TTS)
- Reference one specific statistic or finding from your research
- End with a clear, confident statement of your position
- Match your role's personality: ${persona.instructions.slice(0, 80)}

Also provide:
- 2–3 short "key argument lines" (each under 20 words) — punchy soundbites
- Your single most memorable quote (1 sentence)
- Confidence score 1–10 based on your evidence quality

Return ONLY valid JSON, no markdown fences:
{
  "openingText": "Your spoken opening statement here...",
  "keyArguments": ["Argument 1", "Argument 2", "Argument 3"],
  "keyQuote": "Your single most memorable line.",
  "confidence": 7
}`;

  try {
    const raw = await chatCompletionJSON<{
      openingText:  string;
      keyArguments: string[];
      keyQuote:     string;
      confidence:   number;
    }>(
      [
        { role: 'system', content: `You are ${persona.displayName} in a structured academic debate. Speak naturally, as if live. Return only valid JSON.` },
        { role: 'user',   content: prompt },
      ],
      { temperature: 0.72, maxTokens: 600 },
    );

    return {
      agentRole:    perspective.agentRole,
      openingText:  truncateToLimit(cleanForTTS(raw.openingText ?? ''), MAX_TURN_TEXT_CHARS),
      keyArguments: (raw.keyArguments ?? []).slice(0, 3).map(a => cleanForTTS(a)),
      keyQuote:     cleanForTTS(raw.keyQuote ?? perspective.keyQuote ?? ''),
      confidence:   Math.min(10, Math.max(1, Math.round(raw.confidence ?? perspective.confidence ?? 5))),
    };
  } catch {
    // Fallback to perspective data
    return {
      agentRole:    perspective.agentRole,
      openingText:  truncateToLimit(cleanForTTS(perspective.summary?.slice(0, 400) ?? 'I stand by my position on this debate topic.'), MAX_TURN_TEXT_CHARS),
      keyArguments: (perspective.arguments ?? []).slice(0, 2).map(a => a.point),
      keyQuote:     cleanForTTS(perspective.keyQuote ?? 'The evidence speaks for itself.'),
      confidence:   perspective.confidence ?? 6,
    };
  }
}

// ─── PHASE 2: Generate rebuttals after seeing all Phase 1 outputs ─────────────

async function generatePhase2(
  topic:          string,
  question:       string,
  perspective:    DebatePerspective,
  phase1Results:  AgentPhase1Raw[],
  allPerspectives: DebatePerspective[],
): Promise<AgentPhase2Raw> {
  const persona    = VOICE_PERSONAS[perspective.agentRole];
  const myPhase1   = phase1Results.find(r => r.agentRole === perspective.agentRole);
  const othersDigest = phase1Results
    .filter(r => r.agentRole !== perspective.agentRole)
    .map(r => {
      const p = allPerspectives.find(p => p.agentRole === r.agentRole);
      return [
        `${VOICE_PERSONAS[r.agentRole].displayName}: "${r.openingText.slice(0, 200)}"`,
        `  Key quote: "${r.keyQuote}"`,
        `  Confidence: ${r.confidence}/10`,
      ].join('\n');
    })
    .join('\n\n');

  const prompt = `You are generating PHASE 2 responses for a voice debate — cross-examination and rebuttal.

DEBATE TOPIC: "${topic}"
CENTRAL QUESTION: "${question}"

YOUR ROLE: ${persona.displayName}
YOUR PHASE 1 OPENING: "${myPhase1?.openingText?.slice(0, 250) ?? ''}"
YOUR CURRENT CONFIDENCE: ${myPhase1?.confidence ?? perspective.confidence}/10

OTHER AGENTS' PHASE 1 OPENINGS:
${othersDigest}

TASK: Generate your Phase 2 responses. All text must be NATURAL SPOKEN DIALOGUE (no bullets, no markdown).

1. CROSS-EXAMINATION: Pick 2 other agents whose arguments you most want to challenge.
   Write a SHORT challenge to each (50–80 words each, spoken directly to them).
   Reference their specific words or claims.

2. REBUTTAL: Write your defense against the strongest likely counter to your position (80–120 words).
   Be specific — address the evidence, not just the rhetoric.

3. CONCESSION (optional): If any opponent made a genuinely valid point, honestly acknowledge it (30–50 words).
   This makes you credible. Leave empty string if you have no concession.

4. CLOSING: Write your final 60–90 word closing argument. Make it memorable and conclusive.

5. UPDATED CONFIDENCE: Re-score yourself 1–10 after seeing the other perspectives.
   If opponents made strong points, your score may drop. Be honest.

Return ONLY valid JSON:
{
  "crossExamTargets": [
    { "targetRole": "skeptic", "challengeText": "You said... but the data actually shows..." },
    { "targetRole": "economist", "challengeText": "Your economic model ignores..." }
  ],
  "rebuttalText": "My critics argue... but what they miss is...",
  "concessionText": "I'll grant that... has a point about...",
  "closingText": "When we look at the totality of evidence...",
  "updatedConfidence": 7
}`;

  try {
    const raw = await chatCompletionJSON<{
      crossExamTargets:  { targetRole: string; challengeText: string }[];
      rebuttalText:      string;
      concessionText?:   string;
      closingText:       string;
      updatedConfidence: number;
    }>(
      [
        { role: 'system', content: `You are ${persona.displayName} in a live structured debate. All text is SPOKEN. Return only valid JSON.` },
        { role: 'user',   content: prompt },
      ],
      { temperature: 0.70, maxTokens: 900 },
    );

    const validRoles: DebateAgentRole[] = [
      'optimist', 'skeptic', 'economist', 'technologist', 'ethicist', 'futurist',
    ];

    return {
      agentRole:        perspective.agentRole,
      crossExamTargets: (raw.crossExamTargets ?? [])
        .filter(t => validRoles.includes(t.targetRole as DebateAgentRole) && t.targetRole !== perspective.agentRole)
        .slice(0, 2)
        .map(t => ({
          targetRole:    t.targetRole as DebateAgentRole,
          challengeText: truncateToLimit(cleanForTTS(t.challengeText ?? ''), 350),
        })),
      rebuttalText:       truncateToLimit(cleanForTTS(raw.rebuttalText ?? ''), MAX_TURN_TEXT_CHARS),
      concessionText:     raw.concessionText ? truncateToLimit(cleanForTTS(raw.concessionText), 250) : undefined,
      closingText:        truncateToLimit(cleanForTTS(raw.closingText ?? ''), MAX_TURN_TEXT_CHARS),
      updatedConfidence:  Math.min(10, Math.max(1, Math.round(raw.updatedConfidence ?? (myPhase1?.confidence ?? 5)))),
    };
  } catch {
    return {
      agentRole:       perspective.agentRole,
      crossExamTargets: [],
      rebuttalText:    truncateToLimit('I stand by my analysis. The evidence I presented remains valid despite the challenges raised.', MAX_TURN_TEXT_CHARS),
      concessionText:  undefined,
      closingText:     truncateToLimit(myPhase1?.keyQuote ?? 'The evidence is clear. My position stands.', MAX_TURN_TEXT_CHARS),
      updatedConfidence: myPhase1?.confidence ?? perspective.confidence ?? 5,
    };
  }
}

// ─── MODERATOR: Generate intro/transition/question lines ──────────────────────

interface ModeratorLines {
  intro:             string;
  beforeCrossExam:   string;
  beforeRebuttals:   string;
  audienceQuestions: string[];
  beforeClosing:     string;
  verdict:           string;
}

async function generateModeratorLines(
  topic:      string,
  question:   string,
  moderator:  DebateModerator | null,
  tensions:   string[],
): Promise<ModeratorLines> {
  const prompt = `You are the Moderator for a structured AI voice debate.

TOPIC: "${topic}"
CENTRAL QUESTION: "${question}"
KEY TENSIONS IDENTIFIED: ${tensions.slice(0, 3).map(t => `"${t}"`).join(', ')}
MODERATOR VERDICT: "${(moderator?.balancedVerdict ?? '').slice(0, 300)}"

Generate SHORT spoken moderator lines for each debate segment transition.
All text must sound natural when spoken aloud. No bullets, no markdown.

- intro: 40–60 words welcoming audience and introducing the debate (set the stage)
- beforeCrossExam: 20–30 words transitioning from openings to cross-examination
- beforeRebuttals: 20–30 words transitioning to rebuttals
- audienceQuestions: Exactly ${AUDIENCE_QUESTIONS_COUNT} short spoken questions (each 15–25 words) drawn from the key tensions. Each starts with "I'd like to ask..." or "For our agents..."
- beforeClosing: 20–30 words transitioning to closing arguments
- verdict: 80–120 words — the balanced moderator verdict synthesising all perspectives. This is the final word.

Return ONLY valid JSON:
{
  "intro": "...",
  "beforeCrossExam": "...",
  "beforeRebuttals": "...",
  "audienceQuestions": ["...", "...", "..."],
  "beforeClosing": "...",
  "verdict": "..."
}`;

  try {
    const raw = await chatCompletionJSON<ModeratorLines>(
      [
        { role: 'system', content: 'You are a professional debate moderator. All output is spoken text. Return only valid JSON.' },
        { role: 'user',   content: prompt },
      ],
      { temperature: 0.60, maxTokens: 800 },
    );

    return {
      intro:             truncateToLimit(cleanForTTS(raw.intro ?? `Welcome to this AI debate on "${topic}".`), MAX_TURN_TEXT_CHARS),
      beforeCrossExam:   truncateToLimit(cleanForTTS(raw.beforeCrossExam ?? 'Now let us move to cross-examination.'), 250),
      beforeRebuttals:   truncateToLimit(cleanForTTS(raw.beforeRebuttals ?? 'Time now for rebuttals.'), 250),
      audienceQuestions: (raw.audienceQuestions ?? [])
        .slice(0, AUDIENCE_QUESTIONS_COUNT)
        .map(q => truncateToLimit(cleanForTTS(q), 250)),
      beforeClosing: truncateToLimit(cleanForTTS(raw.beforeClosing ?? 'We now move to closing arguments.'), 250),
      verdict:       truncateToLimit(cleanForTTS(raw.verdict ?? (moderator?.balancedVerdict ?? 'Both sides have made compelling points.')), MAX_TURN_TEXT_CHARS),
    };
  } catch {
    return {
      intro:             `Welcome to this debate on "${topic}". Six AI agents will now present their perspectives on the central question: ${question}`,
      beforeCrossExam:   'We now move into cross-examination. Agents, please address each other directly.',
      beforeRebuttals:   'Time for rebuttals. Each agent will now respond to the challenges raised.',
      audienceQuestions: Array.from({ length: AUDIENCE_QUESTIONS_COUNT }, (_, i) =>
        tensions[i] ? `For our agents: ${tensions[i]}` : 'How do you respond to the strongest counterargument against your position?'
      ),
      beforeClosing: 'We now hear closing arguments. Make your final case.',
      verdict:       moderator?.balancedVerdict ?? 'After hearing all perspectives, the truth as always lies in the evidence.',
    };
  }
}

// ─── ASSEMBLY: Build ordered VoiceDebateTurn array ────────────────────────────

function assembleScript(
  agentRoles:      DebateAgentRole[],
  phase1Results:   AgentPhase1Raw[],
  phase2Results:   AgentPhase2Raw[],
  modLines:        ModeratorLines,
): { turns: VoiceDebateTurn[]; segments: DebateSegment[] } {
  const turns: VoiceDebateTurn[] = [];
  const segments: DebateSegment[] = [];
  let idx = 0;

  function addModeratorTurn(text: string, segType: DebateSegmentType): void {
    if (!text?.trim()) return;
    const persona = VOICE_PERSONAS['moderator'];
    turns.push({
      id:          nextId(),
      turnIndex:   idx++,
      segmentType: segType,
      speaker:     'moderator',
      speakerName: persona.displayName,
      voice:       persona.voice,
      text:        text.trim(),
      durationMs:  estimateDurationMs(text),
    });
  }

  function addAgentTurn(
    role:       DebateAgentRole,
    text:       string,
    segType:    DebateSegmentType,
    confidence?: number,
    argRef?:    VoiceDebateTurn['argRef'],
  ): void {
    if (!text?.trim()) return;
    const persona = VOICE_PERSONAS[role];
    turns.push({
      id:          nextId(),
      turnIndex:   idx++,
      segmentType: segType,
      speaker:     role,
      speakerName: persona.displayName,
      voice:       persona.voice,
      text:        text.trim(),
      durationMs:  estimateDurationMs(text),
      confidence,
      argRef,
    });
  }

  function markSegmentStart(type: DebateSegmentType, startIdx: number): void {
    segments.push({
      id:           `seg-${type}`,
      type,
      label:        SEGMENT_LABELS[type],
      startTurnIdx: startIdx,
      endTurnIdx:   startIdx, // will be updated at end
    });
  }

  function closeSegment(type: DebateSegmentType, endIdx: number): void {
    const seg = segments.find(s => s.type === type);
    if (seg) seg.endTurnIdx = endIdx;
  }

  // ── Segment 1: OPENING ────────────────────────────────────────────────────

  markSegmentStart('opening', idx);
  addModeratorTurn(modLines.intro, 'opening');

  for (const role of agentRoles) {
    const p1 = phase1Results.find(r => r.agentRole === role);
    if (!p1) continue;
    addAgentTurn(role, p1.openingText, 'opening', p1.confidence);
  }
  closeSegment('opening', idx - 1);

  // ── Segment 2: CROSS-EXAMINATION ──────────────────────────────────────────

  markSegmentStart('cross_exam', idx);
  addModeratorTurn(modLines.beforeCrossExam, 'cross_exam');

  for (const role of agentRoles) {
    const p2 = phase2Results.find(r => r.agentRole === role);
    if (!p2) continue;

    for (const target of (p2.crossExamTargets ?? [])) {
      // Find the opening turn index of the target agent for argRef
      const targetOpeningTurn = turns.find(
        t => t.speaker === target.targetRole && t.segmentType === 'opening',
      );
      addAgentTurn(
        role,
        target.challengeText,
        'cross_exam',
        undefined,
        targetOpeningTurn
          ? { targetAgentRole: target.targetRole, targetTurnIdx: targetOpeningTurn.turnIndex, refType: 'challenges' }
          : undefined,
      );
    }
  }
  closeSegment('cross_exam', idx - 1);

  // ── Segment 3: REBUTTALS ──────────────────────────────────────────────────

  markSegmentStart('rebuttal', idx);
  addModeratorTurn(modLines.beforeRebuttals, 'rebuttal');

  for (const role of agentRoles) {
    const p2 = phase2Results.find(r => r.agentRole === role);
    if (!p2) continue;

    if (p2.rebuttalText) {
      addAgentTurn(role, p2.rebuttalText, 'rebuttal', undefined);
    }
    if (p2.concessionText) {
      // Find the most recent cross-exam turn targeting this agent for argRef
      const challengeTurn = [...turns]
        .reverse()
        .find(t => t.argRef?.targetAgentRole === role && t.segmentType === 'cross_exam');
      addAgentTurn(
        role,
        p2.concessionText,
        'rebuttal',
        undefined,
        challengeTurn
          ? { targetAgentRole: challengeTurn.speaker as DebateAgentRole, targetTurnIdx: challengeTurn.turnIndex, refType: 'concedes' }
          : undefined,
      );
    }
  }
  closeSegment('rebuttal', idx - 1);

  // ── Segment 4: AUDIENCE Q&A ───────────────────────────────────────────────

  if (modLines.audienceQuestions.length > 0) {
    markSegmentStart('qa', idx);

    for (const question of modLines.audienceQuestions) {
      addModeratorTurn(question, 'qa');

      // Pick one agent to answer each Q&A (rotating through roles)
      const qIdx    = modLines.audienceQuestions.indexOf(question);
      const responder = agentRoles[qIdx % agentRoles.length];
      const p2      = phase2Results.find(r => r.agentRole === responder);
      const p1      = phase1Results.find(r => r.agentRole === responder);

      // Use the agent's key argument as a short Q&A answer
      const keyArg  = p1?.keyArguments?.[qIdx % (p1?.keyArguments?.length ?? 1)] ?? '';
      if (keyArg) {
        const qaText = `${keyArg}. ${(p2?.rebuttalText ?? '').split('.')[0] ?? ''}`.trim();
        if (qaText.length > 20) {
          addAgentTurn(responder, truncateToLimit(qaText, 300), 'qa');
        }
      }
    }
    closeSegment('qa', idx - 1);
  }

  // ── Segment 5: CLOSING ARGUMENTS ─────────────────────────────────────────

  markSegmentStart('closing', idx);
  addModeratorTurn(modLines.beforeClosing, 'closing');

  for (const role of agentRoles) {
    const p2 = phase2Results.find(r => r.agentRole === role);
    if (!p2?.closingText) continue;
    addAgentTurn(role, p2.closingText, 'closing', p2.updatedConfidence);
  }
  closeSegment('closing', idx - 1);

  // ── Segment 6: MODERATOR VERDICT ─────────────────────────────────────────

  markSegmentStart('verdict', idx);
  addModeratorTurn(modLines.verdict, 'verdict');
  closeSegment('verdict', idx - 1);

  return { turns, segments };
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export interface VoiceDebateScriptInput {
  topic:          string;
  question:       string;
  perspectives:   DebatePerspective[];
  moderator:      DebateModerator | null;
  agentRoles:     DebateAgentRole[];
  onPhaseProgress?: (label: string, agentName?: string) => void;
}

export async function generateVoiceDebateScript(
  input: VoiceDebateScriptInput,
): Promise<VoiceDebateScript> {
  const { topic, question, perspectives, moderator, agentRoles, onPhaseProgress } = input;

  // Reset turn ID counter for this generation
  _turnId = 0;

  // ── PHASE 1: All agents generate opening arguments ────────────────────────

  onPhaseProgress?.('Phase 1: Agents forming opening arguments...');

  const phase1Results: AgentPhase1Raw[] = [];

  // Run Phase 1 in parallel (all 6 agents simultaneously)
  const phase1Promises = agentRoles.map(async role => {
    const perspective = perspectives.find(p => p.agentRole === role);
    if (!perspective) return;

    onPhaseProgress?.('Phase 1: Agents forming opening arguments...', VOICE_PERSONAS[role].displayName);
    const result = await generatePhase1(topic, question, perspective);
    phase1Results.push(result);
  });

  await Promise.allSettled(phase1Promises);

  // Ensure we have at least some Phase 1 results
  if (phase1Results.length === 0) {
    throw new Error('All Phase 1 agents failed to generate opening arguments.');
  }

  // ── CROSS-ANALYSIS: Each agent reads all Phase 1 outputs ──────────────────

  onPhaseProgress?.('Cross-analysis: Each agent reviews opposing views...');

  // Small delay to ensure all Phase 1 results are stable before Phase 2
  await new Promise(r => setTimeout(r, 200));

  // ── PHASE 2: Rebuttals (sequential to avoid rate limits) ─────────────────

  onPhaseProgress?.('Phase 2: Generating rebuttals & cross-examination...');

  const phase2Results: AgentPhase2Raw[] = [];

  // Run Phase 2 sequentially (each agent needs to see all Phase 1 outputs)
  for (const role of agentRoles) {
    const perspective = perspectives.find(p => p.agentRole === role);
    if (!perspective) continue;

    onPhaseProgress?.('Phase 2: Generating rebuttals & cross-examination...', VOICE_PERSONAS[role].displayName);

    try {
      const result = await generatePhase2(topic, question, perspective, phase1Results, perspectives);
      phase2Results.push(result);
    } catch (err) {
      console.warn(`[VoiceDebateScriptAgent] Phase 2 failed for ${role}:`, err);
      // Fallback Phase 2 result
      const p1 = phase1Results.find(r => r.agentRole === role);
      phase2Results.push({
        agentRole:        role,
        crossExamTargets: [],
        rebuttalText:     'I maintain my original position. The evidence I presented is clear and compelling.',
        concessionText:   undefined,
        closingText:      p1?.keyQuote ?? 'The evidence speaks for itself. My position stands.',
        updatedConfidence: p1?.confidence ?? perspectives.find(p => p.agentRole === role)?.confidence ?? 5,
      });
    }
  }

  // ── MODERATOR LINES ───────────────────────────────────────────────────────

  onPhaseProgress?.('Assembling structured debate script...');

  const tensions = moderator?.keyTensions ?? [];
  const modLines = await generateModeratorLines(topic, question, moderator, tensions);

  // ── ASSEMBLY ──────────────────────────────────────────────────────────────

  const { turns, segments } = assembleScript(agentRoles, phase1Results, phase2Results, modLines);

  if (turns.length === 0) {
    throw new Error('Script assembly produced no turns. Check agent generation.');
  }

  const totalWords = turns.reduce((s, t) => s + wordCount(t.text), 0);
  const estimatedDurationMinutes = Math.round((totalWords / DEBATE_WPM) * 10) / 10;

  return {
    turns,
    segments,
    totalWords,
    estimatedDurationMinutes,
    generatedAt: new Date().toISOString(),
  };
}