// src/hooks/useWorkspaceChat.ts
// Part 17 — Workspace Chat hook
// Part 18 — send() accepts mentions?: string[] and forwards to sendChatMessage

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { ChatState, ChatMessage, ChatAttachment } from '../types/chat';
import {
  fetchChatMessages, sendChatMessage, editChatMessage, deleteChatMessage,
  toggleChatReaction, markMessagesRead, getChatUnreadCount,
  pinChatMessage, unpinChatMessage, getPinnedChatMessages,
  searchChatMessages, getChatMembers, subscribeToChatMessages,
} from '../services/chatService';

const INITIAL_STATE: ChatState = {
  messages: [], isLoading: true, isSending: false, isLoadingMore: false,
  hasMore: true, error: null, unreadCount: 0, typingUsers: [],
  pinnedMessages: [], chatMembers: [], replyingTo: null, editingMessage: null,
  searchQuery: '', searchResults: [], isSearching: false,
};

export function useWorkspaceChat(workspaceId: string | null) {
  const { user, profile } = useAuth();
  const [state, setState] = useState<ChatState>(INITIAL_STATE);

  const stateRef = useRef<ChatState>(INITIAL_STATE);
  useEffect(() => { stateRef.current = state; }, [state]);

  const authRef = useRef({ user, profile });
  useEffect(() => { authRef.current = { user, profile }; }, [user, profile]);

  const unsubscribeRef = useRef<(() => void) | null>(null);
  const workspaceIdRef = useRef(workspaceId);
  useEffect(() => { workspaceIdRef.current = workspaceId; }, [workspaceId]);

  // ── Load ──────────────────────────────────────────────────────────────────

  const loadMessages = useCallback(async (silent = false) => {
    const wsId = workspaceIdRef.current;
    if (!wsId) return;
    if (!silent) setState(s => ({ ...s, isLoading: true, error: null }));
    const { data, error, hasMore } = await fetchChatMessages(wsId);
    if (error) { setState(s => ({ ...s, isLoading: false, error })); return; }
    setState(s => ({ ...s, messages: data, hasMore, isLoading: false, error: null }));
    const { user: u } = authRef.current;
    if (data.length > 0 && u) {
      await markMessagesRead(wsId, data[data.length - 1].id);
      setState(s => ({ ...s, unreadCount: 0 }));
    }
  }, []);

  const loadAuxData = useCallback(async () => {
    const wsId = workspaceIdRef.current;
    if (!wsId) return;
    const [pinnedRes, membersRes, unread] = await Promise.all([
      getPinnedChatMessages(wsId), getChatMembers(wsId), getChatUnreadCount(wsId),
    ]);
    setState(s => ({ ...s, pinnedMessages: pinnedRes.data, chatMembers: membersRes.data, unreadCount: unread }));
  }, []);

  // ── Realtime ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!workspaceId) return;
    setState(INITIAL_STATE); stateRef.current = INITIAL_STATE;
    loadMessages(); loadAuxData();

    const unsub = subscribeToChatMessages(workspaceId, {
      onInsert: (msg) => {
        const { user: u } = authRef.current;
        setState(s => {
          if (s.messages.some(m => m.id === msg.id && !m.id.startsWith('temp-'))) return s;
          const tempIdx = s.messages.findIndex(m =>
            m.id.startsWith('temp-') && m.userId === msg.userId && m.content === msg.content &&
            Math.abs(new Date(m.createdAt).getTime() - new Date(msg.createdAt).getTime()) < 15_000,
          );
          if (tempIdx !== -1) { const updated = [...s.messages]; updated[tempIdx] = msg; return { ...s, messages: updated }; }
          return { ...s, messages: [...s.messages, msg] };
        });
        if (msg.userId !== u?.id && workspaceIdRef.current) markMessagesRead(workspaceIdRef.current, msg.id);
      },
      onUpdate: (partial) => {
        setState(s => ({ ...s, messages: s.messages.map(m => m.id === partial.id ? { ...m, ...partial } : m) }));
      },
      onDelete: (id) => {
        setState(s => ({ ...s, messages: s.messages.map(m => m.id === id ? { ...m, isDeleted: true, content: '[Message deleted]' } : m) }));
      },
    });

    unsubscribeRef.current = unsub;
    return () => { if (unsubscribeRef.current) { unsubscribeRef.current(); unsubscribeRef.current = null; } };
  }, [workspaceId, loadMessages, loadAuxData]);

  // ── Load more ─────────────────────────────────────────────────────────────

  const loadMore = useCallback(async () => {
    const wsId = workspaceIdRef.current; const s = stateRef.current;
    if (!wsId || s.isLoadingMore || !s.hasMore) return;
    const oldest = s.messages.find(m => !m.id.startsWith('temp-'));
    if (!oldest) return;
    setState(prev => ({ ...prev, isLoadingMore: true }));
    const { data, error, hasMore } = await fetchChatMessages(wsId, 40, oldest.id);
    setState(prev => ({ ...prev, isLoadingMore: false, hasMore, messages: error ? prev.messages : [...data, ...prev.messages], error: error ?? null }));
  }, []);

  // ── Send — Part 18: accepts and forwards mentions ─────────────────────────

  const send = useCallback(async (
    content:      string,
    replyToId?:   string,
    attachments?: ChatAttachment[],
    mentions?:    string[],          // ← Part 18
  ) => {
    const wsId = workspaceIdRef.current;
    const { user: u, profile: p } = authRef.current;
    const s = stateRef.current;
    const hasContent = content.trim().length > 0 || (attachments && attachments.length > 0);
    if (!wsId || !hasContent || s.isSending) return;

    const capturedReplyId = replyToId ?? null;
    const replyMsg = capturedReplyId ? s.messages.find(m => m.id === capturedReplyId) : undefined;
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    const optimistic: ChatMessage = {
      id: tempId, workspaceId: wsId, userId: u?.id ?? null,
      content: content.trim(),
      contentType: (attachments && attachments.length > 0 && !content.trim()) ? 'image' : 'text',
      replyToId: capturedReplyId,
      replyTo: replyMsg ? { id: replyMsg.id, content: replyMsg.content, userId: replyMsg.userId ?? '', authorName: replyMsg.author?.fullName ?? replyMsg.author?.username ?? null } : null,
      attachments:  attachments ?? [],
      mentions:     mentions ?? [],   // ← Part 18
      isEdited: false, isDeleted: false, isPinned: false, reactions: [],
      author: u ? { id: u.id, username: p?.username ?? null, fullName: p?.full_name ?? null, avatarUrl: p?.avatar_url ?? null } : null,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };

    setState(prev => ({ ...prev, isSending: true, replyingTo: null, messages: [...prev.messages, optimistic] }));

    const { data: serverMsg, error } = await sendChatMessage(
      wsId, content.trim(), 'text',
      capturedReplyId ?? undefined,
      attachments,
      mentions,         // ← Part 18: forward to service
    );

    if (error) {
      setState(prev => ({ ...prev, isSending: false, messages: prev.messages.filter(m => m.id !== tempId), error }));
      return;
    }

    setState(prev => ({ ...prev, isSending: false, error: null, messages: prev.messages.map(m => m.id === tempId ? (serverMsg ?? m) : m) }));
  }, []);

  // ── Edit ──────────────────────────────────────────────────────────────────

  const editMessage = useCallback(async (messageId: string, newContent: string) => {
    const { error } = await editChatMessage(messageId, newContent);
    if (!error) setState(s => ({ ...s, editingMessage: null, messages: s.messages.map(m => m.id === messageId ? { ...m, content: newContent, isEdited: true } : m) }));
    return { error };
  }, []);

  // ── Delete ────────────────────────────────────────────────────────────────

  const deleteMessage = useCallback(async (messageId: string) => {
    const { error } = await deleteChatMessage(messageId);
    if (!error) setState(s => ({ ...s, messages: s.messages.map(m => m.id === messageId ? { ...m, isDeleted: true, content: '[Message deleted]' } : m) }));
    return { error };
  }, []);

  // ── React ─────────────────────────────────────────────────────────────────

  const react = useCallback(async (messageId: string, emoji: string) => {
    setState(s => ({
      ...s, messages: s.messages.map(m => {
        if (m.id !== messageId) return m;
        const existing = m.reactions.find(r => r.emoji === emoji);
        if (existing) return { ...m, reactions: m.reactions.map(r => r.emoji === emoji ? { ...r, count: r.hasReacted ? r.count - 1 : r.count + 1, hasReacted: !r.hasReacted } : r).filter(r => r.count > 0) };
        return { ...m, reactions: [...m.reactions, { emoji, count: 1, hasReacted: true }] };
      }),
    }));
    await toggleChatReaction(messageId, emoji);
  }, []);

  // ── Pin / unpin ───────────────────────────────────────────────────────────

  const pin = useCallback(async (message: ChatMessage) => {
    const { error } = await pinChatMessage(message.id);
    if (!error) {
      setState(s => ({ ...s, messages: s.messages.map(m => m.id === message.id ? { ...m, isPinned: true } : m) }));
      const wsId = workspaceIdRef.current;
      if (wsId) { const { data } = await getPinnedChatMessages(wsId); setState(s => ({ ...s, pinnedMessages: data })); }
    }
    return { error };
  }, []);

  const unpin = useCallback(async (messageId: string) => {
    const { error } = await unpinChatMessage(messageId);
    if (!error) setState(s => ({ ...s, messages: s.messages.map(m => m.id === messageId ? { ...m, isPinned: false } : m), pinnedMessages: s.pinnedMessages.filter(p => p.id !== messageId) }));
    return { error };
  }, []);

  // ── Search ────────────────────────────────────────────────────────────────

  const search = useCallback(async (query: string) => {
    const wsId = workspaceIdRef.current;
    if (!wsId) return;
    setState(s => ({ ...s, searchQuery: query, isSearching: !!query.trim() }));
    if (!query.trim()) { setState(s => ({ ...s, searchResults: [], isSearching: false })); return; }
    const { data } = await searchChatMessages(wsId, query);
    setState(s => ({ ...s, searchResults: data, isSearching: false }));
  }, []);

  const clearSearch = useCallback(() => setState(s => ({ ...s, searchQuery: '', searchResults: [], isSearching: false })), []);
  const setReplyingTo     = useCallback((msg: ChatMessage | null) => setState(s => ({ ...s, replyingTo: msg })), []);
  const setEditingMessage = useCallback((msg: ChatMessage | null) => setState(s => ({ ...s, editingMessage: msg })), []);
  const refresh = useCallback(async () => { await Promise.all([loadMessages(true), loadAuxData()]); }, [loadMessages, loadAuxData]);

  return {
    ...state,
    currentUserId: user?.id ?? null,
    loadMore, send, editMessage, deleteMessage, react, pin, unpin,
    search, clearSearch, setReplyingTo, setEditingMessage, refresh,
  };
}