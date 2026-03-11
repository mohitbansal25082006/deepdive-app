// src/components/research/AcademicPaperView.tsx
// Part 7 — AI Academic Paper Mode
//
// Full paper viewer used inside academic-paper.tsx screen.
// Features:
//   • Sticky title page header with paper meta stats
//   • Horizontal section navigator
//   • AcademicSectionCard for each section
//   • Citation style badge
//   • Export / share action bar

import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons }       from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../constants/theme';
import {
  AcademicPaper,
  AcademicSection,
  AcademicSectionType,
  Citation,
} from '../../types';
import { AcademicSectionCard } from './AcademicSectionCard';

const SCREEN_W = Dimensions.get('window').width;

// ─── Section navigator labels ─────────────────────────────────────────────────

const NAV_LABELS: Record<AcademicSectionType, string> = {
  abstract:          'Abstract',
  introduction:      'Intro',
  literature_review: 'Lit. Review',
  methodology:       'Method',
  findings:          'Findings',
  conclusion:        'Conclusion',
  references:        'References',
};

const NAV_ICONS: Record<AcademicSectionType, string> = {
  abstract:          'document-text-outline',
  introduction:      'compass-outline',
  literature_review: 'library-outline',
  methodology:       'construct-outline',
  findings:          'analytics-outline',
  conclusion:        'checkmark-circle-outline',
  references:        'link-outline',
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface AcademicPaperViewProps {
  paper:           AcademicPaper;
  onExportPDF:     () => void;
  onExportMarkdown:() => void;
  isExporting:     boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AcademicPaperView({
  paper,
  onExportPDF,
  onExportMarkdown,
  isExporting,
}: AcademicPaperViewProps) {
  const scrollRef       = useRef<ScrollView>(null);
  const sectionRefs     = useRef<Record<string, number>>({});
  const [activeId, setActiveId] = useState<string>(paper.sections[0]?.id ?? '');

  // Scroll main body to a section
  const scrollToSection = (sectionId: string) => {
    const y = sectionRefs.current[sectionId];
    if (y !== undefined) {
      scrollRef.current?.scrollTo({ y: y - 12, animated: true });
    }
    setActiveId(sectionId);
  };

  return (
    <View style={{ flex: 1 }}>

      {/* ── Title page header ─────────────────────────────────────────────── */}
      <Animated.View entering={FadeInDown.duration(400)}>
        <LinearGradient
          colors={['#12122A', '#1A1A35']}
          style={{
            paddingHorizontal: SPACING.lg,
            paddingTop:        SPACING.lg,
            paddingBottom:     SPACING.md,
            borderBottomWidth: 1,
            borderBottomColor: `${COLORS.primary}25`,
          }}
        >
          {/* Running head */}
          <View style={{
            flexDirection:  'row',
            alignItems:     'center',
            justifyContent: 'space-between',
            marginBottom:   SPACING.sm,
          }}>
            <Text style={{
              color:         COLORS.textMuted,
              fontSize:      FONTS.sizes.xs,
              fontWeight:    '600',
              letterSpacing: 0.8,
              textTransform: 'uppercase',
              flex:          1,
            }}
              numberOfLines={1}
            >
              {paper.runningHead}
            </Text>
            {/* Citation style badge */}
            <View style={{
              backgroundColor:  `${COLORS.primary}18`,
              borderRadius:     RADIUS.full,
              paddingHorizontal: 10,
              paddingVertical:   3,
              borderWidth:      1,
              borderColor:      `${COLORS.primary}35`,
              flexDirection:    'row',
              alignItems:       'center',
              gap:              4,
              flexShrink:       0,
              marginLeft:       SPACING.sm,
            }}>
              <Ionicons name="school-outline" size={11} color={COLORS.primary} />
              <Text style={{
                color:      COLORS.primary,
                fontSize:   9,
                fontWeight: '700',
              }}>
                {paper.citationStyle.toUpperCase()}
              </Text>
            </View>
          </View>

          {/* Paper title */}
          <Text style={{
            color:      COLORS.textPrimary,
            fontSize:   FONTS.sizes.lg,
            fontWeight: '800',
            lineHeight: 28,
            marginBottom: SPACING.sm,
          }}>
            {paper.title}
          </Text>

          {/* Keywords row */}
          <View style={{
            flexDirection:  'row',
            flexWrap:       'wrap',
            gap:             6,
            marginBottom:   SPACING.md,
          }}>
            {paper.keywords.map((kw, i) => (
              <View key={i} style={{
                backgroundColor:  `${COLORS.primary}12`,
                borderRadius:     RADIUS.full,
                paddingHorizontal: 10,
                paddingVertical:   3,
                borderWidth:      1,
                borderColor:      `${COLORS.primary}25`,
              }}>
                <Text style={{
                  color:      COLORS.primary,
                  fontSize:   FONTS.sizes.xs,
                  fontWeight: '600',
                }}>
                  {kw}
                </Text>
              </View>
            ))}
          </View>

          {/* Stats row */}
          <View style={{
            flexDirection:  'row',
            gap:             SPACING.sm,
            marginBottom:   SPACING.md,
          }}>
            {[
              { label: 'Words',    value: `~${paper.wordCount.toLocaleString()}`, icon: 'text-outline',            color: COLORS.info },
              { label: 'Pages',    value: `~${paper.pageEstimate}`,               icon: 'document-outline',        color: COLORS.primary },
              { label: 'Sections', value: String(paper.sections.length),          icon: 'list-outline',            color: COLORS.success },
              { label: 'Citations',value: String(paper.citations.length),         icon: 'link-outline',            color: COLORS.warning },
            ].map(stat => (
              <View key={stat.label} style={{
                flex:            1,
                backgroundColor: COLORS.backgroundElevated,
                borderRadius:    RADIUS.lg,
                padding:         SPACING.sm,
                alignItems:      'center',
                borderWidth:     1,
                borderColor:     COLORS.border,
              }}>
                <Ionicons name={stat.icon as any} size={14} color={stat.color} />
                <Text style={{
                  color:      stat.color,
                  fontSize:   FONTS.sizes.sm,
                  fontWeight: '800',
                  marginTop:  4,
                }}>
                  {stat.value}
                </Text>
                <Text style={{
                  color:    COLORS.textMuted,
                  fontSize: FONTS.sizes.xs,
                  marginTop: 1,
                }}>
                  {stat.label}
                </Text>
              </View>
            ))}
          </View>

          {/* Export actions */}
          <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
            <TouchableOpacity
              onPress={onExportPDF}
              disabled={isExporting}
              activeOpacity={0.8}
              style={{ flex: 1 }}
            >
              <LinearGradient
                colors={COLORS.gradientPrimary}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={{
                  borderRadius:   RADIUS.lg,
                  paddingVertical: 11,
                  flexDirection:  'row',
                  alignItems:     'center',
                  justifyContent: 'center',
                  gap:             6,
                  opacity:        isExporting ? 0.7 : 1,
                }}
              >
                {isExporting
                  ? <ActivityIndicator size="small" color="#FFF" />
                  : <Ionicons name="download-outline" size={16} color="#FFF" />
                }
                <Text style={{
                  color:      '#FFF',
                  fontSize:   FONTS.sizes.sm,
                  fontWeight: '700',
                }}>
                  {isExporting ? 'Exporting…' : 'Export PDF'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={onExportMarkdown}
              activeOpacity={0.8}
              style={{
                flex:            1,
                backgroundColor: COLORS.backgroundElevated,
                borderRadius:    RADIUS.lg,
                paddingVertical: 11,
                flexDirection:  'row',
                alignItems:     'center',
                justifyContent: 'center',
                gap:             6,
                borderWidth:     1,
                borderColor:     COLORS.border,
              }}
            >
              <Ionicons name="share-outline" size={16} color={COLORS.textSecondary} />
              <Text style={{
                color:      COLORS.textSecondary,
                fontSize:   FONTS.sizes.sm,
                fontWeight: '700',
              }}>
                Share
              </Text>
            </TouchableOpacity>
          </View>

          {/* Generated date */}
          <Text style={{
            color:     COLORS.textMuted,
            fontSize:  FONTS.sizes.xs,
            marginTop: SPACING.sm,
            textAlign: 'center',
          }}>
            Generated {formatDate(paper.generatedAt)}
          </Text>
        </LinearGradient>
      </Animated.View>

      {/* ── Section navigator (horizontal scroll) ─────────────────────────── */}
      <View style={{
        borderBottomWidth: 1,
        borderBottomColor: COLORS.border,
        backgroundColor:   COLORS.background,
      }}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: SPACING.lg,
            paddingVertical:   SPACING.sm,
            gap:               8,
          }}
        >
          {paper.sections.map((section) => {
            const isActive = section.id === activeId;
            const label    = NAV_LABELS[section.type] ?? section.title;
            const icon     = NAV_ICONS[section.type]  ?? 'document-outline';

            return (
              <TouchableOpacity
                key={section.id}
                onPress={() => scrollToSection(section.id)}
                activeOpacity={0.75}
                style={{
                  flexDirection:   'row',
                  alignItems:      'center',
                  gap:              5,
                  backgroundColor: isActive
                    ? `${COLORS.primary}20`
                    : COLORS.backgroundElevated,
                  borderRadius:    RADIUS.full,
                  paddingHorizontal: 12,
                  paddingVertical:   7,
                  borderWidth:     1,
                  borderColor:     isActive ? COLORS.primary : COLORS.border,
                }}
              >
                <Ionicons
                  name={icon as any}
                  size={12}
                  color={isActive ? COLORS.primary : COLORS.textMuted}
                />
                <Text style={{
                  color:      isActive ? COLORS.primary : COLORS.textMuted,
                  fontSize:   FONTS.sizes.xs,
                  fontWeight: isActive ? '700' : '400',
                }}>
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* ── Main scrollable content ──────────────────────────────────────── */}
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{
          padding:       SPACING.lg,
          paddingBottom: 60,
        }}
        showsVerticalScrollIndicator={false}
      >
        {paper.sections.map((section, i) => (
          <View
            key={section.id}
            onLayout={(e) => {
              sectionRefs.current[section.id] = e.nativeEvent.layout.y;
            }}
          >
            <AcademicSectionCard
              section={section}
              index={i}
              citations={paper.citations}
              isActive={section.id === activeId}
              onPress={() => setActiveId(section.id)}
            />
          </View>
        ))}
      </ScrollView>
    </View>
  );
}