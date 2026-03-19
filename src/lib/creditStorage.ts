// src/lib/creditStorage.ts
// Part 24 — Local AsyncStorage cache for user credit balance.
// Provides instant balance reads without waiting for a DB round-trip.
// Always treated as a cache — the DB is the source of truth.

import AsyncStorage from '@react-native-async-storage/async-storage';

const BALANCE_KEY  = 'deepdive:credits:balance';
const USER_KEY     = 'deepdive:credits:userId';
const UPDATED_KEY  = 'deepdive:credits:updatedAt';

// ─── Write ────────────────────────────────────────────────────────────────────

/**
 * Cache the latest credit balance for a user.
 * Fire-and-forget — never throws.
 */
export async function cacheBalance(userId: string, balance: number): Promise<void> {
  try {
    await AsyncStorage.multiSet([
      [BALANCE_KEY,  String(balance)],
      [USER_KEY,     userId],
      [UPDATED_KEY,  new Date().toISOString()],
    ]);
  } catch {
    // Non-fatal
  }
}

// ─── Read ─────────────────────────────────────────────────────────────────────

/**
 * Returns the cached balance for the given user, or null if not cached /
 * belongs to a different user.
 */
export async function getCachedBalance(userId: string): Promise<number | null> {
  try {
    const [[, uid], [, raw]] = await AsyncStorage.multiGet([USER_KEY, BALANCE_KEY]);
    if (uid !== userId || raw === null) return null;
    const n = parseInt(raw, 10);
    return isNaN(n) ? null : n;
  } catch {
    return null;
  }
}

/**
 * Returns how stale the cached balance is in milliseconds.
 * Returns Infinity if never cached.
 */
export async function getCacheAge(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(UPDATED_KEY);
    if (!raw) return Infinity;
    return Date.now() - new Date(raw).getTime();
  } catch {
    return Infinity;
  }
}

// ─── Invalidate ───────────────────────────────────────────────────────────────

/**
 * Remove the cached balance (call after a failed transaction or sign-out).
 */
export async function clearBalanceCache(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([BALANCE_KEY, USER_KEY, UPDATED_KEY]);
  } catch {
    // Non-fatal
  }
}

// ─── Optimistic update ────────────────────────────────────────────────────────

/**
 * Decrement the cached balance by `amount` without hitting the DB.
 * Used for an optimistic credit deduction before the DB confirms.
 * Returns the new balance, or null if the cache was invalid.
 */
export async function optimisticDeduct(
  userId:  string,
  amount:  number,
): Promise<number | null> {
  const current = await getCachedBalance(userId);
  if (current === null) return null;
  const newBalance = Math.max(0, current - amount);
  await cacheBalance(userId, newBalance);
  return newBalance;
}