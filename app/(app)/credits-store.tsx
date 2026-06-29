// app/(app)/credits-store.tsx
// Part 24 (Fix) — Updated purchase phase labels to match new flow.
//
// Part 55.2 — FULL THEME-COMPATIBILITY PASS
//   Three hardcoded dark-only colors fixed on this screen:
//
//   1. PackCard gradient background when NOT selected:
//      Was `COLORS.gradientDark` — which in many themes (Ocean, Sunset, Amethyst,
//      Emerald, Mono) produces near-identical dark colors that make the pack name,
//      credit count, and price text nearly invisible.
//      FIX: unselected pack cards now use COLORS.gradientCard, which is the
//      theme's own card gradient. It provides sufficient contrast in every theme
//      because the card gradient is always defined relative to the surface (never
//      the same as the text color). Text color on unselected cards also updated
//      to COLORS.textPrimary / COLORS.textSecondary for guaranteed readability.
//      Selected cards keep '#FFF' text on their own vivid gradient (unchanged —
//      those gradients always have high contrast against white).
//
//   2. The sticky "Buy Now" bottom bar's backdrop:
//      Was hardcoded 'rgba(10,10,26,0.97)' — a near-black color that works in
//      dark themes but looks broken in light themes (a dark bar at the bottom of
//      a light screen).
//      FIX: replaced with getModalBackdrop(0.97) so it derives from the active
//      theme's background color.
//
//   3. The balance hero card and feature-cost table:
//      Were already using COLORS.gradientCard and COLORS.backgroundCard
//      respectively — no change needed there.
//
// ── ANDROID UI FIX (production) ───────────────────────────────────────────────
//   The sticky "Buy Now" bottom bar slipped BEHIND the Android navigation /
//   gesture bar because its bottom padding was hardcoded (`SPACING.xl + 4`).
//   Under SDK 54 edge-to-edge, content draws behind the system nav bar, so the
//   bar now pads with the real safe-area inset (`insets.bottom`). The ScrollView
//   bottom padding also accounts for the inset so the last content isn't hidden.
//
// ── Part 58 — Re-pricing reference table ──────────────────────────────────────
//   The "What Credits Get You" table previously listed only a single
//   `podcast_10min` row and omitted Voice Debate. It now surfaces the full new
//   pricing — research tiers (Quick 10 / Deep 15 / Expert 20), all four podcast
//   durations (25 / 35 / 45 / 55), Presentation, Academic Paper, AI Debate (20),
//   and Voice Debate (70) — plus a podcast audio-quality add-on note
//   (+5 High / +10 Lossless). Every cost reads from FEATURE_COSTS, so the table
//   stays correct automatically if prices change again.

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  Alert, RefreshControl, Dimensions,
}                                  from 'react-native';
import { LinearGradient }          from 'expo-linear-gradient';
import { Ionicons }                from '@expo/vector-icons';
import Animated, {
  FadeIn, FadeInDown,
  useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming,
}                                  from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router }                  from 'expo-router';
import { useCredits }              from '../../src/context/CreditsContext';
import { PurchaseSuccessToast }    from '../../src/components/credits/PurchaseSuccessToast';
import {
  COLORS, FONTS, SPACING, RADIUS, SHADOWS,
  getModalBackdrop,
}                                  from '../../src/constants/theme';
import {
  CREDIT_PACKS, FEATURE_COSTS, FEATURE_LABELS,
  FEATURE_ICONS, getTotalPackCredits, formatINR, LOW_BALANCE_THRESHOLD,
}                                  from '../../src/constants/credits';
import type { CreditPack, CreditTransaction } from '../../src/types/credits';

const { width: SCREEN_W } = Dimensions.get('window');
const PACK_CARD_W = (SCREEN_W - SPACING.xl * 2 - SPACING.sm) / 2;

const TX_META: Record<string, { icon: string; color: string; label: string }> = {
  purchase:    { icon: 'arrow-down-circle', color: COLORS.success, label: 'Purchased'  },
  consume:     { icon: 'flash',             color: COLORS.primary, label: 'Used'       },
  refund:      { icon: 'refresh-circle',    color: COLORS.info,    label: 'Refunded'   },
  signup_bonus:{ icon: 'gift',              color: COLORS.accent,  label: 'Welcome'    },
  admin_grant: { icon: 'star',              color: COLORS.warning, label: 'Bonus'      },
};

// ─── Pack Card ────────────────────────────────────────────────────────────────
//
// Part 55.2: When a pack is NOT selected, its background used COLORS.gradientDark.
// In many themes (Ocean Teal, Sunset Coral, Amethyst, Emerald, Midnight Mono)
// COLORS.gradientDark is a pair of very similar dark hues that may be close to
// the text colors used inside the card, making the price, credit count, and pack
// name nearly invisible.
//
// The fix has two parts:
//  a) Background: unselected → COLORS.gradientCard (the theme's own card surface
//     gradient — always provides contrast because it sits BETWEEN background and
//     card surface tones, never merging with text colors).
//     Selected → the pack's own vivid gradientColors (unchanged; vivid gradient
//     always has enough contrast for white text).
//  b) Text: unselected text switches to COLORS.textPrimary / COLORS.textSecondary
//     (guaranteed readable on the card surface in every theme). Selected text stays
//     '#FFF' (readable on vivid gradient).

function PackCard({
  pack,
  isSelected,
  onSelect,
}: {
  pack: CreditPack;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const total = getTotalPackCredits(pack);

  // Part 55.2: text colors differ between selected (on vivid gradient → white)
  // and unselected (on theme card surface → theme text colors).
  const textWhite   = '#FFF';
  const textPrimary = isSelected ? textWhite : COLORS.textPrimary;
  const textMuted   = isSelected ? 'rgba(255,255,255,0.75)' : COLORS.textSecondary;
  const textFaint   = isSelected ? 'rgba(255,255,255,0.6)'  : COLORS.textMuted;

  return (
    <TouchableOpacity
      onPress={onSelect}
      activeOpacity={0.82}
      style={{
        width:        PACK_CARD_W,
        borderRadius: RADIUS.xl,
        overflow:     'hidden',
        borderWidth:  2,
        borderColor:  isSelected ? pack.gradientColors[0] : COLORS.border,
        ...SHADOWS.medium,
      }}
    >
      <LinearGradient
        // Part 55.2: unselected → gradientCard for theme-correct surface;
        // selected → pack's own vivid gradient (unchanged).
        colors={isSelected
          ? pack.gradientColors
          : (COLORS.gradientCard as [string, string])
        }
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ padding: SPACING.md }}
      >
        {/* Tag badge */}
        {pack.tag && (
          <View style={{
            alignSelf:         'flex-start',
            backgroundColor:   isSelected
              ? 'rgba(255,255,255,0.22)'
              : `${COLORS.primary}22`,
            borderRadius:      RADIUS.full,
            paddingHorizontal: 8,
            paddingVertical:   3,
            marginBottom:      SPACING.sm,
            borderWidth:       1,
            borderColor:       isSelected
              ? 'rgba(255,255,255,0.15)'
              : `${COLORS.primary}40`,
          }}>
            <Text style={{
              color:         isSelected ? textWhite : COLORS.primary,
              fontSize:      9,
              fontWeight:    '800',
              letterSpacing: 0.5,
            }}>
              {pack.tag}
            </Text>
          </View>
        )}

        {/* Icon tile */}
        <View style={{
          width:           44,
          height:          44,
          borderRadius:    13,
          backgroundColor: isSelected
            ? 'rgba(255,255,255,0.15)'
            : `${COLORS.primary}15`,
          borderWidth:     1,
          borderColor:     isSelected
            ? 'rgba(255,255,255,0.12)'
            : `${COLORS.primary}25`,
          alignItems:      'center',
          justifyContent:  'center',
          marginBottom:    SPACING.sm,
        }}>
          <Ionicons
            name={pack.iconName as any}
            size={22}
            color={isSelected ? textWhite : COLORS.primary}
          />
        </View>

        {/* Pack name */}
        <Text style={{
          color:        textMuted,
          fontSize:     FONTS.sizes.sm,
          fontWeight:   '700',
          marginBottom: 2,
        }}>
          {pack.name}
        </Text>

        {/* Credit count */}
        <Text style={{
          color:      textPrimary,
          fontSize:   24,
          fontWeight: '900',
          lineHeight: 28,
        }}>
          {total.toLocaleString()}
        </Text>
        <Text style={{
          color:        textFaint,
          fontSize:     FONTS.sizes.xs,
          marginBottom: SPACING.sm,
        }}>
          credits{pack.bonusCredits ? ` (+${pack.bonusCredits} bonus)` : ''}
        </Text>

        {/* Divider */}
        <View style={{
          height:          1,
          backgroundColor: isSelected
            ? 'rgba(255,255,255,0.15)'
            : COLORS.border,
          marginBottom:    SPACING.sm,
        }} />

        {/* Price + checkmark row */}
        <View style={{
          flexDirection:  'row',
          alignItems:     'center',
          justifyContent: 'space-between',
        }}>
          <Text style={{
            color:      textPrimary,
            fontSize:   FONTS.sizes.lg,
            fontWeight: '800',
          }}>
            {formatINR(pack.priceINR)}
          </Text>
          {isSelected && (
            <View style={{
              width:           22,
              height:          22,
              borderRadius:    11,
              backgroundColor: 'rgba(255,255,255,0.25)',
              alignItems:      'center',
              justifyContent:  'center',
            }}>
              <Ionicons name="checkmark" size={14} color="#FFF" />
            </View>
          )}
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
}

// ─── Transaction Row ──────────────────────────────────────────────────────────

function TransactionRow({ tx }: { tx: CreditTransaction }) {
  const meta       = TX_META[tx.type] ?? TX_META.consume;
  const isPositive = tx.amount > 0;
  const dateLabel  = new Date(tx.createdAt).toLocaleDateString('en-IN', {
    month: 'short',
    day:   'numeric',
  });
  return (
    <View style={{
      flexDirection:     'row',
      alignItems:        'center',
      paddingVertical:   SPACING.sm,
      borderBottomWidth: 1,
      borderBottomColor: COLORS.border,
      gap:               SPACING.md,
    }}>
      <View style={{
        width:           38,
        height:          38,
        borderRadius:    11,
        backgroundColor: `${meta.color}15`,
        alignItems:      'center',
        justifyContent:  'center',
        borderWidth:     1,
        borderColor:     `${meta.color}25`,
        flexShrink:      0,
      }}>
        <Ionicons name={meta.icon as any} size={17} color={meta.color} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{
          color:      COLORS.textPrimary,
          fontSize:   FONTS.sizes.sm,
          fontWeight: '600',
        }} numberOfLines={1}>
          {tx.description || meta.label}
        </Text>
        <Text style={{
          color:     COLORS.textMuted,
          fontSize:  FONTS.sizes.xs,
          marginTop: 1,
        }}>
          {dateLabel}  ·  Balance after: {tx.balanceAfter}
        </Text>
      </View>
      <Text style={{
        color:      isPositive ? COLORS.success : COLORS.textSecondary,
        fontSize:   FONTS.sizes.base,
        fontWeight: '800',
        flexShrink: 0,
      }}>
        {isPositive ? '+' : ''}{tx.amount}
      </Text>
    </View>
  );
}

// ─── Verifying View (was "Polling") ──────────────────────────────────────────

function VerifyingView({ packName }: { packName: string }) {
  const pulse = useSharedValue(1);
  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1.1, { duration: 700 }),
        withTiming(1.0, { duration: 700 }),
      ),
      -1,
      false,
    );
  }, []);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
  }));

  return (
    <View style={{
      backgroundColor: COLORS.backgroundCard,
      borderRadius:    RADIUS.xl,
      padding:         SPACING.xl,
      marginBottom:    SPACING.lg,
      alignItems:      'center',
      borderWidth:     1,
      borderColor:     `${COLORS.primary}25`,
    }}>
      <Animated.View style={[animStyle, { marginBottom: SPACING.md }]}>
        <LinearGradient
          colors={COLORS.gradientPrimary as [string, string]}
          style={{
            width:          72,
            height:         72,
            borderRadius:   22,
            alignItems:     'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="shield-checkmark-outline" size={34} color="#FFF" />
        </LinearGradient>
      </Animated.View>
      <Text style={{
        color:        COLORS.textPrimary,
        fontSize:     FONTS.sizes.base,
        fontWeight:   '800',
        textAlign:    'center',
        marginBottom: 8,
      }}>
        Verifying Payment...
      </Text>
      <Text style={{
        color:      COLORS.textMuted,
        fontSize:   FONTS.sizes.sm,
        textAlign:  'center',
        lineHeight: 20,
      }}>
        Confirming your {packName} purchase.{'\n'}Credits are being added to your account.
      </Text>
      <ActivityIndicator
        size="small"
        color={COLORS.primary}
        style={{ marginTop: SPACING.md }}
      />
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function CreditsStoreScreen() {
  const {
    balance, isLoading, isRefreshing, transactions, txLoading,
    purchaseState, refresh, loadTransactions, purchasePack, resetPurchase,
  } = useCredits();

  const insets = useSafeAreaInsets();

  const [selectedPack,     setSelectedPack]     = useState<CreditPack | null>(CREDIT_PACKS[1]);
  const [showTxHistory,    setShowTxHistory]    = useState(false);
  const [showSuccessToast, setShowSuccessToast] = useState(false);

  const isLow   = balance < LOW_BALANCE_THRESHOLD && balance > 0;
  const isEmpty = balance === 0;

  const isPurchasing =
    purchaseState.phase !== 'idle'      &&
    purchaseState.phase !== 'success'   &&
    purchaseState.phase !== 'failed'    &&
    purchaseState.phase !== 'cancelled';

  useEffect(() => {
    if (purchaseState.phase === 'success') setShowSuccessToast(true);
  }, [purchaseState.phase]);

  useEffect(() => {
    if (showTxHistory) loadTransactions();
  }, [showTxHistory]);

  const handleBuyPress = useCallback(() => {
    if (!selectedPack) {
      Alert.alert('Select a Pack', 'Please select a credit pack first.');
      return;
    }
    purchasePack(selectedPack);
  }, [selectedPack, purchasePack]);

  const handleToastHide = useCallback(() => {
    setShowSuccessToast(false);
    resetPurchase();
  }, [resetPurchase]);

  // Part 58: full pricing reference (research tiers, all podcast durations,
  // presentation, paper, debate, voice debate). Costs read from FEATURE_COSTS,
  // so they stay correct automatically when prices change.
  const FEATURE_ROWS = [
    { feature: 'research_quick',  label: 'Quick Scan',       icon: 'flash-outline',     cost: FEATURE_COSTS.research_quick  },
    { feature: 'research_deep',   label: 'Deep Dive',        icon: 'analytics-outline', cost: FEATURE_COSTS.research_deep   },
    { feature: 'research_expert', label: 'Expert Research',  icon: 'trophy-outline',    cost: FEATURE_COSTS.research_expert },
    { feature: 'podcast_5min',    label: 'Podcast (5 min)',  icon: 'radio-outline',     cost: FEATURE_COSTS.podcast_5min    },
    { feature: 'podcast_10min',   label: 'Podcast (10 min)', icon: 'radio-outline',     cost: FEATURE_COSTS.podcast_10min   },
    { feature: 'podcast_15min',   label: 'Podcast (15 min)', icon: 'radio-outline',     cost: FEATURE_COSTS.podcast_15min   },
    { feature: 'podcast_20min',   label: 'Podcast (20 min)', icon: 'radio-outline',     cost: FEATURE_COSTS.podcast_20min   },
    { feature: 'presentation',    label: 'AI Presentation',  icon: 'easel-outline',     cost: FEATURE_COSTS.presentation    },
    { feature: 'academic_paper',  label: 'Academic Paper',   icon: 'school-outline',    cost: FEATURE_COSTS.academic_paper  },
    { feature: 'debate',          label: 'AI Debate',        icon: 'people-outline',    cost: FEATURE_COSTS.debate          },
    { feature: 'voice_debate',    label: 'Voice Debate',     icon: 'mic-outline',       cost: FEATURE_COSTS.voice_debate    },
  ];

  const accentColor = isEmpty ? COLORS.error : isLow ? COLORS.warning : COLORS.primary;

  // The sticky bar is ~150px tall; pad scroll content for bar height + inset.
  const BUY_BAR_H = 150;

  return (
    <LinearGradient
      colors={[COLORS.background, COLORS.backgroundCard] as [string, string]}
      style={{ flex: 1 }}
    >
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>

        {/* ── Header ── */}
        <Animated.View
          entering={FadeIn.duration(400)}
          style={{
            flexDirection:     'row',
            alignItems:        'center',
            paddingHorizontal: SPACING.xl,
            paddingVertical:   SPACING.md,
            borderBottomWidth: 1,
            borderBottomColor: COLORS.border,
          }}
        >
          <TouchableOpacity
            onPress={() => router.back()}
            style={{
              width:           40,
              height:          40,
              borderRadius:    12,
              backgroundColor: COLORS.backgroundElevated,
              alignItems:      'center',
              justifyContent:  'center',
              marginRight:     SPACING.md,
              borderWidth:     1,
              borderColor:     COLORS.border,
            }}
          >
            <Ionicons name="arrow-back" size={20} color={COLORS.textSecondary} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={{
              color:      COLORS.textPrimary,
              fontSize:   FONTS.sizes.xl,
              fontWeight: '800',
            }}>
              Credits &amp; Billing
            </Text>
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
              Power your AI research
            </Text>
          </View>
          {!isRefreshing
            ? (
              <TouchableOpacity
                onPress={refresh}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="refresh-outline" size={22} color={COLORS.textMuted} />
              </TouchableOpacity>
            )
            : <ActivityIndicator size="small" color={COLORS.primary} />
          }
        </Animated.View>

        <ScrollView
          contentContainerStyle={{
            padding: SPACING.xl,
            // Account for the sticky Buy bar height + the bottom safe-area inset.
            paddingBottom: BUY_BAR_H + insets.bottom,
          }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={refresh}
              tintColor={COLORS.primary}
              colors={[COLORS.primary]}
            />
          }
        >
          {/* ── Balance hero ── */}
          <Animated.View entering={FadeInDown.duration(500).delay(60)}>
            <LinearGradient
              colors={COLORS.gradientCard as [string, string]}
              style={{
                borderRadius: RADIUS.xl,
                padding:      SPACING.xl,
                marginBottom: SPACING.lg,
                borderWidth:  1,
                borderColor:  `${accentColor}30`,
                ...SHADOWS.medium,
              }}
            >
              <View style={{
                flexDirection: 'row',
                alignItems:    'center',
                gap:           10,
                marginBottom:  SPACING.md,
              }}>
                <LinearGradient
                  colors={
                    isEmpty ? [COLORS.error, '#CC0000']
                    : isLow  ? [COLORS.warning, '#E67E22']
                    : COLORS.gradientPrimary as [string, string]
                  }
                  style={{
                    width:          40,
                    height:         40,
                    borderRadius:   12,
                    alignItems:     'center',
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons name="flash" size={20} color="#FFF" />
                </LinearGradient>
                <Text style={{
                  color:      COLORS.textMuted,
                  fontSize:   FONTS.sizes.sm,
                  fontWeight: '600',
                }}>
                  Your Credits
                </Text>
              </View>

              {isLoading ? (
                <ActivityIndicator
                  size="large"
                  color={COLORS.primary}
                  style={{ alignSelf: 'flex-start', marginBottom: SPACING.md }}
                />
              ) : (
                <Text style={{
                  color:        COLORS.textPrimary,
                  fontSize:     52,
                  fontWeight:   '900',
                  lineHeight:   58,
                  marginBottom: 6,
                }}>
                  {balance.toLocaleString()}
                </Text>
              )}

              <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.sm }}>
                credits available
              </Text>

              {(isLow || isEmpty) && (
                <Animated.View
                  entering={FadeIn.duration(300)}
                  style={{
                    flexDirection: 'row',
                    alignItems:    'center',
                    gap:           8,
                    backgroundColor: isEmpty
                      ? `${COLORS.error}12`
                      : `${COLORS.warning}12`,
                    borderRadius: RADIUS.lg,
                    padding:      SPACING.md,
                    marginTop:    SPACING.md,
                    borderWidth:  1,
                    borderColor:  isEmpty
                      ? `${COLORS.error}25`
                      : `${COLORS.warning}25`,
                  }}
                >
                  <Ionicons
                    name={isEmpty ? 'alert-circle-outline' : 'warning-outline'}
                    size={16}
                    color={isEmpty ? COLORS.error : COLORS.warning}
                  />
                  <Text style={{
                    color:      isEmpty ? COLORS.error : COLORS.warning,
                    fontSize:   FONTS.sizes.xs,
                    flex:       1,
                    lineHeight: 17,
                  }}>
                    {isEmpty
                      ? "You're out of credits. Buy a pack below to continue researching."
                      : `Low balance — only ${balance} credits left. Top up to keep researching.`
                    }
                  </Text>
                </Animated.View>
              )}
            </LinearGradient>
          </Animated.View>

          {/* ── Purchase phase states ── */}

          {/* Verifying (was "Polling") */}
          {purchaseState.phase === 'polling' && purchaseState.selectedPack && (
            <VerifyingView packName={purchaseState.selectedPack.name} />
          )}

          {purchaseState.phase === 'creating_order' && (
            <View style={{
              backgroundColor: COLORS.backgroundCard,
              borderRadius:    RADIUS.xl,
              padding:         SPACING.lg,
              marginBottom:    SPACING.lg,
              flexDirection:   'row',
              alignItems:      'center',
              gap:             SPACING.md,
              borderWidth:     1,
              borderColor:     `${COLORS.primary}25`,
            }}>
              <ActivityIndicator size="small" color={COLORS.primary} />
              <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.sm }}>
                Creating secure payment order...
              </Text>
            </View>
          )}

          {purchaseState.phase === 'opening_browser' && (
            <View style={{
              backgroundColor: COLORS.backgroundCard,
              borderRadius:    RADIUS.xl,
              padding:         SPACING.lg,
              marginBottom:    SPACING.lg,
              flexDirection:   'row',
              alignItems:      'center',
              gap:             SPACING.md,
              borderWidth:     1,
              borderColor:     `${COLORS.primary}25`,
            }}>
              <Ionicons name="open-outline" size={18} color={COLORS.primary} />
              <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.sm }}>
                Opening payment page...
              </Text>
            </View>
          )}

          {/* Cancelled state */}
          {purchaseState.phase === 'cancelled' && (
            <Animated.View
              entering={FadeIn.duration(300)}
              style={{
                backgroundColor: `${COLORS.warning}10`,
                borderRadius:    RADIUS.xl,
                padding:         SPACING.md,
                marginBottom:    SPACING.lg,
                borderWidth:     1,
                borderColor:     `${COLORS.warning}30`,
                flexDirection:   'row',
                alignItems:      'center',
                gap:             10,
              }}
            >
              <Ionicons name="close-circle-outline" size={18} color={COLORS.warning} />
              <View style={{ flex: 1 }}>
                <Text style={{
                  color:        COLORS.warning,
                  fontSize:     FONTS.sizes.sm,
                  fontWeight:   '700',
                  marginBottom: 4,
                }}>
                  Payment Cancelled
                </Text>
                <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
                  No charges were made. You can try again.
                </Text>
              </View>
              <TouchableOpacity onPress={resetPurchase}>
                <Ionicons name="close" size={18} color={COLORS.textMuted} />
              </TouchableOpacity>
            </Animated.View>
          )}

          {/* Failed state */}
          {purchaseState.phase === 'failed' && (
            <Animated.View
              entering={FadeIn.duration(300)}
              style={{
                backgroundColor: `${COLORS.error}10`,
                borderRadius:    RADIUS.xl,
                padding:         SPACING.md,
                marginBottom:    SPACING.lg,
                borderWidth:     1,
                borderColor:     `${COLORS.error}30`,
                flexDirection:   'row',
                alignItems:      'flex-start',
                gap:             10,
              }}
            >
              <Ionicons
                name="alert-circle-outline"
                size={18}
                color={COLORS.error}
                style={{ marginTop: 1 }}
              />
              <View style={{ flex: 1 }}>
                <Text style={{
                  color:        COLORS.error,
                  fontSize:     FONTS.sizes.sm,
                  fontWeight:   '700',
                  marginBottom: 4,
                }}>
                  Payment Failed
                </Text>
                <Text style={{
                  color:      COLORS.textMuted,
                  fontSize:   FONTS.sizes.xs,
                  lineHeight: 17,
                }}>
                  {purchaseState.error ?? 'Something went wrong. Please try again.'}
                </Text>
              </View>
              <TouchableOpacity onPress={resetPurchase}>
                <Ionicons name="close" size={18} color={COLORS.textMuted} />
              </TouchableOpacity>
            </Animated.View>
          )}

          {/* ── Pack selector ── */}
          <Animated.View entering={FadeInDown.duration(500).delay(120)}>
            <Text style={{
              color:          COLORS.textSecondary,
              fontSize:       FONTS.sizes.sm,
              fontWeight:     '600',
              letterSpacing:  0.8,
              textTransform:  'uppercase',
              marginBottom:   SPACING.md,
            }}>
              Select a Pack
            </Text>
            <View style={{
              flexDirection: 'row',
              flexWrap:      'wrap',
              gap:           SPACING.sm,
              marginBottom:  SPACING.xl,
            }}>
              {CREDIT_PACKS.map(pack => (
                <PackCard
                  key={pack.id}
                  pack={pack}
                  isSelected={selectedPack?.id === pack.id}
                  onSelect={() => setSelectedPack(pack)}
                />
              ))}
            </View>
          </Animated.View>

          {/* ── Feature costs ── */}
          <Animated.View entering={FadeInDown.duration(500).delay(180)}>
            <Text style={{
              color:         COLORS.textSecondary,
              fontSize:      FONTS.sizes.sm,
              fontWeight:    '600',
              letterSpacing: 0.8,
              textTransform: 'uppercase',
              marginBottom:  SPACING.md,
            }}>
              What Credits Get You
            </Text>
            <View style={{
              backgroundColor: COLORS.backgroundCard,
              borderRadius:    RADIUS.xl,
              overflow:        'hidden',
              borderWidth:     1,
              borderColor:     COLORS.border,
              marginBottom:    SPACING.xl,
            }}>
              {FEATURE_ROWS.map((row, i) => (
                <View
                  key={row.feature}
                  style={{
                    flexDirection:     'row',
                    alignItems:        'center',
                    paddingVertical:   SPACING.sm,
                    paddingHorizontal: SPACING.md,
                    borderBottomWidth: 1,
                    borderBottomColor: COLORS.border,
                    gap:               SPACING.md,
                  }}
                >
                  <View style={{
                    width:           34,
                    height:          34,
                    borderRadius:    10,
                    backgroundColor: `${COLORS.primary}12`,
                    alignItems:      'center',
                    justifyContent:  'center',
                    flexShrink:      0,
                  }}>
                    <Ionicons name={row.icon as any} size={15} color={COLORS.primary} />
                  </View>
                  <Text style={{
                    flex:      1,
                    color:     COLORS.textSecondary,
                    fontSize:  FONTS.sizes.sm,
                  }}>
                    {row.label}
                  </Text>
                  <View style={{
                    flexDirection:     'row',
                    alignItems:        'center',
                    gap:               4,
                    backgroundColor:   `${COLORS.primary}12`,
                    borderRadius:      RADIUS.full,
                    paddingHorizontal: 10,
                    paddingVertical:   4,
                    borderWidth:       1,
                    borderColor:       `${COLORS.primary}25`,
                  }}>
                    <Ionicons name="flash" size={11} color={COLORS.primary} />
                    <Text style={{
                      color:      COLORS.primary,
                      fontSize:   FONTS.sizes.xs,
                      fontWeight: '800',
                    }}>
                      {row.cost}
                    </Text>
                  </View>
                </View>
              ))}

              {/* Part 58: podcast audio-quality add-on note */}
              <View style={{
                flexDirection:     'row',
                alignItems:        'center',
                gap:               8,
                paddingVertical:   SPACING.sm,
                paddingHorizontal: SPACING.md,
                backgroundColor:   `${COLORS.primary}08`,
              }}>
                <Ionicons name="sparkles-outline" size={13} color={COLORS.textMuted} />
                <Text style={{ flex: 1, color: COLORS.textMuted, fontSize: FONTS.sizes.xs, lineHeight: 16 }}>
                  Podcast audio quality add-on:{' '}
                  <Text style={{ color: COLORS.textSecondary, fontWeight: '700' }}>
                    +{FEATURE_COSTS.podcast_quality_high} cr High
                  </Text>
                  {' · '}
                  <Text style={{ color: COLORS.textSecondary, fontWeight: '700' }}>
                    +{FEATURE_COSTS.podcast_quality_lossless} cr Lossless
                  </Text>
                </Text>
              </View>
            </View>
          </Animated.View>

          {/* ── Transaction history ── */}
          <Animated.View entering={FadeInDown.duration(500).delay(240)}>
            <TouchableOpacity
              onPress={() => setShowTxHistory(prev => !prev)}
              style={{
                flexDirection:  'row',
                alignItems:     'center',
                justifyContent: 'space-between',
                marginBottom:   SPACING.sm,
              }}
            >
              <Text style={{
                color:         COLORS.textSecondary,
                fontSize:      FONTS.sizes.sm,
                fontWeight:    '600',
                letterSpacing: 0.8,
                textTransform: 'uppercase',
              }}>
                Transaction History
              </Text>
              <Ionicons
                name={showTxHistory ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={COLORS.textMuted}
              />
            </TouchableOpacity>
            {showTxHistory && (
              <View style={{
                backgroundColor: COLORS.backgroundCard,
                borderRadius:    RADIUS.xl,
                padding:         SPACING.md,
                borderWidth:     1,
                borderColor:     COLORS.border,
              }}>
                {txLoading ? (
                  <View style={{ alignItems: 'center', paddingVertical: SPACING.lg }}>
                    <ActivityIndicator size="small" color={COLORS.primary} />
                  </View>
                ) : transactions.length === 0 ? (
                  <View style={{ alignItems: 'center', paddingVertical: SPACING.lg }}>
                    <Ionicons name="receipt-outline" size={28} color={COLORS.border} />
                    <Text style={{
                      color:     COLORS.textMuted,
                      fontSize:  FONTS.sizes.sm,
                      marginTop: 8,
                    }}>
                      No transactions yet
                    </Text>
                  </View>
                ) : (
                  transactions.map(tx => (
                    <TransactionRow key={tx.id} tx={tx} />
                  ))
                )}
              </View>
            )}
          </Animated.View>
        </ScrollView>

        {/* ── Sticky Buy Button ──
            Part 55.2: backdrop changed from hardcoded 'rgba(10,10,26,0.97)' to
            getModalBackdrop(0.97) so it derives from the active theme's background,
            keeping the bar visually consistent in both dark and light themes.
            Bottom padding uses the safe-area inset for Android edge-to-edge. */}
        {!isPurchasing && selectedPack && (
          <View style={{
            position:          'absolute',
            bottom:            0,
            left:              0,
            right:             0,
            paddingHorizontal: SPACING.xl,
            paddingTop:        SPACING.md,
            paddingBottom:     Math.max(insets.bottom, SPACING.md),
            backgroundColor:   getModalBackdrop(0.97),
            borderTopWidth:    1,
            borderTopColor:    COLORS.border,
          }}>
            <View style={{
              flexDirection:  'row',
              alignItems:     'center',
              justifyContent: 'space-between',
              marginBottom:   SPACING.sm,
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="flash" size={14} color={COLORS.primary} />
                <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.xs }}>
                  {getTotalPackCredits(selectedPack)} credits · {selectedPack.name}
                </Text>
              </View>
              <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
                UPI · Cards · Netbanking
              </Text>
            </View>

            <TouchableOpacity onPress={handleBuyPress} activeOpacity={0.85}>
              <LinearGradient
                colors={selectedPack.gradientColors}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={{
                  borderRadius:   RADIUS.lg,
                  paddingVertical: 16,
                  flexDirection:  'row',
                  alignItems:     'center',
                  justifyContent: 'center',
                  gap:            10,
                  ...SHADOWS.large,
                }}
              >
                <Ionicons name="flash" size={20} color="#FFF" />
                <Text style={{
                  color:      '#FFF',
                  fontSize:   FONTS.sizes.md,
                  fontWeight: '800',
                }}>
                  Buy Now — {formatINR(selectedPack.priceINR)}
                </Text>
                <View style={{
                  backgroundColor:   'rgba(255,255,255,0.2)',
                  borderRadius:      RADIUS.full,
                  paddingHorizontal: 8,
                  paddingVertical:   3,
                }}>
                  <Text style={{ color: '#FFF', fontSize: 9, fontWeight: '800' }}>
                    RAZORPAY
                  </Text>
                </View>
              </LinearGradient>
            </TouchableOpacity>

            <Text style={{
              color:     COLORS.textMuted,
              fontSize:  FONTS.sizes.xs,
              textAlign: 'center',
              marginTop: SPACING.sm,
            }}>
              🔒  Secured by Razorpay · Credits never expire
            </Text>
          </View>
        )}

        <PurchaseSuccessToast
          visible={showSuccessToast}
          creditsAdded={purchaseState.creditsAdded ?? 0}
          newBalance={balance}
          onHide={handleToastHide}
        />

      </SafeAreaView>
    </LinearGradient>
  );
}