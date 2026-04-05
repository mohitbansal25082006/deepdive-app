// src/hooks/usePodcast.ts
// Part 39 — UPDATED: V2 multi-speaker podcast generation
//
// CHANGES from Part 22:
//   1. generateFromPresetV2() — uses V2 script agent (3-speaker, advanced structure)
//   2. PODCAST_VOICE_PRESETS_V2 re-exported for backward compat
//   3. Stores speakersV2 config, audioQuality, seriesId, episodeNumber in pipeline input
//   4. generateFromReport / generateFromTopic updated to accept V2 options
//   5. PodcastVoicePresetDef still exported for old VoiceStyleSelector compat
//
// ALL PART 22 FUNCTIONALITY PRESERVED:
//   - autoCachePodcast on onComplete
//   - All generation state tracking
//   - generateFromReport / generateFromTopic

import { useState, useCallback, useRef }   from 'react';
import type {
  ResearchReport,
  Podcast,
  PodcastConfig,
  PodcastScript,
  PodcastGenerationState,
  PodcastVoice,
}                                           from '../types';
import {
  runPodcastPipeline,
  type PodcastInput,
}                                           from '../services/podcastOrchestrator';
import type {
  VoicePresetStyle,
}                                           from '../services/agents/podcastScriptAgentV2';
import type {
  SpeakerConfig,
  VoicePresetStyleV2,
  AudioQuality,
}                                           from '../types/podcast_v2';
import {
  PODCAST_VOICE_PRESETS_V2,
  type PodcastVoicePresetV2Def,
}                                           from '../constants/podcastV2';
import { useAuth }                          from '../context/AuthContext';
import { autoCachePodcast }                 from '../lib/autoCacheMiddleware';

// ─── Re-export for backward compat ────────────────────────────────────────────

export { PODCAST_VOICE_PRESETS_V2 as PODCAST_VOICE_PRESETS };
export type PodcastVoicePresetDef = PodcastVoicePresetV2Def;

// Legacy 6-preset list (for VoiceStyleSelector which imports PODCAST_VOICE_PRESETS)
export const PODCAST_VOICE_PRESETS_LEGACY = PODCAST_VOICE_PRESETS_V2.slice(0, 6);

// ─── Defaults ──────────────────────────────────────────────────────────────────

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

// ─── V2 Generate Options ──────────────────────────────────────────────────────

export interface GenerateOptionsV2 {
  /** Speaker configs (V2 — 2 or 3 speakers) */
  speakers?:      SpeakerConfig[];
  speakerCount?:  2 | 3;
  presetStyleV2?: VoicePresetStyleV2;
  audioQuality?:  AudioQuality;
  seriesId?:      string;
  episodeNumber?: number;
  /** Legacy */
  presetStyle?:   VoicePresetStyle;
}

// ─── Hook ──────────────────────────────────────────────────────────────────────

export function usePodcast() {
  const { user } = useAuth();
  const [state, setState]   = useState<PodcastGenerationState>(INITIAL_STATE);
  const abortRef            = useRef(false);

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
      options: GenerateOptionsV2 = {},
      report?: ResearchReport | null,
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

      setState({
        ...INITIAL_STATE,
        isGeneratingScript: true,
        progressMessage:    'Writing podcast script...',
      });

      // Build V2 pipeline input
      const podcastInput: PodcastInput = {
        topic,
        report:        report ?? null,
        presetStyle:   options.presetStyle,
        // V2 fields
        speakers:      options.speakers,
        speakerCount:  options.speakerCount,
        presetStyleV2: options.presetStyleV2,
        audioQuality:  options.audioQuality,
        seriesId:      options.seriesId,
        episodeNumber: options.episodeNumber,
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

          onSegmentGenerated: (segmentIndex, totalSegments, _audioPath) => {
            patch({
              audioProgress: {
                completed: segmentIndex + 1,
                total:     totalSegments,
              },
            });
          },

          onProgress: (message) => {
            patch({ progressMessage: message });
          },

          onComplete: (podcast: Podcast) => {
            patch({
              podcast,
              isGeneratingScript: false,
              isGeneratingAudio:  false,
              progressMessage:    '🎙 Podcast ready!',
            });
            // Auto-cache completed podcast
            autoCachePodcast(podcast);
          },

          onError: (message) => {
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
   * Generate podcast from a preset definition (V2 — handles 2 or 3 speakers).
   */
  const generateFromPresetV2 = useCallback(
    (
      topic:        string,
      preset:       PodcastVoicePresetV2Def,
      durationMins: number,
      options:      Partial<GenerateOptionsV2> = {},
      report?:      ResearchReport | null,
    ) => {
      const config: PodcastConfig = {
        hostVoice:             preset.hostVoice,
        guestVoice:            preset.guestVoice,
        hostName:              preset.hostName,
        guestName:             preset.guestName,
        targetDurationMinutes: durationMins,
      };

      const genOptions: GenerateOptionsV2 = {
        speakers:      preset.speakers,
        speakerCount:  preset.speakerCount,
        presetStyleV2: preset.presetStyleV2,
        ...options,
      };

      return generate(topic, config, genOptions, report ?? null);
    },
    [generate]
  );

  /**
   * Generate from a research report using V2 preset.
   */
  const generateFromReport = useCallback(
    (
      report:       ResearchReport,
      config:       Partial<PodcastConfig> = {},
      presetStyle:  VoicePresetStyle = 'casual',
      optionsV2:    Partial<GenerateOptionsV2> = {},
    ) => generate(
      report.query,
      config,
      { presetStyle, presetStyleV2: presetStyle as VoicePresetStyleV2, ...optionsV2 },
      report
    ),
    [generate]
  );

  /**
   * Generate from a plain topic string using V2 preset.
   */
  const generateFromTopic = useCallback(
    (
      topic:       string,
      config:      Partial<PodcastConfig> = {},
      presetStyle: VoicePresetStyle = 'casual',
      optionsV2:   Partial<GenerateOptionsV2> = {},
    ) => generate(
      topic,
      config,
      { presetStyle, presetStyleV2: presetStyle as VoicePresetStyleV2, ...optionsV2 },
      null
    ),
    [generate]
  );

  /** Reset all state */
  const reset = useCallback(() => {
    abortRef.current = true;
    setState(INITIAL_STATE);
  }, []);

  // ── Derived values ────────────────────────────────────────────────────────

  const isGenerating =
    state.isGeneratingScript || state.isGeneratingAudio;

  const audioProgressPercent =
    state.audioProgress.total > 0
      ? Math.round((state.audioProgress.completed / state.audioProgress.total) * 100)
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
    generateFromPresetV2,
    generateFromReport,
    generateFromTopic,
    reset,
  };
}