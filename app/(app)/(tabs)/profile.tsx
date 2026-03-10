// app/(app)/(tabs)/profile.tsx
// Part 3 update: SubscriptionCard removed.
// Keeps: StatsCard, notifications toggle, offline cache clear, avatar, settings.

import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAuth } from '../../../src/context/AuthContext';
import { Avatar } from '../../../src/components/common/Avatar';
import { StatsCard } from '../../../src/components/profile/StatsCard';
import { useStats } from '../../../src/hooks/useStats';
import {
  registerForPushNotifications,
  saveTokenToSupabase,
  cancelAllNotifications,
  clearBadge,
} from '../../../src/lib/notifications';
import { getCacheSize, clearAllCache } from '../../../src/lib/offlineCache';
import { COLORS, FONTS, SPACING, RADIUS } from '../../../src/constants/theme';

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
          <Text style={{
            color: COLORS.textMuted,
            fontSize: FONTS.sizes.xs,
            marginTop: 2,
          }}>
            {sublabel}
          </Text>
        ) : null}
      </View>

      {right ?? (
        onPress
          ? <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
          : null
      )}
    </TouchableOpacity>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const { user, profile, signOut } = useAuth();
  const { stats, loading: statsLoading } = useStats();

  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [notifLoading, setNotifLoading]                  = useState(false);
  const [cacheSize, setCacheSize]                        = useState<number | null>(null);

  // Load cache size on mount
  React.useEffect(() => {
    getCacheSize().then(setCacheSize).catch(() => setCacheSize(0));
  }, []);

  // ── Notifications toggle ───────────────────────────────────────────────────

  const handleNotifToggle = async (value: boolean) => {
    setNotifLoading(true);
    try {
      if (value) {
        const token = await registerForPushNotifications();
        if (token && user?.id) {
          await saveTokenToSupabase(user.id, token);
          setNotificationsEnabled(true);
        } else {
          Alert.alert(
            'Permission Required',
            'Please enable notifications in your device Settings to receive updates.',
          );
        }
      } else {
        await cancelAllNotifications();
        await clearBadge();
        setNotificationsEnabled(false);
      }
    } catch {
      Alert.alert('Error', 'Could not update notification settings.');
    } finally {
      setNotifLoading(false);
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
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: () => signOut(),
      },
    ]);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <LinearGradient colors={[COLORS.background, COLORS.backgroundCard]} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ padding: SPACING.xl, paddingBottom: 110 }}
          showsVerticalScrollIndicator={false}
        >

          {/* ── Profile header ───────────────────────────────────────── */}
          <Animated.View
            entering={FadeIn.duration(600)}
            style={{
              alignItems: 'center',
              paddingTop: SPACING.lg,
              paddingBottom: SPACING.xl,
            }}
          >
            {/* FIX 1: Avatar doesn't accept `style` — wrap in View instead */}
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

            <Text style={{
              color: COLORS.textMuted,
              fontSize: FONTS.sizes.sm,
              marginTop: 4,
            }}>
              {user?.email}
            </Text>

            {/* Edit profile */}
            <TouchableOpacity
              onPress={() => router.push('/(app)/edit-profile' as any)}
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
            >
              <Ionicons name="pencil-outline" size={14} color={COLORS.primary} />
              <Text style={{
                color: COLORS.primary,
                fontSize: FONTS.sizes.sm,
                fontWeight: '600',
              }}>
                Edit Profile
              </Text>
            </TouchableOpacity>
          </Animated.View>

          {/* ── Stats card ───────────────────────────────────────────── */}
          <Animated.View entering={FadeInDown.duration(400).delay(50)}>
            {/* FIX 2: StatsCard expects UserStats (not null) — guard with conditional render */}
            {stats !== null && (
              <StatsCard stats={stats} />
            )}
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

            {/* Notifications */}
            <SettingsRow
              icon="notifications-outline"
              label="Push Notifications"
              sublabel="Research complete & weekly digest"
              iconColor={COLORS.primary}
              iconBg={`${COLORS.primary}15`}
              right={
                <Switch
                  value={notificationsEnabled}
                  onValueChange={handleNotifToggle}
                  disabled={notifLoading}
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
                <Text style={{
                  color: COLORS.error,
                  fontSize: FONTS.sizes.xs,
                  fontWeight: '600',
                }}>
                  Clear
                </Text>
              }
            />
          </Animated.View>

          {/* ── Account ──────────────────────────────────────────────── */}
          <Animated.View entering={FadeInDown.duration(400).delay(150)}>
            <Text style={{
              color: COLORS.textSecondary,
              fontSize: FONTS.sizes.sm,
              fontWeight: '600',
              letterSpacing: 0.8,
              textTransform: 'uppercase',
              marginBottom: SPACING.sm,
              marginTop: SPACING.lg,
            }}>
              Account
            </Text>

            <SettingsRow
              icon="person-outline"
              label="Edit Profile"
              iconColor={COLORS.primary}
              iconBg={`${COLORS.primary}15`}
              onPress={() => router.push('/(app)/edit-profile' as any)}
            />

            <SettingsRow
              icon="shield-checkmark-outline"
              label="Privacy & Data"
              sublabel="Your data is stored securely"
              iconColor={COLORS.success}
              iconBg={`${COLORS.success}15`}
            />

            <SettingsRow
              icon="help-circle-outline"
              label="Help & Support"
              iconColor={COLORS.info}
              iconBg={`${COLORS.info}15`}
            />
          </Animated.View>

          {/* ── Sign out ─────────────────────────────────────────────── */}
          <Animated.View entering={FadeInDown.duration(400).delay(200)}>
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
            >
              <Ionicons name="log-out-outline" size={20} color={COLORS.error} />
              <Text style={{
                color: COLORS.error,
                fontSize: FONTS.sizes.base,
                fontWeight: '700',
              }}>
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
      </SafeAreaView>
    </LinearGradient>
  );
}