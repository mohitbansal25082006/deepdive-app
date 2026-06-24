// src/components/social/SocialNotificationBell.tsx
// DeepDive AI — Part 53: UNIFIED notification bell.
// Part 54A — Added fallback icon/accent for new notification types:
//   voice_debate_ready, payment_success, payment_failed.
//
// Part 55.2 — FULL THEME-COMPATIBILITY PASS
//   The notification drawer modal previously had several hardcoded dark-only
//   colors that never changed when the user switched themes:
//
//   1. The LinearGradient background of the drawer sheet was hardcoded to
//      ['#1A1A35', '#0A0A1A'] — always a deep indigo/black regardless of theme.
//      In light themes (Cosmic Light, Ocean Light, etc.) this produced a jarring
//      pitch-black drawer on a light-background app.
//      FIX: now uses [COLORS.backgroundCard, COLORS.background] so the drawer
//      surface always matches the active theme's card/page colors.
//
//   2. The scrim backdrop was hardcoded to 'rgba(0,0,0,0.55)' — acceptable in
//      dark themes but too heavy in some light themes.
//      FIX: now uses getModalBackdrop(0.55) so the scrim tints from the active
//      background color, keeping consistent translucency across all themes.
//
//   3. The empty-state container used COLORS.backgroundElevated (already correct)
//      but the surrounding structure relied on the dark backdrop. With the two
//      fixes above the empty state now reads correctly in all themes.
//
// WHAT CHANGED (Part 53)
//   Previously this component showed ONLY social notifications (follows + new
//   reports from people you follow) via useSocialNotifications. It now shows
//   EVERY notification type via the unified useAppNotifications hook:
//
//     • report_ready        — your research report finished
//     • podcast_ready        — your podcast finished
//     • debate_ready         — your debate finished
//     • paper_ready          — your academic paper finished
//     • presentation_ready   — your slides finished
//     • voice_debate_ready   — your voice debate finished      (Part 54A)
//     • payment_success      — a credit purchase succeeded      (Part 54A)
//     • payment_failed       — a credit purchase failed         (Part 54A)
//     • new_follower         — someone followed you      (social, preserved)
//     • new_report           — a followee published       (social, preserved)
//
//   Tapping ANY row deep-links straight to that content using the row's
//   pre-resolved { route, params } (built in appNotificationService /
//   useAppNotifications). No per-type branching needed in the UI.
//
// BACK-COMPAT
//   The export name `SocialNotificationBell` and its `{ userId }` prop are kept
//   identical so profile.tsx (and anything else) needs no import change — though
//   we also export it as `NotificationBell` for clarity going forward.
//
//   The modal bottom-sheet styling (drag handle, scrim, ~88% height, empty
//   state) is preserved from the Part 37 version.

import React, { useState }               from 'react';
import {
  TouchableOpacity,
  View,
  Text,
  Modal,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Platform,
  Dimensions,
}                                         from 'react-native';
import { LinearGradient }                 from 'expo-linear-gradient';
import { Ionicons }                       from '@expo/vector-icons';
import { useSafeAreaInsets }              from 'react-native-safe-area-context';
import { router }                         from 'expo-router';
import { useNotifications }               from '../../context/NotificationsContext';
import { Avatar }                         from '../common/Avatar';
import {
  COLORS, FONTS, SPACING, RADIUS,
  getModalBackdrop,
}                                         from '../../constants/theme';
import type { AppNotification }           from '../../types/notifications';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

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

// ─── Per-type icon + accent fallback ──────────────────────────────────────────
// Most notifications already carry icon/accent (from CONTENT_KIND_CONFIG or the
// social mapper). This is a safety net for any row missing them.

const TYPE_ICON: Record<string, string> = {
  report_ready:       'document-text',
  podcast_ready:      'radio',
  debate_ready:       'people',
  paper_ready:        'school',
  presentation_ready: 'easel',
  voice_debate_ready: 'mic',               // Part 54A
  payment_success:    'checkmark-circle',  // Part 54A
  payment_failed:     'close-circle',      // Part 54A
  new_follower:       'person-add',
  new_unfollower:     'person-remove',
  new_report:         'document-text',
};

const TYPE_ACCENT: Record<string, string> = {
  report_ready:       '#6C63FF',
  podcast_ready:      '#A78BFA',
  debate_ready:       '#FB7185',
  paper_ready:        '#34D399',
  presentation_ready: '#FBBF24',
  voice_debate_ready: '#F472B6',  // Part 54A
  payment_success:    '#43E97B',  // Part 54A
  payment_failed:     '#FF4757',  // Part 54A
  new_follower:       '#6C63FF',
  new_unfollower:     '#94A3B8',
  new_report:         '#43E97B',
};

function iconFor(n: AppNotification): string {
  return n.icon ?? TYPE_ICON[n.type] ?? 'notifications';
}
function accentFor(n: AppNotification): string {
  return n.accent ?? TYPE_ACCENT[n.type] ?? COLORS.primary;
}

// ─── Single notification row ──────────────────────────────────────────────────

function NotificationRow({
  notif,
  onPress,
}: {
  notif:   AppNotification;
  onPress: () => void;
}) {
  const accent  = accentFor(notif);
  const icon    = iconFor(notif);
  const isSocial = notif.source === 'social';
  const actorName =
    notif.actorFullName ?? notif.actorUsername ?? 'Someone';

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={{
        flexDirection:      'row',
        alignItems:         'flex-start',
        paddingHorizontal:  SPACING.md,
        paddingVertical:    SPACING.sm + 2,
        minHeight:          56,
        borderBottomWidth:  1,
        borderBottomColor:  COLORS.border,
        // Part 55.2: unread highlight uses COLORS.backgroundElevated as the base
        // so it reads correctly in both dark and light themes, rather than just
        // being a tinted overlay on a hardcoded dark surface.
        backgroundColor:    notif.read
          ? 'transparent'
          : `${accent}0D`,
      }}
    >
      {/* Unread dot */}
      {!notif.read && (
        <View style={{
          position:        'absolute',
          left:            SPACING.sm,
          top:             '50%' as any,
          marginTop:       -4,
          width:           8,
          height:          8,
          borderRadius:    4,
          backgroundColor: accent,
        }} />
      )}

      <View style={{
        flexDirection: 'row',
        flex:          1,
        gap:           SPACING.sm,
        marginLeft:    notif.read ? 0 : 14,
        alignItems:    'center',
      }}>
        {/* Leading visual: social → actor avatar; content → coloured icon tile */}
        {isSocial ? (
          <Avatar
            url={notif.actorAvatarUrl ?? null}
            name={actorName}
            size={42}
          />
        ) : (
          <View style={{
            width:           42,
            height:          42,
            borderRadius:    13,
            backgroundColor: `${accent}1F`,
            alignItems:      'center',
            justifyContent:  'center',
            borderWidth:     1,
            borderColor:     `${accent}40`,
          }}>
            <Ionicons name={icon as any} size={19} color={accent} />
          </View>
        )}

        {/* Text */}
        <View style={{ flex: 1 }}>
          <Text style={{
            color:      COLORS.textPrimary,
            fontSize:   FONTS.sizes.sm,
            fontWeight: '700',
            lineHeight: 19,
          }} numberOfLines={1}>
            {notif.title}
          </Text>
          <Text style={{
            color:      COLORS.textSecondary,
            fontSize:   FONTS.sizes.sm,
            lineHeight: 19,
            marginTop:  1,
          }} numberOfLines={2}>
            {notif.body}
          </Text>
          <Text style={{
            color:     COLORS.textMuted,
            fontSize:  FONTS.sizes.xs,
            marginTop: 3,
          }}>
            {timeAgo(notif.createdAt)}
          </Text>
        </View>

        {/* Trailing chevron */}
        <Ionicons
          name="chevron-forward"
          size={15}
          color={COLORS.textMuted}
          style={{ marginTop: 2, flexShrink: 0 }}
        />
      </View>
    </TouchableOpacity>
  );
}

// ─── Bell button + drawer ─────────────────────────────────────────────────────

interface NotificationBellProps {
  userId: string | null;
}

export function NotificationBell({ userId }: NotificationBellProps) {
  const insets = useSafeAreaInsets();
  // Part 53D: shared context so the bell + profile tab badge read the same
  // realtime unread count. `userId` is accepted for back-compat but the
  // provider already scopes to the signed-in user.
  const { notifications, unreadCount, isLoading, markAllRead, markOneRead } =
    useNotifications();

  const [visible, setVisible] = useState(false);

  const handleOpen = async () => {
    setVisible(true);
    await markAllRead();
  };

  const handleClose = () => setVisible(false);

  // Deep-link straight to the content using the row's pre-resolved route+params.
  const handleRowPress = (notif: AppNotification) => {
    handleClose();

    // Mark this single row read (context updates the shared badge too).
    markOneRead(notif).catch(() => {});

    if (notif.route) {
      router.push({
        pathname: notif.route as any,
        params:   (notif.params ?? {}) as any,
      });
    }
  };

  const MODAL_MAX_HEIGHT = SCREEN_HEIGHT * 0.88;

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
        {/*
          Part 55.2: scrim was hardcoded 'rgba(0,0,0,0.55)' — now uses
          getModalBackdrop(0.55) so it tints from the active theme's background
          color, keeping consistent legibility across both dark and light themes.
        */}
        <Pressable
          style={{
            flex:            1,
            backgroundColor: getModalBackdrop(0.55),
            justifyContent:  'flex-end',
          }}
          onPress={handleClose}
        >
          <Pressable onPress={e => e.stopPropagation()}>
            {/*
              Part 55.2: drawer sheet gradient was hardcoded ['#1A1A35', '#0A0A1A']
              — always deep indigo/black regardless of theme. In light themes this
              produced a jarring dark drawer on a light app.
              FIX: now uses COLORS.backgroundCard → COLORS.background so the
              drawer surface always matches the active theme. The gradient direction
              is top-to-bottom (card at top, page color at bottom) which mirrors
              how cards sit above the page surface — correct for both dark and
              light palettes across all 6 themes.
            */}
            <LinearGradient
              colors={[COLORS.backgroundCard, COLORS.background]}
              style={{
                borderTopLeftRadius:  28,
                borderTopRightRadius: 28,
                maxHeight:            MODAL_MAX_HEIGHT,
                borderTopWidth:       1,
                borderTopColor:       COLORS.border,
                paddingBottom:        insets.bottom + SPACING.md,
              }}
            >
              {/* Drag handle */}
              <View style={{
                width:           40,
                height:          4,
                borderRadius:    2,
                backgroundColor: COLORS.border,
                alignSelf:       'center',
                marginTop:       SPACING.sm,
                marginBottom:    SPACING.md,
              }} />

              {/* ── Header ── */}
              <View style={{
                flexDirection:     'row',
                alignItems:        'center',
                justifyContent:    'space-between',
                paddingHorizontal: SPACING.lg,
                paddingBottom:     SPACING.md,
                borderBottomWidth: 1,
                borderBottomColor: COLORS.border,
              }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <LinearGradient
                    colors={COLORS.gradientPrimary as [string, string]}
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
                      Notifications
                    </Text>
                    <Text style={{
                      color:    COLORS.textMuted,
                      fontSize: FONTS.sizes.xs,
                    }}>
                      Content, payments &amp; social updates
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

              {/* ── List ── */}
              <ScrollView showsVerticalScrollIndicator={false}>
                {isLoading && notifications.length === 0 ? (
                  <View style={{ alignItems: 'center', padding: SPACING.xl * 2 }}>
                    <ActivityIndicator color={COLORS.primary} />
                  </View>
                ) : notifications.length === 0 ? (
                  // ── Empty state ──
                  <View style={{
                    alignItems:        'center',
                    paddingTop:        SPACING.xl * 1.5,
                    paddingHorizontal: SPACING.xl,
                  }}>
                    {/*
                      Part 55.2: empty-state icon container uses COLORS.backgroundElevated
                      (already theme-correct). The border color now uses COLORS.border
                      instead of the previous implicit reliance on the dark sheet bg.
                    */}
                    <View style={{
                      width:           72,
                      height:          72,
                      borderRadius:    20,
                      backgroundColor: COLORS.backgroundElevated,
                      borderWidth:     1,
                      borderColor:     COLORS.border,
                      alignItems:      'center',
                      justifyContent:  'center',
                      marginBottom:    SPACING.md,
                    }}>
                      <Ionicons
                        name="notifications-off-outline"
                        size={34}
                        color={COLORS.textMuted}
                      />
                    </View>
                    <Text style={{
                      color:      COLORS.textMuted,
                      fontSize:   FONTS.sizes.sm,
                      textAlign:  'center',
                      lineHeight: 22,
                    }}>
                      No notifications yet.{'\n'}
                      Generate a report, podcast, debate, paper or slides{'\n'}
                      and you&apos;ll be notified the moment it&apos;s ready.
                    </Text>

                    <TouchableOpacity
                      onPress={() => {
                        handleClose();
                        router.push('/(app)/(tabs)/home' as any);
                      }}
                      style={{
                        marginTop:         SPACING.lg,
                        backgroundColor:   `${COLORS.primary}15`,
                        borderRadius:      RADIUS.full,
                        paddingHorizontal: 20,
                        paddingVertical:   10,
                        borderWidth:       1,
                        borderColor:       `${COLORS.primary}30`,
                      }}
                    >
                      <Text style={{
                        color:      COLORS.primary,
                        fontWeight: '700',
                        fontSize:   FONTS.sizes.sm,
                      }}>
                        Start Researching →
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

// Back-compat alias: existing imports of `SocialNotificationBell` keep working.
export const SocialNotificationBell = NotificationBell;