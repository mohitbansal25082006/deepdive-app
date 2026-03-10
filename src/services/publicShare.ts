// src/services/publicShare.ts
// Part 4 — public report sharing.
//
// Share URL strategy:
//   Primary share URL  →  deepdiveai://report/{token}
//     This is the custom-scheme deep link that ALWAYS opens the app directly.
//
//   Web fallback URL   →  https://deepdive.app/report/{token}
//     Used as the human-readable link shown in the UI and as a fallback for
//     platforms that support universal/app links (requires server-side hosting).
//
// When a user shares the deep-link URL, tapping it on a device that has
// DeepDive AI installed will immediately open the /(app)/public-report screen.

import { supabase }               from '../lib/supabase';
import { ResearchReport, PublicShareInfo } from '../types';

// ─── URL builders ─────────────────────────────────────────────────────────────

/** Custom-scheme URL — guaranteed to open the app on any device that has it. */
export function buildAppLink(token: string): string {
  return `deepdiveai://report/${token}`;
}

/** Web URL — shown in UI, also acts as universal link if you configure a server. */
export function buildWebLink(token: string): string {
  return `https://deepdive.app/report/${token}`;
}

/**
 * The URL we put into Share.share() and clipboard.
 * Using the custom scheme ensures the app always opens when tapped on a device
 * that has DeepDive AI installed.
 */
export function buildShareableUrl(token: string): string {
  return buildAppLink(token);
}

// ─── Enable public sharing ────────────────────────────────────────────────────

export async function enablePublicShare(
  reportId: string,
  userId: string
): Promise<PublicShareInfo> {
  const { data, error } = await supabase.rpc('set_report_public', {
    p_report_id: reportId,
    p_user_id:   userId,
    p_is_public: true,
  });

  if (error) throw new Error(`Failed to generate public link: ${error.message}`);

  const token = data as string;

  const { data: row } = await supabase
    .from('research_reports')
    .select('public_view_count, created_at')
    .eq('id', reportId)
    .single();

  return {
    token,
    publicUrl:  buildShareableUrl(token),  // ← deep-link URL
    webUrl:     buildWebLink(token),        // ← human-readable URL
    createdAt:  row?.created_at ?? new Date().toISOString(),
    viewCount:  row?.public_view_count ?? 0,
  };
}

// ─── Disable public sharing ───────────────────────────────────────────────────

export async function disablePublicShare(
  reportId: string,
  userId: string
): Promise<void> {
  const { error } = await supabase.rpc('set_report_public', {
    p_report_id: reportId,
    p_user_id:   userId,
    p_is_public: false,
  });
  if (error) throw new Error(`Failed to revoke public link: ${error.message}`);
}

// ─── Fetch a public report by token (no auth required) ───────────────────────

export async function fetchPublicReport(
  token: string
): Promise<ResearchReport | null> {
  const { data, error } = await supabase.rpc('get_public_report', {
    p_token: token,
  });

  if (error || !data || (data as any).error) return null;

  const r = data as Record<string, unknown>;

  return {
    id:               r.id               as string,
    userId:           r.user_id          as string,
    query:            r.query            as string,
    depth:            (r.depth           as any) ?? 'deep',
    focusAreas:       (r.focus_areas     as string[]) ?? [],
    title:            (r.title           as string) ?? '',
    executiveSummary: (r.executive_summary as string) ?? '',
    sections:         (r.sections        as any[]) ?? [],
    keyFindings:      (r.key_findings    as string[]) ?? [],
    futurePredictions:(r.future_predictions as string[]) ?? [],
    citations:        (r.citations       as any[]) ?? [],
    statistics:       (r.statistics      as any[]) ?? [],
    searchQueries:    (r.search_queries  as string[]) ?? [],
    sourcesCount:     (r.sources_count   as number) ?? 0,
    reliabilityScore: (r.reliability_score as number) ?? 0,
    status:           'completed',
    agentLogs:        [],
    knowledgeGraph:   r.knowledge_graph  as any,
    infographicData:  r.infographic_data as any,
    sourceImages:     (r.source_images   as any[]) ?? [],
    isPublic:         true,
    publicToken:      r.public_token     as string,
    publicViewCount:  (r.public_view_count as number) ?? 0,
    createdAt:        r.created_at       as string,
    completedAt:      r.completed_at     as string | undefined,
  };
}

// ─── Check current share status ───────────────────────────────────────────────

export async function getShareStatus(reportId: string): Promise<{
  isPublic:  boolean;
  token:     string | null;
  viewCount: number;
}> {
  const { data } = await supabase
    .from('research_reports')
    .select('is_public, public_token, public_view_count')
    .eq('id', reportId)
    .single();

  return {
    isPublic:  data?.is_public       ?? false,
    token:     data?.public_token    ?? null,
    viewCount: data?.public_view_count ?? 0,
  };
}