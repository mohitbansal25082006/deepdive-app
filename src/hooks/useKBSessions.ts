// src/hooks/useKBSessions.ts
// KB History — Session List Management Hook
//
// Handles everything related to the SESSIONS LIST panel:
//   • Fetch all sessions with last-message preview + timestamps
//   • Create a new session
//   • Rename any session
//   • Delete any session
//   • Client-side search / filter
//
// Intentionally separate from useKnowledgeBase so the sessions panel
// can be mounted independently without triggering indexing or chat logic.

import { useState, useCallback, useEffect } from 'react';
import { supabase }   from '../lib/supabase';
import { useAuth }    from '../context/AuthContext';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface KBSessionSummary {
  id:                  string;
  title:               string;
  messageCount:        number;
  lastMessagePreview:  string | null;
  lastMessageRole:     'user' | 'assistant' | null;
  updatedAt:           string;
  createdAt:           string;
}

export interface UseKBSessionsReturn {
  sessions:        KBSessionSummary[];
  filteredSessions:KBSessionSummary[];
  isLoading:       boolean;
  searchQuery:     string;
  error:           string | null;

  setSearchQuery:  (q: string) => void;
  loadSessions:    () => Promise<void>;
  createSession:   (title?: string) => Promise<string | null>;
  renameSession:   (id: string, newTitle: string) => Promise<void>;
  deleteSession:   (id: string) => Promise<void>;
}

// ─── Time formatting ─────────────────────────────────────────────────────────

export function formatRelativeTime(isoString: string): string {
  const now   = Date.now();
  const then  = new Date(isoString).getTime();
  const diffMs = now - then;
  const diffMins  = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays  = Math.floor(diffMs / 86_400_000);

  if (diffMins  < 1)   return 'Just now';
  if (diffMins  < 60)  return `${diffMins}m ago`;
  if (diffHours < 24)  return `${diffHours}h ago`;
  if (diffDays  === 1) return 'Yesterday';
  if (diffDays  < 7)   return `${diffDays}d ago`;
  if (diffDays  < 30)  return `${Math.floor(diffDays / 7)}w ago`;
  return new Date(isoString).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric',
  });
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useKBSessions(): UseKBSessionsReturn {
  const { user } = useAuth();

  const [sessions,    setSessions]    = useState<KBSessionSummary[]>([]);
  const [isLoading,   setIsLoading]   = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [error,       setError]       = useState<string | null>(null);

  // ── Load on mount ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (user) loadSessions();
  }, [user?.id]);

  // ── Load all sessions ──────────────────────────────────────────────────────

  const loadSessions = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: rpcErr } = await supabase.rpc(
        'list_kb_sessions',
        { p_user_id: user.id },
      );
      if (rpcErr) throw rpcErr;
      if (!data || !Array.isArray(data)) {
        setSessions([]);
        return;
      }
      const mapped: KBSessionSummary[] = (data as any[]).map(row => ({
        id:                 row.id                   as string,
        title:              (row.title ?? 'Untitled') as string,
        messageCount:       Number(row.message_count ?? 0),
        lastMessagePreview: (row.last_message_preview ?? null) as string | null,
        lastMessageRole:    (row.last_message_role   ?? null) as 'user' | 'assistant' | null,
        updatedAt:          row.updated_at            as string,
        createdAt:          row.created_at            as string,
      }));
      setSessions(mapped);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[KBSessions] Load error:', msg);
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  // ── Create session ─────────────────────────────────────────────────────────

  const createSession = useCallback(async (title = 'New Chat'): Promise<string | null> => {
    if (!user) return null;
    try {
      const { data, error: rpcErr } = await supabase.rpc(
        'create_kb_session',
        { p_user_id: user.id, p_title: title },
      );
      if (rpcErr || !data) return null;
      const newId = data as string;

      // Optimistic insert at top
      const newSession: KBSessionSummary = {
        id:                 newId,
        title,
        messageCount:       0,
        lastMessagePreview: null,
        lastMessageRole:    null,
        updatedAt:          new Date().toISOString(),
        createdAt:          new Date().toISOString(),
      };
      setSessions(prev => [newSession, ...prev]);
      return newId;
    } catch (err) {
      console.warn('[KBSessions] Create error:', err);
      return null;
    }
  }, [user]);

  // ── Rename session ─────────────────────────────────────────────────────────

  const renameSession = useCallback(async (id: string, newTitle: string): Promise<void> => {
    if (!user || !newTitle.trim()) return;
    const trimmed = newTitle.trim().slice(0, 80);
    // Optimistic update
    setSessions(prev =>
      prev.map(s => s.id === id ? { ...s, title: trimmed } : s),
    );
    try {
      await supabase.rpc('rename_kb_session', {
        p_session_id: id,
        p_user_id:    user.id,
        p_new_title:  trimmed,
      });
    } catch (err) {
      // Rollback optimistic update on failure
      console.warn('[KBSessions] Rename error:', err);
      await loadSessions();
    }
  }, [user, loadSessions]);

  // ── Delete session ─────────────────────────────────────────────────────────

  const deleteSession = useCallback(async (id: string): Promise<void> => {
    if (!user) return;
    // Optimistic remove
    setSessions(prev => prev.filter(s => s.id !== id));
    try {
      await supabase.rpc('delete_kb_session', {
        p_session_id: id,
        p_user_id:    user.id,
      });
    } catch (err) {
      console.warn('[KBSessions] Delete error:', err);
      await loadSessions(); // re-sync on failure
    }
  }, [user, loadSessions]);

  // ── Client-side search / filter ────────────────────────────────────────────

  const filteredSessions = searchQuery.trim()
    ? sessions.filter(s => {
        const q = searchQuery.toLowerCase();
        return (
          s.title.toLowerCase().includes(q) ||
          (s.lastMessagePreview ?? '').toLowerCase().includes(q)
        );
      })
    : sessions;

  return {
    sessions,
    filteredSessions,
    isLoading,
    searchQuery,
    error,
    setSearchQuery,
    loadSessions,
    createSession,
    renameSession,
    deleteSession,
  };
}