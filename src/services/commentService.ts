// src/services/commentService.ts
// Part 46 UPDATE — Fixed "unknown author" bug on realtime comment inserts.
//
// Root cause: Supabase Realtime INSERT payload only contains raw DB columns —
//   no JOINed data. So payload.new.author is always undefined for other users'
//   comments. Previously we returned the partial comment with no author, so the
//   sender showed as "Unknown" until the recipient refreshed.
//
// Fix: In subscribeToComments, after receiving an INSERT event, immediately
//   fetch the author's profile from the profiles table and attach it to the
//   comment before calling onInsert. Same fix for onReplyInsert.
//
// All other Part 11/12 functionality is preserved exactly.

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
    isResolved:  row.is_resolved as boolean,
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

// ─── Part 46: Profile fetch helper ───────────────────────────────────────────
// Used after realtime INSERT events to attach the author profile.

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

// ─── Fetch comments (with replies) for a report in a workspace ────────────────

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

    // Log activity
    await supabase.from('workspace_activity').insert({
      workspace_id:  workspaceId,
      user_id:       user.id,
      action:        'comment_added',
      resource_type: 'comment',
      resource_id:   (data as Record<string, unknown>).id as string,
      metadata:      { report_id: reportId, section_id: sectionId ?? null },
    });

    // Fetch own profile so the comment shows correct author immediately
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
        isResolved:  row.is_resolved as boolean,
        resolvedBy:  null, resolvedAt: null,
        mentions:    (row.mentions as string[]) ?? [],
        createdAt:   row.created_at as string,
        updatedAt:   row.updated_at as string,
        replies:     [],
        // Part 46: attach own profile so sender sees correct name immediately
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

    // Fetch own profile for immediate display
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
        // Part 46: attach own profile
        author:    profile,
      },
      error: null,
    };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : 'Failed to add reply' };
  }
}

// ─── Toggle resolve state ─────────────────────────────────────────────────────

export async function toggleCommentResolved(
  commentId: string,
  workspaceId: string,
): Promise<{ data: ReportComment | null; error: string | null }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .rpc('toggle_comment_resolved', { p_comment_id: commentId });

    if (error) throw error;

    await supabase.from('workspace_activity').insert({
      workspace_id:  workspaceId,
      user_id:       user.id,
      action:        'comment_resolved',
      resource_type: 'comment',
      resource_id:   commentId,
    });

    const row = data as Record<string, unknown>;
    return {
      data: mapComment({ ...row, author: undefined, replies: undefined }),
      error: null,
    };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : 'Failed to toggle comment' };
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

// ─── Realtime subscription for comments ──────────────────────────────────────
// Part 46 FIX: After receiving INSERT events from other users, we immediately
// fetch their profile so they show the correct name/avatar without refresh.

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

        // Part 46 FIX: Fetch the author profile immediately so the
        // realtime comment shows the correct name/avatar on all devices.
        const author = await fetchProfile(row.user_id as string);

        callbacks.onInsert({
          id:          row.id as string,
          workspaceId: row.workspace_id as string,
          reportId:    row.report_id as string,
          sectionId:   (row.section_id as string) ?? null,
          userId:      row.user_id as string,
          content:     row.content as string,
          isResolved:  (row.is_resolved as boolean) ?? false,
          resolvedBy:  null, resolvedAt: null,
          mentions:    (row.mentions as string[]) ?? [],
          createdAt:   row.created_at as string,
          updatedAt:   row.updated_at as string,
          replies:     [],
          author,      // ← attached from DB fetch
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
        callbacks.onUpdate({
          id:          row.id as string,
          isResolved:  row.is_resolved as boolean,
          resolvedBy:  (row.resolved_by as string) ?? null,
          resolvedAt:  (row.resolved_at as string) ?? null,
          content:     row.content as string,
          updatedAt:   row.updated_at as string,
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

        // Part 46 FIX: Fetch the reply author's profile immediately.
        const author = await fetchProfile(row.user_id as string);

        callbacks.onReplyInsert({
          id:        row.id as string,
          commentId: row.comment_id as string,
          userId:    row.user_id as string,
          content:   row.content as string,
          mentions:  (row.mentions as string[]) ?? [],
          createdAt: row.created_at as string,
          updatedAt: row.updated_at as string,
          author,    // ← attached from DB fetch
        });
      },
    )
    .subscribe();

  return () => { supabase.removeChannel(channel); };
}