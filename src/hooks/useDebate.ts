// src/hooks/useDebate.ts
// Part 20 — Original (DebateConfigV2, reportContext support)
// Part 22 — Added: autoCacheDebate() called inside onComplete
//
// CHANGE LOG (Part 22 only):
//   Line added: import { autoCacheDebate } from '../lib/autoCacheMiddleware';
//   Line added inside onComplete callback: autoCacheDebate(session);
//   Everything else is byte-for-byte identical to Part 20.

import { useState, useCallback, useRef } from 'react';
import {
  DebateSession,
  DebateGenerationState,
  DebateAgentProgressItem,
  DebatePerspective,
  DebateAgentRole,
} from '../types';
import { runDebatePipeline, DebateConfigV2 } from '../services/debateOrchestrator';
import { useAuth }                           from '../context/AuthContext';
// ── Part 22: Auto-cache import ───────────────────────────────────────────────
import { autoCacheDebate }                   from '../lib/autoCacheMiddleware';

// ─── Initial state ────────────────────────────────────────────────────────────

const INITIAL_STATE: DebateGenerationState = {
  session:         null,
  agentProgress:   [],
  isSearching:     false,
  isDebating:      false,
  isModerating:    false,
  completedAgents: 0,
  totalAgents:     0,
  progressMessage: '',
  error:           null,
};

const DEFAULT_ROLES: DebateAgentRole[] = [
  'optimist', 'skeptic', 'economist', 'technologist', 'ethicist', 'futurist',
];

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useDebate() {
  const { user } = useAuth();
  const [state, setState] = useState<DebateGenerationState>(INITIAL_STATE);

  // Prevents stale state updates after reset() is called
  const abortRef = useRef(false);

  const patch = useCallback((partial: Partial<DebateGenerationState>) => {
    if (!abortRef.current) {
      setState(prev => ({ ...prev, ...partial }));
    }
  }, []);

  // ── Core launcher ─────────────────────────────────────────────────────────
  // Part 20: config is now DebateConfigV2 (supports optional reportContext)

  const startDebate = useCallback(
    async (topic: string, config: DebateConfigV2 = {}) => {
      if (!user) {
        setState(prev => ({
          ...prev,
          error: 'You must be signed in to start a debate.',
        }));
        return;
      }

      const roles = config.agentRoles?.length ? config.agentRoles : DEFAULT_ROLES;

      abortRef.current = false;

      // Reset to a clean generating state
      setState({
        ...INITIAL_STATE,
        isSearching:     true,
        isDebating:      true,
        totalAgents:     roles.length,
        progressMessage: config.reportContext
          ? `Analysing topic with report context from "${config.reportContext.reportTitle}"...`
          : 'Analysing debate topic...',
        agentProgress:   [],
      });

      await runDebatePipeline(user.id, topic, { ...config, agentRoles: roles }, {

        // ── Per-agent progress ──────────────────────────────────────────────

        onAgentProgressUpdate: (progress: DebateAgentProgressItem[]) => {
          if (abortRef.current) return;
          const completed = progress.filter(p => p.status === 'completed').length;
          patch({ agentProgress: progress, completedAgents: completed });
        },

        // ── Individual agent completes ──────────────────────────────────────

        onAgentComplete: (_role: DebateAgentRole, _perspective: DebatePerspective) => {
          // Progress already updated via onAgentProgressUpdate.
        },

        // ── Status message updates ──────────────────────────────────────────

        onStatusUpdate: (message: string) => {
          if (abortRef.current) return;
          const isModerating =
            message.toLowerCase().includes('moderator') ||
            message.toLowerCase().includes('synthesising') ||
            message.toLowerCase().includes('moderating');

          patch({
            progressMessage: message,
            isModerating,
            isDebating:  !isModerating,
            isSearching: false,
          });
        },

        // ── Pipeline complete ───────────────────────────────────────────────

        onComplete: (session: DebateSession) => {
          if (abortRef.current) return;
          patch({
            session,
            isSearching:     false,
            isDebating:      false,
            isModerating:    false,
            progressMessage: '🎯 Debate complete!',
          });

          // ── Part 22: Auto-cache the completed debate ───────────────────
          // Fire-and-forget — never throws, never blocks the UI update above
          autoCacheDebate(session);
        },

        // ── Pipeline error ──────────────────────────────────────────────────

        onError: (message: string) => {
          if (abortRef.current) return;
          patch({
            isSearching:     false,
            isDebating:      false,
            isModerating:    false,
            error:           message,
            progressMessage: '',
          });
        },
      });
    },
    [user, patch],
  );

  // ── Reset ─────────────────────────────────────────────────────────────────

  const reset = useCallback(() => {
    abortRef.current = true;
    setState(INITIAL_STATE);
  }, []);

  // ── Derived values ────────────────────────────────────────────────────────

  const isGenerating =
    state.isSearching || state.isDebating || state.isModerating;

  const progressPercent = (() => {
    if (state.session)      return 100;
    if (state.isModerating) return 90;
    if (state.totalAgents > 0) {
      return Math.min(
        85,
        Math.round((state.completedAgents / state.totalAgents) * 85),
      );
    }
    return 0;
  })();

  const phase: 'idle' | 'searching' | 'debating' | 'moderating' | 'done' | 'error' =
    state.error                               ? 'error'      :
    state.session                             ? 'done'       :
    state.isModerating                        ? 'moderating' :
    state.isDebating || state.isSearching     ? 'debating'   :
    'idle';

  return {
    state,
    isGenerating,
    progressPercent,
    phase,
    startDebate,
    reset,
  };
}