// src/hooks/useWorkspaceAIChat.ts
// Part 50.6 — Personal AI chat state for the per-member "Ask DeepDive AI" screen
//
// Conversation is PRIVATE: persisted to AsyncStorage keyed by workspace + user,
// never sent to Stream and never visible to other members. Each send passes the
// last few turns to the edge function so follow-up questions keep context.

import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  askWorkspaceAI,
  AIAssistantSource,
} from '../services/aiAssistantService';

export interface AIChatMessage {
  id:           string;
  role:         'user' | 'assistant';
  content:      string;
  sources?:     AIAssistantSource[];
  reportCount?: number;
  mode?:        string;
  status:       'sending' | 'done' | 'error';
  createdAt:    string;
}

const HISTORY_TURNS = 6;
const MAX_STORED    = 120;

const storageKey = (workspaceId: string, userId: string) =>
  `deepdive_ws_ai_chat:${workspaceId}:${userId}`;

function stripMeta(content: string): string {
  return content.replace(/^\*\([^)]*\)\*\s*/, '').trim();
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export function useWorkspaceAIChat(workspaceId: string, userId: string) {
  const [messages, setMessages] = useState<AIChatMessage[]>([]);
  const [sending,  setSending]  = useState(false);
  const [loaded,   setLoaded]   = useState(false);

  const messagesRef = useRef<AIChatMessage[]>([]);
  messagesRef.current = messages;

  const key = storageKey(workspaceId, userId);

  // ── Load persisted conversation ─────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(key);
        if (!cancelled && raw) {
          const parsed = JSON.parse(raw) as AIChatMessage[];
          // Drop any placeholder that got stuck mid-send before the app closed.
          const cleaned = Array.isArray(parsed)
            ? parsed.filter((m) => m.status !== 'sending')
            : [];
          setMessages(cleaned);
        }
      } catch { /* non-fatal */ }
      if (!cancelled) setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [key]);

  const persist = useCallback((msgs: AIChatMessage[]) => {
    AsyncStorage.setItem(key, JSON.stringify(msgs.slice(-MAX_STORED))).catch(() => {});
  }, [key]);

  // ── Core dispatch: call the edge function, replace the placeholder ──────────
  const dispatch = useCallback(async (
    query:         string,
    baseMessages:  AIChatMessage[],
    placeholderId: string,
  ) => {
    setSending(true);

    const history = baseMessages
      .filter((m) => m.status !== 'sending' && m.content.trim())
      .slice(-HISTORY_TURNS)
      .map((m) => ({ role: m.role, content: stripMeta(m.content) }));

    const replacePlaceholder = (answer: AIChatMessage) => {
      const updated = messagesRef.current.map((m) => (m.id === placeholderId ? answer : m));
      messagesRef.current = updated;
      setMessages(updated);
      persist(updated);
    };

    try {
      const res = await askWorkspaceAI({ workspaceId, query, history });
      replacePlaceholder({
        id:          placeholderId,
        role:        'assistant',
        content:     res.answer,
        sources:     res.sources,
        reportCount: res.reportCount,
        mode:        res.mode,
        status:      res.error ? 'error' : 'done',
        createdAt:   new Date().toISOString(),
      });
    } catch {
      replacePlaceholder({
        id:        placeholderId,
        role:      'assistant',
        content:   'I couldn’t reach the assistant. Check your connection and try again.',
        status:    'error',
        createdAt: new Date().toISOString(),
      });
    } finally {
      setSending(false);
    }
  }, [workspaceId, persist]);

  // ── Send a new question ─────────────────────────────────────────────────────
  const send = useCallback((text: string) => {
    const query = text.trim();
    if (!query || sending) return;

    const userMsg: AIChatMessage = {
      id:        newId('u'),
      role:      'user',
      content:   query,
      status:    'done',
      createdAt: new Date().toISOString(),
    };
    const placeholder: AIChatMessage = {
      id:        newId('a'),
      role:      'assistant',
      content:   '',
      status:    'sending',
      createdAt: new Date().toISOString(),
    };

    const base = messagesRef.current;
    const next = [...base, userMsg, placeholder];
    messagesRef.current = next;
    setMessages(next);

    // history excludes the user message we just added
    dispatch(query, base, placeholder.id);
  }, [sending, dispatch]);

  // ── Retry the last failed question ──────────────────────────────────────────
  const retryLast = useCallback(() => {
    const cur = messagesRef.current;
    if (cur.length < 2) return;

    const last = cur[cur.length - 1];
    if (last.role !== 'assistant' || last.status !== 'error') return;

    // Find the user message that preceded the failed answer.
    let userIdx = cur.length - 2;
    while (userIdx >= 0 && cur[userIdx].role !== 'user') userIdx--;
    if (userIdx < 0) return;

    const query = cur[userIdx].content;

    // Reset the error bubble back to a sending placeholder.
    const reset = cur.map((m) =>
      m.id === last.id
        ? { ...m, content: '', status: 'sending' as const, sources: undefined }
        : m,
    );
    messagesRef.current = reset;
    setMessages(reset);

    // history = everything before that user message
    dispatch(query, cur.slice(0, userIdx), last.id);
  }, [dispatch]);

  // ── Clear the whole personal conversation ───────────────────────────────────
  const clear = useCallback(() => {
    messagesRef.current = [];
    setMessages([]);
    AsyncStorage.removeItem(key).catch(() => {});
  }, [key]);

  return { messages, sending, loaded, send, retryLast, clear };
}