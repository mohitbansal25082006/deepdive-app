// src/hooks/useChatRealtime.ts
// Part 47 — Dedicated realtime subscription hook for workspace chat.
// Part 48 — Dual-channel strategy attempted (Broadcast + postgres_changes).
// Part 49-FINAL — Complete rewrite fixing all delivery bugs:
//
// ROOT CAUSES OF THE BROKEN CHAT (discovered and fixed):
//
// 1. WRONG DELIVERY ARCHITECTURE:
//    The previous code used Broadcast as the PRIMARY delivery mechanism for
//    messages to other users. But Broadcast only delivers to users who have
//    the chat screen OPEN and subscribed to that channel right now. If User B
//    is not on the chat screen, they have no subscriber — messages are lost.
//    Broadcast is ephemeral by design. It is NOT a message queue.
//
// 2. RLS BLOCKING postgres_changes FOR OTHER USERS:
//    The SELECT policy on workspace_chat_messages only allowed auth.uid() = user_id
//    (the message sender). When Supabase Realtime evaluates postgres_changes,
//    it checks the SELECT policy for EACH subscriber. User B fails this check
//    (they didn't send the message), so the INSERT event is never delivered to
//    them via postgres_changes either. This is documented Supabase behavior.
//    FIX → schema_chat_fix.sql: SELECT policy now allows ANY workspace member.
//
// 3. BROADCAST HELPERS CREATING UNSUBSCRIBED CHANNELS:
//    Broadcast helpers called supabase.channel('chat:ws:{id}').send() without
//    subscribing — creating a new unconnected instance each call → REST fallback
//    → "falling back to REST API" warning.
//    FIX → module-level activeBroadcastChannels Map (preserved from Part 48).
//
// 4. PREMATURE SUBSCRIBED + RACE CONDITION:
//    Confirmed supabase-js bug: 'SUBSCRIBED' fires before the logical replication
//    listener is fully initialized. Messages in the first ~1-3s after subscribing
//    are silently missed. FIX → fetch latest messages on SUBSCRIBED (catch-up).
//
// CORRECT ARCHITECTURE (this file):
//    postgres_changes = PRIMARY delivery for all users (works when RLS is fixed)
//    Broadcast = SECONDARY, used only for:
//      a) Sender's own optimistic → real message replacement (self-echo)
//      b) Edit/delete/reaction/pin sync (supplementary, fast)
//    If broadcast is not available, postgres_changes handles everything reliably.

import { useEffect, useRef } from 'react';
import { supabase }           from '../lib/supabase';
import { ChatMessage, ChatMessageReactionSummary } from '../types/chat';

// ─── Active channel registry ──────────────────────────────────────────────────
// Maps workspaceId → the live subscribed broadcast channel.
// Used by broadcast helpers to avoid creating new unsubscribed channels.

const activeBroadcastChannels = new Map<string, ReturnType<typeof supabase.channel>>();

// ─── Public interface ─────────────────────────────────────────────────────────

export interface ChatRealtimeCallbacks {
  onMessageInsert:  (msg: ChatMessage) => void;
  onMessageUpdate:  (partial: Partial<ChatMessage> & { id: string }) => void;
  onMessageDelete:  (id: string) => void;
  onReactionChange: (messageId: string, reactions: ChatMessageReactionSummary[]) => void;
  onPinChange:      (messageId: string, isPinned: boolean) => void;
  onCatchUp?:       () => void; // called when subscription is ready — triggers catch-up fetch
}

// ─── Raw payload → ChatMessage mapper ────────────────────────────────────────

function mapRawToMessage(raw: Record<string, unknown>): ChatMessage {
  const authorRaw = (raw.author ?? null) as Record<string, unknown> | null;
  const replyRaw  = (raw.replyTo ?? raw.reply_to ?? null) as Record<string, unknown> | null;

  return {
    id:          String(raw.id          ?? ''),
    workspaceId: String(raw.workspaceId ?? raw.workspace_id  ?? ''),
    userId:      (raw.userId   ?? raw.user_id   ?? null)  as string | null,
    content:     String(raw.content  ?? ''),
    contentType: (raw.contentType ?? raw.content_type ?? 'text') as ChatMessage['contentType'],
    replyToId:   (raw.replyToId ?? raw.reply_to_id ?? null) as string | null,
    replyTo: replyRaw ? {
      id:          String(replyRaw.id         ?? ''),
      content:     String(replyRaw.content    ?? ''),
      userId:      String(replyRaw.userId ?? replyRaw.user_id ?? ''),
      authorName:  (replyRaw.authorName ?? replyRaw.author_name ?? null) as string | null,
      attachments: Array.isArray(replyRaw.attachments) ? (replyRaw.attachments as any[]) : [],
    } as any : null,
    attachments: Array.isArray(raw.attachments) ? (raw.attachments as any[]) : [],
    mentions:    Array.isArray(raw.mentions)    ? (raw.mentions    as string[]) : [],
    isEdited:    !!(raw.isEdited  ?? raw.is_edited  ?? false),
    isDeleted:   !!(raw.isDeleted ?? raw.is_deleted ?? false),
    isPinned:    !!(raw.isPinned  ?? raw.is_pinned  ?? false),
    reactions:   Array.isArray(raw.reactions) ? (raw.reactions as ChatMessageReactionSummary[]) : [],
    author: authorRaw ? {
      id:        String(authorRaw.id        ?? ''),
      username:  (authorRaw.username  ?? null) as string | null,
      fullName:  (authorRaw.fullName  ?? authorRaw.full_name  ?? null) as string | null,
      avatarUrl: (authorRaw.avatarUrl ?? authorRaw.avatar_url ?? null) as string | null,
    } : null,
    createdAt: String(raw.createdAt ?? raw.created_at ?? new Date().toISOString()),
    updatedAt: String(raw.updatedAt ?? raw.updated_at ?? new Date().toISOString()),
  };
}

// ─── Reaction JSONB parser ────────────────────────────────────────────────────

function parseReactions(data: unknown): ChatMessageReactionSummary[] {
  if (!data) return [];
  let arr: Record<string, unknown>[];
  try {
    arr = Array.isArray(data)
      ? (data as Record<string, unknown>[])
      : JSON.parse(data as string);
  } catch { return []; }
  return arr.map(r => ({
    emoji:      String(r.emoji ?? ''),
    count:      Number(r.count ?? (r as any).cnt ?? 0),
    hasReacted: !!(r.hasReacted ?? (r as any).has_reacted ?? false),
  }));
}

// ─── Main hook ────────────────────────────────────────────────────────────────

export function useChatRealtime(
  workspaceId: string | null,
  callbacks:   ChatRealtimeCallbacks,
) {
  const cbRef = useRef<ChatRealtimeCallbacks>(callbacks);
  useEffect(() => { cbRef.current = callbacks; }, [callbacks]);

  // Track IDs delivered via broadcast so postgres_changes doesn't duplicate them
  const processedIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!workspaceId) return;

    const channels: ReturnType<typeof supabase.channel>[] = [];
    processedIdsRef.current.clear();
    let destroyed = false;

    // ─────────────────────────────────────────────────────────────────────────
    // Channel 1: postgres_changes — PRIMARY delivery for ALL users
    //
    // This is the ONLY reliable way to deliver messages to users who are not
    // currently on the chat screen. postgres_changes uses the WAL (Write-Ahead
    // Log) and delivers to all subscribers whose SELECT RLS policy passes.
    //
    // REQUIRES: schema_chat_fix.sql to be run first so the SELECT policy allows
    // all workspace members (not just the message sender).
    //
    // On SUBSCRIBED: fire onCatchUp() to fetch any messages sent during the
    // ~1-3s window before logical replication was fully initialized.
    // ─────────────────────────────────────────────────────────────────────────
    const pgChannel = supabase
      .channel(`chat:pg:${workspaceId}:${Date.now()}`) // unique name prevents channel reuse bugs
      .on(
        'postgres_changes',
        {
          event:  'INSERT',
          schema: 'public',
          table:  'workspace_chat_messages',
          filter: `workspace_id=eq.${workspaceId}`,
        },
        async (payload) => {
          if (destroyed) return;
          const newRow    = payload.new as Record<string, unknown>;
          const messageId = String(newRow.id ?? '');
          if (!messageId) return;

          // Skip if already delivered via broadcast (sender's own optimistic replace)
          if (processedIdsRef.current.has(messageId)) return;

          // Hydrate from DB to get author, reactions, reply preview
          try {
            const { data, error } = await supabase.rpc('get_chat_message_by_id', {
              p_message_id: messageId,
            });
            if (!error && data !== null && data !== undefined && !destroyed) {
              const raw = typeof data === 'string'
                ? (JSON.parse(data) as Record<string, unknown>)
                : (data as Record<string, unknown>);
              processedIdsRef.current.add(messageId);
              setTimeout(() => processedIdsRef.current.delete(messageId), 30_000);
              cbRef.current.onMessageInsert(mapRawToMessage(raw));
              return;
            }
          } catch { /* fall through to raw */ }

          if (destroyed) return;
          processedIdsRef.current.add(messageId);
          setTimeout(() => processedIdsRef.current.delete(messageId), 30_000);
          cbRef.current.onMessageInsert(mapRawToMessage({
            ...newRow,
            reactions:   [],
            attachments: Array.isArray(newRow.attachments) ? newRow.attachments : [],
            mentions:    Array.isArray(newRow.mentions)    ? newRow.mentions    : [],
            is_pinned:   false,
          }));
        },
      )
      .on(
        'postgres_changes',
        {
          event:  'UPDATE',
          schema: 'public',
          table:  'workspace_chat_messages',
          filter: `workspace_id=eq.${workspaceId}`,
        },
        (payload) => {
          if (destroyed) return;
          const row = payload.new as Record<string, unknown>;
          cbRef.current.onMessageUpdate({
            id:        String(row.id ?? ''),
            content:   row.is_deleted ? '[Message deleted]' : String(row.content ?? ''),
            isEdited:  !!(row.is_edited),
            isDeleted: !!(row.is_deleted),
            updatedAt: String(row.updated_at ?? ''),
          });
        },
      )
      .on(
        'postgres_changes',
        {
          event:  'DELETE',
          schema: 'public',
          table:  'workspace_chat_messages',
          filter: `workspace_id=eq.${workspaceId}`,
        },
        (payload) => {
          if (destroyed) return;
          const old = payload.old as Record<string, unknown>;
          if (old.id) cbRef.current.onMessageDelete(String(old.id));
        },
      )
      .subscribe((status) => {
        if (destroyed) return;
        if (status === 'SUBSCRIBED') {
          // FIX: Fire catch-up fetch after subscription is confirmed.
          // This closes the race window (~1-3s) where postgres_changes may have
          // missed messages that were inserted before replication was fully ready.
          // A small delay ensures the replication listener is truly initialized.
          setTimeout(() => {
            if (!destroyed) cbRef.current.onCatchUp?.();
          }, 1500);
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          // The channel errored — log for debugging but don't crash
          console.warn(`[ChatRealtime] pg channel status: ${status} for workspace ${workspaceId}`);
        }
      });

    channels.push(pgChannel);

    // ─────────────────────────────────────────────────────────────────────────
    // Channel 2: Broadcast — SECONDARY, for fast supplementary sync
    //
    // Used for: edit, delete, reaction, pin events (fast UI updates)
    // Also used for the SENDER's own optimistic message → real message replace
    // (the sender's broadcast fires before postgres_changes, so we can do the
    // temp-id → real-id swap immediately without waiting for replication lag)
    //
    // NOT used as primary delivery for other users (that's postgres_changes).
    // ─────────────────────────────────────────────────────────────────────────
    const broadcastChannel = supabase
      .channel(`chat:bc:${workspaceId}`, {
        config: { broadcast: { self: true } }, // self:true so sender receives own broadcast
      })
      .on('broadcast', { event: 'chat_new_message' }, ({ payload }) => {
        if (destroyed) return;
        const raw = payload as Record<string, unknown>;
        const id  = String(raw.id ?? '');
        if (!id) return;

        // Mark as processed so postgres_changes INSERT doesn't duplicate it
        processedIdsRef.current.add(id);
        setTimeout(() => processedIdsRef.current.delete(id), 30_000);

        cbRef.current.onMessageInsert(mapRawToMessage(raw));
      })
      .on('broadcast', { event: 'chat_update' }, ({ payload }) => {
        if (destroyed) return;
        const raw = payload as Record<string, unknown>;
        if (!raw.id) return;
        cbRef.current.onMessageUpdate({
          id:        String(raw.id),
          content:   raw.isDeleted ? '[Message deleted]' : String(raw.content ?? ''),
          isEdited:  !!(raw.isEdited),
          isDeleted: !!(raw.isDeleted),
          updatedAt: String(raw.updatedAt ?? ''),
        });
      })
      .on('broadcast', { event: 'chat_delete' }, ({ payload }) => {
        if (destroyed) return;
        const raw = payload as Record<string, unknown>;
        if (raw.id) cbRef.current.onMessageDelete(String(raw.id));
      })
      .on('broadcast', { event: 'chat_reaction' }, ({ payload }) => {
        if (destroyed) return;
        const raw = payload as Record<string, unknown>;
        if (!raw.messageId) return;
        cbRef.current.onReactionChange(
          String(raw.messageId),
          parseReactions(raw.reactions),
        );
      })
      .on('broadcast', { event: 'chat_pin' }, ({ payload }) => {
        if (destroyed) return;
        const raw = payload as Record<string, unknown>;
        if (!raw.messageId) return;
        cbRef.current.onPinChange(String(raw.messageId), !!(raw.isPinned));
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED' && !destroyed) {
          // Register in map so broadcast helpers can reuse this subscribed instance
          activeBroadcastChannels.set(workspaceId, broadcastChannel);
        }
      });

    channels.push(broadcastChannel);

    // ─────────────────────────────────────────────────────────────────────────
    // Channel 3: Reactions via postgres_changes (supplementary)
    // ─────────────────────────────────────────────────────────────────────────
    const reactChannel = supabase
      .channel(`chat:react:${workspaceId}:${Date.now()}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_message_reactions' },
        async (payload) => {
          if (destroyed) return;
          const row       = payload.new as Record<string, unknown>;
          const messageId = row.message_id as string | undefined;
          if (!messageId) return;
          try {
            const { data } = await supabase.rpc('get_message_reactions', { p_message_id: messageId });
            if (data !== null && data !== undefined && !destroyed) {
              cbRef.current.onReactionChange(messageId, parseReactions(data));
            }
          } catch { /* non-fatal */ }
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'chat_message_reactions' },
        async (payload) => {
          if (destroyed) return;
          const old       = payload.old as Record<string, unknown>;
          const messageId = old.message_id as string | undefined;
          if (!messageId) return;
          try {
            const { data } = await supabase.rpc('get_message_reactions', { p_message_id: messageId });
            if (data !== null && data !== undefined && !destroyed) {
              cbRef.current.onReactionChange(messageId, parseReactions(data));
            }
          } catch { /* non-fatal */ }
        },
      )
      .subscribe();
    channels.push(reactChannel);

    // ─────────────────────────────────────────────────────────────────────────
    // Channel 4: Pins via postgres_changes
    // ─────────────────────────────────────────────────────────────────────────
    const pinsChannel = supabase
      .channel(`chat:pins:${workspaceId}:${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event:  'INSERT',
          schema: 'public',
          table:  'chat_pinned_messages',
          filter: `workspace_id=eq.${workspaceId}`,
        },
        (payload) => {
          if (destroyed) return;
          const row = payload.new as Record<string, unknown>;
          if (row.message_id) cbRef.current.onPinChange(String(row.message_id), true);
        },
      )
      .on(
        'postgres_changes',
        {
          event:  'DELETE',
          schema: 'public',
          table:  'chat_pinned_messages',
        },
        (payload) => {
          if (destroyed) return;
          const old     = payload.old as Record<string, unknown>;
          const rowWsId = old.workspace_id as string | undefined;
          if (rowWsId && rowWsId !== workspaceId) return;
          if (old.message_id) cbRef.current.onPinChange(String(old.message_id), false);
        },
      )
      .subscribe();
    channels.push(pinsChannel);

    return () => {
      destroyed = true;
      activeBroadcastChannels.delete(workspaceId);
      channels.forEach(ch => {
        supabase.removeChannel(ch).catch(() => {});
      });
    };
  }, [workspaceId]);
}

// ─── Broadcast helpers ────────────────────────────────────────────────────────
// These send on the ALREADY-SUBSCRIBED broadcast channel from the map.
// No new unsubscribed channels created → no REST fallback → no warning.
// If channel not in map (race / screen not mounted) → skip silently.
// postgres_changes will still deliver to all subscribers independently.

async function sendViaBroadcast(
  workspaceId: string,
  event:       string,
  payload:     Record<string, unknown>,
): Promise<void> {
  try {
    const ch = activeBroadcastChannels.get(workspaceId);
    if (!ch) return; // not subscribed yet — postgres_changes handles delivery
    await ch.send({ type: 'broadcast', event, payload });
  } catch { /* non-fatal */ }
}

export async function broadcastChatMessage(
  workspaceId: string,
  message: ChatMessage,
): Promise<void> {
  await sendViaBroadcast(workspaceId, 'chat_new_message', message as any);
}

export async function broadcastChatUpdate(
  workspaceId: string,
  update: { id: string; content: string; isEdited: boolean; isDeleted: boolean; updatedAt: string },
): Promise<void> {
  await sendViaBroadcast(workspaceId, 'chat_update', update);
}

export async function broadcastChatDelete(
  workspaceId: string,
  messageId: string,
): Promise<void> {
  await sendViaBroadcast(workspaceId, 'chat_delete', { id: messageId });
}

export async function broadcastChatReaction(
  workspaceId: string,
  messageId: string,
  reactions: ChatMessageReactionSummary[],
): Promise<void> {
  await sendViaBroadcast(workspaceId, 'chat_reaction', { messageId, reactions } as any);
}

export async function broadcastChatPin(
  workspaceId: string,
  messageId: string,
  isPinned: boolean,
): Promise<void> {
  await sendViaBroadcast(workspaceId, 'chat_pin', { messageId, isPinned });
}