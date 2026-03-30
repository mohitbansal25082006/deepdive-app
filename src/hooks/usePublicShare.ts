// src/hooks/usePublicShare.ts
// DeepDive AI — Part 36: publishReport() calls notifyFollowersOfNewReport()
// after a successful share link creation or reactivation.
// All Part 33 / 34 exports and behaviour preserved unchanged.

import { useState, useEffect, useCallback } from 'react';
import { Alert, Share }                      from 'react-native';
import * as ExpoClipboard                    from 'expo-clipboard';
import { supabase }                          from '../lib/supabase';
import { notifyFollowersOfNewReport }        from '../services/followService';

const PUBLIC_REPORTS_URL =
  process.env.EXPO_PUBLIC_PUBLIC_REPORTS_URL ?? 'https://deepdive-reports.vercel.app';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface UsePublicShareReturn {
  shareUrl:    string | null;
  shareId:     string | null;
  isActive:    boolean;
  isLoading:   boolean;
  isDeleting:  boolean;
  isToggling:  boolean;
  error:       string | null;
  viewCount:   number;
  shareCount:  number;
  tags:        string[];
  shareReport:     () => Promise<void>;
  copyUrl:         () => Promise<void>;
  getShareUrl:     () => Promise<string | null>;
  /** @deprecated Use unpublishReport() instead. */
  deleteShareLink: () => Promise<void>;
  publishReport:   (tags?: string[]) => Promise<void>;
  unpublishReport: () => Promise<void>;
  updateTags:      (tags: string[]) => Promise<void>;
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

  useEffect(() => {
    if (!reportId) return;
    loadShareInfo();
  }, [reportId]); // eslint-disable-line react-hooks/exhaustive-deps

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
    } catch {
      // Silent — non-critical
    }
  }, [reportId]);

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
        setError(rpcError.message ?? 'Could not generate share link.');
        return null;
      }

      const id = data as string;
      setShareId(id);
      setIsActive(true);

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

  const shareReport = useCallback(async () => {
    const url = await fetchOrCreateShareLink();
    if (!url || !shareId) return;

    try {
      const result = await Share.share({
        title:   'DeepDive AI Research Report',
        message: `Check out this AI research report: ${url}`,
        url,
      });

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

  const getShareUrl = useCallback(async (): Promise<string | null> => {
    return fetchOrCreateShareLink();
  }, [fetchOrCreateShareLink]);

  // Part 36: after a successful publish, fire follower notifications.
  // Only notify when creating a NEW share link (was inactive/null before).
  const publishReport = useCallback(async (tagsOverride?: string[]) => {
    const wasActiveBefore = isActive;
    const url = await fetchOrCreateShareLink(tagsOverride);

    if (url && reportId && !wasActiveBefore) {
      // Fire-and-forget — never blocks the UI
      notifyFollowersOfNewReport(reportId).catch(() => {});
    }
  }, [fetchOrCreateShareLink, reportId, isActive]);

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

  const deleteShareLink = useCallback(async () => {
    await unpublishReport();
  }, [unpublishReport]);

  const updateTags = useCallback(async (newTags: string[]) => {
    if (!shareId) return;
    const safeTags = newTags.slice(0, 5);
    setTags(safeTags);
    try {
      const { error: rpcError } = await supabase.rpc('update_share_link_tags', {
        p_share_id: shareId,
        p_tags:     safeTags,
      });
      if (rpcError) {
        console.warn('[usePublicShare] updateTags error:', rpcError.message);
        await loadShareInfo();
      }
    } catch {
      await loadShareInfo();
    }
  }, [shareId, loadShareInfo]);

  const clearError = useCallback(() => setError(null), []);

  return {
    shareUrl, shareId, isActive,
    isLoading, isDeleting, isToggling,
    error, viewCount, shareCount, tags,
    shareReport, copyUrl, getShareUrl,
    deleteShareLink, publishReport, unpublishReport, updateTags,
    clearError,
  };
}