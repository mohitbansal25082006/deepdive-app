// src/types/podcast_v2.ts
// Part 39 — Advanced Podcast System Type Definitions
//
// Extends the base Podcast types in index.ts with:
//   - 3-speaker support (host + 2 guests)
//   - Guest personas
//   - Script structure types (chapters, cold open, etc.)
//   - Series types
//   - Audio quality settings
//   - Player enhancements (mini player, chapters)
//
// Part 39: Re-exports PodcastVoicePresetV2Def from constants so consumers
// can import it from either location.

import type { PodcastVoice } from './index';

// ─── Speaker Personas ─────────────────────────────────────────────────────────

export type GuestPersona =
  | 'skeptic'
  | 'enthusiast'
  | 'practitioner'
  | 'academic'
  | 'industry_insider'
  | 'newcomer';

export type VoicePresetStyleV2 =
  | 'casual'
  | 'expert'
  | 'tech'
  | 'narrative'
  | 'debate'
  | 'news'
  | 'formal_broadcaster'
  | 'casual_youtuber'
  | 'npr_journalist'
  | 'joe_rogan'
  | 'bbc_documentary';

export interface SpeakerConfig {
  name:       string;
  voice:      PodcastVoice;
  role:       'host' | 'guest1' | 'guest2';
  persona?:   GuestPersona;
  /** Speaking style descriptor e.g. "analytical, data-driven" */
  style?:     string;
  /** Optional catchphrases injected into script */
  catchphrases?: string[];
  /** Speed multiplier 0.85–1.15 applied to TTS */
  speedMultiplier?: number;
}

// ─── Script Structure Types ────────────────────────────────────────────────────

export type ScriptSegmentType =
  | 'cold_open'
  | 'intro'
  | 'chapter'
  | 'listener_qa'
  | 'hot_take'
  | 'rapid_fire'
  | 'outro'
  | 'normal';

export interface ChapterMarker {
  id:           string;
  title:        string;
  startTurnIdx: number;
  endTurnIdx:   number;
  timeMs?:      number;
}

export interface PodcastTurnV2 {
  id:            string;
  segmentIndex:  number;
  speaker:       'host' | 'guest1' | 'guest2';
  speakerName:   string;
  text:          string;
  audioPath?:    string;
  durationMs?:   number;
  segmentType:   ScriptSegmentType;
  chapterId?:    string;
  /** Prosody hints stripped before TTS: [laughs], [stressed], [pause] */
  hasProsodyHints?: boolean;
}

export interface PodcastScriptV2 {
  turns:                    PodcastTurnV2[];
  chapters:                 ChapterMarker[];
  totalWords:               number;
  estimatedDurationMinutes: number;
  speakerCount:             2 | 3;
  webSearchUsed?:           boolean;
}

// ─── Audio Quality ─────────────────────────────────────────────────────────────

export type AudioQuality = 'standard' | 'high' | 'lossless';

export const AUDIO_QUALITY_CONFIG: Record<AudioQuality, {
  label:    string;
  bitrate:  string;
  model:    'tts-1' | 'tts-1-hd';
  format:   'mp3' | 'wav';
}> = {
  standard: { label: 'Standard (128kbps)', bitrate: '128kbps', model: 'tts-1',    format: 'mp3' },
  high:     { label: 'High (256kbps)',      bitrate: '256kbps', model: 'tts-1-hd', format: 'mp3' },
  lossless: { label: 'Lossless (WAV)',      bitrate: 'lossless', model: 'tts-1-hd', format: 'wav' },
};

// ─── Extended Podcast Config ───────────────────────────────────────────────────

export interface PodcastConfigV2 {
  // Base config (backward compat)
  hostVoice:             PodcastVoice;
  guestVoice:            PodcastVoice;
  hostName:              string;
  guestName:             string;
  targetDurationMinutes: number;
  // V2 additions
  speakers:              SpeakerConfig[];
  speakerCount:          2 | 3;
  audioQuality:          AudioQuality;
  presetStyleV2:         VoicePresetStyleV2;
  /** Ambient sound: 'none' | 'studio' | 'coffee_shop' */
  ambientMood:           'none' | 'studio' | 'coffee_shop';
  /** Whether to use advanced script structure (chapters, cold open, etc.) */
  useAdvancedScript:     boolean;
}

// ─── Podcast Series ────────────────────────────────────────────────────────────

export interface PodcastSeries {
  id:          string;
  userId:      string;
  name:        string;
  description: string;
  accentColor: string;
  iconName:    string;
  episodeCount: number;
  totalDurationSeconds: number;
  createdAt:   string;
  updatedAt:   string;
}

export interface PodcastSeriesEpisode {
  podcastId:    string;
  seriesId:     string;
  episodeNumber: number;
  addedAt:      string;
}

// ─── Series Creation Input ─────────────────────────────────────────────────────

export interface CreateSeriesInput {
  name:        string;
  description: string;
  accentColor: string;
  iconName:    string;
}

// ─── Next Episode Recommendation ──────────────────────────────────────────────

export interface NextEpisodeRecommendation {
  suggestedTopic:   string;
  rationale:        string;
  connectedThemes:  string[];
  suggestedGuests?: string[];
}

// ─── Mini Player State ────────────────────────────────────────────────────────

export interface MiniPlayerState {
  isVisible:       boolean;
  podcastId:       string | null;
  podcastTitle:    string;
  hostName:        string;
  guestName:       string;
  isPlaying:       boolean;
  progressPercent: number;
  currentTurnIdx:  number;
}

// ─── Playback Progress (for Continue Listening) ───────────────────────────────

export interface PodcastPlaybackProgress {
  podcastId:       string;
  lastTurnIdx:     number;
  lastPositionMs:  number;
  totalDurationMs: number;
  progressPercent: number;
  updatedAt:       string;
}

// ─── Podcast Stats ────────────────────────────────────────────────────────────

export interface PodcastUserStats {
  totalEpisodes:       number;
  totalListeningMinutes: number;
  favouriteStyle:      string;
  longestEpisodeTitle: string;
  longestEpisodeMins:  number;
  currentStreak:       number;
  completedEpisodes:   number;
}

// ─── Re-export PodcastVoicePresetV2Def from constants ────────────────────────
// Allows consumers to import from either:
//   import type { PodcastVoicePresetV2Def } from '../types/podcast_v2'
//   import type { PodcastVoicePresetV2Def } from '../constants/podcastV2'
export type { PodcastVoicePresetV2Def } from '../constants/podcastV2';