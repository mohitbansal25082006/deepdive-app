// src/services/memberProfileService.ts
// Part 58.1 — Member profile data for the upgraded MemberProfileCard.
//
// Changes vs Part 13A:
//   • recentReports / recentComments now fetched via dedicated SECURITY DEFINER
//     RPCs (get_member_recent_reports / get_member_recent_comments) so they
//     always carry the report_id + section_id needed for deep-link navigation,
//     and so RLS never hides another member's rows.
//   • Shared content (presentations, papers, podcasts, debates, voice debates)
//     is fetched via get_member_shared_content_stats + get_member_shared_items,
//     each item carrying the CANONICAL content_id used to open the right viewer.
//   • Everything is fetched with a generous limit (the card itself decides how
//     many to show initially and reveals the rest on "Show all").
//
// All shapes are exported so the hook + card can consume them directly.

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
  /** reportId needed so we can navigate to the right workspace-report */
  reportId:     string;
  reportTitle:  string;
  content:      string;
  createdAt:    string;
  sectionId:    string | null;
}

/** Part 58.1: one shared item with the canonical content_id for navigation. */
export type MemberSharedContentType =
  | 'presentation' | 'academic_paper' | 'podcast' | 'debate' | 'voice_debate';

export interface MemberSharedContentItem {
  /** Stable key for list rendering (the shared-row id). */
  id:          string;
  contentType: MemberSharedContentType;
  title:       string;
  subtitle:    string | null;
  /** Canonical content id (presentation/paper/podcast/debate/voice-debate id). */
  contentId:   string;
  reportId:    string | null;
  sharedAt:    string;
}

export interface MemberSharedContentStats {
  presentations: number;
  papers:        number;
  podcasts:      number;
  debates:       number;
  voiceDebates:  number;
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
  sharedStats:     MemberSharedContentStats;
  sharedItems:     MemberSharedContentItem[];
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

    // ── 3. Core counts (parallel) ─────────────────────────────────
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
      repliesMade = 0;
    }

    // ── 5. Recent reports / comments / shared content (parallel RPCs) ─
    const [reportsRes, commentsRes, sharedStatsRes, sharedItemsRes] =
      await Promise.all([
        supabase.rpc('get_member_recent_reports', {
          p_user_id: userId, p_workspace_id: workspaceId, p_limit: 30,
        }),
        supabase.rpc('get_member_recent_comments', {
          p_user_id: userId, p_workspace_id: workspaceId, p_limit: 30,
        }),
        supabase.rpc('get_member_shared_content_stats', {
          p_user_id: userId, p_workspace_id: workspaceId,
        }),
        supabase.rpc('get_member_shared_items', {
          p_user_id: userId, p_workspace_id: workspaceId, p_limit: 30,
        }),
      ]);

    // ── Map recent reports ─────────────────────────────────────────
    const recentReports: MemberRecentReport[] = Array.isArray(reportsRes.data)
      ? (reportsRes.data as Record<string, unknown>[]).map(row => ({
          id:      (row.id       as string) ?? '',
          title:   (row.title    as string) ?? 'Untitled',
          addedAt: (row.added_at as string) ?? '',
        }))
      : [];

    // ── Map recent comments ────────────────────────────────────────
    const recentComments: MemberRecentComment[] = Array.isArray(commentsRes.data)
      ? (commentsRes.data as Record<string, unknown>[]).map(row => ({
          id:          (row.id           as string) ?? '',
          reportId:    (row.report_id    as string) ?? '',
          reportTitle: (row.report_title as string) ?? 'Untitled',
          content:     (row.content      as string) ?? '',
          createdAt:   (row.created_at   as string) ?? '',
          sectionId:   (row.section_id   as string) ?? null,
        }))
      : [];

    // ── Map shared stats ───────────────────────────────────────────
    const ss = (sharedStatsRes.data ?? {}) as Record<string, number>;
    const sharedStats: MemberSharedContentStats = {
      presentations: ss.presentations ?? 0,
      papers:        ss.papers        ?? 0,
      podcasts:      ss.podcasts      ?? 0,
      debates:       ss.debates       ?? 0,
      voiceDebates:  ss.voice_debates ?? 0,
    };

    // ── Map shared items ───────────────────────────────────────────
    const sharedItems: MemberSharedContentItem[] = Array.isArray(sharedItemsRes.data)
      ? (sharedItemsRes.data as Record<string, unknown>[]).map(row => ({
          id:          (row.id           as string) ?? '',
          contentType: (row.content_type as MemberSharedContentType),
          title:       (row.title        as string) ?? 'Untitled',
          subtitle:    (row.subtitle     as string) ?? null,
          contentId:   (row.content_id   as string) ?? '',
          reportId:    (row.report_id    as string) ?? null,
          sharedAt:    (row.shared_at    as string) ?? '',
        }))
      : [];

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
      sharedStats,
      sharedItems,
    };

    return { data, error: null };
  } catch (err) {
    return {
      data:  null,
      error: err instanceof Error ? err.message : 'Failed to load member profile',
    };
  }
}