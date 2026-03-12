// src/services/workspaceService.ts
// CRUD and business logic for workspaces & workspace reports.

import { supabase } from '../lib/supabase';
import {
  ResearchReport,
  Workspace, 
  WorkspaceMember, 
  WorkspaceReport,
  WorkspaceRole, 
  WorkspaceSettings,
} from '../types';

// ─── Type mappers (snake_case DB → camelCase TS) ──────────────────────────────

export function mapWorkspace(row: Record<string, unknown>): Workspace {
  return {
    id:          row.id as string,
    name:        row.name as string,
    description: (row.description as string) ?? null,
    avatarUrl:   (row.avatar_url as string)  ?? null,
    inviteCode:  row.invite_code as string,
    ownerId:     row.owner_id as string,
    isPersonal:  row.is_personal as boolean,
    settings:    (row.settings as WorkspaceSettings) ?? {},
    createdAt:   row.created_at as string,
    updatedAt:   row.updated_at as string,
  };
}

export function mapWorkspaceMember(row: Record<string, unknown>): WorkspaceMember {
  const profileRaw = row.profile as Record<string, unknown> | undefined;
  return {
    id:          row.id as string,
    workspaceId: row.workspace_id as string,
    userId:      row.user_id as string,
    role:        row.role as WorkspaceRole,
    invitedBy:   (row.invited_by as string) ?? null,
    joinedAt:    row.joined_at as string,
    profile: profileRaw ? {
      id:        profileRaw.id as string,
      username:  (profileRaw.username as string)  ?? null,
      fullName:  (profileRaw.full_name as string)  ?? null,
      avatarUrl: (profileRaw.avatar_url as string) ?? null,
    } : undefined,
  };
}

// ─── List workspaces the current user belongs to ─────────────────────────────

export async function listUserWorkspaces(): Promise<{ data: Workspace[]; error: string | null }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('workspace_members')
      .select(`
        role,
        workspace:workspaces (
          id, name, description, avatar_url, invite_code,
          owner_id, is_personal, settings, created_at, updated_at
        )
      `)
      .eq('user_id', user.id)
      .order('joined_at', { ascending: false });

    if (error) throw error;

    const workspaces = (data ?? []).map((row: Record<string, unknown>) => {
      const ws = mapWorkspace(row.workspace as Record<string, unknown>);
      // Add userRole property to the workspace object
      return {
        ...ws,
        userRole: row.role as WorkspaceRole
      };
    });

    return { data: workspaces, error: null };
  } catch (err) {
    return { data: [], error: err instanceof Error ? err.message : 'Failed to load workspaces' };
  }
}

// ─── Create workspace (calls RPC that atomically adds owner member row) ───────

export async function createWorkspace(
  name: string,
  description?: string,
  isPersonal = false,
): Promise<{ data: Workspace | null; error: string | null }> {
  try {
    const { data, error } = await supabase
      .rpc('create_workspace', {
        p_name:        name.trim(),
        p_description: description?.trim() ?? null,
        p_is_personal: isPersonal,
      });

    if (error) throw error;
    return { data: mapWorkspace(data as Record<string, unknown>), error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : 'Failed to create workspace' };
  }
}

// ─── Update workspace (name, description, avatar_url, settings) ──────────────

export async function updateWorkspace(
  workspaceId: string,
  updates: { name?: string; description?: string; avatarUrl?: string; settings?: WorkspaceSettings },
): Promise<{ data: Workspace | null; error: string | null }> {
  try {
    const payload: Record<string, unknown> = {};
    if (updates.name        !== undefined) payload.name        = updates.name.trim();
    if (updates.description !== undefined) payload.description = updates.description.trim();
    if (updates.avatarUrl   !== undefined) payload.avatar_url  = updates.avatarUrl;
    if (updates.settings    !== undefined) payload.settings    = updates.settings;

    const { data, error } = await supabase
      .from('workspaces')
      .update(payload)
      .eq('id', workspaceId)
      .select()
      .single();

    if (error) throw error;
    return { data: mapWorkspace(data as Record<string, unknown>), error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : 'Failed to update workspace' };
  }
}

// ─── Delete workspace ────────────────────────────────────────────────────────

export async function deleteWorkspace(workspaceId: string): Promise<{ error: string | null }> {
  try {
    const { error } = await supabase
      .from('workspaces')
      .delete()
      .eq('id', workspaceId);
    if (error) throw error;
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to delete workspace' };
  }
}

// ─── Preview a workspace by invite code (before joining) ─────────────────────

export async function previewWorkspaceByCode(
  code: string,
): Promise<{ data: { id: string; name: string; description: string | null; memberCount: number } | null; error: string | null }> {
  try {
    const { data, error } = await supabase
      .rpc('preview_workspace_by_code', { p_invite_code: code.trim() });
    if (error) throw error;
    const d = data as Record<string, unknown>;
    return {
      data: {
        id:          d.id as string,
        name:        d.name as string,
        description: (d.description as string) ?? null,
        memberCount: (d.member_count as number) ?? 0,
      },
      error: null,
    };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : 'Invalid invite code' };
  }
}

// ─── Join workspace via invite code ──────────────────────────────────────────

export async function joinWorkspaceByCode(
  code: string,
): Promise<{ data: WorkspaceMember | null; error: string | null }> {
  try {
    const { data, error } = await supabase
      .rpc('join_workspace_by_code', { p_invite_code: code.trim() });
    if (error) throw error;
    return { data: mapWorkspaceMember(data as Record<string, unknown>), error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : 'Failed to join workspace' };
  }
}

// ─── Regenerate invite code ───────────────────────────────────────────────────

export async function regenerateInviteCode(
  workspaceId: string,
): Promise<{ data: string | null; error: string | null }> {
  try {
    const { data, error } = await supabase
      .rpc('regenerate_invite_code', { p_workspace_id: workspaceId });
    if (error) throw error;
    return { data: data as string, error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : 'Failed to regenerate code' };
  }
}

// ─── Add a report to a workspace ─────────────────────────────────────────────

export async function addReportToWorkspace(
  workspaceId: string,
  reportId: string,
): Promise<{ data: WorkspaceReport | null; error: string | null }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('workspace_reports')
      .insert({ workspace_id: workspaceId, report_id: reportId, added_by: user.id })
      .select()
      .single();

    if (error) throw error;

    // Log activity
    await supabase.from('workspace_activity').insert({
      workspace_id:  workspaceId,
      user_id:       user.id,
      action:        'report_added',
      resource_type: 'report',
      resource_id:   reportId,
    });

    return {
      data: {
        id:          (data as Record<string, unknown>).id as string,
        workspaceId: (data as Record<string, unknown>).workspace_id as string,
        reportId:    (data as Record<string, unknown>).report_id as string,
        addedBy:     (data as Record<string, unknown>).added_by as string,
        addedAt:     (data as Record<string, unknown>).added_at as string,
      },
      error: null,
    };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : 'Failed to add report' };
  }
}

// ─── Remove a report from a workspace ────────────────────────────────────────

export async function removeReportFromWorkspace(
  workspaceId: string,
  reportId: string,
): Promise<{ error: string | null }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { error } = await supabase
      .from('workspace_reports')
      .delete()
      .eq('workspace_id', workspaceId)
      .eq('report_id', reportId);

    if (error) throw error;

    await supabase.from('workspace_activity').insert({
      workspace_id:  workspaceId,
      user_id:       user.id,
      action:        'report_removed',
      resource_type: 'report',
      resource_id:   reportId,
    });

    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to remove report' };
  }
}

// ─── Get workspace feed (paginated) ──────────────────────────────────────────

export async function getWorkspaceFeed(
  workspaceId: string,
  limit = 20,
  offset = 0,
): Promise<{ data: WorkspaceReport[]; error: string | null }> {
  try {
    const { data, error } = await supabase
      .rpc('get_workspace_feed', {
        p_workspace_id: workspaceId,
        p_limit:        limit,
        p_offset:       offset,
      });

    if (error) throw error;

    const rows = (data as Record<string, unknown>[]) ?? [];
    const reports: WorkspaceReport[] = rows.map((row) => {
      const r = row.report as Record<string, unknown>;
      const p = row.added_by_profile as Record<string, unknown>;
      return {
        id: row.id as string,
        workspaceId: row.workspace_id as string,
        reportId: row.report_id as string,
        addedBy: (row.added_by as string) ?? null,
        addedAt: row.added_at as string,
        commentCount: (row.comment_count as number) ?? 0,
        report: r ? {
          id: r.id as string,
          title: (r.title as string) ?? '',
          query: (r.query as string) ?? '',
          depth: r.depth as ResearchReport['depth'],
          status: r.status as ResearchReport['status'],
          executiveSummary: (r.executive_summary as string) ?? '',
          reliabilityScore: (r.reliability_score as number) ?? 0,
          sourcesCount: (r.sources_count as number) ?? 0,
          createdAt: r.created_at as string,
          completedAt: (r.completed_at as string) ?? undefined,
        } as Partial<ResearchReport> : undefined,
        addedByProfile: p ? {
          id: p.id as string,
          username: (p.username as string) ?? null,
          fullName: (p.full_name as string) ?? null,
          avatarUrl: (p.avatar_url as string) ?? null,
        } : undefined,
      };
    });

    return { data: reports, error: null };
  } catch (err) {
    return { data: [], error: err instanceof Error ? err.message : 'Failed to load feed' };
  }
}