// src/components/research/AcademicSectionCard.tsx
// Part 7 — AI Academic Paper Mode
//
// Renders a single AcademicSection inside the paper viewer.
// Supports all 7 section types with appropriate styling:
//   abstract, introduction, literature_review, methodology,
//   findings, conclusion, references

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Clipboard,
  ToastAndroid,
  Platform,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons }       from '@expo/vector-icons';
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../constants/theme';
import { AcademicSection, AcademicSectionType, Citation } from '../../types';

// ─── Section metadata ─────────────────────────────────────────────────────────

interface SectionMeta {
  icon:        string;
  gradient:    readonly [string, string];
  accentColor: string;
  badge?:      string;
}

const SECTION_META: Record<AcademicSectionType, SectionMeta> = {
  abstract: {
    icon:        'document-text-outline',
    gradient:    ['#6C63FF', '#8B5CF6'],
    accentColor: COLORS.primary,
    badge:       '250–300 words',
  },
  introduction: {
    icon:        'compass-outline',
    gradient:    ['#29B6F6', '#0288D1'],
    accentColor: COLORS.info,
    badge:       'Section 1',
  },
  literature_review: {
    icon:        'library-outline',
    gradient:    ['#43E97B', '#38F9D7'],
    accentColor: COLORS.success,
    badge:       'Section 2',
  },
  methodology: {
    icon:        'construct-outline',
    gradient:    ['#FFA726', '#FB8C00'],
    accentColor: COLORS.warning,
    badge:       'Section 3',
  },
  findings: {
    icon:        'analytics-outline',
    gradient:    ['#FF6584', '#FF8E53'],
    accentColor: COLORS.secondary,
    badge:       'Section 4',
  },
  conclusion: {
    icon:        'checkmark-circle-outline',
    gradient:    ['#6C63FF', '#4A42CC'],
    accentColor: COLORS.primary,
    badge:       'Section 5',
  },
  references: {
    icon:        'link-outline',
    gradient:    ['#5A5A7A', '#3A3A5A'],
    accentColor: COLORS.textMuted,
    badge:       'Citations',
  },
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface AcademicSectionCardProps {
  section:   AcademicSection;
  index:     number;
  citations: Citation[];
  isActive?: boolean;
  onPress?:  () => void;
}

// ─── Paragraph renderer ───────────────────────────────────────────────────────

function Paragraphs({ text, style }: { text: string; style?: object }) {
  if (!text?.trim()) return null;
  const paras = text
    .split(/\n{2,}|\n/)
    .map(p => p.trim())
    .filter(Boolean);
  return (
    <>
      {paras.map((p, i) => (
        <Text
          key={i}
          style={[{
            color:      COLORS.textSecondary,
            fontSize:   FONTS.sizes.sm,
            lineHeight: 24,
            marginBottom: i < paras.length - 1 ? SPACING.sm : 0,
          }, style]}
        >
          {p}
        </Text>
      ))}
    </>
  );
}

// ─── References list renderer ─────────────────────────────────────────────────

function ReferencesList({ content }: { content: string }) {
  const lines = (content ?? '')
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);

  return (
    <View style={{ gap: 10 }}>
      {lines.map((line, i) => (
        <View
          key={i}
          style={{
            flexDirection:  'row',
            alignItems:     'flex-start',
            paddingLeft:    SPACING.md,
            borderLeftWidth: 2,
            borderLeftColor: `${COLORS.textMuted}40`,
          }}
        >
          <Text style={{
            color:      COLORS.textMuted,
            fontSize:   FONTS.sizes.xs,
            lineHeight: 20,
            flex:       1,
          }}>
            {line}
          </Text>
        </View>
      ))}
    </View>
  );
}

// ─── Copy helper ─────────────────────────────────────────────────────────────

function copyText(text: string, label = 'Text') {
  Clipboard.setString(text);
  if (Platform.OS === 'android') {
    ToastAndroid.show(`${label} copied`, ToastAndroid.SHORT);
  } else {
    Alert.alert('Copied', `${label} copied to clipboard.`);
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AcademicSectionCard({
  section,
  index,
  citations,
  isActive = false,
  onPress,
}: AcademicSectionCardProps) {
  const meta = SECTION_META[section.type] ?? SECTION_META['introduction'];
  const [expanded, setExpanded] = useState(true);
  const [copying,  setCopying]  = useState(false);

  const handleCopy = () => {
    const fullText = [
      section.title,
      section.content,
      ...(section.subsections ?? []).map(s => `${s.title}\n${s.content}`),
    ].join('\n\n');
    copyText(fullText, section.title);
    setCopying(true);
    setTimeout(() => setCopying(false), 1500);
  };

  const wordCount = [section.content, ...(section.subsections ?? []).map(s => s.content)]
    .join(' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;

  return (
    <Animated.View entering={FadeInDown.duration(400).delay(index * 60)}>
      <View style={{
        backgroundColor: COLORS.backgroundCard,
        borderRadius:    RADIUS.xl,
        marginBottom:    SPACING.md,
        borderWidth:     1,
        borderColor:     isActive ? `${meta.accentColor}50` : COLORS.border,
        overflow:        'hidden',
        ...( isActive ? SHADOWS.small : {}),
      }}>

        {/* ── Section header ──────────────────────────────────────────────── */}
        <TouchableOpacity
          onPress={() => {
            setExpanded(e => !e);
            onPress?.();
          }}
          activeOpacity={0.8}
          style={{
            flexDirection:  'row',
            alignItems:     'center',
            padding:         SPACING.md,
            gap:             SPACING.sm,
            backgroundColor: isActive ? `${meta.accentColor}08` : 'transparent',
          }}
        >
          {/* Icon */}
          <LinearGradient
            colors={meta.gradient}
            style={{
              width:          42,
              height:         42,
              borderRadius:   12,
              alignItems:     'center',
              justifyContent: 'center',
              flexShrink:     0,
            }}
          >
            <Ionicons name={meta.icon as any} size={20} color="#FFF" />
          </LinearGradient>

          {/* Title + word count */}
          <View style={{ flex: 1 }}>
            <Text style={{
              color:      COLORS.textPrimary,
              fontSize:   FONTS.sizes.base,
              fontWeight: '700',
              marginBottom: 2,
            }}>
              {section.title}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {meta.badge && (
                <View style={{
                  backgroundColor: `${meta.accentColor}18`,
                  borderRadius:    RADIUS.full,
                  paddingHorizontal: 8,
                  paddingVertical:   2,
                  borderWidth:     1,
                  borderColor:     `${meta.accentColor}30`,
                }}>
                  <Text style={{
                    color:      meta.accentColor,
                    fontSize:   9,
                    fontWeight: '700',
                    letterSpacing: 0.5,
                  }}>
                    {meta.badge}
                  </Text>
                </View>
              )}
              <Text style={{
                color:    COLORS.textMuted,
                fontSize: FONTS.sizes.xs,
              }}>
                ~{wordCount.toLocaleString()} words
              </Text>
              {(section.subsections?.length ?? 0) > 0 && (
                <Text style={{
                  color:    COLORS.textMuted,
                  fontSize: FONTS.sizes.xs,
                }}>
                  · {section.subsections!.length} subsections
                </Text>
              )}
            </View>
          </View>

          {/* Action buttons */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <TouchableOpacity
              onPress={handleCopy}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={{
                width:          30,
                height:         30,
                borderRadius:   9,
                backgroundColor: COLORS.backgroundElevated,
                alignItems:     'center',
                justifyContent: 'center',
                borderWidth:    1,
                borderColor:    COLORS.border,
              }}
            >
              <Ionicons
                name={copying ? 'checkmark' : 'copy-outline'}
                size={14}
                color={copying ? COLORS.success : COLORS.textMuted}
              />
            </TouchableOpacity>

            <View style={{
              width:          30,
              height:         30,
              borderRadius:   9,
              backgroundColor: COLORS.backgroundElevated,
              alignItems:     'center',
              justifyContent: 'center',
              borderWidth:    1,
              borderColor:    COLORS.border,
            }}>
              <Ionicons
                name={expanded ? 'chevron-up' : 'chevron-down'}
                size={14}
                color={COLORS.textMuted}
              />
            </View>
          </View>
        </TouchableOpacity>

        {/* ── Expanded body ────────────────────────────────────────────────── */}
        {expanded && (
          <View style={{
            paddingHorizontal: SPACING.md,
            paddingBottom:     SPACING.md,
            borderTopWidth:    1,
            borderTopColor:    COLORS.border,
            paddingTop:        SPACING.md,
          }}>

            {/* Abstract: special box */}
            {section.type === 'abstract' ? (
              <View style={{
                backgroundColor: `${meta.accentColor}06`,
                borderRadius:    RADIUS.lg,
                padding:         SPACING.md,
                borderWidth:     1,
                borderColor:     `${meta.accentColor}20`,
                borderLeftWidth: 3,
                borderLeftColor: meta.accentColor,
              }}>
                <Paragraphs text={section.content} />
              </View>
            ) : section.type === 'references' ? (
              <ReferencesList content={section.content} />
            ) : (
              <>
                {/* Section main content */}
                {section.content?.trim() ? (
                  <Paragraphs text={section.content} />
                ) : null}

                {/* Subsections */}
                {(section.subsections ?? []).map((sub, si) => (
                  <View
                    key={sub.id ?? si}
                    style={{
                      marginTop:        SPACING.md,
                      paddingTop:       SPACING.md,
                      borderTopWidth:   1,
                      borderTopColor:   `${COLORS.border}80`,
                    }}
                  >
                    {/* Subsection heading */}
                    <View style={{
                      flexDirection:  'row',
                      alignItems:     'center',
                      gap:             8,
                      marginBottom:    SPACING.sm,
                    }}>
                      <View style={{
                        width:           3,
                        height:          16,
                        borderRadius:    2,
                        backgroundColor: meta.accentColor,
                      }} />
                      <Text style={{
                        color:      COLORS.textPrimary,
                        fontSize:   FONTS.sizes.sm,
                        fontWeight: '700',
                        flex:        1,
                      }}>
                        {sub.title}
                      </Text>
                    </View>

                    <Paragraphs text={sub.content} />
                  </View>
                ))}
              </>
            )}
          </View>
        )}
      </View>
    </Animated.View>
  );
}