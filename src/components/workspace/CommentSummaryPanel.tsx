// src/components/workspace/CommentSummaryPanel.tsx
// Part 12 — AI-powered discussion summary panel.
// Shows decisions, open questions, action items, and key themes
// extracted by GPT-4o from all comments on a report.

import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity,
  ActivityIndicator, StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown, Layout } from 'react-native-reanimated';
import { CommentSummaryResult } from '../../services/commentSummaryService';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';

// ─── Section config ───────────────────────────────────────────────────────────

const SECTIONS = [
  {
    key:       'decisions' as const,
    label:     'Decisions Made',
    icon:      'checkmark-done-circle-outline' as const,
    color:     COLORS.success,
    emptyText: 'No clear decisions found in the discussion.',
  },
  {
    key:       'openQuestions' as const,
    label:     'Open Questions',
    icon:      'help-circle-outline' as const,
    color:     COLORS.warning,
    emptyText: 'No open questions identified.',
  },
  {
    key:       'actionItems' as const,
    label:     'Action Items',
    icon:      'list-circle-outline' as const,
    color:     COLORS.primary,
    emptyText: 'No action items mentioned.',
  },
  {
    key:       'keyThemes' as const,
    label:     'Key Themes',
    icon:      'pricetag-outline' as const,
    color:     COLORS.info,
    emptyText: 'No recurring themes found.',
  },
] as const;

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  summary:      CommentSummaryResult | null;
  isGenerating: boolean;
  error:        string | null;
  totalComments: number;
  onGenerate:   () => void;
  onClose:      () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CommentSummaryPanel({
  summary, isGenerating, error, totalComments, onGenerate, onClose,
}: Props) {
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  const toggleSection = (key: string) => {
    setExpandedSection((prev) => (prev === key ? null : key));
  };

  const hasContent = summary && (
    summary.decisions.length > 0 ||
    summary.openQuestions.length > 0 ||
    summary.actionItems.length > 0 ||
    summary.keyThemes.length > 0
  );

  return (
    <Animated.View entering={FadeIn.duration(300)} style={styles.container}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.headerIconWrap}>
            <Ionicons name="sparkles" size={16} color={COLORS.primary} />
          </View>
          <View>
            <Text style={styles.headerTitle}>AI Discussion Summary</Text>
            {summary && (
              <Text style={styles.headerMeta}>
                {summary.totalComments} comment{summary.totalComments !== 1 ? 's' : ''}
                {summary.totalReplies > 0 ? ` · ${summary.totalReplies} replies` : ''} analysed
              </Text>
            )}
          </View>
        </View>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
          <Ionicons name="close" size={16} color={COLORS.textMuted} />
        </TouchableOpacity>
      </View>

      {/* ── Generating state ── */}
      {isGenerating && (
        <Animated.View entering={FadeIn.duration(200)} style={styles.generatingWrap}>
          <ActivityIndicator color={COLORS.primary} size="small" />
          <Text style={styles.generatingText}>
            Analysing {totalComments} comment{totalComments !== 1 ? 's' : ''}…
          </Text>
        </Animated.View>
      )}

      {/* ── Error state ── */}
      {!isGenerating && error && (
        <Animated.View entering={FadeIn.duration(200)} style={styles.errorWrap}>
          <Ionicons name="alert-circle-outline" size={20} color={COLORS.error} />
          <Text style={styles.errorText}>{error}</Text>
          {totalComments > 0 && (
            <TouchableOpacity onPress={onGenerate} style={styles.retryBtn} activeOpacity={0.8}>
              <Ionicons name="refresh-outline" size={14} color={COLORS.primary} />
              <Text style={styles.retryBtnText}>Retry</Text>
            </TouchableOpacity>
          )}
        </Animated.View>
      )}

      {/* ── Empty / no comments ── */}
      {!isGenerating && !error && !summary && (
        <Animated.View entering={FadeIn.duration(200)} style={styles.emptyWrap}>
          {totalComments === 0 ? (
            <>
              <Ionicons name="chatbubbles-outline" size={36} color={COLORS.textMuted} />
              <Text style={styles.emptyTitle}>No comments yet</Text>
              <Text style={styles.emptyDesc}>
                Add some discussion to the report before generating a summary.
              </Text>
            </>
          ) : (
            <>
              <Ionicons name="sparkles-outline" size={36} color={COLORS.primary} />
              <Text style={styles.emptyTitle}>Summarize Discussion</Text>
              <Text style={styles.emptyDesc}>
                GPT-4o will read all {totalComments} comment{totalComments !== 1 ? 's' : ''} and extract decisions, open questions, and action items.
              </Text>
              <TouchableOpacity
                onPress={onGenerate}
                style={styles.generateBtn}
                activeOpacity={0.85}
              >
                <Ionicons name="sparkles" size={16} color="#FFF" />
                <Text style={styles.generateBtnText}>Generate Summary</Text>
              </TouchableOpacity>
            </>
          )}
        </Animated.View>
      )}

      {/* ── Summary content ── */}
      {!isGenerating && !error && summary && (
        <Animated.View entering={FadeInDown.duration(360)} layout={Layout.springify()}>
          {/* Key themes row (always expanded, horizontal chips) */}
          {summary.keyThemes.length > 0 && (
            <View style={styles.themesWrap}>
              {summary.keyThemes.map((theme, i) => (
                <View key={i} style={styles.themeChip}>
                  <Text style={styles.themeChipText}>{theme}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Sections */}
          {SECTIONS.filter((s) => s.key !== 'keyThemes').map((section) => {
            const items = summary[section.key] as string[];
            const isExpanded = expandedSection === section.key;

            return (
              <Animated.View
                key={section.key}
                layout={Layout.springify()}
                style={styles.section}
              >
                <TouchableOpacity
                  onPress={() => toggleSection(section.key)}
                  style={styles.sectionHeader}
                  activeOpacity={0.75}
                >
                  <View style={[styles.sectionIconWrap, { backgroundColor: `${section.color}15` }]}>
                    <Ionicons name={section.icon} size={15} color={section.color} />
                  </View>
                  <Text style={[styles.sectionLabel, { color: section.color }]}>
                    {section.label}
                  </Text>
                  <View style={[styles.sectionCountBadge, { backgroundColor: `${section.color}15` }]}>
                    <Text style={[styles.sectionCount, { color: section.color }]}>
                      {items.length}
                    </Text>
                  </View>
                  <Ionicons
                    name={isExpanded ? 'chevron-up' : 'chevron-down'}
                    size={14}
                    color={COLORS.textMuted}
                  />
                </TouchableOpacity>

                {isExpanded && (
                  <Animated.View entering={FadeInDown.duration(200)}>
                    {items.length === 0 ? (
                      <Text style={styles.sectionEmpty}>{section.emptyText}</Text>
                    ) : (
                      items.map((item, i) => (
                        <View key={i} style={styles.bulletRow}>
                          <View style={[styles.bulletDot, { backgroundColor: section.color }]} />
                          <Text style={styles.bulletText}>{item}</Text>
                        </View>
                      ))
                    )}
                  </Animated.View>
                )}
              </Animated.View>
            );
          })}

          {/* Regenerate / timestamp row */}
          <View style={styles.footer}>
            <Text style={styles.footerTimestamp}>
              Generated {new Date(summary.generatedAt).toLocaleTimeString('en-US', {
                hour: '2-digit', minute: '2-digit',
              })}
            </Text>
            <TouchableOpacity onPress={onGenerate} style={styles.regenerateBtn} activeOpacity={0.8}>
              <Ionicons name="refresh-outline" size={13} color={COLORS.primary} />
              <Text style={styles.regenerateBtnText}>Regenerate</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      )}

      {/* Quick expand-all when summary exists and no section open */}
      {!isGenerating && !error && hasContent && !expandedSection && (
        <TouchableOpacity
          onPress={() => setExpandedSection('decisions')}
          style={styles.expandHint}
          activeOpacity={0.75}
        >
          <Ionicons name="chevron-down-outline" size={13} color={COLORS.textMuted} />
          <Text style={styles.expandHintText}>Tap any section to expand</Text>
        </TouchableOpacity>
      )}
    </Animated.View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.backgroundCard,
    borderRadius:    RADIUS.xl,
    borderWidth:     1,
    borderColor:     `${COLORS.primary}30`,
    overflow:        'hidden',
    marginBottom:    SPACING.md,
  },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center',
    padding: SPACING.md,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  headerLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerIconWrap: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: `${COLORS.primary}15`,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '800' },
  headerMeta:  { color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 1 },
  closeBtn: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: COLORS.backgroundElevated,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: COLORS.border,
  },

  // Generating
  generatingWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: SPACING.lg,
  },
  generatingText: { color: COLORS.textSecondary, fontSize: FONTS.sizes.sm },

  // Error
  errorWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: SPACING.md, flexWrap: 'wrap',
  },
  errorText:    { color: COLORS.error, fontSize: FONTS.sizes.sm, flex: 1 },
  retryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: `${COLORS.primary}12`,
    borderRadius: RADIUS.lg,
    paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: `${COLORS.primary}30`,
  },
  retryBtnText: { color: COLORS.primary, fontSize: FONTS.sizes.xs, fontWeight: '700' },

  // Empty
  emptyWrap: {
    alignItems: 'center', padding: SPACING.xl, gap: 10,
  },
  emptyTitle: { color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '700' },
  emptyDesc:  {
    color: COLORS.textSecondary, fontSize: FONTS.sizes.sm,
    textAlign: 'center', lineHeight: 20, maxWidth: 280,
  },
  generateBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.lg, paddingVertical: 12,
    marginTop: 4,
  },
  generateBtnText: { color: '#FFF', fontSize: FONTS.sizes.sm, fontWeight: '700' },

  // Key themes
  themesWrap: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 6,
    paddingHorizontal: SPACING.md, paddingTop: SPACING.md,
  },
  themeChip: {
    backgroundColor: `${COLORS.info}15`,
    borderRadius: RADIUS.full,
    paddingHorizontal: 10, paddingVertical: 4,
    borderWidth: 1, borderColor: `${COLORS.info}25`,
  },
  themeChipText: { color: COLORS.info, fontSize: FONTS.sizes.xs, fontWeight: '600' },

  // Sections
  section: {
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
    paddingHorizontal: SPACING.md,
  },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 12,
  },
  sectionIconWrap: {
    width: 28, height: 28, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  sectionLabel: { flex: 1, fontSize: FONTS.sizes.sm, fontWeight: '700' },
  sectionCountBadge: {
    borderRadius: RADIUS.full,
    paddingHorizontal: 8, paddingVertical: 2,
    minWidth: 24, alignItems: 'center',
  },
  sectionCount:  { fontSize: FONTS.sizes.xs, fontWeight: '800' },
  sectionEmpty:  {
    color: COLORS.textMuted, fontSize: FONTS.sizes.xs,
    fontStyle: 'italic', paddingBottom: 12,
  },

  // Bullet rows
  bulletRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    paddingBottom: 8,
  },
  bulletDot: {
    width: 6, height: 6, borderRadius: 3,
    marginTop: 6, flexShrink: 0,
  },
  bulletText: {
    color: COLORS.textSecondary, fontSize: FONTS.sizes.sm,
    lineHeight: 20, flex: 1,
  },

  // Footer
  footer: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: SPACING.md,
  },
  footerTimestamp: { color: COLORS.textMuted, fontSize: FONTS.sizes.xs },
  regenerateBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: `${COLORS.primary}12`,
    borderRadius: RADIUS.lg,
    paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: `${COLORS.primary}25`,
  },
  regenerateBtnText: { color: COLORS.primary, fontSize: FONTS.sizes.xs, fontWeight: '700' },

  // Expand hint
  expandHint: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    paddingBottom: SPACING.sm,
  },
  expandHintText: { color: COLORS.textMuted, fontSize: FONTS.sizes.xs },
});