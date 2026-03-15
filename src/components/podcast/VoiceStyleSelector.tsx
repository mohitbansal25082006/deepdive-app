// src/components/podcast/VoiceStyleSelector.tsx
// Part 19 — NEW component: expanded voice style selector with 6 presets.
// Replaces the old 3-preset horizontal scroll with a richer 2-column grid
// that shows the style name, description, host/guest voices, and best-for hint.
//
// Also exposes a compact "chip" row variant for smaller spaces.

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
}                                     from 'react-native';
import { Ionicons }                   from '@expo/vector-icons';
import Animated, { FadeInDown }       from 'react-native-reanimated';
import {
  PODCAST_VOICE_PRESETS,
  type PodcastVoicePresetDef,
}                                     from '../../hooks/usePodcast';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';

// ─── Props ────────────────────────────────────────────────────────────────────

interface VoiceStyleSelectorProps {
  selectedPresetId:  string;
  onSelectPreset:    (preset: PodcastVoicePresetDef) => void;
  /**
   * 'grid'   — 2-column cards (default, use in create form)
   * 'scroll' — horizontal scroll chips (compact, use in modals)
   */
  variant?: 'grid' | 'scroll';
}

// ─── Grid Card ────────────────────────────────────────────────────────────────

function PresetCard({
  preset,
  isSelected,
  onPress,
  index,
}: {
  preset:     PodcastVoicePresetDef;
  isSelected: boolean;
  onPress:    () => void;
  index:      number;
}) {
  return (
    <Animated.View
      entering={FadeInDown.duration(300).delay(index * 40)}
      style={{ flex: 1 }}
    >
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.8}
        style={{
          backgroundColor: isSelected
            ? `${preset.accentColor}15`
            : COLORS.backgroundCard,
          borderRadius:    RADIUS.xl,
          padding:         SPACING.md,
          borderWidth:     1.5,
          borderColor:     isSelected ? preset.accentColor : COLORS.border,
          minHeight:       130,
          position:        'relative',
        }}
      >
        {/* Selection checkmark */}
        {isSelected && (
          <View style={{
            position:        'absolute',
            top:             10,
            right:           10,
            width:           20,
            height:          20,
            borderRadius:    10,
            backgroundColor: preset.accentColor,
            alignItems:      'center',
            justifyContent:  'center',
          }}>
            <Ionicons name="checkmark" size={11} color="#FFF" />
          </View>
        )}

        {/* Icon */}
        <View style={{
          width:           38,
          height:          38,
          borderRadius:    11,
          backgroundColor: `${preset.accentColor}20`,
          alignItems:      'center',
          justifyContent:  'center',
          marginBottom:    SPACING.sm,
          borderWidth:     1,
          borderColor:     `${preset.accentColor}28`,
        }}>
          <Ionicons
            name={preset.icon as any}
            size={18}
            color={preset.accentColor}
          />
        </View>

        {/* Name */}
        <Text style={{
          color:        isSelected ? preset.accentColor : COLORS.textPrimary,
          fontSize:     FONTS.sizes.sm,
          fontWeight:   '700',
          marginBottom: 3,
        }}>
          {preset.name}
        </Text>

        {/* Description */}
        <Text style={{
          color:      COLORS.textMuted,
          fontSize:   FONTS.sizes.xs,
          lineHeight: 16,
          marginBottom: 6,
        }}>
          {preset.description}
        </Text>

        {/* Hosts */}
        <Text style={{
          color:      COLORS.textMuted,
          fontSize:   10,
          fontWeight: '600',
          marginBottom: 2,
        }}>
          {preset.hostName} & {preset.guestName}
        </Text>

        {/* Best for */}
        <View style={{
          backgroundColor:   `${preset.accentColor}10`,
          borderRadius:      RADIUS.sm,
          paddingHorizontal: 6,
          paddingVertical:   2,
          alignSelf:         'flex-start',
        }}>
          <Text style={{
            color:      preset.accentColor,
            fontSize:   9,
            fontWeight: '700',
            opacity:    0.85,
          }}>
            {preset.bestFor}
          </Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Scroll Chip ──────────────────────────────────────────────────────────────

function PresetChip({
  preset,
  isSelected,
  onPress,
}: {
  preset:     PodcastVoicePresetDef;
  isSelected: boolean;
  onPress:    () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={{
        width:           130,
        backgroundColor: isSelected
          ? `${preset.accentColor}18`
          : COLORS.backgroundCard,
        borderRadius:    RADIUS.lg,
        padding:         SPACING.sm + 4,
        borderWidth:     1.5,
        borderColor:     isSelected ? preset.accentColor : COLORS.border,
        marginRight:     SPACING.sm,
      }}
    >
      <View style={{
        width:           34,
        height:          34,
        borderRadius:    10,
        backgroundColor: `${preset.accentColor}20`,
        alignItems:      'center',
        justifyContent:  'center',
        marginBottom:    7,
      }}>
        <Ionicons
          name={preset.icon as any}
          size={16}
          color={preset.accentColor}
        />
      </View>

      <Text style={{
        color:        isSelected ? preset.accentColor : COLORS.textPrimary,
        fontSize:     FONTS.sizes.xs,
        fontWeight:   '700',
        marginBottom: 3,
      }}>
        {preset.name}
      </Text>

      <Text style={{
        color:      COLORS.textMuted,
        fontSize:   10,
        lineHeight: 14,
      }}>
        {preset.hostName} & {preset.guestName}
      </Text>

      {isSelected && (
        <View style={{
          position:        'absolute',
          top:             7,
          right:           7,
          width:           16,
          height:          16,
          borderRadius:    8,
          backgroundColor: preset.accentColor,
          alignItems:      'center',
          justifyContent:  'center',
        }}>
          <Ionicons name="checkmark" size={9} color="#FFF" />
        </View>
      )}
    </TouchableOpacity>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function VoiceStyleSelector({
  selectedPresetId,
  onSelectPreset,
  variant = 'grid',
}: VoiceStyleSelectorProps) {

  if (variant === 'scroll') {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingRight: SPACING.md }}
      >
        {PODCAST_VOICE_PRESETS.map(preset => (
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

  // Grid variant — 2 columns
  const rows: PodcastVoicePresetDef[][] = [];
  for (let i = 0; i < PODCAST_VOICE_PRESETS.length; i += 2) {
    rows.push(PODCAST_VOICE_PRESETS.slice(i, i + 2));
  }

  return (
    <View style={{ gap: SPACING.sm }}>
      {rows.map((row, rowIdx) => (
        <View
          key={rowIdx}
          style={{ flexDirection: 'row', gap: SPACING.sm }}
        >
          {row.map((preset, colIdx) => (
            <PresetCard
              key={preset.id}
              preset={preset}
              isSelected={selectedPresetId === preset.id}
              onPress={() => onSelectPreset(preset)}
              index={rowIdx * 2 + colIdx}
            />
          ))}
          {/* Fill empty slot if odd number of presets */}
          {row.length === 1 && <View style={{ flex: 1 }} />}
        </View>
      ))}
    </View>
  );
}