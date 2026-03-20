// src/hooks/useKnowledgeBase.ts
// Part 26 — Personal AI Knowledge Base Hook (UPDATED: Session History)
//
// New in this version:
//   • switchSession(id, title)   — load any session's messages
//   • createNewSession()         — create + switch to a fresh session
//   • renameCurrentSession(t)    — rename the active session
//   • activeSessionTitle         — displayed in the screen header
//   • Auto-naming                — after the first exchange GPT-4o generates
//                                  a 3–5 word title and saves it to DB
//   • setOnSessionChanged        — callback so sessions panel can refresh list

import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase }                      from '../lib/supabase';
import { useAuth }                       from '../context/AuthContext';
import { embedAndStoreReport }           from '../services/vectorStore';
import {
  runKnowledgeBaseAgent,
  generateSessionTitle,
}                                        from '../services/knowledgeBaseAgent';
import {
  KBState,
  KBMessage,
  KBStats,
  KBIndexState,
  KBIndexStatus,
  UnembeddedReport,
}                                        from '../types/knowledgeBase';
import { ResearchReport }                from '../types';

// ─── Hook Return Type ─────────────────────────────────────────────────────────

export interface UseKnowledgeBaseReturn extends KBState {
  activeSessionTitle:    string;

  sendMessage:           (text: string) => Promise<void>;
  loadHistory:           () => Promise<void>;
  refreshStats:          () => Promise<void>;
  startIndexing:         () => Promise<void>;
  clearMessages:         () => void;

  // Session history actions
  switchSession:         (sessionId: string, title: string) => Promise<void>;
  createNewSession:      () => Promise<string | null>;
  renameCurrentSession:  (newTitle: string) => Promise<void>;

  // Callback so the sessions panel can refresh after auto-naming
  setOnSessionChanged:   (cb: (() => void) | null) => void;
}

// ─── Helper: fetch full report for embedding ──────────────────────────────────

async function fetchReportForEmbedding(reportId: string): Promise<ResearchReport | null> {
  const { data, error } = await supabase
    .from('research_reports')
    .select('*')
    .eq('id', reportId)
    .single();

  if (error || !data) return null;

  return {
    id:               data.id,
    userId:           data.user_id,
    query:            data.query,
    depth:            data.depth,
    focusAreas:       data.focus_areas ?? [],
    title:            data.title ?? data.query,
    executiveSummary: data.executive_summary ?? '',
    sections:         data.sections ?? [],
    keyFindings:      data.key_findings ?? [],
    futurePredictions:data.future_predictions ?? [],
    citations:        data.citations ?? [],
    statistics:       data.statistics ?? [],
    searchQueries:    data.search_queries ?? [],
    sourcesCount:     data.sources_count ?? 0,
    reliabilityScore: data.reliability_score ?? 0,
    status:           data.status,
    agentLogs:        data.agent_logs ?? [],
    createdAt:        data.created_at,
    completedAt:      data.completed_at,
  } as ResearchReport;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useKnowledgeBase(): UseKnowledgeBaseReturn {
  const { user } = useAuth();

  // ── Core state ─────────────────────────────────────────────────────────────
  const [sessionId,           setSessionId]           = useState<string | null>(null);
  const [activeSessionTitle,  setActiveSessionTitle]  = useState<string>('Knowledge Base');
  const [messages,            setMessages]            = useState<KBMessage[]>([]);
  const [isSending,           setIsSending]           = useState(false);
  const [error,               setError]               = useState<string | null>(null);
  const [stats,               setStats]               = useState<KBStats | null>(null);
  const [isLoadingHistory,    setIsLoadingHistory]    = useState(false);
  const [indexState,          setIndexState]          = useState<KBIndexState>({
    status:       'idle',
    pendingCount: 0,
    doneCount:    0,
    currentTitle: null,
    error:        null,
  });

  const indexingRef        = useRef(false);
  const indexingStarted    = useRef(false);
  const onSessionChangedCb = useRef<(() => void) | null>(null);

  // ── On mount ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    initKB();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const initKB = async () => {
    if (!user) return;
    await Promise.all([loadOrCreateSession(), refreshStats()]);
    if (!indexingStarted.current) {
      indexingStarted.current = true;
      startIndexing();
    }
  };

  // ── Session: load or create default ────────────────────────────────────────

  const loadOrCreateSession = async () => {
    if (!user) return;
    try {
      const { data, error: rpcErr } = await supabase.rpc(
        'get_or_create_kb_session',
        { p_user_id: user.id },
      );
      if (rpcErr || !data) return;
      const sid = data as string;
      setSessionId(sid);

      // Fetch title from DB
      const { data: sessionRow } = await supabase
        .from('knowledge_base_sessions')
        .select('title')
        .eq('id', sid)
        .single();
      if (sessionRow?.title) setActiveSessionTitle(sessionRow.title);

      await loadHistoryForSession(sid);
    } catch (err) {
      console.warn('[KB] Session init error:', err);
    }
  };

  // ── switchSession ──────────────────────────────────────────────────────────

  const switchSession = useCallback(async (newSessionId: string, title: string) => {
    if (!user) return;
    setMessages([]);
    setError(null);
    setSessionId(newSessionId);
    setActiveSessionTitle(title || 'Knowledge Base');
    await loadHistoryForSession(newSessionId);
  }, [user]);

  // ── createNewSession ───────────────────────────────────────────────────────

  const createNewSession = useCallback(async (): Promise<string | null> => {
    if (!user) return null;
    try {
      const { data, error: rpcErr } = await supabase.rpc(
        'create_kb_session',
        { p_user_id: user.id, p_title: 'New Chat' },
      );
      if (rpcErr || !data) return null;
      const newId = data as string;
      setMessages([]);
      setError(null);
      setSessionId(newId);
      setActiveSessionTitle('New Chat');
      onSessionChangedCb.current?.();
      return newId;
    } catch (err) {
      console.warn('[KB] Create session error:', err);
      return null;
    }
  }, [user]);

  // ── renameCurrentSession ───────────────────────────────────────────────────

  const renameCurrentSession = useCallback(async (newTitle: string) => {
    if (!user || !sessionId || !newTitle.trim()) return;
    const trimmed = newTitle.trim().slice(0, 80);
    setActiveSessionTitle(trimmed);
    try {
      await supabase.rpc('rename_kb_session', {
        p_session_id: sessionId,
        p_user_id:    user.id,
        p_new_title:  trimmed,
      });
      onSessionChangedCb.current?.();
    } catch (err) {
      console.warn('[KB] Rename error:', err);
    }
  }, [user, sessionId]);

  // ── setOnSessionChanged ────────────────────────────────────────────────────

  const setOnSessionChanged = useCallback((cb: (() => void) | null) => {
    onSessionChangedCb.current = cb;
  }, []);

  // ── Stats ───────────────────────────────────────────────────────────────────

  const refreshStats = useCallback(async () => {
    if (!user) return;
    try {
      const { data, error: rpcErr } = await supabase.rpc('get_kb_stats', {
        p_user_id: user.id,
      });
      if (rpcErr || !data || !Array.isArray(data) || data.length === 0) return;
      const row = data[0] as {
        total_reports:   number;
        indexed_reports: number;
        total_chunks:    number;
        last_indexed_at: string | null;
      };
      const total   = Number(row.total_reports   ?? 0);
      const indexed = Number(row.indexed_reports ?? 0);
      setStats({
        totalReports:   total,
        indexedReports: indexed,
        totalChunks:    Number(row.total_chunks ?? 0),
        lastIndexedAt:  row.last_indexed_at,
        indexedPct:     total > 0 ? Math.round((indexed / total) * 100) : 0,
      });
    } catch (err) {
      console.warn('[KB] Stats error:', err);
    }
  }, [user]);

  // ── Background Indexing ─────────────────────────────────────────────────────

  const startIndexing = useCallback(async () => {
    if (!user || indexingRef.current) return;
    indexingRef.current = true;
    setIndexState(prev => ({ ...prev, status: 'checking' as KBIndexStatus }));

    try {
      const { data: pending, error: rpcErr } = await supabase.rpc(
        'get_unembedded_report_ids',
        { p_user_id: user.id, p_limit: 20 },
      );
      if (rpcErr || !pending || !Array.isArray(pending) || pending.length === 0) {
        setIndexState({ status: 'complete', pendingCount: 0, doneCount: 0, currentTitle: null, error: null });
        indexingRef.current = false;
        return;
      }

      const unembedded = pending as UnembeddedReport[];
      setIndexState({ status: 'indexing', pendingCount: unembedded.length, doneCount: 0, currentTitle: unembedded[0]?.reportTitle ?? null, error: null });

      let done = 0;
      for (const item of unembedded) {
        setIndexState(prev => ({ ...prev, currentTitle: item.reportTitle, doneCount: done }));
        try {
          const report = await fetchReportForEmbedding(item.reportId);
          if (report) await embedAndStoreReport(report, user.id);
        } catch (embedErr) {
          console.warn(`[KB] Failed to embed report ${item.reportId}:`, embedErr);
        }
        done++;
        setIndexState(prev => ({ ...prev, doneCount: done }));
      }

      setIndexState({ status: 'complete', pendingCount: unembedded.length, doneCount: done, currentTitle: null, error: null });
      await refreshStats();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[KB] Indexing error:', msg);
      setIndexState(prev => ({ ...prev, status: 'error', error: msg }));
    } finally {
      indexingRef.current = false;
    }
  }, [user, refreshStats]);

  // ── Load History for a specific session ────────────────────────────────────

  const loadHistoryForSession = async (sid: string) => {
    if (!user) return;
    setIsLoadingHistory(true);
    try {
      const { data, error: rpcErr } = await supabase.rpc(
        'get_kb_session_messages',
        { p_session_id: sid, p_user_id: user.id, p_limit: 80 },
      );
      if (rpcErr || !data || !Array.isArray(data)) return;
      const loaded: KBMessage[] = (data as any[]).map(row => ({
        id:             row.id          as string,
        sessionId:      sid,
        userId:         user.id,
        role:           row.role        as 'user' | 'assistant',
        content:        row.content     as string,
        sourceReports:  (row.source_reports as any[]) ?? [],
        totalChunks:    Number(row.total_chunks  ?? 0),
        reportsCount:   Number(row.reports_count ?? 0),
        confidence:     (row.confidence ?? 'medium') as 'high' | 'medium' | 'low',
        queryExpansion: (row.query_expansion as string[]) ?? [],
        createdAt:      row.created_at  as string,
      }));
      setMessages(loaded);
    } catch (err) {
      console.warn('[KB] History load error:', err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const loadHistory = useCallback(async () => {
    if (sessionId) await loadHistoryForSession(sessionId);
  }, [sessionId, user]);

  // ── sendMessage ─────────────────────────────────────────────────────────────

  const sendMessage = useCallback(async (text: string) => {
    if (!user || !text.trim() || isSending) return;

    let sid = sessionId;
    if (!sid) {
      try {
        const { data } = await supabase.rpc('get_or_create_kb_session', { p_user_id: user.id });
        if (data) { sid = data as string; setSessionId(sid); }
      } catch {
        setError('Could not create session. Please try again.');
        return;
      }
    }
    if (!sid) return;

    const isFirstMessage = messages.length === 0;

    setError(null);
    setIsSending(true);

    const userMsg: KBMessage = {
      id:             `local-user-${Date.now()}`,
      sessionId:      sid,
      userId:         user.id,
      role:           'user',
      content:        text.trim(),
      sourceReports:  [],
      totalChunks:    0,
      reportsCount:   0,
      confidence:     'medium',
      queryExpansion: [],
      createdAt:      new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMsg]);

    try {
      const totalReports = stats?.totalReports ?? 0;
      const history = messages.slice(-10).map(m => ({ role: m.role, content: m.content }));

      const response = await runKnowledgeBaseAgent(text.trim(), user.id, totalReports, history);

      const assistantMsg: KBMessage = {
        id:             `local-ai-${Date.now()}`,
        sessionId:      sid,
        userId:         user.id,
        role:           'assistant',
        content:        response.content,
        sourceReports:  response.sourceReports,
        totalChunks:    response.totalChunks,
        reportsCount:   response.reportsCount,
        confidence:     response.confidence,
        queryExpansion: response.queryExpansion,
        createdAt:      new Date().toISOString(),
      };
      setMessages(prev => [...prev, assistantMsg]);

      persistMessages(sid, user.id, userMsg, assistantMsg);

      // Auto-name on first message in a new/untitled session
      if (isFirstMessage && (activeSessionTitle === 'New Chat' || activeSessionTitle === 'Knowledge Base')) {
        autoNameSession(sid, text.trim());
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      setError(msg);
      setMessages(prev => [
        ...prev,
        {
          id:             `err-${Date.now()}`,
          sessionId:      sid!,
          userId:         user.id,
          role:           'assistant' as const,
          content:        `Sorry, I ran into an error: ${msg}`,
          sourceReports:  [],
          totalChunks:    0,
          reportsCount:   0,
          confidence:     'low' as const,
          queryExpansion: [],
          createdAt:      new Date().toISOString(),
        },
      ]);
    } finally {
      setIsSending(false);
    }
  }, [user, sessionId, isSending, stats, messages, activeSessionTitle]);

  // ── Auto-naming ─────────────────────────────────────────────────────────────

  const autoNameSession = async (sid: string, firstMessage: string) => {
    if (!user) return;
    try {
      const title = await generateSessionTitle(firstMessage);
      if (!title || title === 'New Chat' || title === 'Knowledge Base') return;
      setActiveSessionTitle(title);
      await supabase.rpc('rename_kb_session', {
        p_session_id: sid,
        p_user_id:    user.id,
        p_new_title:  title,
      });
      onSessionChangedCb.current?.();
    } catch (err) {
      console.warn('[KB] Auto-name error:', err);
    }
  };

  // ── persistMessages ─────────────────────────────────────────────────────────

  const persistMessages = async (
    sid:       string,
    userId:    string,
    userMsg:   KBMessage,
    assistMsg: KBMessage,
  ) => {
    try {
      const { data: authSession } = await supabase.auth.getSession();
      if (!authSession?.session) return;

      await supabase.from('knowledge_base_messages').insert([
        {
          session_id:      sid,
          user_id:         userId,
          role:            'user',
          content:         userMsg.content,
          source_reports:  [],
          total_chunks:    0,
          reports_count:   0,
          confidence:      'medium',
          query_expansion: [],
        },
        {
          session_id:      sid,
          user_id:         userId,
          role:            'assistant',
          content:         assistMsg.content,
          source_reports:  assistMsg.sourceReports,
          total_chunks:    assistMsg.totalChunks,
          reports_count:   assistMsg.reportsCount,
          confidence:      assistMsg.confidence,
          query_expansion: assistMsg.queryExpansion,
        },
      ]);

      // Sync count + timestamp
      await supabase.rpc('update_kb_session_count', {
        p_session_id: sid,
        p_user_id:    userId,
      });
    } catch (err) {
      console.warn('[KB] Persist error:', err instanceof Error ? err.message : err);
    }
  };

  // ── clearMessages ────────────────────────────────────────────────────────────

  const clearMessages = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  return {
    sessionId,
    activeSessionTitle,
    messages,
    isSending,
    error,
    stats,
    indexState,
    isLoadingHistory,
    sendMessage,
    loadHistory,
    refreshStats,
    startIndexing,
    clearMessages,
    switchSession,
    createNewSession,
    renameCurrentSession,
    setOnSessionChanged,
  };
}