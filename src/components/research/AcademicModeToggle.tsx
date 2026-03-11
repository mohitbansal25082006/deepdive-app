// src/components/research/AcademicModeToggle.tsx
// Part 7 — AI Academic Paper Mode
//
// A toggle card rendered on the research-input screen that lets the user
// switch between Standard Report mode and Academic Paper mode.
// When Academic mode is enabled the component expands to show a citation-
// style picker (APA · MLA · Chicago · IEEE).

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Switch,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons }       from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';
import { ResearchMode, AcademicCitationStyle } from '../../types';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface AcademicModeToggleProps {
  mode:               ResearchMode;
  onModeChange:       (mode: ResearchMode) => void;
  citationStyle:      AcademicCitationStyle;
  onCitationChange:   (style: AcademicCitationStyle) => void;
}

// ─── Citation styles config ───────────────────────────────────────────────────

const CITATION_STYLES: {
  key:   AcademicCitationStyle;
  label: string;
  desc:  string;
  usage: string;
}[] = [
  {
    key:   'apa',
    label: 'APA',
    desc:  'Author-Date',
    usage: 'Psychology · Social Sciences · Education',
  },
  {
    key:   'mla',
    label: 'MLA',
    desc:  'Author-Page',
    usage: 'Humanities · Literature · Arts',
  },
  {
    key:   'chicago',
    label: 'Chicago',
    desc:  'Notes-Bibliography',
    usage: 'History · Arts · Humanities',
  },
  {
    key:   'ieee',
    label: 'IEEE',
    desc:  'Numbered [N]',
    usage: 'Engineering · Computer Science · Technology',
  },
];

// ─── Academic paper sections preview ─────────────────────────────────────────

const PAPER_SECTIONS = [
  { icon: 'document-text-outline', label: 'Abstract' },
  { icon: 'compass-outline',       label: 'Introduction' },
  { icon: 'library-outline',       label: 'Literature Review' },
  { icon: 'construct-outline',     label: 'Methodology' },
  { icon: 'search-outline',        label: 'Findings' },
  { icon: 'checkmark-circle-outline', label: 'Conclusion' },
  { icon: 'link-outline',          label: 'References' },
];

// ─── Component ────────────────────────────────────────────────────────────────

export function AcademicModeToggle({
  mode,
  onModeChange,
  citationStyle,
  onCitationChange,
}: AcademicModeToggleProps) {
  const isAcademic = mode === 'academic';

  const handleToggle = (value: boolean) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    onModeChange(value ? 'academic' : 'standard');
  };

  return (
    <Animated.View entering={FadeInDown.duration(400).delay(200)}>

      {/* ── Toggle card ──────────────────────────────────────────────────── */}
      <View style={{
        backgroundColor: isAcademic ? `${COLORS.primary}10` : COLORS.backgroundCard,
        borderRadius:    RADIUS.xl,
        borderWidth:     1.5,
        borderColor:     isAcademic ? `${COLORS.primary}50` : COLORS.border,
        overflow:        'hidden',
      }}>

        {/* Header row */}
        <TouchableOpacity
          onPress={() => handleToggle(!isAcademic)}
          activeOpacity={0.8}
          style={{
            flexDirection:  'row',
            alignItems:     'center',
            padding:         SPACING.md,
            gap:             SPACING.md,
          }}
        >
          {/* Icon */}
          <LinearGradient
            colors={isAcademic ? COLORS.gradientPrimary : ['#2A2A4A', '#1A1A35']}
            style={{
              width:          52,
              height:         52,
              borderRadius:   14,
              alignItems:     'center',
              justifyContent: 'center',
              flexShrink:     0,
            }}
          >
            <Ionicons
              name="school"
              size={24}
              color={isAcademic ? '#FFF' : COLORS.textMuted}
            />
          </LinearGradient>

          {/* Text */}
          <View style={{ flex: 1 }}>
            <View style={{
              flexDirection:  'row',
              alignItems:     'center',
              gap:             8,
              marginBottom:    2,
            }}>
              <Text style={{
                color:      COLORS.textPrimary,
                fontSize:   FONTS.sizes.base,
                fontWeight: '800',
              }}>
                Academic Paper Mode
              </Text>
              {isAcademic && (
                <Animated.View
                  entering={FadeIn.duration(250)}
                  style={{
                    backgroundColor: `${COLORS.primary}25`,
                    borderRadius:    RADIUS.full,
                    paddingHorizontal: 8,
                    paddingVertical:   2,
                    borderWidth:     1,
                    borderColor:     `${COLORS.primary}40`,
                    flexDirection:   'row',
                    alignItems:      'center',
                    gap:             4,
                  }}
                >
                  <Ionicons name="sparkles" size={9} color={COLORS.primary} />
                  <Text style={{
                    color:      COLORS.primary,
                    fontSize:   9,
                    fontWeight: '700',
                  }}>
                    ON
                  </Text>
                </Animated.View>
              )}
            </View>
            <Text style={{
              color:     COLORS.textMuted,
              fontSize:  FONTS.sizes.xs,
              lineHeight: 16,
            }}>
              {isAcademic
                ? `Generates a full journal-style paper · ${citationStyle.toUpperCase()} citations`
                : 'Generate a peer-review–style paper with 7 academic sections'
              }
            </Text>
          </View>

          {/* Switch */}
          <Switch
            value={isAcademic}
            onValueChange={handleToggle}
            trackColor={{
              false: COLORS.backgroundElevated,
              true:  `${COLORS.primary}60`,
            }}
            thumbColor={isAcademic ? COLORS.primary : COLORS.textMuted}
            ios_backgroundColor={COLORS.backgroundElevated}
          />
        </TouchableOpacity>

        {/* ── Expanded panel (only when academic is ON) ──────────────────── */}
        {isAcademic && (
          <Animated.View
            entering={FadeInDown.duration(300)}
            style={{
              borderTopWidth: 1,
              borderTopColor: `${COLORS.primary}20`,
            }}
          >
            {/* Sections preview strip */}
            <View style={{
              paddingHorizontal: SPACING.md,
              paddingTop:        SPACING.sm,
              paddingBottom:     SPACING.xs,
            }}>
              <Text style={{
                color:          COLORS.textMuted,
                fontSize:       FONTS.sizes.xs,
                fontWeight:     '600',
                letterSpacing:  0.8,
                textTransform:  'uppercase',
                marginBottom:   SPACING.sm,
              }}>
                Paper Structure (7 Sections)
              </Text>

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {PAPER_SECTIONS.map((s, i) => (
                  <View
                    key={s.label}
                    style={{
                      flexDirection:   'row',
                      alignItems:      'center',
                      gap:             4,
                      backgroundColor: `${COLORS.primary}12`,
                      borderRadius:    RADIUS.full,
                      paddingHorizontal: 10,
                      paddingVertical:   5,
                      borderWidth:     1,
                      borderColor:     `${COLORS.primary}25`,
                    }}
                  >
                    <Text style={{
                      color:      `${COLORS.primary}90`,
                      fontSize:   FONTS.sizes.xs,
                      fontWeight: '600',
                    }}>
                      {i + 1}.
                    </Text>
                    <Ionicons name={s.icon as any} size={11} color={COLORS.primary} />
                    <Text style={{
                      color:      COLORS.primary,
                      fontSize:   FONTS.sizes.xs,
                      fontWeight: '600',
                    }}>
                      {s.label}
                    </Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Citation style picker */}
            <View style={{
              paddingHorizontal: SPACING.md,
              paddingBottom:     SPACING.md,
              paddingTop:        SPACING.sm,
              borderTopWidth:    1,
              borderTopColor:    `${COLORS.primary}15`,
            }}>
              <Text style={{
                color:          COLORS.textMuted,
                fontSize:       FONTS.sizes.xs,
                fontWeight:     '600',
                letterSpacing:  0.8,
                textTransform:  'uppercase',
                marginBottom:   SPACING.sm,
              }}>
                Citation Style
              </Text>

              <View style={{ flexDirection: 'row', gap: 8 }}>
                {CITATION_STYLES.map((cs) => {
                  const isSelected = citationStyle === cs.key;
                  return (
                    <TouchableOpacity
                      key={cs.key}
                      onPress={() => onCitationChange(cs.key)}
                      activeOpacity={0.75}
                      style={{
                        flex:            1,
                        backgroundColor: isSelected
                          ? `${COLORS.primary}20`
                          : COLORS.backgroundElevated,
                        borderRadius:    RADIUS.md,
                        padding:         SPACING.sm,
                        alignItems:      'center',
                        borderWidth:     1.5,
                        borderColor:     isSelected
                          ? COLORS.primary
                          : COLORS.border,
                      }}
                    >
                      <Text style={{
                        color:      isSelected ? COLORS.primary : COLORS.textSecondary,
                        fontSize:   FONTS.sizes.sm,
                        fontWeight: '800',
                      }}>
                        {cs.label}
                      </Text>
                      <Text style={{
                        color:     COLORS.textMuted,
                        fontSize:  9,
                        marginTop: 2,
                        textAlign: 'center',
                      }}>
                        {cs.desc}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Usage hint for selected style */}
              <View style={{
                flexDirection:   'row',
                alignItems:      'center',
                gap:             6,
                marginTop:       SPACING.sm,
                backgroundColor: `${COLORS.info}08`,
                borderRadius:    RADIUS.md,
                padding:         SPACING.sm,
                borderWidth:     1,
                borderColor:     `${COLORS.info}15`,
              }}>
                <Ionicons name="information-circle-outline" size={13} color={COLORS.info} />
                <Text style={{
                  color:     COLORS.textMuted,
                  fontSize:  FONTS.sizes.xs,
                  flex:      1,
                }}>
                  <Text style={{ color: COLORS.info, fontWeight: '600' }}>
                    {CITATION_STYLES.find(c => c.key === citationStyle)?.label ?? 'APA'}:{' '}
                  </Text>
                  {CITATION_STYLES.find(c => c.key === citationStyle)?.usage ?? ''}
                </Text>
              </View>
            </View>

            {/* Time / length warning */}
            <View style={{
              flexDirection:   'row',
              alignItems:      'center',
              gap:             8,
              marginHorizontal: SPACING.md,
              marginBottom:    SPACING.md,
              backgroundColor: `${COLORS.warning}08`,
              borderRadius:    RADIUS.md,
              padding:         SPACING.sm,
              borderWidth:     1,
              borderColor:     `${COLORS.warning}20`,
            }}>
              <Ionicons name="time-outline" size={14} color={COLORS.warning} />
              <Text style={{
                color:     COLORS.textMuted,
                fontSize:  FONTS.sizes.xs,
                flex:      1,
                lineHeight: 16,
              }}>
                Academic mode adds{' '}
                <Text style={{ color: COLORS.warning, fontWeight: '600' }}>
                  ~2–3 extra minutes
                </Text>
                {' '}to generate a{' '}
                <Text style={{ color: COLORS.warning, fontWeight: '600' }}>
                  3500–5000 word paper
                </Text>
                {' '}after the standard report completes.
              </Text>
            </View>
          </Animated.View>
        )}
      </View>
    </Animated.View>
  );
}