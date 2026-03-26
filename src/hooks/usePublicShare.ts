// src/hooks/usePublicShare.ts
// DeepDive AI React Native App — Part 34
//
// Part 34 additions vs Part 33:
//  - On mount: auto-loads existing share link info (shareId, isActive, tags, counts)
//  - publishReport()    → get_or_create_share_link (creates OR reactivates)
//  - unpublishReport()  → toggle_share_link(shareId, false)
//  - updateTags(tags)   → update_share_link_tags
//  - shareReport()      → also increments share_count via increment_share_count
//  - New state: isActive, tags, viewCount, shareCount, isToggling
//  - Backward-compatible: all Part 33 exports preserved

import { useState, useEffect, useCallback } from 'react';
import { Alert, Share }                      from 'react-native';
import * as ExpoClipboard                    from 'expo-clipboard';
import { supabase }                          from '../lib/supabase';

const PUBLIC_REPORTS_URL =
  process.env.EXPO_PUBLIC_PUBLIC_REPORTS_URL ?? 'https://deepdive-reports.vercel.app';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface UsePublicShareReturn {
  // Core state
  shareUrl:    string | null;
  shareId:     string | null;
  isActive:    boolean;            // is the link currently published?
  isLoading:   boolean;
  isDeleting:  boolean;
  isToggling:  boolean;           // toggling publish/unpublish
  error:       string | null;

  // Stats
  viewCount:   number;
  shareCount:  number;

  // Tags
  tags:        string[];

  // Actions — all Part 33 originals preserved
  /** Generate (or reactivate) share link and open native share sheet */
  shareReport:     () => Promise<void>;
  /** Generate (or reactivate) share link and copy URL to clipboard */
  copyUrl:         () => Promise<void>;
  /** Generate (or reactivate) share link — returns the URL */
  getShareUrl:     () => Promise<string | null>;
  /**
   * @deprecated Use unpublishReport() instead. Kept for backward compatibility.
   * Deactivates the share link (sets is_active = FALSE).
   */
  deleteShareLink: () => Promise<void>;

  // Actions — Part 34 new
  /** Publish: creates or reactivates the share link */
  publishReport:   (tags?: string[]) => Promise<void>;
  /** Unpublish: sets is_active = FALSE (soft delete, URL → 404) */
  unpublishReport: () => Promise<void>;
  /** Update topic tags (max 5) */
  updateTags:      (tags: string[]) => Promise<void>;

  // Utility
  clearError: () => void;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function usePublicShare(reportId: string | null): UsePublicShareReturn {
  const [shareId,     setShareId]     = useState<string | null>(null);
  const [isActive,    setIsActive]    = useState(false);
  const [isLoading,   setIsLoading]   = useState(false);
  const [isDeleting,  setIsDeleting]  = useState(false);
  const [isToggling,  setIsToggling]  = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [viewCount,   setViewCount]   = useState(0);
  const [shareCount,  setShareCount]  = useState(0);
  const [tags,        setTags]        = useState<string[]>([]);

  const shareUrl = shareId && isActive
    ? `${PUBLIC_REPORTS_URL}/r/${shareId}`
    : null;

  // ── Load existing share info on mount ─────────────────────────────────────

  useEffect(() => {
    if (!reportId) return;
    loadShareInfo();
  }, [reportId]);

  const loadShareInfo = useCallback(async () => {
    if (!reportId) return;
    try {
      const { data, error: rpcError } = await supabase.rpc(
        'get_share_link_info',
        { p_report_id: reportId },
      );
      if (rpcError || !data || (Array.isArray(data) && data.length === 0)) return;

      const row = Array.isArray(data) ? data[0] : data;
      if (!row) return;

      setShareId(row.share_id    ?? null);
      setIsActive(row.is_active  ?? false);
      setViewCount(row.view_count ?? 0);
      setShareCount(row.share_count ?? 0);
      setTags(Array.isArray(row.tags) ? row.tags : []);
    } catch (err) {
      // Silent — share info loading is non-critical
    }
  }, [reportId]);

  // ── Helper: call get_or_create_share_link ─────────────────────────────────

  const fetchOrCreateShareLink = useCallback(async (
    tagsOverride?: string[],
  ): Promise<string | null> => {
    if (!reportId) {
      setError('No report ID provided.');
      return null;
    }

    setIsLoading(true);
    setError(null);

    try {
      const rpcArgs: Record<string, unknown> = { p_report_id: reportId };
      if (tagsOverride !== undefined) rpcArgs.p_tags = tagsOverride.slice(0, 5);

      const { data, error: rpcError } = await supabase.rpc(
        'get_or_create_share_link',
        rpcArgs,
      );

      if (rpcError) {
        const msg = rpcError.message ?? 'Could not generate share link.';
        setError(msg);
        return null;
      }

      const id = data as string;
      setShareId(id);
      setIsActive(true);

      // Refresh full info (view count, share count, tags)
      await loadShareInfo();

      return `${PUBLIC_REPORTS_URL}/r/${id}`;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(msg);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [reportId, loadShareInfo]);

  // ── shareReport ───────────────────────────────────────────────────────────

  const shareReport = useCallback(async () => {
    const url = await fetchOrCreateShareLink();
    if (!url || !shareId) return;

    try {
      const result = await Share.share({
        title:   'DeepDive AI Research Report',
        message: `Check out this AI research report: ${url}`,
        url,
      });

      // Increment share count if user actually shared (not dismissed)
      if (result.action === Share.sharedAction) {
        const currentId = shareId;
        supabase
          .rpc('increment_share_count', { p_share_id: currentId })
          .then(({ error: e }) => {
            if (!e) setShareCount(c => c + 1);
          });
      }
    } catch (shareErr) {
      if ((shareErr as { message?: string })?.message !== 'User did not share') {
        console.warn('[usePublicShare] Share error:', shareErr);
      }
    }
  }, [fetchOrCreateShareLink, shareId]);

  // ── copyUrl ───────────────────────────────────────────────────────────────

  const copyUrl = useCallback(async () => {
    const url = await fetchOrCreateShareLink();
    if (!url) return;

    try {
      await ExpoClipboard.setStringAsync(url);
      Alert.alert('Copied!', 'Public report link copied to clipboard.');
    } catch {
      Alert.alert('Error', 'Could not copy to clipboard.');
    }
  }, [fetchOrCreateShareLink]);

  // ── getShareUrl ───────────────────────────────────────────────────────────

  const getShareUrl = useCallback(async (): Promise<string | null> => {
    return fetchOrCreateShareLink();
  }, [fetchOrCreateShareLink]);

  // ── publishReport (Part 34) ───────────────────────────────────────────────

  const publishReport = useCallback(async (tagsOverride?: string[]) => {
    await fetchOrCreateShareLink(tagsOverride);
  }, [fetchOrCreateShareLink]);

  // ── unpublishReport (Part 34) ─────────────────────────────────────────────

  const unpublishReport = useCallback(async () => {
    if (!shareId) return;

    setIsToggling(true);
    try {
      const { error: rpcError } = await supabase.rpc('toggle_share_link', {
        p_share_id:  shareId,
        p_is_active: false,
      });

      if (rpcError) {
        Alert.alert('Error', 'Could not unpublish the report.');
      } else {
        setIsActive(false);
        Alert.alert(
          'Unpublished',
          'The public link now returns 404. You can re-publish at any time to restore the same URL.',
        );
      }
    } catch {
      Alert.alert('Error', 'Could not unpublish the report.');
    } finally {
      setIsToggling(false);
    }
  }, [shareId]);

  // ── deleteShareLink (backward compat alias for unpublishReport) ───────────

  const deleteShareLink = useCallback(async () => {
    await unpublishReport();
  }, [unpublishReport]);

  // ── updateTags (Part 34) ──────────────────────────────────────────────────

  const updateTags = useCallback(async (newTags: string[]) => {
    if (!shareId) return;

    const safeTags = newTags.slice(0, 5);
    setTags(safeTags); // optimistic

    try {
      const { error: rpcError } = await supabase.rpc('update_share_link_tags', {
        p_share_id: shareId,
        p_tags:     safeTags,
      });

      if (rpcError) {
        console.warn('[usePublicShare] updateTags error:', rpcError.message);
        // Revert optimistic update
        await loadShareInfo();
      }
    } catch (err) {
      console.warn('[usePublicShare] updateTags exception:', err);
      await loadShareInfo();
    }
  }, [shareId, loadShareInfo]);

  // ── clearError ────────────────────────────────────────────────────────────

  const clearError = useCallback(() => setError(null), []);

  return {
    shareUrl,
    shareId,
    isActive,
    isLoading,
    isDeleting,
    isToggling,
    error,
    viewCount,
    shareCount,
    tags,
    shareReport,
    copyUrl,
    getShareUrl,
    deleteShareLink,
    publishReport,
    unpublishReport,
    updateTags,
    clearError,
  };
}