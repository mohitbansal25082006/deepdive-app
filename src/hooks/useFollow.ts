// src/hooks/useFollow.ts
// DeepDive AI — Part 36: Optimistic follow/unfollow with haptic feedback.

import { useState, useEffect, useCallback } from 'react';
import * as Haptics from 'expo-haptics';
import { followUser, unfollowUser } from '../services/followService';

interface UseFollowOptions {
  targetUserId:        string;
  initialIsFollowing:  boolean;
  initialFollowerCount: number;
}

interface UseFollowReturn {
  isFollowing:   boolean;
  followerCount: number;
  isLoading:     boolean;
  toggle:        () => Promise<void>;
}

/**
 * Manages follow state for a single user with optimistic updates.
 *
 * Usage:
 *   const { isFollowing, followerCount, isLoading, toggle } = useFollow({
 *     targetUserId: profile.id,
 *     initialIsFollowing: profile.is_following,
 *     initialFollowerCount: profile.follower_count,
 *   });
 */
export function useFollow({
  targetUserId,
  initialIsFollowing,
  initialFollowerCount,
}: UseFollowOptions): UseFollowReturn {
  const [isFollowing,   setIsFollowing]   = useState(initialIsFollowing);
  const [followerCount, setFollowerCount] = useState(initialFollowerCount);
  const [isLoading,     setIsLoading]     = useState(false);

  // Sync if parent re-fetches and passes new initial values
  useEffect(() => { setIsFollowing(initialIsFollowing);   }, [initialIsFollowing]);
  useEffect(() => { setFollowerCount(initialFollowerCount); }, [initialFollowerCount]);

  const toggle = useCallback(async () => {
    if (isLoading) return;

    const wasFollowing = isFollowing;
    const prevCount    = followerCount;

    // ── Optimistic update ──
    setIsFollowing(!wasFollowing);
    setFollowerCount(c => wasFollowing ? Math.max(0, c - 1) : c + 1);
    setIsLoading(true);

    try {
      let result: { success: boolean; error?: string };

      if (wasFollowing) {
        result = await unfollowUser(targetUserId);
      } else {
        result = await followUser(targetUserId);
        if (result.success) {
          // Gentle haptic on successful follow
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
        }
      }

      if (!result.success) {
        throw new Error(result.error ?? 'Follow action failed');
      }
    } catch (err) {
      // ── Rollback on failure ──
      console.warn('[useFollow] toggle error:', err);
      setIsFollowing(wasFollowing);
      setFollowerCount(prevCount);
    } finally {
      setIsLoading(false);
    }
  }, [isFollowing, followerCount, isLoading, targetUserId]);

  return { isFollowing, followerCount, isLoading, toggle };
}