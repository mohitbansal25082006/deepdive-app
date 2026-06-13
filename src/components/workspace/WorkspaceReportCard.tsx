// src/components/workspace/WorkspaceReportCard.tsx
// Report card in the workspace shared feed.
//
// Part 51 UPDATE (Feature 4): added an optional "Remove" (trash) button in the
// footer, shown only when `canRemove` is true (editors/owners). Tapping it
// confirms via Alert, then calls `onRemove()`. The button lives in the footer
// (not the top corner) so it never collides with the pin button that
// workspace-detail overlays at the top-right of the card.

import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { WorkspaceReport } from '../../types';
import { Avatar } from '../common/Avatar';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../constants/theme';

const DEPTH_COLOR: Record<string, string> = {
  quick:  COLORS.success,
  deep:   COLORS.primary,
  expert: COLORS.pro,
};

interface Props {
  item:      WorkspaceReport;
  onPress:   () => void;
  index?:    number;
  // Part 51 — Feature 4: remove shared report (editors/owners only)
  canRemove?: boolean;
  onRemove?:  () => Promise<void> | void;
}

export function WorkspaceReportCard({
  item, onPress, index = 0, canRemove = false, onRemove,
}: Props) {
  const r       = item.report;
  const profile = item.addedByProfile;
  const depth   = r?.depth ?? 'deep';
  const dColor  = DEPTH_COLOR[depth] ?? COLORS.primary;

  const reliability = r?.reliabilityScore ?? 0;
  const relColor    = reliability >= 7 ? COLORS.success : reliability >= 5 ? COLORS.warning : COLORS.error;

  const [isRemoving, setIsRemoving] = useState(false);

  const handleRemove = () => {
    if (!onRemove || isRemoving) return;
    Alert.alert(
      'Remove Report',
      `Remove "${(r?.title ?? r?.query ?? 'this report').slice(0, 60)}" from this workspace? ` +
      `It won't be deleted — just unshared from the team.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setIsRemoving(true);
            try {
              await onRemove();
            } finally {
              setIsRemoving(false);
            }
          },
        },
      ],
    );
  };

  return (
    <Animated.View entering={FadeInDown.duration(400).delay(index * 50)}>
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.8}
        style={styles.card}
      >
        <LinearGradient colors={['#1A1A35', '#12122A']} style={styles.gradient}>
          {/* Header row */}
          <View style={styles.header}>
            <View style={[styles.depthBadge, { backgroundColor: `${dColor}20` }]}>
              <Text style={[styles.depthText, { color: dColor }]}>{depth.toUpperCase()}</Text>
            </View>
            <View style={styles.headerRight}>
              {item.commentCount !== undefined && item.commentCount > 0 && (
                <View style={styles.commentCount}>
                  <Ionicons name="chatbubble-outline" size={12} color={COLORS.primary} />
                  <Text style={styles.commentCountText}>{item.commentCount}</Text>
                </View>
              )}
              <Text style={styles.dateText}>
                {new Date(item.addedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </Text>
            </View>
          </View>

          {/* Title */}
          <Text style={styles.title} numberOfLines={2}>
            {r?.title ?? r?.query ?? 'Research Report'}
          </Text>

          {/* Summary */}
          {r?.executiveSummary ? (
            <Text style={styles.summary} numberOfLines={2}>
              {r.executiveSummary}
            </Text>
          ) : null}

          {/* Footer */}
          <View style={styles.footer}>
            {/* Added by */}
            <View style={styles.addedBy}>
              <Avatar
                url={profile?.avatarUrl}
                name={profile?.fullName ?? profile?.username}
                size={22}
              />
              <Text style={styles.addedByText} numberOfLines={1}>
                {profile?.fullName ?? profile?.username ?? 'Unknown'}
              </Text>
            </View>

            {/* Stats + remove */}
            <View style={styles.stats}>
              {(r?.sourcesCount ?? 0) > 0 && (
                <View style={styles.stat}>
                  <Ionicons name="link-outline" size={11} color={COLORS.textMuted} />
                  <Text style={styles.statText}>{r!.sourcesCount}</Text>
                </View>
              )}
              {reliability > 0 && (
                <View style={[styles.stat, { backgroundColor: `${relColor}15` }]}>
                  <Ionicons name="shield-checkmark-outline" size={11} color={relColor} />
                  <Text style={[styles.statText, { color: relColor }]}>{reliability}/10</Text>
                </View>
              )}

              {/* Part 51 — Remove (editors/owners only) */}
              {canRemove && onRemove && (
                <TouchableOpacity
                  onPress={handleRemove}
                  disabled={isRemoving}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={styles.removeBtn}
                >
                  {isRemoving
                    ? <ActivityIndicator size="small" color={COLORS.error} />
                    : <Ionicons name="trash-outline" size={12} color={COLORS.error} />
                  }
                </TouchableOpacity>
              )}
            </View>
          </View>
        </LinearGradient>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: SPACING.sm, borderRadius: RADIUS.lg,
    borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden', ...SHADOWS.small,
  },
  gradient:    { padding: SPACING.md, gap: SPACING.sm },
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  depthBadge:  { borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 2 },
  depthText:   { fontSize: FONTS.sizes.xs, fontWeight: '800', letterSpacing: 0.5 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  commentCount:{ flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: `${COLORS.primary}15`, borderRadius: RADIUS.full, paddingHorizontal: 7, paddingVertical: 2 },
  commentCountText: { color: COLORS.primary, fontSize: FONTS.sizes.xs, fontWeight: '700' },
  dateText:    { color: COLORS.textMuted, fontSize: FONTS.sizes.xs },
  title:       { color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '700', lineHeight: 22 },
  summary:     { color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, lineHeight: 18 },
  footer:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  addedBy:     { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  addedByText: { color: COLORS.textMuted, fontSize: FONTS.sizes.xs, flex: 1 },
  stats:       { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stat:        {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    borderRadius: RADIUS.full, paddingHorizontal: 6, paddingVertical: 2,
    backgroundColor: `${COLORS.textMuted}10`,
  },
  statText:    { color: COLORS.textMuted, fontSize: FONTS.sizes.xs },
  // Part 51 — remove button
  removeBtn:   {
    width: 26, height: 26, borderRadius: 8,
    backgroundColor: `${COLORS.error}12`,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: `${COLORS.error}25`,
  },
});