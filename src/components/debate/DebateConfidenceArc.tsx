// src/components/debate/DebateConfidenceArc.tsx
// Part 40 — Voice Debate Engine
//
// Visualises each agent's confidence change across the three debate rounds:
//   Phase 1 (Opening) → Phase 2 (Cross-Exam) → Phase 3 (Closing)
//
// Renders as a horizontal chart with one line per agent,
// using their role color. Tap an agent row to highlight their arc.

import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Ionicons }         from '@expo/vector-icons';

import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';
import type { DebateAgentRole }           from '../../types';
import type { VoiceDebateTurn }           from '../../types/voiceDebate';
import { VOICE_PERSONAS }                from '../../constants/voiceDebate';

// ─── Props ─────────────────────────────────────────────────────────────────────

interface ConfidenceDataPoint {
  agentRole:   DebateAgentRole;
  phase1:      number;   // Opening confidence (1–10)
  phase2:      number;   // After cross-exam (1–10)
  phase3:      number;   // Closing confidence (1–10)
}

interface DebateConfidenceArcProps {
  turns: VoiceDebateTurn[];
}

// ─── Extract confidence data from turns ───────────────────────────────────────

function extractConfidenceData(turns: VoiceDebateTurn[]): ConfidenceDataPoint[] {
  const agentRoles: DebateAgentRole[] = [
    'optimist', 'skeptic', 'economist', 'technologist', 'ethicist', 'futurist',
  ];

  return agentRoles.map(role => {
    const openingTurns = turns.filter(
      t => t.speaker === role && t.segmentType === 'opening' && t.confidence
    );
    const crossTurns = turns.filter(
      t => t.speaker === role &&
      (t.segmentType === 'cross_exam' || t.segmentType === 'rebuttal') &&
      t.confidence
    );
    const closingTurns = turns.filter(
      t => t.speaker === role && t.segmentType === 'closing' && t.confidence
    );

    const avg = (arr: VoiceDebateTurn[]) =>
      arr.length > 0
        ? Math.round(arr.reduce((s, t) => s + (t.confidence ?? 5), 0) / arr.length)
        : 5;

    return {
      agentRole: role,
      phase1:    avg(openingTurns),
      phase2:    avg(crossTurns.length > 0 ? crossTurns : openingTurns),
      phase3:    avg(closingTurns.length > 0 ? closingTurns : crossTurns.length > 0 ? crossTurns : openingTurns),
    };
  });
}

// ─── Mini sparkline for one agent ─────────────────────────────────────────────

function ConfidenceLine({
  data,
  color,
  isHighlighted,
  width,
}: {
  data:          ConfidenceDataPoint;
  color:         string;
  isHighlighted: boolean;
  width:         number;
}) {
  // Normalise 1–10 to 0–1 for chart height
  const norm = (v: number) => (v - 1) / 9;

  const chartH = 40;
  const points = [data.phase1, data.phase2, data.phase3];
  const xs     = [0, width / 2, width];
  const ys     = points.map(v => chartH * (1 - norm(v)));

  // Build SVG polyline points string
  const pointsStr = points.map((v, i) => `${xs[i]},${ys[i]}`).join(' ');

  // Direction arrow
  const delta    = data.phase3 - data.phase1;
  const deltaAbs = Math.abs(delta);
  const deltaColor =
    delta > 0 ? COLORS.success :
    delta < 0 ? COLORS.error  :
    COLORS.textMuted;
  const deltaIcon =
    delta > 0 ? 'arrow-up'   :
    delta < 0 ? 'arrow-down' :
    'remove';

  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingVertical: 10, paddingHorizontal: 12,
      backgroundColor: isHighlighted ? `${color}10` : 'transparent',
      borderRadius: RADIUS.lg,
      borderWidth: isHighlighted ? 1 : 0,
      borderColor: `${color}30`,
    }}>
      {/* Agent dot + name */}
      <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: `${color}18`, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }} />
      </View>

      <View style={{ width: 70 }}>
        <Text style={{ color: isHighlighted ? color : COLORS.textSecondary, fontSize: FONTS.sizes.xs, fontWeight: '700' }} numberOfLines={1}>
          {VOICE_PERSONAS[data.agentRole].displayName.replace('The ', '')}
        </Text>
        <Text style={{ color: COLORS.textMuted, fontSize: 9, marginTop: 1 }}>
          {data.phase1} → {data.phase2} → {data.phase3}
        </Text>
      </View>

      {/* Sparkline (simple bar representation since SVG not available) */}
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'flex-end', height: chartH, gap: 2 }}>
        {points.map((val, i) => (
          <View key={i} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: chartH }}>
            <View style={{
              width: '80%',
              height: Math.max(4, norm(val) * chartH),
              backgroundColor: isHighlighted ? color : `${color}60`,
              borderRadius: 2,
            }} />
            <Text style={{ color: COLORS.textMuted, fontSize: 8, marginTop: 2 }}>
              {['P1', 'P2', 'P3'][i]}
            </Text>
          </View>
        ))}
      </View>

      {/* Delta badge */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 3,
        backgroundColor: `${deltaColor}15`, borderRadius: RADIUS.full,
        paddingHorizontal: 7, paddingVertical: 3,
        borderWidth: 1, borderColor: `${deltaColor}30`,
      }}>
        <Ionicons name={deltaIcon as any} size={10} color={deltaColor} />
        <Text style={{ color: deltaColor, fontSize: 10, fontWeight: '700' }}>
          {deltaAbs > 0 ? `${delta > 0 ? '+' : ''}${delta}` : '±0'}
        </Text>
      </View>
    </View>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function DebateConfidenceArc({ turns }: DebateConfidenceArcProps) {
  const [highlightedRole, setHighlightedRole] = useState<DebateAgentRole | null>(null);

  const data = extractConfidenceData(turns);

  if (data.length === 0 || turns.length === 0) return null;

  return (
    <Animated.View entering={FadeIn.duration(400)}>
      <View style={{
        backgroundColor: COLORS.backgroundCard,
        borderRadius:    RADIUS.xl,
        borderWidth:     1,
        borderColor:     COLORS.border,
        overflow:        'hidden',
        marginBottom:    SPACING.md,
      }}>
        {/* Header */}
        <View style={{
          flexDirection:  'row', alignItems: 'center', gap: 8,
          paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md,
          borderBottomWidth: 1, borderBottomColor: COLORS.border,
        }}>
          <Ionicons name="analytics-outline" size={16} color={COLORS.primary} />
          <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '700' }}>
            Confidence Arc
          </Text>
          <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginLeft: 'auto' as any }}>
            Phase 1 → 2 → 3
          </Text>
        </View>

        {/* Phase labels */}
        <View style={{ flexDirection: 'row', paddingHorizontal: SPACING.lg, paddingTop: SPACING.sm }}>
          <View style={{ width: 28 + 70 + 10 }} />
          {['Opening', 'Cross-Exam', 'Closing'].map((label, i) => (
            <View key={i} style={{ flex: 1, alignItems: 'center' }}>
              <Text style={{ color: COLORS.textMuted, fontSize: 9, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {label}
              </Text>
            </View>
          ))}
          <View style={{ width: 50 }} />
        </View>

        {/* Agent rows */}
        <View style={{ paddingHorizontal: SPACING.md, paddingBottom: SPACING.md }}>
          {data.map(d => {
            const persona = VOICE_PERSONAS[d.agentRole];
            const isHL    = highlightedRole === d.agentRole;
            return (
              <TouchableOpacity
                key={d.agentRole}
                onPress={() => setHighlightedRole(isHL ? null : d.agentRole)}
                activeOpacity={0.8}
              >
                <ConfidenceLine
                  data={d}
                  color={persona.color}
                  isHighlighted={isHL}
                  width={100}
                />
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Footer hint */}
        <View style={{
          backgroundColor: COLORS.backgroundElevated,
          paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm,
          borderTopWidth: 1, borderTopColor: COLORS.border,
        }}>
          <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, textAlign: 'center' }}>
            Tap any agent to highlight their confidence journey · P1=Opening · P2=Cross-Exam · P3=Closing
          </Text>
        </View>
      </View>
    </Animated.View>
  );
}