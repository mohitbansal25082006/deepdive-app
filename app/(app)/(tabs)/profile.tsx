// app/(app)/(tabs)/profile.tsx
// Part 6 — Fixed: DEFAULT_STATS now includes totalAssistantMessages &
//          reportsWithEmbeddings (Part 6 fields). Previously missing fields
//          caused a type mismatch that could crash StatsCard on profile mount.
//
// Part 3 — Advanced notification toggle:
//   • Reads persisted enabled state from AsyncStorage on mount (survives app kills).
//   • Turning ON:  requests OS permission → if already granted, enables immediately
//                  (no Settings prompt). Only opens Settings if permission is denied.
//   • Turning OFF: cancels scheduled notifications, clears badge, persists disabled.
//   • The switch never flickers — state is committed only after async work completes.

import React, { useState, useEffect } from 'react';
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
import { useAuth }          from '../../../src/context/AuthContext';
import { Avatar }           from '../../../src/components/common/Avatar';
import { AnimatedInput }    from '../../../src/components/common/AnimatedInput';
import { GradientButton }   from '../../../src/components/common/GradientButton';
import { LoadingOverlay }   from '../../../src/components/common/LoadingOverlay';
import { StatsCard }        from '../../../src/components/profile/StatsCard';
import { useStats }         from '../../../src/hooks/useStats';
import { useProfile }       from '../../../src/hooks/useProfile';
import {
  getNotificationsEnabled,
  enableNotifications,
  disableNotifications,
  getPermissionStatus,
} from '../../../src/lib/notifications';
import { getCacheSize, clearAllCache } from '../../../src/lib/offlineCache';
import { COLORS, FONTS, SPACING, RADIUS } from '../../../src/constants/theme';
import { UserStats } from '../../../src/types';

// ─── Default stats ─────────────────────────────────────────────────────────────
// Must include ALL fields from UserStats (including Part 6 additions) to prevent
// a type mismatch from crashing StatsCard when useStats hasn't resolved yet.

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
  totalDebates:            0,   // ← Part 9 addition
};

// ─── Open device app-settings (only called when OS has denied permission) ─────

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
}: {
  icon: string;
  label: string;
  sublabel?: string;
  onPress?: () => void;
  right?: React.ReactNode;
  iconColor?: string;
  iconBg?: string;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        padding: SPACING.md,
        backgroundColor: COLORS.backgroundCard,
        borderRadius: RADIUS.lg,
        marginBottom: SPACING.sm,
        borderWidth: 1,
        borderColor: COLORS.border,
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
          color: COLORS.textPrimary,
          fontSize: FONTS.sizes.base,
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

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const { user, profile, signOut, refreshProfile } = useAuth();

  // useStats now has full error handling — never throws, always returns safe defaults
  const { stats, loading: statsLoading } = useStats();

  const { updateProfile, uploadAvatar, updating, uploading } = useProfile();

  // Notification toggle
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [notifLoading, setNotifLoading]                  = useState(false);

  const [cacheSize, setCacheSize] = useState<number | null>(null);

  // Edit modal state
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editName, setEditName]                 = useState(profile?.full_name || '');
  const [editBio, setEditBio]                   = useState(profile?.bio || '');
  const [editOccupation, setEditOccupation]     = useState(profile?.occupation || '');
  const [editAvatarUri, setEditAvatarUri]       = useState<string | null>(null);

  // ── On mount: read persisted notification state ────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const [storedEnabled, osStatus] = await Promise.all([
          getNotificationsEnabled(),
          getPermissionStatus(),
        ]);
        const realEnabled = storedEnabled && osStatus === 'granted';
        setNotificationsEnabled(realEnabled);
      } catch {
        // Non-fatal — leave switch OFF
      }
    })();
  }, []);

  // ── Load cache size on mount ───────────────────────────────────────────────
  useEffect(() => {
    getCacheSize().then(setCacheSize).catch(() => setCacheSize(0));
  }, []);

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
      if (error) {
        Alert.alert('Upload Error', error);
        return;
      }
      avatarUrl = url;
    }

    const { error } = await updateProfile(user.id, {
      full_name:  editName.trim() || null,
      bio:        editBio.trim() || null,
      occupation: editOccupation.trim() || null,
      avatar_url: avatarUrl,
    });

    if (error) {
      Alert.alert('Error', error);
      return;
    }

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
            'Notifications are blocked for DeepDive AI. Tap "Open Settings" to allow them — you only need to do this once.',
            [
              { text: 'Not Now', style: 'cancel' },
              {
                text: 'Open Settings',
                onPress: async () => {
                  await openAppSettings();
                  setNotificationsEnabled(true);
                },
              },
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

  const handleNotifRowPress = () => handleNotifSwitch(!notificationsEnabled);

  // ── Cache clear ────────────────────────────────────────────────────────────

  const handleClearCache = () => {
    const sizeLabel =
      cacheSize !== null ? `${(cacheSize / 1024).toFixed(1)} KB` : 'unknown size';

    Alert.alert(
      'Clear Offline Cache',
      `This will remove all ${sizeLabel} of cached reports from this device.\n\nYour reports will remain in the cloud.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear Cache',
          style: 'destructive',
          onPress: async () => {
            await clearAllCache();
            setCacheSize(0);
            Alert.alert('Done', 'Offline cache cleared.');
          },
        },
      ],
    );
  };

  // ── Sign out ───────────────────────────────────────────────────────────────

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: () => signOut() },
    ]);
  };

  // Merge live stats with DEFAULT_STATS so StatsCard always gets complete data
  // even while the RPC is still loading or if it returned a partial shape.
  const safeStats: UserStats = { ...DEFAULT_STATS, ...stats };

  // ── Render ─────────────────────────────────────────────────────────────────

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
              <Avatar
                url={profile?.avatar_url}
                name={profile?.full_name}
                size={88}
              />
            </View>

            <Text style={{
              color: COLORS.textPrimary,
              fontSize: FONTS.sizes.xl,
              fontWeight: '800',
              textAlign: 'center',
            }}>
              {profile?.full_name ?? 'Researcher'}
            </Text>

            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.sm, marginTop: 4 }}>
              {user?.email}
            </Text>

            <TouchableOpacity
              onPress={openEditModal}
              style={{
                marginTop: SPACING.md,
                backgroundColor: `${COLORS.primary}15`,
                borderRadius: RADIUS.full,
                paddingHorizontal: 20,
                paddingVertical: 8,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                borderWidth: 1,
                borderColor: `${COLORS.primary}30`,
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
            {/* safeStats is always a fully-populated UserStats — never null/partial */}
            <StatsCard stats={safeStats} />
          </Animated.View>

          {/* ── Preferences ──────────────────────────────────────────── */}
          <Animated.View entering={FadeInDown.duration(400).delay(100)}>
            <Text style={{
              color: COLORS.textSecondary,
              fontSize: FONTS.sizes.sm,
              fontWeight: '600',
              letterSpacing: 0.8,
              textTransform: 'uppercase',
              marginBottom: SPACING.sm,
              marginTop: SPACING.lg,
            }}>
              Preferences
            </Text>

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
              onPress={handleNotifRowPress}
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

            <SettingsRow
              icon="cloud-offline-outline"
              label="Offline Cache"
              sublabel={
                cacheSize !== null
                  ? `${(cacheSize / 1024).toFixed(1)} KB used`
                  : 'Calculating...'
              }
              iconColor={COLORS.info}
              iconBg={`${COLORS.info}15`}
              onPress={handleClearCache}
              right={
                <Text style={{ color: COLORS.error, fontSize: FONTS.sizes.xs, fontWeight: '600' }}>
                  Clear
                </Text>
              }
            />
          </Animated.View>

          {/* ── Sign out ─────────────────────────────────────────────── */}
          <Animated.View entering={FadeInDown.duration(400).delay(150)}>
            <TouchableOpacity
              onPress={handleSignOut}
              style={{
                backgroundColor: `${COLORS.error}10`,
                borderRadius: RADIUS.lg,
                padding: SPACING.md,
                marginTop: SPACING.lg,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                borderWidth: 1,
                borderColor: `${COLORS.error}25`,
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
            color: COLORS.textMuted,
            fontSize: FONTS.sizes.xs,
            textAlign: 'center',
            marginTop: SPACING.xl,
          }}>
            DeepDive AI · v1.1.0
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
              flex: 1,
              backgroundColor: 'rgba(10,10,26,0.7)',
              justifyContent: 'flex-end',
            }}
          >
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
              <View style={{
                backgroundColor: COLORS.backgroundCard,
                borderTopLeftRadius: 30,
                borderTopRightRadius: 30,
                padding: SPACING.xl,
                borderTopWidth: 1,
                borderTopColor: COLORS.border,
                maxHeight: '90%',
              }}>
                {/* Modal header */}
                <View style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: SPACING.xl,
                }}>
                  <Text style={{
                    color: COLORS.textPrimary,
                    fontSize: FONTS.sizes.xl,
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
                            position: 'absolute', bottom: 0, right: 0,
                            backgroundColor: COLORS.primary, borderRadius: 16, padding: 6,
                          }}>
                            <Ionicons name="camera" size={14} color="#FFF" />
                          </View>
                        </View>
                      ) : (
                        <View>
                          <Avatar url={profile?.avatar_url} name={profile?.full_name} size={90} />
                          <View style={{
                            position: 'absolute', bottom: 0, right: 0,
                            backgroundColor: COLORS.primary, borderRadius: 16, padding: 6,
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

      </SafeAreaView>
    </LinearGradient>
  );
}