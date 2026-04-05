// src/components/podcast/VoiceStyleSelector.tsx
// Part 39 — UPDATED: Supports all 11 presets (original 6 + 5 new celebrity-style).
//
// CHANGES:
//   1. Imports from PODCAST_VOICE_PRESETS_V2 (11 presets) instead of old 6
//   2. Each card shows a "NEW" badge if preset.isNew === true
//   3. 3-speaker presets show a "3 SPEAKERS" pill on the card
//   4. Grid variant renders 2-column layout (unchanged)
//   5. Scroll variant now shows all 11 as horizontal chips
//
// BACKWARD COMPAT:
//   - Same props (selectedPresetId, onSelectPreset, variant)
//   - PodcastVoicePresetDef type re-exported

import React from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
}                                     from 'react-native';
import { Ionicons }                   from '@expo/vector-icons';
import Animated, { FadeInDown }       from 'react-native-reanimated';
import { PODCAST_VOICE_PRESETS_V2 }   from '../../constants/podcastV2';
import type { PodcastVoicePresetV2Def } from '../../constants/podcastV2';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';

// Re-export for backward compat
export type { PodcastVoicePresetV2Def as PodcastVoicePresetDef };

// ─── Props ─────────────────────────────────────────────────────────────────────

interface VoiceStyleSelectorProps {
  selectedPresetId:  string;
  onSelectPreset:    (preset: PodcastVoicePresetV2Def) => void;
  variant?:          'grid' | 'scroll';
}

// ─── Grid Card ─────────────────────────────────────────────────────────────────

function PresetCard({
  preset, isSelected, onPress, index,
}: {
  preset:     PodcastVoicePresetV2Def;
  isSelected: boolean;
  onPress:    () => void;
  index:      number;
}) {
  return (
    <Animated.View entering={FadeInDown.duration(300).delay(index * 40)} style={{ flex: 1 }}>
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.8}
        style={{
          backgroundColor: isSelected ? `${preset.accentColor}15` : COLORS.backgroundCard,
          borderRadius:    RADIUS.xl,
          padding:         SPACING.md,
          borderWidth:     1.5,
          borderColor:     isSelected ? preset.accentColor : COLORS.border,
          minHeight:       140,
          position:        'relative',
        }}
      >
        {/* Selection indicator */}
        {isSelected && (
          <View style={{ position: 'absolute', top: 10, right: 10, width: 20, height: 20, borderRadius: 10, backgroundColor: preset.accentColor, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="checkmark" size={11} color="#FFF" />
          </View>
        )}

        {/* NEW badge */}
        {preset.isNew && !isSelected && (
          <View style={{ position: 'absolute', top: 8, right: 8, backgroundColor: `${COLORS.accent}20`, borderRadius: RADIUS.full, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: `${COLORS.accent}40` }}>
            <Text style={{ color: COLORS.accent, fontSize: 8, fontWeight: '800' }}>NEW</Text>
          </View>
        )}

        {/* Icon */}
        <View style={{ width: 38, height: 38, borderRadius: 11, backgroundColor: `${preset.accentColor}20`, alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.sm, borderWidth: 1, borderColor: `${preset.accentColor}28` }}>
          <Ionicons name={preset.icon as any} size={18} color={preset.accentColor} />
        </View>

        {/* Name */}
        <Text style={{ color: isSelected ? preset.accentColor : COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '700', marginBottom: 3 }}>
          {preset.name}
        </Text>

        {/* Description */}
        <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, lineHeight: 16, marginBottom: 6 }}>
          {preset.description}
        </Text>

        {/* Hosts row */}
        <Text style={{ color: COLORS.textMuted, fontSize: 10, fontWeight: '600', marginBottom: 4 }}>
          {preset.speakerCount === 3
            ? `${preset.speakers[0]?.name}, ${preset.speakers[1]?.name} & ${preset.speakers[2]?.name}`
            : `${preset.hostName} & ${preset.guestName}`}
        </Text>

        {/* Pills row */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
          {preset.speakerCount === 3 && (
            <View style={{ backgroundColor: `${preset.accentColor}18`, borderRadius: RADIUS.full, paddingHorizontal: 6, paddingVertical: 2 }}>
              <Text style={{ color: preset.accentColor, fontSize: 8, fontWeight: '800' }}>3 SPEAKERS</Text>
            </View>
          )}
          <View style={{ backgroundColor: `${preset.accentColor}10`, borderRadius: RADIUS.sm, paddingHorizontal: 6, paddingVertical: 2 }}>
            <Text style={{ color: preset.accentColor, fontSize: 9, fontWeight: '700', opacity: 0.85 }}>
              {preset.bestFor.split(',')[0]}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Scroll Chip ───────────────────────────────────────────────────────────────

function PresetChip({
  preset, isSelected, onPress,
}: {
  preset:     PodcastVoicePresetV2Def;
  isSelected: boolean;
  onPress:    () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={{
        width:           140,
        backgroundColor: isSelected ? `${preset.accentColor}18` : COLORS.backgroundCard,
        borderRadius:    RADIUS.lg,
        padding:         SPACING.sm + 4,
        borderWidth:     1.5,
        borderColor:     isSelected ? preset.accentColor : COLORS.border,
        marginRight:     SPACING.sm,
        position:        'relative',
      }}
    >
      {/* NEW badge */}
      {preset.isNew && (
        <View style={{ position: 'absolute', top: 6, right: 6, backgroundColor: `${COLORS.accent}20`, borderRadius: RADIUS.full, paddingHorizontal: 5, paddingVertical: 1 }}>
          <Text style={{ color: COLORS.accent, fontSize: 7, fontWeight: '800' }}>NEW</Text>
        </View>
      )}

      <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: `${preset.accentColor}20`, alignItems: 'center', justifyContent: 'center', marginBottom: 7 }}>
        <Ionicons name={preset.icon as any} size={16} color={preset.accentColor} />
      </View>

      <Text style={{ color: isSelected ? preset.accentColor : COLORS.textPrimary, fontSize: FONTS.sizes.xs, fontWeight: '700', marginBottom: 3 }}>
        {preset.name}
      </Text>
      <Text style={{ color: COLORS.textMuted, fontSize: 10, lineHeight: 14 }}>
        {preset.speakerCount === 3 ? '3 speakers' : `${preset.hostName} & ${preset.guestName}`}
      </Text>

      {isSelected && (
        <View style={{ position: 'absolute', top: 7, right: 7, width: 16, height: 16, borderRadius: 8, backgroundColor: preset.accentColor, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="checkmark" size={9} color="#FFF" />
        </View>
      )}
    </TouchableOpacity>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export function VoiceStyleSelector({
  selectedPresetId,
  onSelectPreset,
  variant = 'grid',
}: VoiceStyleSelectorProps) {

  if (variant === 'scroll') {
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: SPACING.md }}>
        {PODCAST_VOICE_PRESETS_V2.map(preset => (
          <PresetChip
            key={preset.id}
            preset={preset}
            isSelected={selectedPresetId === preset.id}
            onPress={() => onSelectPreset(preset)}
          />
        ))}
      </ScrollView>
    );
  }

  // Grid variant — 2 columns, up to 11 presets
  const rows: PodcastVoicePresetV2Def[][] = [];
  for (let i = 0; i < PODCAST_VOICE_PRESETS_V2.length; i += 2) {
    rows.push(PODCAST_VOICE_PRESETS_V2.slice(i, i + 2));
  }

  return (
    <View style={{ gap: SPACING.sm }}>
      {rows.map((row, rowIdx) => (
        <View key={rowIdx} style={{ flexDirection: 'row', gap: SPACING.sm }}>
          {row.map((preset, colIdx) => (
            <PresetCard
              key={preset.id}
              preset={preset}
              isSelected={selectedPresetId === preset.id}
              onPress={() => onSelectPreset(preset)}
              index={rowIdx * 2 + colIdx}
            />
          ))}
          {row.length === 1 && <View style={{ flex: 1 }} />}
        </View>
      ))}
    </View>
  );
}