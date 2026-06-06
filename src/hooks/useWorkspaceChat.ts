// src/hooks/useWorkspaceChat.ts
// Part 17 — Workspace Chat hook
// Part 18 — send() accepts mentions?: string[]
// Part 47 — Full realtime via useChatRealtime
// Part 48 — Broadcast-based real-time fix
// Part 48-FINAL — FIX for messages disappearing on back+return:
//
//   ROOT CAUSE:
//   workspace-chat.tsx is pushed onto the navigation stack. When the user
//   navigates away (back to workspace-detail), the screen UNMOUNTS completely.
//   useWorkspaceChat resets to INITIAL_STATE (messages:[], isLoading:true).
//   When the user comes back, the screen remounts fresh — loadMessages() fires
//   again from scratch, causing:
//     1. A visible flash of "Loading messages…" spinner
//     2. A brief empty list before data arrives
//     3. Sometimes messages appearing in wrong order (optimistic temp messages
//        from before unmount are gone, but postgres_changes may re-deliver them)
//
//   FIX: Module-level message cache (Map<workspaceId, CachedChatState>).
//   On mount, if the cache has messages for this workspace, we render them
//   immediately (isLoading:false, real messages shown instantly) and then
//   silently refresh in the background to pick up any messages received while
//   the screen was unmounted.
//   On unmount, the current messages are saved to the cache.
//   Cache entries expire after 5 minutes to avoid stale data.
//
//   This means:
//     - First open: normal loading spinner (cache is empty)
//     - Back+return: instant message display, silent background refresh
//     - After 5 min away: normal reload (cache expired, treated as fresh open)

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { ChatState, ChatMessage, ChatAttachment } from '../types/chat';
import {
  fetchChatMessages, sendChatMessage, editChatMessage, deleteChatMessage,
  toggleChatReaction, markMessagesRead, getChatUnreadCount,
  pinChatMessage, unpinChatMessage, getPinnedChatMessages,
  searchChatMessages, getChatMembers, getMessageReactions,
} from '../services/chatService';
import {
  useChatRealtime,
  broadcastChatMessage,
  broadcastChatUpdate,
  broadcastChatDelete,
  broadcastChatReaction,
  broadcastChatPin,
} from './useChatRealtime';

// ─── Module-level message cache ───────────────────────────────────────────────
// Persists between screen unmount/remount so messages don't flash empty on back.

interface CachedChatState {
  messages:       ChatMessage[];
  pinnedMessages: any[];
  chatMembers:    any[];
  hasMore:        boolean;
  cachedAt:       number; // timestamp
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const chatStateCache = new Map<string, CachedChatState>();

function getCachedState(workspaceId: string): CachedChatState | null {
  const entry = chatStateCache.get(workspaceId);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
    chatStateCache.delete(workspaceId);
    return null;
  }
  return entry;
}

function setCachedState(workspaceId: string, state: CachedChatState): void {
  chatStateCache.set(workspaceId, state);
}

// ─── Initial state builder ────────────────────────────────────────────────────

function buildInitialState(cached: CachedChatState | null): ChatState {
  if (cached) {
    // Use cached messages — no loading spinner, instant display
    return {
      messages:             cached.messages,
      isLoading:            false,   // ← key: don't show spinner on back+return
      isSending:            false,
      isLoadingMore:        false,
      hasMore:              cached.hasMore,
      error:                null,
      unreadCount:          0,
      typingUsers:          [],
      pinnedMessages:       cached.pinnedMessages,
      chatMembers:          cached.chatMembers,
      replyingTo:           null,
      editingMessage:       null,
      searchQuery:          '',
      searchResults:        [],
      isSearching:          false,
      highlightedMessageId: null,
    };
  }
  return {
    messages:             [],
    isLoading:            true,
    isSending:            false,
    isLoadingMore:        false,
    hasMore:              true,
    error:                null,
    unreadCount:          0,
    typingUsers:          [],
    pinnedMessages:       [],
    chatMembers:          [],
    replyingTo:           null,
    editingMessage:       null,
    searchQuery:          '',
    searchResults:        [],
    isSearching:          false,
    highlightedMessageId: null,
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useWorkspaceChat(workspaceId: string | null) {
  const { user, profile } = useAuth();

  // On first render, seed from cache if available so there's no empty flash
  const [state, setState] = useState<ChatState>(() => {
    const cached = workspaceId ? getCachedState(workspaceId) : null;
    return buildInitialState(cached);
  });

  const stateRef = useRef<ChatState>(state);
  useEffect(() => { stateRef.current = state; }, [state]);

  const authRef = useRef({ user, profile });
  useEffect(() => { authRef.current = { user, profile }; }, [user, profile]);

  const workspaceIdRef = useRef(workspaceId);
  useEffect(() => { workspaceIdRef.current = workspaceId; }, [workspaceId]);

  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Realtime subscriptions ────────────────────────────────────────────────

  useChatRealtime(workspaceId, {

    // onCatchUp fires 1.5s after SUBSCRIBED to fetch messages missed in the
    // replication initialization window (~1-3s known supabase-js race condition)
    onCatchUp: () => {
      const wsId = workspaceIdRef.current;
      if (!wsId) return;
      // Silent fetch — merges new messages without showing loading spinner
      fetchChatMessages(wsId).then(({ data }) => {
        if (!data || data.length === 0) return;
        setState(s => {
          // Merge: keep existing messages, add any new ones not already present
          const existingIds = new Set(s.messages.map(m => m.id));
          const newMsgs = data.filter(m => !existingIds.has(m.id));
          if (newMsgs.length === 0) return s;
          // Insert new messages in chronological order
          const merged = [...s.messages, ...newMsgs].sort(
            (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );
          return { ...s, messages: merged };
        });
      }).catch(() => {});
    },

    onMessageInsert: (msg) => {
      const { user: u } = authRef.current;
      setState(s => {
        if (s.messages.some(m => m.id === msg.id && !m.id.startsWith('temp-'))) return s;

        const tempIdx = s.messages.findIndex(m =>
          m.id.startsWith('temp-') &&
          m.userId   === msg.userId &&
          m.content  === msg.content &&
          Math.abs(
            new Date(m.createdAt).getTime() - new Date(msg.createdAt).getTime()
          ) < 15_000,
        );
        if (tempIdx !== -1) {
          const updated = [...s.messages];
          updated[tempIdx] = msg;
          return { ...s, messages: updated };
        }

        return { ...s, messages: [...s.messages, msg] };
      });

      if (msg.userId !== u?.id && workspaceIdRef.current) {
        markMessagesRead(workspaceIdRef.current, msg.id).catch(() => {});
      }
    },

    onMessageUpdate: (partial) => {
      setState(s => ({
        ...s,
        messages: s.messages.map(m =>
          m.id === partial.id ? { ...m, ...partial } : m
        ),
      }));
    },

    onMessageDelete: (id) => {
      setState(s => ({
        ...s,
        messages: s.messages.map(m =>
          m.id === id ? { ...m, isDeleted: true, content: '[Message deleted]' } : m
        ),
      }));
    },

    onReactionChange: (messageId, reactions) => {
      setState(s => {
        if (!s.messages.some(m => m.id === messageId)) return s;
        return {
          ...s,
          messages: s.messages.map(m =>
            m.id === messageId ? { ...m, reactions } : m
          ),
        };
      });
    },

    onPinChange: (messageId, isPinned) => {
      setState(s => ({
        ...s,
        messages: s.messages.map(m =>
          m.id === messageId ? { ...m, isPinned } : m
        ),
        pinnedMessages: isPinned
          ? s.pinnedMessages
          : s.pinnedMessages.filter(p => p.id !== messageId),
      }));

      const wsId = workspaceIdRef.current;
      if (wsId) {
        getPinnedChatMessages(wsId).then(({ data }) => {
          setState(s => ({ ...s, pinnedMessages: data }));
        }).catch(() => {});
      }
    },
  });

  // ── Load helpers ──────────────────────────────────────────────────────────

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
      getPinnedChatMessages(wsId),
      getChatMembers(wsId),
      getChatUnreadCount(wsId),
    ]);
    setState(s => ({
      ...s,
      pinnedMessages: pinnedRes.data,
      chatMembers:    membersRes.data,
      unreadCount:    unread,
    }));
  }, []);

  // ── Mount: use cache if available, then silently refresh ──────────────────

  useEffect(() => {
    if (!workspaceId) return;

    const cached = getCachedState(workspaceId);

    if (cached) {
      // Cache hit: messages already shown via buildInitialState.
      // Silent background refresh: fetch latest and MERGE (not replace) so
      // messages received while screen was unmounted are added, not lost.
      setState(buildInitialState(cached));
      fetchChatMessages(workspaceId).then(({ data }) => {
        if (!data) return;
        setState(s => {
          const existingIds = new Set(s.messages.map(m => m.id));
          // Replace existing real messages with fresh server versions (catches edits/deletes)
          // and add any new messages not yet in state
          const updatedMessages = s.messages
            .filter(m => m.id.startsWith('temp-')) // keep pending temp messages
            .concat(
              data.map(serverMsg => {
                // If we have a temp version of this message, replace it
                return serverMsg;
              })
            );
          // Sort chronologically
          const sorted = updatedMessages.sort(
            (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );
          return { ...s, messages: sorted, isLoading: false };
        });
      }).catch(() => {});
      loadAuxData();
    } else {
      // Cache miss: fresh load with spinner
      setState(buildInitialState(null));
      stateRef.current = buildInitialState(null);
      loadMessages();
      loadAuxData();
    }
  }, [workspaceId, loadMessages, loadAuxData]);

  // ── Unmount: save current messages to cache ───────────────────────────────

  useEffect(() => {
    return () => {
      const wsId = workspaceIdRef.current;
      const s    = stateRef.current;
      if (wsId && s.messages.length > 0 && !s.error) {
        // Filter out temp/optimistic messages before caching
        const realMessages = s.messages.filter(m => !m.id.startsWith('temp-'));
        setCachedState(wsId, {
          messages:       realMessages,
          pinnedMessages: s.pinnedMessages,
          chatMembers:    s.chatMembers,
          hasMore:        s.hasMore,
          cachedAt:       Date.now(),
        });
      }
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    };
  }, []);

  // ── Load more ─────────────────────────────────────────────────────────────

  const loadMore = useCallback(async () => {
    const wsId = workspaceIdRef.current;
    const s    = stateRef.current;
    if (!wsId || s.isLoadingMore || !s.hasMore) return;
    const oldest = s.messages.find(m => !m.id.startsWith('temp-'));
    if (!oldest) return;

    setState(prev => ({ ...prev, isLoadingMore: true }));
    const { data, error, hasMore } = await fetchChatMessages(wsId, 40, oldest.id);
    setState(prev => ({
      ...prev,
      isLoadingMore: false,
      hasMore,
      messages: error ? prev.messages : [...data, ...prev.messages],
      error:    error ?? null,
    }));
  }, []);

  // ── Send ──────────────────────────────────────────────────────────────────

  const send = useCallback(async (
    content:      string,
    replyToId?:   string,
    attachments?: ChatAttachment[],
    mentions?:    string[],
  ) => {
    const wsId = workspaceIdRef.current;
    const { user: u, profile: p } = authRef.current;
    const s = stateRef.current;
    const hasContent = content.trim().length > 0 || !!(attachments?.length);
    if (!wsId || !hasContent || s.isSending) return;

    const capturedReplyId = replyToId ?? null;
    const replyMsg = capturedReplyId ? s.messages.find(m => m.id === capturedReplyId) : undefined;
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    let replyPreview = null;
    if (replyMsg) {
      replyPreview = {
        id:          replyMsg.id,
        content:     replyMsg.content,
        userId:      replyMsg.userId ?? '',
        authorName:  replyMsg.author?.fullName ?? replyMsg.author?.username ?? null,
        attachments: replyMsg.attachments ?? [],
      };
    }

    const optimistic: ChatMessage = {
      id:           tempId,
      workspaceId:  wsId,
      userId:       u?.id ?? null,
      content:      content.trim(),
      contentType:  attachments?.length && !content.trim() ? 'image' : 'text',
      replyToId:    capturedReplyId,
      replyTo:      replyPreview as any,
      attachments:  attachments ?? [],
      mentions:     mentions    ?? [],
      isEdited:  false,
      isDeleted: false,
      isPinned:  false,
      reactions: [],
      author: u ? {
        id:        u.id,
        username:  p?.username   ?? null,
        fullName:  p?.full_name  ?? null,
        avatarUrl: p?.avatar_url ?? null,
      } : null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setState(prev => ({
      ...prev,
      isSending:  true,
      replyingTo: null,
      messages:   [...prev.messages, optimistic],
    }));

    const { data: serverMsg, error } = await sendChatMessage(
      wsId, content.trim(), 'text',
      capturedReplyId ?? undefined,
      attachments,
      mentions,
    );

    if (error) {
      setState(prev => ({
        ...prev,
        isSending: false,
        messages:  prev.messages.filter(m => m.id !== tempId),
        error,
      }));
      return;
    }

    const finalMsg = serverMsg ?? optimistic;

    setState(prev => ({
      ...prev,
      isSending: false,
      error:     null,
      messages:  prev.messages.map(m => m.id === tempId ? finalMsg : m),
    }));

    if (serverMsg) {
      broadcastChatMessage(wsId, serverMsg).catch(() => {});
    }
  }, []);

  // ── Edit ──────────────────────────────────────────────────────────────────

  const editMessage = useCallback(async (messageId: string, newContent: string) => {
    const wsId = workspaceIdRef.current;
    const { error } = await editChatMessage(messageId, newContent);
    if (!error) {
      setState(s => ({
        ...s,
        editingMessage: null,
        messages: s.messages.map(m =>
          m.id === messageId ? { ...m, content: newContent, isEdited: true } : m
        ),
      }));
      if (wsId) {
        broadcastChatUpdate(wsId, {
          id:        messageId,
          content:   newContent,
          isEdited:  true,
          isDeleted: false,
          updatedAt: new Date().toISOString(),
        }).catch(() => {});
      }
    }
    return { error };
  }, []);

  // ── Delete ────────────────────────────────────────────────────────────────

  const deleteMessage = useCallback(async (messageId: string) => {
    const wsId = workspaceIdRef.current;
    const { error } = await deleteChatMessage(messageId);
    if (!error) {
      setState(s => ({
        ...s,
        messages: s.messages.map(m =>
          m.id === messageId ? { ...m, isDeleted: true, content: '[Message deleted]' } : m
        ),
      }));
      if (wsId) {
        broadcastChatDelete(wsId, messageId).catch(() => {});
        broadcastChatUpdate(wsId, {
          id:        messageId,
          content:   '[Message deleted]',
          isEdited:  false,
          isDeleted: true,
          updatedAt: new Date().toISOString(),
        }).catch(() => {});
      }
    }
    return { error };
  }, []);

  // ── React ─────────────────────────────────────────────────────────────────

  const react = useCallback(async (messageId: string, emoji: string) => {
    const wsId = workspaceIdRef.current;

    setState(s => ({
      ...s,
      messages: s.messages.map(m => {
        if (m.id !== messageId) return m;
        const existing = m.reactions.find(r => r.emoji === emoji);
        if (existing) {
          return {
            ...m,
            reactions: m.reactions
              .map(r => r.emoji === emoji
                ? { ...r, count: r.hasReacted ? r.count - 1 : r.count + 1, hasReacted: !r.hasReacted }
                : r
              )
              .filter(r => r.count > 0),
          };
        }
        return { ...m, reactions: [...m.reactions, { emoji, count: 1, hasReacted: true }] };
      }),
    }));

    await toggleChatReaction(messageId, emoji);

    if (wsId) {
      try {
        const { data: freshReactions } = await getMessageReactions(messageId);
        setState(s => ({
          ...s,
          messages: s.messages.map(m =>
            m.id === messageId ? { ...m, reactions: freshReactions } : m
          ),
        }));
        broadcastChatReaction(wsId, messageId, freshReactions).catch(() => {});
      } catch { /* non-fatal */ }
    }
  }, []);

  // ── Pin ───────────────────────────────────────────────────────────────────

  const pin = useCallback(async (message: ChatMessage) => {
    const wsId = workspaceIdRef.current;
    const { error } = await pinChatMessage(message.id);
    if (!error) {
      setState(s => ({
        ...s,
        messages: s.messages.map(m => m.id === message.id ? { ...m, isPinned: true } : m),
      }));
      if (wsId) {
        broadcastChatPin(wsId, message.id, true).catch(() => {});
        getPinnedChatMessages(wsId).then(({ data }) => {
          setState(s => ({ ...s, pinnedMessages: data }));
        }).catch(() => {});
      }
    }
    return { error };
  }, []);

  // ── Unpin ─────────────────────────────────────────────────────────────────

  const unpin = useCallback(async (messageId: string) => {
    const wsId = workspaceIdRef.current;
    const { error } = await unpinChatMessage(messageId);
    if (!error) {
      setState(s => ({
        ...s,
        messages:       s.messages.map(m => m.id === messageId ? { ...m, isPinned: false } : m),
        pinnedMessages: s.pinnedMessages.filter(p => p.id !== messageId),
      }));
      if (wsId) {
        broadcastChatPin(wsId, messageId, false).catch(() => {});
      }
    }
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

  const clearSearch = useCallback(() => {
    setState(s => ({ ...s, searchQuery: '', searchResults: [], isSearching: false }));
  }, []);

  // ── Highlight ─────────────────────────────────────────────────────────────

  const highlightMessage = useCallback((messageId: string) => {
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    setState(s => ({ ...s, highlightedMessageId: messageId }));
    highlightTimerRef.current = setTimeout(() => {
      setState(s => ({ ...s, highlightedMessageId: null }));
    }, 2500);
  }, []);

  // ── Setters ───────────────────────────────────────────────────────────────

  const setReplyingTo     = useCallback((msg: ChatMessage | null) => setState(s => ({ ...s, replyingTo: msg })),     []);
  const setEditingMessage = useCallback((msg: ChatMessage | null) => setState(s => ({ ...s, editingMessage: msg })), []);
  const refresh           = useCallback(async () => { await Promise.all([loadMessages(true), loadAuxData()]); }, [loadMessages, loadAuxData]);

  // clearUnread: marks the last real message as read in DB and resets badge to 0.
  // Called from workspace-chat.tsx after scrollToEnd so the badge disappears
  // when the user has visually seen all messages.
  const clearUnread = useCallback(() => {
    const wsId = workspaceIdRef.current;
    const s    = stateRef.current;
    if (!wsId || s.unreadCount === 0) return;
    setState(prev => ({ ...prev, unreadCount: 0 }));
    const lastReal = [...s.messages].reverse().find(m => !m.id.startsWith('temp-'));
    if (lastReal) {
      markMessagesRead(wsId, lastReal.id).catch(() => {});
    }
  }, []);

  return {
    ...state,
    currentUserId: user?.id ?? null,
    loadMore,
    send,
    editMessage,
    deleteMessage,
    react,
    pin,
    unpin,
    search,
    clearSearch,
    setReplyingTo,
    setEditingMessage,
    refresh,
    highlightMessage,
    clearUnread,
  };
}