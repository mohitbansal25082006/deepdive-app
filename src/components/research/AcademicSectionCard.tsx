// src/components/research/AcademicSectionCard.tsx
// Part 7 — AI Academic Paper Mode
// Part 41.8 — Dynamic section type support: custom sections get color/icon
//              from SECTION_TYPE_COLORS/SECTION_TYPE_ICONS constants.
//              All section types now render correctly, not just the 7 canonical ones.

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Clipboard,
  ToastAndroid,
  Platform,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons }       from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../constants/theme';
import { AcademicSection, Citation } from '../../types';
import {
  SECTION_TYPE_COLORS,
  SECTION_TYPE_ICONS,
} from '../../constants/paperEditor';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getSectionAccent(type: string): string {
  return SECTION_TYPE_COLORS[type] ?? '#6C63FF';
}

function getSectionIcon(type: string): string {
  return SECTION_TYPE_ICONS[type] ?? 'document-text-outline';
}

function getSectionGradient(type: string): readonly [string, string] {
  const accent = getSectionAccent(type);
  return [accent, `${accent}BB`];
}

/** Build a short "badge" label for the section header */
function getSectionBadge(type: string, index: number): string | null {
  const CANONICAL_BADGES: Record<string, string> = {
    abstract:          '250–300 words',
    introduction:      'Section 1',
    literature_review: 'Section 2',
    methodology:       'Section 3',
    findings:          'Section 4',
    conclusion:        'Section 5',
    references:        'Citations',
  };
  return CANONICAL_BADGES[type] ?? null;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface AcademicSectionCardProps {
  section:   AcademicSection;
  index:     number;
  citations: Citation[];
  isActive?: boolean;
  onPress?:  () => void;
}

// ─── Paragraph renderer ───────────────────────────────────────────────────────

function Paragraphs({ text }: { text: string }) {
  if (!text?.trim()) return null;
  const paras = text.split(/\n{2,}|\n/).map(p => p.trim()).filter(Boolean);
  return (
    <>
      {paras.map((p, i) => (
        <Text key={i} style={{
          color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, lineHeight: 24,
          marginBottom: i < paras.length - 1 ? SPACING.sm : 0,
        }}>
          {p}
        </Text>
      ))}
    </>
  );
}

// ─── References list renderer ─────────────────────────────────────────────────

function ReferencesList({ content }: { content: string }) {
  const lines = (content ?? '').split('\n').map(l => l.trim()).filter(Boolean);
  return (
    <View style={{ gap: 10 }}>
      {lines.map((line, i) => (
        <View key={i} style={{
          flexDirection: 'row', alignItems: 'flex-start',
          paddingLeft: SPACING.md,
          borderLeftWidth: 2, borderLeftColor: `${COLORS.textMuted}40`,
        }}>
          <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, lineHeight: 20, flex: 1 }}>
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
  section, index, citations, isActive = false, onPress,
}: AcademicSectionCardProps) {
  const accentColor = getSectionAccent(section.type);
  const icon        = getSectionIcon(section.type);
  const gradient    = getSectionGradient(section.type);
  const badge       = getSectionBadge(section.type, index);

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
    .join(' ').trim().split(/\s+/).filter(Boolean).length;

  return (
    <Animated.View entering={FadeInDown.duration(400).delay(index * 60)}>
      <View style={{
        backgroundColor: COLORS.backgroundCard,
        borderRadius:    RADIUS.xl,
        marginBottom:    SPACING.md,
        borderWidth:     1,
        borderColor:     isActive ? `${accentColor}50` : COLORS.border,
        overflow:        'hidden',
        ...(isActive ? SHADOWS.small : {}),
      }}>

        {/* ── Section header ── */}
        <TouchableOpacity
          onPress={() => { setExpanded(e => !e); onPress?.(); }}
          activeOpacity={0.8}
          style={{
            flexDirection: 'row', alignItems: 'center',
            padding: SPACING.md, gap: SPACING.sm,
            backgroundColor: isActive ? `${accentColor}08` : 'transparent',
          }}
        >
          <LinearGradient
            colors={gradient as [string, string]}
            style={{
              width: 42, height: 42, borderRadius: 12,
              alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}
          >
            <Ionicons name={icon as any} size={20} color="#FFF" />
          </LinearGradient>

          <View style={{ flex: 1 }}>
            <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '700', marginBottom: 2 }}>
              {section.title}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {badge && (
                <View style={{
                  backgroundColor: `${accentColor}18`, borderRadius: RADIUS.full,
                  paddingHorizontal: 8, paddingVertical: 2,
                  borderWidth: 1, borderColor: `${accentColor}30`,
                }}>
                  <Text style={{ color: accentColor, fontSize: 9, fontWeight: '700', letterSpacing: 0.5 }}>
                    {badge}
                  </Text>
                </View>
              )}
              <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
                ~{wordCount.toLocaleString()} words
              </Text>
              {(section.subsections?.length ?? 0) > 0 && (
                <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
                  · {section.subsections!.length} subsections
                </Text>
              )}
            </View>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <TouchableOpacity
              onPress={handleCopy}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={{
                width: 30, height: 30, borderRadius: 9,
                backgroundColor: COLORS.backgroundElevated,
                alignItems: 'center', justifyContent: 'center',
                borderWidth: 1, borderColor: COLORS.border,
              }}
            >
              <Ionicons
                name={copying ? 'checkmark' : 'copy-outline'}
                size={14}
                color={copying ? COLORS.success : COLORS.textMuted}
              />
            </TouchableOpacity>

            <View style={{
              width: 30, height: 30, borderRadius: 9,
              backgroundColor: COLORS.backgroundElevated,
              alignItems: 'center', justifyContent: 'center',
              borderWidth: 1, borderColor: COLORS.border,
            }}>
              <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color={COLORS.textMuted} />
            </View>
          </View>
        </TouchableOpacity>

        {/* ── Expanded body ── */}
        {expanded && (
          <View style={{
            paddingHorizontal: SPACING.md, paddingBottom: SPACING.md,
            borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: SPACING.md,
          }}>
            {section.type === 'abstract' ? (
              <View style={{
                backgroundColor: `${accentColor}06`, borderRadius: RADIUS.lg,
                padding: SPACING.md, borderWidth: 1, borderColor: `${accentColor}20`,
                borderLeftWidth: 3, borderLeftColor: accentColor,
              }}>
                <Paragraphs text={section.content} />
              </View>
            ) : section.type === 'references' ? (
              <ReferencesList content={section.content} />
            ) : (
              <>
                {section.content?.trim() ? <Paragraphs text={section.content} /> : null}
                {(section.subsections ?? []).map((sub, si) => (
                  <View key={sub.id ?? si} style={{
                    marginTop: SPACING.md, paddingTop: SPACING.md,
                    borderTopWidth: 1, borderTopColor: `${COLORS.border}80`,
                  }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: SPACING.sm }}>
                      <View style={{ width: 3, height: 16, borderRadius: 2, backgroundColor: accentColor }} />
                      <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '700', flex: 1 }}>
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