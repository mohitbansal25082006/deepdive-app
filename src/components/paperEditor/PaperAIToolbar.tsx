// src/components/paperEditor/PaperAIToolbar.tsx
// Part 38 — AI writing tools bottom sheet / panel.
// Shows 6 AI tools with credit costs, gradient buttons, processing overlay.
// ─────────────────────────────────────────────────────────────────────────────

import React, { memo } from 'react';
import {
  View, Text, Modal, Pressable, ScrollView,
  TouchableOpacity, ActivityIndicator, Dimensions,
} from 'react-native';
import { LinearGradient }    from 'expo-linear-gradient';
import { Ionicons }          from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../constants/theme';
import {
  PAPER_AI_TOOL_COSTS,
  PAPER_AI_TOOL_LABELS,
  PAPER_AI_TOOL_ICONS,
  PAPER_AI_TOOL_DESCRIPTIONS,
  PAPER_AI_TOOL_GRADIENTS,
} from '../../types/paperEditor';
import {
  PAPER_AI_TOOLS_PRIMARY,
  PAPER_AI_TOOLS_SECONDARY,
} from '../../constants/paperEditor';
import type { PaperAITool } from '../../types/paperEditor';
import type { AcademicSection } from '../../types';

const SCREEN_H = Dimensions.get('window').height;

interface PaperAIToolbarProps {
  visible:        boolean;
  section:        AcademicSection | null;
  isProcessing:   boolean;
  processingLabel: string;
  creditBalance:  number;
  subsectionTitle?: string; // FIX #6: Added subsection title for context
  onSelectTool:   (tool: PaperAITool) => void;
  onClose:        () => void;
}

// Section type display names
const SECTION_TYPE_DISPLAY: Record<string, string> = {
  abstract:          'Abstract',
  introduction:      'Introduction',
  literature_review: 'Literature Review',
  methodology:       'Methodology',
  findings:          'Findings',
  conclusion:        'Conclusion',
  references:        'References',
};

// Tools not applicable to abstract / references
const ABSTRACT_EXCLUDED: PaperAITool[] = ['fix_citations', 'add_counterargument'];
const REFERENCES_EXCLUDED: PaperAITool[] = [
  'expand', 'shorten', 'formalize', 'add_counterargument', 'regenerate',
];

export const PaperAIToolbar = memo(function PaperAIToolbar({
  visible, section, isProcessing, processingLabel,
  creditBalance, subsectionTitle, onSelectTool, onClose,
}: PaperAIToolbarProps) {
  const insets = useSafeAreaInsets();

  const sectionType = section?.type ?? 'introduction';
  const isAbstract  = sectionType === 'abstract';
  const isRefs      = sectionType === 'references';

  function isToolDisabled(tool: PaperAITool): boolean {
    if (isAbstract  && ABSTRACT_EXCLUDED.includes(tool))  return true;
    if (isRefs      && REFERENCES_EXCLUDED.includes(tool)) return true;
    return false;
  }

  function canAfford(tool: PaperAITool): boolean {
    return creditBalance >= PAPER_AI_TOOL_COSTS[tool];
  }

  function renderTool(tool: PaperAITool) {
    const disabled  = isToolDisabled(tool);
    const affordable = canAfford(tool);
    const cost      = PAPER_AI_TOOL_COSTS[tool];
    const gradient  = PAPER_AI_TOOL_GRADIENTS[tool];
    const blocked   = disabled || !affordable;

    return (
      <TouchableOpacity
        key={tool}
        onPress={() => !blocked && onSelectTool(tool)}
        disabled={blocked}
        activeOpacity={blocked ? 1 : 0.78}
        style={{ opacity: blocked ? 0.4 : 1 }}
      >
        <LinearGradient
          colors={gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            borderRadius: RADIUS.xl,
            padding: SPACING.md,
            gap: SPACING.md,
          }}
        >
          {/* Icon bubble */}
          <View style={{
            width: 44, height: 44, borderRadius: 13,
            backgroundColor: 'rgba(255,255,255,0.2)',
            alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <Ionicons name={PAPER_AI_TOOL_ICONS[tool] as any} size={21} color="#FFF" />
          </View>

          {/* Label + description */}
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#FFF', fontSize: FONTS.sizes.base, fontWeight: '800', marginBottom: 2 }}>
              {PAPER_AI_TOOL_LABELS[tool]}
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.78)', fontSize: FONTS.sizes.xs, lineHeight: 16 }}>
              {disabled
                ? `Not applicable to ${SECTION_TYPE_DISPLAY[sectionType] ?? sectionType}`
                : PAPER_AI_TOOL_DESCRIPTIONS[tool]
              }
            </Text>
          </View>

          {/* Credit cost badge */}
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 3,
            backgroundColor: affordable ? 'rgba(255,255,255,0.22)' : 'rgba(255,70,70,0.35)',
            borderRadius: RADIUS.full, paddingHorizontal: 9, paddingVertical: 4,
            flexShrink: 0,
          }}>
            <Ionicons name="flash" size={10} color={affordable ? '#FFF' : '#FFB0B0'} />
            <Text style={{ color: affordable ? '#FFF' : '#FFB0B0', fontSize: 10, fontWeight: '800' }}>
              {cost} cr
            </Text>
          </View>
        </LinearGradient>
      </TouchableOpacity>
    );
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={!isProcessing ? onClose : undefined}
    >
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' }}
        onPress={!isProcessing ? onClose : undefined}
      >
        <Pressable
          onPress={e => e.stopPropagation()}
          style={{
            backgroundColor: COLORS.backgroundCard,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            paddingBottom: insets.bottom + SPACING.md,
            maxHeight: SCREEN_H * 0.88,
            borderTopWidth: 1,
            borderTopColor: COLORS.border,
          }}
        >
          {/* ── Processing overlay ─────────────────────────────────────────── */}
          {isProcessing && (
            <View style={{
              position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
              backgroundColor: 'rgba(10,10,26,0.95)',
              zIndex: 99,
              alignItems: 'center', justifyContent: 'center',
              gap: SPACING.lg,
              borderTopLeftRadius: 24, borderTopRightRadius: 24,
            }}>
              <LinearGradient
                colors={['#6C63FF', '#8B5CF6']}
                style={{
                  width: 72, height: 72, borderRadius: 20,
                  alignItems: 'center', justifyContent: 'center',
                  ...SHADOWS.large,
                }}
              >
                <Ionicons name="sparkles" size={34} color="#FFF" />
              </LinearGradient>
              <ActivityIndicator size="large" color={COLORS.primary} />
              <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '700', textAlign: 'center', paddingHorizontal: SPACING.xl }}>
                {processingLabel || 'AI is rewriting this section…'}
              </Text>
              <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
                Usually 10–20 seconds
              </Text>
            </View>
          )}

          {/* Handle */}
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.border, alignSelf: 'center', marginTop: SPACING.sm, marginBottom: SPACING.md }} />

          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.lg, marginBottom: SPACING.md }}>
            <LinearGradient
              colors={['#6C63FF', '#8B5CF6']}
              style={{ width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: SPACING.sm }}
            >
              <Ionicons name="sparkles" size={18} color="#FFF" />
            </LinearGradient>

            <View style={{ flex: 1 }}>
              <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '800' }}>
                AI Writing Tools
              </Text>
              {section && (
                <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 1 }}>
                  {subsectionTitle 
                    ? `${SECTION_TYPE_DISPLAY[sectionType] ?? section.title} › ${subsectionTitle}`
                    : SECTION_TYPE_DISPLAY[sectionType] ?? section.title
                  }
                </Text>
              )}
            </View>

            {/* Balance */}
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 4,
              backgroundColor: `${COLORS.primary}15`,
              borderRadius: RADIUS.full, paddingHorizontal: 9, paddingVertical: 5,
              borderWidth: 1, borderColor: `${COLORS.primary}30`,
            }}>
              <Ionicons name="flash" size={11} color={COLORS.primary} />
              <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.xs, fontWeight: '700' }}>
                {creditBalance} cr
              </Text>
            </View>

            <Pressable
              onPress={onClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={{ marginLeft: SPACING.sm }}
            >
              <Ionicons name="close" size={22} color={COLORS.textMuted} />
            </Pressable>
          </View>

          {/* ── Tool list ─────────────────────────────────────────────────── */}
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: SPACING.lg, paddingBottom: SPACING.lg, gap: SPACING.sm }}
          >
            {/* Primary tools */}
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
              Quick Edits
            </Text>
            {PAPER_AI_TOOLS_PRIMARY.map(renderTool)}

            <View style={{ height: 1, backgroundColor: COLORS.border, marginVertical: SPACING.sm }} />

            {/* Secondary tools */}
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
              Deep Rewrites
            </Text>
            {PAPER_AI_TOOLS_SECONDARY.map(renderTool)}

            {/* Low credits warning */}
            {creditBalance < 3 && (
              <Animated.View entering={FadeInDown.duration(300)} style={{
                backgroundColor: `${COLORS.error}12`, borderRadius: RADIUS.lg,
                padding: SPACING.md, borderWidth: 1, borderColor: `${COLORS.error}30`,
                flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: SPACING.sm,
              }}>
                <Ionicons name="alert-circle-outline" size={16} color={COLORS.error} />
                <Text style={{ color: COLORS.error, fontSize: FONTS.sizes.xs, flex: 1, lineHeight: 18 }}>
                  Low credits. Visit Profile → Credits to top up and unlock all AI tools.
                </Text>
              </Animated.View>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
});