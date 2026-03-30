// app/(app)/(tabs)/feed.tsx
// Part 36 — Following feed.
// FIX: Report cards now navigate to feed-report-view (view-only screen)
//      instead of research-report (owner screen with edit controls).
//      Author name, username and avatarUrl are passed as params so the
//      view-only screen can show an author chip immediately without
//      waiting for a DB call.

import React, { useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { LinearGradient }   from 'expo-linear-gradient';
import { Ionicons }         from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { SafeAreaView }     from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { useAuth }          from '../../../src/context/AuthContext';
import { Avatar }           from '../../../src/components/common/Avatar';
import { useFollowingFeed } from '../../../src/hooks/useFollowingFeed';
import { COLORS, FONTS, SPACING, RADIUS } from '../../../src/constants/theme';
import type { FeedItem }    from '../../../src/types/social';

// ─── Constants ────────────────────────────────────────────────────────────────

const DEPTH_LABEL: Record<string, string> = {
  quick: 'Quick', deep: 'Deep Dive', expert: 'Expert',
};
const DEPTH_COLOR: Record<string, string> = {
  quick: COLORS.success, deep: COLORS.primary, expert: COLORS.warning,
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7)  return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── Navigate to view-only report ────────────────────────────────────────────

function openFeedReport(item: FeedItem) {
  if (!item.report_id) return;
  router.push({
    pathname: '/(app)/feed-report-view' as any,
    params:   {
      reportId:        item.report_id,
      authorName:      item.author_full_name ?? item.author_username ?? 'Researcher',
      authorUsername:  item.author_username  ?? '',
      authorAvatarUrl: item.author_avatar_url ?? '',
    },
  });
}

// ─── Feed Card ────────────────────────────────────────────────────────────────

function FeedCard({ item, index }: { item: FeedItem; index: number }) {
  const depthColor = DEPTH_COLOR[item.depth] ?? COLORS.primary;
  const authorName = item.author_full_name ?? item.author_username ?? 'Researcher';

  return (
    <Animated.View entering={FadeInDown.duration(400).delay(index * 60)}>
      <TouchableOpacity
        onPress={() => openFeedReport(item)}
        activeOpacity={0.75}
        style={{
          backgroundColor: COLORS.backgroundCard,
          borderRadius:    RADIUS.xl,
          marginBottom:    SPACING.sm,
          borderWidth:     1,
          borderColor:     COLORS.border,
          overflow:        'hidden',
        }}
      >
        {/* Depth accent bar */}
        <View style={{ height: 3, backgroundColor: depthColor, opacity: 0.6 }} />

        <View style={{ padding: SPACING.md }}>
          {/* Author row */}
          <Pressable
            onPress={() => {
              if (item.author_username) {
                router.push({
                  pathname: '/(app)/user-profile' as any,
                  params:   { username: item.author_username },
                });
              }
            }}
            style={{
              flexDirection:  'row',
              alignItems:     'center',
              gap:            SPACING.sm,
              marginBottom:   SPACING.sm,
            }}
          >
            <Avatar url={item.author_avatar_url} name={authorName} size={34} />
            <View style={{ flex: 1 }}>
              <Text style={{
                color:      COLORS.textPrimary,
                fontSize:   FONTS.sizes.sm,
                fontWeight: '700',
              }}>
                {authorName}
              </Text>
              {item.author_username && (
                <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.xs, marginTop: 1 }}>
                  @{item.author_username}
                </Text>
              )}
            </View>
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
              {timeAgo(item.published_at)}
            </Text>
          </Pressable>

          {/* Title */}
          <Text
            style={{
              color:        COLORS.textPrimary,
              fontSize:     FONTS.sizes.base,
              fontWeight:   '800',
              lineHeight:   22,
              marginBottom: SPACING.sm,
            }}
            numberOfLines={2}
          >
            {item.title}
          </Text>

          {/* Summary */}
          {!!item.executive_summary && (
            <Text
              style={{
                color:        COLORS.textSecondary,
                fontSize:     FONTS.sizes.xs,
                lineHeight:   18,
                marginBottom: SPACING.sm,
              }}
              numberOfLines={3}
            >
              {item.executive_summary}
            </Text>
          )}

          {/* Tags */}
          {item.tags.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 6, marginBottom: SPACING.sm }}
            >
              {item.tags.slice(0, 4).map(tag => (
                <View
                  key={tag}
                  style={{
                    backgroundColor:  `${COLORS.primary}12`,
                    borderRadius:     RADIUS.full,
                    paddingHorizontal: 9,
                    paddingVertical:  3,
                    borderWidth:      1,
                    borderColor:      `${COLORS.primary}25`,
                  }}
                >
                  <Text style={{ color: '#A78BFA', fontSize: 10, fontWeight: '600' }}>{tag}</Text>
                </View>
              ))}
            </ScrollView>
          )}

          {/* Bottom row */}
          <View style={{
            flexDirection:  'row',
            alignItems:     'center',
            justifyContent: 'space-between',
            marginTop:      4,
          }}>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <View style={{
                backgroundColor:  `${depthColor}15`,
                borderRadius:     RADIUS.full,
                paddingHorizontal: 9,
                paddingVertical:  3,
              }}>
                <Text style={{ color: depthColor, fontSize: FONTS.sizes.xs, fontWeight: '600' }}>
                  {DEPTH_LABEL[item.depth]}
                </Text>
              </View>
              {item.sources_count > 0 && (
                <View style={{
                  flexDirection:    'row',
                  alignItems:       'center',
                  gap:              4,
                  backgroundColor:  `${COLORS.info}10`,
                  borderRadius:     RADIUS.full,
                  paddingHorizontal: 9,
                  paddingVertical:  3,
                }}>
                  <Ionicons name="globe-outline" size={10} color={COLORS.info} />
                  <Text style={{ color: COLORS.info, fontSize: FONTS.sizes.xs }}>
                    {item.sources_count}
                  </Text>
                </View>
              )}
            </View>

            <TouchableOpacity
              onPress={() => openFeedReport(item)}
              activeOpacity={0.8}
              style={{
                flexDirection:    'row',
                alignItems:       'center',
                gap:              5,
                backgroundColor:  `${COLORS.primary}15`,
                borderRadius:     RADIUS.full,
                paddingHorizontal: 13,
                paddingVertical:  6,
                borderWidth:      1,
                borderColor:      `${COLORS.primary}30`,
              }}
            >
              <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.xs, fontWeight: '700' }}>
                Read
              </Text>
              <Ionicons name="arrow-forward" size={11} color={COLORS.primary} />
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Empty: Not Following Anyone ──────────────────────────────────────────────

function EmptyNotFollowing() {
  return (
    <View style={{ alignItems: 'center', paddingTop: 60, paddingHorizontal: SPACING.xl }}>
      <LinearGradient
        colors={['#1A1A40', '#0A0A1A']}
        style={{
          width:           88,
          height:          88,
          borderRadius:    26,
          alignItems:      'center',
          justifyContent:  'center',
          marginBottom:    SPACING.lg,
          borderWidth:     1,
          borderColor:     `${COLORS.primary}30`,
        }}
      >
        <Ionicons name="people-outline" size={42} color={COLORS.primary} />
      </LinearGradient>

      <Text style={{
        color:      COLORS.textPrimary,
        fontSize:   FONTS.sizes.lg,
        fontWeight: '800',
        textAlign:  'center',
        marginBottom: SPACING.sm,
      }}>
        Your feed is empty
      </Text>

      <Text style={{
        color:      COLORS.textMuted,
        fontSize:   FONTS.sizes.sm,
        textAlign:  'center',
        lineHeight: 22,
        marginBottom: SPACING.xl,
      }}>
        Follow researchers to see their published reports here as soon as they go live.
      </Text>

      {/* Explore Researchers CTA */}
      <TouchableOpacity
        onPress={() => router.push('/(app)/explore-researchers' as any)}
        activeOpacity={0.85}
        style={{ width: '100%', marginBottom: SPACING.sm }}
      >
        <LinearGradient
          colors={COLORS.gradientPrimary}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{
            borderRadius:  RADIUS.full,
            paddingVertical: 14,
            alignItems:    'center',
            flexDirection: 'row',
            justifyContent: 'center',
            gap:           8,
          }}
        >
          <Ionicons name="telescope-outline" size={18} color="#FFF" />
          <Text style={{ color: '#FFF', fontSize: FONTS.sizes.base, fontWeight: '700' }}>
            Explore Researchers
          </Text>
        </LinearGradient>
      </TouchableOpacity>

      <Text style={{
        color:      COLORS.textMuted,
        fontSize:   FONTS.sizes.xs,
        textAlign:  'center',
        lineHeight: 18,
        marginTop:  SPACING.sm,
        paddingHorizontal: SPACING.md,
      }}>
        Tip: visit any public report on the web, then tap the author's name to follow them.
      </Text>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function FeedScreen() {
  const { user, profile } = useAuth();
  const {
    items, isLoading, isRefreshing, hasMore,
    refresh, loadMore, markFeedSeen,
  } = useFollowingFeed(user?.id ?? null);

  useFocusEffect(
    useCallback(() => {
      markFeedSeen();
      if (items.length === 0 && !isLoading) refresh();
    }, []), // eslint-disable-line react-hooks/exhaustive-deps
  );

  return (
    <LinearGradient colors={[COLORS.background, COLORS.backgroundCard]} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }}>

        {/* Header */}
        <Animated.View
          entering={FadeIn.duration(500)}
          style={{
            flexDirection:     'row',
            alignItems:        'center',
            paddingHorizontal: SPACING.xl,
            paddingTop:        SPACING.md,
            paddingBottom:     SPACING.md,
            borderBottomWidth: 1,
            borderBottomColor: COLORS.border,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.xl, fontWeight: '800' }}>
              Following
            </Text>
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.sm, marginTop: 2 }}>
              {items.length > 0
                ? `${items.length} report${items.length !== 1 ? 's' : ''} from people you follow`
                : 'Research from people you follow'}
            </Text>
          </View>

          {/* Explore pill */}
          <TouchableOpacity
            onPress={() => router.push('/(app)/explore-researchers' as any)}
            activeOpacity={0.8}
            style={{
              flexDirection:    'row',
              alignItems:       'center',
              gap:              5,
              backgroundColor:  `${COLORS.primary}15`,
              borderRadius:     RADIUS.full,
              paddingHorizontal: 12,
              paddingVertical:  7,
              borderWidth:      1,
              borderColor:      `${COLORS.primary}30`,
              marginRight:      SPACING.sm,
            }}
          >
            <Ionicons name="telescope-outline" size={14} color={COLORS.primary} />
            <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.xs, fontWeight: '700' }}>
              Explore
            </Text>
          </TouchableOpacity>

          <Avatar url={profile?.avatar_url} name={profile?.full_name} size={40} />
        </Animated.View>

        {/* Loading skeleton */}
        {isLoading && items.length === 0 && (
          <ScrollView
            contentContainerStyle={{ padding: SPACING.xl, paddingBottom: 110 }}
            showsVerticalScrollIndicator={false}
          >
            {Array.from({ length: 4 }).map((_, i) => (
              <View
                key={i}
                style={{
                  backgroundColor: COLORS.backgroundCard,
                  borderRadius:    RADIUS.xl,
                  height:          180,
                  marginBottom:    SPACING.sm,
                  borderWidth:     1,
                  borderColor:     COLORS.border,
                  opacity:         1 - i * 0.22,
                }}
              />
            ))}
          </ScrollView>
        )}

        {/* Feed list */}
        {(!isLoading || items.length > 0) && (
          <ScrollView
            contentContainerStyle={{
              padding:       SPACING.xl,
              paddingTop:    SPACING.md,
              paddingBottom: 110,
            }}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={refresh}
                tintColor={COLORS.primary}
              />
            }
            onScroll={({ nativeEvent }) => {
              const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
              if (layoutMeasurement.height + contentOffset.y >= contentSize.height - 300) {
                loadMore();
              }
            }}
            scrollEventThrottle={400}
          >
            {items.length === 0 && !isLoading && <EmptyNotFollowing />}

            {items.map((item, i) => (
              <FeedCard key={item.share_id} item={item} index={i} />
            ))}

            {items.length > 0 && (
              hasMore ? (
                <View style={{ paddingVertical: SPACING.lg, alignItems: 'center' }}>
                  <ActivityIndicator color={COLORS.primary} />
                </View>
              ) : (
                <Animated.View
                  entering={FadeIn.duration(400)}
                  style={{ alignItems: 'center', paddingVertical: SPACING.xl }}
                >
                  <View style={{
                    flexDirection:    'row',
                    alignItems:       'center',
                    gap:              8,
                    backgroundColor:  COLORS.backgroundElevated,
                    borderRadius:     RADIUS.full,
                    paddingHorizontal: 16,
                    paddingVertical:  8,
                    borderWidth:      1,
                    borderColor:      COLORS.border,
                  }}>
                    <Ionicons name="checkmark-circle-outline" size={14} color={COLORS.textMuted} />
                    <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
                      All caught up
                    </Text>
                  </View>
                </Animated.View>
              )
            )}
          </ScrollView>
        )}

      </SafeAreaView>
    </LinearGradient>
  );
}