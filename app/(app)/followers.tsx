// app/(app)/followers.tsx
// DeepDive AI — Part 36B: Followers & Following list screen.
//
// Shared screen for both "Followers" and "Following" tabs.
// URL params:
//   userId   — whose followers/following to show
//   mode     — 'followers' | 'following'
//   username — shown in header subtitle

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

function EmptyList({ mode, username }: { mode: string; username: string }) {
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
      }}>
        <Ionicons
          name={mode === 'followers' ? 'people-outline' : 'person-add-outline'}
          size={34}
          color={COLORS.border}
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
  const { userId, mode, username } = useLocalSearchParams<{
    userId:   string;
    mode:     'followers' | 'following';
    username: string;
  }>();
  const { user } = useAuth();

  const [items,        setItems]        = useState<FollowListItem[]>([]);
  const [isLoading,    setIsLoading]    = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery,  setSearchQuery]  = useState('');

  const isFollowersMode = mode !== 'following';

  // ── Fetch ────────────────────────────────────────────────────────────────

  const fetch = useCallback(async () => {
    if (!userId) return;
    try {
      const result = isFollowersMode
        ? await getUserFollowers(userId, 100, 0)
        : await getUserFollowing(userId, 100, 0);
      setItems(result);
    } catch (err) {
      console.warn('[FollowersScreen] fetch error:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [userId, isFollowersMode]);

  useEffect(() => { fetch(); }, [fetch]);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    fetch();
  }, [fetch]);

  // ── Filter by search ────────────────────────────────────────────────────

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

  // ── Tab title ───────────────────────────────────────────────────────────

  const title   = isFollowersMode ? 'Followers' : 'Following';
  const subtitle = username
    ? `@${username} · ${items.length} ${title.toLowerCase()}`
    : `${items.length} ${title.toLowerCase()}`;

  return (
    <LinearGradient colors={[COLORS.background, COLORS.backgroundCard]} style={{ flex: 1 }}>
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
            <Text style={{
              color:      COLORS.textPrimary,
              fontSize:   FONTS.sizes.lg,
              fontWeight: '800',
            }}>
              {title}
            </Text>
            <Text style={{
              color:    COLORS.textMuted,
              fontSize: FONTS.sizes.xs,
              marginTop: 2,
            }}>
              {subtitle}
            </Text>
          </View>
        </Animated.View>

        {/* ── Search bar ── */}
        {items.length > 5 && (
          <View style={{
            paddingHorizontal: SPACING.lg,
            paddingVertical:   SPACING.sm,
            borderBottomWidth: 1,
            borderBottomColor: COLORS.border,
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
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={handleRefresh}
                tintColor={COLORS.primary}
              />
            }
          >
            {filtered.length === 0 ? (
              <EmptyList mode={isFollowersMode ? 'followers' : 'following'} username={username ?? ''} />
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