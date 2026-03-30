// app/(app)/explore-researchers.tsx
// DeepDive AI — Part 36: Explore Researchers screen.
//
// FIX (Issue 4): When the user follows someone in the main researcher list,
// the same person's card in the "Suggested for You" section now reflects the
// updated follow state immediately — without a refetch.
//
// Implementation:
//   • A shared `followState` map (Record<userId, { isFollowing, followerCount }>)
//     is held in component state.
//   • Both the main list cards AND the suggested cards read from this map.
//   • `handleFollowToggle` writes back into the map, triggering a single
//     React re-render that updates BOTH sections simultaneously.
//   • Optimistic update + rollback on error (same behaviour as before).

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Pressable,
} from 'react-native';
import { LinearGradient }   from 'expo-linear-gradient';
import { Ionicons }         from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { SafeAreaView }     from 'react-native-safe-area-context';
import { router }           from 'expo-router';
import * as Haptics         from 'expo-haptics';
import { useAuth }          from '../../src/context/AuthContext';
import { Avatar }           from '../../src/components/common/Avatar';
import { followUser, unfollowUser } from '../../src/services/followService';
import {
  getExploreResearchers,
  getSuggestedResearchers,
  type ExploreResearcher,
  type ExploreSortKey,
} from '../../src/services/exploreService';
import { COLORS, FONTS, SPACING, RADIUS } from '../../src/constants/theme';

// ─── Sort options ──────────────────────────────────────────────────────────────

const SORT_OPTIONS: { key: ExploreSortKey; label: string; icon: string }[] = [
  { key: 'followers', label: 'Followers', icon: 'people-outline'  },
  { key: 'active',    label: 'Active',    icon: 'pulse-outline'    },
  { key: 'newest',    label: 'Newest',    icon: 'time-outline'     },
];

// ─── Shared follow state ───────────────────────────────────────────────────────

interface FollowState {
  isFollowing:   boolean;
  followerCount: number;
  isLoading:     boolean;
}

// ─── Follow button (inline, no external hook — reads from shared map) ─────────

interface FollowBtnProps {
  researcher:        ExploreResearcher;
  followState:       FollowState;
  onToggle:          (researcher: ExploreResearcher) => Promise<void>;
}

function FollowBtn({ researcher, followState, onToggle }: FollowBtnProps) {
  const { isFollowing, isLoading } = followState;

  return (
    <TouchableOpacity
      onPress={() => onToggle(researcher)}
      disabled={isLoading}
      activeOpacity={0.8}
      style={{
        paddingHorizontal: 14,
        paddingVertical:   8,
        borderRadius:      RADIUS.full,
        backgroundColor:   isFollowing ? 'transparent' : COLORS.primary,
        borderWidth:       1,
        borderColor:       isFollowing ? COLORS.border : COLORS.primary,
        opacity:           isLoading ? 0.6 : 1,
        minWidth:          76,
        alignItems:        'center',
        justifyContent:    'center',
      }}
    >
      {isLoading ? (
        <ActivityIndicator size="small" color={isFollowing ? COLORS.textMuted : '#FFF'} />
      ) : (
        <Text style={{
          color:      isFollowing ? COLORS.textMuted : '#FFF',
          fontSize:   FONTS.sizes.xs,
          fontWeight: '700',
        }}>
          {isFollowing ? 'Following' : 'Follow'}
        </Text>
      )}
    </TouchableOpacity>
  );
}

// ─── Researcher card ──────────────────────────────────────────────────────────

interface ResearcherCardProps {
  researcher:    ExploreResearcher;
  currentUserId: string | null;
  followState:   FollowState;
  onToggle:      (researcher: ExploreResearcher) => Promise<void>;
  index:         number;
}

function ResearcherCard({
  researcher, currentUserId, followState, onToggle, index,
}: ResearcherCardProps) {
  const displayName = researcher.full_name ?? researcher.username ?? 'Researcher';
  const isOwnCard   = currentUserId === researcher.id;

  const handlePress = () => {
    if (!researcher.username) return;
    router.push({
      pathname: '/(app)/user-profile' as any,
      params:   { username: researcher.username },
    });
  };

  return (
    <Animated.View entering={FadeInDown.duration(350).delay(index * 40)}>
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={0.78}
        style={{
          flexDirection:   'row',
          alignItems:      'center',
          backgroundColor: COLORS.backgroundCard,
          borderRadius:    RADIUS.xl,
          padding:         SPACING.md,
          marginBottom:    SPACING.sm,
          borderWidth:     1,
          borderColor:     COLORS.border,
          gap:             SPACING.md,
        }}
      >
        <Avatar url={researcher.avatar_url} name={displayName} size={52} />

        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            style={{
              color:      COLORS.textPrimary,
              fontSize:   FONTS.sizes.base,
              fontWeight: '700',
              lineHeight: 19,
            }}
            numberOfLines={1}
          >
            {displayName}
          </Text>
          {researcher.username && (
            <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.xs, marginTop: 1 }}>
              @{researcher.username}
            </Text>
          )}

          {/* Interest chips */}
          {researcher.interests.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
              {researcher.interests.slice(0, 3).map(tag => (
                <View
                  key={tag}
                  style={{
                    backgroundColor:  `${COLORS.primary}10`,
                    borderRadius:     RADIUS.full,
                    paddingHorizontal: 7,
                    paddingVertical:  2,
                    borderWidth:      1,
                    borderColor:      `${COLORS.primary}20`,
                  }}
                >
                  <Text style={{ color: '#A78BFA', fontSize: 10, fontWeight: '600' }}>
                    {tag}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Stats row */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <Ionicons name="people-outline" size={11} color={COLORS.textMuted} />
              <Text style={{ color: COLORS.textMuted, fontSize: 11, fontWeight: '600' }}>
                {followState.followerCount >= 1000
                  ? `${(followState.followerCount / 1000).toFixed(1)}k`
                  : followState.followerCount}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <Ionicons name="document-text-outline" size={11} color={COLORS.textMuted} />
              <Text style={{ color: COLORS.textMuted, fontSize: 11, fontWeight: '600' }}>
                {researcher.report_count}
              </Text>
            </View>
            {(researcher.overlap_count ?? 0) > 0 && (
              <View style={{
                flexDirection:    'row',
                alignItems:       'center',
                gap:              3,
                backgroundColor:  `${COLORS.success}10`,
                borderRadius:     RADIUS.full,
                paddingHorizontal: 6,
                paddingVertical:  1,
              }}>
                <Ionicons name="sparkles" size={9} color={COLORS.success} />
                <Text style={{ color: COLORS.success, fontSize: 9, fontWeight: '700' }}>
                  {researcher.overlap_count} shared
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Follow button */}
        {!isOwnCard && (
          <FollowBtn
            researcher={researcher}
            followState={followState}
            onToggle={onToggle}
          />
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Suggested section ────────────────────────────────────────────────────────

interface SuggestedSectionProps {
  suggestions:    ExploreResearcher[];
  currentUserId:  string | null;
  followStateMap: Record<string, FollowState>;
  onToggle:       (researcher: ExploreResearcher) => Promise<void>;
}

function SuggestedSection({
  suggestions, currentUserId, followStateMap, onToggle,
}: SuggestedSectionProps) {
  if (suggestions.length === 0) return null;

  return (
    <Animated.View entering={FadeInDown.duration(400)} style={{ marginBottom: SPACING.lg }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: SPACING.sm }}>
        <LinearGradient
          colors={[COLORS.success, `${COLORS.success}BB`]}
          style={{
            width:          28,
            height:         28,
            borderRadius:   8,
            alignItems:     'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="sparkles" size={13} color="#FFF" />
        </LinearGradient>
        <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '700' }}>
          Suggested for You
        </Text>
        <View style={{
          backgroundColor:  `${COLORS.success}15`,
          borderRadius:     RADIUS.full,
          paddingHorizontal: 8,
          paddingVertical:  2,
          borderWidth:      1,
          borderColor:      `${COLORS.success}25`,
        }}>
          <Text style={{ color: COLORS.success, fontSize: 9, fontWeight: '700' }}>
            BASED ON YOUR INTERESTS
          </Text>
        </View>
      </View>

      {/* Cards — each reads from the shared followStateMap */}
      {suggestions.map((r, i) => (
        <ResearcherCard
          key={r.id}
          researcher={r}
          currentUserId={currentUserId}
          followState={
            followStateMap[r.id] ?? {
              isFollowing:   r.is_following,
              followerCount: r.follower_count,
              isLoading:     false,
            }
          }
          onToggle={onToggle}
          index={i}
        />
      ))}

      {/* Divider */}
      <View style={{
        height:         1,
        backgroundColor: COLORS.border,
        marginVertical: SPACING.md,
        opacity:        0.5,
      }} />

      <Text style={{
        color:         COLORS.textMuted,
        fontSize:      FONTS.sizes.xs,
        fontWeight:    '600',
        letterSpacing: 0.8,
        textTransform: 'uppercase',
        marginBottom:  SPACING.sm,
      }}>
        All Researchers
      </Text>
    </Animated.View>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ isSearching }: { isSearching: boolean }) {
  return (
    <View style={{ alignItems: 'center', paddingTop: 60, paddingHorizontal: SPACING.xl }}>
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
          name={isSearching ? 'search-outline' : 'people-outline'}
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
        {isSearching ? 'No researchers found' : 'No public researchers yet'}
      </Text>
      <Text style={{
        color:     COLORS.textMuted,
        fontSize:  FONTS.sizes.sm,
        textAlign: 'center',
        lineHeight: 22,
      }}>
        {isSearching
          ? 'Try a different name or interest tag.'
          : 'Researchers who make their profile public will appear here.'}
      </Text>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function ExploreResearchersScreen() {
  const { user, profile } = useAuth();

  const [researchers,    setResearchers]    = useState<ExploreResearcher[]>([]);
  const [suggestions,    setSuggestions]    = useState<ExploreResearcher[]>([]);
  const [isLoading,      setIsLoading]      = useState(true);
  const [isRefreshing,   setIsRefreshing]   = useState(false);
  const [isLoadingMore,  setIsLoadingMore]  = useState(false);
  const [hasMore,        setHasMore]        = useState(true);
  const [sort,           setSort]           = useState<ExploreSortKey>('followers');
  const [search,         setSearch]         = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // ── Shared follow state map ────────────────────────────────────────────────
  // Keyed by researcher.id.  Both the main list AND the suggested section read
  // from here, so toggling in one section immediately updates the other.
  const [followStateMap, setFollowStateMap] = useState<Record<string, FollowState>>({});

  const fetchingRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isSearching      = debouncedSearch.trim().length > 0;
  const userHasInterests = (profile?.interests?.length ?? 0) > 0;

  // ── Initialise follow state from a list of researchers ────────────────────

  const seedFollowState = useCallback(
    (list: ExploreResearcher[]) => {
      setFollowStateMap(prev => {
        const next = { ...prev };
        list.forEach(r => {
          // Only write if not already tracked (preserves in-flight optimistic)
          if (!next[r.id]) {
            next[r.id] = {
              isFollowing:   r.is_following,
              followerCount: r.follower_count,
              isLoading:     false,
            };
          }
        });
        return next;
      });
    },
    [],
  );

  // ── Optimistic follow toggle ───────────────────────────────────────────────

  const handleFollowToggle = useCallback(
    async (researcher: ExploreResearcher) => {
      const current: FollowState = followStateMap[researcher.id] ?? {
        isFollowing:   researcher.is_following,
        followerCount: researcher.follower_count,
        isLoading:     false,
      };

      if (current.isLoading) return;

      const wasFollowing = current.isFollowing;
      const prevCount    = current.followerCount;

      // Optimistic
      setFollowStateMap(prev => ({
        ...prev,
        [researcher.id]: {
          isFollowing:   !wasFollowing,
          followerCount: wasFollowing ? Math.max(0, prevCount - 1) : prevCount + 1,
          isLoading:     true,
        },
      }));

      try {
        const result = wasFollowing
          ? await unfollowUser(researcher.id)
          : await followUser(researcher.id);

        if (!wasFollowing && result.success) {
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
        }

        if (!result.success) throw new Error(result.error ?? 'Action failed');

        // Confirm (keep optimistic, clear loading)
        setFollowStateMap(prev => ({
          ...prev,
          [researcher.id]: {
            ...prev[researcher.id],
            isLoading: false,
          },
        }));
      } catch (err) {
        console.warn('[ExploreResearchers] follow toggle error:', err);
        // Rollback
        setFollowStateMap(prev => ({
          ...prev,
          [researcher.id]: {
            isFollowing:   wasFollowing,
            followerCount: prevCount,
            isLoading:     false,
          },
        }));
      }
    },
    [followStateMap],
  );

  // ── Debounce search ────────────────────────────────────────────────────────

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(search);
    }, 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search]);

  // ── Load suggestions (once) ────────────────────────────────────────────────

  useEffect(() => {
    if (!user || !userHasInterests) return;
    getSuggestedResearchers(5)
      .then(data => {
        setSuggestions(data);
        seedFollowState(data);
      })
      .catch(() => {});
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fetch main list ────────────────────────────────────────────────────────

  const fetchResearchers = useCallback(
    async (replace: boolean) => {
      if (fetchingRef.current) return;
      fetchingRef.current = true;
      if (replace) setIsLoading(true);

      try {
        const offset = replace ? 0 : researchers.length;
        const data   = await getExploreResearchers(sort, debouncedSearch, 20, offset);

        if (replace) {
          setResearchers(data);
          seedFollowState(data);
        } else {
          setResearchers(prev => {
            const ids   = new Set(prev.map(r => r.id));
            const fresh = data.filter(r => !ids.has(r.id));
            seedFollowState(fresh);
            return [...prev, ...fresh];
          });
        }
        setHasMore(data.length >= 20);
      } catch (err) {
        console.warn('[ExploreResearchers] fetch error:', err);
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
        setIsLoadingMore(false);
        fetchingRef.current = false;
      }
    },
    [sort, debouncedSearch, researchers.length, seedFollowState],
  );

  useEffect(() => {
    setHasMore(true);
    fetchResearchers(true);
  }, [sort, debouncedSearch]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    fetchResearchers(true);
  }, [fetchResearchers]);

  const handleLoadMore = useCallback(() => {
    if (!hasMore || isLoadingMore || fetchingRef.current) return;
    setIsLoadingMore(true);
    fetchResearchers(false);
  }, [hasMore, isLoadingMore, fetchResearchers]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <LinearGradient colors={[COLORS.background, COLORS.backgroundCard]} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }}>

        {/* Header */}
        <Animated.View
          entering={FadeIn.duration(400)}
          style={{
            flexDirection:     'row',
            alignItems:        'center',
            paddingHorizontal: SPACING.lg,
            paddingVertical:   SPACING.md,
            gap:               SPACING.md,
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
            <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.lg, fontWeight: '800' }}>
              Explore Researchers
            </Text>
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 1 }}>
              Discover and follow other researchers
            </Text>
          </View>
        </Animated.View>

        {/* Search bar */}
        <Animated.View
          entering={FadeInDown.duration(400).delay(60)}
          style={{
            paddingHorizontal: SPACING.lg,
            paddingTop:        SPACING.md,
            paddingBottom:     SPACING.sm,
          }}
        >
          <View style={{
            flexDirection:    'row',
            alignItems:       'center',
            backgroundColor:  COLORS.backgroundElevated,
            borderRadius:     RADIUS.lg,
            paddingHorizontal: SPACING.md,
            paddingVertical:  10,
            borderWidth:      1,
            borderColor:      search.length > 0 ? `${COLORS.primary}50` : COLORS.border,
            gap:              SPACING.sm,
          }}>
            <Ionicons
              name="search"
              size={17}
              color={search.length > 0 ? COLORS.primary : COLORS.textMuted}
            />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search by name, username or interest…"
              placeholderTextColor={COLORS.textMuted}
              style={{ flex: 1, color: COLORS.textPrimary, fontSize: FONTS.sizes.sm }}
              returnKeyType="search"
              clearButtonMode="while-editing"
            />
            {search.length > 0 && (
              <TouchableOpacity
                onPress={() => setSearch('')}
                hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
              >
                <Ionicons name="close-circle" size={17} color={COLORS.textMuted} />
              </TouchableOpacity>
            )}
          </View>
        </Animated.View>

        {/* Sort tabs */}
        <Animated.View
          entering={FadeInDown.duration(400).delay(100)}
          style={{ paddingHorizontal: SPACING.lg, paddingBottom: SPACING.sm }}
        >
          <View style={{
            flexDirection:   'row',
            backgroundColor: COLORS.backgroundElevated,
            borderRadius:    RADIUS.lg,
            padding:         3,
            borderWidth:     1,
            borderColor:     COLORS.border,
          }}>
            {SORT_OPTIONS.map(opt => {
              const active = sort === opt.key;
              return (
                <TouchableOpacity
                  key={opt.key}
                  onPress={() => setSort(opt.key)}
                  activeOpacity={0.75}
                  style={{
                    flex:            1,
                    flexDirection:   'row',
                    alignItems:      'center',
                    justifyContent:  'center',
                    gap:             5,
                    paddingVertical: 8,
                    borderRadius:    RADIUS.md,
                    backgroundColor: active ? COLORS.primary : 'transparent',
                  }}
                >
                  <Ionicons
                    name={opt.icon as any}
                    size={12}
                    color={active ? '#FFF' : COLORS.textMuted}
                  />
                  <Text style={{
                    color:      active ? '#FFF' : COLORS.textMuted,
                    fontSize:   FONTS.sizes.xs,
                    fontWeight: active ? '700' : '500',
                  }}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Animated.View>

        {/* Loading skeletons */}
        {isLoading && (
          <ScrollView
            contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 110 }}
            showsVerticalScrollIndicator={false}
          >
            {Array.from({ length: 5 }).map((_, i) => (
              <View
                key={i}
                style={{
                  backgroundColor: COLORS.backgroundCard,
                  borderRadius:    RADIUS.xl,
                  height:          96,
                  marginBottom:    SPACING.sm,
                  borderWidth:     1,
                  borderColor:     COLORS.border,
                  opacity:         1 - i * 0.18,
                }}
              />
            ))}
          </ScrollView>
        )}

        {/* Content */}
        {!isLoading && (
          <ScrollView
            contentContainerStyle={{
              paddingHorizontal: SPACING.lg,
              paddingTop:        SPACING.sm,
              paddingBottom:     110,
              flexGrow:          1,
            }}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={handleRefresh}
                tintColor={COLORS.primary}
              />
            }
            onScroll={({ nativeEvent }) => {
              const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
              if (layoutMeasurement.height + contentOffset.y >= contentSize.height - 350) {
                handleLoadMore();
              }
            }}
            scrollEventThrottle={400}
          >
            {/* Suggested section — only when not searching */}
            {!isSearching && userHasInterests && suggestions.length > 0 && (
              <SuggestedSection
                suggestions={suggestions}
                currentUserId={user?.id ?? null}
                followStateMap={followStateMap}
                onToggle={handleFollowToggle}
              />
            )}

            {/* Empty state */}
            {researchers.length === 0 && (
              <EmptyState isSearching={isSearching} />
            )}

            {/* Main list */}
            {researchers.map((researcher, i) => (
              <ResearcherCard
                key={researcher.id}
                researcher={researcher}
                currentUserId={user?.id ?? null}
                followState={
                  followStateMap[researcher.id] ?? {
                    isFollowing:   researcher.is_following,
                    followerCount: researcher.follower_count,
                    isLoading:     false,
                  }
                }
                onToggle={handleFollowToggle}
                index={i}
              />
            ))}

            {/* Load more */}
            {isLoadingMore && (
              <View style={{ paddingVertical: SPACING.lg, alignItems: 'center' }}>
                <ActivityIndicator color={COLORS.primary} />
              </View>
            )}

            {/* End of list */}
            {!hasMore && researchers.length > 0 && (
              <View style={{ alignItems: 'center', paddingVertical: SPACING.xl }}>
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
                    All researchers loaded
                  </Text>
                </View>
              </View>
            )}
          </ScrollView>
        )}

      </SafeAreaView>
    </LinearGradient>
  );
}