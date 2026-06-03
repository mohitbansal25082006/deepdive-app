// src/hooks/useWorkspaceRealtime.ts
// Part 46 Fix 2 v3 — Uses realtime.send() triggers with correct payload structure.
//
// KEY FIXES from v2:
//   1. supabase.realtime.setAuth() before subscribing — required for private channels.
//   2. realtime.send() payload arrives as payload.payload (not payload.payload.record).
//      broadcast_changes() uses payload.payload.record / payload.payload.old_record.
//      We switched to realtime.send() with simple JSON so payload.payload is flat.
//   3. Pin channel uses event "pin_change" (matches trigger), reads
//      payload.payload.report_id and payload.payload.pinned directly.
//   4. Kick channel uses event "workspace_kick" (matches trigger).
//   5. Role channel uses event "role_change" (matches trigger).
//   6. Unique instanceId per hook prevents channel name collisions between
//      useWorkspace and useWorkspaceMembers instances (preserved from v2).

import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { WorkspaceRole } from '../types';

let _instanceCounter = 0;

export interface WorkspaceRealtimeCallbacks {
  onMemberInsert?:        (userId: string, role: WorkspaceRole) => void;
  onMemberDelete?:        (userId: string) => void;
  onMemberUpdate?:        (userId: string, role: WorkspaceRole) => void;
  onSelfRemoved?:         () => void;
  onReportInsert?:        (workspaceReportId: string, reportId: string) => void;
  onReportDelete?:        (workspaceReportId: string, reportId: string) => void;
  onReportUpdate?:        (workspaceReportId: string, reportId: string, isPinned?: boolean) => void;
  onPinChanged?:          (reportId: string, pinned: boolean) => void;
  onSharedContentInsert?: (contentType: string, contentId: string) => void;
  onSharedContentDelete?: (contentType: string, contentId: string) => void;
  onActivityInsert?:      (activityId: string) => void;
  onCommentInsert?:       (commentId: string, userId: string) => void;
  onCommentUpdate?:       (commentId: string) => void;
  onCommentDelete?:       (commentId: string) => void;
  onReplyInsert?:         (replyId: string, commentId: string, userId: string) => void;
  onReplyDelete?:         (replyId: string, commentId: string) => void;
}

export function useWorkspaceRealtime(
  workspaceId: string | null,
  callbacks: WorkspaceRealtimeCallbacks,
) {
  const { user } = useAuth();
  const cbRef      = useRef(callbacks);
  // Unique per-instance ID — prevents channel name collisions when
  // useWorkspace and useWorkspaceMembers both mount with the same workspaceId
  const instanceId = useRef(`i${++_instanceCounter}`).current;

  useEffect(() => { cbRef.current = callbacks; }, [callbacks]);

  const setupChannels = useCallback(() => {
    if (!workspaceId || !user) return () => {};

    // Required for all private Broadcast channels
    supabase.realtime.setAuth();

    const pfx = `p46:${instanceId}:ws:${workspaceId}`;
    const channels: ReturnType<typeof supabase.channel>[] = [];

    // ── 0a. PRIVATE BROADCAST: kick signal (remove OR block) ──────────────
    // Trigger broadcast_member_removed() → event "workspace_kick"
    // Trigger broadcast_member_blocked() → same event, same channel
    // Payload (from realtime.send): { type, workspace_id, user_id }
    const kickChannel = supabase
      .channel(`workspace_member_removed:${user.id}`, { config: { private: true } })
      .on('broadcast', { event: 'workspace_kick' }, (payload) => {
        const data          = (payload.payload ?? {}) as Record<string, unknown>;
        const kickedWsId    = data.workspace_id as string | undefined;
        if (kickedWsId === workspaceId) {
          cbRef.current.onSelfRemoved?.();
        }
      })
      .subscribe();
    channels.push(kickChannel);

    // ── 0b. PRIVATE BROADCAST: pin changes ────────────────────────────────
    // Trigger broadcast_pin_change() → event "pin_change"
    // Payload (from realtime.send): { workspace_id, report_id, pinned }
    const pinChannel = supabase
      .channel(`workspace_pins:${workspaceId}`, { config: { private: true } })
      .on('broadcast', { event: 'pin_change' }, (payload) => {
        const data     = (payload.payload ?? {}) as Record<string, unknown>;
        const reportId = data.report_id as string | undefined;
        const pinned   = data.pinned   as boolean | undefined;
        if (reportId !== undefined && pinned !== undefined) {
          cbRef.current.onPinChanged?.(reportId, pinned);
        }
      })
      .subscribe();
    channels.push(pinChannel);

    // ── 0c. PRIVATE BROADCAST: role changes ───────────────────────────────
    // Trigger broadcast_role_change() → event "role_change"
    // Payload (from realtime.send): { user_id, workspace_id, role }
    const roleChannel = supabase
      .channel(`workspace_members:${workspaceId}`, { config: { private: true } })
      .on('broadcast', { event: 'role_change' }, (payload) => {
        const data   = (payload.payload ?? {}) as Record<string, unknown>;
        const userId = data.user_id as string | undefined;
        const role   = data.role   as WorkspaceRole | undefined;
        if (userId && role) {
          cbRef.current.onMemberUpdate?.(userId, role);
        }
      })
      .subscribe();
    channels.push(roleChannel);

    // ── 1. workspace_members Postgres Changes (INSERT + DELETE fallback) ──
    const membersChannel = supabase
      .channel(`${pfx}:members`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'workspace_members',
          filter: `workspace_id=eq.${workspaceId}` },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          cbRef.current.onMemberInsert?.(row.user_id as string, row.role as WorkspaceRole);
        })
      .on('postgres_changes',
        // UPDATE fallback — Broadcast trigger is primary, this is belt-and-suspenders
        { event: 'UPDATE', schema: 'public', table: 'workspace_members',
          filter: `workspace_id=eq.${workspaceId}` },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          cbRef.current.onMemberUpdate?.(row.user_id as string, row.role as WorkspaceRole);
        })
      .on('postgres_changes',
        // DELETE fallback — payload.old may only have {id} with RLS, but
        // the Broadcast kick channel above is the reliable mechanism
        { event: 'DELETE', schema: 'public', table: 'workspace_members',
          filter: `workspace_id=eq.${workspaceId}` },
        (payload) => {
          const old = payload.old as Record<string, unknown>;
          const deletedUserId = (old.user_id ?? null) as string | null;
          if (deletedUserId) {
            cbRef.current.onMemberDelete?.(deletedUserId);
            if (deletedUserId === user.id) cbRef.current.onSelfRemoved?.();
          }
        })
      .subscribe();
    channels.push(membersChannel);

    // ── 2. workspace_blocked_members (INSERT fallback) ────────────────────
    const blockedChannel = supabase
      .channel(`${pfx}:blocked`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'workspace_blocked_members',
          filter: `workspace_id=eq.${workspaceId}` },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          if ((row.blocked_user_id as string) === user.id) cbRef.current.onSelfRemoved?.();
        })
      .subscribe();
    channels.push(blockedChannel);

    // ── 3. workspace_reports ──────────────────────────────────────────────
    const reportsChannel = supabase
      .channel(`${pfx}:reports`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'workspace_reports',
          filter: `workspace_id=eq.${workspaceId}` },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          cbRef.current.onReportInsert?.(row.id as string, row.report_id as string);
        })
      .on('postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'workspace_reports',
          filter: `workspace_id=eq.${workspaceId}` },
        (payload) => {
          const old = payload.old as Record<string, unknown>;
          cbRef.current.onReportDelete?.(old.id as string, old.report_id as string);
        })
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'workspace_reports',
          filter: `workspace_id=eq.${workspaceId}` },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          cbRef.current.onReportUpdate?.(row.id as string, row.report_id as string, undefined);
        })
      .subscribe();
    channels.push(reportsChannel);

    // ── 4. shared_workspace_content (presentations + papers) ─────────────
    const sharedContentChannel = supabase
      .channel(`${pfx}:shared_content`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'shared_workspace_content',
          filter: `workspace_id=eq.${workspaceId}` },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          cbRef.current.onSharedContentInsert?.(row.content_type as string, row.content_id as string);
        })
      .on('postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'shared_workspace_content',
          filter: `workspace_id=eq.${workspaceId}` },
        (payload) => {
          const old = payload.old as Record<string, unknown>;
          cbRef.current.onSharedContentDelete?.(old.content_type as string, old.content_id as string);
        })
      .subscribe();
    channels.push(sharedContentChannel);

    // ── 5. shared_podcasts ────────────────────────────────────────────────
    const sharedPodcastsChannel = supabase
      .channel(`${pfx}:shared_podcasts`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'shared_podcasts',
          filter: `workspace_id=eq.${workspaceId}` },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          cbRef.current.onSharedContentInsert?.('podcast', row.podcast_id as string);
        })
      .on('postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'shared_podcasts',
          filter: `workspace_id=eq.${workspaceId}` },
        (payload) => {
          const old = payload.old as Record<string, unknown>;
          cbRef.current.onSharedContentDelete?.('podcast', old.podcast_id as string);
        })
      .subscribe();
    channels.push(sharedPodcastsChannel);

    // ── 6. shared_debates ─────────────────────────────────────────────────
    const sharedDebatesChannel = supabase
      .channel(`${pfx}:shared_debates`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'shared_debates',
          filter: `workspace_id=eq.${workspaceId}` },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          cbRef.current.onSharedContentInsert?.('debate', row.debate_id as string);
        })
      .on('postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'shared_debates',
          filter: `workspace_id=eq.${workspaceId}` },
        (payload) => {
          const old = payload.old as Record<string, unknown>;
          cbRef.current.onSharedContentDelete?.('debate', old.debate_id as string);
        })
      .subscribe();
    channels.push(sharedDebatesChannel);

    // ── 6b. shared_voice_debates ──────────────────────────────────────────
    const sharedVoiceDebatesChannel = supabase
      .channel(`${pfx}:shared_voice_debates`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'shared_voice_debates',
          filter: `workspace_id=eq.${workspaceId}` },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          cbRef.current.onSharedContentInsert?.('voice_debate', row.voice_debate_id as string);
        })
      .on('postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'shared_voice_debates',
          filter: `workspace_id=eq.${workspaceId}` },
        (payload) => {
          const old = payload.old as Record<string, unknown>;
          cbRef.current.onSharedContentDelete?.('voice_debate', old.voice_debate_id as string);
        })
      .subscribe();
    channels.push(sharedVoiceDebatesChannel);

    // ── 7. workspace_activity ─────────────────────────────────────────────
    const activityChannel = supabase
      .channel(`${pfx}:activity`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'workspace_activity',
          filter: `workspace_id=eq.${workspaceId}` },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          cbRef.current.onActivityInsert?.(row.id as string);
        })
      .subscribe();
    channels.push(activityChannel);

    // ── 8. report_comments ────────────────────────────────────────────────
    const commentsChannel = supabase
      .channel(`${pfx}:comments`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'report_comments',
          filter: `workspace_id=eq.${workspaceId}` },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          cbRef.current.onCommentInsert?.(row.id as string, row.user_id as string);
        })
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'report_comments',
          filter: `workspace_id=eq.${workspaceId}` },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          cbRef.current.onCommentUpdate?.(row.id as string);
        })
      .on('postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'report_comments' },
        (payload) => {
          const old = payload.old as Record<string, unknown>;
          cbRef.current.onCommentDelete?.(old.id as string);
        })
      .subscribe();
    channels.push(commentsChannel);

    // ── 9. comment_replies ────────────────────────────────────────────────
    const repliesChannel = supabase
      .channel(`${pfx}:replies`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'comment_replies' },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          cbRef.current.onReplyInsert?.(row.id as string, row.comment_id as string, row.user_id as string);
        })
      .on('postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'comment_replies' },
        (payload) => {
          const old = payload.old as Record<string, unknown>;
          cbRef.current.onReplyDelete?.(old.id as string, old.comment_id as string);
        })
      .subscribe();
    channels.push(repliesChannel);

    return () => { channels.forEach(ch => supabase.removeChannel(ch)); };
  }, [workspaceId, user, instanceId]);

  useEffect(() => {
    const cleanup = setupChannels();
    return cleanup;
  }, [setupChannels]);
}