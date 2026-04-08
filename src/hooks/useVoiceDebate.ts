// src/hooks/useVoiceDebate.ts
// Part 40 Fix — Complete cancel/regenerate support
//
// KEY FIXES:
//   1. cancelGeneration() aborts the pipeline, resets state to INITIAL_STATE,
//      and clears abortRef so generate() can run cleanly again.
//   2. generate() always resets abortRef = false at the start so a re-run
//      after cancel works without stale abort state.
//   3. onError in the pipeline receives 'AbortError' sentinel → hook resets
//      to idle silently (no error UI shown to user).
//   4. isLoadingExisting is now guarded so it doesn't overwrite an
//      in-progress generation state.

import { useState, useCallback, useRef, useEffect } from 'react';
import { useAuth }                          from '../context/AuthContext';
import {
  runVoiceDebatePipeline,
  fetchVoiceDebateForSession,
  mapRowToVoiceDebate,
}                                           from '../services/voiceDebateOrchestrator';
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
  const { user }                            = useAuth();
  const [state, setState]                   = useState<VoiceDebateGenerationState>(INITIAL_STATE);
  const [isLoadingExisting, setIsLoadingExisting] = useState(false);
  const [isCancelling, setIsCancelling]     = useState(false);

  // abortRef: true means we are cancelling — patch() calls are ignored
  const abortRef           = useRef(false);
  // generatingRef: true means a pipeline is actively running
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
        // Don't overwrite an active generation
        if (generatingRef.current) return;
        if (existing) {
          setState(prev => ({
            ...prev,
            voiceDebate:     existing,
            phase:           'done',
            progressPercent: 100,
          }));
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

    // ── FIX: Always reset abort state before a new run ─────────────────────
    abortRef.current     = false;
    generatingRef.current = true;
    setIsCancelling(false);

    // Create a fresh AbortController for this generation run
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
      },

      onError: (message: string) => {
        generatingRef.current = false;

        // ── FIX: AbortError sentinel = user cancelled → reset to idle silently
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

    // Ensure generatingRef is cleared even if pipeline returns without calling callbacks
    generatingRef.current = false;
  }, [user, session, patch]);

  // ── Cancel generation ──────────────────────────────────────────────────────

  const cancelGeneration = useCallback(() => {
    // Mark as aborting — all patch() calls will be ignored from now on
    abortRef.current     = true;
    generatingRef.current = false;
    setIsCancelling(true);

    // Signal the orchestrator's AbortSignal
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    // Reset UI immediately — don't wait for the pipeline to clean up the DB row
    // The orchestrator will delete the stale row in the background.
    // We use a short delay so any in-flight patch() calls that fire before
    // the abort propagates don't get shown.
    setTimeout(() => {
      setState(INITIAL_STATE);
      setIsCancelling(false);
      // Reset abortRef AFTER setState so subsequent generate() calls work
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
    // Allow new runs after reset
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