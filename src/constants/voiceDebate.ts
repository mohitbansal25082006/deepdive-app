// src/constants/voiceDebate.ts
// Part 40 — Voice Debate Engine Constants
//
// Defines the 7 voice personas (Moderator + 6 agents),
// debate segment labels, and generation phase labels.
//
// KEY DESIGN:
//   • Uses gpt-4o-mini-tts with `instructions` field for per-voice personality
//   • Each agent gets a distinct voice + speed + speaking style
//   • Moderator: calm/authoritative (alloy, 1.0x)
//   • Skeptic: deliberate/slower (echo, 0.90x)
//   • Futurist: energetic/faster (fable, 1.08x)
//   • Economist: confident/precise (onyx, 0.95x)
//   • Optimist: warm/enthusiastic (nova, 1.05x)
//   • Ethicist: measured/thoughtful (shimmer, 0.92x)
//   • Technologist: precise/direct (ash, 1.0x)
//
// ── Part 57 — Cost reduction (no quality loss) ────────────────────────────────
// A 15-min debate cost ~$0.20 because gpt-4o-mini-tts bills audio output at
// $12/1M audio tokens AND the `instructions` field is re-sent on EVERY turn as
// input tokens. We trim cost two ways, both inaudible to the listener:
//   1. Persona `instructions` shortened ~60% (each ~60→~22 words). The voice,
//      speedFactor and core delivery style still carry the personality; the long
//      descriptive prose added input-token cost on every single turn without
//      changing the audio. (Saves input tokens across ~40 turns/debate.)
//   2. MAX_TURN_TEXT_CHARS 600→520 — caps only the longest turns, shaving audio
//      output tokens (the dominant cost) with no effect on pacing or coverage.
// We deliberately KEEP gpt-4o-mini-tts (not tts-1): tts-1 ignores `instructions`,
// which would flatten every agent to the same generic delivery — a real quality
// regression. The trims above cut ~15-20% off cost while keeping distinct voices.

import type { VoicePersona, DebateSegmentType } from '../types/voiceDebate';
import type { DebateAgentRole } from '../types';

// ─── Voice Personas ───────────────────────────────────────────────────────────
// Part 57: instructions trimmed to the essential delivery cues. Voice + speed
// still differentiate each agent; the prose was redundant token spend per turn.

export const VOICE_PERSONAS: Record<DebateAgentRole | 'moderator', VoicePersona> = {
  moderator: {
    agentRole:   'moderator',
    voice:       'alloy',
    speedFactor: 1.0,
    displayName: 'Moderator',
    color:       '#6C63FF',
    icon:        'ribbon-outline',
    instructions:
      'Calm, neutral, authoritative debate moderator. Measured pace, clear enunciation. Slow slightly for the verdict.',
  },

  optimist: {
    agentRole:   'optimist',
    voice:       'nova',
    speedFactor: 1.05,
    displayName: 'The Optimist',
    color:       '#43E97B',
    icon:        'sunny-outline',
    instructions:
      'Warm, genuinely enthusiastic, slightly faster and energetic. Natural emphasis on positive points; never forced.',
  },

  skeptic: {
    agentRole:   'skeptic',
    voice:       'echo',
    speedFactor: 0.90,
    displayName: 'The Skeptic',
    color:       '#FF6584',
    icon:        'alert-circle-outline',
    instructions:
      'Deliberate, analytical, critical (not angry). Slower pace with purposeful pauses; weight on "actually", "however".',
  },

  economist: {
    agentRole:   'economist',
    voice:       'onyx',
    speedFactor: 0.95,
    displayName: 'The Economist',
    color:       '#FFD700',
    icon:        'trending-up-outline',
    instructions:
      'Confident, measured, slightly formal. Emphasize figures clearly. Purely analytical, steady professional cadence.',
  },

  technologist: {
    agentRole:   'technologist',
    voice:       'ash',
    speedFactor: 1.0,
    displayName: 'The Technologist',
    color:       '#29B6F6',
    icon:        'hardware-chip-outline',
    instructions:
      'Precise, direct senior engineer. Clear and confident; quicker on breakthroughs, slower on limitations. Matter-of-fact.',
  },

  ethicist: {
    agentRole:   'ethicist',
    voice:       'shimmer',
    speedFactor: 0.92,
    displayName: 'The Ethicist',
    color:       '#C084FC',
    icon:        'shield-checkmark-outline',
    instructions:
      'Thoughtful, reflective, morally serious. Slower pace, pause before hard questions. Warm but earnest concern.',
  },

  futurist: {
    agentRole:   'futurist',
    voice:       'fable',
    speedFactor: 1.08,
    displayName: 'The Futurist',
    color:       '#FF8E53',
    icon:        'telescope-outline',
    instructions:
      'Forward-leaning, energetic, slightly faster. Vivid, evocative language; lean in with conviction on predictions.',
  },
};

// ─── Debate Segment Labels ─────────────────────────────────────────────────────

export const SEGMENT_LABELS: Record<DebateSegmentType, string> = {
  opening:   'Opening Statements',
  cross_exam: 'Cross-Examination',
  rebuttal:  'Rebuttal Round',
  qa:        'Audience Q&A',
  closing:   'Closing Arguments',
  verdict:   "Moderator's Verdict",
};

export const SEGMENT_ICONS: Record<DebateSegmentType, string> = {
  opening:   'mic-outline',
  cross_exam: 'git-compare-outline',
  rebuttal:  'return-up-back-outline',
  qa:        'help-circle-outline',
  closing:   'flag-outline',
  verdict:   'ribbon-outline',
};

export const SEGMENT_COLORS: Record<DebateSegmentType, string> = {
  opening:   '#6C63FF',
  cross_exam: '#FF6584',
  rebuttal:  '#FFD700',
  qa:        '#29B6F6',
  closing:   '#43E97B',
  verdict:   '#C084FC',
};

// ─── Generation Phase Labels ──────────────────────────────────────────────────

export const PHASE_LABELS: Record<string, string> = {
  idle:          'Ready to generate',
  briefing:      'Briefing agents with debate context...',
  phase1:        'Phase 1: Agents forming opening arguments...',
  cross_analysis: 'Cross-analysis: Each agent reviews opposing views...',
  rebuttals:     'Phase 2: Generating rebuttals & cross-examination...',
  assembly:      'Assembling structured debate script...',
  audio:         'Generating voice audio for each speaker...',
  done:          'Voice debate ready!',
  error:         'Generation failed',
};

export const PHASE_PERCENTS: Record<string, number> = {
  idle:          0,
  briefing:      5,
  phase1:        25,
  cross_analysis: 45,
  rebuttals:     60,
  assembly:      72,
  audio:         80,   // audio goes 80→100 based on segment progress
  done:          100,
  error:         0,
};

// ─── Credit Cost ──────────────────────────────────────────────────────────────

export const VOICE_DEBATE_CREDIT_COST = 50;

// ─── TTS Config ───────────────────────────────────────────────────────────────

// Use gpt-4o-mini-tts for persona-aware voice generation.
// tts-1 does NOT support the `instructions` field — only gpt-4o-mini-tts does,
// so it stays (see Part 57 note above for why we don't downgrade to tts-1).
export const VOICE_DEBATE_TTS_MODEL = 'gpt-4o-mini-tts';

// Part 57: 600→520. Caps only the longest turns, trimming audio-output tokens
// (the dominant cost) without affecting pacing or argument coverage.
export const MAX_TURN_TEXT_CHARS = 520;

// Concurrency for TTS generation (conservative to avoid rate limits)
export const TTS_CONCURRENCY = 2;

// ─── Debate Structure Config ──────────────────────────────────────────────────

// Number of cross-examination targets per agent (Phase 2)
export const CROSS_EXAM_TARGETS_PER_AGENT = 2;

// Number of AI-generated audience questions
export const AUDIENCE_QUESTIONS_COUNT = 3;

// Word-per-minute estimate for duration calculation
export const DEBATE_WPM = 140;