// app/(app)/(tabs)/profile.tsx
// Part 22 — UPDATED: Full cache management section added.
//
// New in Part 22:
//   • Offline Cache row now shows real byte usage (from cacheStorage)
//   • Tapping the row opens the full CacheManagerModal
//   • Auto-Cache toggle visible inline on the profile settings row
//   • Cache stats (items count + MB used) shown as sublabel
//   • "Manage Cache" button opens CacheManagerModal directly

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
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import * as ImagePicker from 'expo-image-picker';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth }              from '../../../src/context/AuthContext';
import { Avatar }               from '../../../src/components/common/Avatar';
import { AnimatedInput }        from '../../../src/components/common/AnimatedInput';
import { GradientButton }       from '../../../src/components/common/GradientButton';
import { LoadingOverlay }       from '../../../src/components/common/LoadingOverlay';
import { StatsCard }            from '../../../src/components/profile/StatsCard';
import { CacheManagerModal }    from '../../../src/components/profile/CacheManagerModal';
import { useStats }             from '../../../src/hooks/useStats';
import { useProfile }           from '../../../src/hooks/useProfile';
import {
  getNotificationsEnabled,
  enableNotifications,
  disableNotifications,
  getPermissionStatus,
} from '../../../src/lib/notifications';
import {
  getCacheStats,
  formatBytes,
  clearAllCache,
} from '../../../src/lib/cacheStorage';
import {
  getSettings as getCacheSettings,
  setAutoCache,
} from '../../../src/lib/cacheSettings';
import { COLORS, FONTS, SPACING, RADIUS } from '../../../src/constants/theme';
import { UserStats } from '../../../src/types';

// ─── Default stats ─────────────────────────────────────────────────────────────

const DEFAULT_STATS: UserStats = {
  totalReports:            0,
  completedReports:        0,
  totalSources:            0,
  avgReliability:          0,
  favoriteTopic:           null,
  reportsThisMonth:        0,
  hoursResearched:         0,
  totalAssistantMessages:  0,
  reportsWithEmbeddings:   0,
  academicPapersGenerated: 0,
  totalPodcasts:           0,
  totalDebates:            0,
};

// ─── Open device settings ─────────────────────────────────────────────────────

async function openAppSettings(): Promise<void> {
  try {
    if (Platform.OS === 'ios') {
      await Linking.openURL('app-settings:');
    } else {
      await Linking.openSettings();
    }
  } catch {
    Alert.alert(
      'Cannot Open Settings',
      'Please open your device Settings and enable notifications for DeepDive AI manually.',
    );
  }
}

// ─── Settings row ─────────────────────────────────────────────────────────────

function SettingsRow({
  icon,
  label,
  sublabel,
  onPress,
  right,
  iconColor,
  iconBg,
  accentBorder,
}: {
  icon:          string;
  label:         string;
  sublabel?:     string;
  onPress?:      () => void;
  right?:        React.ReactNode;
  iconColor?:    string;
  iconBg?:       string;
  accentBorder?: string;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
      style={{
        flexDirection:  'row',
        alignItems:     'center',
        padding:        SPACING.md,
        backgroundColor: COLORS.backgroundCard,
        borderRadius:   RADIUS.lg,
        marginBottom:   SPACING.sm,
        borderWidth:    1,
        borderColor:    accentBorder ?? COLORS.border,
      }}
    >
      <View style={{
        width: 38, height: 38, borderRadius: 11,
        backgroundColor: iconBg ?? `${COLORS.primary}15`,
        alignItems: 'center', justifyContent: 'center',
        marginRight: SPACING.md,
      }}>
        <Ionicons name={icon as any} size={19} color={iconColor ?? COLORS.primary} />
      </View>

      <View style={{ flex: 1 }}>
        <Text style={{
          color:      COLORS.textPrimary,
          fontSize:   FONTS.sizes.base,
          fontWeight: '600',
        }}>
          {label}
        </Text>
        {sublabel ? (
          <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 2 }}>
            {sublabel}
          </Text>
        ) : null}
      </View>

      {right !== undefined
        ? right
        : onPress
        ? <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
        : null}
    </TouchableOpacity>
  );
}

// ─── Cache stats row display ──────────────────────────────────────────────────

interface CacheSummary {
  totalItems:  number;
  totalBytes:  number;
  limitBytes:  number;
  percentUsed: number;
  autoCache:   boolean;
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const { user, profile, signOut, refreshProfile } = useAuth();

  const { stats, loading: statsLoading } = useStats();
  const { updateProfile, uploadAvatar, updating, uploading } = useProfile();

  // Notification toggle
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [notifLoading, setNotifLoading]                  = useState(false);

  // Cache state (Part 22)
  const [cacheSummary,      setCacheSummary]      = useState<CacheSummary | null>(null);
  const [cacheModalVisible, setCacheModalVisible] = useState(false);

  // Edit modal state
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editName,         setEditName]         = useState(profile?.full_name || '');
  const [editBio,          setEditBio]          = useState(profile?.bio || '');
  const [editOccupation,   setEditOccupation]   = useState(profile?.occupation || '');
  const [editAvatarUri,    setEditAvatarUri]     = useState<string | null>(null);

  // ── Load notifications state ───────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const [storedEnabled, osStatus] = await Promise.all([
          getNotificationsEnabled(),
          getPermissionStatus(),
        ]);
        setNotificationsEnabled(storedEnabled && osStatus === 'granted');
      } catch {}
    })();
  }, []);

  // ── Load cache stats (Part 22) ────────────────────────────────────────────
  const loadCacheStats = useCallback(async () => {
    try {
      const [stats, settings] = await Promise.all([
        getCacheStats(),
        getCacheSettings(),
      ]);
      setCacheSummary({
        totalItems:  stats.totalItems,
        totalBytes:  stats.totalBytes,
        limitBytes:  stats.limitBytes,
        percentUsed: stats.percentUsed,
        autoCache:   settings.autoCache,
      });
    } catch {
      setCacheSummary({ totalItems: 0, totalBytes: 0, limitBytes: 100 * 1024 * 1024, percentUsed: 0, autoCache: true });
    }
  }, []);

  useEffect(() => {
    loadCacheStats();
  }, [loadCacheStats]);

  // Reload cache stats when modal closes
  const handleCacheModalClose = useCallback(() => {
    setCacheModalVisible(false);
    loadCacheStats();
  }, [loadCacheStats]);

  // ── Auto-cache inline toggle ──────────────────────────────────────────────
  const handleAutoCacheToggle = useCallback(async (value: boolean) => {
    await setAutoCache(value);
    setCacheSummary(prev => prev ? { ...prev, autoCache: value } : null);
  }, []);

  // ── Quick clear cache ─────────────────────────────────────────────────────
  const handleQuickClearCache = useCallback(() => {
    if (!cacheSummary || cacheSummary.totalItems === 0) {
      Alert.alert('Cache Empty', 'There is nothing to clear.');
      return;
    }
    Alert.alert(
      'Clear Offline Cache',
      `Remove all ${cacheSummary.totalItems} cached items (${formatBytes(cacheSummary.totalBytes)}) from this device?\n\nYour data remains safely in the cloud.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear Cache',
          style: 'destructive',
          onPress: async () => {
            await clearAllCache();
            await loadCacheStats();
            Alert.alert('Done', 'Offline cache cleared.');
          },
        },
      ],
    );
  }, [cacheSummary, loadCacheStats]);

  // ── Edit modal helpers ─────────────────────────────────────────────────────

  const openEditModal = () => {
    setEditName(profile?.full_name || '');
    setEditBio(profile?.bio || '');
    setEditOccupation(profile?.occupation || '');
    setEditAvatarUri(null);
    setEditModalVisible(true);
  };

  const pickImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Please allow access to your photos.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled) {
      setEditAvatarUri(result.assets[0].uri);
    }
  };

  const handleSaveProfile = async () => {
    if (!user) return;
    let avatarUrl = profile?.avatar_url;

    if (editAvatarUri) {
      const { url, error } = await uploadAvatar(user.id, editAvatarUri);
      if (error) { Alert.alert('Upload Error', error); return; }
      avatarUrl = url;
    }

    const { error } = await updateProfile(user.id, {
      full_name:  editName.trim() || null,
      bio:        editBio.trim() || null,
      occupation: editOccupation.trim() || null,
      avatar_url: avatarUrl,
    });

    if (error) { Alert.alert('Error', error); return; }
    await refreshProfile();
    setEditModalVisible(false);
    setEditAvatarUri(null);
  };

  // ── Notification toggle ────────────────────────────────────────────────────

  const handleNotifSwitch = async (value: boolean) => {
    if (notifLoading || !user) return;
    setNotifLoading(true);
    try {
      if (value) {
        const result = await enableNotifications(user.id);
        if (result === 'enabled') {
          setNotificationsEnabled(true);
        } else {
          Alert.alert(
            'Enable Notifications',
            'Notifications are blocked. Tap "Open Settings" to allow them.',
            [
              { text: 'Not Now', style: 'cancel' },
              { text: 'Open Settings', onPress: async () => { await openAppSettings(); setNotificationsEnabled(true); } },
            ],
          );
        }
      } else {
        await disableNotifications();
        setNotificationsEnabled(false);
      }
    } catch (err) {
      console.warn('[Profile] Notification toggle error:', err);
    } finally {
      setNotifLoading(false);
    }
  };

  // ── Sign out ───────────────────────────────────────────────────────────────

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: () => signOut() },
    ]);
  };

  const safeStats: UserStats = { ...DEFAULT_STATS, ...stats };

  // Build cache sublabel
  const cacheSublabel = cacheSummary
    ? cacheSummary.totalItems === 0
      ? 'No items cached · Auto-cache is ' + (cacheSummary.autoCache ? 'ON' : 'OFF')
      : `${cacheSummary.totalItems} items · ${formatBytes(cacheSummary.totalBytes)} / ${formatBytes(cacheSummary.limitBytes)} (${Math.round(cacheSummary.percentUsed)}%)`
    : 'Loading…';

  const cachePercentColor =
    (cacheSummary?.percentUsed ?? 0) > 85 ? COLORS.error :
    (cacheSummary?.percentUsed ?? 0) > 65 ? COLORS.warning :
    COLORS.info;

  return (
    <LinearGradient colors={[COLORS.background, COLORS.backgroundCard]} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }}>
        <LoadingOverlay visible={updating || uploading} message="Saving..." />

        <ScrollView
          contentContainerStyle={{ padding: SPACING.xl, paddingBottom: 110 }}
          showsVerticalScrollIndicator={false}
        >

          {/* ── Profile header ───────────────────────────────────────── */}
          <Animated.View
            entering={FadeIn.duration(600)}
            style={{ alignItems: 'center', paddingTop: SPACING.lg, paddingBottom: SPACING.xl }}
          >
            <View style={{ marginBottom: SPACING.md }}>
              <Avatar url={profile?.avatar_url} name={profile?.full_name} size={88} />
            </View>

            <Text style={{
              color: COLORS.textPrimary, fontSize: FONTS.sizes.xl,
              fontWeight: '800', textAlign: 'center',
            }}>
              {profile?.full_name ?? 'Researcher'}
            </Text>

            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.sm, marginTop: 4 }}>
              {user?.email}
            </Text>

            <TouchableOpacity
              onPress={openEditModal}
              style={{
                marginTop:        SPACING.md,
                backgroundColor:  `${COLORS.primary}15`,
                borderRadius:     RADIUS.full,
                paddingHorizontal: 20,
                paddingVertical:  8,
                flexDirection:    'row',
                alignItems:       'center',
                gap:              6,
                borderWidth:      1,
                borderColor:      `${COLORS.primary}30`,
              }}
              activeOpacity={0.75}
            >
              <Ionicons name="pencil-outline" size={14} color={COLORS.primary} />
              <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.sm, fontWeight: '600' }}>
                Edit Profile
              </Text>
            </TouchableOpacity>
          </Animated.View>

          {/* ── Stats card ───────────────────────────────────────────── */}
          <Animated.View entering={FadeInDown.duration(400).delay(50)}>
            <StatsCard stats={safeStats} />
          </Animated.View>

          {/* ── Preferences section ──────────────────────────────────── */}
          <Animated.View entering={FadeInDown.duration(400).delay(100)}>
            <Text style={{
              color:         COLORS.textSecondary,
              fontSize:      FONTS.sizes.sm,
              fontWeight:    '600',
              letterSpacing: 0.8,
              textTransform: 'uppercase',
              marginBottom:  SPACING.sm,
              marginTop:     SPACING.lg,
            }}>
              Preferences
            </Text>

            {/* Push Notifications */}
            <SettingsRow
              icon="notifications-outline"
              label="Push Notifications"
              sublabel={
                notificationsEnabled
                  ? 'You will be notified when reports are ready'
                  : 'Get notified when your research is complete'
              }
              iconColor={notificationsEnabled ? COLORS.success : COLORS.primary}
              iconBg={notificationsEnabled ? `${COLORS.success}15` : `${COLORS.primary}15`}
              onPress={() => handleNotifSwitch(!notificationsEnabled)}
              right={
                <Switch
                  value={notificationsEnabled}
                  onValueChange={handleNotifSwitch}
                  disabled={notifLoading}
                  trackColor={{ false: COLORS.border, true: `${COLORS.primary}80` }}
                  thumbColor={notificationsEnabled ? COLORS.primary : COLORS.textMuted}
                />
              }
            />
          </Animated.View>

          {/* ── Offline & Cache section (Part 22) ─────────────────────── */}
          <Animated.View entering={FadeInDown.duration(400).delay(130)}>
            <Text style={{
              color:         COLORS.textSecondary,
              fontSize:      FONTS.sizes.sm,
              fontWeight:    '600',
              letterSpacing: 0.8,
              textTransform: 'uppercase',
              marginBottom:  SPACING.sm,
              marginTop:     SPACING.lg,
            }}>
              Offline &amp; Cache
            </Text>

            {/* Manage Cache → opens full modal */}
            <SettingsRow
              icon="cloud-offline-outline"
              label="Manage Offline Cache"
              sublabel={cacheSublabel}
              iconColor={cachePercentColor}
              iconBg={`${cachePercentColor}15`}
              accentBorder={
                (cacheSummary?.percentUsed ?? 0) > 65
                  ? `${cachePercentColor}35`
                  : COLORS.border
              }
              onPress={() => setCacheModalVisible(true)}
              right={
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  {/* Usage bar */}
                  {cacheSummary && cacheSummary.totalItems > 0 && (
                    <View style={{
                      width:           50,
                      height:          6,
                      backgroundColor: COLORS.backgroundElevated,
                      borderRadius:    3,
                      overflow:        'hidden',
                    }}>
                      <View style={{
                        width:           `${Math.min(100, cacheSummary.percentUsed)}%`,
                        height:          '100%',
                        backgroundColor: cachePercentColor,
                        borderRadius:    3,
                      }} />
                    </View>
                  )}
                  <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
                </View>
              }
            />

            {/* Auto-Cache inline toggle */}
            <SettingsRow
              icon="cloud-download-outline"
              label="Auto-Cache Content"
              sublabel="Automatically save all content for offline access"
              iconColor={cacheSummary?.autoCache ? COLORS.success : COLORS.textMuted}
              iconBg={cacheSummary?.autoCache ? `${COLORS.success}15` : `${COLORS.border}`}
              right={
                <Switch
                  value={cacheSummary?.autoCache ?? true}
                  onValueChange={handleAutoCacheToggle}
                  trackColor={{ false: COLORS.border, true: `${COLORS.success}80` }}
                  thumbColor={cacheSummary?.autoCache ? COLORS.success : COLORS.textMuted}
                />
              }
            />

            {/* Quick-clear row — only show when there's something to clear */}
            {cacheSummary && cacheSummary.totalItems > 0 && (
              <SettingsRow
                icon="trash-outline"
                label="Clear All Cache"
                sublabel={`Free up ${formatBytes(cacheSummary.totalBytes)}`}
                iconColor={COLORS.error}
                iconBg={`${COLORS.error}15`}
                accentBorder={`${COLORS.error}20`}
                onPress={handleQuickClearCache}
                right={
                  <Text style={{ color: COLORS.error, fontSize: FONTS.sizes.xs, fontWeight: '600' }}>
                    Clear
                  </Text>
                }
              />
            )}

            {/* Offline mode info card */}
            <View style={{
              backgroundColor: `${COLORS.info}08`,
              borderRadius:    RADIUS.lg,
              padding:         SPACING.md,
              marginBottom:    SPACING.sm,
              borderWidth:     1,
              borderColor:     `${COLORS.info}20`,
              flexDirection:   'row',
              alignItems:      'flex-start',
              gap:             10,
            }}>
              <Ionicons name="information-circle-outline" size={17} color={COLORS.info} style={{ marginTop: 1, flexShrink: 0 }} />
              <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, lineHeight: 18, flex: 1 }}>
                When your device goes offline, DeepDive AI automatically shows all your cached content — reports, podcasts, debates, papers and slides — so you can keep reading.{'\n\n'}
                Workspace &amp; Teams features always require an internet connection and cannot be cached.
              </Text>
            </View>
          </Animated.View>

          {/* ── Sign out ─────────────────────────────────────────────── */}
          <Animated.View entering={FadeInDown.duration(400).delay(180)}>
            <TouchableOpacity
              onPress={handleSignOut}
              style={{
                backgroundColor: `${COLORS.error}10`,
                borderRadius:    RADIUS.lg,
                padding:         SPACING.md,
                marginTop:       SPACING.lg,
                flexDirection:   'row',
                alignItems:      'center',
                justifyContent:  'center',
                gap:             8,
                borderWidth:     1,
                borderColor:     `${COLORS.error}25`,
              }}
              activeOpacity={0.75}
            >
              <Ionicons name="log-out-outline" size={20} color={COLORS.error} />
              <Text style={{ color: COLORS.error, fontSize: FONTS.sizes.base, fontWeight: '700' }}>
                Sign Out
              </Text>
            </TouchableOpacity>
          </Animated.View>

          <Text style={{
            color:     COLORS.textMuted,
            fontSize:  FONTS.sizes.xs,
            textAlign: 'center',
            marginTop: SPACING.xl,
          }}>
            DeepDive AI · v1.22.0
          </Text>

        </ScrollView>

        {/* ── Edit Profile Modal ──────────────────────────────────────── */}
        <Modal
          visible={editModalVisible}
          animationType="slide"
          transparent
          onRequestClose={() => setEditModalVisible(false)}
        >
          <BlurView
            intensity={20}
            style={{
              flex:            1,
              backgroundColor: 'rgba(10,10,26,0.7)',
              justifyContent:  'flex-end',
            }}
          >
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
              <View style={{
                backgroundColor:    COLORS.backgroundCard,
                borderTopLeftRadius: 30,
                borderTopRightRadius: 30,
                padding:             SPACING.xl,
                borderTopWidth:      1,
                borderTopColor:      COLORS.border,
                maxHeight:           '90%',
              }}>
                {/* Modal header */}
                <View style={{
                  flexDirection:   'row',
                  justifyContent:  'space-between',
                  alignItems:      'center',
                  marginBottom:    SPACING.xl,
                }}>
                  <Text style={{
                    color:      COLORS.textPrimary,
                    fontSize:   FONTS.sizes.xl,
                    fontWeight: '800',
                  }}>
                    Edit Profile
                  </Text>
                  <TouchableOpacity onPress={() => setEditModalVisible(false)}>
                    <Ionicons name="close" size={24} color={COLORS.textSecondary} />
                  </TouchableOpacity>
                </View>

                <ScrollView
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                >
                  {/* Avatar change */}
                  <View style={{ alignItems: 'center', marginBottom: SPACING.xl }}>
                    <TouchableOpacity onPress={pickImage}>
                      {editAvatarUri ? (
                        <View>
                          <Image
                            source={{ uri: editAvatarUri }}
                            style={{
                              width: 90, height: 90, borderRadius: 45,
                              borderWidth: 2, borderColor: COLORS.primary,
                            }}
                          />
                          <View style={{
                            position:        'absolute',
                            bottom:          0, right: 0,
                            backgroundColor: COLORS.primary,
                            borderRadius:    16, padding: 6,
                          }}>
                            <Ionicons name="camera" size={14} color="#FFF" />
                          </View>
                        </View>
                      ) : (
                        <View>
                          <Avatar url={profile?.avatar_url} name={profile?.full_name} size={90} />
                          <View style={{
                            position:        'absolute',
                            bottom:          0, right: 0,
                            backgroundColor: COLORS.primary,
                            borderRadius:    16, padding: 6,
                          }}>
                            <Ionicons name="camera" size={14} color="#FFF" />
                          </View>
                        </View>
                      )}
                    </TouchableOpacity>
                    <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 8 }}>
                      Tap to change photo
                    </Text>
                  </View>

                  <AnimatedInput
                    label="Full Name"
                    value={editName}
                    onChangeText={setEditName}
                    leftIcon="person-outline"
                  />
                  <AnimatedInput
                    label="Occupation"
                    value={editOccupation}
                    onChangeText={setEditOccupation}
                    leftIcon="briefcase-outline"
                  />
                  <AnimatedInput
                    label="Bio"
                    value={editBio}
                    onChangeText={setEditBio}
                    leftIcon="document-text-outline"
                    multiline
                    numberOfLines={3}
                  />

                  <GradientButton
                    title="Save Changes"
                    onPress={handleSaveProfile}
                    loading={updating || uploading}
                    style={{ marginTop: SPACING.md }}
                  />
                </ScrollView>
              </View>
            </KeyboardAvoidingView>
          </BlurView>
        </Modal>

        {/* ── Cache Manager Modal (Part 22) ───────────────────────────── */}
        <CacheManagerModal
          visible={cacheModalVisible}
          onClose={handleCacheModalClose}
        />

      </SafeAreaView>
    </LinearGradient>
  );
}