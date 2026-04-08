// src/components/debate/DebateTranscriptSheet.tsx
// Part 40 — Voice Debate Engine
//
// Bottom-sheet transcript for the voice debate player.
// Shows all turns grouped by segment, with:
//   • Active turn highlighted + auto-scroll
//   • Argument reference badges (who challenged whom)
//   • Tap-to-jump to any turn
//   • Segment filter chips at top

import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  TouchableWithoutFeedback, StyleSheet, Platform,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Ionicons }              from '@expo/vector-icons';

import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';
import {
  VOICE_PERSONAS,
  SEGMENT_LABELS,
  SEGMENT_COLORS,
  SEGMENT_ICONS,
}                                         from '../../constants/voiceDebate';
import type { VoiceDebate, VoiceDebateTurn, DebateSegmentType } from '../../types/voiceDebate';
import type { DebateAgentRole }           from '../../types';

// ─── Props ─────────────────────────────────────────────────────────────────────

interface DebateTranscriptSheetProps {
  voiceDebate:      VoiceDebate;
  currentTurnIndex: number;
  bottomInset:      number;
  onClose:          () => void;
  onTurnPress:      (index: number) => void;
}

// ─── Argument reference badge ─────────────────────────────────────────────────

function ArgRefBadge({ turn }: { turn: VoiceDebateTurn }) {
  if (!turn.argRef) return null;
  const targetPersona = VOICE_PERSONAS[turn.argRef.targetAgentRole as DebateAgentRole | 'moderator']
    ?? VOICE_PERSONAS['moderator'];

  const label =
    turn.argRef.refType === 'challenges'   ? '⚡ Challenges'  :
    turn.argRef.refType === 'concedes'     ? '✓ Concedes to'  :
    turn.argRef.refType === 'agrees_with'  ? '↑ Agrees with'  :
    '→ Extends';

  return (
    <View style={argRefStyles.container}>
      <View style={[
        argRefStyles.badge,
        {
          backgroundColor: `${targetPersona.color}15`,
          borderColor:     `${targetPersona.color}30`,
        },
      ]}>
        <Text style={[argRefStyles.badgeText, { color: targetPersona.color }]}>
          {label} {targetPersona.displayName.replace('The ', '')}
        </Text>
      </View>
      <Text style={argRefStyles.turnRef}>
        ↗ Turn {turn.argRef.targetTurnIdx + 1}
      </Text>
    </View>
  );
}

const argRefStyles = StyleSheet.create({
  container: {
    flexDirection:  'row',
    alignItems:     'center',
    marginBottom:   6,
  },
  badge: {
    flexDirection:    'row',
    alignItems:       'center',
    borderRadius:     6,
    paddingHorizontal: 7,
    paddingVertical:  2,
    borderWidth:      1,
    marginRight:      5,
  },
  badgeText: {
    fontSize:   9,
    fontWeight: '700',
  },
  turnRef: {
    color:    COLORS.textMuted,
    fontSize: 9,
  },
});

// ─── Segment Filter Chip ───────────────────────────────────────────────────────

interface FilterChipProps {
  label:      string;
  isActive:   boolean;
  color:      string;
  iconName?:  string;
  onPress:    () => void;
}

function FilterChip({ label, isActive, color, iconName, onPress }: FilterChipProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      style={[
        chipStyles.chip,
        {
          backgroundColor: isActive ? `${color}25` : 'rgba(255,255,255,0.08)',
          borderColor:     isActive ? color        : 'rgba(255,255,255,0.15)',
        },
      ]}
    >
      {iconName && (
        <Ionicons
          name={iconName as any}
          size={11}
          color={isActive ? color : 'rgba(255,255,255,0.5)'}
          style={chipStyles.icon}
        />
      )}
      <Text
        style={[
          chipStyles.label,
          { color: isActive ? color : 'rgba(255,255,255,0.5)' },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const chipStyles = StyleSheet.create({
  chip: {
    flexDirection:     'row',
    alignItems:        'center',
    // Use marginRight instead of gap on the parent to avoid Android compression
    marginRight:       8,
    paddingHorizontal: 12,
    paddingVertical:   7,
    borderRadius:      999,
    borderWidth:       1,
    // Prevent chip from shrinking on Android
    flexShrink:        0,
    // Ensure minimum tap area
    minHeight:         Platform.OS === 'android' ? 34 : 30,
  },
  icon: {
    marginRight: 4,
  },
  label: {
    fontSize:   12,
    fontWeight: '600',
    // Prevent text wrapping
    flexShrink: 0,
  },
});

// ─── Main Component ────────────────────────────────────────────────────────────

export function DebateTranscriptSheet({
  voiceDebate,
  currentTurnIndex,
  bottomInset,
  onClose,
  onTurnPress,
}: DebateTranscriptSheetProps) {
  const scrollRef              = useRef<ScrollView>(null);
  const turns                  = voiceDebate.script?.turns   ?? [];
  const segments               = voiceDebate.script?.segments ?? [];
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

  // Filter turns by active segment
  const displayedTurns = activeFilter === 'all'
    ? turns
    : turns.filter(t => t.segmentType === activeFilter);

  const handleTurnPress = useCallback((turn: VoiceDebateTurn) => {
    onTurnPress(turn.turnIndex);
    onClose();
  }, [onTurnPress, onClose]);

  const segmentTypes = segments.map(s => s.type);

  return (
    <TouchableWithoutFeedback onPress={onClose}>
      <View style={StyleSheet.absoluteFillObject}>
        {/* Backdrop */}
        <View style={[StyleSheet.absoluteFillObject, styles.backdrop]} />

        <View style={styles.sheetWrapper}>
          <TouchableWithoutFeedback>
            <Animated.View
              entering={FadeInDown.duration(340).springify()}
              style={styles.sheet}
            >
              {/* ── Handle + header ─────────────────────────────────────── */}
              <View style={styles.header}>
                <View style={styles.handleBar} />
                <View style={styles.headerRow}>
                  <View>
                    <Text style={styles.headerTitle}>Transcript</Text>
                    <Text style={styles.headerSubtitle}>
                      {turns.length} turns · tap any to jump
                    </Text>
                  </View>
                  <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                    <Ionicons name="close" size={18} color="rgba(255,255,255,0.7)" />
                  </TouchableOpacity>
                </View>
              </View>

              {/* ── Segment filter chips ─────────────────────────────────
                  KEY FIX:
                  • Remove `gap` from contentContainerStyle (breaks Android)
                  • Use `marginRight` on each chip instead
                  • `flexDirection: 'row'` alone on contentContainerStyle
                  • `alwaysBounceHorizontal` + `overScrollMode` for parity
              ──────────────────────────────────────────────────────────── */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                // Prevent vertical scroll capture on Android
                nestedScrollEnabled
                // Keeps touches from being stolen by parent on iOS
                keyboardShouldPersistTaps="handled"
                alwaysBounceHorizontal={false}
                overScrollMode="never"          // Android: no glow effect
                bounces={false}                 // iOS: no bounce
                contentContainerStyle={styles.chipsContainer}
                // Fix: explicit flexGrow:0 stops the row from collapsing on Android
                style={styles.chipsScrollView}
              >
                {/* "All" chip */}
                <FilterChip
                  label="All"
                  isActive={activeFilter === 'all'}
                  color={COLORS.primary}
                  onPress={() => setActiveFilter('all')}
                />

                {segmentTypes.map(type => (
                  <FilterChip
                    key={type}
                    label={SEGMENT_LABELS[type] ?? type}
                    isActive={activeFilter === type}
                    color={SEGMENT_COLORS[type] ?? COLORS.primary}
                    iconName={SEGMENT_ICONS[type]}
                    onPress={() => setActiveFilter(type)}
                  />
                ))}
              </ScrollView>

              <View style={styles.divider} />

              {/* ── Turn list ────────────────────────────────────────────── */}
              <ScrollView
                ref={scrollRef}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                overScrollMode="never"
                contentContainerStyle={[
                  styles.turnList,
                  { paddingBottom: bottomInset + 24 },
                ]}
              >
                {displayedTurns.map(turn => {
                  const isActive  = turn.turnIndex === currentTurnIndex;
                  const isPast    = turn.turnIndex < currentTurnIndex;
                  const persona   = VOICE_PERSONAS[turn.speaker as DebateAgentRole | 'moderator']
                    ?? VOICE_PERSONAS['moderator'];
                  const segColor  = SEGMENT_COLORS[turn.segmentType] ?? COLORS.primary;
                  const initials  = persona.displayName.replace('The ', '').slice(0, 2).toUpperCase();

                  return (
                    <TouchableOpacity
                      key={turn.id}
                      onPress={() => handleTurnPress(turn)}
                      activeOpacity={0.7}
                      style={[
                        styles.turnRow,
                        {
                          backgroundColor: isActive ? `${persona.color}18` : 'rgba(255,255,255,0.03)',
                          borderColor:     isActive ? `${persona.color}50` : 'rgba(255,255,255,0.06)',
                        },
                      ]}
                    >
                      {/* Avatar */}
                      <View style={styles.avatarCol}>
                        <View style={[
                          styles.avatar,
                          {
                            backgroundColor: `${persona.color}20`,
                            borderWidth:     isActive ? 1.5 : 0,
                            borderColor:     persona.color,
                          },
                        ]}>
                          {isActive ? (
                            <View style={styles.activeDots}>
                              {[0, 1, 2].map(i => (
                                <View key={i} style={[styles.dot, { backgroundColor: persona.color }]} />
                              ))}
                            </View>
                          ) : (
                            <Text style={[
                              styles.initials,
                              { color: isPast ? `${persona.color}70` : `${persona.color}CC` },
                            ]}>
                              {initials}
                            </Text>
                          )}
                        </View>
                        <Text style={styles.turnNumber}>{turn.turnIndex + 1}</Text>
                      </View>

                      {/* Content */}
                      <View style={styles.turnContent}>
                        {/* Speaker + segment badge row */}
                        <View style={styles.speakerRow}>
                          <Text style={[
                            styles.speakerName,
                            { color: isActive ? persona.color : `${persona.color}80` },
                          ]}>
                            {persona.displayName.replace('The ', '').toUpperCase()}
                          </Text>
                          <View style={[
                            styles.segBadge,
                            { backgroundColor: `${segColor}18` },
                          ]}>
                            <Text style={[styles.segBadgeText, { color: segColor }]}>
                              {SEGMENT_LABELS[turn.segmentType]
                                ?.replace(' Round', '')
                                .replace(' Statements', '')
                                .replace(' Arguments', '')
                                ?? turn.segmentType}
                            </Text>
                          </View>
                          {turn.confidence && (
                            <Text style={[
                              styles.confidence,
                              { color: isActive ? persona.color : 'rgba(255,255,255,0.3)' },
                            ]}>
                              {turn.confidence}/10
                            </Text>
                          )}
                        </View>

                        {/* Argument reference */}
                        <ArgRefBadge turn={turn} />

                        {/* Turn text */}
                        <Text
                          numberOfLines={isActive ? 0 : 3}
                          style={[
                            styles.turnText,
                            {
                              color: isActive
                                ? 'rgba(255,255,255,0.90)'
                                : isPast
                                ? 'rgba(255,255,255,0.28)'
                                : 'rgba(255,255,255,0.55)',
                              fontWeight: isActive ? '500' : '400',
                            },
                          ]}
                        >
                          {turn.text}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </Animated.View>
          </TouchableWithoutFeedback>
        </View>
      </View>
    </TouchableWithoutFeedback>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: 'rgba(0,0,0,0.72)',
  },
  sheetWrapper: {
    flex:            1,
    justifyContent:  'flex-end',
  },
  sheet: {
    backgroundColor:      '#0E0E22',
    borderTopLeftRadius:  28,
    borderTopRightRadius: 28,
    maxHeight:            '78%',
    borderTopWidth:       1,
    borderTopColor:       'rgba(255,255,255,0.10)',
    // Clip children to rounded corners on Android
    overflow:             'hidden',
  },

  // Header
  header: {
    alignItems:       'center',
    paddingTop:       12,
    paddingBottom:    8,
    paddingHorizontal: 20,
  },
  handleBar: {
    width:           40,
    height:          4,
    borderRadius:    2,
    backgroundColor: 'rgba(255,255,255,0.15)',
    marginBottom:    14,
  },
  headerRow: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    width:          '100%',
  },
  headerTitle: {
    color:      '#FFF',
    fontSize:   17,
    fontWeight: '800',
  },
  headerSubtitle: {
    color:     'rgba(255,255,255,0.35)',
    fontSize:  12,
    marginTop: 1,
  },
  closeBtn: {
    width:           36,
    height:          36,
    borderRadius:    10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems:      'center',
    justifyContent:  'center',
  },

  // Chips
  chipsScrollView: {
    // flexGrow:0 is critical — without it Android stretches the ScrollView
    // vertically and compresses the chip content
    flexGrow: 0,
    flexShrink: 0,
  },
  chipsContainer: {
    // Do NOT use `gap` here — it causes chip compression on Android < RN 0.71
    flexDirection:  'row',
    alignItems:     'center',
    paddingHorizontal: 16,
    paddingVertical:   10,
    // paddingBottom gives breathing room above the divider
    paddingBottom:  12,
    // Ensure the row doesn't wrap
    flexWrap:       'nowrap',
  },

  divider: {
    height:           1,
    backgroundColor:  'rgba(255,255,255,0.07)',
    marginHorizontal: 20,
  },

  // Turn list
  turnList: {
    paddingHorizontal: 16,
    paddingTop:        8,
  },
  turnRow: {
    flexDirection:   'row',
    alignItems:      'flex-start',
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom:    6,
    borderRadius:    16,
    borderWidth:     1,
  },

  // Avatar column
  avatarCol: {
    alignItems: 'center',
    width:      36,
    marginRight: 12,
  },
  avatar: {
    width:        36,
    height:       36,
    borderRadius: 10,
    alignItems:   'center',
    justifyContent: 'center',
  },
  activeDots: {
    flexDirection: 'row',
    alignItems:    'center',
  },
  dot: {
    width:        4,
    height:       4,
    borderRadius: 2,
    marginHorizontal: 1,
  },
  initials: {
    fontSize:   10,
    fontWeight: '800',
  },
  turnNumber: {
    color:      'rgba(255,255,255,0.2)',
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
    borderRadius:     4,
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
});