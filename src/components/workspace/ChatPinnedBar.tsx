// src/components/workspace/ChatPinnedBar.tsx
// Part 17 — Pinned messages banner shown at top of chat screen.
// Part 47 — FIXED: tapping always navigates to the pinned message (scrolls + highlights).
//            Previously, tap only cycled when multiple pins existed without navigating.
//            Now: tap ALWAYS navigates to current message AND cycles if multiple exist.

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { ChatPinnedMessage } from '../../types/chat';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';

interface Props {
  pinnedMessages:  ChatPinnedMessage[];
  isEditorOrOwner: boolean;
  /** Called when user taps the bar — should scroll to AND highlight the message */
  onTapMessage:    (msg: ChatPinnedMessage) => void;
  onUnpin:         (messageId: string) => void;
}

export function ChatPinnedBar({
  pinnedMessages,
  isEditorOrOwner,
  onTapMessage,
  onUnpin,
}: Props) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [collapsed, setCollapsed] = useState(false);

  if (pinnedMessages.length === 0) return null;

  // Clamp index in case pins are removed
  const safeIndex = currentIndex % pinnedMessages.length;
  const current   = pinnedMessages[safeIndex];

  const handleTap = () => {
    // Part 47 FIX: ALWAYS navigate to the current message (scroll + highlight)
    onTapMessage(current);

    // If multiple pinned messages, also advance the cycle so next tap shows next message
    if (pinnedMessages.length > 1) {
      setCurrentIndex(i => (i + 1) % pinnedMessages.length);
    }
  };

  if (collapsed) {
    return (
      <TouchableOpacity
        onPress={() => setCollapsed(false)}
        style={styles.collapsedBar}
        activeOpacity={0.8}
      >
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
      {/* Left accent bar */}
      <View style={styles.accentBar} />

      {/* Tappable content — navigates to message */}
      <TouchableOpacity
        onPress={handleTap}
        style={styles.content}
        activeOpacity={0.75}
      >
        <View style={styles.header}>
          <Ionicons name="pin" size={11} color={COLORS.warning} />
          <Text style={styles.headerText}>
            Pinned
            {pinnedMessages.length > 1 && (
              <Text style={styles.headerCount}> · {safeIndex + 1}/{pinnedMessages.length}</Text>
            )}
          </Text>
          {pinnedMessages.length > 1 && (
            <Text style={styles.tapHint}>tap to jump & cycle</Text>
          )}
          {pinnedMessages.length === 1 && (
            <Text style={styles.tapHint}>tap to jump</Text>
          )}
        </View>

        <Text style={styles.preview} numberOfLines={1}>
          {current.content || '📎 Attachment'}
        </Text>

        <Text style={styles.author} numberOfLines={1}>
          {current.author?.fullName ?? current.author?.username ?? 'Unknown'}
        </Text>
      </TouchableOpacity>

      {/* Actions */}
      <View style={styles.actions}>
        {isEditorOrOwner && (
          <TouchableOpacity
            onPress={() => onUnpin(current.id)}
            style={styles.actionBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close" size={13} color={COLORS.textMuted} />
          </TouchableOpacity>
        )}
        <TouchableOpacity
          onPress={() => setCollapsed(true)}
          style={styles.actionBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chevron-up-outline" size={13} color={COLORS.textMuted} />
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  bar: {
    flexDirection:       'row',
    alignItems:          'center',
    backgroundColor:     `${COLORS.warning}10`,
    borderBottomWidth:   1,
    borderBottomColor:   `${COLORS.warning}22`,
    paddingRight:        SPACING.md,
    gap:                 8,
    minHeight:           52,
  },
  accentBar: {
    width:        3,
    alignSelf:    'stretch',
    minHeight:    52,
    backgroundColor: COLORS.warning,
  },
  content: {
    flex:         1,
    paddingVertical:  8,
    paddingLeft:  SPACING.sm,
    gap:          2,
  },
  header: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            4,
  },
  headerText: {
    color:       COLORS.warning,
    fontSize:    10,
    fontWeight:  '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  headerCount: {
    color:      COLORS.textMuted,
    fontWeight: '400',
  },
  tapHint: {
    color:     COLORS.textMuted,
    fontSize:  9,
    fontStyle: 'italic',
    marginLeft: 3,
  },
  preview: {
    color:       COLORS.textPrimary,
    fontSize:    FONTS.sizes.sm,
    fontWeight:  '500',
    lineHeight:  17,
  },
  author: {
    color:    COLORS.textMuted,
    fontSize: 10,
    marginTop: 1,
  },
  actions: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           4,
    flexShrink:    0,
  },
  actionBtn: {
    width:           28,
    height:          28,
    borderRadius:    9,
    backgroundColor: COLORS.backgroundElevated,
    alignItems:      'center',
    justifyContent:  'center',
    borderWidth:     1,
    borderColor:     COLORS.border,
  },

  // ── Collapsed state ──────────────────────────────────────────────────────
  collapsedBar: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             5,
    paddingHorizontal: SPACING.md,
    paddingVertical: 5,
    backgroundColor: `${COLORS.warning}08`,
    borderBottomWidth: 1,
    borderBottomColor: `${COLORS.warning}18`,
  },
  collapsedDot: {
    width:           6,
    height:          6,
    borderRadius:    3,
    backgroundColor: COLORS.warning,
  },
  collapsedText: {
    flex:       1,
    color:      COLORS.textMuted,
    fontSize:   FONTS.sizes.xs,
    fontWeight: '600',
  },
});