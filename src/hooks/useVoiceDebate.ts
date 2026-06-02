// src/hooks/useVoiceDebate.ts
// Part 40 + Part 41.2 + Part 44 + CREDIT GATE UPDATE
//
// FIX: COST is now derived from FEATURE_COSTS['voice_debate'] at the top of
// this file. Previously COST was only defined in VoiceDebateCard.tsx, causing
// "Cannot find name 'COST'" errors throughout this hook.

import { useState, useCallback, useRef, useEffect } from 'react';
import { useAuth }                                   from '../context/AuthContext';
import { useCredits }                                from '../context/CreditsContext';
import { FEATURE_COSTS, FEATURE_LABELS }             from '../constants/credits';
import { fetchUserCredits, InsufficientCreditsError } from '../services/creditsService';
import {
  runVoiceDebatePipeline,
  fetchVoiceDebateForSession,
  mapRowToVoiceDebate,
}                                                    from '../services/voiceDebateOrchestrator';
import {
  uploadVoiceDebateAudioBackground,
  uploadVoiceDebateAudioToStorage,
}                                                    from '../services/voiceDebateAudioUploadService';
import {
  downloadVoiceDebateAudio,
  evictVoiceDebateAudio,
  isVoiceDebateAudioCached,
}                                                    from '../lib/voiceDebateAudioCache';
import {
  updateSharedDebateVoiceAudio,
}                                                    from '../services/voiceDebateSharingService';
import { supabase }                                  from '../lib/supabase';
import type { DebateSession }                        from '../types';
import type {
  VoiceDebate,
  VoiceDebateGenerationState,
  VoiceDebateGenerationPhase,
}                                                    from '../types/voiceDebate';
import type { InsufficientCreditsInfo }              from '../types/credits';

// ─── Credit cost constant ─────────────────────────────────────────────────────
// Defined here (not only in VoiceDebateCard) so this hook can use it directly.

const VOICE_DEBATE_COST  = FEATURE_COSTS['voice_debate'];  // 50
const VOICE_DEBATE_LABEL = FEATURE_LABELS['voice_debate']; // 'Voice Debate'

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

// ─── Background audio cache helper (Part 41.2, unchanged) ────────────────────

async function cacheAudioBackground(vd: VoiceDebate): Promise<void> {
  try {
    const audioPaths = vd.audioSegmentPaths ?? [];
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

// ─── Part 44: Sync audio to workspace shares after upload ────────────────────

async function syncAudioToWorkspaceShares(
  voiceDebateId: string,
  sessionId:     string,
  audioUrls:     (string | null)[],
  allUploaded:   boolean,
): Promise<void> {
  try {
    const validUrls = audioUrls.filter(
      (u): u is string => typeof u === 'string' && u.startsWith('https://')
    );
    if (validUrls.length === 0) {
      console.log('[useVoiceDebate] 📡  No cloud URLs yet — skipping workspace sync');
      return;
    }
    const { rowsUpdated, error } = await updateSharedDebateVoiceAudio(
      voiceDebateId, sessionId, validUrls, allUploaded,
    );
    if (error) {
      console.warn('[useVoiceDebate] Workspace sync error (non-fatal):', error);
    } else if (rowsUpdated > 0) {
      console.log(`[useVoiceDebate] ✅  Synced audio to ${rowsUpdated} workspace share(s) for session ${sessionId}`);
    }
  } catch (err) {
    console.warn('[useVoiceDebate] Workspace sync threw (non-fatal):', err);
  }
}

// ─── Part 44: On-visit upload for existing debates ────────────────────────────

async function onVisitUploadCheck(
  vd:         VoiceDebate,
  onProgress: (progress: number) => void,
  onComplete: (audioUrls: (string | null)[], allUploaded: boolean) => void,
): Promise<void> {
  if (vd.audioAllUploaded) return;

  const localPaths = (vd.audioSegmentPaths ?? []).filter(
    p => p && (p.startsWith('file://') || p.startsWith('/'))
  );
  if (localPaths.length === 0) return;

  console.log(`[useVoiceDebate] 📡  On-visit upload triggered for voiceDebateId=${vd.id} — ${localPaths.length} local segments`);

  try {
    const result = await uploadVoiceDebateAudioToStorage(
      vd.id,
      vd.audioSegmentPaths ?? [],
      (progress) => {
        onProgress(Math.round((progress.uploaded / Math.max(progress.total, 1)) * 100));
      },
    );

    if (result.successCount > 0) {
      await supabase
        .from('voice_debates')
        .update({
          audio_storage_urls: result.uploadedUrls,
          audio_all_uploaded: result.allSucceeded,
          audio_uploaded_at:  new Date().toISOString(),
        })
        .eq('id', vd.id);

      console.log(`[useVoiceDebate] ✅  On-visit upload complete — ${result.successCount}/${vd.audioSegmentPaths?.length ?? 0} segments`);
      onComplete(result.uploadedUrls, result.allSucceeded);

      await syncAudioToWorkspaceShares(
        vd.id, vd.debateSessionId, result.uploadedUrls, result.allSucceeded,
      );
    }
  } catch (err) {
    console.warn('[useVoiceDebate] On-visit upload error (non-fatal):', err);
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useVoiceDebate(session: DebateSession | null) {
  const { user }   = useAuth();
  const { balance, consumeTotal, refresh: refreshCredits } = useCredits();

  const [state, setState]               = useState<VoiceDebateGenerationState>(INITIAL_STATE);
  const [isLoadingExisting, setIsLoadingExisting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  // Part 44: upload progress
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [isUploading,    setIsUploading]    = useState(false);

  // ── Credit gate state ─────────────────────────────────────────────────────
  const [insufficientCreditsInfo, setInsufficientCreditsInfo] =
    useState<InsufficientCreditsInfo | null>(null);
  const [isConsumingCredits, setIsConsumingCredits] = useState(false);

  const abortRef           = useRef(false);
  const generatingRef      = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const onVisitUploadRan   = useRef(false);

  const patch = useCallback((partial: Partial<VoiceDebateGenerationState>) => {
    if (!abortRef.current) {
      setState(prev => ({ ...prev, ...partial }));
    }
  }, []);

  // ── Load existing voice debate on mount ───────────────────────────────────

  useEffect(() => {
    if (!session?.id || !user) return;
    let cancelled = false;
    setIsLoadingExisting(true);

    fetchVoiceDebateForSession(session.id)
      .then(async existing => {
        if (cancelled || generatingRef.current) return;

        if (existing) {
          setState(prev => ({
            ...prev,
            voiceDebate:     existing,
            phase:           'done',
            progressPercent: 100,
          }));

          if (existing.status === 'completed') {
            cacheAudioBackground(existing);
          }

          const hasLocalPaths = (existing.audioSegmentPaths ?? []).some(
            p => p && (p.startsWith('file://') || p.startsWith('/'))
          );

          if (
            existing.status === 'completed' &&
            !existing.audioAllUploaded &&
            hasLocalPaths &&
            !onVisitUploadRan.current
          ) {
            onVisitUploadRan.current = true;
            setIsUploading(true);
            setUploadProgress(0);

            await onVisitUploadCheck(
              existing,
              (pct) => { if (!cancelled) setUploadProgress(pct); },
              (audioUrls, allUploaded) => {
                if (!cancelled) {
                  setState(prev => {
                    if (!prev.voiceDebate) return prev;
                    return {
                      ...prev,
                      voiceDebate: {
                        ...prev.voiceDebate,
                        audioStorageUrls: audioUrls as (string | null)[],
                        audioAllUploaded: allUploaded,
                      },
                    };
                  });
                  setIsUploading(false);
                  setUploadProgress(100);
                }
              },
            );

            if (!cancelled) setIsUploading(false);
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

  // ── Realtime: listen for status / cloud URL changes ───────────────────────

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

            if (updated.audioAllUploaded && !state.voiceDebate?.audioAllUploaded) {
              setIsUploading(false);
              setUploadProgress(100);
            }
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

  // ── Credit check & consume ────────────────────────────────────────────────
  //
  // Uses VOICE_DEBATE_COST (50) and VOICE_DEBATE_LABEL defined at module scope.
  // Fetches a fresh balance from DB before deducting.
  // Returns true if deduction succeeded; false if insufficient.

  const checkAndConsumeCredits = useCallback(async (): Promise<boolean> => {
    if (!user) return false;

    setIsConsumingCredits(true);

    try {
      // Always fetch fresh balance before deducting
      let currentBalance = balance;
      try {
        const fresh = await fetchUserCredits(user.id);
        currentBalance = fresh?.balance ?? balance;
      } catch {
        // Use cached balance as fallback
      }

      if (currentBalance < VOICE_DEBATE_COST) {
        setInsufficientCreditsInfo({
          feature:      'voice_debate',
          featureLabel: VOICE_DEBATE_LABEL,
          required:     VOICE_DEBATE_COST,
          current:      currentBalance,
          shortfall:    VOICE_DEBATE_COST - currentBalance,
        });
        refreshCredits();
        return false;
      }

      const { ok, currentBalance: newBalance } = await consumeTotal(
        'voice_debate',
        VOICE_DEBATE_COST,
        `${VOICE_DEBATE_LABEL} — ${VOICE_DEBATE_COST} cr`,
      );

      if (!ok) {
        setInsufficientCreditsInfo({
          feature:      'voice_debate',
          featureLabel: VOICE_DEBATE_LABEL,
          required:     VOICE_DEBATE_COST,
          current:      newBalance,
          shortfall:    Math.max(0, VOICE_DEBATE_COST - newBalance),
        });
        return false;
      }

      console.log(`[useVoiceDebate] ✅  ${VOICE_DEBATE_COST} credits deducted for voice_debate`);
      return true;
    } catch (err) {
      console.warn('[useVoiceDebate] Credit deduction error:', err);
      if (err instanceof InsufficientCreditsError) {
        setInsufficientCreditsInfo({
          feature:      'voice_debate',
          featureLabel: VOICE_DEBATE_LABEL,
          required:     VOICE_DEBATE_COST,
          current:      err.balance,
          shortfall:    Math.max(0, VOICE_DEBATE_COST - err.balance),
        });
      }
      return false;
    } finally {
      setIsConsumingCredits(false);
    }
  }, [user, balance, consumeTotal, refreshCredits]);

  const clearInsufficientCredits = useCallback(() => {
    setInsufficientCreditsInfo(null);
  }, []);

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

    // ── CREDIT GATE ────────────────────────────────────────────────────────
    const creditOk = await checkAndConsumeCredits();
    if (!creditOk) return;
    // ──────────────────────────────────────────────────────────────────────

    abortRef.current      = false;
    generatingRef.current = true;
    setIsCancelling(false);
    setIsUploading(false);
    setUploadProgress(0);

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

      onComplete: async (voiceDebate: VoiceDebate) => {
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

        // Part 41.2: cache audio locally
        cacheAudioBackground(voiceDebate);

        // Part 44: upload to cloud + sync to workspace shares
        console.log('[useVoiceDebate] 📡  Triggering cloud upload after generation...');
        setIsUploading(true);
        setUploadProgress(0);

        try {
          const result = await uploadVoiceDebateAudioToStorage(
            voiceDebate.id,
            voiceDebate.audioSegmentPaths ?? [],
            (progress) => {
              setUploadProgress(Math.round((progress.uploaded / Math.max(progress.total, 1)) * 100));
            },
          );

          if (result.successCount > 0) {
            await supabase
              .from('voice_debates')
              .update({
                audio_storage_urls: result.uploadedUrls,
                audio_all_uploaded: result.allSucceeded,
                audio_uploaded_at:  new Date().toISOString(),
              })
              .eq('id', voiceDebate.id);

            patch({
              voiceDebate: {
                ...voiceDebate,
                audioStorageUrls: result.uploadedUrls,
                audioAllUploaded: result.allSucceeded,
              },
            });

            setIsUploading(false);
            setUploadProgress(100);
            console.log(`[useVoiceDebate] ✅  Cloud upload complete — ${result.successCount} segments`);

            await syncAudioToWorkspaceShares(
              voiceDebate.id, voiceDebate.debateSessionId,
              result.uploadedUrls, result.allSucceeded,
            );
          } else {
            setIsUploading(false);
          }
        } catch (uploadErr) {
          console.warn('[useVoiceDebate] Cloud upload error (non-fatal):', uploadErr);
          setIsUploading(false);
          uploadVoiceDebateAudioBackground(voiceDebate.id, voiceDebate.audioSegmentPaths ?? []);
        }
      },

      onError: (message: string) => {
        generatingRef.current = false;
        setIsUploading(false);

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
  }, [user, session, patch, checkAndConsumeCredits]);

  // ── Part 44: Manual trigger upload ────────────────────────────────────────

  const triggerUploadNow = useCallback(async () => {
    const vd = state.voiceDebate;
    if (!vd || vd.audioAllUploaded || isUploading) return;

    setIsUploading(true);
    setUploadProgress(0);

    try {
      const result = await uploadVoiceDebateAudioToStorage(
        vd.id,
        vd.audioSegmentPaths ?? [],
        (progress) => {
          setUploadProgress(Math.round((progress.uploaded / Math.max(progress.total, 1)) * 100));
        },
      );

      if (result.successCount > 0) {
        await supabase
          .from('voice_debates')
          .update({
            audio_storage_urls: result.uploadedUrls,
            audio_all_uploaded: result.allSucceeded,
            audio_uploaded_at:  new Date().toISOString(),
          })
          .eq('id', vd.id);

        patch({
          voiceDebate: {
            ...vd,
            audioStorageUrls: result.uploadedUrls,
            audioAllUploaded: result.allSucceeded,
          },
        });

        await syncAudioToWorkspaceShares(
          vd.id, vd.debateSessionId, result.uploadedUrls, result.allSucceeded,
        );
      }
    } catch (err) {
      console.warn('[useVoiceDebate] triggerUploadNow error:', err);
    } finally {
      setIsUploading(false);
      setUploadProgress(100);
    }
  }, [state.voiceDebate, isUploading, patch]);

  // ── Cancel ────────────────────────────────────────────────────────────────

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

  // ── Reset ─────────────────────────────────────────────────────────────────

  const reset = useCallback(() => {
    abortRef.current      = true;
    generatingRef.current = false;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsCancelling(false);
    setIsUploading(false);
    setUploadProgress(0);
    setState(INITIAL_STATE);
    setTimeout(() => { abortRef.current = false; }, 100);
  }, []);

  // ── Delete ────────────────────────────────────────────────────────────────

  const deleteVoiceDebate = useCallback(async () => {
    if (!user || !state.voiceDebate) return;
    const { error } = await supabase
      .from('voice_debates')
      .delete()
      .eq('id', state.voiceDebate.id)
      .eq('user_id', user.id);
    if (!error) {
      await evictVoiceDebateAudio(state.voiceDebate.id).catch(() => {});
      setState(INITIAL_STATE);
      setIsUploading(false);
      setUploadProgress(0);
    }
  }, [user, state.voiceDebate]);

  // ── Derived ───────────────────────────────────────────────────────────────

  const isGenerating     = state.phase !== 'idle' && state.phase !== 'done' && state.phase !== 'error';
  const hasCompleted     = state.voiceDebate?.status === 'completed';
  const audioAllUploaded = state.voiceDebate?.audioAllUploaded === true;

  return {
    state,
    isGenerating,
    isLoadingExisting,
    isCancelling,
    hasCompleted,
    // Part 44:
    uploadProgress,
    isUploading,
    audioAllUploaded,
    triggerUploadNow,
    // Credit gate:
    insufficientCreditsInfo,
    isConsumingCredits,
    clearInsufficientCredits,
    generate,
    cancelGeneration,
    reset,
    deleteVoiceDebate,
  };
}