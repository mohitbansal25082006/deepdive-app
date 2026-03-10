// src/hooks/usePublicShare.ts
// Manages public share state for a specific report.
// The "publicUrl" stored in shareInfo is the deep-link URL (deepdiveai://)
// so that Share.share() always opens the app when tapped.

import { useState, useEffect, useCallback } from 'react';
import * as Clipboard from 'expo-clipboard';
import { Alert } from 'react-native';
import {
  enablePublicShare,
  disablePublicShare,
  getShareStatus,
  buildShareableUrl,
  buildWebLink,
} from '../services/publicShare';
import { PublicShareInfo } from '../types';

export function usePublicShare(reportId: string, userId: string) {
  const [shareInfo, setShareInfo] = useState<PublicShareInfo | null>(null);
  const [isPublic,  setIsPublic]  = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [checking,  setChecking]  = useState(true);

  // ── Check status on mount ────────────────────────────────────────────────

  useEffect(() => {
    if (!reportId) { setChecking(false); return; }
    getShareStatus(reportId)
      .then(status => {
        setIsPublic(status.isPublic);
        if (status.isPublic && status.token) {
          setShareInfo({
            token:     status.token,
            publicUrl: buildShareableUrl(status.token),
            webUrl:    buildWebLink(status.token),
            createdAt: new Date().toISOString(),
            viewCount: status.viewCount,
          });
        }
      })
      .catch(() => {/* silently ignore */})
      .finally(() => setChecking(false));
  }, [reportId]);

  // ── Enable ───────────────────────────────────────────────────────────────

  const enable = useCallback(async (): Promise<PublicShareInfo | null> => {
    if (!userId) return null;
    setLoading(true);
    try {
      const info = await enablePublicShare(reportId, userId);
      setShareInfo(info);
      setIsPublic(true);
      return info;
    } catch (err) {
      Alert.alert(
        'Error',
        err instanceof Error ? err.message : 'Failed to generate public link.'
      );
      return null;
    } finally {
      setLoading(false);
    }
  }, [reportId, userId]);

  // ── Disable ──────────────────────────────────────────────────────────────

  const disable = useCallback(async () => {
    setLoading(true);
    try {
      await disablePublicShare(reportId, userId);
      setShareInfo(null);
      setIsPublic(false);
    } catch {
      Alert.alert('Error', 'Failed to revoke public link.');
    } finally {
      setLoading(false);
    }
  }, [reportId, userId]);

  // ── Copy deep-link to clipboard ──────────────────────────────────────────

  const copyLink = useCallback(async () => {
    let info = shareInfo;
    if (!info) info = await enable();
    if (info) {
      // Copy the deep-link URL so tapping it opens the app
      await Clipboard.setStringAsync(info.publicUrl);
      Alert.alert(
        'Link Copied!',
        'The report link has been copied. Anyone who taps it will open DeepDive AI directly.'
      );
    }
  }, [shareInfo, enable]);

  // ── Get or create link ───────────────────────────────────────────────────

  const getOrCreateLink = useCallback(async (): Promise<string | null> => {
    if (shareInfo) return shareInfo.publicUrl;
    const info = await enable();
    return info?.publicUrl ?? null;
  }, [shareInfo, enable]);

  return {
    shareInfo,
    isPublic,
    loading,
    checking,
    enable,
    disable,
    copyLink,
    getOrCreateLink,
  };
}