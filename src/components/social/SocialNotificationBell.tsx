// src/components/social/SocialNotificationBell.tsx
// DeepDive AI — Part 36: Bell icon with unread badge + notification drawer.
//
// Usage: drop inside the profile tab header (Part 36C updates profile.tsx).
//   <SocialNotificationBell userId={user?.id ?? null} />
//
// Tapping a new-follower notification → navigates to that user's profile.
// Tapping a new-report  notification → navigates to the report screen.

import React, { useState } from 'react';
import {
  TouchableOpacity,
  View,
  Text,
  Modal,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { LinearGradient }           from 'expo-linear-gradient';
import { Ionicons }                 from '@expo/vector-icons';
import { useSafeAreaInsets }        from 'react-native-safe-area-context';
import { router }                   from 'expo-router';
import { useSocialNotifications }   from '../../hooks/useSocialNotifications';
import { Avatar }                   from '../common/Avatar';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';
import type { FollowNotification }  from '../../types/social';

// ─── Time helper ──────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─── Single notification row ──────────────────────────────────────────────────

function NotificationRow({
  notif,
  onPress,
}: {
  notif:   FollowNotification;
  onPress: () => void;
}) {
  const actorName = notif.actor_full_name ?? notif.actor_username ?? 'Someone';

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={{
        flexDirection:   'row',
        alignItems:      'flex-start',
        padding:         SPACING.md,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.border,
        backgroundColor:   notif.read ? 'transparent' : `${COLORS.primary}08`,
      }}
    >
      {/* Unread indicator */}
      {!notif.read && (
        <View style={{
          position:        'absolute',
          left:            SPACING.sm,
          top:             '50%' as any,
          marginTop:       -4,
          width:           8,
          height:          8,
          borderRadius:    4,
          backgroundColor: COLORS.primary,
        }} />
      )}

      <View style={{
        flexDirection: 'row',
        flex:          1,
        gap:           SPACING.sm,
        marginLeft:    notif.read ? 0 : 14,
      }}>
        {/* Actor avatar */}
        <Avatar
          url={notif.actor_avatar_url}
          name={actorName}
          size={42}
        />

        {/* Text */}
        <View style={{ flex: 1 }}>
          <Text style={{
            color:      COLORS.textPrimary,
            fontSize:   FONTS.sizes.sm,
            lineHeight: 20,
          }}>
            <Text style={{ fontWeight: '700' }}>{actorName}</Text>
            {notif.type === 'new_follower' ? (
              ' started following you'
            ) : (
              <>
                {' published: '}
                <Text style={{ color: COLORS.primary, fontWeight: '600' }}>
                  {(notif.report_title ?? 'a new report').slice(0, 55)}
                  {(notif.report_title?.length ?? 0) > 55 ? '…' : ''}
                </Text>
              </>
            )}
          </Text>
          <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 3 }}>
            {timeAgo(notif.created_at)}
          </Text>
        </View>

        {/* Type icon */}
        <Ionicons
          name={notif.type === 'new_follower' ? 'person' : 'document-text'}
          size={17}
          color={notif.type === 'new_follower' ? COLORS.primary : COLORS.success}
          style={{ marginTop: 2, flexShrink: 0 }}
        />
      </View>
    </TouchableOpacity>
  );
}

// ─── Bell button + drawer ─────────────────────────────────────────────────────

interface SocialNotificationBellProps {
  userId: string | null;
}

export function SocialNotificationBell({ userId }: SocialNotificationBellProps) {
  const insets = useSafeAreaInsets();
  const { notifications, unreadCount, isLoading, markAsRead } =
    useSocialNotifications(userId);

  const [visible, setVisible] = useState(false);

  const handleOpen = async () => {
    setVisible(true);
    // Mark read on open
    await markAsRead();
  };

  const handleClose = () => setVisible(false);

  const handleRowPress = (notif: FollowNotification) => {
    handleClose();
    if (notif.type === 'new_follower' && notif.actor_username) {
      router.push({
        pathname: '/(app)/user-profile' as any,
        params:   { username: notif.actor_username },
      });
    } else if (notif.type === 'new_report' && notif.report_id) {
      router.push({
        pathname: '/(app)/research-report' as any,
        params:   { reportId: notif.report_id },
      });
    }
  };

  return (
    <>
      {/* ── Bell button ── */}
      <TouchableOpacity
        onPress={handleOpen}
        activeOpacity={0.75}
        hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
        style={{ position: 'relative', padding: 4 }}
      >
        <Ionicons
          name={unreadCount > 0 ? 'notifications' : 'notifications-outline'}
          size={23}
          color={unreadCount > 0 ? COLORS.primary : COLORS.textSecondary}
        />
        {unreadCount > 0 && (
          <View style={{
            position:          'absolute',
            top:               1,
            right:             1,
            backgroundColor:   COLORS.error,
            borderRadius:      RADIUS.full,
            minWidth:          16,
            height:            16,
            alignItems:        'center',
            justifyContent:    'center',
            paddingHorizontal: 3,
          }}>
            <Text style={{ color: '#FFF', fontSize: 9, fontWeight: '800' }}>
              {unreadCount > 99 ? '99+' : unreadCount}
            </Text>
          </View>
        )}
      </TouchableOpacity>

      {/* ── Notification drawer ── */}
      <Modal
        visible={visible}
        animationType="slide"
        transparent
        statusBarTranslucent={Platform.OS === 'android'}
        onRequestClose={handleClose}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' }}
          onPress={handleClose}
        >
          <Pressable onPress={e => e.stopPropagation()}>
            <LinearGradient
              colors={['#1A1A35', '#0A0A1A']}
              style={{
                borderTopLeftRadius:  28,
                borderTopRightRadius: 28,
                maxHeight:            '78%',
                borderTopWidth:       1,
                borderTopColor:       COLORS.border,
                paddingBottom:        insets.bottom + SPACING.md,
              }}
            >
              {/* Handle */}
              <View style={{
                width:           40,
                height:          4,
                borderRadius:    2,
                backgroundColor: COLORS.border,
                alignSelf:       'center',
                marginTop:       SPACING.sm,
                marginBottom:    SPACING.md,
              }} />

              {/* Header */}
              <View style={{
                flexDirection:   'row',
                alignItems:      'center',
                justifyContent:  'space-between',
                paddingHorizontal: SPACING.lg,
                paddingBottom:   SPACING.md,
                borderBottomWidth: 1,
                borderBottomColor: COLORS.border,
              }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <LinearGradient
                    colors={COLORS.gradientPrimary}
                    style={{
                      width:          32,
                      height:         32,
                      borderRadius:   10,
                      alignItems:     'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Ionicons name="notifications" size={15} color="#FFF" />
                  </LinearGradient>
                  <View>
                    <Text style={{
                      color:      COLORS.textPrimary,
                      fontSize:   FONTS.sizes.base,
                      fontWeight: '700',
                    }}>
                      Social Notifications
                    </Text>
                    <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
                      Follows &amp; new reports from people you follow
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  onPress={handleClose}
                  hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
                >
                  <Ionicons name="close" size={22} color={COLORS.textMuted} />
                </TouchableOpacity>
              </View>

              {/* List */}
              <ScrollView showsVerticalScrollIndicator={false}>
                {isLoading && notifications.length === 0 ? (
                  <View style={{ alignItems: 'center', padding: SPACING.xl * 2 }}>
                    <ActivityIndicator color={COLORS.primary} />
                  </View>
                ) : notifications.length === 0 ? (
                  <View style={{
                    alignItems:  'center',
                    paddingTop:  SPACING.xl * 1.5,
                    paddingHorizontal: SPACING.xl,
                  }}>
                    <View style={{
                      width:           72,
                      height:          72,
                      borderRadius:    20,
                      backgroundColor: COLORS.backgroundElevated,
                      alignItems:      'center',
                      justifyContent:  'center',
                      marginBottom:    SPACING.md,
                    }}>
                      <Ionicons name="notifications-off-outline" size={34} color={COLORS.border} />
                    </View>
                    <Text style={{
                      color:      COLORS.textMuted,
                      fontSize:   FONTS.sizes.sm,
                      textAlign:  'center',
                      lineHeight: 22,
                    }}>
                      No notifications yet.{'\n'}
                      Follow researchers to see their activity here.
                    </Text>
                    <TouchableOpacity
                      onPress={() => {
                        handleClose();
                        router.push('/(app)/(tabs)/feed' as any);
                      }}
                      style={{
                        marginTop:         SPACING.lg,
                        backgroundColor:   `${COLORS.primary}15`,
                        borderRadius:      RADIUS.full,
                        paddingHorizontal: 20,
                        paddingVertical:   9,
                        borderWidth:       1,
                        borderColor:       `${COLORS.primary}30`,
                      }}
                    >
                      <Text style={{ color: COLORS.primary, fontWeight: '700', fontSize: FONTS.sizes.sm }}>
                        Browse Researchers →
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  notifications.map(notif => (
                    <NotificationRow
                      key={notif.id}
                      notif={notif}
                      onPress={() => handleRowPress(notif)}
                    />
                  ))
                )}
                <View style={{ height: SPACING.xl }} />
              </ScrollView>
            </LinearGradient>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}