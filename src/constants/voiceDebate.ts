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

import type { VoicePersona, DebateSegmentType } from '../types/voiceDebate';
import type { DebateAgentRole } from '../types';

// ─── Voice Personas ───────────────────────────────────────────────────────────

export const VOICE_PERSONAS: Record<DebateAgentRole | 'moderator', VoicePersona> = {
  moderator: {
    agentRole:   'moderator',
    voice:       'alloy',
    speedFactor: 1.0,
    displayName: 'Moderator',
    color:       '#6C63FF',
    icon:        'ribbon-outline',
    instructions:
      'Speak with calm authority and neutrality. You are a professional debate moderator — measured pace, clear enunciation, impartial tone. Introduce each segment with gravitas. When presenting the verdict, slow down slightly for emphasis.',
  },

  optimist: {
    agentRole:   'optimist',
    voice:       'nova',
    speedFactor: 1.05,
    displayName: 'The Optimist',
    color:       '#43E97B',
    icon:        'sunny-outline',
    instructions:
      'Speak with genuine enthusiasm and warmth. You believe in the transformative power of technology — let that optimism come through in a slightly faster, energetic delivery. Use natural emphasis on positive data points. Sound genuinely excited, not forced.',
  },

  skeptic: {
    agentRole:   'skeptic',
    voice:       'echo',
    speedFactor: 0.90,
    displayName: 'The Skeptic',
    color:       '#FF6584',
    icon:        'alert-circle-outline',
    instructions:
      'Speak deliberately and skeptically. You demand evidence and rigor — use a slightly slower pace with purposeful pauses before making key points. Sound analytical and critical, not angry. Emphasize words like "actually", "however", "the data shows" with weight.',
  },

  economist: {
    agentRole:   'economist',
    voice:       'onyx',
    speedFactor: 0.95,
    displayName: 'The Economist',
    color:       '#FFD700',
    icon:        'trending-up-outline',
    instructions:
      'Speak with the confidence of someone who follows the data wherever it leads. Measured, authoritative, slightly formal. Emphasize statistics and figures clearly. Sound neither optimistic nor pessimistic — purely analytical. Use a steady, professional cadence.',
  },

  technologist: {
    agentRole:   'technologist',
    voice:       'ash',
    speedFactor: 1.0,
    displayName: 'The Technologist',
    color:       '#29B6F6',
    icon:        'hardware-chip-outline',
    instructions:
      'Speak precisely and directly, like a senior engineer explaining something important. Clear, confident, technical but accessible. Slight acceleration when excited about a breakthrough, slower and more deliberate when explaining limitations. Matter-of-fact tone.',
  },

  ethicist: {
    agentRole:   'ethicist',
    voice:       'shimmer',
    speedFactor: 0.92,
    displayName: 'The Ethicist',
    color:       '#C084FC',
    icon:        'shield-checkmark-outline',
    instructions:
      'Speak thoughtfully and with moral weight. You represent the human and societal dimension. Slower, reflective pace — pause before raising difficult questions. Warm but serious tone. When talking about vulnerable communities or rights, let genuine concern come through naturally.',
  },

  futurist: {
    agentRole:   'futurist',
    voice:       'fable',
    speedFactor: 1.08,
    displayName: 'The Futurist',
    color:       '#FF8E53',
    icon:        'telescope-outline',
    instructions:
      'Speak with forward-leaning energy, like someone who genuinely sees where things are headed. Slightly faster pace, excited about long-term possibilities. Use vivid, evocative language. When making predictions, lean in with conviction. Paint pictures with words.',
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

// Use gpt-4o-mini-tts for persona-aware voice generation
// tts-1 does NOT support `instructions` field — only gpt-4o-mini-tts does
export const VOICE_DEBATE_TTS_MODEL = 'gpt-4o-mini-tts';

// Segment text length limits to stay within 2000-token context window
export const MAX_TURN_TEXT_CHARS = 600;

// Concurrency for TTS generation (conservative to avoid rate limits)
export const TTS_CONCURRENCY = 2;

// ─── Debate Structure Config ──────────────────────────────────────────────────

// Number of cross-examination targets per agent (Phase 2)
export const CROSS_EXAM_TARGETS_PER_AGENT = 2;

// Number of AI-generated audience questions
export const AUDIENCE_QUESTIONS_COUNT = 3;

// Word-per-minute estimate for duration calculation
export const DEBATE_WPM = 140;