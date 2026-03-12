// src/hooks/usePodcast.ts
// Part 8 — Manages all state for AI Podcast generation.
//
// Exposes:
//   generateFromReport(report, config?) — generate podcast from an existing research report
//   generateFromTopic(topic, config?)   — generate podcast from a plain text topic
//   reset()                             — clear state / cancel pending updates
//
// State shape: PodcastGenerationState (see types/index.ts)

import { useState, useCallback, useRef }  from 'react';
import {
  ResearchReport,
  Podcast,
  PodcastConfig,
  PodcastScript,
  PodcastGenerationState,
  PodcastVoice,
}                                          from '../types';
import { runPodcastPipeline }             from '../services/podcastOrchestrator';
import { useAuth }                        from '../context/AuthContext';

// ─── Defaults ─────────────────────────────────────────────────────────────────

export const DEFAULT_PODCAST_CONFIG: PodcastConfig = {
  hostVoice:             'alloy',
  guestVoice:            'nova',
  hostName:              'Alex',
  guestName:             'Sam',
  targetDurationMinutes: 10,
};

const INITIAL_STATE: PodcastGenerationState = {
  podcast:            null,
  isGeneratingScript: false,
  isGeneratingAudio:  false,
  scriptGenerated:    false,
  audioProgress:      { completed: 0, total: 0 },
  progressMessage:    '',
  error:              null,
};

// ─── Voice preset definitions ─────────────────────────────────────────────────
// Exported so the UI can render the preset selector without importing a
// separate constants file.

export interface PodcastVoicePresetDef {
  id:          string;
  name:        string;
  description: string;
  hostVoice:   PodcastVoice;
  guestVoice:  PodcastVoice;
  hostName:    string;
  guestName:   string;
  icon:        string;
  accentColor: string;
}

export const PODCAST_VOICE_PRESETS: PodcastVoicePresetDef[] = [
  {
    id:          'casual',
    name:        'Casual Conversation',
    description: 'Friendly, relaxed two-person discussion',
    hostVoice:   'alloy',
    guestVoice:  'nova',
    hostName:    'Alex',
    guestName:   'Sam',
    icon:        'chatbubbles-outline',
    accentColor: '#6C63FF',
  },
  {
    id:          'expert',
    name:        'Expert Interview',
    description: 'Professional deep-dive with an authority',
    hostVoice:   'onyx',
    guestVoice:  'shimmer',
    hostName:    'Marcus',
    guestName:   'Dr. Chen',
    icon:        'mic-outline',
    accentColor: '#FF6584',
  },
  {
    id:          'tech',
    name:        'Tech Podcast',
    description: 'Technology-focused analysis & commentary',
    hostVoice:   'echo',
    guestVoice:  'fable',
    hostName:    'Jordan',
    guestName:   'Dr. Riley',
    icon:        'hardware-chip-outline',
    accentColor: '#43E97B',
  },
];

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function usePodcast() {
  const { user } = useAuth();
  const [state, setState]   = useState<PodcastGenerationState>(INITIAL_STATE);
  const abortRef            = useRef(false);

  // Safe partial-state updater — never fires after reset()
  const patch = useCallback((partial: Partial<PodcastGenerationState>) => {
    if (!abortRef.current) {
      setState(prev => ({ ...prev, ...partial }));
    }
  }, []);

  // ── Core pipeline runner ──────────────────────────────────────────────────

  const generate = useCallback(
    async (
      topic:   string,
      config:  Partial<PodcastConfig>,
      report?: ResearchReport | null
    ) => {
      if (!user) {
        setState(prev => ({
          ...prev,
          error: 'You must be signed in to generate a podcast.',
        }));
        return;
      }

      abortRef.current = false;

      const mergedConfig: PodcastConfig = {
        ...DEFAULT_PODCAST_CONFIG,
        ...config,
      };

      // Reset to clean generating state
      setState({
        ...INITIAL_STATE,
        isGeneratingScript: true,
        progressMessage:    'Writing podcast script...',
      });

      await runPodcastPipeline(
        user.id,
        { topic, report: report ?? null },
        mergedConfig,
        {
          // ── Script generated ────────────────────────────────────────────
          onScriptGenerated: (script: PodcastScript) => {
            patch({
              isGeneratingScript: false,
              isGeneratingAudio:  true,
              scriptGenerated:    true,
              audioProgress:      { completed: 0, total: script.turns.length },
              progressMessage:
                `Script ready · ${script.turns.length} segments · ` +
                `~${script.estimatedDurationMinutes} min`,
            });
          },

          // ── Segment audio generated ────────────────────────────────────
          onSegmentGenerated: (
            segmentIndex:  number,
            totalSegments: number,
            _audioPath:    string
          ) => {
            patch({
              audioProgress: {
                completed: segmentIndex + 1,
                total:     totalSegments,
              },
            });
          },

          // ── Arbitrary progress message ─────────────────────────────────
          onProgress: (message: string) => {
            patch({ progressMessage: message });
          },

          // ── Pipeline complete ──────────────────────────────────────────
          onComplete: (podcast: Podcast) => {
            patch({
              podcast,
              isGeneratingScript: false,
              isGeneratingAudio:  false,
              progressMessage:    '🎙 Podcast ready!',
            });
          },

          // ── Pipeline error ─────────────────────────────────────────────
          onError: (message: string) => {
            patch({
              isGeneratingScript: false,
              isGeneratingAudio:  false,
              error:              message,
              progressMessage:    '',
            });
          },
        }
      );
    },
    [user, patch]
  );

  // ── Public API ────────────────────────────────────────────────────────────

  /** Generate a podcast grounded in an existing research report */
  const generateFromReport = useCallback(
    (report: ResearchReport, config: Partial<PodcastConfig> = {}) =>
      generate(report.query, config, report),
    [generate]
  );

  /** Generate a podcast from a plain topic string (no report context) */
  const generateFromTopic = useCallback(
    (topic: string, config: Partial<PodcastConfig> = {}) =>
      generate(topic, config, null),
    [generate]
  );

  /** Reset all state — also prevents stale state updates after unmount */
  const reset = useCallback(() => {
    abortRef.current = true;
    setState(INITIAL_STATE);
  }, []);

  // ── Derived values ────────────────────────────────────────────────────────

  const isGenerating =
    state.isGeneratingScript || state.isGeneratingAudio;

  const audioProgressPercent =
    state.audioProgress.total > 0
      ? Math.round(
          (state.audioProgress.completed / state.audioProgress.total) * 100
        )
      : 0;

  const progressPhase: 'idle' | 'script' | 'audio' | 'done' | 'error' =
    state.error              ? 'error'  :
    state.isGeneratingScript ? 'script' :
    state.isGeneratingAudio  ? 'audio'  :
    state.podcast            ? 'done'   :
    'idle';

  return {
    state,
    isGenerating,
    audioProgressPercent,
    progressPhase,
    generateFromReport,
    generateFromTopic,
    reset,
  };
}