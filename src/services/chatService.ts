// src/services/chatService.ts
// Part 17 — Workspace Chat Service
// Part 18 — sendChatMessage now accepts and forwards p_mentions (uuid[])

import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import {
  ChatMessage, ChatMember, ChatPinnedMessage,
  ChatAttachment, ChatMessageReactionSummary,
  ChatReplyPreview, TypingPayload,
} from '../types/chat';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function get<T>(raw: Record<string, unknown>, snake: string, camel: string): T {
  const v = raw[snake] !== undefined ? raw[snake] : raw[camel];
  return v as T;
}

function safeArray<T>(v: unknown): T[] {
  if (Array.isArray(v)) return v as T[];
  return [];
}

function parseJsonb(data: unknown): Record<string, unknown>[] {
  if (!data) return [];
  if (typeof data === 'string') { try { return JSON.parse(data); } catch { return []; } }
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  if (typeof data === 'object') return [data as Record<string, unknown>];
  return [];
}

function parseJsonbObject(data: unknown): Record<string, unknown> {
  if (!data) return {};
  if (typeof data === 'string') { try { return JSON.parse(data); } catch { return {}; } }
  if (typeof data === 'object' && !Array.isArray(data)) return data as Record<string, unknown>;
  return {};
}

// ─── Mappers ──────────────────────────────────────────────────────────────────

export function mapMessage(raw: Record<string, unknown>): ChatMessage {
  const authorRaw = (raw.author ?? null) as Record<string, unknown> | null;
  const replyRaw  = (raw.reply_to ?? raw.replyTo ?? null) as Record<string, unknown> | null;
  const reactRaw  = safeArray<Record<string, unknown>>(raw.reactions);
  const attRaw    = safeArray<Record<string, unknown>>(raw.attachments);

  // Part 18: mentions
  const mentionsRaw = safeArray<unknown>(raw.mentions);
  const mentions: string[] = mentionsRaw.filter(m => typeof m === 'string') as string[];

  return {
    id:          get<string>(raw, 'id', 'id') ?? '',
    workspaceId: get<string>(raw, 'workspace_id', 'workspaceId') ?? '',
    userId:      get<string | null>(raw, 'user_id', 'userId') ?? null,
    content:     get<string>(raw, 'content', 'content') ?? '',
    contentType: (get<string>(raw, 'content_type', 'contentType') ?? 'text') as ChatMessage['contentType'],
    replyToId:   get<string | null>(raw, 'reply_to_id', 'replyToId') ?? null,

    replyTo: replyRaw ? {
      id:         get<string>(replyRaw, 'id', 'id') ?? '',
      content:    get<string>(replyRaw, 'content', 'content') ?? '',
      userId:     get<string>(replyRaw, 'user_id', 'userId') ?? '',
      authorName: get<string | null>(replyRaw, 'author_name', 'authorName') ?? null,
    } satisfies ChatReplyPreview : null,

    attachments: attRaw.map(a => ({
      url:  get<string>(a, 'url',  'url')  ?? '',
      name: get<string>(a, 'name', 'name') ?? '',
      type: get<string>(a, 'type', 'type') ?? '',
      size: get<number | undefined>(a, 'size', 'size') ?? undefined,
    } satisfies ChatAttachment)),

    mentions, // Part 18

    isEdited:  !!(get<boolean>(raw, 'is_edited',  'isEdited')  ?? false),
    isDeleted: !!(get<boolean>(raw, 'is_deleted', 'isDeleted') ?? false),
    isPinned:  !!(get<boolean>(raw, 'is_pinned',  'isPinned')  ?? false),

    reactions: reactRaw.map(r => ({
      emoji:      get<string>(r,  'emoji',       'emoji')      ?? '',
      count:      (get<number>(r,  'count',       'count')      ?? 0),
      hasReacted: !!(get<boolean>(r, 'has_reacted', 'hasReacted') ?? false),
    } satisfies ChatMessageReactionSummary)),

    author: authorRaw ? {
      id:        get<string>(authorRaw, 'id',          'id')        ?? '',
      username:  get<string | null>(authorRaw, 'username',  'username')  ?? null,
      fullName:  get<string | null>(authorRaw, 'full_name', 'fullName')  ?? null,
      avatarUrl: get<string | null>(authorRaw, 'avatar_url','avatarUrl') ?? null,
    } : null,

    createdAt: get<string>(raw, 'created_at', 'createdAt') ?? new Date().toISOString(),
    updatedAt: get<string>(raw, 'updated_at', 'updatedAt') ?? new Date().toISOString(),
  };
}

function mapMember(raw: Record<string, unknown>): ChatMember {
  return {
    userId:    get<string>(raw, 'user_id',    'userId')    ?? '',
    role:      (get<string>(raw, 'role',      'role')      ?? 'editor') as 'owner' | 'editor',
    username:  get<string | null>(raw, 'username',  'username')  ?? null,
    fullName:  get<string | null>(raw, 'full_name', 'fullName')  ?? null,
    avatarUrl: get<string | null>(raw, 'avatar_url','avatarUrl') ?? null,
    joinedAt:  get<string>(raw, 'joined_at',  'joinedAt')  ?? '',
  };
}

function mapPinned(raw: Record<string, unknown>): ChatPinnedMessage {
  const authorRaw = (raw.author ?? null) as Record<string, unknown> | null;
  return {
    id:        get<string>(raw, 'id',         'id')        ?? '',
    content:   get<string>(raw, 'content',    'content')   ?? '',
    userId:    get<string>(raw, 'user_id',    'userId')    ?? '',
    createdAt: get<string>(raw, 'created_at', 'createdAt') ?? '',
    pinnedAt:  get<string>(raw, 'pinned_at',  'pinnedAt')  ?? '',
    pinnedBy:  get<string | null>(raw, 'pinned_by', 'pinnedBy') ?? null,
    author: authorRaw ? {
      id:        get<string>(authorRaw, 'id',           'id')        ?? '',
      username:  get<string | null>(authorRaw, 'username',   'username')  ?? null,
      fullName:  get<string | null>(authorRaw, 'full_name',  'fullName')  ?? null,
      avatarUrl: get<string | null>(authorRaw, 'avatar_url', 'avatarUrl') ?? null,
    } : null,
  };
}

// ─── Fetch messages ────────────────────────────────────────────────────────────

export async function fetchChatMessages(
  workspaceId: string,
  limit = 40,
  beforeId?: string,
): Promise<{ data: ChatMessage[]; error: string | null; hasMore: boolean }> {
  try {
    const { data, error } = await supabase.rpc('get_chat_messages', {
      p_workspace_id: workspaceId,
      p_limit:        limit + 1,
      p_before_id:    beforeId ?? null,
    });
    if (error) throw error;
    const rows    = parseJsonb(data);
    const hasMore = rows.length > limit;
    return { data: rows.slice(0, limit).map(mapMessage), error: null, hasMore };
  } catch (err) {
    return { data: [], error: err instanceof Error ? err.message : 'Failed to load messages', hasMore: false };
  }
}

// ─── Send message ─────────────────────────────────────────────────────────────
// Part 18: added mentions?: string[]

export async function sendChatMessage(
  workspaceId:  string,
  content:      string,
  contentType:  ChatMessage['contentType'] = 'text',
  replyToId?:   string,
  attachments?: ChatAttachment[],
  mentions?:    string[],           // ← Part 18
): Promise<{ data: ChatMessage | null; error: string | null }> {
  try {
    const attachmentsPayload: ChatAttachment[] =
      (attachments && attachments.length > 0) ? attachments : [];

    // Pass mentions as a native array — PostgREST maps string[] → uuid[] automatically
    const mentionsPayload: string[] =
      (mentions && mentions.length > 0) ? mentions : [];

    const { data, error } = await supabase.rpc('send_chat_message', {
      p_workspace_id: workspaceId,
      p_content:      content,
      p_content_type: contentType,
      p_reply_to_id:  replyToId ?? null,
      p_attachments:  attachmentsPayload,
      p_mentions:     mentionsPayload,    // ← Part 18
    });

    if (error) {
      console.error('[sendChatMessage] RPC error:', JSON.stringify(error));
      throw error;
    }

    const raw = parseJsonbObject(data);
    return { data: mapMessage(raw), error: null };
  } catch (err) {
    console.error('[sendChatMessage] caught:', err);
    return { data: null, error: err instanceof Error ? err.message : 'Failed to send message' };
  }
}

// ─── Edit ─────────────────────────────────────────────────────────────────────

export async function editChatMessage(messageId: string, newContent: string): Promise<{ error: string | null }> {
  try {
    const { error } = await supabase.rpc('edit_chat_message', { p_message_id: messageId, p_new_content: newContent });
    if (error) throw error;
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to edit message' };
  }
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export async function deleteChatMessage(messageId: string): Promise<{ error: string | null }> {
  try {
    const { error } = await supabase.rpc('delete_chat_message', { p_message_id: messageId });
    if (error) throw error;
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to delete message' };
  }
}

// ─── Reaction ─────────────────────────────────────────────────────────────────

export async function toggleChatReaction(messageId: string, emoji: string): Promise<{ added: boolean; error: string | null }> {
  try {
    const { data, error } = await supabase.rpc('toggle_chat_reaction', { p_message_id: messageId, p_emoji: emoji });
    if (error) throw error;
    return { added: !!(parseJsonbObject(data).added), error: null };
  } catch (err) {
    return { added: false, error: err instanceof Error ? err.message : 'Failed to toggle reaction' };
  }
}

// ─── Read receipts ────────────────────────────────────────────────────────────

export async function markMessagesRead(workspaceId: string, messageId: string): Promise<void> {
  try {
    await supabase.rpc('mark_messages_read', { p_workspace_id: workspaceId, p_message_id: messageId });
  } catch { /* non-fatal */ }
}

export async function getChatUnreadCount(workspaceId: string): Promise<number> {
  try {
    const { data } = await supabase.rpc('get_chat_unread_count', { p_workspace_id: workspaceId });
    return typeof data === 'number' ? data : 0;
  } catch { return 0; }
}

// ─── Pin / unpin ──────────────────────────────────────────────────────────────

export async function pinChatMessage(messageId: string): Promise<{ error: string | null }> {
  try {
    const { error } = await supabase.rpc('pin_chat_message', { p_message_id: messageId });
    if (error) throw error;
    return { error: null };
  } catch (err) { return { error: err instanceof Error ? err.message : 'Failed to pin' }; }
}

export async function unpinChatMessage(messageId: string): Promise<{ error: string | null }> {
  try {
    const { error } = await supabase.rpc('unpin_chat_message', { p_message_id: messageId });
    if (error) throw error;
    return { error: null };
  } catch (err) { return { error: err instanceof Error ? err.message : 'Failed to unpin' }; }
}

export async function getPinnedChatMessages(workspaceId: string): Promise<{ data: ChatPinnedMessage[]; error: string | null }> {
  try {
    const { data, error } = await supabase.rpc('get_pinned_chat_messages', { p_workspace_id: workspaceId });
    if (error) throw error;
    return { data: parseJsonb(data).map(mapPinned), error: null };
  } catch (err) { return { data: [], error: err instanceof Error ? err.message : 'Failed to load pinned' }; }
}

// ─── Search ───────────────────────────────────────────────────────────────────

export async function searchChatMessages(workspaceId: string, query: string, limit = 20): Promise<{ data: ChatMessage[]; error: string | null }> {
  try {
    const { data, error } = await supabase.rpc('search_chat_messages', { p_workspace_id: workspaceId, p_query: query, p_limit: limit });
    if (error) throw error;
    return { data: parseJsonb(data).map(mapMessage), error: null };
  } catch (err) { return { data: [], error: err instanceof Error ? err.message : 'Failed to search' }; }
}

// ─── Members ──────────────────────────────────────────────────────────────────

export async function getChatMembers(workspaceId: string): Promise<{ data: ChatMember[]; error: string | null }> {
  try {
    const { data, error } = await supabase.rpc('get_chat_members', { p_workspace_id: workspaceId });
    if (error) throw error;
    return { data: parseJsonb(data).map(mapMember), error: null };
  } catch (err) { return { data: [], error: err instanceof Error ? err.message : 'Failed to load members' }; }
}

// ─── Realtime ─────────────────────────────────────────────────────────────────

export interface ChatRealtimeCallbacks {
  onInsert: (msg: ChatMessage) => void;
  onUpdate: (msg: Partial<ChatMessage> & { id: string }) => void;
  onDelete: (id: string) => void;
}

export function subscribeToChatMessages(workspaceId: string, callbacks: ChatRealtimeCallbacks): () => void {
  const channel = supabase
    .channel(`chat:${workspaceId}:messages`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'workspace_chat_messages', filter: `workspace_id=eq.${workspaceId}` },
      async (payload) => {
        const newRow = payload.new as Record<string, unknown>;
        const insertedId = newRow.id as string;
        try {
          const { data: recent } = await fetchChatMessages(workspaceId, 10);
          const found = recent.find(m => m.id === insertedId);
          if (found) { callbacks.onInsert(found); return; }
        } catch { /* fall through */ }
        callbacks.onInsert(mapMessage({ ...newRow, reactions: [], attachments: [], mentions: [], is_pinned: false }));
      })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'workspace_chat_messages', filter: `workspace_id=eq.${workspaceId}` },
      (payload) => {
        const row = payload.new as Record<string, unknown>;
        const isDeleted = !!(row.is_deleted);
        callbacks.onUpdate({ id: row.id as string, content: isDeleted ? '[Message deleted]' : (row.content as string), isEdited: !!(row.is_edited), isDeleted, updatedAt: row.updated_at as string });
      })
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}

// ─── Typing ───────────────────────────────────────────────────────────────────

let _typingChannel: RealtimeChannel | null = null;

export function subscribeToTyping(workspaceId: string, onTyping: (payload: TypingPayload) => void): () => void {
  if (_typingChannel) { supabase.removeChannel(_typingChannel); _typingChannel = null; }
  _typingChannel = supabase
    .channel(`chat:${workspaceId}:typing`)
    .on('broadcast', { event: 'typing' }, ({ payload }: { payload: TypingPayload }) => onTyping(payload))
    .subscribe();
  return () => { if (_typingChannel) { supabase.removeChannel(_typingChannel); _typingChannel = null; } };
}

let _lastTypingSent = 0;
const TYPING_THROTTLE_MS = 2500;

export async function broadcastTyping(
  workspaceId: string,
  user: { userId: string; username: string | null; fullName: string | null; avatarUrl: string | null },
  isTyping: boolean,
): Promise<void> {
  const now = Date.now();
  if (isTyping && now - _lastTypingSent < TYPING_THROTTLE_MS) return;
  _lastTypingSent = isTyping ? now : 0;
  try {
    const ch = supabase.channel(`chat:${workspaceId}:typing`);
    await ch.send({ type: 'broadcast', event: 'typing', payload: { ...user, isTyping } satisfies TypingPayload });
  } catch { /* non-fatal */ }
}