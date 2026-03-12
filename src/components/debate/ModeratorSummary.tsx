// src/components/debate/ModeratorSummary.tsx
// Part 9 — Renders the Moderator Agent's balanced synthesis.
//
// Sections:
//   • Balanced verdict badge
//   • Perspective comparison summary
//   • Arguments For vs Against (side-by-side)
//   • Consensus Points
//   • Key Tensions
//   • Neutral Conclusion

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { LinearGradient }  from 'expo-linear-gradient';
import { Ionicons }        from '@expo/vector-icons';
import Animated, {
  FadeInDown,
  FadeIn,
}                          from 'react-native-reanimated';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../constants/theme';
import { DebateModerator }                         from '../../types';

// ─── Section header ───────────────────────────────────────────────────────────

function SectionLabel({ label, icon }: { label: string; icon: string }) {
  return (
    <View style={{
      flexDirection: 'row',
      alignItems:    'center',
      gap:           7,
      marginBottom:  SPACING.sm,
    }}>
      <Ionicons name={icon as any} size={14} color={COLORS.textMuted} />
      <Text style={{
        color:         COLORS.textMuted,
        fontSize:      FONTS.sizes.xs,
        fontWeight:    '700',
        letterSpacing: 0.8,
        textTransform: 'uppercase',
      }}>
        {label}
      </Text>
    </View>
  );
}

// ─── For / Against column ─────────────────────────────────────────────────────

function ArgumentColumn({
  title,
  items,
  color,
  icon,
}: {
  title:  string;
  items:  string[];
  color:  string;
  icon:   string;
}) {
  return (
    <View style={{ flex: 1 }}>
      {/* Column header */}
      <View style={{
        flexDirection:   'row',
        alignItems:      'center',
        gap:             6,
        marginBottom:    SPACING.sm,
        backgroundColor: `${color}12`,
        borderRadius:    RADIUS.md,
        padding:         SPACING.sm,
        borderWidth:     1,
        borderColor:     `${color}25`,
      }}>
        <Ionicons name={icon as any} size={14} color={color} />
        <Text style={{
          color:      color,
          fontSize:   FONTS.sizes.xs,
          fontWeight: '800',
          letterSpacing: 0.4,
        }}>
          {title}
        </Text>
      </View>

      {items.map((item, i) => (
        <View
          key={i}
          style={{
            flexDirection: 'row',
            alignItems:    'flex-start',
            gap:           8,
            marginBottom:  SPACING.sm,
          }}
        >
          <View style={{
            width:           5,
            height:          5,
            borderRadius:    3,
            backgroundColor: color,
            marginTop:       7,
            flexShrink:      0,
          }} />
          <Text style={{
            flex:       1,
            color:      COLORS.textSecondary,
            fontSize:   FONTS.sizes.xs,
            lineHeight: 18,
          }}>
            {item}
          </Text>
        </View>
      ))}
    </View>
  );
}

// ─── Bulleted list ────────────────────────────────────────────────────────────

function BulletList({
  items,
  bulletColor,
}: {
  items:       string[];
  bulletColor: string;
}) {
  return (
    <View style={{ gap: SPACING.sm }}>
      {items.map((item, i) => (
        <View
          key={i}
          style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}
        >
          <Ionicons
            name="checkmark-circle"
            size={14}
            color={bulletColor}
            style={{ marginTop: 3, flexShrink: 0 }}
          />
          <Text style={{
            flex:       1,
            color:      COLORS.textSecondary,
            fontSize:   FONTS.sizes.sm,
            lineHeight: 21,
          }}>
            {item}
          </Text>
        </View>
      ))}
    </View>
  );
}

// ─── Tension item ─────────────────────────────────────────────────────────────

function TensionItem({ text, index }: { text: string; index: number }) {
  return (
    <View style={{
      flexDirection:   'row',
      alignItems:      'flex-start',
      gap:             10,
      backgroundColor: `${COLORS.warning}08`,
      borderRadius:    RADIUS.md,
      padding:         SPACING.sm + 2,
      marginBottom:    6,
      borderLeftWidth: 3,
      borderLeftColor: COLORS.warning,
    }}>
      <Ionicons
        name="flash-outline"
        size={14}
        color={COLORS.warning}
        style={{ marginTop: 3, flexShrink: 0 }}
      />
      <Text style={{
        flex:       1,
        color:      COLORS.textSecondary,
        fontSize:   FONTS.sizes.sm,
        lineHeight: 20,
      }}>
        {text}
      </Text>
    </View>
  );
}

// ─── Expandable section ───────────────────────────────────────────────────────

function ExpandableSection({
  title,
  icon,
  children,
  defaultOpen = true,
  index = 0,
}: {
  title:        string;
  icon:         string;
  children:     React.ReactNode;
  defaultOpen?: boolean;
  index?:       number;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Animated.View
      entering={FadeInDown.duration(350).delay(index * 70)}
      style={{
        backgroundColor: COLORS.backgroundCard,
        borderRadius:    RADIUS.xl,
        marginBottom:    SPACING.md,
        borderWidth:     1,
        borderColor:     COLORS.border,
        overflow:        'hidden',
        ...SHADOWS.small,
      }}
    >
      {/* Section toggle */}
      <TouchableOpacity
        onPress={() => setOpen(o => !o)}
        activeOpacity={0.8}
        style={{
          flexDirection:   'row',
          alignItems:      'center',
          gap:             10,
          padding:         SPACING.md,
          paddingBottom:   open ? SPACING.sm : SPACING.md,
        }}
      >
        <View style={{
          width:           34,
          height:          34,
          borderRadius:    10,
          backgroundColor: COLORS.backgroundElevated,
          alignItems:      'center',
          justifyContent:  'center',
        }}>
          <Ionicons name={icon as any} size={16} color={COLORS.primary} />
        </View>
        <Text style={{
          flex:       1,
          color:      COLORS.textPrimary,
          fontSize:   FONTS.sizes.base,
          fontWeight: '700',
        }}>
          {title}
        </Text>
        <Ionicons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={COLORS.textMuted}
        />
      </TouchableOpacity>

      {open && (
        <View style={{
          paddingHorizontal: SPACING.md,
          paddingBottom:     SPACING.md,
        }}>
          {children}
        </View>
      )}
    </Animated.View>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface ModeratorSummaryProps {
  moderator: DebateModerator;
}

export function ModeratorSummary({ moderator }: ModeratorSummaryProps) {
  return (
    <View>
      {/* ── Balanced Verdict ─────────────────────────────────────────────── */}
      <Animated.View
        entering={FadeIn.duration(500)}
        style={{ marginBottom: SPACING.md }}
      >
        <LinearGradient
          colors={[`${COLORS.primary}20`, `${COLORS.secondary}15`]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            borderRadius: RADIUS.xl,
            padding:      SPACING.lg,
            borderWidth:  1,
            borderColor:  `${COLORS.primary}35`,
          }}
        >
          <View style={{
            flexDirection: 'row',
            alignItems:    'center',
            gap:           10,
            marginBottom:  SPACING.sm,
          }}>
            <View style={{
              width:           36,
              height:          36,
              borderRadius:    11,
              backgroundColor: `${COLORS.primary}25`,
              alignItems:      'center',
              justifyContent:  'center',
              borderWidth:     1,
              borderColor:     `${COLORS.primary}40`,
            }}>
              <Ionicons name="ribbon-outline" size={18} color={COLORS.primary} />
            </View>
            <View>
              <Text style={{
                color:         COLORS.primary,
                fontSize:      FONTS.sizes.xs,
                fontWeight:    '700',
                letterSpacing: 0.8,
                textTransform: 'uppercase',
              }}>
                Moderator's Balanced Verdict
              </Text>
            </View>
          </View>

          <Text style={{
            color:      COLORS.textPrimary,
            fontSize:   FONTS.sizes.base,
            fontWeight: '600',
            lineHeight: 24,
            fontStyle:  'italic',
          }}>
            "{moderator.balancedVerdict}"
          </Text>
        </LinearGradient>
      </Animated.View>

      {/* ── Perspective Comparison (Summary) ─────────────────────────────── */}
      <ExpandableSection
        title="Perspective Comparison"
        icon="git-compare-outline"
        defaultOpen
        index={0}
      >
        <Text style={{
          color:      COLORS.textSecondary,
          fontSize:   FONTS.sizes.sm,
          lineHeight: 22,
        }}>
          {moderator.summary}
        </Text>
      </ExpandableSection>

      {/* ── Arguments For vs Against ──────────────────────────────────────── */}
      <ExpandableSection
        title="Arguments For & Against"
        icon="git-branch-outline"
        defaultOpen
        index={1}
      >
        <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
          <ArgumentColumn
            title="FOR"
            items={moderator.argumentsFor}
            color={COLORS.success}
            icon="arrow-up-circle-outline"
          />
          <View style={{
            width:           1,
            backgroundColor: COLORS.border,
            marginVertical:  4,
          }} />
          <ArgumentColumn
            title="AGAINST"
            items={moderator.argumentsAgainst}
            color={COLORS.secondary}
            icon="arrow-down-circle-outline"
          />
        </View>
      </ExpandableSection>

      {/* ── Consensus Points ──────────────────────────────────────────────── */}
      {moderator.consensusPoints.length > 0 && (
        <ExpandableSection
          title="Consensus Points"
          icon="checkmark-done-circle-outline"
          defaultOpen={false}
          index={2}
        >
          <BulletList
            items={moderator.consensusPoints}
            bulletColor={COLORS.accent}
          />
        </ExpandableSection>
      )}

      {/* ── Key Tensions ──────────────────────────────────────────────────── */}
      {moderator.keyTensions.length > 0 && (
        <ExpandableSection
          title="Key Tensions"
          icon="flash-outline"
          defaultOpen={false}
          index={3}
        >
          {moderator.keyTensions.map((t, i) => (
            <TensionItem key={i} text={t} index={i} />
          ))}
        </ExpandableSection>
      )}

      {/* ── Neutral Conclusion ────────────────────────────────────────────── */}
      <ExpandableSection
        title="Neutral Conclusion"
        icon="telescope-outline"
        defaultOpen
        index={4}
      >
        <View style={{
          backgroundColor: `${COLORS.info}08`,
          borderRadius:    RADIUS.md,
          padding:         SPACING.md,
          borderLeftWidth: 3,
          borderLeftColor: COLORS.info,
        }}>
          <Text style={{
            color:      COLORS.textSecondary,
            fontSize:   FONTS.sizes.sm,
            lineHeight: 22,
          }}>
            {moderator.neutralConclusion}
          </Text>
        </View>
      </ExpandableSection>
    </View>
  );
}