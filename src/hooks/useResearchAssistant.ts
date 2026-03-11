// src/hooks/useResearchAssistant.ts
// Part 6 — AI Research Assistant: Core Hook
//
// Manages the complete lifecycle of the RAG-powered assistant:
//   • Embedding lifecycle (check → embed on demand → progress tracking)
//   • Message state (optimistic UI, history persistence)
//   • Mode management (auto-detect OR user-forced)
//   • RAG context retrieval per-turn
//   • Conversation history load from Supabase
//   • Background embedding (starts immediately, chat still usable)
//
// Usage:
//   const assistant = useResearchAssistant(report);
//   assistant.sendMessage("Explain this like I'm a beginner");
//   assistant.setMode('compare');

import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase }                     from '../lib/supabase';
import { useAuth }                      from '../context/AuthContext';
import { ResearchReport, AssistantMessage, AssistantMode, AssistantState } from '../types';
import { getRAGContext, getRAGContextFast }  from '../services/ragService';
import { isReportEmbedded }                 from '../services/vectorStore';
import {
  runResearchAssistantAgent,
  detectAssistantMode,
}                                           from '../services/agents/researchAssistantAgent';

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_HISTORY_MESSAGES = 14;  // messages sent to GPT for multi-turn context
const DB_LOAD_LIMIT         = 80; // messages loaded from Supabase on mount

// ─── Hook Return Type ─────────────────────────────────────────────────────────

export interface UseResearchAssistantReturn {
  // State
  messages:       AssistantMessage[];
  isEmbedding:    boolean;
  isSending:      boolean;
  isEmbedded:     boolean;
  embedProgress:  { done: number; total: number } | null;
  activeMode:     AssistantMode;
  error:          string | null;

  // Actions
  sendMessage:    (text: string, forcedMode?: AssistantMode) => Promise<void>;
  setMode:        (mode: AssistantMode) => void;
  clearMessages:  () => void;
  retryEmbed:     () => Promise<void>;
  loadHistory:    () => Promise<void>;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useResearchAssistant(
  report: ResearchReport | null
): UseResearchAssistantReturn {

  const { user } = useAuth();

  // ── Core state ─────────────────────────────────────────────────────────────
  const [messages,      setMessages]      = useState<AssistantMessage[]>([]);
  const [isEmbedding,   setIsEmbedding]   = useState(false);
  const [isSending,     setIsSending]     = useState(false);
  const [isEmbedded,    setIsEmbedded]    = useState(false);
  const [embedProgress, setEmbedProgress] = useState<{ done: number; total: number } | null>(null);
  const [activeMode,    setActiveModeState] = useState<AssistantMode>('general');
  const [error,         setError]         = useState<string | null>(null);

  // Track whether we've already checked embedding status for this report
  const embeddingChecked = useRef(false);
  const embeddingInFlight = useRef(false);
  const currentReportId  = useRef<string | null>(null);

  // ── Reset when report changes ───────────────────────────────────────────────
  useEffect(() => {
    if (!report) return;
    if (currentReportId.current === report.id) return;

    currentReportId.current  = report.id;
    embeddingChecked.current  = false;
    embeddingInFlight.current = false;

    // Reset message state for new report
    setMessages([]);
    setError(null);
    setEmbedProgress(null);
    setIsEmbedded(false);
    setIsEmbedding(false);

    if (user) {
      // Load history and start background embedding in parallel
      loadHistory();
      checkAndEmbedInBackground();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report?.id, user?.id]);

  // ── Check embedding status on mount ────────────────────────────────────────
  const checkAndEmbedInBackground = useCallback(async () => {
    if (!report || !user)              return;
    if (embeddingChecked.current)      return;
    if (embeddingInFlight.current)     return;

    embeddingChecked.current  = true;
    embeddingInFlight.current = true;

    try {
      const alreadyDone = await isReportEmbedded(report.id, user.id);
      if (alreadyDone) {
        setIsEmbedded(true);
        embeddingInFlight.current = false;
        return;
      }

      // Not yet embedded → embed in background
      setIsEmbedding(true);
      setEmbedProgress({ done: 0, total: 0 });

      await getRAGContext('', report, user.id, {
        topK: 0, // embed-only call, no retrieval needed
        onEmbedProgress: (done, total) => {
          setEmbedProgress({ done, total });
        },
      });

      setIsEmbedded(true);
      setEmbedProgress(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[useResearchAssistant] Background embedding failed:', msg);
      // Non-fatal: fallback context will be used
      setEmbedProgress(null);
    } finally {
      setIsEmbedding(false);
      embeddingInFlight.current = false;
    }
  }, [report, user]);

  // ── Load conversation history from Supabase ─────────────────────────────────
  const loadHistory = useCallback(async () => {
    if (!report || !user) return;

    try {
      const { data, error: dbErr } = await supabase.rpc('get_assistant_conversation', {
        p_report_id: report.id,
        p_user_id:   user.id,
        p_limit:     DB_LOAD_LIMIT,
      });

      if (dbErr) {
        // RPC might not exist if schema migration hasn't been run yet — silent fail
        console.warn('[useResearchAssistant] History load error:', dbErr.message);
        return;
      }

      if (!data || !Array.isArray(data) || data.length === 0) return;

      const loaded: AssistantMessage[] = (data as any[]).map(row => ({
        id:                 row.id          as string,
        reportId:           report.id,
        userId:             user.id,
        role:               row.role        as 'user' | 'assistant',
        content:            row.content     as string,
        mode:               (row.mode       as AssistantMode) ?? 'general',
        retrievedChunks:    row.retrieved_chunks     ?? [],
        suggestedFollowUps: row.suggested_follow_ups ?? [],
        isRAGPowered:       row.is_rag_powered       ?? false,
        confidence:         row.confidence           ?? 'medium',
        createdAt:          row.created_at  as string,
      }));

      setMessages(loaded);
    } catch (err) {
      console.warn('[useResearchAssistant] History load failed:', err);
    }
  }, [report, user]);

  // ── setMode ─────────────────────────────────────────────────────────────────
  const setMode = useCallback((mode: AssistantMode) => {
    setActiveModeState(mode);
  }, []);

  // ── sendMessage ─────────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (
    text:       string,
    forcedMode?: AssistantMode,
  ) => {
    if (!report || !user || !text.trim() || isSending) return;

    setError(null);

    const detectedMode = detectAssistantMode(text.trim());
    const appliedMode  = forcedMode ?? activeMode ?? detectedMode;

    // ── 1. Optimistic user message ────────────────────────────────────────────
    const userMsg: AssistantMessage = {
      id:        `local-user-${Date.now()}`,
      reportId:  report.id,
      userId:    user.id,
      role:      'user',
      content:   text.trim(),
      mode:      appliedMode,
      createdAt: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMsg]);
    setIsSending(true);

    try {
      // ── 2. Get RAG context ──────────────────────────────────────────────────
      // First message: use fast fallback while embedding is in-flight.
      // Subsequent messages: use vector search (embedding should be done by now).
      let ragContext;
      if (!isEmbedded && isEmbedding) {
        // Embedding still running — use keyword fallback for this message
        ragContext = getRAGContextFast(text.trim(), report);
      } else {
        try {
          ragContext = await getRAGContext(text.trim(), report, user.id, {
            topK:      6,
            threshold: 0.28,
            onEmbedProgress: (done, total) => {
              if (!isEmbedded) setEmbedProgress({ done, total });
            },
          });
          if (!isEmbedded && ragContext.isEmbedded) {
            setIsEmbedded(true);
            setEmbedProgress(null);
          }
        } catch {
          // Fallback gracefully
          ragContext = getRAGContextFast(text.trim(), report);
        }
      }

      // ── 3. Build conversation history for multi-turn context ────────────────
      const recentHistory = messages
        .slice(-MAX_HISTORY_MESSAGES)
        .map(m => ({
          id:        m.id,
          reportId:  m.reportId,
          userId:    m.userId,
          role:      m.role,
          content:   m.content,
          mode:      m.mode ?? 'general',
          createdAt: m.createdAt,
        }));

      // ── 4. Run the agent ────────────────────────────────────────────────────
      const response = await runResearchAssistantAgent(
        text.trim(),
        report,
        recentHistory,
        ragContext,
        appliedMode !== 'general' ? appliedMode : undefined,
      );

      // ── 5. Build assistant message ──────────────────────────────────────────
      const assistantMsg: AssistantMessage = {
        id:        `local-ai-${Date.now()}`,
        reportId:  report.id,
        userId:    user.id,
        role:      'assistant',
        content:   response.content,
        mode:      response.appliedMode,
        retrievedChunks: ragContext.chunks.map(c => ({
          chunkId:    c.chunkId,
          chunkType:  c.chunkType,
          similarity: c.similarity,
        })),
        suggestedFollowUps: response.suggestedFollowUps,
        isRAGPowered: response.usedRAG,
        confidence:   response.confidence,
        createdAt:    new Date().toISOString(),
      };

      setMessages(prev => [...prev, assistantMsg]);

      // ── 6. Persist both messages to Supabase (non-blocking) ────────────────
      persistMessages(
        report.id,
        user.id,
        userMsg,
        assistantMsg,
      );

    } catch (err) {
      const errorText = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      setError(errorText);

      setMessages(prev => [
        ...prev,
        {
          id:        `err-${Date.now()}`,
          reportId:  report.id,
          userId:    user.id,
          role:      'assistant' as const,
          content:   `Sorry, I encountered an error: ${errorText}`,
          mode:      appliedMode,
          confidence: 'low' as const,
          createdAt: new Date().toISOString(),
        },
      ]);
    } finally {
      setIsSending(false);
    }
  }, [report, user, isSending, isEmbedded, isEmbedding, activeMode, messages]);

  // ── persistMessages ─────────────────────────────────────────────────────────
  // Non-blocking — runs in the background, errors are swallowed with a warning
  const persistMessages = async (
    reportId:  string,
    userId:    string,
    userMsg:   AssistantMessage,
    assistMsg: AssistantMessage,
  ) => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session) return;

      // Insert user message
      await supabase.from('assistant_conversations').insert({
        report_id:           reportId,
        user_id:             userId,
        role:                'user',
        content:             userMsg.content,
        mode:                userMsg.mode,
        retrieved_chunks:    [],
        suggested_follow_ups: [],
        is_rag_powered:      false,
        confidence:          'medium',
      });

      // Insert assistant message
      await supabase.from('assistant_conversations').insert({
        report_id:           reportId,
        user_id:             userId,
        role:                'assistant',
        content:             assistMsg.content,
        mode:                assistMsg.mode,
        retrieved_chunks:    assistMsg.retrievedChunks ?? [],
        suggested_follow_ups: assistMsg.suggestedFollowUps ?? [],
        is_rag_powered:      assistMsg.isRAGPowered ?? false,
        confidence:          assistMsg.confidence ?? 'medium',
      });
    } catch (err) {
      console.warn('[useResearchAssistant] Persist error:', err instanceof Error ? err.message : String(err));
    }
  };

  // ── retryEmbed ──────────────────────────────────────────────────────────────
  const retryEmbed = useCallback(async () => {
    if (!report || !user || isEmbedding) return;

    embeddingChecked.current  = false;
    embeddingInFlight.current = false;
    setIsEmbedded(false);
    setError(null);
    await checkAndEmbedInBackground();
  }, [report, user, isEmbedding, checkAndEmbedInBackground]);

  // ── clearMessages ───────────────────────────────────────────────────────────
  const clearMessages = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  return {
    messages,
    isEmbedding,
    isSending,
    isEmbedded,
    embedProgress,
    activeMode,
    error,
    sendMessage,
    setMode,
    clearMessages,
    retryEmbed,
    loadHistory,
  };
}