// app/(app)/transaction-history.tsx
// Part 24 — Standalone transaction history screen.

import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { LinearGradient }   from 'expo-linear-gradient';
import { Ionicons }         from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { SafeAreaView }     from 'react-native-safe-area-context';
import { router }           from 'expo-router';
import { useAuth }          from '../../src/context/AuthContext';
import { useCredits }       from '../../src/context/CreditsContext';
import { fetchTransactions } from '../../src/services/creditsService';
import { COLORS, FONTS, SPACING, RADIUS } from '../../src/constants/theme';
import type { CreditTransaction } from '../../src/types/credits';

// ─── Type display config ──────────────────────────────────────────────────────

const TX_META: Record<string, { icon: string; color: string; label: string }> = {
  purchase:    { icon: 'arrow-down-circle-outline', color: COLORS.success, label: 'Purchase'     },
  consume:     { icon: 'flash-outline',             color: COLORS.primary, label: 'Used'         },
  refund:      { icon: 'refresh-circle-outline',    color: COLORS.info,    label: 'Refund'       },
  signup_bonus:{ icon: 'gift-outline',              color: COLORS.accent,  label: 'Welcome Bonus'},
  admin_grant: { icon: 'star-outline',              color: COLORS.warning, label: 'Bonus Grant'  },
};

const FEATURE_LABELS: Record<string, string> = {
  research_quick:  'Quick Research',
  research_deep:   'Deep Research',
  research_expert: 'Expert Research',
  podcast_5min:    'Podcast (5 min)',
  podcast_10min:   'Podcast (10 min)',
  podcast_15min:   'Podcast (15 min)',
  podcast_20min:   'Podcast (20 min)',
  academic_paper:  'Academic Paper',
  presentation:    'AI Presentation',
  debate:          'AI Debate',
};

// ─── Transaction row ──────────────────────────────────────────────────────────

function TransactionRow({ tx, index }: { tx: CreditTransaction; index: number }) {
  const meta       = TX_META[tx.type] ?? TX_META.consume;
  const isPositive = tx.amount > 0;

  const dateLabel = new Date(tx.createdAt).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
  const timeLabel = new Date(tx.createdAt).toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit',
  });

  // Human-readable description
  const description = tx.description
    || (tx.feature ? `Used for ${FEATURE_LABELS[tx.feature] ?? tx.feature}` : meta.label);

  return (
    <Animated.View entering={FadeInDown.duration(300).delay(index * 30)}>
      <View style={{
        flexDirection:  'row',
        alignItems:     'center',
        paddingVertical: SPACING.md,
        paddingHorizontal: SPACING.lg,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.border,
        gap: SPACING.md,
      }}>
        {/* Icon */}
        <View style={{
          width: 42, height: 42, borderRadius: 13,
          backgroundColor: `${meta.color}15`,
          alignItems: 'center', justifyContent: 'center',
          borderWidth: 1, borderColor: `${meta.color}25`,
          flexShrink: 0,
        }}>
          <Ionicons name={meta.icon as any} size={19} color={meta.color} />
        </View>

        {/* Text */}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '600' }}
            numberOfLines={1}
          >
            {description}
          </Text>
          <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 2 }}>
            {dateLabel} · {timeLabel}
          </Text>
          <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 1 }}>
            Balance after: {tx.balanceAfter.toLocaleString()} cr
          </Text>
        </View>

        {/* Amount */}
        <Text style={{
          color:      isPositive ? COLORS.success : COLORS.textSecondary,
          fontSize:   FONTS.sizes.base,
          fontWeight: '800',
          flexShrink: 0,
        }}>
          {isPositive ? '+' : ''}{tx.amount}
        </Text>
      </View>
    </Animated.View>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <View style={{ alignItems: 'center', paddingTop: 60, paddingHorizontal: SPACING.xl }}>
      <View style={{
        width: 72, height: 72, borderRadius: 22,
        backgroundColor: COLORS.backgroundElevated,
        alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.md,
      }}>
        <Ionicons name="receipt-outline" size={32} color={COLORS.border} />
      </View>
      <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.base, fontWeight: '600' }}>
        No transactions yet
      </Text>
      <Text style={{
        color: COLORS.textMuted, fontSize: FONTS.sizes.sm,
        textAlign: 'center', marginTop: SPACING.sm, lineHeight: 20,
      }}>
        Your credit purchases and usage{'\n'}will appear here.
      </Text>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

const PAGE_SIZE = 25;

export default function TransactionHistoryScreen() {
  const { user }    = useAuth();
  const { balance } = useCredits();

  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [isLoading,    setIsLoading]    = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore,setIsLoadingMore]= useState(false);
  const [hasMore,      setHasMore]      = useState(true);
  const [offset,       setOffset]       = useState(0);

  // ── Load ──────────────────────────────────────────────────────────────────

  const load = useCallback(async (reset = false) => {
    if (!user) return;
    const currentOffset = reset ? 0 : offset;

    if (reset) {
      setIsLoading(true);
    } else {
      setIsLoadingMore(true);
    }

    try {
      const txs = await fetchTransactions(user.id, PAGE_SIZE, currentOffset);

      if (reset) {
        setTransactions(txs);
        setOffset(txs.length);
      } else {
        setTransactions(prev => [...prev, ...txs]);
        setOffset(prev => prev + txs.length);
      }

      setHasMore(txs.length === PAGE_SIZE);
    } catch (err) {
      console.warn('[TransactionHistory] load error:', err);
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
      setIsRefreshing(false);
    }
  }, [user, offset]);

  useEffect(() => { load(true); }, [user?.id]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    setOffset(0);
    setHasMore(true);
    await load(true);
  }, []);

  const handleLoadMore = useCallback(() => {
    if (!isLoadingMore && hasMore) load(false);
  }, [isLoadingMore, hasMore, load]);

  // ── Group by date ─────────────────────────────────────────────────────────

  const grouped = transactions.reduce<{ date: string; items: CreditTransaction[] }[]>(
    (acc, tx) => {
      const dateKey = new Date(tx.createdAt).toLocaleDateString('en-IN', {
        day: 'numeric', month: 'long', year: 'numeric',
      });
      const last = acc[acc.length - 1];
      if (last && last.date === dateKey) {
        last.items.push(tx);
      } else {
        acc.push({ date: dateKey, items: [tx] });
      }
      return acc;
    },
    [],
  );

  // ── Summary stats ─────────────────────────────────────────────────────────

  const totalSpent = transactions
    .filter(t => t.type === 'consume')
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);

  const totalPurchased = transactions
    .filter(t => t.type === 'purchase')
    .reduce((sum, t) => sum + t.amount, 0);

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <LinearGradient colors={[COLORS.background, COLORS.backgroundCard]} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>

        {/* Header */}
        <Animated.View
          entering={FadeIn.duration(400)}
          style={{
            flexDirection:  'row',
            alignItems:     'center',
            paddingHorizontal: SPACING.xl,
            paddingVertical:   SPACING.md,
            borderBottomWidth: 1,
            borderBottomColor: COLORS.border,
          }}
        >
          <TouchableOpacity
            onPress={() => router.back()}
            style={{
              width: 40, height: 40, borderRadius: 12,
              backgroundColor: COLORS.backgroundElevated,
              alignItems: 'center', justifyContent: 'center',
              marginRight: SPACING.md,
            }}
          >
            <Ionicons name="arrow-back" size={20} color={COLORS.textSecondary} />
          </TouchableOpacity>

          <View style={{ flex: 1 }}>
            <Text style={{
              color: COLORS.textPrimary, fontSize: FONTS.sizes.xl, fontWeight: '800',
            }}>
              Transaction History
            </Text>
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
              All credit activity
            </Text>
          </View>

          {/* Current balance pill */}
          <View style={{
            flexDirection:     'row',
            alignItems:        'center',
            gap:               5,
            backgroundColor:   `${COLORS.primary}15`,
            borderRadius:      RADIUS.full,
            paddingHorizontal: 10,
            paddingVertical:   5,
            borderWidth:       1,
            borderColor:       `${COLORS.primary}30`,
          }}>
            <Ionicons name="flash" size={12} color={COLORS.primary} />
            <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.xs, fontWeight: '700' }}>
              {balance.toLocaleString()} cr
            </Text>
          </View>
        </Animated.View>

        {isLoading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator size="large" color={COLORS.primary} />
          </View>
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={handleRefresh}
                tintColor={COLORS.primary}
                colors={[COLORS.primary]}
              />
            }
            onMomentumScrollEnd={({ nativeEvent }) => {
              const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
              const isNearBottom =
                layoutMeasurement.height + contentOffset.y >= contentSize.height - 80;
              if (isNearBottom) handleLoadMore();
            }}
          >
            {/* Summary strip */}
            {transactions.length > 0 && (
              <Animated.View entering={FadeInDown.duration(400).delay(60)}>
                <View style={{
                  flexDirection:   'row',
                  margin:          SPACING.xl,
                  marginBottom:    SPACING.md,
                  backgroundColor: COLORS.backgroundCard,
                  borderRadius:    RADIUS.xl,
                  overflow:        'hidden',
                  borderWidth:     1,
                  borderColor:     COLORS.border,
                }}>
                  {[
                    { label: 'Current Balance', value: `${balance.toLocaleString()} cr`, color: COLORS.primary,  icon: 'flash'             },
                    { label: 'Total Purchased',  value: `${totalPurchased.toLocaleString()} cr`, color: COLORS.success, icon: 'arrow-down-circle' },
                    { label: 'Total Used',       value: `${totalSpent.toLocaleString()} cr`,     color: COLORS.secondary, icon: 'trending-down'  },
                  ].map((stat, i) => (
                    <View
                      key={stat.label}
                      style={{
                        flex: 1,
                        alignItems: 'center',
                        paddingVertical: SPACING.md,
                        borderRightWidth: i < 2 ? 1 : 0,
                        borderRightColor: COLORS.border,
                      }}
                    >
                      <Ionicons name={stat.icon as any} size={14} color={stat.color} style={{ marginBottom: 4 }} />
                      <Text style={{
                        color: stat.color, fontSize: FONTS.sizes.sm, fontWeight: '800',
                      }}>
                        {stat.value}
                      </Text>
                      <Text style={{ color: COLORS.textMuted, fontSize: 9, marginTop: 2, textAlign: 'center' }}>
                        {stat.label}
                      </Text>
                    </View>
                  ))}
                </View>
              </Animated.View>
            )}

            {/* Buy credits shortcut */}
            <TouchableOpacity
              onPress={() => router.push('/(app)/credits-store' as any)}
              style={{
                flexDirection:  'row',
                alignItems:     'center',
                gap:            10,
                marginHorizontal: SPACING.xl,
                marginBottom:   SPACING.md,
                backgroundColor: `${COLORS.primary}10`,
                borderRadius:   RADIUS.lg,
                padding:        SPACING.md,
                borderWidth:    1,
                borderColor:    `${COLORS.primary}25`,
              }}
              activeOpacity={0.8}
            >
              <Ionicons name="add-circle-outline" size={20} color={COLORS.primary} />
              <Text style={{ flex: 1, color: COLORS.primary, fontSize: FONTS.sizes.sm, fontWeight: '600' }}>
                Buy more credits
              </Text>
              <Ionicons name="chevron-forward" size={16} color={COLORS.primary} />
            </TouchableOpacity>

            {/* Grouped transaction list */}
            {transactions.length === 0 ? (
              <EmptyState />
            ) : (
              <View style={{
                backgroundColor: COLORS.backgroundCard,
                borderRadius:    RADIUS.xl,
                overflow:        'hidden',
                marginHorizontal: SPACING.xl,
                borderWidth:     1,
                borderColor:     COLORS.border,
                marginBottom:    SPACING.xl,
              }}>
                {grouped.map((group, gi) => (
                  <View key={group.date + gi}>
                    {/* Date header */}
                    <View style={{
                      paddingHorizontal: SPACING.lg,
                      paddingVertical:   SPACING.sm,
                      backgroundColor:   COLORS.backgroundElevated,
                      borderBottomWidth: 1,
                      borderBottomColor: COLORS.border,
                    }}>
                      <Text style={{
                        color:      COLORS.textMuted,
                        fontSize:   FONTS.sizes.xs,
                        fontWeight: '600',
                        letterSpacing: 0.5,
                      }}>
                        {group.date}
                      </Text>
                    </View>

                    {/* Transactions for this date */}
                    {group.items.map((tx, i) => (
                      <TransactionRow
                        key={tx.id}
                        tx={tx}
                        index={gi * 10 + i}
                      />
                    ))}
                  </View>
                ))}

                {/* Load more / end indicator */}
                {isLoadingMore ? (
                  <View style={{ alignItems: 'center', paddingVertical: SPACING.lg }}>
                    <ActivityIndicator size="small" color={COLORS.primary} />
                  </View>
                ) : !hasMore && transactions.length > 0 ? (
                  <View style={{ alignItems: 'center', paddingVertical: SPACING.lg }}>
                    <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
                      All transactions loaded
                    </Text>
                  </View>
                ) : null}
              </View>
            )}
          </ScrollView>
        )}

      </SafeAreaView>
    </LinearGradient>
  );
}