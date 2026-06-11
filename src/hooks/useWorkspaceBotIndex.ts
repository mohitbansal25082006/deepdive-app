// src/hooks/useWorkspaceBotIndex.ts
//
// Part 50.5 — Background Workspace Bot Indexer Hook
//
// PURPOSE:
//   Silently ensures all reports shared in a workspace have their
//   embeddings registered in workspace_report_index_status so the
//   @deepdive bot can answer questions about them.
//
//   This hook is called once when workspace-detail opens. It:
//     1. Fetches workspace reports that need indexing (have embeddings
//        in report_embeddings but not yet registered for this workspace)
//     2. Calls the workspace-report-indexer Edge Function for each one
//     3. Does all of this silently in the background — zero UI impact
//
//   This is the "lazy catch-up" mechanism for:
//     - Reports shared before Part 50.5 was deployed
//     - Reports whose pg_net trigger failed
//     - Reports where the Edge Function was temporarily unavailable
//
// DESIGN PRINCIPLES:
//   - Fire-and-forget: never blocks the UI
//   - One-time per workspace: stops retrying once all reports indexed
//   - Silent: no loading states, no progress banners
//   - Idempotent: safe to call multiple times
//   - No user impact: errors are logged but never shown

import { useEffect, useRef } from 'react';
import { supabase }          from '../lib/supabase';

const INDEXER_FUNCTION_URL = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/workspace-report-indexer`;

// Cache of workspaces we've already checked this session
// so we don't make repeated calls on tab switches
const checkedWorkspaces = new Set<string>();

export function useWorkspaceBotIndex(workspaceId: string | null | undefined): void {
  const hasRunRef = useRef(false);

  useEffect(() => {
    if (!workspaceId) return;
    // Only run once per workspaceId per app session
    if (checkedWorkspaces.has(workspaceId)) return;
    if (hasRunRef.current) return;
    hasRunRef.current = true;

    // Fire and forget — never await this
    indexWorkspaceReportsInBackground(workspaceId).catch(err => {
      console.log('[WorkspaceBotIndex] Background indexing error (non-fatal):', err);
    });

    return () => {
      // Cleanup: nothing to clean up since this is fire-and-forget
    };
  }, [workspaceId]);
}

// ─── Core background indexing logic ──────────────────────────────────────────

async function indexWorkspaceReportsInBackground(workspaceId: string): Promise<void> {
  try {
    // Mark as checked immediately so repeated calls don't stack up
    checkedWorkspaces.add(workspaceId);

    // Step 1: Get reports that need indexing for this workspace
    const { data: needsIndexing, error } = await supabase.rpc(
      'get_workspace_reports_needing_indexing',
      { p_workspace_id: workspaceId }
    );

    if (error) {
      console.log('[WorkspaceBotIndex] RPC error (non-fatal):', error.message);
      return;
    }

    const reports = (needsIndexing ?? []) as Array<{
      report_id:    string;
      user_id:      string;
      report_title: string;
    }>;

    if (reports.length === 0) {
      console.log('[WorkspaceBotIndex] All reports already indexed for workspace', workspaceId);
      return;
    }

    console.log(`[WorkspaceBotIndex] Found ${reports.length} reports to index for workspace ${workspaceId}`);

    // Step 2: Get the service role key for calling the Edge Function
    // We use the anon key since the Edge Function has --no-verify-jwt
    const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

    // Step 3: Index each report — sequential to avoid hammering OpenAI
    for (const report of reports) {
      try {
        console.log(`[WorkspaceBotIndex] Indexing: ${report.report_title} (${report.report_id})`);

        const response = await fetch(INDEXER_FUNCTION_URL, {
          method:  'POST',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${anonKey}`,
          },
          body: JSON.stringify({
            workspace_id: workspaceId,
            report_id:    report.report_id,
          }),
        });

        const result = await response.json().catch(() => ({}));
        console.log(`[WorkspaceBotIndex] Result for ${report.report_id}:`, result.status ?? 'unknown');

        // Small delay between reports to be respectful to rate limits
        await new Promise(resolve => setTimeout(resolve, 500));

      } catch (reportErr) {
        // One report failing should not stop others
        console.log(`[WorkspaceBotIndex] Failed to index report ${report.report_id} (non-fatal):`, reportErr);
      }
    }

    console.log('[WorkspaceBotIndex] Background indexing complete for workspace', workspaceId);

  } catch (err) {
    // Top-level catch — never propagate errors from background work
    console.log('[WorkspaceBotIndex] Background indexing failed silently:', err);
  }
}

// ─── Exported helper: manually trigger indexing for a specific report ─────────
// Called from workspaceSharingService after a report is shared,
// as a client-side backup to the pg_net DB trigger.

export async function triggerReportIndexing(
  workspaceId: string,
  reportId:    string,
): Promise<void> {
  try {
    const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
    await fetch(INDEXER_FUNCTION_URL, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${anonKey}`,
      },
      body: JSON.stringify({ workspace_id: workspaceId, report_id: reportId }),
    });
    console.log(`[WorkspaceBotIndex] Triggered indexing for report ${reportId} in workspace ${workspaceId}`);
  } catch (err) {
    // Silently ignore — pg_net trigger is the primary mechanism
    console.log('[WorkspaceBotIndex] triggerReportIndexing failed silently:', err);
  }
}