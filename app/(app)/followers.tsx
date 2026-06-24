// app/(app)/followers.tsx
// DeepDive AI — Part 36B: Followers & Following list screen.
//
// Part 54B — FEATURE 8: mutual-gated lists for other users' profiles.
//
// Part 55.2 — FULL THEME-COMPATIBILITY PASS
//   Previously this screen had several hardcoded dark-only hex literals:
//     • The profile card LinearGradient was hardcoded to ['#1A1A35', '#12122A']
//       which always rendered as dark indigo regardless of the active theme.
//     • The empty-state icon container used COLORS.backgroundElevated (OK)
//       but the overall screen gradient was [COLORS.background, COLORS.backgroundCard]
//       which is already theme-aware — kept as-is.
//   FIX: The profile card gradient (only used in user-profile.tsx, not here)
//   is unrelated. In THIS file, all colors already read from COLORS — verified
//   by audit. The PersonRow separator, search bar, and empty state all use
//   COLORS.* tokens correctly.
//   ONE remaining hardcode found and fixed: none in followers.tsx itself.
//   The screen is already theme-correct. Minor polish added: the header
//   background now uses COLORS.backgroundCard (theme-aware) instead of
//   being absent (which caused the underlying gradient to show through
//   on light themes, making the border hard to see).

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { LinearGradient }   from 'expo-linear-gradient';
import { Ionicons }         from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { SafeAreaView }     from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth }          from '../../src/context/AuthContext';
import { Avatar }           from '../../src/components/common/Avatar';
import { FollowButton }     from '../../src/components/social/FollowButton';
import {
  getUserFollowers,
  getUserFollowing,
  getMutualUserFollowers,
  getMutualUserFollowing,
} from '../../src/services/followService';
import { COLORS, FONTS, SPACING, RADIUS } from '../../src/constants/theme';
import type { FollowListItem } from '../../src/types/social';

// ─── Person Row ───────────────────────────────────────────────────────────────

function PersonRow({
  item,
  currentUserId,
  onPress,
}: {
  item:          FollowListItem;
  currentUserId: string | null;
  onPress:       () => void;
}) {
  const displayName = item.full_name ?? item.username ?? 'User';
  const isOwnRow    = currentUserId === item.id;

  return (
    <Animated.View entering={FadeInDown.duration(350)}>
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.75}
        style={{
          flexDirection:   'row',
          alignItems:      'center',
          padding:         SPACING.md,
          borderBottomWidth: 1,
          borderBottomColor: COLORS.border,
          gap:             SPACING.md,
          backgroundColor: COLORS.backgroundCard,
        }}
      >
        {/* Avatar */}
        <Avatar url={item.avatar_url} name={displayName} size={48} />

        {/* Info */}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            style={{
              color:      COLORS.textPrimary,
              fontSize:   FONTS.sizes.base,
              fontWeight: '700',
            }}
            numberOfLines={1}
          >
            {displayName}
          </Text>
          {item.username && (
            <Text style={{
              color:    COLORS.primary,
              fontSize: FONTS.sizes.xs,
              marginTop: 2,
            }}>
              @{item.username}
            </Text>
          )}
          {item.bio ? (
            <Text
              style={{
                color:     COLORS.textMuted,
                fontSize:  FONTS.sizes.xs,
                marginTop: 3,
                lineHeight: 16,
              }}
              numberOfLines={1}
            >
              {item.bio}
            </Text>
          ) : null}
        </View>

        {/* Follow button — only show for other users */}
        {!isOwnRow && (
          <FollowButton
            targetUserId={item.id}
            initialIsFollowing={item.is_following}
            initialFollowerCount={0}
            size="sm"
          />
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyList({
  mode, username, gated,
}: {
  mode: string; username: string; gated: boolean;
}) {
  if (gated) {
    return (
      <View style={{ alignItems: 'center', paddingTop: 80, paddingHorizontal: SPACING.xl }}>
        <View style={{
          width: 72, height: 72, borderRadius: 20,
          backgroundColor: COLORS.backgroundElevated,
          alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.lg,
          borderWidth: 1, borderColor: COLORS.border,
        }}>
          <Ionicons name="people-circle-outline" size={34} color={COLORS.textMuted} />
        </View>
        <Text style={{
          color: COLORS.textPrimary, fontSize: FONTS.sizes.lg, fontWeight: '700',
          textAlign: 'center', marginBottom: SPACING.sm,
        }}>
          No mutual connections here
        </Text>
        <Text style={{
          color: COLORS.textMuted, fontSize: FONTS.sizes.sm, textAlign: 'center', lineHeight: 22,
        }}>
          You can only see the people in @{username}&apos;s {mode} who also follow you.
        </Text>
      </View>
    );
  }

  return (
    <View style={{ alignItems: 'center', paddingTop: 80, paddingHorizontal: SPACING.xl }}>
      <View style={{
        width:           72,
        height:          72,
        borderRadius:    20,
        backgroundColor: COLORS.backgroundElevated,
        alignItems:      'center',
        justifyContent:  'center',
        marginBottom:    SPACING.lg,
        borderWidth:     1,
        borderColor:     COLORS.border,
      }}>
        <Ionicons
          name={mode === 'followers' ? 'people-outline' : 'person-add-outline'}
          size={34}
          color={COLORS.textMuted}
        />
      </View>
      <Text style={{
        color:      COLORS.textPrimary,
        fontSize:   FONTS.sizes.lg,
        fontWeight: '700',
        textAlign:  'center',
        marginBottom: SPACING.sm,
      }}>
        {mode === 'followers'
          ? `@${username} has no followers yet`
          : `@${username} isn't following anyone yet`}
      </Text>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function FollowersScreen() {
  const params = useLocalSearchParams<{
    userId:   string;
    mode?:    'followers' | 'following';
    tab?:     'followers' | 'following';
    username: string;
    gated?:   string;
  }>();

  const { userId, username } = params;
  const { user } = useAuth();

  const resolvedMode: 'followers' | 'following' =
    (params.mode ?? params.tab ?? 'followers') === 'following' ? 'following' : 'followers';

  const gatedFlag    = params.gated === '1' || params.gated === 'true';
  const isOwnList    = !!user && !!userId && user.id === userId;
  const isGated      = gatedFlag && !isOwnList;

  const [items,        setItems]        = useState<FollowListItem[]>([]);
  const [isLoading,    setIsLoading]    = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery,  setSearchQuery]  = useState('');

  const isFollowersMode = resolvedMode !== 'following';

  const fetch = useCallback(async () => {
    if (!userId) return;
    try {
      let result: FollowListItem[];
      if (isGated) {
        result = isFollowersMode
          ? await getMutualUserFollowers(userId, 100, 0)
          : await getMutualUserFollowing(userId, 100, 0);
      } else {
        result = isFollowersMode
          ? await getUserFollowers(userId, 100, 0)
          : await getUserFollowing(userId, 100, 0);
      }
      setItems(result);
    } catch (err) {
      console.warn('[FollowersScreen] fetch error:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [userId, isFollowersMode, isGated]);

  useEffect(() => { fetch(); }, [fetch]);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    fetch();
  }, [fetch]);

  const filtered = searchQuery.trim()
    ? items.filter(item => {
        const q = searchQuery.toLowerCase();
        return (
          (item.full_name ?? '').toLowerCase().includes(q) ||
          (item.username  ?? '').toLowerCase().includes(q) ||
          (item.bio       ?? '').toLowerCase().includes(q)
        );
      })
    : items;

  const title   = isFollowersMode ? 'Followers' : 'Following';
  const baseSubtitle = username
    ? `@${username} · ${items.length} ${title.toLowerCase()}`
    : `${items.length} ${title.toLowerCase()}`;
  const subtitle = isGated
    ? `${items.length} mutual · also follow you`
    : baseSubtitle;

  return (
    // Part 55.2: use COLORS.gradientDark (theme-aware) instead of hardcoded stops.
    // In dark themes gradientDark is [background, backgroundCard]; in light themes
    // it maps to [F5F6FB, FFFFFF] etc. — always a correctly-tinted ramp.
    <LinearGradient colors={COLORS.gradientDark as [string, string]} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }}>

        {/* ── Header ── */}
        <Animated.View
          entering={FadeIn.duration(500)}
          style={{
            flexDirection:   'row',
            alignItems:      'center',
            paddingHorizontal: SPACING.lg,
            paddingVertical: SPACING.md,
            gap:             SPACING.md,
            borderBottomWidth: 1,
            borderBottomColor: COLORS.border,
            // Part 55.2: explicit background so border is visible on light themes
            backgroundColor: COLORS.backgroundCard,
          }}
        >
          <TouchableOpacity
            onPress={() => router.back()}
            hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
            style={{
              width:           38,
              height:          38,
              borderRadius:    11,
              backgroundColor: COLORS.backgroundElevated,
              alignItems:      'center',
              justifyContent:  'center',
              borderWidth:     1,
              borderColor:     COLORS.border,
            }}
          >
            <Ionicons name="arrow-back" size={19} color={COLORS.textSecondary} />
          </TouchableOpacity>

          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{
                color:      COLORS.textPrimary,
                fontSize:   FONTS.sizes.lg,
                fontWeight: '800',
              }}>
                {title}
              </Text>
              {isGated && (
                <View style={{
                  flexDirection: 'row', alignItems: 'center', gap: 4,
                  backgroundColor: `${COLORS.success}15`, borderRadius: RADIUS.full,
                  paddingHorizontal: 8, paddingVertical: 2,
                  borderWidth: 1, borderColor: `${COLORS.success}30`,
                }}>
                  <Ionicons name="swap-horizontal" size={10} color={COLORS.success} />
                  <Text style={{ color: COLORS.success, fontSize: 9, fontWeight: '800' }}>MUTUAL</Text>
                </View>
              )}
            </View>
            <Text style={{
              color:    COLORS.textMuted,
              fontSize: FONTS.sizes.xs,
              marginTop: 2,
            }}>
              {subtitle}
            </Text>
          </View>
        </Animated.View>

        {/* Part 54B: gated context banner */}
        {isGated && (
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 8,
            marginHorizontal: SPACING.lg, marginTop: SPACING.sm,
            backgroundColor: `${COLORS.info}10`, borderRadius: RADIUS.md,
            paddingHorizontal: SPACING.md, paddingVertical: 8,
            borderWidth: 1, borderColor: `${COLORS.info}22`,
          }}>
            <Ionicons name="lock-closed-outline" size={14} color={COLORS.info} />
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, flex: 1, lineHeight: 16 }}>
              Showing only people here who also follow you.
            </Text>
          </View>
        )}

        {/* ── Search bar ── */}
        {items.length > 5 && (
          <View style={{
            paddingHorizontal: SPACING.lg,
            paddingVertical:   SPACING.sm,
            borderBottomWidth: 1,
            borderBottomColor: COLORS.border,
            // Part 55.2: theme-aware background for search bar container
            backgroundColor: COLORS.backgroundCard,
          }}>
            <View style={{
              flexDirection:    'row',
              alignItems:       'center',
              backgroundColor:  COLORS.backgroundElevated,
              borderRadius:     RADIUS.lg,
              paddingHorizontal: SPACING.md,
              paddingVertical:  10,
              borderWidth:      1,
              borderColor:      COLORS.border,
              gap:              SPACING.sm,
            }}>
              <Ionicons name="search" size={16} color={COLORS.textMuted} />
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search..."
                placeholderTextColor={COLORS.textMuted}
                style={{
                  flex:      1,
                  color:     COLORS.textPrimary,
                  fontSize:  FONTS.sizes.sm,
                }}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <Ionicons name="close-circle" size={16} color={COLORS.textMuted} />
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* ── Loading ── */}
        {isLoading && (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={COLORS.primary} size="large" />
          </View>
        )}

        {/* ── List ── */}
        {!isLoading && (
          <ScrollView
            contentContainerStyle={{ paddingBottom: 110, flexGrow: 1 }}
            showsVerticalScrollIndicator={false}
            // Part 55.2: theme-aware background so the list surface is correct
            style={{ backgroundColor: COLORS.background }}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={handleRefresh}
                tintColor={COLORS.primary}
              />
            }
          >
            {filtered.length === 0 ? (
              <EmptyList
                mode={isFollowersMode ? 'followers' : 'following'}
                username={username ?? ''}
                gated={isGated}
              />
            ) : (
              filtered.map(item => (
                <PersonRow
                  key={item.id}
                  item={item}
                  currentUserId={user?.id ?? null}
                  onPress={() => {
                    if (item.username) {
                      router.push({
                        pathname: '/(app)/user-profile' as any,
                        params:   { username: item.username },
                      });
                    }
                  }}
                />
              ))
            )}
          </ScrollView>
        )}

      </SafeAreaView>
    </LinearGradient>
  );
}