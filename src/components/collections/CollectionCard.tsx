// src/components/collections/CollectionCard.tsx
// Part 35 — Collections: Card displayed in the list/grid
// Part 50.8 — UI UPGRADE (gradient/glass system)
// Part 55.2 — FULL THEME-COMPATIBILITY PASS (including module-level style fix)
//
// WHY THIS FILE HAS GETTER-BASED STYLES
//   StyleSheet.create() is evaluated ONCE at module import time, before the
//   ThemeProvider has a chance to mutate COLORS. That means any color reference
//   baked into a StyleSheet.create() call keeps its value from the first
//   evaluation — so if the user switches themes, the card background/text/borders
//   don't update even though every inline COLORS.x reference does.
//
//   The fix (used throughout DeepDive when a component has StyleSheet styles
//   that reference COLORS): convert the affected StyleSheet entries to plain
//   object getters — functions that re-read COLORS on every render — and merge
//   them with the static part in the JSX. This is exactly the same technique
//   used in theme.ts for module-level styles.
//
//   ONLY the entries that reference COLORS need to be converted; the ones that
//   hold only layout values (padding, flexDirection, etc.) stay in StyleSheet.
//
// Part 55.2 specific changes vs Part 50.8:
//   • cardGradient: was ['#16162F', '#101024'] → now COLORS.gradientCard (inline prop)
//   • actionBtn background: was 'rgba(255,255,255,0.05)' → now getter-based COLORS.backgroundElevated
//   • actionBtn borderColor: was rgba white → now COLORS.border
//   • chevronWrap background: was 'rgba(255,255,255,0.04)' → getter-based COLORS.backgroundElevated
//   • footer date text, name text, description text: now read live COLORS tokens
//     (they were already using COLORS.x references but were in StyleSheet so needed
//      the getter pattern to update on theme-switch)
//   All props and behaviour unchanged.

import React, { memo } from 'react';
import {
  View,
  Text,
  Pressable,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Ionicons }      from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Collection }    from '../../types/collections';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../constants/theme';

interface CollectionCardProps {
  collection:  Collection;
  index:       number;
  onPress:     () => void;
  onLongPress?: () => void;
  showMenu?:   boolean;
  onEdit?:     () => void;
  onDelete?:   () => void;
}

function CollectionCardComponent({
  collection,
  index,
  onPress,
  onLongPress,
  showMenu,
  onEdit,
  onDelete,
}: CollectionCardProps) {
  const color = collection.color ?? COLORS.primary;

  // ── Getter-based styles that must re-read COLORS on each render ─────────────
  // These are plain objects (NOT cached by StyleSheet.create) so they always
  // pick up the freshly-mutated COLORS values after a theme switch.

  const dynActionBtn = {
    backgroundColor: COLORS.backgroundElevated,
    borderColor:     COLORS.border,
  };

  const dynChevronWrap = {
    backgroundColor: COLORS.backgroundElevated,
  };

  const dynName = {
    color: COLORS.textPrimary,
  };

  const dynDescription = {
    color: COLORS.textSecondary,
  };

  const dynDescriptionMuted = {
    color: COLORS.textMuted,
  };

  const dynDateText = {
    color: COLORS.textMuted,
  };

  const dynCardBorder = {
    borderColor: `${color}40`,
  };

  return (
    <Animated.View entering={FadeInDown.duration(350).delay(Math.min(index, 8) * 55)}>
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        style={({ pressed }) => [
          { transform: [{ scale: pressed ? 0.985 : 1 }], marginBottom: SPACING.sm },
        ]}
      >
        <View style={[styles.card, dynCardBorder]}>
          {/* 55.2: was ['#16162F', '#101024'] — always dark-indigo. Now
              COLORS.gradientCard which adapts to every theme (dark: deep surfaces;
              light: white/pale grey). Applied as an inline prop so it re-reads
              COLORS on every render. */}
          <LinearGradient
            colors={COLORS.gradientCard as [string, string]}
            style={styles.cardGradient}
          >
            {/* Left accent rail — uses the collection's own color, always correct */}
            <LinearGradient
              colors={[color, `${color}44`]}
              style={styles.accentRail}
            />

            <View style={styles.body}>
              {/* Icon circle */}
              <LinearGradient
                colors={[color, `${color}99`]}
                style={styles.iconCircle}
              >
                <Ionicons name={collection.icon as any} size={22} color="#FFF" />
              </LinearGradient>

              {/* Text block */}
              <View style={styles.textBlock}>
                <Text style={[styles.name, dynName]} numberOfLines={1}>
                  {collection.name}
                </Text>
                {collection.description ? (
                  <Text style={[styles.description, dynDescription]} numberOfLines={2}>
                    {collection.description}
                  </Text>
                ) : (
                  <Text style={[styles.descriptionMuted, dynDescriptionMuted]} numberOfLines={1}>
                    Tap to view items
                  </Text>
                )}
              </View>

              {/* Actions column */}
              <View style={styles.actions}>
                {showMenu ? (
                  <>
                    <TouchableOpacity
                      onPress={onEdit}
                      hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                      style={[styles.actionBtn, dynActionBtn]}
                    >
                      <Ionicons name="pencil-outline" size={15} color={COLORS.textSecondary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={onDelete}
                      hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                      style={[
                        styles.actionBtn,
                        dynActionBtn,
                        {
                          backgroundColor: `${COLORS.error}12`,
                          borderColor:     `${COLORS.error}30`,
                        },
                      ]}
                    >
                      <Ionicons name="trash-outline" size={15} color={COLORS.error} />
                    </TouchableOpacity>
                  </>
                ) : (
                  <View style={[styles.chevronWrap, dynChevronWrap]}>
                    <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
                  </View>
                )}
              </View>
            </View>

            {/* Footer: item count + date */}
            <View style={styles.footer}>
              <View style={[
                styles.countBadge,
                { backgroundColor: `${color}18`, borderColor: `${color}35` },
              ]}>
                <Ionicons name="layers-outline" size={10} color={color} />
                <Text style={[styles.countText, { color }]}>
                  {collection.itemCount} {collection.itemCount === 1 ? 'item' : 'items'}
                </Text>
              </View>
              <View style={styles.dateWrap}>
                <Ionicons name="time-outline" size={10} color={COLORS.textMuted} />
                <Text style={[styles.dateText, dynDateText]}>
                  {new Date(collection.updatedAt).toLocaleDateString('en-US', {
                    month: 'short',
                    day:   'numeric',
                  })}
                </Text>
              </View>
            </View>
          </LinearGradient>
        </View>
      </Pressable>
    </Animated.View>
  );
}

export const CollectionCard = memo(CollectionCardComponent);

// ─── Styles ────────────────────────────────────────────────────────────────────
// Only layout/structural values here — no COLORS references, since those need
// the getter pattern above to stay reactive to theme changes.

const styles = StyleSheet.create({
  card: {
    borderRadius: RADIUS.xl,
    borderWidth:  1,
    overflow:     'hidden',
    ...SHADOWS.small,
  },
  cardGradient: {
    paddingLeft: 6, // room for accent rail
  },
  accentRail: {
    position: 'absolute',
    left:     0,
    top:      0,
    bottom:   0,
    width:    4,
  },
  body: {
    flexDirection: 'row',
    alignItems:    'flex-start',
    padding:       SPACING.md,
    gap:           SPACING.md,
  },
  iconCircle: {
    width:          50,
    height:         50,
    borderRadius:   15,
    alignItems:     'center',
    justifyContent: 'center',
    flexShrink:     0,
    ...SHADOWS.small,
  },
  textBlock: {
    flex:     1,
    minWidth: 0,
    gap:      4,
  },
  // 55.2: color values moved to getter pattern above — only non-color props here
  name: {
    fontSize:   FONTS.sizes.base,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  description: {
    fontSize:  FONTS.sizes.xs,
    lineHeight: 17,
  },
  descriptionMuted: {
    fontSize: FONTS.sizes.xs,
  },
  actions: {
    alignItems:     'center',
    gap:            6,
    justifyContent: 'center',
    flexShrink:     0,
  },
  // 55.2: backgroundColor and borderColor moved to dynActionBtn getter above
  actionBtn: {
    width:          30,
    height:         30,
    borderRadius:   9,
    alignItems:     'center',
    justifyContent: 'center',
    borderWidth:    1,
  },
  // 55.2: backgroundColor moved to dynChevronWrap getter above
  chevronWrap: {
    width:          30,
    height:         30,
    borderRadius:   9,
    alignItems:     'center',
    justifyContent: 'center',
  },
  footer: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal: SPACING.md,
    paddingBottom:     SPACING.sm,
  },
  countBadge: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               4,
    borderRadius:      RADIUS.full,
    paddingHorizontal: 9,
    paddingVertical:   4,
    borderWidth:       1,
  },
  countText: {
    fontSize:   FONTS.sizes.xs,
    fontWeight: '700',
  },
  dateWrap: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           4,
  },
  // 55.2: color moved to dynDateText getter above
  dateText: {
    fontSize: FONTS.sizes.xs,
  },
});