// src/components/debate/DebatePerspectiveView.tsx
// Part 9 — Horizontal tab view cycling through all agent perspectives.
//
// Renders a scrollable tab strip of agent icons at the top, with the
// selected agent's full DebateAgentCard below. Used inside debate-detail.tsx

import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  FlatList,
  Dimensions,
} from 'react-native';
import { LinearGradient }         from 'expo-linear-gradient';
import { Ionicons }               from '@expo/vector-icons';
import Animated, {
  FadeIn,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
}                                 from 'react-native-reanimated';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';
import { DebatePerspective }              from '../../types';
import { DebateAgentCard }                from './DebateAgentCard';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─── Agent tab pill ───────────────────────────────────────────────────────────

function AgentTabPill({
  perspective,
  isActive,
  onPress,
}: {
  perspective: DebatePerspective;
  isActive:    boolean;
  onPress:     () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={{
        flexDirection:   'row',
        alignItems:      'center',
        gap:             7,
        paddingHorizontal: 14,
        paddingVertical:   9,
        backgroundColor:  isActive
          ? `${perspective.color}22`
          : COLORS.backgroundCard,
        borderRadius:    RADIUS.full,
        borderWidth:     1.5,
        borderColor:     isActive ? perspective.color : COLORS.border,
        marginRight:     SPACING.sm,
      }}
    >
      <View style={{
        width:           22,
        height:          22,
        borderRadius:    7,
        backgroundColor: `${perspective.color}18`,
        alignItems:      'center',
        justifyContent:  'center',
      }}>
        <Ionicons
          name={perspective.icon as any}
          size={11}
          color={perspective.color}
        />
      </View>
      <Text style={{
        color:      isActive ? perspective.color : COLORS.textMuted,
        fontSize:   FONTS.sizes.xs,
        fontWeight: isActive ? '800' : '500',
        maxWidth:   70,
      }}
        numberOfLines={1}
      >
        {perspective.agentName.replace('The ', '')}
      </Text>
    </TouchableOpacity>
  );
}

// ─── Stance distribution bar ─────────────────────────────────────────────────

function StanceDistributionBar({ perspectives }: { perspectives: DebatePerspective[] }) {
  const forCount     = perspectives.filter(p =>
    p.stanceType === 'for' || p.stanceType === 'strongly_for',
  ).length;
  const againstCount = perspectives.filter(p =>
    p.stanceType === 'against' || p.stanceType === 'strongly_against',
  ).length;
  const neutralCount = perspectives.length - forCount - againstCount;

  const pctFor     = Math.round((forCount     / perspectives.length) * 100);
  const pctAgainst = Math.round((againstCount / perspectives.length) * 100);
  const pctNeutral = 100 - pctFor - pctAgainst;

  return (
    <View style={{
      backgroundColor: COLORS.backgroundCard,
      borderRadius:    RADIUS.lg,
      padding:         SPACING.md,
      marginBottom:    SPACING.lg,
      borderWidth:     1,
      borderColor:     COLORS.border,
    }}>
      <Text style={{
        color:         COLORS.textMuted,
        fontSize:      FONTS.sizes.xs,
        fontWeight:    '700',
        letterSpacing: 0.7,
        textTransform: 'uppercase',
        marginBottom:  SPACING.sm,
      }}>
        Stance Distribution
      </Text>

      {/* Bar */}
      <View style={{
        flexDirection:  'row',
        height:         10,
        borderRadius:   5,
        overflow:       'hidden',
        marginBottom:   SPACING.sm,
        gap:            2,
      }}>
        {pctFor > 0 && (
          <View style={{
            flex:            pctFor,
            backgroundColor: COLORS.success,
          }} />
        )}
        {pctNeutral > 0 && (
          <View style={{
            flex:            pctNeutral,
            backgroundColor: COLORS.textMuted,
          }} />
        )}
        {pctAgainst > 0 && (
          <View style={{
            flex:            pctAgainst,
            backgroundColor: COLORS.secondary,
          }} />
        )}
      </View>

      {/* Legend */}
      <View style={{
        flexDirection:  'row',
        gap:            SPACING.md,
        justifyContent: 'center',
      }}>
        {forCount > 0 && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.success }} />
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
              {forCount} For
            </Text>
          </View>
        )}
        {neutralCount > 0 && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.textMuted }} />
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
              {neutralCount} Neutral
            </Text>
          </View>
        )}
        {againstCount > 0 && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.secondary }} />
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
              {againstCount} Against
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface DebatePerspectiveViewProps {
  perspectives: DebatePerspective[];
}

export function DebatePerspectiveView({ perspectives }: DebatePerspectiveViewProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const tabScrollRef = useRef<ScrollView>(null);

  const activePerspective = perspectives[activeIndex];

  const handleTabPress = (index: number) => {
    setActiveIndex(index);
  };

  if (!activePerspective) return null;

  return (
    <View>
      {/* Stance distribution overview */}
      <StanceDistributionBar perspectives={perspectives} />

      {/* Agent tab strip */}
      <ScrollView
        ref={tabScrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingRight: SPACING.md }}
        style={{ marginBottom: SPACING.lg }}
      >
        {perspectives.map((p, i) => (
          <AgentTabPill
            key={p.agentRole}
            perspective={p}
            isActive={i === activeIndex}
            onPress={() => handleTabPress(i)}
          />
        ))}
      </ScrollView>

      {/* Active perspective card */}
      <Animated.View key={activePerspective.agentRole} entering={FadeIn.duration(300)}>
        <DebateAgentCard
          perspective={activePerspective}
          index={0}
          mode="expanded"
        />
      </Animated.View>

      {/* Navigation arrows */}
      <View style={{
        flexDirection:   'row',
        justifyContent:  'space-between',
        alignItems:      'center',
        marginTop:       SPACING.sm,
        paddingHorizontal: SPACING.xs,
      }}>
        <TouchableOpacity
          onPress={() => {
            if (activeIndex > 0) setActiveIndex(activeIndex - 1);
          }}
          disabled={activeIndex === 0}
          activeOpacity={0.8}
          style={{
            flexDirection:   'row',
            alignItems:      'center',
            gap:             6,
            padding:         SPACING.sm,
            opacity:         activeIndex === 0 ? 0.3 : 1,
          }}
        >
          <Ionicons name="chevron-back" size={16} color={COLORS.textSecondary} />
          <Text style={{
            color:    COLORS.textSecondary,
            fontSize: FONTS.sizes.sm,
            fontWeight: '600',
          }}>
            Previous
          </Text>
        </TouchableOpacity>

        {/* Dot indicators */}
        <View style={{ flexDirection: 'row', gap: 5 }}>
          {perspectives.map((p, i) => (
            <TouchableOpacity key={p.agentRole} onPress={() => setActiveIndex(i)}>
              <View style={{
                width:           i === activeIndex ? 16 : 6,
                height:          6,
                borderRadius:    3,
                backgroundColor: i === activeIndex ? p.color : COLORS.border,
              }} />
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          onPress={() => {
            if (activeIndex < perspectives.length - 1) setActiveIndex(activeIndex + 1);
          }}
          disabled={activeIndex === perspectives.length - 1}
          activeOpacity={0.8}
          style={{
            flexDirection:   'row',
            alignItems:      'center',
            gap:             6,
            padding:         SPACING.sm,
            opacity: activeIndex === perspectives.length - 1 ? 0.3 : 1,
          }}
        >
          <Text style={{
            color:    COLORS.textSecondary,
            fontSize: FONTS.sizes.sm,
            fontWeight: '600',
          }}>
            Next
          </Text>
          <Ionicons name="chevron-forward" size={16} color={COLORS.textSecondary} />
        </TouchableOpacity>
      </View>
    </View>
  );
}