// src/services/followService.ts
// Part 36 — Follow/unfollow, profile lookup, social stats.
// Part 37 FIX 2 — getPublicProfileWithFallback handles new users whose
//                 username is still NULL in the profiles table.

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

// ─── Followers / Following ────────────────────────────────────────────────────

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