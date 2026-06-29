// src/components/workspace/WorkspaceReportCard.tsx
// Report card in the workspace shared feed.
//
// Part 51 UPDATE (Feature 4): added an optional "Remove" (trash) button in the
// footer, shown only when `canRemove` is true (editors/owners). Tapping it
// confirms via Alert, then calls `onRemove()`.
//
// Part 55 THEME UPDATE — All COLORS.* references moved out of StyleSheet.create
//   and module-level constants into render-time reads so the live singleton is
//   consumed on every render. useTheme() provides the version token that
//   triggers re-renders on theme change.
//
// REDESIGN — Layout overhaul:
//   • Left accent bar (depth-colored) replaces the floating badge — gives each
//     card an immediate visual identity and removes badge/header clutter.
//   • Meta row is now its own dedicated strip: depth label · spacer · comment
//     chip · date — the pin button that workspace-detail overlays sits in the
//     top-right corner of the card *outside* this row so it never collides.
//   • Footer is two sub-rows: avatar row on top, stats+remove on the bottom.
//     This prevents the avatar text from competing with the stat pills for width.

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { WorkspaceReport } from '../../types';
import { Avatar } from '../common/Avatar';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../constants/theme';
import { useTheme } from '../../context/ThemeContext';

// ─── Depth helpers — resolved at render time (NOT module-level) ───────────────

function getDepthColor(depth: string): string {
  switch (depth) {
    case 'quick':  return COLORS.success;
    case 'expert': return COLORS.pro;
    default:       return COLORS.primary; // 'deep' and anything else
  }
}

function getDepthIcon(depth: string): string {
  switch (depth) {
    case 'quick':  return 'flash-outline';
    case 'expert': return 'ribbon-outline';
    default:       return 'layers-outline'; // deep
  }
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  item:       WorkspaceReport;
  onPress:    () => void;
  index?:     number;
  // Part 51 — Feature 4: remove shared report (editors/owners only)
  canRemove?: boolean;
  onRemove?:  () => Promise<void> | void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function WorkspaceReportCard({
  item, onPress, index = 0, canRemove = false, onRemove,
}: Props) {
  // Version token — forces re-render when theme changes so inline COLORS.*
  // reads pick up the new palette.
  useTheme();

  const r       = item.report;
  const profile = item.addedByProfile;
  const depth   = r?.depth ?? 'deep';
  const dColor  = getDepthColor(depth);
  const dIcon   = getDepthIcon(depth);

  const reliability = r?.reliabilityScore ?? 0;
  const relColor    =
    reliability >= 7 ? COLORS.success
    : reliability >= 5 ? COLORS.warning
    : COLORS.error;

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
            try   { await onRemove(); }
            finally { setIsRemoving(false); }
          },
        },
      ],
    );
  };

  // Formatted date
  const dateLabel = new Date(item.addedAt).toLocaleDateString('en-US', {
    month: 'short',
    day:   'numeric',
  });

  return (
    <Animated.View entering={FadeInDown.duration(400).delay(index * 50)}>
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.75}
        style={[
          styles.card,
          {
            borderColor: COLORS.border,
            ...SHADOWS.small,
          },
        ]}
      >
        {/* ── Background gradient ─────────────────────────────────────────── */}
        <LinearGradient
          colors={[COLORS.backgroundElevated, COLORS.backgroundCard]}
          style={styles.gradient}
        >
          {/* ── Left accent bar (depth-colored) ─────────────────────────── */}
          {/*    This is the signature element: a 3px strip that communicates  */}
          {/*    depth at a glance and gives each card a distinct color identity */}
          <View style={[styles.accentBar, { backgroundColor: dColor }]} />

          {/* ── Content area (everything right of the accent bar) ────────── */}
          <View style={styles.content}>

            {/* ── Meta row ─────────────────────────────────────────────────── */}
            {/*    depth icon+label · flex spacer · comment chip · date        */}
            {/*    The pin button that workspace-detail overlays sits in the    */}
            {/*    card's top-right corner via absolute positioning — it has    */}
            {/*    16 px of clearance from this row's date text so they never  */}
            {/*    collide. (Pin button is rendered by the parent, not here.)   */}
            <View style={styles.metaRow}>
              {/* Depth pill */}
              <View style={[styles.depthPill, { backgroundColor: `${dColor}18` }]}>
                <Ionicons name={dIcon as any} size={10} color={dColor} />
                <Text style={[styles.depthLabel, { color: dColor }]}>
                  {depth.toUpperCase()}
                </Text>
              </View>

              <View style={styles.spacer} />

              {/* Comment count chip */}
              {item.commentCount !== undefined && item.commentCount > 0 && (
                <View style={[
                  styles.commentChip,
                  { backgroundColor: `${COLORS.primary}12` },
                ]}>
                  <Ionicons name="chatbubble-outline" size={10} color={COLORS.primary} />
                  <Text style={[styles.commentText, { color: COLORS.primary }]}>
                    {item.commentCount}
                  </Text>
                </View>
              )}

              {/* Date — right-aligned; pin button has 36 px reserved via paddingRight */}
              <Text style={[styles.dateText, { color: COLORS.textMuted }]}>
                {dateLabel}
              </Text>
            </View>

            {/* ── Title ────────────────────────────────────────────────────── */}
            <Text style={[styles.title, { color: COLORS.textPrimary }]}>
              {r?.title ?? r?.query ?? 'Research Report'}
            </Text>

            {/* ── Summary ──────────────────────────────────────────────────── */}
            {r?.executiveSummary ? (
              <Text
                style={[styles.summary, { color: COLORS.textSecondary }]}
                numberOfLines={2}
              >
                {r.executiveSummary}
              </Text>
            ) : null}

            {/* ── Divider ──────────────────────────────────────────────────── */}
            <View style={[styles.divider, { backgroundColor: COLORS.border }]} />

            {/* ── Footer ───────────────────────────────────────────────────── */}
            {/*    Two sub-rows keeps avatar text & stat pills from competing   */}

            {/* Row 1: who added */}
            <View style={styles.addedByRow}>
              <Avatar
                url={profile?.avatarUrl}
                name={profile?.fullName ?? profile?.username}
                size={20}
              />
              <Text
                style={[styles.addedByText, { color: COLORS.textMuted }]}
                numberOfLines={1}
              >
                {profile?.fullName ?? profile?.username ?? 'Unknown'}
              </Text>
            </View>

            {/* Row 2: stats + remove */}
            <View style={styles.statsRow}>
              {/* Sources count */}
              {(r?.sourcesCount ?? 0) > 0 && (
                <View style={[
                  styles.statPill,
                  { backgroundColor: `${COLORS.textMuted}0D` },
                ]}>
                  <Ionicons name="link-outline" size={10} color={COLORS.textMuted} />
                  <Text style={[styles.statText, { color: COLORS.textMuted }]}>
                    {r!.sourcesCount} sources
                  </Text>
                </View>
              )}

              {/* Reliability score */}
              {reliability > 0 && (
                <View style={[styles.statPill, { backgroundColor: `${relColor}15` }]}>
                  <Ionicons name="shield-checkmark-outline" size={10} color={relColor} />
                  <Text style={[styles.statText, { color: relColor }]}>
                    {reliability}/10
                  </Text>
                </View>
              )}

              <View style={styles.spacer} />

              {/* Part 51 — Remove button (editors / owners only) */}
              {canRemove && onRemove && (
                <TouchableOpacity
                  onPress={handleRemove}
                  disabled={isRemoving}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  style={[
                    styles.removeBtn,
                    {
                      backgroundColor: isRemoving
                        ? `${COLORS.error}08`
                        : `${COLORS.error}10`,
                      borderColor: `${COLORS.error}22`,
                    },
                  ]}
                >
                  {isRemoving ? (
                    <ActivityIndicator size="small" color={COLORS.error} />
                  ) : (
                    <>
                      <Ionicons name="trash-outline" size={11} color={COLORS.error} />
                      <Text style={[styles.removeBtnText, { color: COLORS.error }]}>
                        Remove
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </View>
          </View>
        </LinearGradient>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
// Only layout, geometry, and theme-independent values live here.
// Every COLORS.* read is in inline styles inside the component body above.

const styles = StyleSheet.create({
  // Outer card shell
  card: {
    marginBottom:  SPACING.sm,
    borderRadius:  RADIUS.lg,
    borderWidth:   1,
    overflow:      'hidden',
  },

  // Full-card gradient wrapper — row direction so accent bar sits flush left
  gradient: {
    flexDirection: 'row',
  },

  // ── Accent bar ────────────────────────────────────────────────────────────
  // 3 px wide, full card height, depth-colored. The "signature element":
  // communicates depth instantly and gives every card a distinct colour identity
  // without adding noise to the content area.
  accentBar: {
    width:        3,
    // height is set by content; 'undefined' = stretch to fill
    borderRadius: 0, // flush with card edges (overflow:hidden rounds the corners)
  },

  // ── Content area (everything right of the accent bar) ─────────────────────
  content: {
    flex:          1,
    padding:       SPACING.md,
    gap:           SPACING.xs,
    // Right padding is larger so workspace-detail's pin overlay (top-right)
    // has guaranteed clearance from the date text in the meta row.
    paddingRight:  SPACING.md + 36,
  },

  // ── Meta row ──────────────────────────────────────────────────────────────
  metaRow: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            6,
  },

  depthPill: {
    flexDirection:    'row',
    alignItems:       'center',
    gap:              3,
    borderRadius:     RADIUS.full,
    paddingHorizontal: 7,
    paddingVertical:  2,
  },
  depthLabel: {
    fontSize:    FONTS.sizes.xs - 1, // 10 px — tiny but readable
    fontWeight:  '800',
    letterSpacing: 0.6,
  },

  commentChip: {
    flexDirection:    'row',
    alignItems:       'center',
    gap:              3,
    borderRadius:     RADIUS.full,
    paddingHorizontal: 6,
    paddingVertical:  2,
  },
  commentText: {
    fontSize:   FONTS.sizes.xs,
    fontWeight: '700',
  },

  dateText: {
    fontSize: FONTS.sizes.xs,
  },

  // ── Title & summary ───────────────────────────────────────────────────────
  title: {
    fontSize:   FONTS.sizes.base,
    fontWeight: '700',
    lineHeight: 22,
    marginTop:  2,
  },
  summary: {
    fontSize:   FONTS.sizes.xs,
    lineHeight: 18,
  },

  // ── Divider ───────────────────────────────────────────────────────────────
  divider: {
    height:      StyleSheet.hairlineWidth,
    marginTop:   SPACING.xs,
    marginBottom: 2,
  },

  // ── Footer ────────────────────────────────────────────────────────────────
  addedByRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           6,
  },
  addedByText: {
    fontSize: FONTS.sizes.xs,
    flex:     1,
  },

  statsRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           6,
    marginTop:     2,
  },
  statPill: {
    flexDirection:    'row',
    alignItems:       'center',
    gap:              3,
    borderRadius:     RADIUS.full,
    paddingHorizontal: 7,
    paddingVertical:  2,
  },
  statText: {
    fontSize: FONTS.sizes.xs,
  },

  // Remove button
  removeBtn: {
    flexDirection:    'row',
    alignItems:       'center',
    gap:              4,
    height:           24,
    borderRadius:     RADIUS.sm,
    paddingHorizontal: 8,
    borderWidth:      1,
  },
  removeBtnText: {
    fontSize:   FONTS.sizes.xs,
    fontWeight: '600',
  },

  // Utility
  spacer: { flex: 1 },
});