// src/types/voiceDebateSharing.ts
// Part 44 — Types for sharing voice debates to workspaces.
//
// Pattern mirrors SharedPodcast / SharedDebate from Parts 15 & 16.

import type { VoiceDebateScript } from './voiceDebate';

// ─── SharedVoiceDebate ────────────────────────────────────────────────────────
// Denormalised row stored in shared_voice_debates table.
// Contains everything needed to play the voice debate on any workspace member's
// device without touching the original voice_debates table.

export interface SharedVoiceDebate {
  id:                 string;
  workspaceId:        string;
  voiceDebateId:      string;
  debateSessionId:    string;
  sharedBy:           string;

  // Debate content (denormalised at share time)
  topic:              string;
  question:           string;
  script:             VoiceDebateScript;
  totalTurns:         number;
  durationSeconds:    number;
  wordCount:          number;

  // Cloud audio URLs (required for cross-device streaming)
  audioStorageUrls:   string[];
  audioAllUploaded:   boolean;

  // Tracking
  viewCount:          number;
  downloadCount:      number;

  // Timestamps
  debateCreatedAt?:   string;
  debateCompletedAt?: string;
  sharedAt:           string;

  // Profile info of the sharer (joined at query time)
  sharerName?:        string;
  sharerAvatar?:      string;
}

// ─── SharedVoiceDebateState ───────────────────────────────────────────────────
// State for the useVoiceDebateSharing hook.

export interface SharedVoiceDebateState {
  voiceDebates: SharedVoiceDebate[];
  isLoading:    boolean;
  isSharing:    boolean;
  error:        string | null;
}

// ─── VoiceDebateSharingOption ─────────────────────────────────────────────────
// Shown in the ShareVoiceDebateToWorkspaceModal — one row per workspace.

export interface VoiceDebateSharingOption {
  workspaceId:   string;
  workspaceName: string;
  avatarUrl:     string | null;
  userRole:      'owner' | 'editor' | 'viewer';
  isShared:      boolean;
}

// ─── ShareVoiceDebateRequest ──────────────────────────────────────────────────
// What the UI sends to the sharing service.

export interface ShareVoiceDebateRequest {
  workspaceId:    string;
  voiceDebateId:  string;
}