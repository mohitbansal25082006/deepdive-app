// src/components/knowledgeBase/KBMessageBubble.tsx
// Part 26 — Personal AI Knowledge Base
//
// Renders one message in the KB chat.
//
// User bubble:   right-aligned, purple gradient
// Assistant bubble:
//   • Message text (supports markdown-ish **bold** rendering via simple parser)
//   • Confidence badge (High / Medium / Low)
//   • "X reports · Y chunks" metadata row
//   • Horizontally scrollable source report chips
//   • Query expansion row (which sub-queries were used)
//   • "Show sources" expand/collapse toggle for compact vs full view

import React, { useState } from 'react';
import {
  View, Text, Pressable, ScrollView, StyleSheet,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons }       from '@expo/vector-icons';
import Animated, {
  FadeInDown, FadeInUp,
  useAnimatedStyle, useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { KBMessage }          from '../../types/knowledgeBase';
import { KBSourceReportChip } from './KBSourceReportChip';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';

// ─── Minimal markdown renderer ────────────────────────────────────────────────
// Handles: **bold**, _italic_, `code`, and leading ## headings.
// No external deps required.

function renderMarkdownText(text: string, baseStyle: object) {
  const segments: React.ReactNode[] = [];
  const parts = text.split(/(\*\*[^*]+\*\*|_[^_]+_|`[^`]+`)/g);

  parts.forEach((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      segments.push(
        <Text key={i} style={[baseStyle, { fontWeight: '700', color: COLORS.textPrimary }]}>
          {part.slice(2, -2)}
        </Text>,
      );
    } else if (part.startsWith('_') && part.endsWith('_')) {
      segments.push(
        <Text key={i} style={[baseStyle, { fontStyle: 'italic' }]}>
          {part.slice(1, -1)}
        </Text>,
      );
    } else if (part.startsWith('`') && part.endsWith('`')) {
      segments.push(
        <Text key={i} style={[baseStyle, styles.inlineCode]}>
          {part.slice(1, -1)}
        </Text>,
      );
    } else if (part) {
      segments.push(
        <Text key={i} style={baseStyle}>{part}</Text>,
      );
    }
  });

  return <Text>{segments}</Text>;
}

function renderContent(content: string) {
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];

  lines.forEach((line, idx) => {
    if (line.startsWith('## ')) {
      elements.push(
        <Text key={idx} style={styles.heading2}>{line.slice(3)}</Text>,
      );
    } else if (line.startsWith('# ')) {
      elements.push(
        <Text key={idx} style={styles.heading1}>{line.slice(2)}</Text>,
      );
    } else if (line.startsWith('- ') || line.startsWith('• ')) {
      elements.push(
        <View key={idx} style={styles.bulletRow}>
          <Text style={styles.bulletDot}>•</Text>
          {renderMarkdownText(line.slice(2), styles.bulletText)}
        </View>,
      );
    } else if (/^\d+\.\s/.test(line)) {
      const num = line.match(/^(\d+)\./)?.[1] ?? '1';
      elements.push(
        <View key={idx} style={styles.bulletRow}>
          <Text style={styles.bulletDot}>{num}.</Text>
          {renderMarkdownText(line.replace(/^\d+\.\s/, ''), styles.bulletText)}
        </View>,
      );
    } else if (line.trim() === '') {
      elements.push(<View key={idx} style={{ height: 6 }} />);
    } else {
      elements.push(
        <View key={idx} style={{ marginBottom: 1 }}>
          {renderMarkdownText(line, styles.bodyText)}
        </View>,
      );
    }
  });

  return <>{elements}</>;
}

// ─── Confidence Badge ─────────────────────────────────────────────────────────

function ConfidenceBadge({ level }: { level: 'high' | 'medium' | 'low' }) {
  const colors  = { high: COLORS.success, medium: COLORS.primary, low: COLORS.warning };
  const labels  = { high: 'High',          medium: 'Medium',       low: 'Low' };
  const icons   = {
    high:   'shield-checkmark-outline',
    medium: 'shield-half-outline',
    low:    'shield-outline',
  };
  const c = colors[level];
  return (
    <View style={[styles.confidenceBadge, { borderColor: c + '35', backgroundColor: c + '12' }]}>
      <Ionicons name={icons[level] as any} size={9} color={c} />
      <Text style={[styles.confidenceText, { color: c }]}>
        {labels[level]} confidence
      </Text>
    </View>
  );
}

// ─── Query expansion row ──────────────────────────────────────────────────────

function QueryExpansionRow({ queries }: { queries: string[] }) {
  const [expanded, setExpanded] = useState(false);
  if (!queries || queries.length <= 1) return null;

  return (
    <View style={styles.queryExpRow}>
      <Pressable
        onPress={() => setExpanded(e => !e)}
        style={styles.queryExpToggle}
      >
        <Ionicons name="search-outline" size={10} color={COLORS.textMuted} />
        <Text style={styles.queryExpLabel}>
          {queries.length} queries used
        </Text>
        <Ionicons
          name={expanded ? 'chevron-up-outline' : 'chevron-down-outline'}
          size={10}
          color={COLORS.textMuted}
        />
      </Pressable>

      {expanded && (
        <Animated.View entering={FadeInDown.duration(200)} style={styles.queryExpList}>
          {queries.map((q, i) => (
            <View key={i} style={styles.queryExpItem}>
              <Text style={styles.queryExpIndex}>{i + 1}</Text>
              <Text style={styles.queryExpText}>{q}</Text>
            </View>
          ))}
        </Animated.View>
      )}
    </View>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  msg:              KBMessage;
  isLastAssistant?: boolean;
  onReportPress?:   (reportId: string) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function KBMessageBubble({ msg, isLastAssistant, onReportPress }: Props) {
  const [sourcesExpanded, setSourcesExpanded] = useState(false);
  const isUser = msg.role === 'user';

  if (isUser) {
    return (
      <Animated.View
        entering={FadeInDown.duration(280).springify()}
        style={styles.userRow}
      >
        <LinearGradient
          colors={COLORS.gradientPrimary}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.userBubble}
        >
          <Text style={styles.userText}>{msg.content}</Text>
        </LinearGradient>
      </Animated.View>
    );
  }

  // ── Assistant bubble ───────────────────────────────────────────────────────
  const hasSourceReports = msg.sourceReports.length > 0;
  const showSourceToggle = hasSourceReports;

  return (
    <Animated.View
      entering={FadeInDown.duration(320).springify()}
      style={styles.assistantRow}
    >
      {/* Avatar */}
      <LinearGradient
        colors={COLORS.gradientPrimary}
        style={styles.avatar}
      >
        <Ionicons name="library-outline" size={12} color="#FFF" />
      </LinearGradient>

      <View style={styles.assistantContent}>
        {/* Label row */}
        <View style={styles.labelRow}>
          <Text style={styles.labelText}>Knowledge Base AI</Text>
          {hasSourceReports && (
            <View style={styles.reportsCountBadge}>
              <Ionicons name="documents-outline" size={9} color={COLORS.primary} />
              <Text style={styles.reportsCountText}>
                {msg.reportsCount} report{msg.reportsCount !== 1 ? 's' : ''}
              </Text>
            </View>
          )}
        </View>

        {/* Main bubble */}
        <View style={styles.assistantBubble}>
          {renderContent(msg.content)}
        </View>

        {/* Meta row: confidence + chunks */}
        <View style={styles.metaRow}>
          <ConfidenceBadge level={msg.confidence} />
          {msg.totalChunks > 0 && (
            <View style={styles.chunksBadge}>
              <Ionicons name="git-network-outline" size={9} color={COLORS.primary} />
              <Text style={styles.chunksText}>
                {msg.totalChunks} chunk{msg.totalChunks !== 1 ? 's' : ''}
              </Text>
            </View>
          )}
        </View>

        {/* Source reports section */}
        {hasSourceReports && (
          <View style={styles.sourcesSection}>
            {/* Toggle header */}
            <Pressable
              onPress={() => setSourcesExpanded(e => !e)}
              style={styles.sourcesToggle}
            >
              <Ionicons
                name="document-text-outline"
                size={11}
                color={COLORS.primary}
              />
              <Text style={styles.sourcesToggleText}>
                Sources from {msg.reportsCount} report{msg.reportsCount !== 1 ? 's' : ''}
              </Text>
              <Ionicons
                name={sourcesExpanded ? 'chevron-up' : 'chevron-down'}
                size={11}
                color={COLORS.primary}
              />
            </Pressable>

            {/* Compact preview (always visible) */}
            {!sourcesExpanded && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.compactChipsRow}
                keyboardShouldPersistTaps="handled"
              >
                {msg.sourceReports.slice(0, 4).map((src, i) => (
                  <KBSourceReportChip
                    key={src.reportId}
                    source={src}
                    index={i}
                    compact
                    onPress={onReportPress
                      ? () => onReportPress(src.reportId)
                      : undefined}
                  />
                ))}
                {msg.sourceReports.length > 4 && (
                  <Pressable
                    onPress={() => setSourcesExpanded(true)}
                    style={styles.moreChip}
                  >
                    <Text style={styles.moreChipText}>
                      +{msg.sourceReports.length - 4} more
                    </Text>
                  </Pressable>
                )}
              </ScrollView>
            )}

            {/* Expanded full chips */}
            {sourcesExpanded && (
              <Animated.View
                entering={FadeInDown.duration(250)}
                style={styles.expandedChips}
              >
                {msg.sourceReports.map((src, i) => (
                  <KBSourceReportChip
                    key={src.reportId}
                    source={src}
                    index={i}
                    onPress={onReportPress
                      ? () => onReportPress(src.reportId)
                      : undefined}
                  />
                ))}
              </Animated.View>
            )}
          </View>
        )}

        {/* Query expansion (only on last assistant message) */}
        {isLastAssistant && msg.queryExpansion.length > 0 && (
          <QueryExpansionRow queries={msg.queryExpansion} />
        )}
      </View>
    </Animated.View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // ── User ─────────────────────────────────────────────────────────────────
  userRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: SPACING.sm,
  },
  userBubble: {
    maxWidth:        '80%',
    borderRadius:    RADIUS.lg,
    borderBottomRightRadius: 4,
    paddingHorizontal: SPACING.md,
    paddingVertical:   10,
  },
  userText: {
    color:     '#FFF',
    fontSize:  FONTS.sizes.sm,
    lineHeight: 20,
  },

  // ── Assistant ──────────────────────────────────────────────────────────────
  assistantRow: {
    flexDirection:  'row',
    alignItems:     'flex-start',
    gap:             10,
    marginBottom:    SPACING.md,
  },
  avatar: {
    width:          28,
    height:         28,
    borderRadius:   9,
    alignItems:     'center',
    justifyContent: 'center',
    flexShrink:     0,
    marginTop:      20,
  },
  assistantContent: {
    flex: 1,
    gap:  6,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:            6,
  },
  labelText: {
    color:      COLORS.textMuted,
    fontSize:   FONTS.sizes.xs,
    fontWeight: '600',
  },
  reportsCountBadge: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:              3,
    paddingHorizontal: 6,
    paddingVertical:   2,
    borderRadius:    RADIUS.full,
    backgroundColor: COLORS.primary + '12',
    borderWidth:     1,
    borderColor:     COLORS.primary + '25',
  },
  reportsCountText: {
    color:     COLORS.primary,
    fontSize:  9,
    fontWeight: '700',
  },

  assistantBubble: {
    backgroundColor: COLORS.backgroundElevated,
    borderRadius:    RADIUS.lg,
    borderBottomLeftRadius: 4,
    borderWidth:     1,
    borderColor:     COLORS.border,
    paddingHorizontal: SPACING.md,
    paddingVertical:   SPACING.sm,
    gap:               4,
  },

  // Content rendering
  heading1: {
    color:       COLORS.textPrimary,
    fontSize:    FONTS.sizes.md,
    fontWeight:  '700',
    marginTop:   8,
    marginBottom: 4,
  },
  heading2: {
    color:       COLORS.textPrimary,
    fontSize:    FONTS.sizes.base,
    fontWeight:  '700',
    marginTop:   8,
    marginBottom: 2,
  },
  bodyText: {
    color:     COLORS.textPrimary,
    fontSize:  FONTS.sizes.sm,
    lineHeight: 21,
  },
  bulletRow: {
    flexDirection: 'row',
    gap:            8,
    marginBottom:   2,
    paddingLeft:    4,
  },
  bulletDot: {
    color:      COLORS.primary,
    fontSize:   FONTS.sizes.sm,
    fontWeight: '700',
    lineHeight: 21,
    minWidth:   12,
  },
  bulletText: {
    color:     COLORS.textPrimary,
    fontSize:  FONTS.sizes.sm,
    lineHeight: 21,
    flex:       1,
  },
  inlineCode: {
    backgroundColor:  COLORS.backgroundCard,
    borderRadius:     4,
    paddingHorizontal: 4,
    color:            COLORS.accent,
    fontFamily:       'monospace',
    fontSize:         FONTS.sizes.xs,
  },

  // ── Meta row ──────────────────────────────────────────────────────────────
  metaRow: {
    flexDirection: 'row',
    alignItems:    'center',
    flexWrap:      'wrap',
    gap:            6,
  },
  confidenceBadge: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:              4,
    paddingHorizontal: 7,
    paddingVertical:   3,
    borderRadius:    RADIUS.full,
    borderWidth:     1,
  },
  confidenceText: {
    fontSize:   9,
    fontWeight: '600',
  },
  chunksBadge: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:              3,
    paddingHorizontal: 6,
    paddingVertical:   3,
    borderRadius:    RADIUS.full,
    backgroundColor: COLORS.primary + '10',
    borderWidth:     1,
    borderColor:     COLORS.primary + '25',
  },
  chunksText: {
    color:     COLORS.primary,
    fontSize:  9,
    fontWeight: '600',
  },

  // ── Sources section ────────────────────────────────────────────────────────
  sourcesSection: {
    gap: 6,
  },
  sourcesToggle: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:            5,
    alignSelf:     'flex-start',
    paddingHorizontal: 10,
    paddingVertical:   5,
    borderRadius:  RADIUS.full,
    backgroundColor: COLORS.primary + '08',
    borderWidth:   1,
    borderColor:   COLORS.primary + '20',
  },
  sourcesToggleText: {
    color:      COLORS.primary,
    fontSize:   FONTS.sizes.xs,
    fontWeight: '600',
  },
  compactChipsRow: {
    flexDirection: 'row',
    gap:            8,
    paddingVertical: 2,
  },
  expandedChips: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:            8,
  },
  moreChip: {
    paddingHorizontal: 10,
    paddingVertical:   5,
    borderRadius:    RADIUS.full,
    backgroundColor: COLORS.backgroundElevated,
    borderWidth:     1,
    borderColor:     COLORS.border,
    alignSelf:       'center',
  },
  moreChipText: {
    color:     COLORS.textMuted,
    fontSize:  FONTS.sizes.xs,
    fontWeight: '600',
  },

  // ── Query expansion ────────────────────────────────────────────────────────
  queryExpRow: {
    gap: 4,
  },
  queryExpToggle: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:            4,
    alignSelf:     'flex-start',
    paddingVertical: 3,
  },
  queryExpLabel: {
    color:     COLORS.textMuted,
    fontSize:  FONTS.sizes.xs,
    fontStyle: 'italic',
  },
  queryExpList: {
    gap:              4,
    paddingLeft:      16,
    borderLeftWidth:  1,
    borderLeftColor:  COLORS.border,
    marginLeft:       4,
  },
  queryExpItem: {
    flexDirection: 'row',
    gap:            6,
  },
  queryExpIndex: {
    color:      COLORS.primary,
    fontSize:   FONTS.sizes.xs,
    fontWeight: '700',
    minWidth:   12,
  },
  queryExpText: {
    color:     COLORS.textMuted,
    fontSize:  FONTS.sizes.xs,
    flex:      1,
    lineHeight: 16,
  },
});