// src/components/profile/ReferralCard.tsx
// Part 27 (Patch F) — "+30 credits added" shown prominently and persistently.
//
// Key changes from Patch D:
//  • Success banner NO LONGER auto-dismisses — it stays until the user
//    starts typing the next code (clearResult fires on text change)
//  • Success banner is larger with gradient background, not a thin toast
//  • Stats strip gains a third tile "Credits Received" that tracks the
//    cumulative credits earned from redeeming others codes this session
//    (localSuccesses * 30). It appears as soon as the first code succeeds.
//  • The "Credits Earned" tile still shows referral-out earnings (when
//    someone used YOUR code), keeping both flows distinct and clear.

import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Alert, ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons }       from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated';
import { useReferral }    from '../../hooks/useReferral';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';

export function ReferralCard() {
  const {
    stats, isLoading, isRedeeming, redeemResult,
    redeem, share, copyCode, clearResult,
  } = useReferral();

  const [redeemInput,      setRedeemInput]      = useState('');
  const [copied,           setCopied]           = useState(false);
  const [localSuccesses,   setLocalSuccesses]   = useState(0);
  const [localCreditsTotal, setLocalCreditsTotal] = useState(0);
  // lastCredits: credits from the most recent successful redemption
  const [lastCredits,      setLastCredits]      = useState(0);
  // showSuccess stays TRUE until the user starts typing the next code
  const [showSuccess,      setShowSuccess]      = useState(false);
  const inputRef = useRef<TextInput>(null);

  const handleCopy = useCallback(async () => {
    await copyCode();
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  }, [copyCode]);

  const handleRedeem = useCallback(async () => {
    const trimmed = redeemInput.trim().toUpperCase();
    if (trimmed.length < 6) {
      Alert.alert('Invalid Code', 'Please enter a valid referral code (e.g. DDAXK7F2).');
      return;
    }
    const result = await redeem(trimmed);
    if (result.success) {
      const earned = result.creditsAwarded ?? 30;
      setRedeemInput('');
      setLocalSuccesses(prev => prev + 1);
      setLocalCreditsTotal(prev => prev + earned);
      setLastCredits(earned);
      setShowSuccess(true);
      // NO auto-dismiss — banner stays until user types next code
    }
  }, [redeemInput, redeem]);

  // Called when user starts typing after a success — clears the banner
  const handleInputChange = useCallback((t: string) => {
    setRedeemInput(t.toUpperCase());
    if (showSuccess) setShowSuccess(false);
    if (redeemResult) clearResult();
  }, [showSuccess, redeemResult, clearResult]);

  if (isLoading) {
    return (
      <View style={{
        backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.xl,
        padding: SPACING.lg, alignItems: 'center', borderWidth: 1,
        borderColor: COLORS.border, marginBottom: SPACING.sm,
      }}>
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  }
  if (!stats) return null;

  const codeDisplay   = stats.code || '-------';
  const totalRedeemed = stats.redeemedCount + localSuccesses;

  return (
    <Animated.View entering={FadeIn.duration(400)}>
      <LinearGradient
        colors={['#1A1235', '#0F0F2A']}
        style={{
          borderRadius: RADIUS.xl, borderWidth: 1,
          borderColor: `${COLORS.primary}35`,
          marginBottom: SPACING.sm, overflow: 'hidden',
        }}
      >
        <LinearGradient
          colors={[COLORS.primary + '60', 'transparent']}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2 }}
        />

        <View style={{ padding: SPACING.md }}>

          {/* ── Header ──────────────────────────────────────────────────── */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.md }}>
            <LinearGradient
              colors={COLORS.gradientPrimary}
              style={{
                width: 36, height: 36, borderRadius: 11,
                alignItems: 'center', justifyContent: 'center', marginRight: 10,
              }}
            >
              <Ionicons name='gift' size={18} color='#FFF' />
            </LinearGradient>
            <View style={{ flex: 1 }}>
              <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '700' }}>
                Refer & Earn
              </Text>
              <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 1 }}>
                Both of you get +30 credits per code
              </Text>
            </View>
          </View>

          {/* ── Your code + copy / share ─────────────────────────────────── */}
          <View style={{
            backgroundColor: COLORS.backgroundElevated, borderRadius: RADIUS.lg,
            flexDirection: 'row', alignItems: 'center',
            paddingHorizontal: SPACING.md, paddingVertical: 12,
            borderWidth: 1, borderColor: `${COLORS.primary}25`, marginBottom: SPACING.md,
          }}>
            <Text style={{
              flex: 1, color: COLORS.textPrimary, fontSize: FONTS.sizes.xl,
              fontWeight: '800', letterSpacing: 3,
            }}>
              {codeDisplay}
            </Text>
            <TouchableOpacity
              onPress={handleCopy} activeOpacity={0.75}
              style={{
                width: 34, height: 34, borderRadius: 10, marginRight: 6,
                backgroundColor: copied ? `${COLORS.success}20` : `${COLORS.primary}15`,
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Ionicons
                name={copied ? 'checkmark' : 'copy-outline'} size={16}
                color={copied ? COLORS.success : COLORS.primary}
              />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={share} activeOpacity={0.82}
              style={{
                backgroundColor: COLORS.primary, borderRadius: RADIUS.lg,
                paddingHorizontal: 14, paddingVertical: 8,
                flexDirection: 'row', alignItems: 'center', gap: 5,
              }}
            >
              <Ionicons name='share-outline' size={14} color='#FFF' />
              <Text style={{ color: '#FFF', fontSize: FONTS.sizes.sm, fontWeight: '700' }}>Share</Text>
            </TouchableOpacity>
          </View>

          {copied && (
            <Animated.View
              entering={FadeIn.duration(250)} exiting={FadeOut.duration(200)}
              style={{ marginBottom: SPACING.sm, marginTop: -8 }}
            >
              <Text style={{
                color: COLORS.success, fontSize: FONTS.sizes.xs,
                fontWeight: '600', textAlign: 'center',
              }}>
                Code copied to clipboard
              </Text>
            </Animated.View>
          )}

          {/* ── Stats strip ─────────────────────────────────────────────── */}
          {/* Row 1: Friends Referred + Credits Earned (from your code) */}
          <View style={{ flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.sm }}>
            {[
              {
                label: 'Friends Referred',
                value: stats.totalReferrals,
                icon:  'people-outline',
                color: COLORS.primary,
              },
              {
                label: 'Your Code Earned',
                value: stats.creditsEarned,
                icon:  'trending-up-outline',
                color: COLORS.warning,
              },
            ].map(item => (
              <View
                key={item.label}
                style={{
                  flex: 1, backgroundColor: `${item.color}10`,
                  borderRadius: RADIUS.lg, padding: SPACING.sm,
                  alignItems: 'center', borderWidth: 1, borderColor: `${item.color}20`,
                }}
              >
                <Ionicons name={item.icon as any} size={18} color={item.color} />
                <Text style={{
                  color: item.color, fontSize: FONTS.sizes.xl,
                  fontWeight: '800', marginTop: 4,
                }}>
                  {item.value}
                </Text>
                <Text style={{
                  color: COLORS.textMuted, fontSize: FONTS.sizes.xs,
                  marginTop: 2, textAlign: 'center',
                }}>
                  {item.label}
                </Text>
              </View>
            ))}
          </View>

          {/* Row 2: Credits Received tile — appears once first code redeemed */}
          {localCreditsTotal > 0 && (
            <Animated.View entering={FadeInDown.duration(350)} style={{ marginBottom: SPACING.sm }}>
              <LinearGradient
                colors={[`${COLORS.success}22`, `${COLORS.success}0A`]}
                style={{
                  borderRadius: RADIUS.lg,
                  padding: SPACING.md,
                  borderWidth: 1,
                  borderColor: `${COLORS.success}35`,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <View style={{
                  width: 42, height: 42, borderRadius: 13,
                  backgroundColor: `${COLORS.success}25`,
                  alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <Ionicons name='flash' size={20} color={COLORS.success} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{
                    color: COLORS.success, fontSize: FONTS.sizes.xl,
                    fontWeight: '900', lineHeight: 26,
                  }}>
                    +{localCreditsTotal} cr
                  </Text>
                  <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 1 }}>
                    Received from {localSuccesses} friend{localSuccesses > 1 ? "s'" : "'s"} code{localSuccesses > 1 ? "s" : ""} this session
                  </Text>
                </View>
                <View style={{
                  backgroundColor: `${COLORS.success}15`,
                  borderRadius: RADIUS.full,
                  paddingHorizontal: 8, paddingVertical: 3,
                  borderWidth: 1, borderColor: `${COLORS.success}25`,
                }}>
                  <Text style={{
                    color: COLORS.success, fontSize: 10, fontWeight: '700',
                  }}>
                    ADDED
                  </Text>
                </View>
              </LinearGradient>
            </Animated.View>
          )}

          {/* Redeemed count badge */}
          {totalRedeemed > 0 && (
            <Animated.View
              entering={FadeInDown.duration(300)}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 6,
                backgroundColor: `${COLORS.success}10`, borderRadius: RADIUS.lg,
                padding: SPACING.sm, marginBottom: SPACING.md,
                borderWidth: 1, borderColor: `${COLORS.success}20`,
              }}
            >
              <Ionicons name='checkmark-circle' size={15} color={COLORS.success} />
              <Text style={{
                color: COLORS.success, fontSize: FONTS.sizes.xs,
                fontWeight: '600', flex: 1,
              }}>
                {totalRedeemed === 1
                  ? "You've redeemed 1 friend's code — keep going!"
                  : `You've redeemed ${totalRedeemed} friends' codes — nice!`}
              </Text>
            </Animated.View>
          )}

          {/* ── Enter a friend's code ─────────────────────────────────────── */}
          <Animated.View entering={FadeInDown.duration(300)}>
            <Text style={{
              color: COLORS.textMuted, fontSize: 10, fontWeight: '700',
              letterSpacing: 1, textTransform: 'uppercase', marginBottom: SPACING.sm,
            }}>
              Enter a Friend's Code
            </Text>

            <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
              <TextInput
                ref={inputRef}
                value={redeemInput}
                onChangeText={handleInputChange}
                placeholder='e.g. DDAXK7F2'
                placeholderTextColor={COLORS.textMuted}
                autoCapitalize='characters'
                maxLength={12}
                returnKeyType='done'
                onSubmitEditing={handleRedeem}
                style={{
                  flex: 1, backgroundColor: COLORS.backgroundElevated,
                  borderRadius: RADIUS.lg, paddingHorizontal: SPACING.md,
                  paddingVertical: 11, color: COLORS.textPrimary,
                  fontSize: FONTS.sizes.base, fontWeight: '700', letterSpacing: 2,
                  borderWidth: 1,
                  borderColor: showSuccess
                    ? `${COLORS.success}50`
                    : (redeemResult && !redeemResult.success)
                    ? `${COLORS.error}50`
                    : COLORS.border,
                }}
              />
              <TouchableOpacity
                onPress={handleRedeem}
                disabled={isRedeeming || !redeemInput.trim()}
                activeOpacity={0.82}
                style={{
                  backgroundColor: (isRedeeming || !redeemInput.trim())
                    ? `${COLORS.accent}50` : COLORS.accent,
                  borderRadius: RADIUS.lg, paddingHorizontal: SPACING.md,
                  justifyContent: 'center', alignItems: 'center', minWidth: 70,
                }}
              >
                {isRedeeming
                  ? <ActivityIndicator size='small' color='#FFF' />
                  : <Text style={{ color: '#FFF', fontSize: FONTS.sizes.sm, fontWeight: '700' }}>Apply</Text>
                }
              </TouchableOpacity>
            </View>

            {/* ── Success banner — stays until next code is typed ───────── */}
            {showSuccess && (
              <Animated.View
                entering={FadeInDown.duration(320)}
                exiting={FadeOut.duration(250)}
              >
                <LinearGradient
                  colors={[`${COLORS.success}28`, `${COLORS.success}10`]}
                  style={{
                    marginTop: SPACING.sm,
                    borderRadius: RADIUS.lg,
                    padding: SPACING.md,
                    borderWidth: 1,
                    borderColor: `${COLORS.success}40`,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <View style={{
                      width: 34, height: 34, borderRadius: 10,
                      backgroundColor: `${COLORS.success}25`,
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Ionicons name='checkmark-circle' size={20} color={COLORS.success} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{
                        color: COLORS.success, fontSize: FONTS.sizes.base,
                        fontWeight: '800',
                      }}>
                        +{lastCredits} credits added!
                      </Text>
                      <Text style={{
                        color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, marginTop: 1,
                      }}>
                        Added to your balance right now
                      </Text>
                    </View>
                  </View>
                  <Text style={{
                    color: COLORS.textMuted, fontSize: FONTS.sizes.xs, lineHeight: 16,
                  }}>
                    Have more friends on DeepDive AI? Enter their code too — each one gives you another +30 credits.
                  </Text>
                </LinearGradient>
              </Animated.View>
            )}

            {/* Error feedback */}
            {redeemResult && !redeemResult.success && !showSuccess && (
              <Animated.View
                entering={FadeIn.duration(250)}
                style={{
                  marginTop: SPACING.sm,
                  flexDirection: 'row', alignItems: 'center', gap: 6,
                  backgroundColor: `${COLORS.error}10`, borderRadius: RADIUS.md,
                  padding: SPACING.sm, borderWidth: 1, borderColor: `${COLORS.error}25`,
                }}
              >
                <Ionicons name='close-circle-outline' size={16} color={COLORS.error} />
                <Text style={{
                  color: COLORS.error, fontSize: FONTS.sizes.xs,
                  fontWeight: '600', flex: 1,
                }}>
                  {redeemResult.message}
                </Text>
              </Animated.View>
            )}

            {/* Hint — shown only when no active result */}
            {!redeemResult && !showSuccess && (
              <Text style={{
                color: COLORS.textMuted, fontSize: 10, marginTop: 6, textAlign: 'center',
              }}>
                Redeem codes from multiple friends — each gives +30 credits
              </Text>
            )}
          </Animated.View>

        </View>
      </LinearGradient>
    </Animated.View>
  );
}