// app/(app)/user-profile.tsx
// DeepDive AI — Part 36: Public user profile screen.
//
// FIX: Share link was appearing twice because Share.share() received both
// `message` (which contained the URL) AND `url` (the same URL). On iOS,
// the system appends the `url` after the `message`, so the link showed up
// twice. Fix: `message` contains only human-readable text; `url` carries
// the link alone. On Android `url` is ignored by most share targets so
// the link is included at the end of `message` only on Android.
//
// FIX: Reports not showing — uses SECURITY DEFINER RPC to bypass share_links
// RLS when viewing another user's profile.
//
// FIX: Routes to feed-report-view for other users' reports to avoid the
// expo-notifications crash chain from research-report.tsx.

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  Linking,
  Share,
  Platform,
} from 'react-native';
import { LinearGradient }  from 'expo-linear-gradient';
import { Ionicons }        from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { SafeAreaView }    from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { supabase }        from '../../src/lib/supabase';
import { useAuth }         from '../../src/context/AuthContext';
import { Avatar }          from '../../src/components/common/Avatar';
import { FollowButton }    from '../../src/components/social/FollowButton';
import { COLORS, FONTS, SPACING, RADIUS } from '../../src/constants/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PublicProfile {
  id:              string;
  username:        string | null;
  full_name:       string | null;
  avatar_url:      string | null;
  bio:             string | null;
  interests:       string[];
  is_public:       boolean;
  follower_count:  number;
  following_count: number;
  is_following:    boolean;
}

interface PublicReport {
  id:                string;
  title:             string;
  depth:             string;
  sources_count:     number;
  reliability_score: number;
  created_at:        string;
  executive_summary: string | null;
  share_id:          string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DEPTH_LABELS: Record<string, string> = {
  quick: 'Quick', deep: 'Deep Dive', expert: 'Expert',
};
const DEPTH_COLORS: Record<string, string> = {
  quick: COLORS.success, deep: COLORS.primary, expert: COLORS.warning,
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days < 1)  return 'Today';
  if (days < 7)  return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

const WEB_BASE = 'https://public-reports-three.vercel.app';

// ─── Report card ──────────────────────────────────────────────────────────────

function ReportCard({
  report, isOwner,
  profileUsername, profileFullName, profileAvatarUrl,
  index,
}: {
  report:           PublicReport;
  isOwner:          boolean;
  profileUsername:  string | null;
  profileFullName:  string | null;
  profileAvatarUrl: string | null;
  index:            number;
}) {
  const depthColor = DEPTH_COLORS[report.depth] ?? COLORS.primary;

  const handlePress = () => {
    if (isOwner) {
      router.push({ pathname: '/(app)/research-report' as any, params: { reportId: report.id } });
    } else {
      router.push({
        pathname: '/(app)/feed-report-view' as any,
        params: {
          reportId:        report.id,
          authorName:      profileFullName ?? profileUsername ?? '',
          authorUsername:  profileUsername ?? '',
          authorAvatarUrl: profileAvatarUrl ?? '',
        },
      });
    }
  };

  return (
    <Animated.View entering={FadeInDown.duration(350).delay(index * 60)}>
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={0.76}
        style={{
          backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.xl,
          marginBottom: SPACING.sm, borderWidth: 1, borderColor: COLORS.border,
          overflow: 'hidden',
        }}
      >
        <View style={{ height: 3, backgroundColor: depthColor, opacity: 0.55 }} />
        <View style={{ padding: SPACING.md }}>
          <Text
            style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '800', lineHeight: 22, marginBottom: 6 }}
            numberOfLines={2}
          >
            {report.title}
          </Text>

          {report.executive_summary && (
            <Text
              style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, lineHeight: 18, marginBottom: SPACING.sm }}
              numberOfLines={2}
            >
              {report.executive_summary}
            </Text>
          )}

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <View style={{
                backgroundColor: `${depthColor}15`, borderRadius: RADIUS.full,
                paddingHorizontal: 8, paddingVertical: 3,
              }}>
                <Text style={{ color: depthColor, fontSize: FONTS.sizes.xs, fontWeight: '600' }}>
                  {DEPTH_LABELS[report.depth]}
                </Text>
              </View>
              {report.sources_count > 0 && (
                <View style={{
                  flexDirection: 'row', alignItems: 'center', gap: 3,
                  backgroundColor: `${COLORS.info}10`, borderRadius: RADIUS.full,
                  paddingHorizontal: 8, paddingVertical: 3,
                }}>
                  <Ionicons name="globe-outline" size={10} color={COLORS.info} />
                  <Text style={{ color: COLORS.info, fontSize: FONTS.sizes.xs }}>{report.sources_count}</Text>
                </View>
              )}
            </View>
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
              {timeAgo(report.created_at)}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function UserProfileScreen() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const { user }     = useAuth();

  const [profile,     setProfile]     = useState<PublicProfile | null>(null);
  const [reports,     setReports]     = useState<PublicReport[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing,  setRefreshing]  = useState(false);
  const [hasMore,     setHasMore]     = useState(true);
  const [notFound,    setNotFound]    = useState(false);

  const PAGE         = 12;
  const isOwnProfile = !!(user && profile && user.id === profile.id);

  // ── Load profile ───────────────────────────────────────────────────────────

  const loadProfile = useCallback(async () => {
    if (!username) return;
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, full_name, avatar_url, bio, interests, is_public, follower_count, following_count')
        .eq('username', username)
        .maybeSingle();

      if (error || !data) { setNotFound(true); return; }

      let isFollowing = false;
      if (user && data.id !== user.id) {
        const { data: fData } = await supabase
          .from('user_follows')
          .select('id')
          .eq('follower_id', user.id)
          .eq('following_id', data.id)
          .maybeSingle();
        isFollowing = !!fData;
      }

      setProfile({
        id:              data.id,
        username:        data.username,
        full_name:       data.full_name,
        avatar_url:      data.avatar_url,
        bio:             data.bio,
        interests:       data.interests ?? [],
        is_public:       data.is_public  ?? false,
        follower_count:  data.follower_count  ?? 0,
        following_count: data.following_count ?? 0,
        is_following:    isFollowing,
      });
    } catch (err) {
      console.warn('[UserProfile] loadProfile error:', err);
      setNotFound(true);
    }
  }, [username, user?.id]);

  // ── Load published reports ─────────────────────────────────────────────────

  const loadReports = useCallback(
    async (replace: boolean, profileId: string, isOwner: boolean) => {
      try {
        const offset = replace ? 0 : reports.length;
        let mapped: PublicReport[] = [];
        let rpcSuccess = false;

        // Strategy 1: SECURITY DEFINER RPC (bypasses share_links RLS)
        try {
          const { data: rpcData, error: rpcErr } = await supabase.rpc(
            'get_published_reports_for_user',
            { p_user_id: profileId, p_limit: PAGE, p_offset: offset },
          );
          if (!rpcErr && Array.isArray(rpcData) && rpcData.length >= 0) {
            mapped     = rpcData as PublicReport[];
            rpcSuccess = true;
          }
        } catch (rpcEx) {
          console.warn('[UserProfile] RPC fallback:', rpcEx);
        }

        // Strategy 2: Direct query (owner only — RLS passes for own rows)
        if (!rpcSuccess && isOwner) {
          const { data: directData } = await supabase
            .from('research_reports')
            .select('id, title, depth, sources_count, reliability_score, created_at, executive_summary, share_links(share_id, is_active)')
            .eq('user_id', profileId)
            .order('created_at', { ascending: false })
            .range(offset, offset + PAGE - 1);

          if (directData) {
            mapped = (directData as any[])
              .filter(r => {
                const sl = Array.isArray(r.share_links) ? r.share_links[0] : r.share_links;
                return sl?.is_active;
              })
              .map((r: any) => {
                const sl = Array.isArray(r.share_links) ? r.share_links[0] : r.share_links;
                return {
                  id:                r.id,
                  title:             r.title ?? 'Untitled',
                  depth:             r.depth,
                  sources_count:     r.sources_count     ?? 0,
                  reliability_score: r.reliability_score ?? 0,
                  created_at:        r.created_at,
                  executive_summary: r.executive_summary ?? null,
                  share_id:          sl?.share_id         ?? null,
                };
              });
          }
        }

        if (replace) {
          setReports(mapped);
        } else {
          setReports(prev => {
            const ids = new Set(prev.map(x => x.id));
            return [...prev, ...mapped.filter(x => !ids.has(x.id))];
          });
        }
        setHasMore(mapped.length >= PAGE);
      } catch (err) {
        console.warn('[UserProfile] loadReports error:', err);
      }
    },
    [reports.length],
  );

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await loadProfile();
      setLoading(false);
    };
    init();
  }, [username]);

  useEffect(() => {
    if (profile?.id) loadReports(true, profile.id, isOwnProfile);
  }, [profile?.id, isOwnProfile]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadProfile();
    if (profile?.id) await loadReports(true, profile.id, isOwnProfile);
    setRefreshing(false);
  }, [profile?.id, isOwnProfile]);

  const handleLoadMore = useCallback(async () => {
    if (!hasMore || loadingMore || !profile?.id) return;
    setLoadingMore(true);
    await loadReports(false, profile.id, isOwnProfile);
    setLoadingMore(false);
  }, [hasMore, loadingMore, profile?.id, isOwnProfile]);

  // ── Share — FIX: link no longer duplicated ─────────────────────────────────
  // Root cause: passing both `message` (with URL embedded) AND `url` caused
  // iOS to append the URL after the message, showing it twice.
  // Fix: `message` = human text only, `url` = link (iOS uses url separately).
  // On Android, `url` is often ignored, so we append the link to message only
  // on Android.

  const handleShare = async () => {
    if (!profile?.username) return;
    const profileUrl = `${WEB_BASE}/u/${profile.username}`;
    const displayName = profile.full_name ?? profile.username;

    try {
      if (Platform.OS === 'ios') {
        // iOS: pass message (no URL) + url separately — system shows them once
        await Share.share({
          message: `Check out ${displayName}'s research on DeepDive AI`,
          url:     profileUrl,
        });
      } else {
        // Android: url field is usually ignored — embed link in message
        await Share.share({
          message: `Check out ${displayName}'s research on DeepDive AI\n${profileUrl}`,
        });
      }
    } catch {}
  };

  // ── Loading ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <LinearGradient colors={[COLORS.background, COLORS.backgroundCard]} style={{ flex: 1 }}>
        <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </SafeAreaView>
      </LinearGradient>
    );
  }

  if (notFound || !profile) {
    return (
      <LinearGradient colors={[COLORS.background, COLORS.backgroundCard]} style={{ flex: 1 }}>
        <SafeAreaView style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', padding: SPACING.lg }}>
            <Pressable
              onPress={() => router.back()}
              style={{
                width: 38, height: 38, borderRadius: 11,
                backgroundColor: COLORS.backgroundElevated,
                alignItems: 'center', justifyContent: 'center',
                borderWidth: 1, borderColor: COLORS.border,
              }}
            >
              <Ionicons name="arrow-back" size={19} color={COLORS.textSecondary} />
            </Pressable>
          </View>
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl }}>
            <Ionicons name="person-outline" size={48} color={COLORS.textMuted} />
            <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.lg, fontWeight: '700', marginTop: SPACING.md, textAlign: 'center' }}>
              Profile not found
            </Text>
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.sm, textAlign: 'center', marginTop: SPACING.sm, lineHeight: 22 }}>
              This profile may be private or the username may have changed.
            </Text>
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  const displayName = profile.full_name ?? profile.username ?? 'Researcher';

  return (
    <LinearGradient colors={[COLORS.background, COLORS.backgroundCard]} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>

        {/* Header */}
        <Animated.View
          entering={FadeIn.duration(400)}
          style={{
            flexDirection: 'row', alignItems: 'center',
            paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md,
            gap: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border,
          }}
        >
          <Pressable
            onPress={() => router.back()}
            hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
            style={{
              width: 38, height: 38, borderRadius: 11,
              backgroundColor: COLORS.backgroundElevated,
              alignItems: 'center', justifyContent: 'center',
              borderWidth: 1, borderColor: COLORS.border,
            }}
          >
            <Ionicons name="arrow-back" size={19} color={COLORS.textSecondary} />
          </Pressable>

          <Text style={{ flex: 1, color: COLORS.textPrimary, fontSize: FONTS.sizes.lg, fontWeight: '800' }} numberOfLines={1}>
            {displayName}
          </Text>

          <Pressable
            onPress={handleShare}
            hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
            style={{
              width: 38, height: 38, borderRadius: 11,
              backgroundColor: COLORS.backgroundElevated,
              alignItems: 'center', justifyContent: 'center',
              borderWidth: 1, borderColor: COLORS.border,
            }}
          >
            <Ionicons name="share-outline" size={17} color={COLORS.textSecondary} />
          </Pressable>
        </Animated.View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={COLORS.primary} />}
          contentContainerStyle={{ paddingBottom: 40 }}
          onScroll={({ nativeEvent }) => {
            const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
            if (layoutMeasurement.height + contentOffset.y >= contentSize.height - 300) handleLoadMore();
          }}
          scrollEventThrottle={400}
        >
          {/* Profile card */}
          <Animated.View entering={FadeInDown.duration(400).delay(60)} style={{ padding: SPACING.lg }}>
            <LinearGradient
              colors={['#1A1A35', '#12122A']}
              style={{ borderRadius: RADIUS.xl * 1.5, padding: SPACING.lg, borderWidth: 1, borderColor: `${COLORS.primary}30` }}
            >
              {/* Avatar + name + follow/edit */}
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: SPACING.lg }}>
                <Avatar url={profile.avatar_url} name={displayName} size={72} />
                <View style={{ flex: 1, marginLeft: SPACING.md }}>
                  <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.lg, fontWeight: '800' }}>
                    {displayName}
                  </Text>
                  {profile.username && (
                    <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.sm, marginTop: 2 }}>
                      @{profile.username}
                    </Text>
                  )}
                </View>
                {!isOwnProfile ? (
                  <FollowButton
                    targetUserId={profile.id}
                    initialIsFollowing={profile.is_following}
                    initialFollowerCount={profile.follower_count}
                    size="sm"
                  />
                ) : (
                  <TouchableOpacity
                    onPress={() => router.push('/(app)/(tabs)/profile' as any)}
                    style={{
                      backgroundColor: COLORS.backgroundElevated, borderRadius: RADIUS.full,
                      paddingHorizontal: 12, paddingVertical: 7,
                      borderWidth: 1, borderColor: COLORS.border,
                    }}
                  >
                    <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, fontWeight: '600' }}>
                      Edit Profile
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Bio */}
              {profile.bio && (
                <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, lineHeight: 22, marginBottom: SPACING.md }}>
                  {profile.bio}
                </Text>
              )}

              {/* Stats */}
              <View style={{ flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.md }}>
                {[
                  { label: 'Reports',   value: String(reports.length),         icon: 'document-text-outline', color: COLORS.primary, onPress: undefined as (() => void) | undefined },
                  { label: 'Followers', value: String(profile.follower_count),  icon: 'people-outline',        color: COLORS.info,
                    onPress: () => router.push({ pathname: '/(app)/followers' as any, params: { userId: profile.id, tab: 'followers' } }) },
                  { label: 'Following', value: String(profile.following_count), icon: 'person-add-outline',    color: COLORS.success,
                    onPress: () => router.push({ pathname: '/(app)/followers' as any, params: { userId: profile.id, tab: 'following' } }) },
                ].map(stat => (
                  <Pressable
                    key={stat.label} onPress={stat.onPress}
                    style={{
                      flex: 1, backgroundColor: COLORS.backgroundElevated,
                      borderRadius: RADIUS.lg, padding: SPACING.sm,
                      alignItems: 'center', borderWidth: 1, borderColor: COLORS.border,
                    }}
                  >
                    <Ionicons name={stat.icon as any} size={16} color={stat.color} />
                    <Text style={{ color: stat.color, fontSize: FONTS.sizes.md, fontWeight: '800', marginTop: 4 }}>{stat.value}</Text>
                    <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 2 }}>{stat.label}</Text>
                  </Pressable>
                ))}
              </View>

              {/* Interests */}
              {profile.interests.length > 0 && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: SPACING.md }}>
                  {profile.interests.slice(0, 8).map(tag => (
                    <View key={tag} style={{
                      backgroundColor: `${COLORS.primary}12`, borderRadius: RADIUS.full,
                      paddingHorizontal: 10, paddingVertical: 4,
                      borderWidth: 1, borderColor: `${COLORS.primary}25`,
                    }}>
                      <Text style={{ color: '#A78BFA', fontSize: FONTS.sizes.xs, fontWeight: '600' }}>{tag}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* View on Web */}
              {profile.is_public && profile.username && (
                <Pressable
                  onPress={() => Linking.openURL(`${WEB_BASE}/u/${profile.username}`).catch(() => {})}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 6,
                    alignSelf: 'flex-start',
                    backgroundColor: `${COLORS.primary}12`, borderRadius: RADIUS.full,
                    paddingHorizontal: 12, paddingVertical: 6,
                    borderWidth: 1, borderColor: `${COLORS.primary}25`,
                  }}
                >
                  <Ionicons name="globe-outline" size={13} color={COLORS.primary} />
                  <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.xs, fontWeight: '600' }}>
                    View on Web
                  </Text>
                </Pressable>
              )}
            </LinearGradient>
          </Animated.View>

          {/* Published reports */}
          <View style={{ paddingHorizontal: SPACING.lg }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.md }}>
              <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase' }}>
                Published Research
              </Text>
              {reports.length > 0 && (
                <View style={{
                  backgroundColor: `${COLORS.primary}15`, borderRadius: RADIUS.full,
                  paddingHorizontal: 10, paddingVertical: 3,
                  borderWidth: 1, borderColor: `${COLORS.primary}25`,
                }}>
                  <Text style={{ color: COLORS.primary, fontSize: 9, fontWeight: '700' }}>
                    {reports.length} REPORT{reports.length !== 1 ? 'S' : ''}
                  </Text>
                </View>
              )}
            </View>

            {reports.length === 0 && !loadingMore && (
              <View style={{
                backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.xl,
                padding: SPACING.xl, alignItems: 'center',
                borderWidth: 1, borderColor: COLORS.border,
              }}>
                <Ionicons name="document-text-outline" size={36} color={COLORS.border} />
                <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.sm, marginTop: SPACING.md, textAlign: 'center' }}>
                  {isOwnProfile ? 'Publish your first report to share it here.' : 'No published reports yet.'}
                </Text>
              </View>
            )}

            {reports.map((report, i) => (
              <ReportCard
                key={report.id}
                report={report}
                isOwner={isOwnProfile}
                profileUsername={profile.username}
                profileFullName={profile.full_name}
                profileAvatarUrl={profile.avatar_url}
                index={i}
              />
            ))}

            {loadingMore && (
              <View style={{ paddingVertical: SPACING.lg, alignItems: 'center' }}>
                <ActivityIndicator color={COLORS.primary} />
              </View>
            )}

            {!hasMore && reports.length > 0 && (
              <View style={{ alignItems: 'center', paddingVertical: SPACING.xl }}>
                <View style={{
                  flexDirection: 'row', alignItems: 'center', gap: 8,
                  backgroundColor: COLORS.backgroundElevated, borderRadius: RADIUS.full,
                  paddingHorizontal: 16, paddingVertical: 8,
                  borderWidth: 1, borderColor: COLORS.border,
                }}>
                  <Ionicons name="checkmark-circle-outline" size={14} color={COLORS.textMuted} />
                  <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>All reports loaded</Text>
                </View>
              </View>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}