// src/services/followService.ts
// DeepDive AI — Part 36: Follow/unfollow, profile lookup, social stats.
// All DB calls go through SECURITY DEFINER RPCs so RLS is handled server-side.

import { supabase } from '../lib/supabase';
import type {
  PublicUserProfile,
  FollowListItem,
  PublicProfileReport,
  SocialStats,
} from '../types/social';

// ─── Follow / Unfollow ────────────────────────────────────────────────────────

/**
 * Follow a user. Returns success or an error string.
 * The RPC also creates a `new_follower` notification for the target.
 */
export async function followUser(
  followingId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('follow_user', {
      p_following_id: followingId,
    });
    if (error) return { success: false, error: error.message };
    if (data?.error) return { success: false, error: data.error as string };
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

/**
 * Unfollow a user. Returns success or an error string.
 */
export async function unfollowUser(
  followingId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('unfollow_user', {
      p_following_id: followingId,
    });
    if (error) return { success: false, error: error.message };
    if (data?.error) return { success: false, error: data.error as string };
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

// ─── Profile ──────────────────────────────────────────────────────────────────

/**
 * Fetch a public user profile by username.
 * Returns null if not found or profile is private and viewer is not the owner.
 */
export async function getPublicProfile(
  username: string,
): Promise<PublicUserProfile | null> {
  try {
    const { data, error } = await supabase.rpc('get_public_profile', {
      p_username: username,
    });
    if (error || !data) return null;
    return data as PublicUserProfile;
  } catch {
    return null;
  }
}

/**
 * Fetch paginated public reports for a user.
 * Returns [] if user doesn't exist, profile is private, or has no public reports.
 */
export async function getPublicReportsForUser(
  username: string,
  limit  = 20,
  offset = 0,
): Promise<PublicProfileReport[]> {
  try {
    const { data, error } = await supabase.rpc('get_public_reports_for_user', {
      p_username: username,
      p_limit:    limit,
      p_offset:   offset,
    });
    if (error || !data) return [];
    return Array.isArray(data) ? (data as PublicProfileReport[]) : [];
  } catch {
    return [];
  }
}

// ─── Followers / Following Lists ──────────────────────────────────────────────

export async function getUserFollowers(
  userId: string,
  limit  = 50,
  offset = 0,
): Promise<FollowListItem[]> {
  try {
    const { data, error } = await supabase.rpc('get_user_followers', {
      p_user_id: userId,
      p_limit:   limit,
      p_offset:  offset,
    });
    if (error || !data) return [];
    return Array.isArray(data) ? (data as FollowListItem[]) : [];
  } catch {
    return [];
  }
}

export async function getUserFollowing(
  userId: string,
  limit  = 50,
  offset = 0,
): Promise<FollowListItem[]> {
  try {
    const { data, error } = await supabase.rpc('get_user_following', {
      p_user_id: userId,
      p_limit:   limit,
      p_offset:  offset,
    });
    if (error || !data) return [];
    return Array.isArray(data) ? (data as FollowListItem[]) : [];
  } catch {
    return [];
  }
}

// ─── Social Stats ─────────────────────────────────────────────────────────────

/**
 * Get social stats (follower/following counts, public reports, views).
 * Pass a userId to get stats for another user, omit for the current user.
 */
export async function getSocialStats(userId?: string): Promise<SocialStats> {
  const fallback: SocialStats = {
    follower_count: 0, following_count: 0,
    public_reports_count: 0, total_views: 0,
  };
  try {
    const args = userId ? { p_user_id: userId } : {};
    const { data, error } = await supabase.rpc('get_social_stats', args);
    if (error || !data) return fallback;
    return data as SocialStats;
  } catch {
    return fallback;
  }
}

// ─── Profile Visibility ───────────────────────────────────────────────────────

/**
 * Set whether the current user's profile is publicly visible.
 * When true, the profile appears at /u/[username] on the web.
 */
export async function updateProfilePublic(
  userId:   string,
  isPublic: boolean,
): Promise<{ error: string | null }> {
  try {
    const { error } = await supabase
      .from('profiles')
      .update({ is_public: isPublic })
      .eq('id', userId);
    if (error) return { error: error.message };
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Update failed' };
  }
}

// ─── Follower Notifications ───────────────────────────────────────────────────

/**
 * Notify all followers that this user published a new report.
 * Call this from usePublicShare after a successful publishReport().
 * Deduplication is handled by the unique index in the DB.
 * Fire-and-forget — never throws.
 */
export async function notifyFollowersOfNewReport(reportId: string): Promise<void> {
  try {
    await supabase.rpc('notify_followers_of_new_report', {
      p_report_id: reportId,
    });
  } catch (err) {
    console.warn('[followService] notifyFollowersOfNewReport error:', err);
  }
}