// src/types/voiceDebate.ts
// Part 40 — Voice Debate Engine Types
//
// All types for the voice debate pipeline:
//   - Script generation (two-phase dialectic)
//   - TTS voice persona assignments
//   - Debate turn structure with argument threading
//   - Player state
//   - Generation progress tracking

import type { DebateAgentRole, DebatePerspective, DebateModerator } from './index';

// ─── Voice Persona ────────────────────────────────────────────────────────────
// Each agent + moderator gets a unique TTS voice with style instructions.
// Uses gpt-4o-mini-tts `instructions` field for per-agent personality.

export type DebateTTSVoice =
  | 'alloy'   // Moderator — calm, authoritative
  | 'echo'    // Skeptic — deliberate, measured
  | 'fable'   // Futurist — forward-leaning, energetic
  | 'onyx'    // Economist — confident, data-driven
  | 'nova'    // Optimist — warm, enthusiastic
  | 'shimmer' // Ethicist — thoughtful, measured
  | 'ash'     // Technologist — precise, technical
  | 'coral';  // (unused — reserved)

export interface VoicePersona {
  agentRole:    DebateAgentRole | 'moderator';
  voice:        DebateTTSVoice;
  speedFactor:  number;   // 0.85–1.15 (relative to 1.0)
  instructions: string;   // Passed to gpt-4o-mini-tts instructions field
  displayName:  string;
  color:        string;
  icon:         string;
}

// ─── Debate Segment (phase of the debate) ─────────────────────────────────────

export type DebateSegmentType =
  | 'opening'        // Each agent's opening statement
  | 'cross_exam'     // Agents challenge each other
  | 'rebuttal'       // Responses to cross-examination
  | 'qa'             // AI-generated audience Q&A
  | 'closing'        // Final arguments
  | 'verdict';       // Moderator's synthesis

export interface DebateSegment {
  id:          string;
  type:        DebateSegmentType;
  label:       string;
  startTurnIdx: number;
  endTurnIdx:   number;
  timeMs?:     number;  // Cumulative ms at segment start (populated after audio)
}

// ─── Argument Reference (for threading) ──────────────────────────────────────
// When an agent directly responds to another's argument, we store a reference.

export interface ArgumentRef {
  targetAgentRole: DebateAgentRole | 'moderator';
  targetTurnIdx:   number;
  refType:         'challenges' | 'agrees_with' | 'extends' | 'concedes';
}

// ─── Voice Debate Turn ────────────────────────────────────────────────────────

export interface VoiceDebateTurn {
  id:           string;
  turnIndex:    number;
  segmentType:  DebateSegmentType;
  speaker:      DebateAgentRole | 'moderator';
  speakerName:  string;
  voice:        DebateTTSVoice;
  text:         string;          // The spoken text (clean, no brackets)
  emotionCue?:  string;          // e.g. 'skeptical', 'enthusiastic'
  argRef?:      ArgumentRef;     // If this turn references another turn
  audioPath?:   string;          // Local file path after TTS generation
  durationMs?:  number;          // Estimated audio duration
  confidence?:  number;          // 1–10 from the agent's debate perspective
}

// ─── Voice Debate Script ──────────────────────────────────────────────────────

export interface VoiceDebateScript {
  turns:                    VoiceDebateTurn[];
  segments:                 DebateSegment[];
  totalWords:               number;
  estimatedDurationMinutes: number;
  generatedAt:              string;
}

// ─── Voice Debate (full DB record) ───────────────────────────────────────────

export type VoiceDebateStatus =
  | 'pending'
  | 'generating_script'
  | 'generating_audio'
  | 'completed'
  | 'failed';

export interface VoiceDebate {
  id:                 string;
  userId:             string;
  debateSessionId:    string;
  script:             VoiceDebateScript;
  topic:              string;
  question:           string;
  status:             VoiceDebateStatus;
  errorMessage?:      string;
  audioSegmentPaths:  string[];
  audioStorageUrls?:  (string | null)[];
  audioAllUploaded?:  boolean;
  totalTurns:         number;
  completedSegments:  number;
  durationSeconds:    number;
  wordCount:          number;
  exportCount:        number;
  playCount:          number;
  createdAt:          string;
  completedAt?:       string;
}

// ─── Voice Debate Player State ────────────────────────────────────────────────

export interface VoiceDebatePlayerState {
  isPlaying:            boolean;
  currentTurnIndex:     number;
  positionMs:           number;
  segmentDurationMs:    number;
  totalPositionMs:      number;
  totalDurationMs:      number;
  isLoading:            boolean;
  isBuffering:          boolean;
  playbackRate:         number;
  currentSegmentType:   DebateSegmentType;
}

// ─── Generation State ─────────────────────────────────────────────────────────

export type VoiceDebateGenerationPhase =
  | 'idle'
  | 'briefing'        // Loading agent perspectives
  | 'phase1'          // Generating opening arguments
  | 'cross_analysis'  // Cross-examining Phase 1 outputs
  | 'rebuttals'       // Generating rebuttal turns
  | 'assembly'        // Assembling full script
  | 'audio'           // Generating TTS audio per turn
  | 'done'
  | 'error';

export interface VoiceDebateGenerationState {
  phase:           VoiceDebateGenerationPhase;
  phaseLabel:      string;
  progressPercent: number;
  activeAgentName: string;
  audioProgress:   { completed: number; total: number };
  voiceDebate:     VoiceDebate | null;
  error:           string | null;
}

// ─── Orchestrator Callbacks ───────────────────────────────────────────────────

export interface VoiceDebateOrchestratorCallbacks {
  onPhaseUpdate:     (phase: VoiceDebateGenerationPhase, label: string, percent: number, agentName?: string) => void;
  onAudioProgress:   (completed: number, total: number) => void;
  onComplete:        (voiceDebate: VoiceDebate) => void;
  onError:           (message: string) => void;
}

// ─── Agent Phase 1 Output (raw from GPT) ─────────────────────────────────────

export interface AgentPhase1Raw {
  agentRole:      DebateAgentRole;
  openingText:    string;    // Opening statement (spoken)
  keyArguments:   string[];  // 2–3 punchy argument lines
  keyQuote:       string;    // Most memorable line
  confidence:     number;
}

// ─── Agent Phase 2 Output (rebuttal after seeing all Phase 1) ────────────────

export interface AgentPhase2Raw {
  agentRole:          DebateAgentRole;
  crossExamTargets:   { targetRole: DebateAgentRole; challengeText: string }[];
  rebuttalText:       string;   // Response to strongest challenge
  concessionText?:    string;   // Optional honest concession
  closingText:        string;   // Final argument
  updatedConfidence:  number;   // May differ from Phase 1 after seeing others
}