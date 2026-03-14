// src/components/workspace/ChatPinnedBar.tsx
// Part 17 — Pinned messages banner shown at top of chat screen.
// Cycles through multiple pinned messages on tap.
// Editors/owners see an unpin button.

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

  const current = pinnedMessages[currentIndex % pinnedMessages.length];

  const handleTap = () => {
    if (pinnedMessages.length > 1) {
      setCurrentIndex(i => (i + 1) % pinnedMessages.length);
    } else {
      onTapMessage(current);
    }
  };

  if (collapsed) {
    return (
      <TouchableOpacity
        onPress={() => setCollapsed(false)}
        style={styles.collapsedBar}
        activeOpacity={0.8}
      >
        <Ionicons name="pin" size={13} color={COLORS.warning} />
        <Text style={styles.collapsedText}>
          {pinnedMessages.length} pinned {pinnedMessages.length === 1 ? 'message' : 'messages'}
        </Text>
        <Ionicons name="chevron-down-outline" size={13} color={COLORS.textMuted} />
      </TouchableOpacity>
    );
  }

  return (
    <Animated.View entering={FadeIn.duration(250)} style={styles.bar}>
      {/* Left accent */}
      <View style={styles.accentBar} />

      {/* Content */}
      <TouchableOpacity
        onPress={handleTap}
        style={styles.content}
        activeOpacity={0.8}
      >
        <View style={styles.header}>
          <Ionicons name="pin" size={12} color={COLORS.warning} />
          <Text style={styles.headerText}>
            Pinned Message
            {pinnedMessages.length > 1 && (
              <Text style={styles.headerCount}> {currentIndex + 1}/{pinnedMessages.length}</Text>
            )}
          </Text>
          {pinnedMessages.length > 1 && (
            <Text style={styles.cycleHint}>tap to cycle</Text>
          )}
        </View>

        <Text style={styles.messagePreview} numberOfLines={1}>
          {current.content}
        </Text>

        <Text style={styles.authorLine} numberOfLines={1}>
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
            <Ionicons name="close" size={14} color={COLORS.textMuted} />
          </TouchableOpacity>
        )}
        <TouchableOpacity
          onPress={() => setCollapsed(true)}
          style={styles.actionBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chevron-up-outline" size={14} color={COLORS.textMuted} />
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: `${COLORS.warning}10`,
    borderBottomWidth: 1,
    borderBottomColor: `${COLORS.warning}25`,
    paddingRight: SPACING.md,
    gap: 10,
  },
  accentBar: {
    width: 3,
    alignSelf: 'stretch',
    backgroundColor: COLORS.warning,
  },
  content: {
    flex: 1,
    paddingVertical: 9,
    paddingLeft: SPACING.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  headerText: {
    color: COLORS.warning,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  headerCount: {
    color: COLORS.textMuted,
    fontWeight: '400',
  },
  cycleHint: {
    color: COLORS.textMuted,
    fontSize: 9,
    marginLeft: 4,
  },
  messagePreview: {
    color: COLORS.textPrimary,
    fontSize: FONTS.sizes.sm,
    fontWeight: '500',
    lineHeight: 18,
  },
  authorLine: {
    color: COLORS.textMuted,
    fontSize: 10,
    marginTop: 1,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  actionBtn: {
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: COLORS.backgroundElevated,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  // Collapsed state
  collapsedBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    backgroundColor: `${COLORS.warning}08`,
    borderBottomWidth: 1,
    borderBottomColor: `${COLORS.warning}20`,
  },
  collapsedText: {
    flex: 1,
    color: COLORS.textMuted,
    fontSize: FONTS.sizes.xs,
    fontWeight: '600',
  },
});