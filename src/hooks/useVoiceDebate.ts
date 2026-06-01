// src/hooks/useVoiceDebate.ts
// Part 40 + Part 41.2 + Part 44 UPDATE
//
// CHANGES in Part 44:
//   1. After onComplete fires, immediately triggers uploadVoiceDebateAudioBackground()
//      (was already done in 41.2 via cacheAudioBackground — now ALSO explicitly
//       triggers the upload service so cloud URLs appear faster and the share
//       button becomes available sooner).
//
//   2. On mount, if an existing completed voice debate is loaded but
//      audio_all_uploaded = false AND local paths exist, triggers a background
//      upload automatically so the user doesn't have to wait.
//
//   3. After upload completes, if the debate session is already shared to
//      workspaces (via shared_debates), calls updateSharedDebateVoiceAudio()
//      to sync the audio URLs to all workspace copies.
//
//   4. Exposes `uploadProgress` state (0-100) so VoiceDebateCard can show
//      a progress indicator while upload runs.
//
//   5. Exposes `triggerUploadNow()` helper — called from VoiceDebateCard's
//      "Upload Now" button (shown when audioAllUploaded = false).
//
// All Part 40 + 41.2 functionality preserved unchanged.

import { useState, useCallback, useRef, useEffect } from 'react';
import { useAuth }                                   from '../context/AuthContext';
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
//
// If the debate session was already shared to workspaces (via shared_debates)
// BEFORE the voice debate was generated, we need to push the audio URLs to
// all shared_voice_debates rows that reference the same debate_session_id.
//
// This is a fire-and-forget operation — failures are non-fatal.

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
      voiceDebateId,
      sessionId,
      validUrls,
      allUploaded,
    );

    if (error) {
      console.warn('[useVoiceDebate] Workspace sync error (non-fatal):', error);
    } else if (rowsUpdated > 0) {
      console.log(`[useVoiceDebate] ✅  Synced audio to ${rowsUpdated} workspace share(s) for session ${sessionId}`);
    } else {
      console.log('[useVoiceDebate] ℹ️  No workspace shares to sync for this session');
    }
  } catch (err) {
    console.warn('[useVoiceDebate] Workspace sync threw (non-fatal):', err);
  }
}

// ─── Part 44: On-visit upload for existing debates ────────────────────────────
//
// If a completed voice debate exists on this device but hasn't been uploaded
// (e.g. it was generated before Part 44 was deployed, or the upload was
// interrupted), trigger an upload now in the background.

async function onVisitUploadCheck(
  vd:            VoiceDebate,
  onProgress:    (progress: number) => void,
  onComplete:    (audioUrls: (string | null)[], allUploaded: boolean) => void,
): Promise<void> {
  // Skip if already uploaded
  if (vd.audioAllUploaded) {
    console.log('[useVoiceDebate] ℹ️  Audio already uploaded for voiceDebateId=' + vd.id);
    return;
  }

  const localPaths = (vd.audioSegmentPaths ?? []).filter(
    p => p && (p.startsWith('file://') || p.startsWith('/'))
  );

  if (localPaths.length === 0) {
    console.log('[useVoiceDebate] ℹ️  No local audio paths found for on-visit upload');
    return;
  }

  console.log(`[useVoiceDebate] 📡  On-visit upload triggered for voiceDebateId=${vd.id} — ${localPaths.length} local segments`);

  try {
    const result = await uploadVoiceDebateAudioToStorage(
      vd.id,
      vd.audioSegmentPaths ?? [],
      (progress) => {
        const pct = Math.round((progress.uploaded / Math.max(progress.total, 1)) * 100);
        onProgress(pct);
      },
    );

    // Update voice_debates row with cloud URLs
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

      // Sync to workspace shares
      await syncAudioToWorkspaceShares(
        vd.id,
        vd.debateSessionId,
        result.uploadedUrls,
        result.allSucceeded,
      );
    }
  } catch (err) {
    console.warn('[useVoiceDebate] On-visit upload error (non-fatal):', err);
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useVoiceDebate(session: DebateSession | null) {
  const { user }                            = useAuth();
  const [state, setState]                   = useState<VoiceDebateGenerationState>(INITIAL_STATE);
  const [isLoadingExisting, setIsLoadingExisting] = useState(false);
  const [isCancelling, setIsCancelling]     = useState(false);

  // Part 44: Upload progress for the VoiceDebateCard cloud badge
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [isUploading,    setIsUploading]    = useState(false);

  const abortRef           = useRef(false);
  const generatingRef      = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const onVisitUploadRan   = useRef(false);   // guard: only trigger once per mount

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
        if (cancelled) return;
        if (generatingRef.current) return;
        if (existing) {
          setState(prev => ({
            ...prev,
            voiceDebate:     existing,
            phase:           'done',
            progressPercent: 100,
          }));

          // Part 41.2: auto-cache audio in background
          if (existing.status === 'completed') {
            cacheAudioBackground(existing);
          }

          // Part 44: On-visit upload check (runs once per mount, non-blocking)
          if (
            existing.status === 'completed' &&
            !existing.audioAllUploaded &&
            !onVisitUploadRan.current
          ) {
            onVisitUploadRan.current = true;
            setIsUploading(true);
            setUploadProgress(0);

            await onVisitUploadCheck(
              existing,
              (pct) => {
                if (!cancelled) setUploadProgress(pct);
              },
              (audioUrls, allUploaded) => {
                if (!cancelled) {
                  // Update state.voiceDebate with the new cloud URLs
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

            // If cloud upload just completed on another device, update badge
            if (updated.audioAllUploaded && !state.voiceDebate?.audioAllUploaded) {
              console.log('[useVoiceDebate] ✅  Realtime: cloud upload completed for this debate');
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

        // Part 41.2: cache audio locally in background
        cacheAudioBackground(voiceDebate);

        // Part 44: Trigger cloud upload in background + sync to workspace shares
        console.log('[useVoiceDebate] 📡  Triggering cloud upload after generation...');
        setIsUploading(true);
        setUploadProgress(0);

        try {
          const result = await uploadVoiceDebateAudioToStorage(
            voiceDebate.id,
            voiceDebate.audioSegmentPaths ?? [],
            (progress) => {
              const pct = Math.round((progress.uploaded / Math.max(progress.total, 1)) * 100);
              setUploadProgress(pct);
            },
          );

          if (result.successCount > 0) {
            // Update voice_debates row with cloud URLs
            await supabase
              .from('voice_debates')
              .update({
                audio_storage_urls: result.uploadedUrls,
                audio_all_uploaded: result.allSucceeded,
                audio_uploaded_at:  new Date().toISOString(),
              })
              .eq('id', voiceDebate.id);

            // Update local state so badge turns green immediately
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

            // Sync to any workspace shares that already exist for this session
            await syncAudioToWorkspaceShares(
              voiceDebate.id,
              voiceDebate.debateSessionId,
              result.uploadedUrls,
              result.allSucceeded,
            );
          } else {
            console.warn('[useVoiceDebate] ⚠️  Cloud upload produced 0 successful segments');
            setIsUploading(false);
          }
        } catch (uploadErr) {
          console.warn('[useVoiceDebate] Cloud upload error (non-fatal):', uploadErr);
          setIsUploading(false);
          // Fall back to the background upload service which has its own retry
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
  }, [user, session, patch]);

  // ── Part 44: Manual trigger upload (for "Upload Now" button) ─────────────

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
          const pct = Math.round((progress.uploaded / Math.max(progress.total, 1)) * 100);
          setUploadProgress(pct);
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
          vd.id,
          vd.debateSessionId,
          result.uploadedUrls,
          result.allSucceeded,
        );
      }
    } catch (err) {
      console.warn('[useVoiceDebate] triggerUploadNow error:', err);
    } finally {
      setIsUploading(false);
      setUploadProgress(100);
    }
  }, [state.voiceDebate, isUploading, patch]);

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
    setIsUploading(false);
    setUploadProgress(0);
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
      setIsUploading(false);
      setUploadProgress(0);
    }
  }, [user, state.voiceDebate]);

  // ── Derived ────────────────────────────────────────────────────────────────

  const isGenerating  = state.phase !== 'idle' && state.phase !== 'done' && state.phase !== 'error';
  const hasCompleted  = state.voiceDebate?.status === 'completed';
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
    generate,
    cancelGeneration,
    reset,
    deleteVoiceDebate,
  };
}