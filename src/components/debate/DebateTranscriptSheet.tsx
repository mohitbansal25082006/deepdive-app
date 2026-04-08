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
  TouchableWithoutFeedback, StyleSheet,
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
    <View style={{
      flexDirection:   'row', alignItems: 'center', gap: 5,
      marginBottom:    6,
    }}>
      <View style={{
        flexDirection:    'row', alignItems: 'center', gap: 4,
        backgroundColor:  `${targetPersona.color}15`,
        borderRadius:     6, paddingHorizontal: 7, paddingVertical: 2,
        borderWidth:      1, borderColor: `${targetPersona.color}30`,
      }}>
        <Text style={{ color: targetPersona.color, fontSize: 9, fontWeight: '700' }}>
          {label} {targetPersona.displayName.replace('The ', '')}
        </Text>
      </View>
      <Text style={{ color: COLORS.textMuted, fontSize: 9 }}>
        ↗ Turn {turn.argRef.targetTurnIdx + 1}
      </Text>
    </View>
  );
}

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

  // ── Segment filter chips ───────────────────────────────────────────────────

  const segmentTypes = segments.map(s => s.type);

  return (
    <TouchableWithoutFeedback onPress={onClose}>
      <View style={StyleSheet.absoluteFillObject}>
        {/* Backdrop */}
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.72)' }]} />

        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          <TouchableWithoutFeedback>
            <Animated.View
              entering={FadeInDown.duration(340).springify()}
              style={{
                backgroundColor:      '#0E0E22',
                borderTopLeftRadius:  28,
                borderTopRightRadius: 28,
                maxHeight:            '78%',
                borderTopWidth:       1,
                borderTopColor:       'rgba(255,255,255,0.10)',
              }}
            >
              {/* Handle + header */}
              <View style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 8, paddingHorizontal: 20 }}>
                <View style={{
                  width: 40, height: 4, borderRadius: 2,
                  backgroundColor: 'rgba(255,255,255,0.15)', marginBottom: 14,
                }} />
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                  <View>
                    <Text style={{ color: '#FFF', fontSize: 17, fontWeight: '800' }}>Transcript</Text>
                    <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12, marginTop: 1 }}>
                      {turns.length} turns · tap any to jump
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={onClose}
                    style={{
                      width: 36, height: 36, borderRadius: 10,
                      backgroundColor: 'rgba(255,255,255,0.08)',
                      alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <Ionicons name="close" size={18} color="rgba(255,255,255,0.7)" />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Segment filter chips */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 12, gap: 8, flexDirection: 'row' }}
              >
                <TouchableOpacity
                  onPress={() => setActiveFilter('all')}
                  style={{
                    paddingHorizontal: 12, paddingVertical: 6, borderRadius: RADIUS.full,
                    backgroundColor: activeFilter === 'all' ? COLORS.primary : 'rgba(255,255,255,0.08)',
                    borderWidth: 1, borderColor: activeFilter === 'all' ? COLORS.primary : 'rgba(255,255,255,0.15)',
                  }}
                >
                  <Text style={{ color: '#FFF', fontSize: FONTS.sizes.xs, fontWeight: '700' }}>All</Text>
                </TouchableOpacity>

                {segmentTypes.map(type => {
                  const isActive = activeFilter === type;
                  const color    = SEGMENT_COLORS[type] ?? COLORS.primary;
                  return (
                    <TouchableOpacity
                      key={type}
                      onPress={() => setActiveFilter(type)}
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: 5,
                        paddingHorizontal: 12, paddingVertical: 6, borderRadius: RADIUS.full,
                        backgroundColor: isActive ? `${color}25` : 'rgba(255,255,255,0.08)',
                        borderWidth: 1, borderColor: isActive ? color : 'rgba(255,255,255,0.15)',
                      }}
                    >
                      <Ionicons name={SEGMENT_ICONS[type] as any} size={11} color={isActive ? color : 'rgba(255,255,255,0.5)'} />
                      <Text style={{
                        color:      isActive ? color : 'rgba(255,255,255,0.5)',
                        fontSize:   FONTS.sizes.xs,
                        fontWeight: '600',
                      }}>
                        {SEGMENT_LABELS[type] ?? type}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.07)', marginHorizontal: 20 }} />

              {/* Turn list */}
              <ScrollView
                ref={scrollRef}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{
                  paddingHorizontal: 16, paddingTop: 8,
                  paddingBottom:     bottomInset + 24,
                }}
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
                      style={{
                        flexDirection:   'row', alignItems: 'flex-start', gap: 12,
                        paddingVertical: 12, paddingHorizontal: 14, marginBottom: 6,
                        borderRadius:    16,
                        backgroundColor: isActive ? `${persona.color}18` : 'rgba(255,255,255,0.03)',
                        borderWidth:     1,
                        borderColor:     isActive ? `${persona.color}50` : 'rgba(255,255,255,0.06)',
                      }}
                    >
                      {/* Avatar */}
                      <View style={{ alignItems: 'center', gap: 3, width: 36 }}>
                        <View style={{
                          width: 36, height: 36, borderRadius: 10,
                          backgroundColor: `${persona.color}20`,
                          borderWidth:     isActive ? 1.5 : 0, borderColor: persona.color,
                          alignItems: 'center', justifyContent: 'center',
                        }}>
                          {isActive ? (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                              {[0, 1, 2].map(i => (
                                <View key={i} style={{
                                  width: 4, height: 4, borderRadius: 2,
                                  backgroundColor: persona.color,
                                }} />
                              ))}
                            </View>
                          ) : (
                            <Text style={{
                              color:      isPast ? `${persona.color}70` : `${persona.color}CC`,
                              fontSize:   10, fontWeight: '800',
                            }}>
                              {initials}
                            </Text>
                          )}
                        </View>
                        <Text style={{ color: 'rgba(255,255,255,0.2)', fontSize: 9, fontWeight: '600' }}>
                          {turn.turnIndex + 1}
                        </Text>
                      </View>

                      {/* Content */}
                      <View style={{ flex: 1 }}>
                        {/* Speaker + segment badge */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                          <Text style={{
                            color:      isActive ? persona.color : `${persona.color}80`,
                            fontSize:   10, fontWeight: '800', letterSpacing: 0.8,
                          }}>
                            {persona.displayName.replace('The ', '').toUpperCase()}
                          </Text>
                          <View style={{
                            backgroundColor: `${segColor}18`, borderRadius: 4,
                            paddingHorizontal: 5, paddingVertical: 1,
                          }}>
                            <Text style={{ color: segColor, fontSize: 8, fontWeight: '700' }}>
                              {SEGMENT_LABELS[turn.segmentType]?.replace(' Round', '').replace(' Statements', '').replace(' Arguments', '') ?? turn.segmentType}
                            </Text>
                          </View>
                          {turn.confidence && (
                            <Text style={{
                              color:      isActive ? persona.color : 'rgba(255,255,255,0.3)',
                              fontSize:   9, fontWeight: '700',
                              marginLeft: 'auto' as any,
                            }}>
                              {turn.confidence}/10
                            </Text>
                          )}
                        </View>

                        {/* Argument reference */}
                        <ArgRefBadge turn={turn} />

                        {/* Turn text */}
                        <Text
                          numberOfLines={isActive ? 0 : 3}
                          style={{
                            color:      isActive
                              ? 'rgba(255,255,255,0.90)'
                              : isPast
                              ? 'rgba(255,255,255,0.28)'
                              : 'rgba(255,255,255,0.55)',
                            fontSize:   13, lineHeight: 20,
                            fontWeight: isActive ? '500' : '400',
                          }}
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