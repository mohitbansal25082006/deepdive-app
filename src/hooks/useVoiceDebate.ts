// src/hooks/useVoiceDebate.ts
// Part 40 Fix — Added cancel generation support
//
// Changes:
//   1. Added cancelGeneration() — sets abortRef, calls orchestrator abort signal
//   2. Exports isCancelling state
//   3. abortController ref used to signal runVoiceDebatePipeline to stop mid-flight
//   4. All existing functionality preserved

import { useState, useCallback, useRef, useEffect } from 'react';
import { useAuth }                          from '../context/AuthContext';
import { runVoiceDebatePipeline, fetchVoiceDebateForSession, mapRowToVoiceDebate } from '../services/voiceDebateOrchestrator';
import { supabase }                         from '../lib/supabase';
import type { DebateSession }               from '../types';
import type {
  VoiceDebate,
  VoiceDebateGenerationState,
  VoiceDebateGenerationPhase,
}                                           from '../types/voiceDebate';

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

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useVoiceDebate(session: DebateSession | null) {
  const { user }                      = useAuth();
  const [state, setState]             = useState<VoiceDebateGenerationState>(INITIAL_STATE);
  const [isLoadingExisting, setIsLoadingExisting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const abortRef                      = useRef(false);
  const abortControllerRef            = useRef<AbortController | null>(null);

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
        if (existing) {
          patch({ voiceDebate: existing, phase: 'done', progressPercent: 100 });
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

    abortRef.current = false;
    setIsCancelling(false);

    // Create new AbortController for this generation run
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

      onPhaseUpdate: (phase: VoiceDebateGenerationPhase, label: string, percent: number, agentName?: string) => {
        if (abortRef.current) return;
        patch({
          phase,
          phaseLabel:      label,
          progressPercent: percent,
          activeAgentName: agentName ?? '',
        });
      },

      onAudioProgress: (completed: number, total: number) => {
        if (abortRef.current) return;
        patch({ audioProgress: { completed, total } });
      },

      onComplete: (voiceDebate: VoiceDebate) => {
        if (abortRef.current) return;
        setIsCancelling(false);
        patch({
          voiceDebate,
          phase:           'done',
          phaseLabel:      'Voice debate ready!',
          progressPercent: 100,
          activeAgentName: '',
          error:           null,
        });
      },

      onError: (message: string) => {
        if (abortRef.current) {
          // Cancelled — reset to idle
          setState(INITIAL_STATE);
          setIsCancelling(false);
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
  }, [user, session, patch]);

  // ── Cancel generation ──────────────────────────────────────────────────────

  const cancelGeneration = useCallback(() => {
    abortRef.current = true;
    setIsCancelling(true);

    // Signal the orchestrator to stop
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    // Reset to idle after a brief delay (allow cleanup)
    setTimeout(() => {
      setState(INITIAL_STATE);
      setIsCancelling(false);
    }, 600);
  }, []);

  // ── Reset ──────────────────────────────────────────────────────────────────

  const reset = useCallback(() => {
    abortRef.current = true;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsCancelling(false);
    setState(INITIAL_STATE);
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
      patch({
        voiceDebate:     null,
        phase:           'idle',
        progressPercent: 0,
        error:           null,
      });
    }
  }, [user, state.voiceDebate, patch]);

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