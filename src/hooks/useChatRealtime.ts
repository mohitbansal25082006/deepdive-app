// src/hooks/useChatRealtime.ts
// Part 47 — Dedicated realtime subscription hook for workspace chat.
//
// Handles THREE subscription channels:
//   1. workspace_chat_messages  — INSERT, UPDATE, DELETE
//   2. chat_message_reactions   — INSERT, DELETE  (client-side workspace guard)
//   3. chat_pinned_messages     — INSERT, DELETE
//
// Design:
//   • cbRef pattern — callbacks never cause channel re-subscription
//   • Message INSERT hydratesfrom DB via get_chat_message_by_id RPC
//     (gets author profile + reactions); raw payload used as fallback
//   • Reaction changes call get_message_reactions RPC for fresh counts
//   • REPLICA IDENTITY FULL must be set on reactions + pins (schema_part47.sql)
//
// Not for direct component use — imported only by useWorkspaceChat.

import { useEffect, useRef } from 'react';
import { supabase }           from '../lib/supabase';
import { ChatMessage, ChatMessageReactionSummary } from '../types/chat';

// ─── Public interface ─────────────────────────────────────────────────────────

export interface ChatRealtimeCallbacks {
  /** Fully hydrated message ready to insert into state */
  onMessageInsert:  (msg: ChatMessage) => void;
  /** Partial update — apply over existing message in state */
  onMessageUpdate:  (partial: Partial<ChatMessage> & { id: string }) => void;
  /** Hard delete — message removed from DB entirely (rare; usually soft-delete via UPDATE) */
  onMessageDelete:  (id: string) => void;
  /** Fresh reaction summary for a single message (all emojis, counts, hasReacted) */
  onReactionChange: (messageId: string, reactions: ChatMessageReactionSummary[]) => void;
  /** A message's pin status changed */
  onPinChange:      (messageId: string, isPinned: boolean) => void;
}

// ─── Raw payload → ChatMessage mapper ────────────────────────────────────────
// Handles both camelCase (from get_chat_message_by_id RPC) and
// snake_case (from raw Postgres Change payload fallback).

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
      id:         String(replyRaw.id         ?? ''),
      content:    String(replyRaw.content    ?? ''),
      userId:     String(replyRaw.userId ?? replyRaw.user_id ?? ''),
      authorName: (replyRaw.authorName ?? replyRaw.author_name ?? null) as string | null,
    } : null,
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
  // cbRef: hold latest callbacks without triggering re-subscription
  const cbRef = useRef<ChatRealtimeCallbacks>(callbacks);
  useEffect(() => { cbRef.current = callbacks; }, [callbacks]);

  useEffect(() => {
    if (!workspaceId) return;

    const channels: ReturnType<typeof supabase.channel>[] = [];

    // ─────────────────────────────────────────────────────────────────────────
    // Channel 1: workspace_chat_messages — INSERT / UPDATE / DELETE
    // Filtered by workspace_id so only messages for this workspace fire.
    // ─────────────────────────────────────────────────────────────────────────
    const msgsChannel = supabase
      .channel(`chat47:msgs:${workspaceId}`)
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

          // ── Hydrate: fetch full message with author + reactions from DB ──
          try {
            const { data, error } = await supabase.rpc('get_chat_message_by_id', {
              p_message_id: messageId,
            });

            if (!error && data !== null && data !== undefined) {
              const raw = typeof data === 'string'
                ? (JSON.parse(data) as Record<string, unknown>)
                : (data as Record<string, unknown>);
              cbRef.current.onMessageInsert(mapRawToMessage(raw));
              return;
            }
          } catch {
            // fall through to raw fallback
          }

          // ── Fallback: use raw Postgres row (no author avatar, no reactions) ──
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
          // REPLICA IDENTITY FULL is set on workspace_chat_messages in Part 17
        },
        (payload) => {
          const old = payload.old as Record<string, unknown>;
          if (old.id) cbRef.current.onMessageDelete(String(old.id));
        },
      )
      .subscribe();
    channels.push(msgsChannel);

    // ─────────────────────────────────────────────────────────────────────────
    // Channel 2: chat_message_reactions — INSERT / DELETE
    // No workspace_id column on this table, so we subscribe globally and let
    // the RPC (get_message_reactions) return null for messages we can't access.
    // The callback handler in useWorkspaceChat additionally checks if the
    // messageId is in the current messages list before updating state.
    // ─────────────────────────────────────────────────────────────────────────
    const reactChannel = supabase
      .channel(`chat47:react:${workspaceId}`)
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
          // REPLICA IDENTITY FULL set in schema_part47.sql — old row is full
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
    // Channel 3: chat_pinned_messages — INSERT / DELETE
    // INSERT filtered by workspace_id; DELETE is global (REPLICA IDENTITY FULL
    // set in schema_part47.sql allows old row to carry workspace_id).
    // ─────────────────────────────────────────────────────────────────────────
    const pinsChannel = supabase
      .channel(`chat47:pins:${workspaceId}`)
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
          // No filter — workspace_id in old row available due to REPLICA IDENTITY FULL
        },
        (payload) => {
          const old = payload.old as Record<string, unknown>;
          // Guard: only process pins belonging to THIS workspace
          const rowWsId = old.workspace_id as string | undefined;
          if (rowWsId && rowWsId !== workspaceId) return;
          if (old.message_id) cbRef.current.onPinChange(String(old.message_id), false);
        },
      )
      .subscribe();
    channels.push(pinsChannel);

    // ── Cleanup all channels on unmount or workspaceId change ────────────────
    return () => {
      channels.forEach(ch => supabase.removeChannel(ch));
    };
  }, [workspaceId]); // Only re-subscribe when workspaceId changes
}