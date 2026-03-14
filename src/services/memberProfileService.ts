// src/services/memberProfileService.ts
// Part 12 — Member profile data for the MemberProfileCard bottom sheet.
// Part 13A UPDATE — Added `reportId` field to MemberRecentComment
//                   so tapping a comment can navigate to the right report.
//                   Uses count_member_replies_in_workspace RPC (schema_part13.sql).

import { supabase } from '../lib/supabase';
import { MiniProfile, WorkspaceRole } from '../types';

// ─── Data shapes ─────────────────────────────────────────────────────────────

export interface MemberRecentReport {
  /** The research_reports.id — used for workspace-report navigation */
  id:      string;
  title:   string;
  addedAt: string;
}

export interface MemberRecentComment {
  id:           string;
  /** Part 13A — reportId needed so we can navigate to the right workspace-report */
  reportId:     string;
  reportTitle:  string;
  content:      string;
  createdAt:    string;
  sectionId:    string | null;
}

export interface MemberWorkspaceStats {
  role:          WorkspaceRole;
  joinedAt:      string;
  reportsAdded:  number;
  commentsMade:  number;
  repliesMade:   number;
  reportsPinned: number;
}

export interface MemberProfileData {
  profile:         MiniProfile;
  bio:             string | null;
  occupation:      string | null;
  interests:       string[] | null;
  workspaceStats:  MemberWorkspaceStats;
  recentReports:   MemberRecentReport[];
  recentComments:  MemberRecentComment[];
}

// ─── Fetch full member profile ────────────────────────────────────────────────

export async function fetchMemberProfile(
  userId:      string,
  workspaceId: string,
): Promise<{ data: MemberProfileData | null; error: string | null }> {
  try {
    // ── 1. Core profile ──────────────────────────────────────────
    const { data: profileRow, error: profileErr } = await supabase
      .from('profiles')
      .select('id, username, full_name, avatar_url, bio, occupation, interests')
      .eq('id', userId)
      .single();

    if (profileErr || !profileRow) {
      throw profileErr ?? new Error('Profile not found');
    }

    const p = profileRow as Record<string, unknown>;

    // ── 2. Workspace membership (role + join date) ────────────────
    const { data: memberRow, error: memberErr } = await supabase
      .from('workspace_members')
      .select('role, joined_at')
      .eq('workspace_id', workspaceId)
      .eq('user_id', userId)
      .single();

    if (memberErr || !memberRow) {
      throw memberErr ?? new Error('Member not found in workspace');
    }

    const m = memberRow as Record<string, unknown>;

    // ── 3. Counts (parallel) ─────────────────────────────────────
    const [
      { count: reportsCount },
      { count: commentsCount },
      { count: pinnedCount },
    ] = await Promise.all([
      supabase
        .from('workspace_reports')
        .select('*', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId)
        .eq('added_by', userId),
      supabase
        .from('report_comments')
        .select('*', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId)
        .eq('user_id', userId),
      supabase
        .from('pinned_workspace_reports')
        .select('*', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId)
        .eq('pinned_by', userId),
    ]);

    // ── 4. Reply count via RPC ────────────────────────────────────
    let repliesMade = 0;
    try {
      const { data: replyData } = await supabase.rpc(
        'count_member_replies_in_workspace',
        { p_workspace_id: workspaceId, p_user_id: userId },
      );
      repliesMade = (replyData as number) ?? 0;
    } catch {
      repliesMade = 0; // graceful fallback if RPC not yet deployed
    }

    // ── 5. Recent reports (last 4 added by this user in workspace) ─
    const { data: reportRows } = await supabase
      .from('workspace_reports')
      .select(`
        report_id,
        added_at,
        report:research_reports ( id, title )
      `)
      .eq('workspace_id', workspaceId)
      .eq('added_by', userId)
      .order('added_at', { ascending: false })
      .limit(4);

    // ── 6. Recent comments — now includes report_id for navigation ─
    const { data: commentRows } = await supabase
      .from('report_comments')
      .select(`
        id,
        report_id,
        content,
        section_id,
        created_at,
        report:research_reports ( title )
      `)
      .eq('workspace_id', workspaceId)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(4);

    // ── Map rows ──────────────────────────────────────────────────

    const recentReports: MemberRecentReport[] = (reportRows ?? []).map(
      (row: Record<string, unknown>) => {
        const r = row.report as Record<string, unknown> | null;
        return {
          id:      (row.report_id as string) ?? '',
          title:   (r?.title as string) ?? 'Untitled',
          addedAt: (row.added_at as string) ?? '',
        };
      },
    );

    const recentComments: MemberRecentComment[] = (commentRows ?? []).map(
      (row: Record<string, unknown>) => {
        const r = row.report as Record<string, unknown> | null;
        return {
          id:          (row.id          as string) ?? '',
          reportId:    (row.report_id   as string) ?? '', // ← Part 13A addition
          reportTitle: (r?.title        as string) ?? 'Untitled',
          content:     (row.content     as string) ?? '',
          createdAt:   (row.created_at  as string) ?? '',
          sectionId:   (row.section_id  as string) ?? null,
        };
      },
    );

    // ── Assemble result ───────────────────────────────────────────

    const data: MemberProfileData = {
      profile: {
        id:        p.id        as string,
        username:  (p.username  as string) ?? null,
        fullName:  (p.full_name as string) ?? null,
        avatarUrl: (p.avatar_url as string) ?? null,
      },
      bio:        (p.bio        as string) ?? null,
      occupation: (p.occupation as string) ?? null,
      interests:  (p.interests  as string[]) ?? null,
      workspaceStats: {
        role:          m.role     as WorkspaceRole,
        joinedAt:      m.joined_at as string,
        reportsAdded:  reportsCount  ?? 0,
        commentsMade:  commentsCount ?? 0,
        repliesMade,
        reportsPinned: pinnedCount   ?? 0,
      },
      recentReports,
      recentComments,
    };

    return { data, error: null };
  } catch (err) {
    return {
      data:  null,
      error: err instanceof Error ? err.message : 'Failed to load member profile',
    };
  }
}