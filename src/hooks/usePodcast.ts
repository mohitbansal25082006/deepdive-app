// src/hooks/usePodcast.ts
// Part 19 — Original (6 voice presets, report import, voice input)
// Part 22 — Added: autoCachePodcast() called on onComplete
//
// CHANGE LOG (Part 22 only):
//   Line added: import { autoCachePodcast } from '../lib/autoCacheMiddleware';
//   Line added inside onComplete callback: autoCachePodcast(podcast);
//   Everything else is identical to Part 19.

import { useState, useCallback, useRef }  from 'react';
import {
  ResearchReport,
  Podcast,
  PodcastConfig,
  PodcastScript,
  PodcastGenerationState,
  PodcastVoice,
}                                          from '../types';
import { runPodcastPipeline, type PodcastInput } from '../services/podcastOrchestrator';
import type { VoicePresetStyle }           from '../services/agents/podcastScriptAgent';
import { useAuth }                         from '../context/AuthContext';
// ── Part 22: Auto-cache import ───────────────────────────────────────────────
import { autoCachePodcast }                from '../lib/autoCacheMiddleware';

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

// ─── Voice Preset Definition ──────────────────────────────────────────────────

export interface PodcastVoicePresetDef {
  id:           string;
  name:         string;
  description:  string;
  hostVoice:    PodcastVoice;
  guestVoice:   PodcastVoice;
  hostName:     string;
  guestName:    string;
  icon:         string;
  accentColor:  string;
  presetStyle:  VoicePresetStyle;
  /** Example topics this style works best for */
  bestFor:      string;
}

// ─── 6 Voice Presets ──────────────────────────────────────────────────────────

export const PODCAST_VOICE_PRESETS: PodcastVoicePresetDef[] = [
  {
    id:          'casual',
    name:        'Casual Chat',
    description: 'Two friends having a relaxed, engaging conversation',
    hostVoice:   'alloy',
    guestVoice:  'nova',
    hostName:    'Alex',
    guestName:   'Sam',
    icon:        'chatbubbles-outline',
    accentColor: '#6C63FF',
    presetStyle: 'casual',
    bestFor:     'General topics, science, culture',
  },
  {
    id:          'expert',
    name:        'Expert Interview',
    description: 'Professional deep-dive with an authority figure',
    hostVoice:   'onyx',
    guestVoice:  'shimmer',
    hostName:    'Marcus',
    guestName:   'Dr. Chen',
    icon:        'mic-outline',
    accentColor: '#FF6584',
    presetStyle: 'expert',
    bestFor:     'Research, academia, professional topics',
  },
  {
    id:          'tech',
    name:        'Tech Podcast',
    description: 'Technical analysis and commentary on technology',
    hostVoice:   'echo',
    guestVoice:  'fable',
    hostName:    'Jordan',
    guestName:   'Dr. Riley',
    icon:        'hardware-chip-outline',
    accentColor: '#43E97B',
    presetStyle: 'tech',
    bestFor:     'AI, software, engineering, startups',
  },
  {
    id:          'narrative',
    name:        'Story Mode',
    description: 'Documentary-style storytelling with an insider perspective',
    hostVoice:   'nova',
    guestVoice:  'alloy',
    hostName:    'Maya',
    guestName:   'James',
    icon:        'book-outline',
    accentColor: '#FFA726',
    presetStyle: 'narrative',
    bestFor:     'History, case studies, investigative topics',
  },
  {
    id:          'debate',
    name:        'Debate Format',
    description: 'Structured exploration of multiple sides of a complex issue',
    hostVoice:   'shimmer',
    guestVoice:  'onyx',
    hostName:    'Taylor',
    guestName:   'Morgan',
    icon:        'git-branch-outline',
    accentColor: '#29B6F6',
    presetStyle: 'debate',
    bestFor:     'Policy, ethics, controversial topics',
  },
  {
    id:          'news',
    name:        'News Analysis',
    description: 'Breaking down current events with expert commentary',
    hostVoice:   'alloy',
    guestVoice:  'echo',
    hostName:    'Dana',
    guestName:   'Prof. Williams',
    icon:        'newspaper-outline',
    accentColor: '#EC4899',
    presetStyle: 'news',
    bestFor:     'Current events, market news, global affairs',
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
      topic:       string,
      config:      Partial<PodcastConfig>,
      presetStyle: VoicePresetStyle = 'casual',
      report?:     ResearchReport | null
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

      const podcastInput: PodcastInput = {
        topic,
        report:      report ?? null,
        presetStyle,
      };

      await runPodcastPipeline(
        user.id,
        podcastInput,
        mergedConfig,
        {
          onScriptGenerated: (script: PodcastScript) => {
            patch({
              isGeneratingScript: false,
              isGeneratingAudio:  true,
              scriptGenerated:    true,
              audioProgress:      { completed: 0, total: script.turns.length },
              progressMessage:
                `Script ready · ${script.turns.length} turns · ` +
                `~${script.estimatedDurationMinutes} min`,
            });
          },

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

          onProgress: (message: string) => {
            patch({ progressMessage: message });
          },

          onComplete: (podcast: Podcast) => {
            patch({
              podcast,
              isGeneratingScript: false,
              isGeneratingAudio:  false,
              progressMessage:    '🎙 Podcast ready!',
            });

            // ── Part 22: Auto-cache the completed podcast ──────────────
            // Fire-and-forget — never throws, never blocks UI
            autoCachePodcast(podcast);
          },

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

  /**
   * Generate a podcast grounded in an existing research report.
   * The script agent will weave the report's verified facts and statistics
   * throughout the dialogue, producing a highly grounded episode.
   */
  const generateFromReport = useCallback(
    (
      report:      ResearchReport,
      config:      Partial<PodcastConfig> = {},
      presetStyle: VoicePresetStyle = 'casual'
    ) => generate(report.query, config, presetStyle, report),
    [generate]
  );

  /**
   * Generate a podcast from a plain topic string.
   * The script agent will use SerpAPI web search to ground the dialogue
   * in current real-world data.
   */
  const generateFromTopic = useCallback(
    (
      topic:       string,
      config:      Partial<PodcastConfig> = {},
      presetStyle: VoicePresetStyle = 'casual'
    ) => generate(topic, config, presetStyle, null),
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