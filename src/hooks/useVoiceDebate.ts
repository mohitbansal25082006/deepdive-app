// src/hooks/useVoiceDebate.ts
// Part 40 + Part 41.2 UPDATE
//
// CHANGES in 41.2:
//   1. After onComplete fires, auto-cache the audio locally using
//      voiceDebateAudioCache so it survives device restarts and is
//      available for the cache manager.
//   2. On mount, if an existing completed debate is loaded, its audio
//      is also cached in the background (for the case where the user
//      generated on this device but the cache was cleared).
//   3. deleteVoiceDebate() also evicts cached audio.

import { useState, useCallback, useRef, useEffect } from 'react';
import { useAuth }                                   from '../context/AuthContext';
import {
  runVoiceDebatePipeline,
  fetchVoiceDebateForSession,
  mapRowToVoiceDebate,
}                                                    from '../services/voiceDebateOrchestrator';
import {
  downloadVoiceDebateAudio,
  evictVoiceDebateAudio,
  isVoiceDebateAudioCached,
}                                                    from '../lib/voiceDebateAudioCache';
import { supabase }                                  from '../lib/supabase';
import type { DebateSession }                        from '../types';
import type {
  VoiceDebate,
  VoiceDebateGenerationState,
  VoiceDebateGenerationPhase,
}                                                    from '../types/voiceDebate';

// ─── Initial state ────────────────────────────────────────────────────────────

const INITIAL_STATE: VoiceDebateGenerationState = {
  phase:           'idle',
  phaseLabel:      '',
  progressPercent: 0,
  activeAgentName: '',
  audioProgress:   { completed: 0, total: 0 },
  voiceDebate:     null,
  error:           null,
};

// ─── Background audio cache helper ───────────────────────────────────────────

async function cacheAudioBackground(vd: VoiceDebate): Promise<void> {
  try {
    const audioPaths = vd.audioSegmentPaths ?? [];
    // Combine local + cloud paths: prefer local first, fall back to cloud
    const sources = audioPaths.map((local, i) => {
      if (local && !local.startsWith('http')) return local;
      const cloud = (vd.audioStorageUrls as any)?.[i] ?? null;
      return cloud ?? local;
    }).filter(Boolean);

    if (sources.length === 0) return;

    const alreadyCached = await isVoiceDebateAudioCached(vd.id);
    if (alreadyCached) return;

    console.log(`[useVoiceDebate] 💾  Background caching ${sources.length} audio turns for voiceDebateId=${vd.id}`);
    await downloadVoiceDebateAudio(vd.id, vd.topic, sources);
    console.log(`[useVoiceDebate] ✅  Audio cache complete for voiceDebateId=${vd.id}`);
  } catch (err) {
    console.warn('[useVoiceDebate] Audio cache error (non-fatal):', err);
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useVoiceDebate(session: DebateSession | null) {
  const { user }                            = useAuth();
  const [state, setState]                   = useState<VoiceDebateGenerationState>(INITIAL_STATE);
  const [isLoadingExisting, setIsLoadingExisting] = useState(false);
  const [isCancelling, setIsCancelling]     = useState(false);

  const abortRef           = useRef(false);
  const generatingRef      = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const patch = useCallback((partial: Partial<VoiceDebateGenerationState>) => {
    if (!abortRef.current) {
      setState(prev => ({ ...prev, ...partial }));
    }
  }, []);

  // ── Load existing voice debate on mount ────────────────────────────────────

  useEffect(() => {
    if (!session?.id || !user) return;

    let cancelled = false;
    setIsLoadingExisting(true);

    fetchVoiceDebateForSession(session.id)
      .then(existing => {
        if (cancelled) return;
        if (generatingRef.current) return;
        if (existing) {
          setState(prev => ({
            ...prev,
            voiceDebate:     existing,
            phase:           'done',
            progressPercent: 100,
          }));

          // Auto-cache audio in background if not already cached
          if (existing.status === 'completed') {
            cacheAudioBackground(existing);
          }
        }
      })
      .catch(err => {
        console.warn('[useVoiceDebate] Failed to load existing voice debate:', err);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingExisting(false);
      });

    return () => { cancelled = true; };
  }, [session?.id, user?.id]);

  // ── Realtime: listen for status changes ───────────────────────────────────

  useEffect(() => {
    if (!session?.id || !user) return;

    const channel = supabase
      .channel(`voice_debate_${session.id}`)
      .on(
        'postgres_changes',
        {
          event:  'UPDATE',
          schema: 'public',
          table:  'voice_debates',
          filter: `debate_session_id=eq.${session.id}`,
        },
        payload => {
          if (abortRef.current) return;
          if (payload.new && typeof payload.new === 'object') {
            const updated = mapRowToVoiceDebate(payload.new as Record<string, any>);
            patch({ voiceDebate: updated });
            if (updated.status === 'completed') {
              patch({ phase: 'done', progressPercent: 100 });
            } else if (updated.status === 'failed') {
              patch({
                phase:           'error',
                error:           updated.errorMessage ?? 'Generation failed',
                progressPercent: 0,
              });
            }
          }
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [session?.id, user?.id]);

  // ── Generate voice debate ──────────────────────────────────────────────────

  const generate = useCallback(async () => {
    if (!user || !session) {
      patch({ error: 'You must be signed in to generate a voice debate.' });
      return;
    }

    if (session.status !== 'completed') {
      patch({ error: 'The debate must be completed before generating voice audio.' });
      return;
    }

    abortRef.current      = false;
    generatingRef.current = true;
    setIsCancelling(false);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setState({
      ...INITIAL_STATE,
      phase:           'briefing',
      phaseLabel:      'Briefing agents with debate context...',
      progressPercent: 5,
      activeAgentName: '',
    });

    await runVoiceDebatePipeline(user.id, session, {

      onPhaseUpdate: (
        phase: VoiceDebateGenerationPhase,
        label: string,
        percent: number,
        agentName?: string,
      ) => {
        if (abortRef.current) return;
        patch({ phase, phaseLabel: label, progressPercent: percent, activeAgentName: agentName ?? '' });
      },

      onAudioProgress: (completed: number, total: number) => {
        if (abortRef.current) return;
        patch({ audioProgress: { completed, total } });
      },

      onComplete: (voiceDebate: VoiceDebate) => {
        if (abortRef.current) return;
        generatingRef.current = false;
        setIsCancelling(false);
        patch({
          voiceDebate,
          phase:           'done',
          phaseLabel:      'Voice debate ready!',
          progressPercent: 100,
          activeAgentName: '',
          error:           null,
        });

        // Part 41.2: cache audio locally in background
        cacheAudioBackground(voiceDebate);
      },

      onError: (message: string) => {
        generatingRef.current = false;

        if (message === 'AbortError' || abortRef.current) {
          setState(INITIAL_STATE);
          setIsCancelling(false);
          abortRef.current = false;
          return;
        }

        patch({
          phase:           'error',
          phaseLabel:      'Generation failed',
          progressPercent: 0,
          activeAgentName: '',
          error:           message,
        });
      },

    }, controller.signal);

    generatingRef.current = false;
  }, [user, session, patch]);

  // ── Cancel generation ──────────────────────────────────────────────────────

  const cancelGeneration = useCallback(() => {
    abortRef.current      = true;
    generatingRef.current = false;
    setIsCancelling(true);

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    setTimeout(() => {
      setState(INITIAL_STATE);
      setIsCancelling(false);
      abortRef.current = false;
    }, 800);
  }, []);

  // ── Reset ──────────────────────────────────────────────────────────────────

  const reset = useCallback(() => {
    abortRef.current      = true;
    generatingRef.current = false;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsCancelling(false);
    setState(INITIAL_STATE);
    setTimeout(() => { abortRef.current = false; }, 100);
  }, []);

  // ── Delete voice debate ────────────────────────────────────────────────────

  const deleteVoiceDebate = useCallback(async () => {
    if (!user || !state.voiceDebate) return;

    const { error } = await supabase
      .from('voice_debates')
      .delete()
      .eq('id', state.voiceDebate.id)
      .eq('user_id', user.id);

    if (!error) {
      // Part 41.2: also evict local audio cache
      await evictVoiceDebateAudio(state.voiceDebate.id).catch(() => {});
      setState(INITIAL_STATE);
    }
  }, [user, state.voiceDebate]);

  // ── Derived ────────────────────────────────────────────────────────────────

  const isGenerating = state.phase !== 'idle' && state.phase !== 'done' && state.phase !== 'error';
  const hasCompleted = state.voiceDebate?.status === 'completed';

  return {
    state,
    isGenerating,
    isLoadingExisting,
    isCancelling,
    hasCompleted,
    generate,
    cancelGeneration,
    reset,
    deleteVoiceDebate,
  };
}