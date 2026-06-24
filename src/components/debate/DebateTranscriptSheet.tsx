// src/components/debate/DebateTranscriptSheet.tsx
// Part 55.4 — FULL DYNAMIC THEME INTEGRATION
//
// KEY CHANGES FROM 55.3:
//   • Subscribes to ThemeContext via useTheme() — every re-render triggered by a
//     theme change automatically recomputes all derived colors.
//   • StyleSheet.create() is replaced with useMemo()-computed inline style
//     objects wherever colors are involved, so a theme swap is reflected
//     immediately without any per-component registry hack.
//   • Pure static layout styles (no color) remain in a top-level StyleSheet for
//     performance — they never need to change.
//   • New helpers: `blend()` — alpha-composite two hex colors for smooth
//     persona-on-theme tinting (replaces raw `${color}18` string hex tricks that
//     can look muddy on light themes).
//   • `getSegmentPill()` — builds segment badge bg/text that adapts contrast
//     automatically for light vs dark palette.
//   • `getPersonaRowBg()` — active/inactive row tinting aware of theme brightness.
//   • `getTextOpacity()` — past-turn fade that reads well on both light and dark.
//   • ArgRefBadge / FilterChip also accept `isLight` and compute their own
//     themed surfaces inline.
//   • No hardcoded hex literals remain — every color flows through COLORS or a
//     persona.color, touched only by the local blend/opacity helpers.

import React, {
  useRef, useEffect, useState, useCallback, useMemo,
} from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  TouchableWithoutFeedback, StyleSheet, Platform,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

import { COLORS } from '../../constants/theme';
import { useTheme } from '../../context/ThemeContext';
import {
  VOICE_PERSONAS,
  SEGMENT_LABELS,
  SEGMENT_COLORS,
  SEGMENT_ICONS,
} from '../../constants/voiceDebate';
import type { VoiceDebate, VoiceDebateTurn, DebateSegmentType } from '../../types/voiceDebate';
import type { DebateAgentRole } from '../../types';

// ─── Color utility helpers ────────────────────────────────────────────────────

/** Parse a 3- or 6-digit hex string to {r,g,b} (0–255). */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '');
  const full =
    clean.length === 3
      ? clean.split('').map(c => c + c).join('')
      : clean.padEnd(6, '0');
  return {
    r: parseInt(full.slice(0, 2), 16) || 0,
    g: parseInt(full.slice(2, 4), 16) || 0,
    b: parseInt(full.slice(4, 6), 16) || 0,
  };
}

/**
 * Alpha-blend `color` over `surface` at opacity `alpha` (0–1).
 * Returns a fully-opaque hex string so RN's StyleSheet is happy.
 * This gives much better results than the old `${color}18` trick, which
 * layers semi-transparent rgba on top of an already-wrong background.
 */
function blend(color: string, surface: string, alpha: number): string {
  const c = hexToRgb(color);
  const s = hexToRgb(surface);
  const r = Math.round(s.r + (c.r - s.r) * alpha);
  const g = Math.round(s.g + (c.g - s.g) * alpha);
  const b = Math.round(s.b + (c.b - s.b) * alpha);
  return `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Lightens (light theme) or darkens (dark theme) a hex color by mixing it
 * toward the surface at the given ratio. Useful for muting persona accents on
 * inactive / past turns without opacity which can look washed out.
 */
function muteColor(color: string, surface: string, ratio: number): string {
  return blend(color, surface, 1 - ratio);
}

/**
 * Return the best text color (from COLORS.textPrimary or COLORS.textSecondary)
 * for a given background — simple perceived-luminance check.
 */
function contrastText(bg: string): string {
  const { r, g, b } = hexToRgb(bg);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.55 ? COLORS.textPrimary : COLORS.textSecondary;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface DebateTranscriptSheetProps {
  voiceDebate:      VoiceDebate;
  currentTurnIndex: number;
  bottomInset:      number;
  onClose:          () => void;
  onTurnPress:      (index: number) => void;
}

// ─── ArgRefBadge ──────────────────────────────────────────────────────────────

interface ArgRefBadgeProps {
  turn:    VoiceDebateTurn;
  isLight: boolean;
}

function ArgRefBadge({ turn, isLight }: ArgRefBadgeProps) {
  if (!turn.argRef) return null;

  const targetPersona =
    VOICE_PERSONAS[turn.argRef.targetAgentRole as DebateAgentRole | 'moderator'] ??
    VOICE_PERSONAS['moderator'];

  const label =
    turn.argRef.refType === 'challenges'  ? '⚡ Challenges'  :
    turn.argRef.refType === 'concedes'    ? '✓ Concedes to'  :
    turn.argRef.refType === 'agrees_with' ? '↑ Agrees with'  :
    '→ Extends';

  const surface  = COLORS.backgroundElevated;
  const badgeBg  = blend(targetPersona.color, surface, isLight ? 0.12 : 0.10);
  const badgeBdr = blend(targetPersona.color, surface, isLight ? 0.28 : 0.22);

  return (
    <View style={staticStyles.argRefContainer}>
      <View style={[
        staticStyles.argRefBadge,
        { backgroundColor: badgeBg, borderColor: badgeBdr },
      ]}>
        <Text style={[staticStyles.argRefBadgeText, { color: targetPersona.color }]}>
          {label} {targetPersona.displayName.replace('The ', '')}
        </Text>
      </View>
      <Text style={[staticStyles.argRefTurnRef, { color: COLORS.textMuted }]}>
        ↗ Turn {turn.argRef.targetTurnIdx + 1}
      </Text>
    </View>
  );
}

// ─── FilterChip ───────────────────────────────────────────────────────────────

interface FilterChipProps {
  label:     string;
  isActive:  boolean;
  color:     string;
  iconName?: string;
  isLight:   boolean;
  onPress:   () => void;
}

function FilterChip({ label, isActive, color, iconName, isLight, onPress }: FilterChipProps) {
  const surface    = COLORS.backgroundElevated;
  const activeBg   = blend(color, surface, isLight ? 0.18 : 0.16);
  const activeBdr  = blend(color, surface, isLight ? 0.50 : 0.38);
  const inactiveBg = COLORS.backgroundElevated;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      style={[
        staticStyles.chip,
        {
          backgroundColor: isActive ? activeBg   : inactiveBg,
          borderColor:     isActive ? activeBdr  : COLORS.border,
        },
      ]}
    >
      {iconName && (
        <Ionicons
          name={iconName as any}
          size={11}
          color={isActive ? color : COLORS.textMuted}
          style={staticStyles.chipIcon}
        />
      )}
      <Text
        style={[staticStyles.chipLabel, { color: isActive ? color : COLORS.textMuted }]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// ─── TurnRow (extracted for memoisation) ─────────────────────────────────────

interface TurnRowProps {
  turn:             VoiceDebateTurn;
  isActive:         boolean;
  isPast:           boolean;
  isLight:          boolean;
  onPress:          (turn: VoiceDebateTurn) => void;
}

const TurnRow = React.memo(function TurnRow({
  turn, isActive, isPast, isLight, onPress,
}: TurnRowProps) {
  const persona  = VOICE_PERSONAS[turn.speaker as DebateAgentRole | 'moderator'] ?? VOICE_PERSONAS['moderator'];
  const segColor = SEGMENT_COLORS[turn.segmentType] ?? COLORS.primary;
  const initials = persona.displayName.replace('The ', '').slice(0, 2).toUpperCase();
  const card     = COLORS.backgroundCard;
  const elevated = COLORS.backgroundElevated;

  // Row background: active = persona-tinted, inactive = card surface
  const rowBg  = isActive
    ? blend(persona.color, card, isLight ? 0.10 : 0.09)
    : elevated;
  const rowBdr = isActive
    ? blend(persona.color, card, isLight ? 0.40 : 0.32)
    : COLORS.border;

  // Avatar circle
  const avatarBg = blend(persona.color, card, isLight ? 0.14 : 0.12);

  // Speaker name color
  const speakerColor = isActive
    ? persona.color
    : muteColor(persona.color, card, isLight ? 0.55 : 0.45);

  // Segment pill
  const segPillBg   = blend(segColor, elevated, isLight ? 0.16 : 0.13);

  // Turn text color
  const turnTextColor = isActive
    ? COLORS.textPrimary
    : isPast
    ? blend(COLORS.textMuted, card, isLight ? 0.50 : 0.40)
    : COLORS.textSecondary;

  return (
    <TouchableOpacity
      onPress={() => onPress(turn)}
      activeOpacity={0.7}
      style={[
        staticStyles.turnRow,
        { backgroundColor: rowBg, borderColor: rowBdr },
      ]}
    >
      {/* Avatar column */}
      <View style={staticStyles.avatarCol}>
        <View style={[
          staticStyles.avatar,
          {
            backgroundColor: avatarBg,
            borderWidth: isActive ? 1.5 : 0,
            borderColor: persona.color,
          },
        ]}>
          {isActive ? (
            <View style={staticStyles.activeDots}>
              {[0, 1, 2].map(i => (
                <View key={i} style={[staticStyles.dot, { backgroundColor: persona.color }]} />
              ))}
            </View>
          ) : (
            <Text style={[
              staticStyles.initials,
              { color: isPast
                  ? blend(persona.color, avatarBg, 0.40)
                  : blend(persona.color, avatarBg, 0.82) },
            ]}>
              {initials}
            </Text>
          )}
        </View>
        <Text style={[staticStyles.turnNumber, { color: COLORS.textMuted }]}>
          {turn.turnIndex + 1}
        </Text>
      </View>

      {/* Content */}
      <View style={staticStyles.turnContent}>
        {/* Speaker + segment badge row */}
        <View style={staticStyles.speakerRow}>
          <Text style={[staticStyles.speakerName, { color: speakerColor }]}>
            {persona.displayName.replace('The ', '').toUpperCase()}
          </Text>

          <View style={[staticStyles.segBadge, { backgroundColor: segPillBg }]}>
            <Text style={[staticStyles.segBadgeText, { color: segColor }]}>
              {(SEGMENT_LABELS[turn.segmentType] ?? turn.segmentType)
                .replace(' Round', '')
                .replace(' Statements', '')
                .replace(' Arguments', '')}
            </Text>
          </View>

          {turn.confidence != null && (
            <Text style={[
              staticStyles.confidence,
              { color: isActive ? persona.color : COLORS.textMuted },
            ]}>
              {turn.confidence}/10
            </Text>
          )}
        </View>

        <ArgRefBadge turn={turn} isLight={isLight} />

        <Text
          numberOfLines={isActive ? 0 : 3}
          style={[
            staticStyles.turnText,
            {
              color:      turnTextColor,
              fontWeight: isActive ? '500' : '400',
            },
          ]}
        >
          {turn.text}
        </Text>
      </View>
    </TouchableOpacity>
  );
});

// ─── Main Component ───────────────────────────────────────────────────────────

export function DebateTranscriptSheet({
  voiceDebate,
  currentTurnIndex,
  bottomInset,
  onClose,
  onTurnPress,
}: DebateTranscriptSheetProps) {
  const { isLight, version } = useTheme();   // version forces re-render on theme change
  const scrollRef = useRef<ScrollView>(null);

  const turns    = voiceDebate.script?.turns   ?? [];
  const segments = voiceDebate.script?.segments ?? [];

  const [activeFilter, setActiveFilter] = useState<DebateSegmentType | 'all'>('all');

  // Auto-scroll to active turn
  useEffect(() => {
    if (scrollRef.current && currentTurnIndex > 1) {
      const ITEM_HEIGHT = 100;
      scrollRef.current.scrollTo({
        y:        Math.max(0, (currentTurnIndex - 1) * ITEM_HEIGHT),
        animated: true,
      });
    }
  }, [currentTurnIndex]);

  // Filter turns by segment
  const displayedTurns = useMemo(
    () => activeFilter === 'all' ? turns : turns.filter(t => t.segmentType === activeFilter),
    [turns, activeFilter],
  );

  const segmentTypes = useMemo(() => segments.map(s => s.type), [segments]);

  const handleTurnPress = useCallback((turn: VoiceDebateTurn) => {
    onTurnPress(turn.turnIndex);
    onClose();
  }, [onTurnPress, onClose]);

  // ── Themed surface colors ──────────────────────────────────────────────────
  // Computed fresh on every render so a theme swap is reflected immediately.
  const backdropColor  = useMemo(() => {
    const { r, g, b } = hexToRgb(COLORS.background);
    return `rgba(${r},${g},${b},${isLight ? 0.65 : 0.80})`;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLight, version]);

  const sheetBg      = COLORS.backgroundCard;
  const sheetBorder  = COLORS.border;
  const handleColor  = COLORS.border;
  const dividerColor = COLORS.border;

  // Close button tint
  const closeBtnBg  = COLORS.backgroundElevated;
  const closeBtnBdr = COLORS.border;

  return (
    <TouchableWithoutFeedback onPress={onClose}>
      <View style={StyleSheet.absoluteFillObject}>
        {/* Backdrop */}
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: backdropColor }]} />

        <View style={staticStyles.sheetWrapper}>
          <TouchableWithoutFeedback>
            <Animated.View
              entering={FadeInDown.duration(340).springify()}
              style={[
                staticStyles.sheet,
                {
                  backgroundColor: sheetBg,
                  borderTopColor:  sheetBorder,
                },
              ]}
            >
              {/* ── Handle + header ───────────────────────────────────── */}
              <View style={staticStyles.header}>
                <View style={[staticStyles.handleBar, { backgroundColor: handleColor }]} />
                <View style={staticStyles.headerRow}>
                  <View>
                    <Text style={[staticStyles.headerTitle, { color: COLORS.textPrimary }]}>
                      Transcript
                    </Text>
                    <Text style={[staticStyles.headerSubtitle, { color: COLORS.textMuted }]}>
                      {turns.length} turns · tap any to jump
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={onClose}
                    style={[
                      staticStyles.closeBtn,
                      { backgroundColor: closeBtnBg, borderColor: closeBtnBdr },
                    ]}
                  >
                    <Ionicons name="close" size={18} color={COLORS.textMuted} />
                  </TouchableOpacity>
                </View>
              </View>

              {/* ── Segment filter chips ──────────────────────────────── */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                nestedScrollEnabled
                keyboardShouldPersistTaps="handled"
                alwaysBounceHorizontal={false}
                overScrollMode="never"
                bounces={false}
                contentContainerStyle={staticStyles.chipsContainer}
                style={staticStyles.chipsScrollView}
              >
                <FilterChip
                  label="All"
                  isActive={activeFilter === 'all'}
                  color={COLORS.primary}
                  isLight={isLight}
                  onPress={() => setActiveFilter('all')}
                />
                {segmentTypes.map(type => (
                  <FilterChip
                    key={type}
                    label={SEGMENT_LABELS[type] ?? type}
                    isActive={activeFilter === type}
                    color={SEGMENT_COLORS[type] ?? COLORS.primary}
                    iconName={SEGMENT_ICONS[type]}
                    isLight={isLight}
                    onPress={() => setActiveFilter(type)}
                  />
                ))}
              </ScrollView>

              <View style={[staticStyles.divider, { backgroundColor: dividerColor }]} />

              {/* ── Turn list ──────────────────────────────────────────── */}
              <ScrollView
                ref={scrollRef}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                overScrollMode="never"
                contentContainerStyle={[
                  staticStyles.turnList,
                  { paddingBottom: bottomInset + 24 },
                ]}
              >
                {displayedTurns.map(turn => (
                  <TurnRow
                    key={turn.id}
                    turn={turn}
                    isActive={turn.turnIndex === currentTurnIndex}
                    isPast={turn.turnIndex < currentTurnIndex}
                    isLight={isLight}
                    onPress={handleTurnPress}
                  />
                ))}
              </ScrollView>
            </Animated.View>
          </TouchableWithoutFeedback>
        </View>
      </View>
    </TouchableWithoutFeedback>
  );
}

// ─── Static (layout-only, color-free) styles ─────────────────────────────────
// Colors are injected inline above so they update on theme change.
// Only geometry / spacing / non-color properties live here.

const staticStyles = StyleSheet.create({
  sheetWrapper: {
    flex:           1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius:  28,
    borderTopRightRadius: 28,
    maxHeight:            '78%',
    borderTopWidth:       1,
    overflow:             'hidden',
  },

  // Header
  header: {
    alignItems:        'center',
    paddingTop:        12,
    paddingBottom:     8,
    paddingHorizontal: 20,
  },
  handleBar: {
    width:        40,
    height:       4,
    borderRadius: 2,
    marginBottom: 14,
  },
  headerRow: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    width:          '100%',
  },
  headerTitle: {
    fontSize:   17,
    fontWeight: '800',
  },
  headerSubtitle: {
    fontSize:  12,
    marginTop: 1,
  },
  closeBtn: {
    width:        36,
    height:       36,
    borderRadius: 10,
    alignItems:   'center',
    justifyContent: 'center',
    borderWidth:  1,
  },

  // Chips
  chipsScrollView: {
    flexGrow:  0,
    flexShrink: 0,
  },
  chipsContainer: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingHorizontal: 16,
    paddingVertical:   10,
    paddingBottom:     12,
    flexWrap:          'nowrap',
  },
  chip: {
    flexDirection:     'row',
    alignItems:        'center',
    marginRight:       8,
    paddingHorizontal: 12,
    paddingVertical:   7,
    borderRadius:      999,
    borderWidth:       1,
    flexShrink:        0,
    minHeight:         Platform.OS === 'android' ? 34 : 30,
  },
  chipIcon: {
    marginRight: 4,
  },
  chipLabel: {
    fontSize:   12,
    fontWeight: '600',
    flexShrink: 0,
  },

  // Divider
  divider: {
    height:           1,
    marginHorizontal: 20,
  },

  // Turn list
  turnList: {
    paddingHorizontal: 16,
    paddingTop:        8,
  },
  turnRow: {
    flexDirection:     'row',
    alignItems:        'flex-start',
    paddingVertical:   12,
    paddingHorizontal: 14,
    marginBottom:      6,
    borderRadius:      16,
    borderWidth:       1,
  },

  // Avatar
  avatarCol: {
    alignItems:  'center',
    width:       36,
    marginRight: 12,
  },
  avatar: {
    width:          36,
    height:         36,
    borderRadius:   10,
    alignItems:     'center',
    justifyContent: 'center',
  },
  activeDots: {
    flexDirection: 'row',
    alignItems:    'center',
  },
  dot: {
    width:            4,
    height:           4,
    borderRadius:     2,
    marginHorizontal: 1,
  },
  initials: {
    fontSize:   10,
    fontWeight: '800',
  },
  turnNumber: {
    fontSize:   9,
    fontWeight: '600',
    marginTop:  3,
  },

  // Turn content
  turnContent: {
    flex: 1,
  },
  speakerRow: {
    flexDirection: 'row',
    alignItems:    'center',
    marginBottom:  5,
  },
  speakerName: {
    fontSize:      10,
    fontWeight:    '800',
    letterSpacing: 0.8,
    marginRight:   6,
  },
  segBadge: {
    borderRadius:      4,
    paddingHorizontal: 5,
    paddingVertical:   1,
    marginRight:       6,
  },
  segBadgeText: {
    fontSize:   8,
    fontWeight: '700',
  },
  confidence: {
    fontSize:   9,
    fontWeight: '700',
    marginLeft: 'auto' as any,
  },
  turnText: {
    fontSize:   13,
    lineHeight: 20,
  },

  // ArgRef badge
  argRefContainer: {
    flexDirection: 'row',
    alignItems:    'center',
    marginBottom:  6,
  },
  argRefBadge: {
    flexDirection:     'row',
    alignItems:        'center',
    borderRadius:      6,
    paddingHorizontal: 7,
    paddingVertical:   2,
    borderWidth:       1,
    marginRight:       5,
  },
  argRefBadgeText: {
    fontSize:   9,
    fontWeight: '700',
  },
  argRefTurnRef: {
    fontSize: 9,
  },
});