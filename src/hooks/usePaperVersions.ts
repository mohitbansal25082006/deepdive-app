// src/hooks/usePaperVersions.ts
// Part 38 — Manages paper version history: list, restore, rename, delete
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useCallback, useEffect } from 'react';
import { Alert } from 'react-native';
import {
  getPaperVersions,
  restorePaperVersion,
} from '../services/paperEditorService';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import type { PaperVersion } from '../types/paperEditor';
import type { AcademicSection } from '../types';

interface UsePaperVersionsReturn {
  versions:         PaperVersion[];
  isLoading:        boolean;
  isRestoring:      boolean;
  load:             (paperId: string) => Promise<void>;
  restore:          (versionId: string) => Promise<{ sections: AcademicSection[]; abstract: string; wordCount: number } | null>;
  rename:           (versionId: string, newLabel: string) => Promise<boolean>;
  deleteVersion:    (versionId: string) => Promise<boolean>;
}

export function usePaperVersions(paperId: string | null): UsePaperVersionsReturn {
  const { user } = useAuth();

  const [versions,    setVersions]    = useState<PaperVersion[]>([]);
  const [isLoading,   setIsLoading]   = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  const load = useCallback(async (pid: string) => {
    if (!pid) return;
    setIsLoading(true);
    try {
      const data = await getPaperVersions(pid);
      setVersions(data);
    } catch (err) {
      console.warn('[usePaperVersions] load error:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Auto-load when paperId changes
  useEffect(() => {
    if (paperId) load(paperId);
  }, [paperId]);

  const restore = useCallback(async (
    versionId: string,
  ): Promise<{ sections: AcademicSection[]; abstract: string; wordCount: number } | null> => {
    if (!user) return null;
    setIsRestoring(true);
    try {
      const result = await restorePaperVersion(versionId, user.id);
      if (result) {
        // Reload version list after restore (a new "Before Restore" snapshot
        // may have been created by the caller before calling this)
        if (paperId) setTimeout(() => load(paperId), 500);
      }
      return result;
    } catch (err) {
      Alert.alert('Restore Failed', 'Could not restore this version. Please try again.');
      console.error('[usePaperVersions] restore error:', err);
      return null;
    } finally {
      setIsRestoring(false);
    }
  }, [user, paperId, load]);

  // ─── Rename a version label ────────────────────────────────────────────────
  const rename = useCallback(async (
    versionId: string,
    newLabel:  string,
  ): Promise<boolean> => {
    if (!user || !newLabel.trim()) return false;
    try {
      const { error } = await supabase
        .from('paper_versions')
        .update({ version_label: newLabel.trim() })
        .eq('id', versionId)
        .eq('user_id', user.id);

      if (error) {
        console.warn('[usePaperVersions] rename error:', error.message);
        return false;
      }

      // Update local state immediately — no reload needed
      setVersions(prev =>
        prev.map(v =>
          v.id === versionId ? { ...v, versionLabel: newLabel.trim() } : v
        )
      );
      return true;
    } catch (err) {
      console.error('[usePaperVersions] rename exception:', err);
      return false;
    }
  }, [user]);

  // ─── Delete a version ─────────────────────────────────────────────────────
  const deleteVersion = useCallback(async (
    versionId: string,
  ): Promise<boolean> => {
    if (!user) return false;
    try {
      const { error } = await supabase
        .from('paper_versions')
        .delete()
        .eq('id', versionId)
        .eq('user_id', user.id);

      if (error) {
        console.warn('[usePaperVersions] delete error:', error.message);
        return false;
      }

      // Remove from local state immediately
      setVersions(prev => prev.filter(v => v.id !== versionId));
      return true;
    } catch (err) {
      console.error('[usePaperVersions] delete exception:', err);
      return false;
    }
  }, [user]);

  return {
    versions,
    isLoading,
    isRestoring,
    load,
    restore,
    rename,
    deleteVersion,
  };
}