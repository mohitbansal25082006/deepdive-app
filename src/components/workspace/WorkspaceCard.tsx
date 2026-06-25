// src/components/workspace/WorkspaceCard.tsx
//
// Part 13A  — logo image support
// Part 50.9 — Full visual redesign: glowing logo ring, accent bar, role crown,
//             richer gradient, depth shadows, polished meta chips.
// Part 55.2 — Fully theme-integrated: all hardcoded colors replaced with live
//             COLORS from the theme system. No dark-only assumptions.
// Part 55.3 — THEME-SAFETY OVERHAUL: eliminated every module-level COLORS.*
//             capture that caused stale colors on theme switches.
//
//   ROOT CAUSES FIXED
//   ─────────────────
//   • ROLE_COLOR / ACCENT_GRADIENTS were module-level constants — they captured
//     COLORS.* at import time and never updated when the theme changed.
//   • ACCENT_GRADIENTS referenced COLORS.primary/secondary/accent/etc. at
//     module load; same problem.
//   • StyleSheet.create() blocks evaluated once — any COLORS.* inside them
//     was permanently frozen to whatever the theme was at first import.
//   • avatarInner / logoWrap used COLORS.backgroundElevated in StyleSheet —
//     also frozen.
//   • `shadowColor: COLORS.primary` in avatarRing style — frozen.
//
//   THE FIX: every COLORS.* reference has been moved to inline style objects
//   computed inside the component body on each render. StyleSheet.create()
//   now only contains layout, geometry, and numeric tokens — nothing that
//   reads from the color palette.
//
//   ACCENT GRADIENT — also made render-time. The hash is still keyed off the
//   workspace name for variety; it now indexes into a list of gradient-pair
//   *selectors* that resolve to live COLORS.* properties at call time.

import React, { useState } from 'react';
import {
  View, Text, Image, TouchableOpacity, StyleSheet,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Workspace, WorkspaceRole } from '../../types';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';
import { useTheme } from '../../context/ThemeContext';

// ─── Role display helpers — labels/icons are static; colors are render-time ───

const ROLE_LABEL: Record<WorkspaceRole, string> = {
  owner:  'Owner',
  editor: 'Editor',
  viewer: 'Viewer',
};

const ROLE_ICON: Record<WorkspaceRole, keyof typeof Ionicons.glyphMap> = {
  owner:  'star',
  editor: 'create-outline',
  viewer: 'eye-outline',
};

// Returns the live role color — called inside the component body so it always
// reads the current COLORS singleton (post-theme-switch).
function getRoleColor(role: WorkspaceRole): string {
  switch (role) {
    case 'owner':  return COLORS.pro;
    case 'editor': return COLORS.primary;
    default:       return COLORS.textSecondary;
  }
}

// ─── Accent gradient — render-time, live COLORS ───────────────────────────────
// Each "selector" is a function that returns a gradient pair from the live
// palette. The hash is deterministic per workspace name, so each workspace always
// gets the same accent family, but the exact hex values track the active theme.

type GradientPair = [string, string];

const ACCENT_SELECTORS: Array<() => GradientPair> = [
  () => [COLORS.primary,   COLORS.primaryLight],
  () => [COLORS.secondary, COLORS.primaryLight],
  () => [COLORS.accent,    COLORS.success],
  () => [COLORS.info,      COLORS.primary],
  () => [COLORS.warning,   COLORS.secondary],
];

function accentFor(name: string): GradientPair {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return ACCENT_SELECTORS[h % ACCENT_SELECTORS.length]();
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  workspace: Workspace;
  onPress:   () => void;
  index?:    number;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function WorkspaceCard({ workspace, onPress, index = 0 }: Props) {
  // Version token — forces re-render on every theme change so all inline
  // COLORS.* reads below pick up the freshly-mutated palette.
  useTheme();

  const role     = workspace.userRole ?? 'viewer';
  const initials = workspace.name.slice(0, 2).toUpperCase();
  const [imgError, setImgError] = useState(false);

  const showImage = !!workspace.avatarUrl && !imgError;

  // ── Resolved colors (all render-time reads) ──────────────────────────────
  const accent    = accentFor(workspace.name);   // [colorA, colorB] from live COLORS
  const roleColor = getRoleColor(role);

  // Card background: backgroundCard → backgroundElevated.
  // On dark themes: near-black → dark-elevated  ✓ readable
  // On light themes: white → very light gray     ✓ readable
  const cardGradient: GradientPair = [COLORS.backgroundCard, COLORS.backgroundElevated];

  // Avatar inner fill: a semi-transparent tint of the accent rather than a flat
  // surface token — keeps it readable across all themes.
  const avatarInnerBg = `${accent[0]}22`;

  // Border: slightly more visible than COLORS.border to separate card from
  // background on light themes while remaining subtle on dark.
  const cardBorderColor = COLORS.border;

  // Chevron container: elevated surface
  const chevronBg = `${COLORS.textMuted}18`;

  // Meta chip: elevated surface  
  const metaChipBg = `${COLORS.textMuted}14`;

  return (
    <Animated.View
      entering={FadeInDown.duration(400).delay(index * 60)}
      style={[
        styles.outer,
        {
          // Shadow tracks the accent so the glow matches the workspace's color
          shadowColor: accent[0],
        },
      ]}
    >
      <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={styles.touch}>
        <LinearGradient
          colors={cardGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.card, { borderColor: cardBorderColor }]}
        >
          {/* ── Left accent bar (gradient, render-time accent colors) ──────── */}
          <LinearGradient
            colors={accent}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={styles.accentBar}
          />

          {/* ── Avatar block with glow ring ──────────────────────────────── */}
          <View style={styles.avatarBlock}>
            {/*
              The ring is the signature element: a gradient border whose colors
              always come from the live COLORS palette, so it shifts hue as the
              theme changes while always being on-brand.
            */}
            <LinearGradient
              colors={accent}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[
                styles.avatarRing,
                {
                  // Glow shadow — accent-tinted so it reads on both dark and light
                  shadowColor:   accent[0],
                  shadowOffset:  { width: 0, height: 2 },
                  shadowOpacity: 0.35,
                  shadowRadius:  8,
                  elevation:     4,
                },
              ]}
            >
              {showImage ? (
                <View style={[styles.logoWrap, { backgroundColor: avatarInnerBg }]}>
                  <Image
                    source={{ uri: workspace.avatarUrl! }}
                    style={styles.logoImage}
                    resizeMode="cover"
                    onError={() => setImgError(true)}
                  />
                </View>
              ) : (
                <View style={[styles.avatarInner, { backgroundColor: avatarInnerBg }]}>
                  <Text style={[styles.initials, { color: COLORS.textPrimary }]}>
                    {initials}
                  </Text>
                </View>
              )}
            </LinearGradient>

            {/* Personal indicator dot */}
            {workspace.isPersonal && (
              <View
                style={[
                  styles.personalDot,
                  {
                    backgroundColor: COLORS.textMuted,
                    borderColor:     COLORS.backgroundCard,
                  },
                ]}
              >
                <Ionicons name="person" size={9} color={COLORS.textPrimary} />
              </View>
            )}
          </View>

          {/* ── Info ─────────────────────────────────────────────────────── */}
          <View style={styles.info}>
            {/* Name row */}
            <View style={styles.nameRow}>
              <Text
                style={[styles.name, { color: COLORS.textPrimary }]}
                numberOfLines={1}
              >
                {workspace.name}
              </Text>
              {role === 'owner' && (
                <Ionicons
                  name="star"
                  size={13}
                  color={COLORS.pro}
                  style={styles.ownerStar}
                />
              )}
            </View>

            {/* Description / fallback */}
            {workspace.description ? (
              <Text
                style={[styles.desc, { color: COLORS.textSecondary }]}
                numberOfLines={1}
              >
                {workspace.description}
              </Text>
            ) : (
              <Text
                style={[styles.descMuted, { color: COLORS.textMuted }]}
                numberOfLines={1}
              >
                {workspace.isPersonal ? 'Your personal workspace' : 'Team workspace'}
              </Text>
            )}

            {/* Meta row: role badge + count chips */}
            <View style={styles.meta}>
              {/* Role badge */}
              <View
                style={[
                  styles.roleBadge,
                  {
                    backgroundColor: `${roleColor}1F`,
                    borderColor:     `${roleColor}40`,
                  },
                ]}
              >
                <Ionicons name={ROLE_ICON[role]} size={9} color={roleColor} />
                <Text style={[styles.roleText, { color: roleColor }]}>
                  {ROLE_LABEL[role]}
                </Text>
              </View>

              {/* Member count */}
              {(workspace.memberCount ?? 0) > 0 && (
                <View style={[styles.metaChip, { backgroundColor: metaChipBg }]}>
                  <Ionicons name="people" size={10} color={COLORS.textMuted} />
                  <Text style={[styles.metaText, { color: COLORS.textSecondary }]}>
                    {workspace.memberCount}
                  </Text>
                </View>
              )}

              {/* Report count */}
              {(workspace.reportCount ?? 0) > 0 && (
                <View style={[styles.metaChip, { backgroundColor: metaChipBg }]}>
                  <Ionicons name="document-text" size={10} color={COLORS.textMuted} />
                  <Text style={[styles.metaText, { color: COLORS.textSecondary }]}>
                    {workspace.reportCount}
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* ── Chevron ──────────────────────────────────────────────────── */}
          <View style={[styles.chevronWrap, { backgroundColor: chevronBg }]}>
            <Ionicons
              name="chevron-forward"
              size={16}
              color={COLORS.textSecondary}
            />
          </View>
        </LinearGradient>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
// Layout, geometry, and numeric tokens ONLY.
// No COLORS.* references — those all live in inline styles computed at render
// time inside the component body above so they re-read the live singleton on
// every render.

const styles = StyleSheet.create({
  // ── Outer shadow container ─────────────────────────────────────────────────
  outer: {
    marginBottom:  SPACING.md,
    // shadowColor is set inline (accent-tinted); only geometry here.
    shadowOffset:  { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius:  14,
    elevation:     6,
  },

  // ── Touchable + card shell ────────────────────────────────────────────────
  touch: {
    borderRadius: RADIUS.xl,
    overflow:     'hidden',
  },
  card: {
    flexDirection:   'row',
    alignItems:      'center',
    paddingVertical: SPACING.md,
    paddingRight:    SPACING.md,
    // Extra left pad so content clears the accent bar
    paddingLeft:     SPACING.md + 8,
    borderRadius:    RADIUS.xl,
    borderWidth:     1,
    gap:             SPACING.md,
  },

  // ── Left accent bar ───────────────────────────────────────────────────────
  // Absolutely positioned flush-left; vertically inset so it sits inside the
  // card's rounded corners rather than fighting with them.
  accentBar: {
    position:               'absolute',
    left:                   0,
    top:                    14,
    bottom:                 14,
    width:                  4,
    borderTopRightRadius:   4,
    borderBottomRightRadius: 4,
  },

  // ── Avatar ────────────────────────────────────────────────────────────────
  avatarBlock: {
    position:  'relative',
    flexShrink: 0,
  },
  avatarRing: {
    width:          56,
    height:         56,
    borderRadius:   17,
    alignItems:     'center',
    justifyContent: 'center',
    // 2 px padding so the gradient ring is visible around the inner circle
    padding:        2,
  },
  avatarInner: {
    flex:           1,
    width:          '100%',
    borderRadius:   15,
    alignItems:     'center',
    justifyContent: 'center',
    // backgroundColor set inline
  },
  logoWrap: {
    flex:         1,
    width:        '100%',
    borderRadius: 15,
    overflow:     'hidden',
    // backgroundColor set inline
  },
  logoImage: {
    width:        '100%',
    height:       '100%',
    borderRadius: 15,
  },
  initials: {
    // color set inline
    fontSize:      FONTS.sizes.md,
    fontWeight:    '800',
    letterSpacing: 0.5,
  },
  personalDot: {
    position:        'absolute',
    bottom:          -2,
    right:           -2,
    width:           20,
    height:          20,
    borderRadius:    10,
    // backgroundColor + borderColor set inline
    alignItems:      'center',
    justifyContent:  'center',
    borderWidth:     2.5,
  },

  // ── Info column ───────────────────────────────────────────────────────────
  info: {
    flex:     1,
    gap:      4,
    minWidth: 0,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems:    'center',
  },
  name: {
    // color set inline
    fontSize:   FONTS.sizes.md,
    fontWeight: '800',
    flexShrink: 1,
  },
  ownerStar: {
    marginLeft: 5,
  },
  desc: {
    // color set inline
    fontSize: FONTS.sizes.xs,
  },
  descMuted: {
    // color set inline
    fontSize:   FONTS.sizes.xs,
    fontStyle:  'italic',
  },

  // ── Meta chips row ────────────────────────────────────────────────────────
  meta: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           7,
    marginTop:     4,
    flexWrap:      'wrap',
  },
  roleBadge: {
    flexDirection:    'row',
    alignItems:       'center',
    gap:              4,
    borderRadius:     RADIUS.full,
    paddingHorizontal: 9,
    paddingVertical:  3,
    borderWidth:      1,
    // backgroundColor + borderColor set inline
  },
  roleText: {
    // color set inline
    fontSize:      FONTS.sizes.xs,
    fontWeight:    '800',
    letterSpacing: 0.2,
  },
  metaChip: {
    flexDirection:    'row',
    alignItems:       'center',
    gap:              4,
    // backgroundColor set inline
    borderRadius:     RADIUS.full,
    paddingHorizontal: 8,
    paddingVertical:  3,
  },
  metaText: {
    // color set inline
    fontSize:   FONTS.sizes.xs,
    fontWeight: '600',
  },

  // ── Chevron ───────────────────────────────────────────────────────────────
  chevronWrap: {
    width:          30,
    height:         30,
    borderRadius:   10,
    // backgroundColor set inline
    alignItems:     'center',
    justifyContent: 'center',
    flexShrink:     0,
  },
});