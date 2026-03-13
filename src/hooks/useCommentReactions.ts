// src/hooks/useCommentReactions.ts
// Part 11 (patched) — Exclusive reactions: one reaction per user per comment.
// Clicking a new emoji replaces the old one.
// Clicking the current emoji removes it (toggle off).

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { CommentReactionSummary, REACTION_EMOJIS } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

type ReactionsByComment = Record<string, CommentReactionSummary[]>;

// ─── Default empty summaries for a comment ────────────────────────────────────

function defaultSummaries(): CommentReactionSummary[] {
  return REACTION_EMOJIS.map((emoji) => ({ emoji, count: 0, hasReacted: false }));
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useCommentReactions(commentIds: string[]) {
  const [reactionsByComment, setReactionsByComment] = useState<ReactionsByComment>({});
  const isTogglingRef = useRef(false);

  // Stable key to avoid re-fetching on array reference change when IDs haven't changed
  const commentIdsKey = commentIds.slice().sort().join(',');

  // ── Fetch from DB ────────────────────────────────────────────────────────────
  const fetchReactions = useCallback(async () => {
    if (!commentIds.length) return;

    try {
      const { data, error } = await supabase.rpc('get_comment_reactions', {
        p_comment_ids: commentIds,
      });
      if (error) throw error;

      type RawRow = { comment_id: string; emoji: string; count: number; has_reacted: boolean };
      const rows = (data as RawRow[]) ?? [];

      const byComment: ReactionsByComment = {};
      for (const id of commentIds) {
        byComment[id] = REACTION_EMOJIS.map((emoji) => {
          const row = rows.find((r) => r.comment_id === id && r.emoji === emoji);
          return {
            emoji,
            count:      row ? Number(row.count) : 0,
            hasReacted: row?.has_reacted ?? false,
          };
        });
      }

      setReactionsByComment(byComment);
    } catch (err) {
      console.warn('[useCommentReactions] fetchReactions error:', err);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commentIdsKey]);

  // ── Initial fetch + re-fetch when IDs change ─────────────────────────────────
  useEffect(() => {
    fetchReactions();
  }, [fetchReactions]);

  // ── Realtime: re-fetch on any reaction change for these comments ──────────────
  useEffect(() => {
    if (!commentIds.length) return;

    const channel = supabase
      .channel(`comment_reactions:${commentIdsKey}`)
      .on(
        'postgres_changes',
        {
          event:  '*',
          schema: 'public',
          table:  'comment_reactions',
        },
        (payload) => {
          // Only refresh if the changed row belongs to one of our comment IDs
          const rowCommentId =
            ((payload.new as Record<string, unknown>)?.comment_id as string) ??
            ((payload.old as Record<string, unknown>)?.comment_id as string);

          if (!rowCommentId || commentIds.includes(rowCommentId)) {
            fetchReactions();
          }
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commentIdsKey, fetchReactions]);

  // ── Optimistic toggle (exclusive: one reaction per user per comment) ──────────
  const toggle = useCallback(async (commentId: string, emoji: string) => {
    if (isTogglingRef.current) return;
    isTogglingRef.current = true;

    // Compute the next optimistic state
    setReactionsByComment((prev) => {
      const current: CommentReactionSummary[] =
        prev[commentId] ?? defaultSummaries();

      // What emoji does the user currently have on this comment?
      const existing = current.find((r) => r.hasReacted);
      const isSameEmoji = existing?.emoji === emoji;

      const updated = current.map((r): CommentReactionSummary => {
        if (isSameEmoji) {
          // Toggle OFF: clicked the same emoji that's already active
          if (r.emoji === emoji) {
            return { ...r, count: Math.max(0, r.count - 1), hasReacted: false };
          }
          return r;
        }

        // Replace: clicked a different emoji
        if (r.emoji === existing?.emoji) {
          // Remove the old one
          return { ...r, count: Math.max(0, r.count - 1), hasReacted: false };
        }
        if (r.emoji === emoji) {
          // Add the new one
          return { ...r, count: r.count + 1, hasReacted: true };
        }
        return r;
      });

      return { ...prev, [commentId]: updated };
    });

    try {
      // The updated RPC (schema_patch_part11c.sql) enforces exclusive reactions server-side
      await supabase.rpc('toggle_comment_reaction', {
        p_comment_id: commentId,
        p_emoji:      emoji,
      });
      // Always re-sync from DB after mutation to stay consistent
      await fetchReactions();
    } catch (err) {
      console.warn('[useCommentReactions] toggle error:', err);
      // Revert optimistic update on failure
      await fetchReactions();
    } finally {
      isTogglingRef.current = false;
    }
  }, [fetchReactions]);

  // ── Public getter ─────────────────────────────────────────────────────────────
  const getReactions = useCallback(
    (commentId: string): CommentReactionSummary[] =>
      reactionsByComment[commentId] ?? defaultSummaries(),
    [reactionsByComment],
  );

  return { reactionsByComment, getReactions, toggle };
}