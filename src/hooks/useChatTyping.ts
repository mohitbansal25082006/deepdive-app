// src/hooks/useChatTyping.ts
// Part 17 — Typing indicator management for workspace chat.
// Broadcasts typing events via Supabase Realtime Broadcast.
// Auto-clears typing state after 3 seconds of inactivity.

import { useState, useEffect, useCallback, useRef } from 'react';
import { TypingPayload } from '../types/chat';
import { subscribeToTyping, broadcastTyping } from '../services/chatService';
import { useAuth } from '../context/AuthContext';

const TYPING_CLEAR_MS = 3000;

export function useChatTyping(workspaceId: string | null) {
  const { user, profile } = useAuth();
  const [typingUsers, setTypingUsers] = useState<TypingPayload[]>([]);
  const clearTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const unsubRef = useRef<(() => void) | null>(null);

  // ── Subscribe to incoming typing events ──────────────────────────────────────

  useEffect(() => {
    if (!workspaceId) return;

    const unsub = subscribeToTyping(workspaceId, (payload) => {
      // Ignore our own typing events
      if (payload.userId === user?.id) return;

      setTypingUsers(prev => {
        const filtered = prev.filter(u => u.userId !== payload.userId);
        if (!payload.isTyping) return filtered;
        return [...filtered, payload];
      });

      // Auto-clear after timeout
      const existing = clearTimersRef.current.get(payload.userId);
      if (existing) clearTimeout(existing);

      if (payload.isTyping) {
        const timer = setTimeout(() => {
          setTypingUsers(prev => prev.filter(u => u.userId !== payload.userId));
          clearTimersRef.current.delete(payload.userId);
        }, TYPING_CLEAR_MS);
        clearTimersRef.current.set(payload.userId, timer);
      }
    });

    unsubRef.current = unsub;

    return () => {
      if (unsubRef.current) {
        unsubRef.current();
        unsubRef.current = null;
      }
      // Clear all timers
      clearTimersRef.current.forEach(t => clearTimeout(t));
      clearTimersRef.current.clear();
      setTypingUsers([]);
    };
  }, [workspaceId, user?.id]);

  // ── Send typing broadcast ─────────────────────────────────────────────────────

  const sendTyping = useCallback(async (isTyping: boolean) => {
    if (!workspaceId || !user) return;
    await broadcastTyping(
      workspaceId,
      {
        userId:    user.id,
        username:  profile?.username   ?? null,
        fullName:  profile?.full_name  ?? null,
        avatarUrl: profile?.avatar_url ?? null,
      },
      isTyping,
    );
  }, [workspaceId, user, profile]);

  // ── Typing display text ───────────────────────────────────────────────────────

  const typingText = typingUsers.length === 0
    ? null
    : typingUsers.length === 1
      ? `${typingUsers[0].fullName ?? typingUsers[0].username ?? 'Someone'} is typing…`
      : typingUsers.length === 2
        ? `${typingUsers[0].fullName ?? typingUsers[0].username} and ${typingUsers[1].fullName ?? typingUsers[1].username} are typing…`
        : `${typingUsers.length} people are typing…`;

  return {
    typingUsers,
    typingText,
    sendTyping,
  };
}