// src/hooks/useWorkspaceNotifications.ts
// Part 18 — Hook for reading and updating workspace-level notification
// preferences. Used by workspace-settings.tsx and the workspace detail
// settings modal.

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getWorkspaceNotifPrefs,
  updateWorkspaceNotifPrefs,
} from '../services/workspaceNotificationService';
import { WorkspaceNotificationPreferences } from '../types';

export interface WorkspaceNotifState {
  prefs:     WorkspaceNotificationPreferences | null;
  isLoading: boolean;
  isSaving:  boolean;
  error:     string | null;
}

export function useWorkspaceNotifications(workspaceId: string | null) {
  const [state, setState] = useState<WorkspaceNotifState>({
    prefs:     null,
    isLoading: false,
    isSaving:  false,
    error:     null,
  });

  // Keep a ref to the last-known good prefs for optimistic rollback
  const prevPrefsRef = useRef<WorkspaceNotificationPreferences | null>(null);

  // ── Load ──────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    if (!workspaceId) return;
    setState(s => ({ ...s, isLoading: true, error: null }));

    const prefs = await getWorkspaceNotifPrefs(workspaceId);
    prevPrefsRef.current = prefs;
    setState(s => ({ ...s, prefs, isLoading: false }));
  }, [workspaceId]);

  useEffect(() => {
    load();
  }, [load]);

  // ── Update (optimistic) ───────────────────────────────────────────────────

  const update = useCallback(async (
    updates: Partial<Omit<WorkspaceNotificationPreferences,
      'id' | 'userId' | 'workspaceId' | 'createdAt' | 'updatedAt'>>,
  ): Promise<boolean> => {
    if (!workspaceId) return false;

    // Snapshot for rollback
    const snapshot = state.prefs;
    prevPrefsRef.current = snapshot;

    // Optimistic apply
    setState(s => ({
      ...s,
      isSaving: true,
      error: null,
      prefs: s.prefs ? { ...s.prefs, ...updates } : s.prefs,
    }));

    const { error } = await updateWorkspaceNotifPrefs(workspaceId, updates);

    if (error) {
      // Roll back to snapshot
      setState(s => ({
        ...s,
        isSaving: false,
        error,
        prefs: snapshot,
      }));
      return false;
    }

    setState(s => ({ ...s, isSaving: false }));
    return true;
  }, [workspaceId, state.prefs]);

  // ── Toggle a single boolean pref ─────────────────────────────────────────

  const toggle = useCallback(async (
    key: keyof Omit<WorkspaceNotificationPreferences,
      'id' | 'userId' | 'workspaceId' | 'createdAt' | 'updatedAt'>,
  ): Promise<boolean> => {
    if (!state.prefs) return false;
    const current = state.prefs[key] as boolean;
    return update({ [key]: !current });
  }, [state.prefs, update]);

  return {
    ...state,
    refresh: load,
    update,
    toggle,
  };
}