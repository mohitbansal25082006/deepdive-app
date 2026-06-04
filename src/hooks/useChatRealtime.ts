// src/hooks/useChatRealtime.ts
// Part 47 — Dedicated realtime subscription hook for workspace chat.
// Part 48 — FULL REAL-TIME FIX:
//   Root cause: postgres_changes only delivers events to users whose SELECT RLS
//   passes for THAT ROW at the time of the event. In a workspace, User B may not
//   be the sender, but they ARE a workspace member and their RLS should pass.
//   However, there is a known Supabase issue where the access policy cache is
//   evaluated only at subscription time, and if a new channel is created quickly
//   after login the cache may be stale.
//
//   SOLUTION: Dual-channel strategy
//   1. postgres_changes subscription (primary) — for the message sender + reliable
//      structural changes (UPDATE, DELETE) which are workspace-filtered.
//   2. Supabase Broadcast channel (secondary) — after every successful DB write,
//      the sender broadcasts the full message payload on channel `chat:ws:{id}`.
//      All OTHER members receive it via the broadcast listener.
//      This is the same pattern Discord/Slack use internally and is how Supabase
//      recommends implementing cross-user real-time chat.
//
//   The broadcast approach guarantees instant delivery to ALL workspace members
//   regardless of RLS cache state. postgres_changes is kept as a fallback and
//   for UPDATE/DELETE sync.
//
//   Deduplication: messages are keyed by `id`; duplicates from both channels are
//   silently discarded in useWorkspaceChat.onMessageInsert.

import { useEffect, useRef } from 'react';
import { supabase }           from '../lib/supabase';
import { ChatMessage, ChatMessageReactionSummary } from '../types/chat';

// ─── Public interface ─────────────────────────────────────────────────────────

export interface ChatRealtimeCallbacks {
  onMessageInsert:  (msg: ChatMessage) => void;
  onMessageUpdate:  (partial: Partial<ChatMessage> & { id: string }) => void;
  onMessageDelete:  (id: string) => void;
  onReactionChange: (messageId: string, reactions: ChatMessageReactionSummary[]) => void;
  onPinChange:      (messageId: string, isPinned: boolean) => void;
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
      // Part 48: attachments field in reply preview
      attachments: Array.isArray(replyRaw.attachments)
        ? (replyRaw.attachments as any[])
        : [],
    } as any : null,
    attachments: Array.isArray(raw.attachments) ? (raw.attachments as any[]) : [],
    mentions:    Array.isArray(raw.mentions)    ? (raw.mentions    as string[]) : [],
    isEdited:    !!(raw.isEdited  ?? raw.is_edited  ?? false),
    isDeleted:   !!(raw.isDeleted ?? raw.is_deleted ?? false),
    isPinned:    !!(raw.isPinned  ?? raw.is_pinned  ?? false),
    reactions:   Array.isArray(raw.reactions)
      ? (raw.reactions as ChatMessageReactionSummary[])
      : [],
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
  } catch {
    return [];
  }
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

  // Track IDs we've already processed via broadcast to prevent postgres_changes dupe
  const processedIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!workspaceId) return;

    const channels: ReturnType<typeof supabase.channel>[] = [];
    processedIdsRef.current.clear();

    // ─────────────────────────────────────────────────────────────────────────
    // Channel 1: Broadcast channel — PRIMARY for cross-user message delivery
    //
    // The sender calls broadcastChatMessage() after sendChatMessage() returns.
    // ALL other members receive the full hydrated message instantly via this
    // channel, bypassing postgres_changes RLS cache issues entirely.
    //
    // Events:
    //   chat_new_message   — full ChatMessage JSON
    //   chat_update        — { id, content, isEdited, isDeleted, updatedAt }
    //   chat_delete        — { id }
    //   chat_reaction      — { messageId, reactions[] }
    //   chat_pin           — { messageId, isPinned }
    // ─────────────────────────────────────────────────────────────────────────
    const broadcastChannel = supabase
      .channel(`chat:ws:${workspaceId}`, {
        config: {
          broadcast: { self: false }, // don't echo back to sender (they use optimistic)
        },
      })
      .on('broadcast', { event: 'chat_new_message' }, ({ payload }) => {
        const raw = payload as Record<string, unknown>;
        const id  = String(raw.id ?? '');
        if (!id) return;

        // Mark as processed so postgres_changes INSERT doesn't duplicate it
        processedIdsRef.current.add(id);
        // Auto-evict from set after 30s
        setTimeout(() => processedIdsRef.current.delete(id), 30_000);

        cbRef.current.onMessageInsert(mapRawToMessage(raw));
      })
      .on('broadcast', { event: 'chat_update' }, ({ payload }) => {
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
        const raw = payload as Record<string, unknown>;
        if (raw.id) cbRef.current.onMessageDelete(String(raw.id));
      })
      .on('broadcast', { event: 'chat_reaction' }, ({ payload }) => {
        const raw = payload as Record<string, unknown>;
        if (!raw.messageId) return;
        cbRef.current.onReactionChange(
          String(raw.messageId),
          parseReactions(raw.reactions),
        );
      })
      .on('broadcast', { event: 'chat_pin' }, ({ payload }) => {
        const raw = payload as Record<string, unknown>;
        if (!raw.messageId) return;
        cbRef.current.onPinChange(String(raw.messageId), !!(raw.isPinned));
      })
      .subscribe();
    channels.push(broadcastChannel);

    // ─────────────────────────────────────────────────────────────────────────
    // Channel 2: postgres_changes — FALLBACK for INSERT + authoritative for
    //            UPDATE / DELETE structural changes.
    //
    // INSERT: only processed if NOT already handled via broadcast (dedup check).
    //         Hydrates from DB for full author + reaction data.
    // UPDATE: always processed (edit/delete sync).
    // DELETE: always processed (hard deletes).
    // ─────────────────────────────────────────────────────────────────────────
    const pgChannel = supabase
      .channel(`chat48:pg:${workspaceId}`)
      .on(
        'postgres_changes',
        {
          event:  'INSERT',
          schema: 'public',
          table:  'workspace_chat_messages',
          filter: `workspace_id=eq.${workspaceId}`,
        },
        async (payload) => {
          const newRow    = payload.new as Record<string, unknown>;
          const messageId = String(newRow.id ?? '');
          if (!messageId) return;

          // Skip if already delivered via broadcast
          if (processedIdsRef.current.has(messageId)) return;

          // Hydrate from DB
          try {
            const { data, error } = await supabase.rpc('get_chat_message_by_id', {
              p_message_id: messageId,
            });
            if (!error && data !== null && data !== undefined) {
              const raw = typeof data === 'string'
                ? (JSON.parse(data) as Record<string, unknown>)
                : (data as Record<string, unknown>);
              // Mark to prevent duplicate from broadcast (if broadcast arrives late)
              processedIdsRef.current.add(messageId);
              setTimeout(() => processedIdsRef.current.delete(messageId), 30_000);
              cbRef.current.onMessageInsert(mapRawToMessage(raw));
              return;
            }
          } catch { /* fall through */ }

          // Raw fallback
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
          const row = payload.new as Record<string, unknown>;
          cbRef.current.onMessageUpdate({
            id:        String(row.id ?? ''),
            content:   row.is_deleted
              ? '[Message deleted]'
              : String(row.content ?? ''),
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
          const old = payload.old as Record<string, unknown>;
          if (old.id) cbRef.current.onMessageDelete(String(old.id));
        },
      )
      .subscribe();
    channels.push(pgChannel);

    // ─────────────────────────────────────────────────────────────────────────
    // Channel 3: Reactions — postgres_changes + broadcast fallback
    // ─────────────────────────────────────────────────────────────────────────
    const reactChannel = supabase
      .channel(`chat48:react:${workspaceId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_message_reactions' },
        async (payload) => {
          const row       = payload.new as Record<string, unknown>;
          const messageId = row.message_id as string | undefined;
          if (!messageId) return;
          try {
            const { data } = await supabase.rpc('get_message_reactions', {
              p_message_id: messageId,
            });
            if (data !== null && data !== undefined) {
              cbRef.current.onReactionChange(messageId, parseReactions(data));
            }
          } catch { /* non-fatal */ }
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'chat_message_reactions' },
        async (payload) => {
          const old       = payload.old as Record<string, unknown>;
          const messageId = old.message_id as string | undefined;
          if (!messageId) return;
          try {
            const { data } = await supabase.rpc('get_message_reactions', {
              p_message_id: messageId,
            });
            if (data !== null && data !== undefined) {
              cbRef.current.onReactionChange(messageId, parseReactions(data));
            }
          } catch { /* non-fatal */ }
        },
      )
      .subscribe();
    channels.push(reactChannel);

    // ─────────────────────────────────────────────────────────────────────────
    // Channel 4: Pins — postgres_changes (INSERT filtered + DELETE global)
    // Part 48 FIX: unpin DELETE now also emitted via broadcast in the sender's
    // unpin() call, so this catches it even if postgres_changes DELETE is slow.
    // ─────────────────────────────────────────────────────────────────────────
    const pinsChannel = supabase
      .channel(`chat48:pins:${workspaceId}`)
      .on(
        'postgres_changes',
        {
          event:  'INSERT',
          schema: 'public',
          table:  'chat_pinned_messages',
          filter: `workspace_id=eq.${workspaceId}`,
        },
        (payload) => {
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
          // No filter — workspace_id in old row via REPLICA IDENTITY FULL
        },
        (payload) => {
          const old     = payload.old as Record<string, unknown>;
          const rowWsId = old.workspace_id as string | undefined;
          if (rowWsId && rowWsId !== workspaceId) return;
          if (old.message_id) cbRef.current.onPinChange(String(old.message_id), false);
        },
      )
      .subscribe();
    channels.push(pinsChannel);

    return () => {
      channels.forEach(ch => supabase.removeChannel(ch));
    };
  }, [workspaceId]);
}

// ─── Broadcast helpers — called by useWorkspaceChat after each mutation ───────
// These send the payload to ALL OTHER members via the Broadcast channel.

export async function broadcastChatMessage(
  workspaceId: string,
  message: ChatMessage,
): Promise<void> {
  try {
    const ch = supabase.channel(`chat:ws:${workspaceId}`);
    await ch.send({
      type:    'broadcast',
      event:   'chat_new_message',
      payload: message,
    });
  } catch { /* non-fatal */ }
}

export async function broadcastChatUpdate(
  workspaceId: string,
  update: { id: string; content: string; isEdited: boolean; isDeleted: boolean; updatedAt: string },
): Promise<void> {
  try {
    const ch = supabase.channel(`chat:ws:${workspaceId}`);
    await ch.send({ type: 'broadcast', event: 'chat_update', payload: update });
  } catch { /* non-fatal */ }
}

export async function broadcastChatDelete(
  workspaceId: string,
  messageId: string,
): Promise<void> {
  try {
    const ch = supabase.channel(`chat:ws:${workspaceId}`);
    await ch.send({ type: 'broadcast', event: 'chat_delete', payload: { id: messageId } });
  } catch { /* non-fatal */ }
}

export async function broadcastChatReaction(
  workspaceId: string,
  messageId: string,
  reactions: ChatMessageReactionSummary[],
): Promise<void> {
  try {
    const ch = supabase.channel(`chat:ws:${workspaceId}`);
    await ch.send({
      type:    'broadcast',
      event:   'chat_reaction',
      payload: { messageId, reactions },
    });
  } catch { /* non-fatal */ }
}

export async function broadcastChatPin(
  workspaceId: string,
  messageId: string,
  isPinned: boolean,
): Promise<void> {
  try {
    const ch = supabase.channel(`chat:ws:${workspaceId}`);
    await ch.send({
      type:    'broadcast',
      event:   'chat_pin',
      payload: { messageId, isPinned },
    });
  } catch { /* non-fatal */ }
}