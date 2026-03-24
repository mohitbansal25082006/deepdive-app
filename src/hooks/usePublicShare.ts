// src/hooks/usePublicShare.ts
// DeepDive AI React Native App — Part 33
//
// Hook for generating and managing public share links for research reports.
// Calls the get_or_create_share_link Supabase RPC (Part 33 schema).
//
// Usage:
//   const { shareUrl, isLoading, shareReport, copyUrl, deleteShareLink } = usePublicShare(reportId);

import { useState, useEffect, useCallback } from 'react';
import { Alert, Share, Clipboard }           from 'react-native';
import * as ExpoClipboard                    from 'expo-clipboard';
import { supabase }                          from '../lib/supabase';

const PUBLIC_REPORTS_URL =
  process.env.EXPO_PUBLIC_PUBLIC_REPORTS_URL ?? 'https://deepdive-reports.vercel.app';

export interface UsePublicShareReturn {
  shareUrl:        string | null;
  shareId:         string | null;
  isLoading:       boolean;
  isDeleting:      boolean;
  error:           string | null;
  /** Generate (or retrieve existing) share link and open the native share sheet */
  shareReport:     () => Promise<void>;
  /** Generate (or retrieve existing) share link and copy URL to clipboard */
  copyUrl:         () => Promise<void>;
  /** Generate (or retrieve existing) share link — returns the URL */
  getShareUrl:     () => Promise<string | null>;
  /** Deactivate the share link (soft-delete) */
  deleteShareLink: () => Promise<void>;
  /** Reset error state */
  clearError:      () => void;
}

export function usePublicShare(reportId: string | null): UsePublicShareReturn {
  const [shareId,    setShareId]    = useState<string | null>(null);
  const [isLoading,  setIsLoading]  = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  const shareUrl = shareId ? `${PUBLIC_REPORTS_URL}/r/${shareId}` : null;

  // ── Helper: fetch or create share link ───────────────────────────────────

  const fetchOrCreateShareLink = useCallback(async (): Promise<string | null> => {
    if (!reportId) {
      setError('No report ID provided.');
      return null;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { data, error: rpcError } = await supabase.rpc(
        'get_or_create_share_link',
        { p_report_id: reportId }
      );

      if (rpcError) {
        const msg = rpcError.message ?? 'Could not generate share link.';
        setError(msg);
        return null;
      }

      const id = data as string;
      setShareId(id);
      return `${PUBLIC_REPORTS_URL}/r/${id}`;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(msg);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [reportId]);

  // ── shareReport: get link + open native share sheet ──────────────────────

  const shareReport = useCallback(async () => {
    const url = await fetchOrCreateShareLink();
    if (!url) return;

    try {
      await Share.share({
        title:   'DeepDive AI Research Report',
        message: `Check out this AI research report: ${url}`,
        url,
      });
    } catch (shareErr) {
      // User cancelled share — not an error
      if ((shareErr as any)?.message !== 'User did not share') {
        console.warn('[usePublicShare] Share error:', shareErr);
      }
    }
  }, [fetchOrCreateShareLink]);

  // ── copyUrl: get link + copy to clipboard ────────────────────────────────

  const copyUrl = useCallback(async () => {
    const url = await fetchOrCreateShareLink();
    if (!url) return;

    try {
      await ExpoClipboard.setStringAsync(url);
      Alert.alert('Copied!', 'Public report link copied to clipboard.');
    } catch {
      // Fallback for older Expo versions
      Clipboard.setString(url);
      Alert.alert('Copied!', 'Public report link copied to clipboard.');
    }
  }, [fetchOrCreateShareLink]);

  // ── getShareUrl: just return the URL ─────────────────────────────────────

  const getShareUrl = useCallback(async (): Promise<string | null> => {
    return fetchOrCreateShareLink();
  }, [fetchOrCreateShareLink]);

  // ── deleteShareLink: deactivate the share ────────────────────────────────

  const deleteShareLink = useCallback(async () => {
    if (!shareId) return;

    setIsDeleting(true);
    try {
      const { error: rpcError } = await supabase.rpc('delete_share_link', {
        p_share_id: shareId,
      });

      if (rpcError) {
        Alert.alert('Error', 'Could not deactivate share link.');
      } else {
        setShareId(null);
        Alert.alert('Done', 'Share link deactivated. The public URL will now return a 404.');
      }
    } catch (err) {
      Alert.alert('Error', 'Could not deactivate share link.');
    } finally {
      setIsDeleting(false);
    }
  }, [shareId]);

  // ── clearError ────────────────────────────────────────────────────────────

  const clearError = useCallback(() => setError(null), []);

  return {
    shareUrl,
    shareId,
    isLoading,
    isDeleting,
    error,
    shareReport,
    copyUrl,
    getShareUrl,
    deleteShareLink,
    clearError,
  };
}