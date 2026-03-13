// src/services/reactionService.ts
// Part 11 — Comment emoji reactions: toggle, fetch, realtime.

import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import {
  CommentReactionEmoji,
  CommentReactionSummary,
  REACTION_EMOJIS,
} from '../types';

// ─── Toggle a reaction ────────────────────────────────────────────────────────

export async function toggleReaction(
  commentId: string,
  emoji: CommentReactionEmoji,
): Promise<{ added: boolean; error: string | null }> {
  try {
    const { data, error } = await supabase
      .rpc('toggle_comment_reaction', {
        p_comment_id: commentId,
        p_emoji:      emoji,
      });

    if (error) throw error;
    const result = data as { added: boolean; emoji: string };
    return { added: result.added, error: null };
  } catch (err) {
    return {
      added: false,
      error: err instanceof Error ? err.message : 'Failed to toggle reaction',
    };
  }
}

// ─── Fetch reactions for a batch of comments ──────────────────────────────────

export interface RawReactionRow {
  comment_id: string;
  emoji: string;
  count: number;
  has_reacted: boolean;
}

/**
 * Returns a map of commentId → CommentReactionSummary[]
 * All 4 emoji are always included (with count=0 if none).
 */
export async function fetchReactionsForComments(
  commentIds: string[],
): Promise<{
  data: Record<string, CommentReactionSummary[]>;
  error: string | null;
}> {
  if (commentIds.length === 0) return { data: {}, error: null };

  try {
    const { data, error } = await supabase
      .rpc('get_comment_reactions', { p_comment_ids: commentIds });

    if (error) throw error;

    // Build the map with zero-filled defaults
    const map: Record<string, CommentReactionSummary[]> = {};

    for (const id of commentIds) {
      map[id] = REACTION_EMOJIS.map((emoji) => ({
        emoji,
        count:      0,
        hasReacted: false,
      }));
    }

    for (const row of (data as RawReactionRow[]) ?? []) {
      const summaries = map[row.comment_id];
      if (!summaries) continue;
      const summary = summaries.find((s) => s.emoji === row.emoji);
      if (summary) {
        summary.count      = Number(row.count);
        summary.hasReacted = row.has_reacted;
      }
    }

    return { data: map, error: null };
  } catch (err) {
    return {
      data: {},
      error: err instanceof Error ? err.message : 'Failed to fetch reactions',
    };
  }
}

// ─── Realtime subscription for reactions ─────────────────────────────────────

export interface ReactionChangePayload {
  type:      'added' | 'removed';
  commentId: string;
  userId:    string;
  emoji:     CommentReactionEmoji;
}

/**
 * Subscribe to reaction INSERT / DELETE events on a channel scoped
 * to the report's comments. Returns a cleanup function.
 */
export function subscribeToReactions(
  reportId: string,
  workspaceId: string,
  onChange: (payload: ReactionChangePayload) => void,
): () => void {
  const channel: RealtimeChannel = supabase
    .channel(`reactions:report:${reportId}:workspace:${workspaceId}`)
    .on(
      'postgres_changes',
      {
        event:  'INSERT',
        schema: 'public',
        table:  'comment_reactions',
      },
      async (payload) => {
        const row = payload.new as Record<string, unknown>;
        // Only emit if the comment belongs to this report
        const { data } = await supabase
          .from('report_comments')
          .select('id')
          .eq('id', row.comment_id as string)
          .eq('report_id', reportId)
          .maybeSingle();
        if (!data) return;

        onChange({
          type:      'added',
          commentId: row.comment_id as string,
          userId:    row.user_id as string,
          emoji:     row.emoji as CommentReactionEmoji,
        });
      },
    )
    .on(
      'postgres_changes',
      {
        event:  'DELETE',
        schema: 'public',
        table:  'comment_reactions',
      },
      (payload) => {
        const row = payload.old as Record<string, unknown>;
        onChange({
          type:      'removed',
          commentId: row.comment_id as string,
          userId:    row.user_id as string,
          emoji:     row.emoji as CommentReactionEmoji,
        });
      },
    )
    .subscribe();

  return () => { supabase.removeChannel(channel); };
}