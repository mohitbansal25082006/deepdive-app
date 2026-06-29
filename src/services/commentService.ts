// src/services/commentService.ts
// Part 58.1 — Resolve/unresolve removed from the client surface.
//   • toggleCommentResolved RPC wrapper deleted (DB function/column remain,
//     simply unused — non-destructive).
//   • Mappers still read is_resolved from the DB for type-compatibility with
//     ReportComment, but the UI no longer uses it. Defaults are safe.
//   • Part 46 realtime "unknown author" fix preserved.

import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { ReportComment, CommentReply } from '../types';

// ─── Mappers ──────────────────────────────────────────────────────────────────

function mapComment(row: Record<string, unknown>): ReportComment {
  const author = row.author as Record<string, unknown> | undefined;
  const rawReplies = row.replies as Record<string, unknown>[] | undefined;

  return {
    id:          row.id as string,
    workspaceId: row.workspace_id as string,
    reportId:    row.report_id as string,
    sectionId:   (row.section_id as string) ?? null,
    userId:      row.user_id as string,
    content:     row.content as string,
    isResolved:  (row.is_resolved as boolean) ?? false,
    resolvedBy:  (row.resolved_by as string) ?? null,
    resolvedAt:  (row.resolved_at as string) ?? null,
    mentions:    (row.mentions as string[]) ?? [],
    createdAt:   row.created_at as string,
    updatedAt:   row.updated_at as string,
    author: author ? {
      id:        author.id as string,
      username:  (author.username  as string) ?? null,
      fullName:  (author.full_name as string) ?? null,
      avatarUrl: (author.avatar_url as string) ?? null,
    } : undefined,
    replies: rawReplies?.map((r) => mapReply(r)) ?? [],
  };
}

function mapReply(row: Record<string, unknown>): CommentReply {
  const replyData = (row.reply ?? row) as Record<string, unknown>;
  const author = (row.author ?? replyData.author) as Record<string, unknown> | undefined;
  return {
    id:        replyData.id as string,
    commentId: replyData.comment_id as string,
    userId:    replyData.user_id as string,
    content:   replyData.content as string,
    mentions:  (replyData.mentions as string[]) ?? [],
    createdAt: replyData.created_at as string,
    updatedAt: replyData.updated_at as string,
    author: author ? {
      id:        author.id as string,
      username:  (author.username  as string) ?? null,
      fullName:  (author.full_name as string) ?? null,
      avatarUrl: (author.avatar_url as string) ?? null,
    } : undefined,
  };
}

// ─── Profile fetch helper (Part 46) ───────────────────────────────────────────

async function fetchProfile(userId: string): Promise<{
  id: string;
  username: string | null;
  fullName: string | null;
  avatarUrl: string | null;
} | undefined> {
  try {
    const { data } = await supabase
      .from('profiles')
      .select('id, username, full_name, avatar_url')
      .eq('id', userId)
      .single();
    if (!data) return undefined;
    const p = data as Record<string, unknown>;
    return {
      id:        p.id as string,
      username:  (p.username   as string) ?? null,
      fullName:  (p.full_name  as string) ?? null,
      avatarUrl: (p.avatar_url as string) ?? null,
    };
  } catch {
    return undefined;
  }
}

// ─── Fetch comments (with replies) ─────────────────────────────────────────────

export async function fetchComments(
  reportId: string,
  workspaceId: string,
): Promise<{ data: ReportComment[]; error: string | null }> {
  try {
    const { data, error } = await supabase
      .rpc('get_report_comments_with_profiles', {
        p_report_id:    reportId,
        p_workspace_id: workspaceId,
      });

    if (error) throw error;
    const rows = (data as Record<string, unknown>[]) ?? [];
    return { data: rows.map(mapComment), error: null };
  } catch (err) {
    return { data: [], error: err instanceof Error ? err.message : 'Failed to load comments' };
  }
}

// ─── Fetch section comment counts ────────────────────────────────────────────

export async function fetchSectionCommentCounts(
  reportId: string,
  workspaceId: string,
): Promise<{ data: Record<string, number>; error: string | null }> {
  try {
    const { data, error } = await supabase
      .rpc('get_section_comment_counts', {
        p_report_id:    reportId,
        p_workspace_id: workspaceId,
      });
    if (error) throw error;
    return { data: (data as Record<string, number>) ?? {}, error: null };
  } catch (err) {
    return { data: {}, error: err instanceof Error ? err.message : 'Failed to load counts' };
  }
}

// ─── Add a comment ────────────────────────────────────────────────────────────

export async function addComment(
  workspaceId: string,
  reportId: string,
  content: string,
  sectionId?: string,
  mentions: string[] = [],
): Promise<{ data: ReportComment | null; error: string | null }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('report_comments')
      .insert({
        workspace_id: workspaceId,
        report_id:    reportId,
        section_id:   sectionId ?? null,
        user_id:      user.id,
        content:      content.trim(),
        mentions,
      })
      .select()
      .single();

    if (error) throw error;

    await supabase.from('workspace_activity').insert({
      workspace_id:  workspaceId,
      user_id:       user.id,
      action:        'comment_added',
      resource_type: 'comment',
      resource_id:   (data as Record<string, unknown>).id as string,
      metadata:      { report_id: reportId, section_id: sectionId ?? null },
    });

    const profile = await fetchProfile(user.id);

    const row = data as Record<string, unknown>;
    return {
      data: {
        id:          row.id as string,
        workspaceId: row.workspace_id as string,
        reportId:    row.report_id as string,
        sectionId:   (row.section_id as string) ?? null,
        userId:      row.user_id as string,
        content:     row.content as string,
        isResolved:  false,
        resolvedBy:  null, resolvedAt: null,
        mentions:    (row.mentions as string[]) ?? [],
        createdAt:   row.created_at as string,
        updatedAt:   row.updated_at as string,
        replies:     [],
        author:      profile,
      },
      error: null,
    };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : 'Failed to add comment' };
  }
}

// ─── Add a reply ──────────────────────────────────────────────────────────────

export async function addReply(
  commentId: string,
  content: string,
  mentions: string[] = [],
): Promise<{ data: CommentReply | null; error: string | null }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('comment_replies')
      .insert({ comment_id: commentId, user_id: user.id, content: content.trim(), mentions })
      .select()
      .single();

    if (error) throw error;

    const profile = await fetchProfile(user.id);

    const row = data as Record<string, unknown>;
    return {
      data: {
        id:        row.id as string,
        commentId: row.comment_id as string,
        userId:    row.user_id as string,
        content:   row.content as string,
        mentions:  (row.mentions as string[]) ?? [],
        createdAt: row.created_at as string,
        updatedAt: row.updated_at as string,
        author:    profile,
      },
      error: null,
    };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : 'Failed to add reply' };
  }
}

// ─── Delete a comment ─────────────────────────────────────────────────────────

export async function deleteComment(commentId: string): Promise<{ error: string | null }> {
  try {
    const { error } = await supabase
      .from('report_comments')
      .delete()
      .eq('id', commentId);
    if (error) throw error;
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to delete comment' };
  }
}

// ─── Delete a reply ───────────────────────────────────────────────────────────

export async function deleteReply(replyId: string): Promise<{ error: string | null }> {
  try {
    const { error } = await supabase
      .from('comment_replies')
      .delete()
      .eq('id', replyId);
    if (error) throw error;
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to delete reply' };
  }
}

// ─── Realtime subscription ────────────────────────────────────────────────────

export function subscribeToComments(
  reportId: string,
  workspaceId: string,
  callbacks: {
    onInsert:      (comment: Partial<ReportComment>) => void;
    onUpdate:      (comment: Partial<ReportComment>) => void;
    onDelete:      (commentId: string) => void;
    onReplyInsert: (reply: Partial<CommentReply>) => void;
  },
): () => void {
  const channel: RealtimeChannel = supabase
    .channel(`ws:${workspaceId}:comments:${reportId}`)
    .on(
      'postgres_changes',
      {
        event:  'INSERT',
        schema: 'public',
        table:  'report_comments',
        filter: `report_id=eq.${reportId}`,
      },
      async (payload) => {
        const row = payload.new as Record<string, unknown>;
        const author = await fetchProfile(row.user_id as string);

        callbacks.onInsert({
          id:          row.id as string,
          workspaceId: row.workspace_id as string,
          reportId:    row.report_id as string,
          sectionId:   (row.section_id as string) ?? null,
          userId:      row.user_id as string,
          content:     row.content as string,
          isResolved:  false,
          resolvedBy:  null, resolvedAt: null,
          mentions:    (row.mentions as string[]) ?? [],
          createdAt:   row.created_at as string,
          updatedAt:   row.updated_at as string,
          replies:     [],
          author,
        });
      },
    )
    .on(
      'postgres_changes',
      {
        event:  'UPDATE',
        schema: 'public',
        table:  'report_comments',
        filter: `report_id=eq.${reportId}`,
      },
      (payload) => {
        const row = payload.new as Record<string, unknown>;
        // Part 58.1: only reconcile content edits (resolve state ignored).
        callbacks.onUpdate({
          id:        row.id as string,
          content:   row.content as string,
          updatedAt: row.updated_at as string,
        });
      },
    )
    .on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'report_comments' },
      (payload) => {
        callbacks.onDelete((payload.old as Record<string, unknown>).id as string);
      },
    )
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'comment_replies' },
      async (payload) => {
        const row = payload.new as Record<string, unknown>;
        const author = await fetchProfile(row.user_id as string);

        callbacks.onReplyInsert({
          id:        row.id as string,
          commentId: row.comment_id as string,
          userId:    row.user_id as string,
          content:   row.content as string,
          mentions:  (row.mentions as string[]) ?? [],
          createdAt: row.created_at as string,
          updatedAt: row.updated_at as string,
          author,
        });
      },
    )
    .subscribe();

  return () => { supabase.removeChannel(channel); };
}