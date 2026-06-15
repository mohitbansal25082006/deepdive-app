// src/hooks/useWorkspaceBundleItems.ts
// Part 52.1 — Aggregates everything the workspace export picker can include.
//
// PURPOSE
//   The advanced export picker (Part 52.1B) needs a single, flat, typed list of
//   selectable items spanning SIX content kinds:
//     • reports        (from the workspace feed — full set, not just the first page)
//     • presentations  (shared content)
//     • academic papers(shared content)
//     • debates        (shared content)
//     • podcasts       (shared content)
//     • voice debates  (shared content)
//
//   This hook fetches all of them ON DEMAND (only when `enabled` flips true —
//   i.e. when the export sheet opens), so opening the settings screen stays fast.
//
// WHY A DEDICATED HOOK (not reusing useWorkspace's feed)
//   • useWorkspace only holds the paginated FIRST page of reports. For export we
//     want the COMPLETE report set, so we page through getWorkspaceFeed here.
//   • The four shared-content sharing hooks each defer-load and are tab-scoped.
//     Re-using them would couple the export picker to the Shared tab's lifecycle.
//     Instead we call the underlying services directly, once, when the sheet opens.
//
// OUTPUT
//   Grouped + flat lists of BundleSelectableItem, plus loading / error state and
//   per-group counts for the section headers.

import { useState, useCallback, useEffect, useRef } from 'react';
import { getWorkspaceFeed } from '../services/workspaceService';
import { getWorkspaceSharedContent }      from '../services/workspaceSharingService';
import { getWorkspaceSharedPodcasts }     from '../services/podcastSharingService';
import { getWorkspaceSharedDebates }      from '../services/debateSharingService';
import { getWorkspaceSharedVoiceDebates } from '../services/voiceDebateSharingService';
import type {
  WorkspaceReport,
  SharedWorkspaceContent,
  SharedPodcast,
  SharedDebate,
} from '../types';
import type { SharedVoiceDebate } from '../types/voiceDebateSharing';
import type {
  BundleSelectableItem,
  BundleItemKind,
} from '../services/workspaceBundleExportService';

// ─── Grouped result shape ─────────────────────────────────────────────────────

export interface BundleItemGroups {
  reports:        BundleSelectableItem[];
  presentations:  BundleSelectableItem[];
  papers:         BundleSelectableItem[];
  debates:        BundleSelectableItem[];
  podcasts:       BundleSelectableItem[];
  voiceDebates:   BundleSelectableItem[];
}

const EMPTY_GROUPS: BundleItemGroups = {
  reports:       [],
  presentations: [],
  papers:        [],
  debates:       [],
  podcasts:      [],
  voiceDebates:  [],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const FEED_PAGE = 50;
const MAX_FEED_PAGES = 10; // safety cap → up to 500 reports

function keyOf(kind: BundleItemKind, id: string): string {
  return `${kind}:${id}`;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useWorkspaceBundleItems(
  workspaceId: string | null,
  enabled:     boolean,
) {
  const [groups,    setGroups]    = useState<BundleItemGroups>(EMPTY_GROUPS);
  const [isLoading, setIsLoading] = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);

  // Guards so we only load once per (workspace, open) and can abort on unmount.
  const loadedForRef = useRef<string | null>(null);
  const aliveRef     = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => { aliveRef.current = false; };
  }, []);

  // Reset whenever the workspace changes.
  useEffect(() => {
    setGroups(EMPTY_GROUPS);
    setHasLoaded(false);
    setError(null);
    loadedForRef.current = null;
  }, [workspaceId]);

  const loadAllReports = useCallback(async (wid: string): Promise<BundleSelectableItem[]> => {
    const out: BundleSelectableItem[] = [];
    const seen = new Set<string>();
    for (let page = 0; page < MAX_FEED_PAGES; page++) {
      const { data, error: feedErr } = await getWorkspaceFeed(wid, FEED_PAGE, page * FEED_PAGE);
      if (feedErr) break;
      if (!data || data.length === 0) break;

      for (const wr of data as WorkspaceReport[]) {
        const r = wr.report;
        // Only completed reports are exportable to full PDF.
        if (!r || (r.status && r.status !== 'completed')) continue;
        if (!wr.reportId || seen.has(wr.reportId)) continue;
        seen.add(wr.reportId);
        out.push({
          key:       keyOf('report', wr.reportId),
          kind:      'report',
          contentId: wr.reportId,
          title:     r.title || r.query || 'Untitled Report',
          subtitle:  r.depth ? `${r.depth.toUpperCase()} · ${r.sourcesCount ?? 0} sources` : undefined,
        });
      }
      if (data.length < FEED_PAGE) break; // last page
    }
    return out;
  }, []);

  const load = useCallback(async () => {
    if (!workspaceId) return;
    if (loadedForRef.current === workspaceId) return; // already loaded this session

    setIsLoading(true);
    setError(null);

    try {
      const [
        reports,
        sharedContent,
        podcasts,
        debates,
        voiceDebates,
      ] = await Promise.all([
        loadAllReports(workspaceId),
        getWorkspaceSharedContent(workspaceId),           // presentations + papers
        getWorkspaceSharedPodcasts(workspaceId),
        getWorkspaceSharedDebates(workspaceId),
        getWorkspaceSharedVoiceDebates(workspaceId),
      ]);

      if (!aliveRef.current) return;

      // ── Presentations + Academic papers from the unified shared content ──
      const presentations: BundleSelectableItem[] = [];
      const papers:        BundleSelectableItem[] = [];
      for (const c of (sharedContent.data ?? []) as SharedWorkspaceContent[]) {
        if (c.contentType === 'presentation') {
          presentations.push({
            key:       keyOf('presentation', c.contentId),
            kind:      'presentation',
            contentId: c.contentId,
            title:     c.title || 'Untitled Presentation',
            subtitle:  c.metadata?.totalSlides ? `${c.metadata.totalSlides} slides` : undefined,
          });
        } else if (c.contentType === 'academic_paper') {
          papers.push({
            key:       keyOf('academic_paper', c.contentId),
            kind:      'academic_paper',
            contentId: c.contentId,
            title:     c.title || 'Untitled Paper',
            subtitle:  c.metadata?.wordCount
              ? `~${Number(c.metadata.wordCount).toLocaleString()} words`
              : undefined,
          });
        }
      }

      // ── Podcasts ──────────────────────────────────────────────────────────
      // (Same reasoning as voice debates below — don't gate on a possibly-empty
      // list-view audio column; the renderer validates audio at export time.)
      const podcastItems: BundleSelectableItem[] = (podcasts.data ?? [])
        .map((p: SharedPodcast) => ({
          key:       keyOf('podcast', p.podcastId),
          kind:      'podcast' as const,
          contentId: p.podcastId,
          title:     p.title || 'Untitled Podcast',
          subtitle:  p.durationSeconds
            ? `~${Math.round(p.durationSeconds / 60)} min`
            : undefined,
        }));

      // ── Debates ───────────────────────────────────────────────────────────
      const debateItems: BundleSelectableItem[] = (debates.data ?? [])
        .map((d: SharedDebate) => ({
          key:       keyOf('debate', d.debateId),
          kind:      'debate' as const,
          contentId: d.debateId,
          title:     d.topic || 'Untitled Debate',
          subtitle:  d.perspectives?.length ? `${d.perspectives.length} perspectives` : undefined,
        }));

      // ── Voice debates ─────────────────────────────────────────────────────
      // NOTE (Part 52.1 fix): we DON'T filter by audioStorageUrls here.
      // The get_workspace_shared_voice_debates LIST rpc may return an empty
      // audio_storage_urls array (heavy denormalised columns are often omitted
      // from list views), which previously dropped EVERY voice debate from the
      // picker. We include them all; renderVoiceDebateMp3 fetches the full row
      // (with real cloud URLs) at export time and reports a clear failure if a
      // particular debate genuinely has no audio.
      const voiceDebateItems: BundleSelectableItem[] = (voiceDebates.data ?? [])
        .map((v: SharedVoiceDebate) => ({
          key:       keyOf('voice_debate', v.voiceDebateId),
          kind:      'voice_debate' as const,
          contentId: v.voiceDebateId,
          title:     v.topic || 'Untitled Voice Debate',
          subtitle:  v.durationSeconds
            ? `~${Math.round(v.durationSeconds / 60)} min`
            : undefined,
        }));

      setGroups({
        reports,
        presentations,
        papers,
        debates:      debateItems,
        podcasts:     podcastItems,
        voiceDebates: voiceDebateItems,
      });
      loadedForRef.current = workspaceId;
      setHasLoaded(true);
    } catch (err) {
      if (aliveRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to load exportable items');
      }
    } finally {
      if (aliveRef.current) setIsLoading(false);
    }
  }, [workspaceId, loadAllReports]);

  // Load when enabled flips on (sheet opened).
  useEffect(() => {
    if (enabled && workspaceId) {
      load();
    }
  }, [enabled, workspaceId, load]);

  // ── Derived ─────────────────────────────────────────────────────────────
  const allItems: BundleSelectableItem[] = [
    ...groups.reports,
    ...groups.presentations,
    ...groups.papers,
    ...groups.debates,
    ...groups.podcasts,
    ...groups.voiceDebates,
  ];

  const totalCount = allItems.length;

  return {
    groups,
    allItems,
    totalCount,
    isLoading,
    hasLoaded,
    error,
    reload: load,
  };
}