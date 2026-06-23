// src/services/followService.ts
// Part 36 — Follow/unfollow, profile lookup, social stats.
// Part 37 FIX 2 — getPublicProfileWithFallback handles new users whose
//                 username is still NULL in the profiles table.
// Part 54B (Feature 8) — Added "mutual-with-me" gated list fetchers:
//   getMutualUserFollowers / getMutualUserFollowing / getMutualFollowersCount.
//   These call the SECURITY DEFINER RPCs in schema_part54.sql, which return only
//   the people in another user's followers/following who ALSO follow the caller.
//   Used when viewing ANOTHER user's profile so we never reveal users who don't
//   follow us. The caller's OWN profile keeps using the unfiltered getUserFollowers
//   / getUserFollowing below.

import { supabase } from '../lib/supabase';
import type {
  PublicUserProfile, FollowListItem,
  PublicProfileReport, SocialStats,
} from '../types/social';

// ─── Follow / Unfollow ────────────────────────────────────────────────────────

export async function followUser(followingId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('follow_user', { p_following_id: followingId });
    if (error) return { success: false, error: error.message };
    if (data?.error) return { success: false, error: data.error as string };
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

export async function unfollowUser(followingId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('unfollow_user', { p_following_id: followingId });
    if (error) return { success: false, error: error.message };
    if (data?.error) return { success: false, error: data.error as string };
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

// ─── Profile by username ──────────────────────────────────────────────────────
// The SQL RPC itself now tries: exact → case-insensitive → UUID fallback.

export async function getPublicProfile(username: string): Promise<PublicUserProfile | null> {
  try {
    const { data, error } = await supabase.rpc('get_public_profile', { p_username: username });
    if (error) { console.warn('[followService] getPublicProfile:', error.message); return null; }
    return data ? (data as PublicUserProfile) : null;
  } catch { return null; }
}

// ─── Profile by UUID ──────────────────────────────────────────────────────────
// Used when username is null (new users) or when navigation only has userId.

export async function getPublicProfileById(userId: string): Promise<PublicUserProfile | null> {
  try {
    const { data, error } = await supabase.rpc('get_public_profile_by_id', { p_user_id: userId });
    if (error) { console.warn('[followService] getPublicProfileById:', error.message); return null; }
    return data ? (data as PublicUserProfile) : null;
  } catch { return null; }
}

// ─── Smart lookup — username first, userId fallback (Part 37 FIX 2) ──────────
//
// New users have username = NULL until profile setup completes.
// Order of attempts:
//   1. username RPC  (SQL already tries exact → lower → UUID internally)
//   2. userId  RPC   (direct UUID lookup — always works for any user)
//   3. If only username looks like a UUID, try it as a userId

export async function getPublicProfileWithFallback(
  username: string | null,
  userId?:  string,
): Promise<PublicUserProfile | null> {
  if (username) {
    const p = await getPublicProfile(username);
    if (p) return p;
  }
  if (userId) {
    const p = await getPublicProfileById(userId);
    if (p) return p;
  }
  // Last-resort: username might actually be a UUID (navigation edge case)
  if (username && !userId) {
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (UUID_RE.test(username)) return getPublicProfileById(username);
  }
  return null;
}

// ─── Public reports ───────────────────────────────────────────────────────────

export async function getPublicReportsForUser(
  username: string, limit = 20, offset = 0,
): Promise<PublicProfileReport[]> {
  try {
    const { data, error } = await supabase.rpc('get_public_reports_for_user', {
      p_username: username, p_limit: limit, p_offset: offset,
    });
    if (error || !data) return [];
    return Array.isArray(data) ? (data as PublicProfileReport[]) : [];
  } catch { return []; }
}

// ─── Followers / Following (UNFILTERED — own profile) ─────────────────────────

export async function getUserFollowers(userId: string, limit = 50, offset = 0): Promise<FollowListItem[]> {
  try {
    const { data, error } = await supabase.rpc('get_user_followers', {
      p_user_id: userId, p_limit: limit, p_offset: offset,
    });
    if (error || !data) return [];
    return Array.isArray(data) ? (data as FollowListItem[]) : [];
  } catch { return []; }
}

export async function getUserFollowing(userId: string, limit = 50, offset = 0): Promise<FollowListItem[]> {
  try {
    const { data, error } = await supabase.rpc('get_user_following', {
      p_user_id: userId, p_limit: limit, p_offset: offset,
    });
    if (error || !data) return [];
    return Array.isArray(data) ? (data as FollowListItem[]) : [];
  } catch { return []; }
}

// ─── Part 54B (Feature 8): Mutual-with-me gated lists ─────────────────────────
//
// When viewing ANOTHER user's profile, only reveal the people in their
// followers/following who ALSO follow the CURRENT user. Filtering happens
// server-side (SECURITY DEFINER RPCs in schema_part54.sql) so non-matching
// rows never reach the device and pagination stays correct.

export async function getMutualUserFollowers(
  userId: string, limit = 50, offset = 0,
): Promise<FollowListItem[]> {
  try {
    const { data, error } = await supabase.rpc('get_mutual_user_followers', {
      p_user_id: userId, p_limit: limit, p_offset: offset,
    });
    if (error || !data) {
      if (error) console.warn('[followService] getMutualUserFollowers:', error.message);
      return [];
    }
    return Array.isArray(data) ? (data as FollowListItem[]) : [];
  } catch (err) {
    console.warn('[followService] getMutualUserFollowers exception:', err);
    return [];
  }
}

export async function getMutualUserFollowing(
  userId: string, limit = 50, offset = 0,
): Promise<FollowListItem[]> {
  try {
    const { data, error } = await supabase.rpc('get_mutual_user_following', {
      p_user_id: userId, p_limit: limit, p_offset: offset,
    });
    if (error || !data) {
      if (error) console.warn('[followService] getMutualUserFollowing:', error.message);
      return [];
    }
    return Array.isArray(data) ? (data as FollowListItem[]) : [];
  } catch (err) {
    console.warn('[followService] getMutualUserFollowing exception:', err);
    return [];
  }
}

export async function getMutualFollowersCount(
  userId: string, mode: 'followers' | 'following',
): Promise<number> {
  try {
    const { data, error } = await supabase.rpc('get_mutual_followers_count', {
      p_user_id: userId, p_mode: mode,
    });
    if (error || data === null || data === undefined) return 0;
    return Number(data) || 0;
  } catch {
    return 0;
  }
}

// ─── Social stats ─────────────────────────────────────────────────────────────

export async function getSocialStats(userId?: string): Promise<SocialStats> {
  const fallback: SocialStats = {
    follower_count: 0, following_count: 0, public_reports_count: 0, total_views: 0,
  };
  try {
    const { data, error } = await supabase.rpc('get_social_stats', userId ? { p_user_id: userId } : {});
    if (error || !data) return fallback;
    return data as SocialStats;
  } catch { return fallback; }
}

// ─── Profile visibility ───────────────────────────────────────────────────────

export async function updateProfilePublic(userId: string, isPublic: boolean): Promise<{ error: string | null }> {
  try {
    const { error } = await supabase.from('profiles').update({ is_public: isPublic }).eq('id', userId);
    return { error: error?.message ?? null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Update failed' };
  }
}

// ─── Notify followers ─────────────────────────────────────────────────────────

export async function notifyFollowersOfNewReport(reportId: string): Promise<void> {
  try {
    await supabase.rpc('notify_followers_of_new_report', { p_report_id: reportId });
  } catch (err) {
    console.warn('[followService] notifyFollowersOfNewReport:', err);
  }
}