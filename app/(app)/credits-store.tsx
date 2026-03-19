// app/(app)/credits-store.tsx
// Part 24 (Fix) — Updated purchase phase labels to match new flow.
// CHANGE from original: added 'cancelled' phase display, updated 'polling'
// phase label to say "Verifying payment..." instead of "Confirming Payment..."
// Everything else identical to Part 24B credits-store.tsx.

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  Alert, RefreshControl, Dimensions,
}                                  from 'react-native';
import { LinearGradient }          from 'expo-linear-gradient';
import { Ionicons }                from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown, useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { SafeAreaView }            from 'react-native-safe-area-context';
import { router }                  from 'expo-router';
import { useCredits }              from '../../src/context/CreditsContext';
import { PurchaseSuccessToast }    from '../../src/components/credits/PurchaseSuccessToast';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../src/constants/theme';
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

function PackCard({ pack, isSelected, onSelect }: { pack: CreditPack; isSelected: boolean; onSelect: () => void }) {
  const total = getTotalPackCredits(pack);
  return (
    <TouchableOpacity onPress={onSelect} activeOpacity={0.82} style={{
      width: PACK_CARD_W, borderRadius: RADIUS.xl, overflow: 'hidden',
      borderWidth: 2, borderColor: isSelected ? pack.gradientColors[0] : COLORS.border, ...SHADOWS.medium,
    }}>
      <LinearGradient
        colors={isSelected ? pack.gradientColors : ['#12122A', '#0A0A1A']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={{ padding: SPACING.md }}
      >
        {pack.tag && (
          <View style={{ alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 3, marginBottom: SPACING.sm }}>
            <Text style={{ color: '#FFF', fontSize: 9, fontWeight: '800', letterSpacing: 0.5 }}>{pack.tag}</Text>
          </View>
        )}
        <View style={{ width: 44, height: 44, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.sm }}>
          <Ionicons name={pack.iconName as any} size={22} color="#FFF" />
        </View>
        <Text style={{ color: '#FFF', fontSize: FONTS.sizes.sm, fontWeight: '700', opacity: isSelected ? 1 : 0.8, marginBottom: 2 }}>{pack.name}</Text>
        <Text style={{ color: '#FFF', fontSize: 24, fontWeight: '900', lineHeight: 28 }}>{total.toLocaleString()}</Text>
        <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: FONTS.sizes.xs, marginBottom: SPACING.sm }}>
          credits{pack.bonusCredits ? ` (+${pack.bonusCredits} bonus)` : ''}
        </Text>
        <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.15)', marginBottom: SPACING.sm }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ color: '#FFF', fontSize: FONTS.sizes.lg, fontWeight: '800' }}>{formatINR(pack.priceINR)}</Text>
          {isSelected && (
            <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' }}>
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
  const meta      = TX_META[tx.type] ?? TX_META.consume;
  const isPositive = tx.amount > 0;
  const dateLabel  = new Date(tx.createdAt).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.border, gap: SPACING.md }}>
      <View style={{ width: 38, height: 38, borderRadius: 11, backgroundColor: `${meta.color}15`, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: `${meta.color}25`, flexShrink: 0 }}>
        <Ionicons name={meta.icon as any} size={17} color={meta.color} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '600' }} numberOfLines={1}>
          {tx.description || meta.label}
        </Text>
        <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 1 }}>
          {dateLabel}  ·  Balance after: {tx.balanceAfter}
        </Text>
      </View>
      <Text style={{ color: isPositive ? COLORS.success : COLORS.textSecondary, fontSize: FONTS.sizes.base, fontWeight: '800', flexShrink: 0 }}>
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
      withSequence(withTiming(1.1, { duration: 700 }), withTiming(1.0, { duration: 700 })),
      -1, false,
    );
  }, []);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

  return (
    <View style={{ backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.xl, padding: SPACING.xl, marginBottom: SPACING.lg, alignItems: 'center', borderWidth: 1, borderColor: `${COLORS.primary}25` }}>
      <Animated.View style={[animStyle, { marginBottom: SPACING.md }]}>
        <LinearGradient
          colors={COLORS.gradientPrimary}
          style={{ width: 72, height: 72, borderRadius: 22, alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons name="shield-checkmark-outline" size={34} color="#FFF" />
        </LinearGradient>
      </Animated.View>
      <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '800', textAlign: 'center', marginBottom: 8 }}>
        Verifying Payment...
      </Text>
      <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.sm, textAlign: 'center', lineHeight: 20 }}>
        Confirming your {packName} purchase.{'\n'}Credits are being added to your account.
      </Text>
      <ActivityIndicator size="small" color={COLORS.primary} style={{ marginTop: SPACING.md }} />
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function CreditsStoreScreen() {
  const {
    balance, isLoading, isRefreshing, transactions, txLoading,
    purchaseState, refresh, loadTransactions, purchasePack, resetPurchase,
  } = useCredits();

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
    if (!selectedPack) { Alert.alert('Select a Pack', 'Please select a credit pack first.'); return; }
    purchasePack(selectedPack);
  }, [selectedPack, purchasePack]);

  const handleToastHide = useCallback(() => {
    setShowSuccessToast(false);
    resetPurchase();
  }, [resetPurchase]);

  const FEATURE_ROWS = [
    { feature: 'research_quick',  label: 'Quick Research',   icon: 'flash-outline',     cost: FEATURE_COSTS.research_quick  },
    { feature: 'research_deep',   label: 'Deep Research',    icon: 'analytics-outline', cost: FEATURE_COSTS.research_deep   },
    { feature: 'research_expert', label: 'Expert Research',  icon: 'trophy-outline',    cost: FEATURE_COSTS.research_expert },
    { feature: 'podcast_10min',   label: 'Podcast (10 min)', icon: 'radio-outline',     cost: FEATURE_COSTS.podcast_10min   },
    { feature: 'academic_paper',  label: 'Academic Paper',   icon: 'school-outline',    cost: FEATURE_COSTS.academic_paper  },
    { feature: 'presentation',    label: 'AI Presentation',  icon: 'easel-outline',     cost: FEATURE_COSTS.presentation    },
    { feature: 'debate',          label: 'AI Debate',        icon: 'people-outline',    cost: FEATURE_COSTS.debate          },
  ];

  const accentColor = isEmpty ? COLORS.error : isLow ? COLORS.warning : COLORS.primary;

  return (
    <LinearGradient colors={[COLORS.background, COLORS.backgroundCard]} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>

        {/* Header */}
        <Animated.View entering={FadeIn.duration(400)} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
          <TouchableOpacity onPress={() => router.back()} style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: COLORS.backgroundElevated, alignItems: 'center', justifyContent: 'center', marginRight: SPACING.md }}>
            <Ionicons name="arrow-back" size={20} color={COLORS.textSecondary} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.xl, fontWeight: '800' }}>Credits & Billing</Text>
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>Power your AI research</Text>
          </View>
          {!isRefreshing
            ? <TouchableOpacity onPress={refresh} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}><Ionicons name="refresh-outline" size={22} color={COLORS.textMuted} /></TouchableOpacity>
            : <ActivityIndicator size="small" color={COLORS.primary} />}
        </Animated.View>

        <ScrollView
          contentContainerStyle={{ padding: SPACING.xl, paddingBottom: 140 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} tintColor={COLORS.primary} colors={[COLORS.primary]} />}
        >
          {/* Balance hero */}
          <Animated.View entering={FadeInDown.duration(500).delay(60)}>
            <LinearGradient
              colors={['#1A1A35', '#12122A']}
              style={{ borderRadius: RADIUS.xl, padding: SPACING.xl, marginBottom: SPACING.lg, borderWidth: 1, borderColor: `${accentColor}30`, ...SHADOWS.medium }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: SPACING.md }}>
                <LinearGradient
                  colors={isEmpty ? [COLORS.error, '#CC0000'] : isLow ? [COLORS.warning, '#E67E22'] : COLORS.gradientPrimary}
                  style={{ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Ionicons name="flash" size={20} color="#FFF" />
                </LinearGradient>
                <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.sm, fontWeight: '600' }}>Your Credits</Text>
              </View>
              {isLoading
                ? <ActivityIndicator size="large" color={COLORS.primary} style={{ alignSelf: 'flex-start', marginBottom: SPACING.md }} />
                : <Text style={{ color: COLORS.textPrimary, fontSize: 52, fontWeight: '900', lineHeight: 58, marginBottom: 6 }}>{balance.toLocaleString()}</Text>}
              <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.sm }}>credits available</Text>
              {(isLow || isEmpty) && (
                <Animated.View entering={FadeIn.duration(300)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: isEmpty ? `${COLORS.error}12` : `${COLORS.warning}12`, borderRadius: RADIUS.lg, padding: SPACING.md, marginTop: SPACING.md, borderWidth: 1, borderColor: isEmpty ? `${COLORS.error}25` : `${COLORS.warning}25` }}>
                  <Ionicons name={isEmpty ? 'alert-circle-outline' : 'warning-outline'} size={16} color={isEmpty ? COLORS.error : COLORS.warning} />
                  <Text style={{ color: isEmpty ? COLORS.error : COLORS.warning, fontSize: FONTS.sizes.xs, flex: 1, lineHeight: 17 }}>
                    {isEmpty ? 'You\'re out of credits. Buy a pack below to continue researching.' : `Low balance — only ${balance} credits left. Top up to keep researching.`}
                  </Text>
                </Animated.View>
              )}
            </LinearGradient>
          </Animated.View>

          {/* Purchase phase states */}

          {/* Verifying (was "Polling") — now shows "Verifying Payment..." */}
          {purchaseState.phase === 'polling' && purchaseState.selectedPack && (
            <VerifyingView packName={purchaseState.selectedPack.name} />
          )}

          {purchaseState.phase === 'creating_order' && (
            <View style={{ backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.xl, padding: SPACING.lg, marginBottom: SPACING.lg, flexDirection: 'row', alignItems: 'center', gap: SPACING.md, borderWidth: 1, borderColor: `${COLORS.primary}25` }}>
              <ActivityIndicator size="small" color={COLORS.primary} />
              <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.sm }}>Creating secure payment order...</Text>
            </View>
          )}

          {purchaseState.phase === 'opening_browser' && (
            <View style={{ backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.xl, padding: SPACING.lg, marginBottom: SPACING.lg, flexDirection: 'row', alignItems: 'center', gap: SPACING.md, borderWidth: 1, borderColor: `${COLORS.primary}25` }}>
              <Ionicons name="open-outline" size={18} color={COLORS.primary} />
              <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.sm }}>Opening payment page...</Text>
            </View>
          )}

          {/* Cancelled state */}
          {purchaseState.phase === 'cancelled' && (
            <Animated.View entering={FadeIn.duration(300)} style={{ backgroundColor: `${COLORS.warning}10`, borderRadius: RADIUS.xl, padding: SPACING.md, marginBottom: SPACING.lg, borderWidth: 1, borderColor: `${COLORS.warning}30`, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Ionicons name="close-circle-outline" size={18} color={COLORS.warning} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: COLORS.warning, fontSize: FONTS.sizes.sm, fontWeight: '700', marginBottom: 4 }}>Payment Cancelled</Text>
                <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>No charges were made. You can try again.</Text>
              </View>
              <TouchableOpacity onPress={resetPurchase}><Ionicons name="close" size={18} color={COLORS.textMuted} /></TouchableOpacity>
            </Animated.View>
          )}

          {/* Failed state */}
          {purchaseState.phase === 'failed' && (
            <Animated.View entering={FadeIn.duration(300)} style={{ backgroundColor: `${COLORS.error}10`, borderRadius: RADIUS.xl, padding: SPACING.md, marginBottom: SPACING.lg, borderWidth: 1, borderColor: `${COLORS.error}30`, flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
              <Ionicons name="alert-circle-outline" size={18} color={COLORS.error} style={{ marginTop: 1 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: COLORS.error, fontSize: FONTS.sizes.sm, fontWeight: '700', marginBottom: 4 }}>Payment Failed</Text>
                <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, lineHeight: 17 }}>
                  {purchaseState.error ?? 'Something went wrong. Please try again.'}
                </Text>
              </View>
              <TouchableOpacity onPress={resetPurchase}><Ionicons name="close" size={18} color={COLORS.textMuted} /></TouchableOpacity>
            </Animated.View>
          )}

          {/* Pack selector */}
          <Animated.View entering={FadeInDown.duration(500).delay(120)}>
            <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: SPACING.md }}>Select a Pack</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginBottom: SPACING.xl }}>
              {CREDIT_PACKS.map(pack => (
                <PackCard key={pack.id} pack={pack} isSelected={selectedPack?.id === pack.id} onSelect={() => setSelectedPack(pack)} />
              ))}
            </View>
          </Animated.View>

          {/* Feature costs */}
          <Animated.View entering={FadeInDown.duration(500).delay(180)}>
            <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: SPACING.md }}>What Credits Get You</Text>
            <View style={{ backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.xl, overflow: 'hidden', borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.xl }}>
              {FEATURE_ROWS.map((row, i) => (
                <View key={row.feature} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: SPACING.sm, paddingHorizontal: SPACING.md, borderBottomWidth: i < FEATURE_ROWS.length - 1 ? 1 : 0, borderBottomColor: COLORS.border, gap: SPACING.md }}>
                  <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: `${COLORS.primary}12`, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Ionicons name={row.icon as any} size={15} color={COLORS.primary} />
                  </View>
                  <Text style={{ flex: 1, color: COLORS.textSecondary, fontSize: FONTS.sizes.sm }}>{row.label}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: `${COLORS.primary}12`, borderRadius: RADIUS.full, paddingHorizontal: 10, paddingVertical: 4 }}>
                    <Ionicons name="flash" size={11} color={COLORS.primary} />
                    <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.xs, fontWeight: '800' }}>{row.cost}</Text>
                  </View>
                </View>
              ))}
            </View>
          </Animated.View>

          {/* Transaction history */}
          <Animated.View entering={FadeInDown.duration(500).delay(240)}>
            <TouchableOpacity onPress={() => setShowTxHistory(prev => !prev)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.sm }}>
              <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase' }}>Transaction History</Text>
              <Ionicons name={showTxHistory ? 'chevron-up' : 'chevron-down'} size={18} color={COLORS.textMuted} />
            </TouchableOpacity>
            {showTxHistory && (
              <View style={{ backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.xl, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border }}>
                {txLoading ? (
                  <View style={{ alignItems: 'center', paddingVertical: SPACING.lg }}><ActivityIndicator size="small" color={COLORS.primary} /></View>
                ) : transactions.length === 0 ? (
                  <View style={{ alignItems: 'center', paddingVertical: SPACING.lg }}>
                    <Ionicons name="receipt-outline" size={28} color={COLORS.border} />
                    <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.sm, marginTop: 8 }}>No transactions yet</Text>
                  </View>
                ) : (
                  transactions.map(tx => <TransactionRow key={tx.id} tx={tx} />)
                )}
              </View>
            )}
          </Animated.View>
        </ScrollView>

        {/* Sticky Buy Button */}
        {!isPurchasing && selectedPack && (
          <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: SPACING.xl, paddingTop: SPACING.md, paddingBottom: SPACING.xl + 4, backgroundColor: 'rgba(10,10,26,0.97)', borderTopWidth: 1, borderTopColor: COLORS.border }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="flash" size={14} color={COLORS.primary} />
                <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.xs }}>
                  {getTotalPackCredits(selectedPack)} credits · {selectedPack.name}
                </Text>
              </View>
              <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>UPI · Cards · Netbanking</Text>
            </View>

            <TouchableOpacity onPress={handleBuyPress} activeOpacity={0.85}>
              <LinearGradient
                colors={selectedPack.gradientColors}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={{ borderRadius: RADIUS.lg, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, ...SHADOWS.large }}
              >
                <Ionicons name="flash" size={20} color="#FFF" />
                <Text style={{ color: '#FFF', fontSize: FONTS.sizes.md, fontWeight: '800' }}>Buy Now — {formatINR(selectedPack.priceINR)}</Text>
                <View style={{ backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 3 }}>
                  <Text style={{ color: '#FFF', fontSize: 9, fontWeight: '800' }}>RAZORPAY</Text>
                </View>
              </LinearGradient>
            </TouchableOpacity>

            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, textAlign: 'center', marginTop: SPACING.sm }}>
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