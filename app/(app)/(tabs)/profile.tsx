// app/(app)/(tabs)/profile.tsx
// Based on the provided source file with these changes applied:
//   1. Avatar wrapped in View (no `style` prop on Avatar component)
//   2. stats ?? DEFAULT_STATS → StatsCard never receives null
//   3. StatsCard `loading` prop removed (doesn't exist on Props)
//   4. Notifications row tap + switch toggle → Linking.openSettings() (device settings)
//   5. Account section (Edit Profile row, Privacy & Data, Help & Support) removed
//   6. Edit Profile button in avatar area wired to inline edit modal (same as upside file)

import React, { useState } from 'react';
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
import { useAuth } from '../../../src/context/AuthContext';
import { Avatar } from '../../../src/components/common/Avatar';
import { AnimatedInput } from '../../../src/components/common/AnimatedInput';
import { GradientButton } from '../../../src/components/common/GradientButton';
import { LoadingOverlay } from '../../../src/components/common/LoadingOverlay';
import { StatsCard } from '../../../src/components/profile/StatsCard';
import { useStats } from '../../../src/hooks/useStats';
import { useProfile } from '../../../src/hooks/useProfile';
import {
  cancelAllNotifications,
  clearBadge,
} from '../../../src/lib/notifications';
import { getCacheSize, clearAllCache } from '../../../src/lib/offlineCache';
import { COLORS, FONTS, SPACING, RADIUS } from '../../../src/constants/theme';
import { UserStats } from '../../../src/types';

// ─── Default stats (prevents null being passed to StatsCard) ─────────────────

const DEFAULT_STATS: UserStats = {
  totalReports: 0,
  completedReports: 0,
  totalSources: 0,
  avgReliability: 0,
  favoriteTopic: null,
  reportsThisMonth: 0,
  hoursResearched: 0,
};

// ─── Open device app-settings ─────────────────────────────────────────────────

async function openAppSettings() {
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

      {/* right prop takes priority; falls back to chevron when onPress given */}
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
  // stats can be null while loading — guard with DEFAULT_STATS before passing to StatsCard
  const { stats } = useStats();
  const { updateProfile, uploadAvatar, updating, uploading } = useProfile();

  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [cacheSize, setCacheSize]                        = useState<number | null>(null);

  // Edit modal state
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editName, setEditName]                 = useState(profile?.full_name || '');
  const [editBio, setEditBio]                   = useState(profile?.bio || '');
  const [editOccupation, setEditOccupation]     = useState(profile?.occupation || '');
  const [editAvatarUri, setEditAvatarUri]       = useState<string | null>(null);

  // Load cache size on mount
  React.useEffect(() => {
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
      full_name: editName.trim() || null,
      bio: editBio.trim() || null,
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

  // ── Notifications → device Settings ───────────────────────────────────────

  const handleNotifRowPress = async () => {
    if (notificationsEnabled) {
      Alert.alert(
        'Manage Notifications',
        'To turn off notifications for DeepDive AI, open your device Settings.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Open Settings',
            onPress: async () => {
              await cancelAllNotifications();
              await clearBadge();
              setNotificationsEnabled(false);
              openAppSettings();
            },
          },
        ],
      );
    } else {
      await openAppSettings();
      setNotificationsEnabled(true);
    }
  };

  const handleNotifSwitch = (value: boolean) => {
    if (value) {
      openAppSettings();
      setNotificationsEnabled(true);
    } else {
      Alert.alert(
        'Turn Off Notifications',
        'This will cancel pending notifications. You can re-enable them in Settings.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Turn Off',
            style: 'destructive',
            onPress: async () => {
              await cancelAllNotifications();
              await clearBadge();
              setNotificationsEnabled(false);
              openAppSettings();
            },
          },
        ],
      );
    }
  };

  // ── Cache clear ────────────────────────────────────────────────────────────

  const handleClearCache = () => {
    const sizeLabel =
      cacheSize !== null
        ? `${(cacheSize / 1024).toFixed(1)} KB`
        : 'unknown size';

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
            {/*
              FIX: Avatar has no `style` prop — spacing handled by wrapping View.
            */}
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

            {/* Edit Profile — opens inline modal (same behaviour as upside file) */}
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
            {/*
              FIX: StatsCard props are { stats: UserStats } — no `loading` prop.
              Guarded with null-coalesce so TypeScript is satisfied.
            */}
            <StatsCard stats={stats ?? DEFAULT_STATS} />
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

            {/* Push Notifications — tap row OR toggle switch → device Settings */}
            <SettingsRow
              icon="notifications-outline"
              label="Push Notifications"
              sublabel="Tap to manage in device Settings"
              iconColor={COLORS.primary}
              iconBg={`${COLORS.primary}15`}
              onPress={handleNotifRowPress}
              right={
                <Switch
                  value={notificationsEnabled}
                  onValueChange={handleNotifSwitch}
                  trackColor={{ false: COLORS.border, true: `${COLORS.primary}80` }}
                  thumbColor={notificationsEnabled ? COLORS.primary : COLORS.textMuted}
                />
              }
            />

            {/* Offline cache */}
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

          {/*
            Account section (Edit Profile row, Privacy & Data, Help & Support)
            deliberately removed as requested.
          */}

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

          {/* App version */}
          <Text style={{
            color: COLORS.textMuted,
            fontSize: FONTS.sizes.xs,
            textAlign: 'center',
            marginTop: SPACING.xl,
          }}>
            DeepDive AI · v1.1.0
          </Text>

        </ScrollView>

        {/* ============================
            EDIT PROFILE MODAL
            ============================ */}
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
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            >
              <View
                style={{
                  backgroundColor: COLORS.backgroundCard,
                  borderTopLeftRadius: 30,
                  borderTopRightRadius: 30,
                  padding: SPACING.xl,
                  borderTopWidth: 1,
                  borderTopColor: COLORS.border,
                  maxHeight: '90%',
                }}
              >
                {/* Modal header */}
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: SPACING.xl,
                  }}
                >
                  <Text
                    style={{
                      color: COLORS.textPrimary,
                      fontSize: FONTS.sizes.xl,
                      fontWeight: '800',
                    }}
                  >
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
                        // Show the newly picked local image
                        <View>
                          <Image
                            source={{ uri: editAvatarUri }}
                            style={{
                              width: 90,
                              height: 90,
                              borderRadius: 45,
                              borderWidth: 2,
                              borderColor: COLORS.primary,
                            }}
                          />
                          <View
                            style={{
                              position: 'absolute',
                              bottom: 0,
                              right: 0,
                              backgroundColor: COLORS.primary,
                              borderRadius: 16,
                              padding: 6,
                            }}
                          >
                            <Ionicons name="camera" size={14} color="#FFF" />
                          </View>
                        </View>
                      ) : (
                        // Show current profile avatar with camera overlay
                        <View>
                          <Avatar
                            url={profile?.avatar_url}
                            name={profile?.full_name}
                            size={90}
                          />
                          <View
                            style={{
                              position: 'absolute',
                              bottom: 0,
                              right: 0,
                              backgroundColor: COLORS.primary,
                              borderRadius: 16,
                              padding: 6,
                            }}
                          >
                            <Ionicons name="camera" size={14} color="#FFF" />
                          </View>
                        </View>
                      )}
                    </TouchableOpacity>
                    <Text
                      style={{
                        color: COLORS.textMuted,
                        fontSize: FONTS.sizes.xs,
                        marginTop: 8,
                      }}
                    >
                      Tap to change photo
                    </Text>
                  </View>

                  {/* Edit fields */}
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