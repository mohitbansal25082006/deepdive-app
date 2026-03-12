// src/hooks/useReportComments.ts
// Full comment state with realtime updates via subscribeToComments.

import { useState, useEffect, useCallback, useRef } from 'react';
import { ReportComment, CommentReply, CommentState } from '../types';
import {
  fetchComments, fetchSectionCommentCounts,
  addComment, addReply, toggleCommentResolved,
  deleteComment, deleteReply, subscribeToComments,
} from '../services/commentService';
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

  // ── Load ──────────────────────────────────────────────────────────────────────
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

  // ── Realtime ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!reportId || !workspaceId) return;

    load();

    unsubRef.current = subscribeToComments(reportId, workspaceId, {
      onInsert: (incoming) => {
        // Don't add if it's from the current user — we already added it optimistically
        if (incoming.userId === user?.id) return;
        setState(s => ({
          ...s,
          comments: [...s.comments, incoming as ReportComment],
          sectionCounts: incoming.sectionId ? {
            ...s.sectionCounts,
            [incoming.sectionId]: (s.sectionCounts[incoming.sectionId] ?? 0) + 1,
          } : s.sectionCounts,
        }));
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
        if (reply.userId === user?.id) return;
        setState(s => ({
          ...s,
          comments: s.comments.map(c =>
            c.id === reply.commentId
              ? { ...c, replies: [...(c.replies ?? []), reply as CommentReply] }
              : c
          ),
        }));
      },
    });

    return () => {
      if (unsubRef.current) unsubRef.current();
      unsubRef.current = null;
    };
  }, [reportId, workspaceId, load, user?.id]);

  // ── Actions ───────────────────────────────────────────────────────────────────

  const postComment = useCallback(async (
    content: string,
    sectionId?: string,
    mentions: string[] = [],
  ) => {
    if (!reportId || !workspaceId || !content.trim()) return;
    setState(s => ({ ...s, isSending: true }));

    const { data, error } = await addComment(workspaceId, reportId, content, sectionId, mentions);

    setState(s => ({
      ...s,
      isSending: false,
      comments: data ? [...s.comments, data] : s.comments,
      sectionCounts: data?.sectionId ? {
        ...s.sectionCounts,
        [data.sectionId]: (s.sectionCounts[data.sectionId] ?? 0) + 1,
      } : s.sectionCounts,
      error,
    }));
  }, [reportId, workspaceId]);

  const postReply = useCallback(async (
    commentId: string,
    content: string,
    mentions: string[] = [],
  ) => {
    if (!content.trim()) return;
    setState(s => ({ ...s, isReplying: true }));

    const { data, error } = await addReply(commentId, content, mentions);

    setState(s => ({
      ...s,
      isReplying: false,
      comments: data ? s.comments.map(c =>
        c.id === commentId
          ? { ...c, replies: [...(c.replies ?? []), data] }
          : c
      ) : s.comments,
      error,
    }));
  }, []);

  const toggleResolve = useCallback(async (commentId: string) => {
    if (!workspaceId) return;
    const { data } = await toggleCommentResolved(commentId, workspaceId);
    if (data) {
      setState(s => ({
        ...s,
        comments: s.comments.map(c => c.id === commentId ? { ...c, ...data } : c),
      }));
    }
  }, [workspaceId]);

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
    if (error) load(); // Revert on failure
  }, [state.comments, load]);

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

  // Filtered helpers
  const getCommentsForSection = useCallback((sectionId: string) =>
    state.comments.filter(c => c.sectionId === sectionId && !c.isResolved),
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
    toggleResolve, removeComment, removeReply,
    getCommentsForSection, getThreadCount,
  };
}