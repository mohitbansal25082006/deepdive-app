// src/components/research/AssistantModeSelector.tsx
// Part 6 — AI Research Assistant: Mode Selector
//
// A horizontally-scrollable row of mode chips. Each chip shows:
//   • Ionicons icon (tinted with mode color)
//   • Mode label
//   • Active indicator (gradient background, elevated border)
//
// Also renders a compact "active mode" banner below the chips that shows
// the description of the currently selected mode.
//
// Props:
//   activeMode   — currently selected mode
//   onSelect     — called when user taps a chip
//   disabled     — greys out all chips (used while sending)

import React from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons }       from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { AssistantMode }  from '../../types';
import {
  MODE_CONFIGS,
  ModeConfig,
}                          from '../../services/agents/researchAssistantAgent';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';

interface Props {
  activeMode: AssistantMode;
  onSelect:   (mode: AssistantMode) => void;
  disabled?:  boolean;
}

export function AssistantModeSelector({ activeMode, onSelect, disabled = false }: Props) {
  const activeCfg: ModeConfig = MODE_CONFIGS.find(c => c.mode === activeMode) ?? MODE_CONFIGS[0];

  return (
    <View style={styles.wrapper}>
      {/* ── Mode chip strip ───────────────────────────────────────────────── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.strip}
        keyboardShouldPersistTaps="handled"
      >
        {MODE_CONFIGS.map(cfg => {
          const isActive = cfg.mode === activeMode;
          return (
            <Pressable
              key={cfg.mode}
              onPress={() => !disabled && onSelect(cfg.mode)}
              style={({ pressed }) => [
                styles.chip,
                isActive && { borderColor: cfg.color + '60', borderWidth: 1.5 },
                pressed && !disabled && { opacity: 0.75 },
                disabled && styles.chipDisabled,
              ]}
            >
              {isActive ? (
                <LinearGradient
                  colors={[cfg.color + '30', cfg.color + '10']}
                  style={StyleSheet.absoluteFill}
                />
              ) : null}

              {/* Icon */}
              <View style={[
                styles.iconWrap,
                { backgroundColor: isActive ? cfg.color + '25' : COLORS.backgroundElevated },
              ]}>
                <Ionicons
                  name={cfg.icon as any}
                  size={14}
                  color={isActive ? cfg.color : COLORS.textMuted}
                />
              </View>

              {/* Label */}
              <Text style={[
                styles.chipLabel,
                { color: isActive ? cfg.color : COLORS.textSecondary },
                isActive && { fontWeight: '700' },
              ]}>
                {cfg.label}
              </Text>

              {/* Active dot */}
              {isActive && (
                <View style={[styles.activeDot, { backgroundColor: cfg.color }]} />
              )}
            </Pressable>
          );
        })}
      </ScrollView>

      {/* ── Active mode description banner ────────────────────────────────── */}
      <Animated.View
        key={activeMode}
        entering={FadeInDown.duration(200)}
        style={[styles.banner, { borderLeftColor: activeCfg.color }]}
      >
        <Ionicons name={activeCfg.icon as any} size={12} color={activeCfg.color} />
        <Text style={[styles.bannerText, { color: activeCfg.color + 'CC' }]}>
          {activeCfg.description}
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: SPACING.sm,
  },
  strip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    gap: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.backgroundCard,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
    position: 'relative',
    minWidth: 90,
  },
  chipDisabled: {
    opacity: 0.45,
  },
  iconWrap: {
    width: 22,
    height: 22,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipLabel: {
    fontSize: FONTS.sizes.xs,
    fontWeight: '500',
    flexShrink: 1,
  },
  activeDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    marginLeft: 2,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: SPACING.md,
    marginTop: 4,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 5,
    borderLeftWidth: 2,
    borderRadius: 4,
    backgroundColor: COLORS.backgroundCard + '80',
  },
  bannerText: {
    fontSize: FONTS.sizes.xs,
    fontStyle: 'italic',
    flex: 1,
  },
});