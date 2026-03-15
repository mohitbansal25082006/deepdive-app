// src/components/workspace/MentionSuggestions.tsx
// Part 18 — Floating member-suggestion list shown when the user types @
// in the ChatInput. Sits just above the input bar, renders up to 6 matches,
// and fires onSelect when the user taps a member row.

import React, { useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
} from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '../common/Avatar';
import { ChatMember } from '../../types/chat';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';

const MAX_RESULTS = 6;

interface Props {
  /** Whether the suggestion panel should be visible at all */
  visible:   boolean;
  /** The text the user typed after @  (empty = show all members) */
  query:     string;
  /** Full list of chat members (editors + owners of the workspace) */
  members:   ChatMember[];
  /** Called with the selected member — parent inserts the mention */
  onSelect:  (member: ChatMember) => void;
  /** Called when the user taps outside / presses back */
  onDismiss?: () => void;
}

export function MentionSuggestions({
  visible,
  query,
  members,
  onSelect,
  onDismiss,
}: Props) {
  const filtered = useMemo(() => {
    if (!query) return members.slice(0, MAX_RESULTS);
    const q = query.toLowerCase();
    return members
      .filter(m => {
        const name = (m.fullName   ?? '').toLowerCase();
        const user = (m.username   ?? '').toLowerCase();
        return name.includes(q) || user.includes(q);
      })
      .slice(0, MAX_RESULTS);
  }, [members, query]);

  if (!visible || filtered.length === 0) return null;

  return (
    <Animated.View
      entering={FadeIn.duration(160)}
      exiting={FadeOut.duration(120)}
      style={styles.container}
    >
      {/* Header row */}
      <View style={styles.header}>
        <Ionicons name="at-outline" size={12} color={COLORS.primary} />
        <Text style={styles.headerText}>Mention a member</Text>
        {onDismiss && (
          <TouchableOpacity onPress={onDismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={14} color={COLORS.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {/* Member list */}
      <FlatList
        data={filtered}
        keyExtractor={(m) => m.userId}
        keyboardShouldPersistTaps="always"
        scrollEnabled={filtered.length > 4}
        style={styles.list}
        renderItem={({ item }) => (
          <MemberRow member={item} onSelect={onSelect} />
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </Animated.View>
  );
}

// ─── Member row ───────────────────────────────────────────────────────────────

function MemberRow({
  member,
  onSelect,
}: {
  member:   ChatMember;
  onSelect: (m: ChatMember) => void;
}) {
  const isOwner     = member.role === 'owner';
  const roleColor   = isOwner ? (COLORS.pro ?? COLORS.warning) : COLORS.primary;
  const displayName = member.fullName ?? member.username ?? 'Unknown';

  return (
    <TouchableOpacity
      style={styles.row}
      onPress={() => onSelect(member)}
      activeOpacity={0.7}
    >
      {/* Avatar */}
      <Avatar
        url={member.avatarUrl}
        name={displayName}
        size={34}
      />

      {/* Name + username */}
      <View style={styles.nameCol}>
        <Text style={styles.fullName} numberOfLines={1}>
          {displayName}
        </Text>
        {member.username && (
          <Text style={styles.username} numberOfLines={1}>
            @{member.username}
          </Text>
        )}
      </View>

      {/* Role badge */}
      <View style={[styles.roleBadge, { backgroundColor: `${roleColor}18` }]}>
        {isOwner && <Text style={styles.crownEmoji}>👑</Text>}
        <Text style={[styles.roleText, { color: roleColor }]}>
          {isOwner ? 'Owner' : 'Editor'}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    position:        'absolute',
    bottom:          '100%',
    left:            0,
    right:           0,
    backgroundColor: COLORS.backgroundCard,
    borderRadius:    RADIUS.xl,
    borderWidth:     1,
    borderColor:     COLORS.border,
    marginBottom:    6,
    marginHorizontal: SPACING.sm,
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: -4 },
    shadowOpacity:   0.25,
    shadowRadius:    14,
    elevation:       14,
    overflow:        'hidden',
    maxHeight:       290,
    zIndex:          200,
  },
  header: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               6,
    paddingHorizontal: SPACING.md,
    paddingVertical:   8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor:   COLORS.backgroundElevated,
  },
  headerText: {
    flex:           1,
    color:          COLORS.textMuted,
    fontSize:       FONTS.sizes.xs,
    fontWeight:     '700',
    textTransform:  'uppercase',
    letterSpacing:  0.5,
  },
  list: {
    maxHeight: 240,
  },
  row: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingHorizontal: SPACING.md,
    paddingVertical:   10,
    gap:               10,
    backgroundColor:   'transparent',
  },
  nameCol: {
    flex: 1,
    minWidth: 0,
  },
  fullName: {
    color:      COLORS.textPrimary,
    fontSize:   FONTS.sizes.sm,
    fontWeight: '700',
  },
  username: {
    color:     COLORS.textMuted,
    fontSize:  FONTS.sizes.xs,
    marginTop: 2,
  },
  roleBadge: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             3,
    borderRadius:    RADIUS.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
    flexShrink:      0,
  },
  crownEmoji: {
    fontSize: 10,
  },
  roleText: {
    fontSize:   10,
    fontWeight: '700',
  },
  separator: {
    height:          1,
    backgroundColor: `${COLORS.border}50`,
    marginLeft:      54, // align with text (avatar 34 + gap 10 + padding 10)
  },
});