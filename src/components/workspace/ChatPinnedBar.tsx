// src/components/workspace/ChatPinnedBar.tsx
// Part 17 — Pinned messages banner shown at top of chat screen.
// Part 47 — FIXED: tapping always navigates to the pinned message.
// Part 48b — FEATURE: Swipe left/right to navigate between pinned messages.
// Part 48e — FIX: Rules of Hooks violation.
//   Root cause: useCallback and useRef(PanResponder) were called AFTER
//   `if (pinnedMessages.length === 0) return null` — React forbids hooks
//   after a conditional return. All hooks are now declared BEFORE any return.
//   PanResponder is created once in useRef (always), then used conditionally
//   only in the JSX — no hook is called after any return statement.

import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity,
  PanResponder, Animated as RNAnimated, StyleSheet,
} from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { ChatPinnedMessage } from '../../types/chat';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';

interface Props {
  pinnedMessages:  ChatPinnedMessage[];
  isEditorOrOwner: boolean;
  onTapMessage:    (msg: ChatPinnedMessage) => void;
  onUnpin:         (messageId: string) => void;
}

const SWIPE_THRESHOLD = 50;

export function ChatPinnedBar({
  pinnedMessages,
  isEditorOrOwner,
  onTapMessage,
  onUnpin,
}: Props) {
  // ── ALL hooks declared first — before any conditional return ──────────────

  const [currentIndex, setCurrentIndex] = useState(0);
  const [collapsed,    setCollapsed]    = useState(false);

  const translateX = useRef(new RNAnimated.Value(0)).current;

  // navigateTo: safe even when pinnedMessages is empty (guarded inside)
  const navigateTo = useCallback((newIndex: number) => {
    if (pinnedMessages.length === 0) return;
    const clamped = ((newIndex % pinnedMessages.length) + pinnedMessages.length) % pinnedMessages.length;
    setCurrentIndex(clamped);
    onTapMessage(pinnedMessages[clamped]);
  }, [pinnedMessages, onTapMessage]);

  // PanResponder created once in useRef — safe, no conditional hook call
  const panResponderRef = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) =>
        Math.abs(gs.dx) > Math.abs(gs.dy) * 1.5 && Math.abs(gs.dx) > 10,

      onPanResponderMove: (_, gs) => {
        translateX.setValue(gs.dx * 0.3);
      },

      onPanResponderRelease: (_, gs) => {
        const { dx } = gs;
        // We read the actual array length via a closure that captures the ref below
        const len = pinnedMessagesRef.current.length;
        if (Math.abs(dx) >= SWIPE_THRESHOLD && len > 1) {
          RNAnimated.timing(translateX, {
            toValue: dx > 0 ? 60 : -60, duration: 120, useNativeDriver: true,
          }).start(() => {
            translateX.setValue(0);
            setCurrentIndex(prev => {
              const newIdx = dx > 0
                ? ((prev - 1) + len) % len
                : (prev + 1) % len;
              onTapMessageRef.current(pinnedMessagesRef.current[newIdx]);
              return newIdx;
            });
          });
        } else {
          RNAnimated.spring(translateX, {
            toValue: 0, useNativeDriver: true, tension: 200, friction: 20,
          }).start();
        }
      },

      onPanResponderTerminate: () => {
        RNAnimated.spring(translateX, {
          toValue: 0, useNativeDriver: true, tension: 200, friction: 20,
        }).start();
      },
    })
  );

  // Stable refs so PanResponder callbacks always see current values
  // without needing to re-create the PanResponder on every render.
  const pinnedMessagesRef  = useRef(pinnedMessages);
  pinnedMessagesRef.current = pinnedMessages;

  const onTapMessageRef    = useRef(onTapMessage);
  onTapMessageRef.current  = onTapMessage;

  // ── Now safe to conditionally return ─────────────────────────────────────

  if (pinnedMessages.length === 0) return null;

  const safeIndex = currentIndex % pinnedMessages.length;
  const current   = pinnedMessages[safeIndex];

  const handleTap = () => {
    onTapMessage(current);
    if (pinnedMessages.length > 1) {
      setCurrentIndex(i => (i + 1) % pinnedMessages.length);
    }
  };

  if (collapsed) {
    return (
      <TouchableOpacity onPress={() => setCollapsed(false)} style={styles.collapsedBar} activeOpacity={0.8}>
        <View style={styles.collapsedDot} />
        <Ionicons name="pin" size={12} color={COLORS.warning} />
        <Text style={styles.collapsedText}>
          {pinnedMessages.length} pinned {pinnedMessages.length === 1 ? 'message' : 'messages'}
        </Text>
        <Ionicons name="chevron-down-outline" size={12} color={COLORS.textMuted} />
      </TouchableOpacity>
    );
  }

  return (
    <Animated.View entering={FadeIn.duration(250)} exiting={FadeOut.duration(200)} style={styles.bar}>
      <View style={styles.accentBar} />

      {/* Swipeable content */}
      <RNAnimated.View
        style={[styles.swipeableContent, { transform: [{ translateX }] }]}
        {...panResponderRef.current.panHandlers}
      >
        <TouchableOpacity onPress={handleTap} style={styles.content} activeOpacity={0.75}>
          <View style={styles.header}>
            <Ionicons name="pin" size={11} color={COLORS.warning} />
            <Text style={styles.headerText}>
              Pinned
              {pinnedMessages.length > 1 && (
                <Text style={styles.headerCount}> · {safeIndex + 1}/{pinnedMessages.length}</Text>
              )}
            </Text>
            {pinnedMessages.length > 1 && <Text style={styles.swipeHint}>swipe to browse</Text>}
            {pinnedMessages.length === 1 && <Text style={styles.tapHint}>tap to jump</Text>}
          </View>
          <Text style={styles.preview} numberOfLines={1}>
            {current.content || '📎 Attachment'}
          </Text>
          <Text style={styles.author} numberOfLines={1}>
            {current.author?.fullName ?? current.author?.username ?? 'Unknown'}
          </Text>
        </TouchableOpacity>
      </RNAnimated.View>

      {/* Dot indicators */}
      {pinnedMessages.length > 1 && (
        <View style={styles.dotsRow}>
          {pinnedMessages.map((_, i) => (
            <TouchableOpacity
              key={i}
              onPress={() => navigateTo(i)}
              hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
            >
              <View style={[styles.dot, i === safeIndex && styles.dotActive]} />
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Arrow navigation */}
      {pinnedMessages.length > 1 && (
        <View style={styles.arrowBtns}>
          <TouchableOpacity onPress={() => navigateTo(safeIndex - 1)} style={styles.arrowBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="chevron-up-outline" size={13} color={COLORS.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigateTo(safeIndex + 1)} style={styles.arrowBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="chevron-down-outline" size={13} color={COLORS.textMuted} />
          </TouchableOpacity>
        </View>
      )}

      {/* Actions */}
      <View style={styles.actions}>
        {isEditorOrOwner && (
          <TouchableOpacity onPress={() => onUnpin(current.id)} style={styles.actionBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={13} color={COLORS.textMuted} />
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={() => setCollapsed(true)} style={styles.actionBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-up-outline" size={13} color={COLORS.textMuted} />
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection:     'row',
    alignItems:        'center',
    backgroundColor:   `${COLORS.warning}10`,
    borderBottomWidth: 1,
    borderBottomColor: `${COLORS.warning}22`,
    paddingRight:      SPACING.md,
    gap:               6,
    minHeight:         52,
    overflow:          'hidden',
  },
  accentBar: {
    width:           3,
    alignSelf:       'stretch',
    minHeight:       52,
    backgroundColor: COLORS.warning,
    flexShrink:      0,
  },
  swipeableContent: {
    flex:          1,
    flexDirection: 'row',
    alignItems:    'center',
  },
  content: {
    flex:            1,
    paddingVertical: 8,
    paddingLeft:     SPACING.sm,
    gap:             2,
  },
  header: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           4,
    flexWrap:      'wrap',
  },
  headerText: {
    color:         COLORS.warning,
    fontSize:      10,
    fontWeight:    '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  headerCount: { color: COLORS.textMuted, fontWeight: '400' },
  tapHint:     { color: COLORS.textMuted, fontSize: 9, fontStyle: 'italic', marginLeft: 3 },
  swipeHint:   { color: COLORS.textMuted, fontSize: 9, fontStyle: 'italic', marginLeft: 3 },
  preview:     { color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '500', lineHeight: 17 },
  author:      { color: COLORS.textMuted, fontSize: 10, marginTop: 1 },

  dotsRow: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 2, flexShrink: 0 },
  dot:      { width: 5, height: 5, borderRadius: 3, backgroundColor: `${COLORS.warning}40` },
  dotActive:{ backgroundColor: COLORS.warning, width: 7, height: 7, borderRadius: 4 },

  arrowBtns: { flexDirection: 'column', alignItems: 'center', gap: 2, flexShrink: 0 },
  arrowBtn:  { width: 22, height: 22, borderRadius: 7, backgroundColor: COLORS.backgroundElevated, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border },

  actions:   { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0 },
  actionBtn: { width: 28, height: 28, borderRadius: 9, backgroundColor: COLORS.backgroundElevated, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border },

  collapsedBar:  { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: SPACING.md, paddingVertical: 5, backgroundColor: `${COLORS.warning}08`, borderBottomWidth: 1, borderBottomColor: `${COLORS.warning}18` },
  collapsedDot:  { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.warning },
  collapsedText: { flex: 1, color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600' },
});