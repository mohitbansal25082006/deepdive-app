// src/components/profile/ThemeSettingsCard.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Part 55 — Theme picker UI (lives in the Profile tab)
//
// Two controls:
//   1. Appearance mode — a segmented Light / Dark / System control.
//   2. Theme — a 2-column grid of theme cards. Each card renders a LIVE mini
//      preview built from that theme's actual palette (for the currently
//      selected mode), so the user sees exactly what they'll get before tapping.
//
// All selections route through useTheme(); applying is instant app-wide because
// the provider mutates the live COLORS singleton and bumps its version counter.
//
// This component reads COLORS for its OWN chrome (so it recolors with the rest of
// the app) but reads each card's preview colors from the static palette tables in
// themes.ts (so every card shows its own theme regardless of the active one).
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { View, Text, Pressable, type PressableStateCallbackType } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useTheme } from '../../context/ThemeContext';
import {
  THEME_DEFINITIONS,
  getPalette,
  type ThemeDefinition,
  type ThemeMode,
} from '../../constants/themes';
import type { ThemeModePreference } from '../../lib/themeStorage';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';

// ─── Appearance mode segmented control ────────────────────────────────────────

const MODE_OPTIONS: { key: ThemeModePreference; label: string; icon: string }[] = [
  { key: 'light',  label: 'Light',  icon: 'sunny-outline' },
  { key: 'dark',   label: 'Dark',   icon: 'moon-outline' },
  { key: 'system', label: 'System', icon: 'phone-portrait-outline' },
];

function ModeSegment({
  active, onChange,
}: { active: ThemeModePreference; onChange: (m: ThemeModePreference) => void }) {
  return (
    <View style={{
      flexDirection: 'row',
      backgroundColor: COLORS.backgroundElevated,
      borderRadius: RADIUS.full,
      padding: 4,
      borderWidth: 1,
      borderColor: COLORS.border,
      gap: 4,
    }}>
      {MODE_OPTIONS.map(opt => {
        const isActive = active === opt.key;
        return (
          <Pressable
            key={opt.key}
            onPress={() => onChange(opt.key)}
            style={{ flex: 1, borderRadius: RADIUS.full, overflow: 'hidden' }}
          >
            {isActive ? (
              <LinearGradient
                colors={COLORS.gradientPrimary as [string, string]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9 }}
              >
                <Ionicons name={opt.icon as any} size={14} color="#FFF" />
                <Text style={{ color: '#FFF', fontSize: FONTS.sizes.xs, fontWeight: '800' }}>{opt.label}</Text>
              </LinearGradient>
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9 }}>
                <Ionicons name={opt.icon as any} size={14} color={COLORS.textMuted} />
                <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, fontWeight: '600' }}>{opt.label}</Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

// ─── A single theme card with live mini preview ───────────────────────────────

function ThemeCard({
  def, previewMode, selected, onPress,
}: {
  def: ThemeDefinition;
  previewMode: ThemeMode;
  selected: boolean;
  onPress: () => void;
}) {
  // Preview colors come from THIS theme's palette (not the active app theme),
  // so each card always shows its own identity.
  const p = getPalette(def.id, previewMode);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }: PressableStateCallbackType) => [{
        flex: 1,
        transform: [{ scale: pressed ? 0.97 : 1 }],
      }]}
    >
      <View style={{
        borderRadius: RADIUS.xl,
        overflow: 'hidden',
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? p.primary : COLORS.border,
      }}>
        {/* Mini preview surface painted in the theme's own colors */}
        <View style={{ backgroundColor: p.background, padding: SPACING.sm, gap: 6 }}>
          {/* faux header bar */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <LinearGradient
              colors={p.gradientPrimary as [string, string]}
              style={{ width: 22, height: 22, borderRadius: 7, alignItems: 'center', justifyContent: 'center' }}
            >
              <Ionicons name={def.icon} size={11} color="#FFF" />
            </LinearGradient>
            <View style={{ flex: 1, gap: 3 }}>
              <View style={{ height: 5, width: '70%', borderRadius: 3, backgroundColor: p.textPrimary, opacity: 0.85 }} />
              <View style={{ height: 4, width: '45%', borderRadius: 2, backgroundColor: p.textMuted }} />
            </View>
          </View>

          {/* faux card */}
          <View style={{
            backgroundColor: p.backgroundCard,
            borderRadius: RADIUS.md,
            borderWidth: 1,
            borderColor: p.border,
            padding: 7,
            gap: 5,
          }}>
            <View style={{ height: 4, width: '85%', borderRadius: 2, backgroundColor: p.textSecondary, opacity: 0.7 }} />
            <View style={{ height: 4, width: '60%', borderRadius: 2, backgroundColor: p.textMuted, opacity: 0.6 }} />
            {/* accent chips */}
            <View style={{ flexDirection: 'row', gap: 4, marginTop: 2 }}>
              <View style={{ width: 16, height: 6, borderRadius: 3, backgroundColor: p.primary }} />
              <View style={{ width: 12, height: 6, borderRadius: 3, backgroundColor: p.secondary }} />
              <View style={{ width: 10, height: 6, borderRadius: 3, backgroundColor: p.accent }} />
              <View style={{ width: 8, height: 6, borderRadius: 3, backgroundColor: p.success }} />
            </View>
          </View>
        </View>

        {/* Card footer — name + selected check (uses APP chrome colors) */}
        <View style={{
          backgroundColor: COLORS.backgroundCard,
          paddingHorizontal: SPACING.sm,
          paddingVertical: 8,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
        }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.xs, fontWeight: '800' }} numberOfLines={1}>
              {def.name}
            </Text>
            <Text style={{ color: COLORS.textMuted, fontSize: 10, marginTop: 1 }} numberOfLines={1}>
              {def.description}
            </Text>
          </View>
          {selected ? (
            <View style={{
              width: 20, height: 20, borderRadius: 10,
              backgroundColor: p.primary,
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Ionicons name="checkmark" size={12} color="#FFF" />
            </View>
          ) : (
            <View style={{
              width: 12, height: 12, borderRadius: 6,
              backgroundColor: def.swatch ?? p.primary,
            }} />
          )}
        </View>
      </View>
    </Pressable>
  );
}

// ─── Main card ─────────────────────────────────────────────────────────────────

export function ThemeSettingsCard() {
  const { themeId, mode, resolvedMode, setThemeId, setMode } = useTheme();

  // Pair the themes into rows of two for the grid.
  const rows: ThemeDefinition[][] = [];
  for (let i = 0; i < THEME_DEFINITIONS.length; i += 2) {
    rows.push(THEME_DEFINITIONS.slice(i, i + 2));
  }

  return (
    <Animated.View entering={FadeIn.duration(400)}>
      <View style={{
        borderRadius: RADIUS.xl,
        borderWidth: 1,
        borderColor: COLORS.border,
        overflow: 'hidden',
        marginBottom: SPACING.sm,
      }}>
        <LinearGradient colors={COLORS.gradientCard as [string, string]} style={{ padding: SPACING.md }}>
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.md }}>
            <LinearGradient
              colors={COLORS.gradientPrimary as [string, string]}
              style={{ width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' }}
            >
              <Ionicons name="color-palette" size={18} color="#FFF" />
            </LinearGradient>
            <View style={{ flex: 1 }}>
              <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '800' }}>Appearance</Text>
              <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 1 }}>
                Personalise the whole app's look
              </Text>
            </View>
          </View>

          {/* Mode segmented control */}
          <Text style={{
            color: COLORS.textMuted, fontSize: 10, fontWeight: '800',
            letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8,
          }}>
            Mode
          </Text>
          <ModeSegment active={mode} onChange={setMode} />

          {/* Theme grid */}
          <Text style={{
            color: COLORS.textMuted, fontSize: 10, fontWeight: '800',
            letterSpacing: 1, textTransform: 'uppercase',
            marginTop: SPACING.md, marginBottom: 8,
          }}>
            Theme
          </Text>

          <View style={{ gap: SPACING.sm }}>
            {rows.map((row, ri) => (
              <View key={ri} style={{ flexDirection: 'row', gap: SPACING.sm }}>
                {row.map(def => (
                  <ThemeCard
                    key={def.id}
                    def={def}
                    previewMode={resolvedMode}
                    selected={themeId === def.id}
                    onPress={() => setThemeId(def.id)}
                  />
                ))}
                {row.length === 1 && <View style={{ flex: 1 }} />}
              </View>
            ))}
          </View>

          {/* Footer hint */}
          <View style={{
            flexDirection: 'row', alignItems: 'flex-start', gap: 8,
            backgroundColor: `${COLORS.info}0E`,
            borderRadius: RADIUS.md,
            padding: SPACING.sm,
            marginTop: SPACING.md,
            borderWidth: 1,
            borderColor: `${COLORS.info}22`,
          }}>
            <Ionicons name="sparkles-outline" size={14} color={COLORS.info} style={{ marginTop: 1 }} />
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, lineHeight: 17, flex: 1 }}>
              Your selection applies instantly across every screen and is remembered next time you open the app.
            </Text>
          </View>
        </LinearGradient>
      </View>
    </Animated.View>
  );
}