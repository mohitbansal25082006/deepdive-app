// src/services/referralService.ts
// Part 27 — Referral & Share-to-Earn Service
//
// Handles:
//  • Creating / fetching referral codes
//  • Redeeming a code (awards 30 credits to both users)
//  • Sharing a code via the native Share sheet
//  • Fetching referral stats

import { Share }  from 'react-native';
import { supabase } from '../lib/supabase';
import type { ReferralStats, ReferralRedeemResult } from '../types/onboarding';

// ─── Get or create referral code ──────────────────────────────────────────────

/**
 * Returns the user's unique referral code, generating one if none exists.
 */
export async function getOrCreateReferralCode(userId: string): Promise<string> {
  const { data, error } = await supabase.rpc(
    'get_or_create_referral_code',
    { p_user_id: userId },
  );
  if (error) throw new Error(`Referral code error: ${error.message}`);
  return String(data);
}

// ─── Get referral stats ───────────────────────────────────────────────────────

/**
 * Returns the full referral stats JSONB row for a user.
 * Auto-creates the code if it hasn't been generated yet.
 */
export async function getReferralStats(userId: string): Promise<ReferralStats> {
  const { data, error } = await supabase.rpc(
    'get_referral_stats',
    { p_user_id: userId },
  );

  if (error) throw new Error(`Referral stats error: ${error.message}`);

  const row = Array.isArray(data) ? data[0] : data;

  return {
    code:           String(row?.code            ?? ''),
    totalReferrals: Number(row?.total_referrals ?? 0),
    creditsEarned:  Number(row?.credits_earned  ?? 0),
    redeemedCount:  Number(row?.redeemed_count  ?? 0),
  };
}

// ─── Redeem a referral code ───────────────────────────────────────────────────

/**
 * Validates the code entered by a new user and awards 30 credits to both.
 * A user can only redeem one code. Returns a result object with details.
 */
export async function redeemReferralCode(
  referredUserId: string,
  code:           string,
): Promise<ReferralRedeemResult> {
  const { data, error } = await supabase.rpc('redeem_referral_code', {
    p_referred_id: referredUserId,
    p_code:        code.trim().toUpperCase(),
  });

  if (error) {
    return {
      success: false,
      message: error.message || 'Failed to redeem code. Please try again.',
    };
  }

  const row = Array.isArray(data) ? data[0] : data;

  return {
    success:        Boolean(row?.success        ?? false),
    message:        String(row?.message         ?? ''),
    creditsAwarded: Number(row?.credits_awarded ?? 0),
    newBalance:     Number(row?.new_balance     ?? 0),
  };
}

// ─── Share referral code ──────────────────────────────────────────────────────

/**
 * Opens the native Share sheet with a pre-built referral message.
 * Uses the referrer's display name for a personalised message.
 */
export async function shareReferralCode(
  code:        string,
  displayName: string = 'a friend',
): Promise<void> {
  const message =
    `🔬 ${displayName} invited you to DeepDive AI!\n\n` +
    `DeepDive AI is an autonomous research engine that writes full reports, ` +
    `podcasts, slide decks & debates for you using AI.\n\n` +
    `Use referral code **${code}** when you join and we both get +30 free credits!\n\n` +
    `📲 Download DeepDive AI and start researching smarter.`;

  try {
    await Share.share({
      message,
      title: 'Join DeepDive AI — Get 30 Free Credits!',
    });
  } catch (err) {
    // User cancelled or share failed — silently ignore
    console.warn('[Referral] Share cancelled or failed:', err);
  }
}

// ─── Copy to clipboard ────────────────────────────────────────────────────────

/**
 * Copies the referral code to the system clipboard.
 * Uses expo-clipboard which is already installed from Part 4.
 */
export async function copyReferralCode(code: string): Promise<void> {
  try {
    const Clipboard = await import('expo-clipboard');
    await Clipboard.setStringAsync(code);
  } catch (err) {
    console.warn('[Referral] Clipboard copy failed:', err);
  }
}