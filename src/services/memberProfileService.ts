// src/services/memberProfileService.ts
// Part 12 — Fetches per-member profile data + workspace-specific stats.
// Used by MemberProfileCard (tap a member's avatar to view their card).
//
// REQUIRES: schema_patch_part12_rls_fix.sql to be applied first.
// That migration adds the "profiles_select_co_members" RLS policy
// which allows workspace members to read each other's profiles.

import { supabase } from '../lib/supabase';
import { MiniProfile, WorkspaceRole } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MemberWorkspaceStats {
  role:           WorkspaceRole;
  joinedAt:       string;
  reportsAdded:   number;
  commentsMade:   number;
  repliesMade:    number;
  reportsPinned:  number;
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

export interface MemberRecentReport {
  id:      string;
  title:   string;
  query:   string;
  addedAt: string;
}

export interface MemberRecentComment {
  id:          string;
  content:     string;
  reportTitle: string;
  createdAt:   string;
  sectionId:   string | null;
}

// ─── Default fallback stats ───────────────────────────────────────────────────

function defaultStats(role: WorkspaceRole = 'viewer', joinedAt = ''): MemberWorkspaceStats {
  return { role, joinedAt, reportsAdded: 0, commentsMade: 0, repliesMade: 0, reportsPinned: 0 };
}

// ─── Main fetch ───────────────────────────────────────────────────────────────

export async function fetchMemberProfile(
  userId:      string,
  workspaceId: string,
): Promise<{ data: MemberProfileData | null; error: string | null }> {

  if (!userId || !workspaceId) {
    return { data: null, error: 'Missing userId or workspaceId.' };
  }

  try {

    // ── 1. Profile row ────────────────────────────────────────────────────────
    // Requires "profiles_select_co_members" RLS policy from
    // schema_patch_part12_rls_fix.sql — without it this returns null here.
    const { data: profileRow, error: profileErr } = await supabase
      .from('profiles')
      .select('id, username, full_name, avatar_url, bio, occupation, interests')
      .eq('id', userId)
      .maybeSingle();   // maybeSingle returns null (not error) when RLS hides the row

    if (profileErr) {
      console.error('[memberProfileService] profiles fetch error:', profileErr.message, profileErr.code);
      return { data: null, error: `Failed to load profile: ${profileErr.message}` };
    }

    if (!profileRow) {
      // RLS is blocking this read — the co-member SELECT policy is missing.
      console.warn(
        '[memberProfileService] Profile row not visible for userId:', userId,
        '\nFix: run schema_patch_part12_rls_fix.sql in your Supabase SQL editor.'
      );
      return {
        data: null,
        error: 'Profile not visible. Apply schema_patch_part12_rls_fix.sql in Supabase to fix.',
      };
    }

    const p = profileRow as Record<string, unknown>;

    const profile: MiniProfile = {
      id:        p.id as string,
      username:  (p.username   as string | null) ?? null,
      fullName:  (p.full_name  as string | null) ?? null,
      avatarUrl: (p.avatar_url as string | null) ?? null,
    };

    // ── 2. Role + join date from workspace_members ────────────────────────────
    let workspaceRole: WorkspaceRole = 'viewer';
    let joinedAt = '';

    try {
      const { data: memberRow } = await supabase
        .from('workspace_members')
        .select('role, joined_at')
        .eq('workspace_id', workspaceId)
        .eq('user_id', userId)
        .maybeSingle();

      if (memberRow) {
        const m = memberRow as Record<string, unknown>;
        workspaceRole = (m.role      as WorkspaceRole) ?? 'viewer';
        joinedAt      = (m.joined_at as string)        ?? '';
      }
    } catch (e) {
      console.warn('[memberProfileService] workspace_members lookup failed (non-fatal):', e);
    }

    // ── 3. Workspace stats via RPC (best-effort) ──────────────────────────────
    let workspaceStats: MemberWorkspaceStats = defaultStats(workspaceRole, joinedAt);

    try {
      const { data: statsRaw, error: statsErr } = await supabase
        .rpc('get_member_workspace_stats', {
          p_workspace_id: workspaceId,
          p_user_id:      userId,
        });

      if (!statsErr && statsRaw) {
        const s = statsRaw as Record<string, unknown>;
        workspaceStats = {
          role:          (s.role       as WorkspaceRole) ?? workspaceRole,
          joinedAt:      (s.joined_at  as string)        ?? joinedAt,
          reportsAdded:  Number(s.reports_added)         || 0,
          commentsMade:  Number(s.comments_made)         || 0,
          repliesMade:   Number(s.replies_made)          || 0,
          reportsPinned: Number(s.reports_pinned)        || 0,
        };
      } else if (statsErr) {
        console.warn('[memberProfileService] stats RPC failed (non-fatal):', statsErr.message);
      }
    } catch (e) {
      console.warn('[memberProfileService] stats RPC exception (non-fatal):', e);
    }

    // ── 4. Recent reports (best-effort) ──────────────────────────────────────
    let recentReports: MemberRecentReport[] = [];
    try {
      const { data: reportRows, error: reportErr } = await supabase
        .from('workspace_reports')
        .select('report_id, added_at')
        .eq('workspace_id', workspaceId)
        .eq('added_by', userId)
        .order('added_at', { ascending: false })
        .limit(5);

      if (!reportErr && reportRows && reportRows.length > 0) {
        const reportIds = (reportRows as Record<string, unknown>[])
          .map((r) => r.report_id as string)
          .filter(Boolean);

        const titleMap: Record<string, string> = {};
        if (reportIds.length > 0) {
          const { data: titleRows } = await supabase
            .from('research_reports')
            .select('id, title, query')
            .in('id', reportIds);

          if (titleRows) {
            for (const t of titleRows as Record<string, unknown>[]) {
              titleMap[t.id as string] =
                (t.title as string) ?? (t.query as string) ?? 'Untitled';
            }
          }
        }

        recentReports = (reportRows as Record<string, unknown>[])
          .map((row) => ({
            id:      (row.report_id as string) ?? '',
            title:   titleMap[row.report_id as string] ?? 'Untitled',
            query:   '',
            addedAt: (row.added_at  as string) ?? '',
          }))
          .filter((r) => r.id);
      }
    } catch (e) {
      console.warn('[memberProfileService] recent reports failed (non-fatal):', e);
    }

    // ── 5. Recent comments (best-effort) ─────────────────────────────────────
    let recentComments: MemberRecentComment[] = [];
    try {
      const { data: commentRows, error: commentErr } = await supabase
        .from('report_comments')
        .select('id, content, section_id, created_at, report_id')
        .eq('workspace_id', workspaceId)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(5);

      if (!commentErr && commentRows && commentRows.length > 0) {
        const reportIds = (commentRows as Record<string, unknown>[])
          .map((r) => r.report_id as string)
          .filter(Boolean);

        const titleMap: Record<string, string> = {};
        if (reportIds.length > 0) {
          const { data: titleRows } = await supabase
            .from('research_reports')
            .select('id, title, query')
            .in('id', reportIds);

          if (titleRows) {
            for (const t of titleRows as Record<string, unknown>[]) {
              titleMap[t.id as string] =
                (t.title as string) ?? (t.query as string) ?? 'Report';
            }
          }
        }

        recentComments = (commentRows as Record<string, unknown>[]).map((row) => ({
          id:          (row.id         as string)       ?? '',
          content:     (row.content    as string)       ?? '',
          sectionId:   (row.section_id as string | null) ?? null,
          createdAt:   (row.created_at as string)       ?? '',
          reportTitle: titleMap[row.report_id as string] ?? 'Report',
        }));
      }
    } catch (e) {
      console.warn('[memberProfileService] recent comments failed (non-fatal):', e);
    }

    return {
      data: {
        profile,
        bio:        (p.bio        as string | null)   ?? null,
        occupation: (p.occupation as string | null)   ?? null,
        interests:  (p.interests  as string[] | null) ?? null,
        workspaceStats,
        recentReports,
        recentComments,
      },
      error: null,
    };

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load member profile';
    console.error('[memberProfileService] Unexpected error:', message);
    return { data: null, error: message };
  }
}