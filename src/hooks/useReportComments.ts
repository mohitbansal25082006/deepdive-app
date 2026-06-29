// src/hooks/useReportComments.ts
// Part 58.1 — Resolve/unresolve removed.
//   • toggleResolve and all is_resolved handling stripped from the hook.
//   • Realtime onUpdate now only reconciles content edits (no resolve state).
//   • Everything else (optimistic post/reply/delete, dedupe, section counts,
//     reply activity logging) preserved from Part 46.

import { useState, useEffect, useCallback, useRef } from 'react';
import { ReportComment, CommentReply, CommentState } from '../types';
import {
  fetchComments, fetchSectionCommentCounts,
  addComment, addReply,
  deleteComment, deleteReply, subscribeToComments,
} from '../services/commentService';
import { logCommentReplied } from '../services/activityService';
import { useAuth } from '../context/AuthContext';

export function useReportComments(
  reportId: string | null,
  workspaceId: string | null,
) {
  const { user } = useAuth();
  const [state, setState] = useState<CommentState>({
    comments: [], sectionCounts: {},
    isLoading: true, isSending: false, isReplying: false, error: null,
  });
  const unsubRef = useRef<(() => void) | null>(null);

  // ── Load ──────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!reportId || !workspaceId) return;
    setState(s => ({ ...s, isLoading: true, error: null }));

    const [commentsResult, countsResult] = await Promise.all([
      fetchComments(reportId, workspaceId),
      fetchSectionCommentCounts(reportId, workspaceId),
    ]);

    setState(s => ({
      ...s,
      comments:      commentsResult.data,
      sectionCounts: countsResult.data,
      isLoading:     false,
      error:         commentsResult.error ?? countsResult.error,
    }));
  }, [reportId, workspaceId]);

  // ── Realtime ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!reportId || !workspaceId) return;

    load();

    unsubRef.current = subscribeToComments(reportId, workspaceId, {
      onInsert: (incoming) => {
        setState(s => {
          if (s.comments.some(c => c.id === incoming.id)) return s;
          return {
            ...s,
            comments: [...s.comments, incoming as ReportComment],
            sectionCounts: incoming.sectionId ? {
              ...s.sectionCounts,
              [incoming.sectionId]: (s.sectionCounts[incoming.sectionId] ?? 0) + 1,
            } : s.sectionCounts,
          };
        });
      },

      onUpdate: (updated) => {
        setState(s => ({
          ...s,
          comments: s.comments.map(c =>
            c.id === updated.id ? { ...c, ...updated } : c
          ),
        }));
      },

      onDelete: (commentId) => {
        setState(s => {
          const comment = s.comments.find(c => c.id === commentId);
          const newCounts = { ...s.sectionCounts };
          if (comment?.sectionId && newCounts[comment.sectionId] > 0) {
            newCounts[comment.sectionId]--;
          }
          return {
            ...s,
            comments: s.comments.filter(c => c.id !== commentId),
            sectionCounts: newCounts,
          };
        });
      },

      onReplyInsert: (reply) => {
        setState(s => {
          const parentComment = s.comments.find(c => c.id === reply.commentId);
          if (!parentComment) return s;
          if ((parentComment.replies ?? []).some(r => r.id === reply.id)) return s;

          return {
            ...s,
            comments: s.comments.map(c =>
              c.id === reply.commentId
                ? { ...c, replies: [...(c.replies ?? []), reply as CommentReply] }
                : c
            ),
          };
        });
      },
    });

    return () => {
      if (unsubRef.current) unsubRef.current();
      unsubRef.current = null;
    };
  }, [reportId, workspaceId, load]);

  // ── Post comment (optimistic) ─────────────────────────────────────────────
  const postComment = useCallback(async (
    content: string,
    sectionId?: string,
    mentions: string[] = [],
  ) => {
    if (!reportId || !workspaceId || !content.trim()) return;
    setState(s => ({ ...s, isSending: true }));

    const { data, error } = await addComment(workspaceId, reportId, content, sectionId, mentions);

    setState(s => {
      if (!data) return { ...s, isSending: false, error };
      const alreadyExists = s.comments.some(c => c.id === data.id);
      return {
        ...s,
        isSending: false,
        comments: alreadyExists ? s.comments : [...s.comments, data],
        sectionCounts: data.sectionId ? {
          ...s.sectionCounts,
          [data.sectionId]: (s.sectionCounts[data.sectionId] ?? 0) + 1,
        } : s.sectionCounts,
        error,
      };
    });
  }, [reportId, workspaceId]);

  // ── Post reply (optimistic) ───────────────────────────────────────────────
  const postReply = useCallback(async (
    commentId: string,
    content: string,
    mentions: string[] = [],
  ) => {
    if (!content.trim()) return;
    setState(s => ({ ...s, isReplying: true }));

    const { data, error } = await addReply(commentId, content, mentions);

    setState(s => {
      if (!data) return { ...s, isReplying: false, error };
      const parentComment = s.comments.find(c => c.id === commentId);
      const alreadyExists = (parentComment?.replies ?? []).some(r => r.id === data.id);

      return {
        ...s,
        isReplying: false,
        comments: alreadyExists
          ? s.comments
          : s.comments.map(c =>
              c.id === commentId
                ? { ...c, replies: [...(c.replies ?? []), data] }
                : c
            ),
        error,
      };
    });

    if (data && workspaceId) {
      logCommentReplied({
        workspaceId,
        commentId,
        reportId: reportId ?? '',
      }).catch(() => {});
    }
  }, [workspaceId, reportId]);

  // ── Remove comment (optimistic) ───────────────────────────────────────────
  const removeComment = useCallback(async (commentId: string) => {
    const comment = state.comments.find(c => c.id === commentId);
    setState(s => ({
      ...s,
      comments: s.comments.filter(c => c.id !== commentId),
      sectionCounts: comment?.sectionId && s.sectionCounts[comment.sectionId] > 0
        ? { ...s.sectionCounts, [comment.sectionId]: s.sectionCounts[comment.sectionId] - 1 }
        : s.sectionCounts,
    }));
    const { error } = await deleteComment(commentId);
    if (error) load();
  }, [state.comments, load]);

  // ── Remove reply (optimistic) ─────────────────────────────────────────────
  const removeReply = useCallback(async (commentId: string, replyId: string) => {
    setState(s => ({
      ...s,
      comments: s.comments.map(c =>
        c.id === commentId
          ? { ...c, replies: (c.replies ?? []).filter(r => r.id !== replyId) }
          : c
      ),
    }));
    const { error } = await deleteReply(replyId);
    if (error) load();
  }, [load]);

  // ── Filtered helpers ──────────────────────────────────────────────────────
  // Part 58.1: no longer filters out "resolved" comments (the concept is gone).
  const getCommentsForSection = useCallback((sectionId: string) =>
    state.comments.filter(c => c.sectionId === sectionId),
    [state.comments],
  );

  const getThreadCount = useCallback((sectionId: string) =>
    state.sectionCounts[sectionId] ?? 0,
    [state.sectionCounts],
  );

  return {
    ...state,
    refresh: load,
    postComment, postReply,
    removeComment, removeReply,
    getCommentsForSection, getThreadCount,
  };
}