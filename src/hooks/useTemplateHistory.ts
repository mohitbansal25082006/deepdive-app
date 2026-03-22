// src/hooks/useTemplateHistory.ts
// Part 30 — Template History hook
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useCallback, useRef } from 'react';
import { useAuth }                        from '../context/AuthContext';
import {
  saveTemplateSnapshot,
  loadTemplateHistory,
  deleteHistoryEntry,
  clearAllHistory,
} from '../services/templateHistoryService';
import type {
  TemplateHistoryEntry,
  TemplateHistoryState,
} from '../types/editor';

export interface UseTemplateHistoryReturn {
  historyState: TemplateHistoryState;
  /** Call BEFORE applying any template — saves current state as a snapshot */
  snapshotBeforeTemplate: (
    presentationId: string,
    slides:         any[],
    editorData:     any[],
    fontFamily:     string,
    templateId?:    string,
    templateName?:  string,
  ) => Promise<void>;
  /** Load history list from DB */
  loadHistory: (presentationId: string) => Promise<void>;
  /** Delete a single entry */
  deleteEntry: (entryId: string) => Promise<void>;
  /** Clear all history for a presentation */
  clearHistory: (presentationId: string) => Promise<void>;
}

export function useTemplateHistory(): UseTemplateHistoryReturn {
  const { user } = useAuth();

  const [historyState, setHistoryState] = useState<TemplateHistoryState>({
    entries:     [],
    isLoading:   false,
    isRestoring: false,
    error:       null,
  });

  const presentationIdRef = useRef<string | null>(null);

  // ── Snapshot before template ────────────────────────────────────────────────

  const snapshotBeforeTemplate = useCallback(async (
    presentationId: string,
    slides:         any[],
    editorData:     any[],
    fontFamily:     string,
    templateId?:    string,
    templateName?:  string,
  ) => {
    if (!user) return;

    // Save snapshot to DB (fire-and-forget — don't block the apply action)
    saveTemplateSnapshot(
      presentationId,
      user.id,
      slides,
      editorData,
      fontFamily,
      templateId,
      templateName,
    ).then(newId => {
      if (!newId) return;
      // Optimistically prepend to local list
      const newEntry: TemplateHistoryEntry = {
        id:                 newId,
        presentationId,
        userId:             user.id,
        slidesSnapshot:     slides,
        editorDataSnapshot: editorData,
        fontFamily,
        templateId,
        templateName,
        createdAt:          new Date().toISOString(),
      };
      setHistoryState(prev => ({
        ...prev,
        entries: [newEntry, ...prev.entries].slice(0, 20),
      }));
    });
  }, [user]);

  // ── Load history ────────────────────────────────────────────────────────────

  const loadHistory = useCallback(async (presentationId: string) => {
    if (!user) return;
    presentationIdRef.current = presentationId;
    setHistoryState(prev => ({ ...prev, isLoading: true, error: null }));
    try {
      const entries = await loadTemplateHistory(presentationId, user.id);
      setHistoryState(prev => ({ ...prev, entries, isLoading: false }));
    } catch (err) {
      setHistoryState(prev => ({
        ...prev,
        isLoading: false,
        error:     'Failed to load template history.',
      }));
    }
  }, [user]);

  // ── Delete entry ────────────────────────────────────────────────────────────

  const deleteEntry = useCallback(async (entryId: string) => {
    if (!user) return;
    const ok = await deleteHistoryEntry(entryId, user.id);
    if (ok) {
      setHistoryState(prev => ({
        ...prev,
        entries: prev.entries.filter(e => e.id !== entryId),
      }));
    }
  }, [user]);

  // ── Clear all ───────────────────────────────────────────────────────────────

  const clearHistory = useCallback(async (presentationId: string) => {
    if (!user) return;
    await clearAllHistory(presentationId, user.id);
    setHistoryState(prev => ({ ...prev, entries: [] }));
  }, [user]);

  return {
    historyState,
    snapshotBeforeTemplate,
    loadHistory,
    deleteEntry,
    clearHistory,
  };
}