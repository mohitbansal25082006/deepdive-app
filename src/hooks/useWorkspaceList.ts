// src/hooks/useWorkspaceList.ts
// List all workspaces the current user belongs to.
// Subscribes to workspace_members changes so the list stays fresh in realtime.

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Workspace, WorkspaceListState } from '../types';
import { listUserWorkspaces, createWorkspace } from '../services/workspaceService';
import { useAuth } from '../context/AuthContext';

export function useWorkspaceList() {
  const { user } = useAuth();
  const [state, setState] = useState<WorkspaceListState>({
    workspaces: [], isLoading: true, error: null,
  });
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setState(s => ({ ...s, isLoading: true, error: null }));
    const { data, error } = await listUserWorkspaces();
    setState({ workspaces: data, isLoading: false, error });
  }, [user]);

  // Subscribe to workspace_members INSERT/DELETE so the list auto-updates
  // when the user joins or leaves a workspace.
  useEffect(() => {
    if (!user) return;

    load();

    channelRef.current = supabase
      .channel(`user:${user.id}:workspace_members`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'workspace_members',
          filter: `user_id=eq.${user.id}` },
        () => { load(); },
      )
      .subscribe();

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [user, load]);

  const create = useCallback(async (
    name: string,
    description?: string,
  ): Promise<{ workspace: Workspace | null; error: string | null }> => {
    const { data, error } = await createWorkspace(name, description);
    if (data) {
      setState(s => ({ ...s, workspaces: [data, ...s.workspaces] }));
    }
    return { workspace: data, error };
  }, []);

  return { ...state, refresh: load, create };
}