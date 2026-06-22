// app/(app)/(tabs)/profile.tsx
// Part 45 FIX — Added SelectiveCacheSheet as sibling modal (not nested inside CacheManagerModal).
//
// CHANGES from Part 36C:
//   1. Added `selectiveVisible` state
//   2. Added SelectiveCacheSheet import
//   3. CacheManagerModal gets `onOpenSelectiveCache` prop that:
//        a) closes the cache manager
//        b) waits 350ms for it to fully dismiss
//        c) opens SelectiveCacheSheet
//   4. SelectiveCacheSheet rendered as a direct sibling of CacheManagerModal
//      in the JSX tree (both at the root level of the return), never nested.
//   5. CacheManagerModal no longer imports or renders SelectiveCacheSheet itself.
//
// ── Part 50.10 — ANDROID UI FIX (production · issue 6) ────────────────────────
//   The Edit Profile modal was redesigned to be COMPACT so all fields are
//   visible without scrolling, with full Android compatibility:
//     • Avatar reduced to 68px (was 90) and spacing tightened so the avatar +
//       3 inputs + Save button fit on screen without an inner ScrollView.
//     • The inner ScrollView was removed (no scrolling needed).
//     • Bottom padding now uses the safe-area inset
//       (Math.max(insets.bottom, SPACING.md)) so the Save button clears the
//       Android nav/gesture bar under SDK 54 edge-to-edge.
//     • KeyboardAvoidingView retained (padding on iOS, height on Android) so the
//       keyboard never covers the inputs.
//   All other code is identical to Part 45.

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  Linking,
  Platform,
  Modal,
  Image,
  KeyboardAvoidingView,
  BackHandler,
  Keyboard,
  Pressable,
} from 'react-native';
import { LinearGradient }     from 'expo-linear-gradient';
import { Ionicons }           from '@expo/vector-icons';
import * as ImagePicker       from 'expo-image-picker';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
// Part 50.10 (issue 6): useSafeAreaInsets added for Edit Profile bottom inset.
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router }             from 'expo-router';

import { useAuth }            from '../../../src/context/AuthContext';
import { useCredits }         from '../../../src/context/CreditsContext';
import { useCollections }     from '../../../src/hooks/useCollections';
import { Avatar }             from '../../../src/components/common/Avatar';
import { AnimatedInput }      from '../../../src/components/common/AnimatedInput';
import { GradientButton }     from '../../../src/components/common/GradientButton';
import { LoadingOverlay }     from '../../../src/components/common/LoadingOverlay';
import { StatsCard }          from '../../../src/components/profile/StatsCard';
import { CacheManagerModal }  from '../../../src/components/profile/CacheManagerModal';
import { ReferralCard }       from '../../../src/components/profile/ReferralCard';
import { ManageCollectionsSheet } from '../../../src/components/collections/ManageCollectionsSheet';
// Part 45 FIX: SelectiveCacheSheet now owned by profile, not CacheManagerModal
import { SelectiveCacheSheet } from '../../../src/components/offline/SelectiveCacheSheet';
// Part 36: Social components
import { SocialNotificationBell } from '../../../src/components/social/SocialNotificationBell';
import { updateProfilePublic }    from '../../../src/services/followService';
import { useStats }           from '../../../src/hooks/useStats';
import { useProfile }         from '../../../src/hooks/useProfile';
import {
  getNotificationsEnabled,
  enableNotifications,
  disableNotifications,
  getPermissionStatus,
}                             from '../../../src/lib/notifications';
import {
  getCacheStats,
  formatBytes,
  clearAllCache,
}                             from '../../../src/lib/cacheStorage';
import {
  getSettings as getCacheSettings,
  setAutoCache,
}                             from '../../../src/lib/cacheSettings';
import {
  LOW_BALANCE_THRESHOLD,
  FEATURE_COSTS,
}                             from '../../../src/constants/credits';
import { COLORS, FONTS, SPACING, RADIUS } from '../../../src/constants/theme';
import type { UserStats } from '../../../src/types';

const PUBLIC_REPORTS_URL =
  process.env.EXPO_PUBLIC_PUBLIC_REPORTS_URL ?? 'https://deepdive-reports.vercel.app';

const DEFAULT_STATS: UserStats = {
  totalReports: 0, completedReports: 0, totalSources: 0, avgReliability: 0,
  favoriteTopic: null, reportsThisMonth: 0, hoursResearched: 0,
  totalAssistantMessages: 0, reportsWithEmbeddings: 0,
  academicPapersGenerated: 0, totalPodcasts: 0, totalDebates: 0,
};

const IS_IOS     = Platform.OS === 'ios';
const IS_ANDROID = Platform.OS === 'android';

async function openAppSettings(): Promise<void> {
  try {
    if (IS_IOS) await Linking.openURL('app-settings:');
    else await Linking.openSettings();
  } catch {
    Alert.alert('Cannot Open Settings', 'Please enable notifications manually in device Settings.');
  }
}

function SectionHeader({ label }: { label: string }) {
  return (
    <Text style={{
      color: COLORS.textSecondary, fontSize: FONTS.sizes.sm,
      fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase',
      marginBottom: SPACING.sm, marginTop: SPACING.lg,
    }}>
      {label}
    </Text>
  );
}

function SettingsRow({
  icon, label, sublabel, onPress, right, iconColor, iconBg, accentBorder,
}: {
  icon: string; label: string; sublabel?: string; onPress?: () => void;
  right?: React.ReactNode; iconColor?: string; iconBg?: string; accentBorder?: string;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
      style={{
        flexDirection: 'row', alignItems: 'center',
        padding: SPACING.md, backgroundColor: COLORS.backgroundCard,
        borderRadius: RADIUS.lg, marginBottom: SPACING.sm,
        borderWidth: 1, borderColor: accentBorder ?? COLORS.border,
      }}
    >
      <View style={{
        width: 38, height: 38, borderRadius: 11,
        backgroundColor: iconBg ?? `${COLORS.primary}15`,
        alignItems: 'center', justifyContent: 'center', marginRight: SPACING.md,
      }}>
        <Ionicons name={icon as any} size={19} color={iconColor ?? COLORS.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '600' }}>{label}</Text>
        {sublabel ? <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 2 }}>{sublabel}</Text> : null}
      </View>
      {right !== undefined
        ? right
        : onPress
        ? <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
        : null}
    </TouchableOpacity>
  );
}

function SocialDiscoveryCard({
  userId, username, isPublic, followerCount, followingCount,
  onTogglePublic, isTogglingPublic,
}: {
  userId: string; username: string | null; isPublic: boolean;
  followerCount: number; followingCount: number;
  onTogglePublic: (val: boolean) => void; isTogglingPublic: boolean;
}) {
  const profileUrl = username ? `${PUBLIC_REPORTS_URL}/u/${username}` : null;

  return (
    <View style={{ backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.xl, borderWidth: 1, borderColor: isPublic ? `${COLORS.primary}35` : COLORS.border, overflow: 'hidden', marginBottom: SPACING.sm }}>
      <LinearGradient colors={['#1A1A35', '#12122A']} style={{ flexDirection: 'row', alignItems: 'center', padding: SPACING.md, paddingBottom: SPACING.sm }}>
        <LinearGradient
          colors={isPublic ? [COLORS.success, `${COLORS.success}CC`] : COLORS.gradientPrimary as [string, string]}
          style={{ width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: SPACING.sm }}
        >
          <Ionicons name={isPublic ? 'globe' : 'globe-outline'} size={17} color="#FFF" />
        </LinearGradient>
        <View style={{ flex: 1 }}>
          <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '700' }}>Public Profile</Text>
          <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 1 }}>
            {isPublic ? 'Visible at /u/' + (username ?? 'you') + ' · others can follow you' : 'Private · only you can see your profile'}
          </Text>
        </View>
        <Switch value={isPublic} onValueChange={onTogglePublic} disabled={isTogglingPublic}
          trackColor={{ false: COLORS.border, true: `${COLORS.primary}70` }}
          thumbColor={isPublic ? COLORS.primary : COLORS.textMuted} ios_backgroundColor={COLORS.border} />
      </LinearGradient>
      <View style={{ flexDirection: 'row', paddingHorizontal: SPACING.md, paddingTop: SPACING.sm, paddingBottom: SPACING.md, gap: SPACING.sm }}>
        <TouchableOpacity onPress={() => router.push({ pathname: '/(app)/followers' as any, params: { userId, mode: 'followers', username: username ?? '' } })}
          activeOpacity={0.75} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: `${COLORS.primary}08`, borderRadius: RADIUS.lg, paddingVertical: SPACING.sm, borderWidth: 1, borderColor: `${COLORS.primary}20` }}>
          <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.lg, fontWeight: '800' }}>{followerCount >= 1000 ? `${(followerCount / 1000).toFixed(1)}k` : followerCount}</Text>
          <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 2 }}>Followers</Text>
          <Ionicons name="chevron-forward" size={10} color={`${COLORS.primary}50`} style={{ marginTop: 2 }} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.push({ pathname: '/(app)/followers' as any, params: { userId, mode: 'following', username: username ?? '' } })}
          activeOpacity={0.75} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: `${COLORS.info}08`, borderRadius: RADIUS.lg, paddingVertical: SPACING.sm, borderWidth: 1, borderColor: `${COLORS.info}20` }}>
          <Text style={{ color: COLORS.info, fontSize: FONTS.sizes.lg, fontWeight: '800' }}>{followingCount >= 1000 ? `${(followingCount / 1000).toFixed(1)}k` : followingCount}</Text>
          <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 2 }}>Following</Text>
          <Ionicons name="chevron-forward" size={10} color={`${COLORS.info}50`} style={{ marginTop: 2 }} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.push('/(app)/(tabs)/feed' as any)}
          activeOpacity={0.75} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: `${COLORS.success}08`, borderRadius: RADIUS.lg, paddingVertical: SPACING.sm, borderWidth: 1, borderColor: `${COLORS.success}20` }}>
          <Ionicons name="newspaper-outline" size={20} color={COLORS.success} />
          <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 4 }}>Feed</Text>
        </TouchableOpacity>
      </View>
      {isPublic && profileUrl && (
        <TouchableOpacity onPress={() => Linking.openURL(profileUrl)} activeOpacity={0.8}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: SPACING.md, marginBottom: SPACING.md, paddingVertical: 10, paddingHorizontal: SPACING.md, backgroundColor: `${COLORS.primary}08`, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: `${COLORS.primary}20` }}>
          <Ionicons name="open-outline" size={14} color={COLORS.primary} />
          <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.xs, fontWeight: '600', flex: 1 }}>{profileUrl}</Text>
          <Ionicons name="chevron-forward" size={13} color={`${COLORS.primary}60`} />
        </TouchableOpacity>
      )}
      {!isPublic && (
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginHorizontal: SPACING.md, marginBottom: SPACING.md, padding: SPACING.sm, backgroundColor: `${COLORS.info}08`, borderRadius: RADIUS.md, borderWidth: 1, borderColor: `${COLORS.info}15` }}>
          <Ionicons name="information-circle-outline" size={14} color={COLORS.info} style={{ marginTop: 1 }} />
          <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, lineHeight: 17, flex: 1 }}>Enable to get a public profile page, let others follow you, and appear in the DeepDive community.</Text>
        </View>
      )}
    </View>
  );
}

function CollectionsPreviewCard({ onManage }: { onManage: () => void }) {
  const { collections, isLoading, refresh } = useCollections();
  useEffect(() => { refresh(); }, []);
  const preview       = collections.slice(0, 3);
  const overflowCount = Math.max(0, collections.length - 3);

  return (
    <TouchableOpacity onPress={onManage} activeOpacity={0.85}
      style={{ backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.xl, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden', marginBottom: SPACING.sm }}>
      <LinearGradient colors={['#1A1A35', '#12122A']} style={{ flexDirection: 'row', alignItems: 'center', padding: SPACING.md, paddingBottom: SPACING.sm }}>
        <LinearGradient colors={COLORS.gradientPrimary as [string, string]} style={{ width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: SPACING.sm }}>
          <Ionicons name="folder" size={17} color="#FFF" />
        </LinearGradient>
        <View style={{ flex: 1 }}>
          <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '700' }}>My Collections</Text>
          <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 1 }}>
            {isLoading ? 'Loading…' : collections.length === 0 ? 'No collections yet' : `${collections.length} collection${collections.length !== 1 ? 's' : ''}`}
          </Text>
        </View>
        <TouchableOpacity onPress={onManage} activeOpacity={0.8} hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: `${COLORS.primary}18`, borderRadius: RADIUS.full, paddingHorizontal: 11, paddingVertical: 6, borderWidth: 1, borderColor: `${COLORS.primary}35` }}>
          <Ionicons name="settings-outline" size={12} color={COLORS.primary} />
          <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.xs, fontWeight: '700' }}>Manage</Text>
        </TouchableOpacity>
      </LinearGradient>
      <View style={{ paddingHorizontal: SPACING.md, paddingTop: SPACING.sm, paddingBottom: SPACING.md }}>
        {collections.length === 0 && !isLoading ? (
          <TouchableOpacity onPress={onManage} activeOpacity={0.8}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: `${COLORS.primary}08`, borderRadius: RADIUS.lg, padding: SPACING.md, borderWidth: 1, borderColor: `${COLORS.primary}20`, borderStyle: 'dashed' }}>
            <View style={{ width: 32, height: 32, borderRadius: 9, backgroundColor: `${COLORS.primary}15`, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="add" size={18} color={COLORS.primary} />
            </View>
            <View>
              <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '600' }}>Create your first collection</Text>
              <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 1 }}>Organise reports, podcasts, papers and more</Text>
            </View>
          </TouchableOpacity>
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {preview.map(col => (
              <TouchableOpacity key={col.id} onPress={() => router.push({ pathname: '/(app)/collection-detail' as any, params: { collectionId: col.id } })} activeOpacity={0.8}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: `${col.color}18`, borderRadius: RADIUS.full, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: `${col.color}35` }}>
                <Ionicons name={col.icon as any} size={13} color={col.color} />
                <Text style={{ color: col.color, fontSize: FONTS.sizes.xs, fontWeight: '700' }} numberOfLines={1}>{col.name}</Text>
                {(col.itemCount ?? 0) > 0 && (
                  <View style={{ backgroundColor: `${col.color}25`, borderRadius: RADIUS.full, paddingHorizontal: 5, paddingVertical: 1 }}>
                    <Text style={{ color: col.color, fontSize: 10, fontWeight: '700' }}>{col.itemCount}</Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
            {overflowCount > 0 && (
              <TouchableOpacity onPress={onManage} activeOpacity={0.8}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: COLORS.backgroundElevated, borderRadius: RADIUS.full, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: COLORS.border }}>
                <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600' }}>+{overflowCount} more</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

function CreditsCard() {
  const { balance, isLoading } = useCredits();
  const isLow    = balance < LOW_BALANCE_THRESHOLD && balance > 0;
  const isEmpty  = balance === 0;
  const accentColor = isEmpty ? COLORS.error : isLow ? COLORS.warning : COLORS.primary;

  return (
    <TouchableOpacity onPress={() => router.push('/(app)/credits-store' as any)} activeOpacity={0.85}>
      <LinearGradient colors={['#1A1A35', '#12122A']} style={{ borderRadius: RADIUS.xl, padding: SPACING.lg, marginBottom: SPACING.sm, borderWidth: 1, borderColor: `${accentColor}35` }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.md }}>
          <LinearGradient
            colors={isEmpty ? [COLORS.error, '#CC0000'] : isLow ? [COLORS.warning, '#E67E22'] : COLORS.gradientPrimary as [string, string]}
            style={{ width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginRight: SPACING.sm }}
          >
            <Ionicons name="flash" size={18} color="#FFF" />
          </LinearGradient>
          <View style={{ flex: 1 }}>
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600' }}>YOUR CREDITS</Text>
            <Text style={{ color: accentColor, fontSize: FONTS.sizes.xl, fontWeight: '900' }}>{isLoading ? '...' : balance.toLocaleString()}</Text>
          </View>
          <View style={{ backgroundColor: `${accentColor}15`, borderRadius: RADIUS.full, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: `${accentColor}30`, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Ionicons name="add" size={13} color={accentColor} />
            <Text style={{ color: accentColor, fontSize: FONTS.sizes.xs, fontWeight: '700' }}>Buy Credits</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: SPACING.sm, flexWrap: 'wrap' }}>
          {[
            { label: 'Research', cost: FEATURE_COSTS.research_deep, icon: 'analytics-outline' },
            { label: 'Podcast',  cost: FEATURE_COSTS.podcast_10min, icon: 'radio-outline' },
            { label: 'Paper',    cost: FEATURE_COSTS.academic_paper, icon: 'school-outline' },
            { label: 'Debate',   cost: FEATURE_COSTS.debate, icon: 'people-outline' },
          ].map(item => (
            <View key={item.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }}>
              <Ionicons name={item.icon as any} size={10} color={COLORS.textMuted} />
              <Text style={{ color: COLORS.textMuted, fontSize: 10 }}>{item.label} · {item.cost} cr</Text>
            </View>
          ))}
        </View>
        {(isEmpty || isLow) && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: `${accentColor}10`, borderRadius: RADIUS.md, padding: SPACING.sm, marginTop: SPACING.sm, borderWidth: 1, borderColor: `${accentColor}20` }}>
            <Ionicons name="warning-outline" size={13} color={accentColor} />
            <Text style={{ color: accentColor, fontSize: FONTS.sizes.xs, fontWeight: '600' }}>
              {isEmpty ? 'No credits left — buy a pack to keep researching' : 'Low balance — top up to avoid interruptions'}
            </Text>
          </View>
        )}
      </LinearGradient>
    </TouchableOpacity>
  );
}

interface CacheSummary {
  totalItems: number; totalBytes: number; limitBytes: number;
  percentUsed: number; autoCache: boolean;
}

export default function ProfileScreen() {
  const { user, profile, signOut, refreshProfile } = useAuth();
  const { stats, loading: statsLoading }            = useStats();
  const { updateProfile, uploadAvatar, updating, uploading } = useProfile();

  // Part 50.10 (issue 6): safe-area insets for the Edit Profile modal bottom pad.
  const insets = useSafeAreaInsets();

  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [notifLoading,         setNotifLoading]         = useState(false);
  const [cacheSummary,         setCacheSummary]         = useState<CacheSummary | null>(null);
  const [cacheModalVisible,    setCacheModalVisible]    = useState(false);
  // Part 45 FIX: selectiveVisible lives here, not inside CacheManagerModal
  const [selectiveVisible,     setSelectiveVisible]     = useState(false);
  const [collectionsVisible,   setCollectionsVisible]   = useState(false);
  const [editModalVisible,     setEditModalVisible]     = useState(false);
  const [editName,             setEditName]             = useState(profile?.full_name  || '');
  const [editBio,              setEditBio]              = useState(profile?.bio        || '');
  const [editOccupation,       setEditOccupation]       = useState(profile?.occupation || '');
  const [editAvatarUri,        setEditAvatarUri]        = useState<string | null>(null);

  const [isPublic,         setIsPublic]         = useState<boolean>(profile?.is_public ?? false);
  const [isTogglingPublic, setIsTogglingPublic] = useState(false);

  useEffect(() => {
    if (profile) setIsPublic(profile.is_public ?? false);
  }, [profile?.is_public]);

  useEffect(() => {
    if (!IS_ANDROID) return;
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (editModalVisible)   { setEditModalVisible(false);   return true; }
      if (collectionsVisible) { setCollectionsVisible(false); return true; }
      if (cacheModalVisible)  { setCacheModalVisible(false);  return true; }
      if (selectiveVisible)   { setSelectiveVisible(false);   return true; }
      return false;
    });
    return () => handler.remove();
  }, [editModalVisible, collectionsVisible, cacheModalVisible, selectiveVisible]);

  useEffect(() => {
    (async () => {
      try {
        const [storedEnabled, osStatus] = await Promise.all([getNotificationsEnabled(), getPermissionStatus()]);
        setNotificationsEnabled(storedEnabled && osStatus === 'granted');
      } catch {}
    })();
  }, []);

  const loadCacheStats = useCallback(async () => {
    try {
      const [s, settings] = await Promise.all([getCacheStats(), getCacheSettings()]);
      setCacheSummary({ totalItems: s.totalItems, totalBytes: s.totalBytes, limitBytes: s.limitBytes, percentUsed: s.percentUsed, autoCache: settings.autoCache });
    } catch {
      setCacheSummary({ totalItems: 0, totalBytes: 0, limitBytes: 100 * 1024 * 1024, percentUsed: 0, autoCache: true });
    }
  }, []);

  useEffect(() => { loadCacheStats(); }, [loadCacheStats]);

  const handleCacheModalClose = useCallback(() => {
    setCacheModalVisible(false);
    loadCacheStats();
  }, [loadCacheStats]);

  const handleAutoCacheToggle = useCallback(async (value: boolean) => {
    await setAutoCache(value);
    setCacheSummary(prev => prev ? { ...prev, autoCache: value } : null);
  }, []);

  const handleQuickClearCache = useCallback(() => {
    if (!cacheSummary || cacheSummary.totalItems === 0) { Alert.alert('Cache Empty', 'There is nothing to clear.'); return; }
    Alert.alert('Clear Offline Cache', `Remove all ${cacheSummary.totalItems} cached items (${formatBytes(cacheSummary.totalBytes)}) from this device?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear Cache', style: 'destructive', onPress: async () => { await clearAllCache(); await loadCacheStats(); Alert.alert('Done', 'Offline cache cleared.'); } },
    ]);
  }, [cacheSummary, loadCacheStats]);

  const openEditModal = () => {
    setEditName(profile?.full_name || '');
    setEditBio(profile?.bio || '');
    setEditOccupation(profile?.occupation || '');
    setEditAvatarUri(null);
    setEditModalVisible(true);
  };

  const pickImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { Alert.alert('Permission needed', 'Please allow access to photos.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (!result.canceled) setEditAvatarUri(result.assets[0].uri);
  };

  const handleSaveProfile = async () => {
    if (!user) return;
    let avatarUrl = profile?.avatar_url;
    if (editAvatarUri) {
      const { url, error } = await uploadAvatar(user.id, editAvatarUri);
      if (error) { Alert.alert('Upload Error', error); return; }
      avatarUrl = url;
    }
    const { error } = await updateProfile(user.id, { full_name: editName.trim() || null, bio: editBio.trim() || null, occupation: editOccupation.trim() || null, avatar_url: avatarUrl });
    if (error) { Alert.alert('Error', error); return; }
    await refreshProfile();
    setEditModalVisible(false);
    setEditAvatarUri(null);
  };

  const handleTogglePublic = useCallback(async (val: boolean) => {
    if (!user || isTogglingPublic) return;
    if (val && !profile?.username) {
      Alert.alert('Username Required', 'You need a username to have a public profile. Set one in your profile setup.', [{ text: 'OK' }]);
      return;
    }
    setIsPublic(val);
    setIsTogglingPublic(true);
    try {
      const { error } = await updateProfilePublic(user.id, val);
      if (error) { setIsPublic(!val); Alert.alert('Error', 'Could not update profile visibility.'); }
      else await refreshProfile();
    } catch { setIsPublic(!val); }
    finally { setIsTogglingPublic(false); }
  }, [user, profile?.username, isTogglingPublic, refreshProfile]);

  const handleNotifSwitch = async (value: boolean) => {
    if (notifLoading || !user) return;
    setNotifLoading(true);
    try {
      if (value) {
        const result = await enableNotifications(user.id);
        if (result === 'enabled') { setNotificationsEnabled(true); }
        else {
          Alert.alert('Enable Notifications', 'Tap "Open Settings" to allow them.', [
            { text: 'Not Now', style: 'cancel' },
            { text: 'Open Settings', onPress: async () => { await openAppSettings(); setNotificationsEnabled(true); } },
          ]);
        }
      } else {
        await disableNotifications();
        setNotificationsEnabled(false);
      }
    } catch (err) { console.warn('[Profile] Notification toggle error:', err); }
    finally { setNotifLoading(false); }
  };

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: () => signOut() },
    ]);
  };

  const safeStats: UserStats = { ...DEFAULT_STATS, ...stats };
  const followerCount  = profile?.follower_count  ?? 0;
  const followingCount = profile?.following_count ?? 0;

  const cachePercentColor =
    (cacheSummary?.percentUsed ?? 0) > 85 ? COLORS.error :
    (cacheSummary?.percentUsed ?? 0) > 65 ? COLORS.warning : COLORS.info;

  const cacheSublabel = cacheSummary
    ? cacheSummary.totalItems === 0
      ? 'No items cached · Auto-cache is ' + (cacheSummary.autoCache ? 'ON' : 'OFF')
      : `${cacheSummary.totalItems} items · ${formatBytes(cacheSummary.totalBytes)} / ${formatBytes(cacheSummary.limitBytes)} (${Math.round(cacheSummary.percentUsed)}%)`
    : 'Loading…';

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={[COLORS.background, COLORS.backgroundCard]} style={{ flex: 1 }}>
        <SafeAreaView style={{ flex: 1 }}>
          <LoadingOverlay visible={updating || uploading} message="Saving..." />

          <ScrollView
            contentContainerStyle={{ padding: SPACING.xl, paddingBottom: 110 }}
            showsVerticalScrollIndicator={false}
            overScrollMode={IS_ANDROID ? 'never' : 'auto'}
          >
            {/* Profile header */}
            <Animated.View entering={FadeIn.duration(600)} style={{ alignItems: 'center', paddingTop: SPACING.lg, paddingBottom: SPACING.xl }}>
              <View style={{ position: 'absolute', top: SPACING.md, right: 0 }}>
                <SocialNotificationBell userId={user?.id ?? null} />
              </View>
              <View style={{ marginBottom: SPACING.md }}>
                <Avatar url={profile?.avatar_url} name={profile?.full_name} size={88} />
              </View>
              <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.xl, fontWeight: '800', textAlign: 'center' }}>
                {profile?.full_name ?? 'Researcher'}
              </Text>
              <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.sm, marginTop: 4 }}>{user?.email}</Text>
              {profile?.username && <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.sm, marginTop: 2 }}>@{profile.username}</Text>}
              {profile?.occupation && <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, marginTop: 3 }}>{profile.occupation}</Text>}
              <TouchableOpacity onPress={openEditModal}
                style={{ marginTop: SPACING.md, backgroundColor: `${COLORS.primary}15`, borderRadius: RADIUS.full, paddingHorizontal: 20, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: `${COLORS.primary}30` }}
                activeOpacity={0.75}>
                <Ionicons name="pencil-outline" size={14} color={COLORS.primary} />
                <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.sm, fontWeight: '600' }}>Edit Profile</Text>
              </TouchableOpacity>
            </Animated.View>

            <Animated.View entering={FadeInDown.duration(400).delay(50)}>
              <StatsCard stats={safeStats} />
            </Animated.View>

            <Animated.View entering={FadeInDown.duration(400).delay(70)}>
              <SectionHeader label="Social &amp; Discovery" />
              <SocialDiscoveryCard userId={user?.id ?? ''} username={profile?.username ?? null} isPublic={isPublic} followerCount={followerCount} followingCount={followingCount} onTogglePublic={handleTogglePublic} isTogglingPublic={isTogglingPublic} />
            </Animated.View>

            <Animated.View entering={FadeInDown.duration(400).delay(80)}>
              <SectionHeader label="Your Collections" />
              <CollectionsPreviewCard onManage={() => setCollectionsVisible(true)} />
            </Animated.View>

            <Animated.View entering={FadeInDown.duration(400).delay(90)}>
              <SectionHeader label="Refer &amp; Earn" />
              <ReferralCard />
            </Animated.View>

            <Animated.View entering={FadeInDown.duration(400).delay(110)}>
              <SectionHeader label="Credits &amp; Billing" />
              <CreditsCard />
              <SettingsRow icon="receipt-outline" label="Transaction History" sublabel="View all credit purchases and usage" onPress={() => router.push('/(app)/transaction-history' as any)} />
              <SettingsRow icon="flash-outline" label="Buy Credits" sublabel="Top up your balance with a credit pack" iconColor={COLORS.warning} iconBg={`${COLORS.warning}15`} onPress={() => router.push('/(app)/credits-store' as any)} />
            </Animated.View>

            <Animated.View entering={FadeInDown.duration(400).delay(140)}>
              <SectionHeader label="Preferences" />
              <SettingsRow
                icon="notifications-outline" label="Push Notifications"
                sublabel={notificationsEnabled ? 'You will be notified when reports are ready' : 'Get notified when your research is complete'}
                iconColor={notificationsEnabled ? COLORS.success : COLORS.primary}
                iconBg={notificationsEnabled ? `${COLORS.success}15` : `${COLORS.primary}15`}
                onPress={() => handleNotifSwitch(!notificationsEnabled)}
                right={<Switch value={notificationsEnabled} onValueChange={handleNotifSwitch} disabled={notifLoading} trackColor={{ false: COLORS.border, true: `${COLORS.primary}80` }} thumbColor={notificationsEnabled ? COLORS.primary : COLORS.textMuted} />}
              />
            </Animated.View>

            <Animated.View entering={FadeInDown.duration(400).delay(170)}>
              <SectionHeader label="Offline &amp; Cache" />
              <SettingsRow
                icon="cloud-offline-outline" label="Manage Offline Cache"
                sublabel={cacheSublabel}
                iconColor={cachePercentColor} iconBg={`${cachePercentColor}15`}
                accentBorder={(cacheSummary?.percentUsed ?? 0) > 65 ? `${cachePercentColor}35` : COLORS.border}
                onPress={() => setCacheModalVisible(true)}
                right={
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    {cacheSummary && cacheSummary.totalItems > 0 && (
                      <View style={{ width: 50, height: 6, backgroundColor: COLORS.backgroundElevated, borderRadius: 3, overflow: 'hidden' }}>
                        <View style={{ width: `${Math.min(100, cacheSummary.percentUsed)}%` as any, height: '100%', backgroundColor: cachePercentColor, borderRadius: 3 }} />
                      </View>
                    )}
                    <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
                  </View>
                }
              />
              <SettingsRow
                icon="cloud-download-outline" label="Auto-Cache Content"
                sublabel="Automatically save all content for offline access"
                iconColor={cacheSummary?.autoCache ? COLORS.success : COLORS.textMuted}
                iconBg={cacheSummary?.autoCache ? `${COLORS.success}15` : COLORS.border}
                right={<Switch value={cacheSummary?.autoCache ?? true} onValueChange={handleAutoCacheToggle} trackColor={{ false: COLORS.border, true: `${COLORS.success}80` }} thumbColor={cacheSummary?.autoCache ? COLORS.success : COLORS.textMuted} />}
              />
              {cacheSummary && cacheSummary.totalItems > 0 && (
                <SettingsRow
                  icon="trash-outline" label="Clear All Cache"
                  sublabel={`Free up ${formatBytes(cacheSummary.totalBytes)}`}
                  iconColor={COLORS.error} iconBg={`${COLORS.error}15`}
                  accentBorder={`${COLORS.error}20`}
                  onPress={handleQuickClearCache}
                  right={<Text style={{ color: COLORS.error, fontSize: FONTS.sizes.xs, fontWeight: '600' }}>Clear</Text>}
                />
              )}
              <View style={{ backgroundColor: `${COLORS.info}08`, borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.sm, borderWidth: 1, borderColor: `${COLORS.info}20`, flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                <Ionicons name="information-circle-outline" size={17} color={COLORS.info} style={{ marginTop: 1, flexShrink: 0 }} />
                <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, lineHeight: 18, flex: 1 }}>
                  When offline, DeepDive AI shows all cached content — reports, podcasts, debates, papers, slides and voice debates.{'\n\n'}
                  Workspace &amp; Teams features require an internet connection.
                </Text>
              </View>
            </Animated.View>

            <Animated.View entering={FadeInDown.duration(400).delay(220)}>
              <TouchableOpacity onPress={handleSignOut}
                style={{ backgroundColor: `${COLORS.error}10`, borderRadius: RADIUS.lg, padding: SPACING.md, marginTop: SPACING.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: `${COLORS.error}25` }}
                activeOpacity={0.75}>
                <Ionicons name="log-out-outline" size={20} color={COLORS.error} />
                <Text style={{ color: COLORS.error, fontSize: FONTS.sizes.base, fontWeight: '700' }}>Sign Out</Text>
              </TouchableOpacity>
            </Animated.View>

            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, textAlign: 'center', marginTop: SPACING.xl }}>
              DeepDive AI · v1.45.0
            </Text>
          </ScrollView>
        </SafeAreaView>
      </LinearGradient>

      {/* ── Edit Profile Modal — Part 50.10 (issue 6): COMPACT, no-scroll, Android-safe ──
          Redesigned so the avatar + 3 inputs + Save button all fit on screen
          WITHOUT an inner ScrollView. Avatar shrunk to 68px, vertical spacing
          tightened, and the sheet's bottom padding uses the safe-area inset so
          the Save button clears the Android nav/gesture bar. KeyboardAvoidingView
          keeps the inputs above the keyboard on both platforms. */}
      <Modal visible={editModalVisible} animationType="slide" transparent statusBarTranslucent onRequestClose={() => setEditModalVisible(false)}>
        {/* FIX (issue 3): tapping the dimmed backdrop dismisses the keyboard first
            (if open) and otherwise closes the sheet. */}
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(10,10,26,0.75)', justifyContent: 'flex-end' }}
          onPress={() => setEditModalVisible(false)}
        >
          {/* FIX (issue 5): a bottom-pinned sheet must use behavior="padding" on
              BOTH platforms. behavior="height" only shrinks the KAV's own height
              and does NOT lift a sheet that is pinned to the bottom, so on Android
              the keyboard covered the Bio/Occupation inputs and you couldn't see
              what you were typing. With "padding", the KAV adds bottom padding
              equal to the keyboard height, pushing the ENTIRE sheet up above the
              keyboard so every field (and the cursor) stays visible. */}
          <KeyboardAvoidingView behavior="padding" keyboardVerticalOffset={0}>
            {/* FIX (issue 3): tapping anywhere on the sheet body (outside an input
                or button) dismisses the keyboard. stopPropagation keeps the
                backdrop's close handler from firing when you tap the sheet itself.
                Inputs and buttons are children, so their own presses take priority
                and still work normally. */}
            <Pressable
              onPress={() => Keyboard.dismiss()}
              style={{
                backgroundColor: COLORS.backgroundCard,
                borderTopLeftRadius: 30, borderTopRightRadius: 30,
                paddingHorizontal: SPACING.xl,
                paddingTop: SPACING.lg,
                // FIX (issue 6): safe-area bottom inset so Save clears the nav bar.
                paddingBottom: Math.max(insets.bottom, SPACING.md) + SPACING.md,
                borderTopWidth: 1, borderTopColor: COLORS.border,
              }}
            >
              {/* Header */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.md }}>
                <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.lg, fontWeight: '800' }}>Edit Profile</Text>
                <TouchableOpacity onPress={() => setEditModalVisible(false)} hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
                  style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: COLORS.backgroundElevated, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border }}>
                  <Ionicons name="close" size={18} color={COLORS.textSecondary} />
                </TouchableOpacity>
              </View>

              {/* Avatar — compact 68px, inline with a hint to the right */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.md, marginBottom: SPACING.md }}>
                <TouchableOpacity onPress={pickImage} activeOpacity={0.85}>
                  {editAvatarUri ? (
                    <View>
                      <Image source={{ uri: editAvatarUri }} style={{ width: 68, height: 68, borderRadius: 34, borderWidth: 2, borderColor: COLORS.primary }} />
                      <View style={{ position: 'absolute', bottom: -2, right: -2, backgroundColor: COLORS.primary, borderRadius: 14, padding: 5, borderWidth: 2, borderColor: COLORS.backgroundCard }}>
                        <Ionicons name="camera" size={12} color="#FFF" />
                      </View>
                    </View>
                  ) : (
                    <View>
                      <Avatar url={profile?.avatar_url} name={profile?.full_name} size={68} />
                      <View style={{ position: 'absolute', bottom: -2, right: -2, backgroundColor: COLORS.primary, borderRadius: 14, padding: 5, borderWidth: 2, borderColor: COLORS.backgroundCard }}>
                        <Ionicons name="camera" size={12} color="#FFF" />
                      </View>
                    </View>
                  )}
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '700' }}>Profile Photo</Text>
                  <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 2 }}>Tap the photo to change it</Text>
                </View>
              </View>

              {/* Inputs — no inner ScrollView; everything fits */}
              <AnimatedInput label="Full Name" value={editName} onChangeText={setEditName} leftIcon="person-outline" />
              <AnimatedInput label="Occupation" value={editOccupation} onChangeText={setEditOccupation} leftIcon="briefcase-outline" />
              <AnimatedInput label="Bio" value={editBio} onChangeText={setEditBio} leftIcon="document-text-outline" multiline numberOfLines={3} />

              <GradientButton title="Save Changes" onPress={handleSaveProfile} loading={updating || uploading} style={{ marginTop: SPACING.sm }} />
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      {/* ── Cache Manager — FIX: passes onOpenSelectiveCache, no longer nests SelectiveCacheSheet inside */}
      <CacheManagerModal
        visible={cacheModalVisible}
        onClose={handleCacheModalClose}
        onOpenSelectiveCache={() => {
          // Close cache manager first, then open the sheet after it fully dismisses
          setCacheModalVisible(false);
          setTimeout(() => setSelectiveVisible(true), 350);
        }}
      />

      {/* ── Selective Cache Sheet — sibling of CacheManagerModal, never nested ── */}
      {/* FIX 1: onDone reopens the cache manager so user stays in cache flow,
          not kicked back to the profile tab scroll position. */}
      <SelectiveCacheSheet
        visible={selectiveVisible}
        onClose={() => {
          setSelectiveVisible(false);
          // Reopen cache manager so user returns to it after closing the sheet
          setTimeout(() => setCacheModalVisible(true), 300);
        }}
        onDone={() => {
          setSelectiveVisible(false);
          loadCacheStats();
          // Reopen cache manager after save so user sees updated stats
          setTimeout(() => setCacheModalVisible(true), 300);
        }}
      />

      {/* Collections Sheet */}
      <ManageCollectionsSheet visible={collectionsVisible} onClose={() => setCollectionsVisible(false)} />
    </View>
  );
}