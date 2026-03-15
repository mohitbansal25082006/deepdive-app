// src/types/chat.ts
// Part 17 — Workspace Chat System types
// Part 18 — Added `mentions` field to ChatMessage

import { MiniProfile } from './index';

// ─── Chat Message ─────────────────────────────────────────────────────────────

export type ChatContentType = 'text' | 'image' | 'file' | 'system';

export interface ChatAttachment {
  url:      string;
  name:     string;
  type:     string;   // mime type
  size?:    number;   // bytes
}

export interface ChatMessageReactionSummary {
  emoji:       string;
  count:       number;
  hasReacted:  boolean;
}

export interface ChatReplyPreview {
  id:          string;
  content:     string;
  userId:      string;
  authorName:  string | null;
}

export interface ChatMessage {
  id:           string;
  workspaceId:  string;
  userId:       string | null;
  content:      string;
  contentType:  ChatContentType;
  replyToId:    string | null;
  replyTo?:     ChatReplyPreview | null;
  attachments:  ChatAttachment[];
  /**
   * Part 18: array of user IDs @mentioned in this message.
   * Populated by parsing @username tokens at send time.
   * Used to fire mention notifications server-side.
   */
  mentions:     string[];
  isEdited:     boolean;
  isDeleted:    boolean;
  isPinned:     boolean;
  reactions:    ChatMessageReactionSummary[];
  author?:      MiniProfile | null;
  createdAt:    string;
  updatedAt:    string;
}

// ─── Chat Member (editor or owner) ───────────────────────────────────────────

export interface ChatMember {
  userId:    string;
  role:      'owner' | 'editor';
  username:  string | null;
  fullName:  string | null;
  avatarUrl: string | null;
  joinedAt:  string;
}

// ─── Typing Indicator payload (broadcast) ─────────────────────────────────────

export interface TypingPayload {
  userId:    string;
  username:  string | null;
  fullName:  string | null;
  avatarUrl: string | null;
  isTyping:  boolean;
}

// ─── Read Receipts ────────────────────────────────────────────────────────────

export interface ChatReadReceipt {
  userId:            string;
  workspaceId:       string;
  lastReadMessageId: string | null;
  lastReadAt:        string;
}

// ─── Pinned Message ───────────────────────────────────────────────────────────

export interface ChatPinnedMessage {
  id:         string;
  content:    string;
  userId:     string;
  createdAt:  string;
  pinnedAt:   string;
  pinnedBy:   string | null;
  author?:    MiniProfile | null;
}

// ─── State Shapes ─────────────────────────────────────────────────────────────

export interface ChatState {
  messages:        ChatMessage[];
  isLoading:       boolean;
  isSending:       boolean;
  isLoadingMore:   boolean;
  hasMore:         boolean;
  error:           string | null;
  unreadCount:     number;
  typingUsers:     TypingPayload[];
  pinnedMessages:  ChatPinnedMessage[];
  chatMembers:     ChatMember[];
  replyingTo:      ChatMessage | null;
  editingMessage:  ChatMessage | null;
  searchQuery:     string;
  searchResults:   ChatMessage[];
  isSearching:     boolean;
}

// ─── Chat Stats ───────────────────────────────────────────────────────────────

export interface UserChatStats {
  totalMessagesSent:  number;
  workspacesActive:   number;
  reactionsGiven:     number;
  messagesPinned:     number;
}

// ─── Part 18: Mention detection helpers ──────────────────────────────────────

/**
 * A parsed mention token found in message text.
 * position: character index of the @ sign.
 */
export interface ParsedMention {
  userId:   string;
  username: string;
  position: number;
  length:   number;
}

/**
 * Live state while the user is typing a @mention query.
 */
export interface ActiveMentionQuery {
  /** The text after @ that the user is currently typing */
  query:       string;
  /** Character position of the @ sign in the input */
  atPosition:  number;
}