// src/components/knowledgeBase/KBMessageBubble.tsx
// Part 43 — REDESIGNED: matches research-input.tsx aesthetic.
// No springify. FadeInDown.duration() only. All logic unchanged.

import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons }       from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { KBMessage }           from '../../types/knowledgeBase';
import { KBSourceReportChip }  from './KBSourceReportChip';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';

// ─── Minimal markdown ─────────────────────────────────────────────────────────
function renderMarkdownText(text: string, baseStyle: object) {
  const segments: React.ReactNode[] = [];
  const parts = text.split(/(\*\*[^*]+\*\*|_[^_]+_|`[^`]+`)/g);
  parts.forEach((part, i) => {
    if (part.startsWith('**') && part.endsWith('**'))
      segments.push(<Text key={i} style={[baseStyle, { fontWeight: '700', color: COLORS.textPrimary }]}>{part.slice(2, -2)}</Text>);
    else if (part.startsWith('_') && part.endsWith('_'))
      segments.push(<Text key={i} style={[baseStyle, { fontStyle: 'italic' }]}>{part.slice(1, -1)}</Text>);
    else if (part.startsWith('`') && part.endsWith('`'))
      segments.push(<Text key={i} style={[baseStyle, styles.inlineCode]}>{part.slice(1, -1)}</Text>);
    else if (part) segments.push(<Text key={i} style={baseStyle}>{part}</Text>);
  });
  return <Text>{segments}</Text>;
}

function renderContent(content: string) {
  const elements: React.ReactNode[] = [];
  content.split('\n').forEach((line, idx) => {
    if (line.startsWith('## ')) elements.push(<Text key={idx} style={styles.heading2}>{line.slice(3)}</Text>);
    else if (line.startsWith('# ')) elements.push(<Text key={idx} style={styles.heading1}>{line.slice(2)}</Text>);
    else if (line.startsWith('- ') || line.startsWith('• '))
      elements.push(<View key={idx} style={styles.bulletRow}><Text style={styles.bulletDot}>•</Text>{renderMarkdownText(line.slice(2), styles.bulletText)}</View>);
    else if (/^\d+\.\s/.test(line)) {
      const num = line.match(/^(\d+)\./)?.[1] ?? '1';
      elements.push(<View key={idx} style={styles.bulletRow}><Text style={styles.bulletDot}>{num}.</Text>{renderMarkdownText(line.replace(/^\d+\.\s/, ''), styles.bulletText)}</View>);
    } else if (line.trim() === '') elements.push(<View key={idx} style={{ height: 6 }} />);
    else elements.push(<View key={idx} style={{ marginBottom: 1 }}>{renderMarkdownText(line, styles.bodyText)}</View>);
  });
  return <>{elements}</>;
}

// ─── Confidence Badge ─────────────────────────────────────────────────────────
function ConfidenceBadge({ level }: { level: 'high' | 'medium' | 'low' }) {
  const cfg = {
    high:   { color: COLORS.accent,  icon: 'shield-checkmark-outline', label: 'High'   },
    medium: { color: COLORS.primary, icon: 'shield-half-outline',      label: 'Medium' },
    low:    { color: COLORS.warning, icon: 'shield-outline',           label: 'Low'    },
  }[level];
  return (
    <View style={[styles.confidenceBadge, { borderColor: `${cfg.color}28`, backgroundColor: `${cfg.color}10` }]}>
      <Ionicons name={cfg.icon as any} size={9} color={cfg.color} />
      <Text style={[styles.confidenceText, { color: cfg.color }]}>{cfg.label} confidence</Text>
    </View>
  );
}

// ─── Query expansion ──────────────────────────────────────────────────────────
function QueryExpansionRow({ queries }: { queries: string[] }) {
  const [expanded, setExpanded] = useState(false);
  if (!queries || queries.length <= 1) return null;
  return (
    <View style={styles.queryExpRow}>
      <Pressable onPress={() => setExpanded(e => !e)} style={styles.queryExpToggle}>
        <Ionicons name="search-outline" size={10} color={COLORS.textMuted} />
        <Text style={styles.queryExpLabel}>{queries.length} queries used</Text>
        <Ionicons name={expanded ? 'chevron-up-outline' : 'chevron-down-outline'} size={10} color={COLORS.textMuted} />
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

// ─── Component ────────────────────────────────────────────────────────────────
interface Props {
  msg: KBMessage; isLastAssistant?: boolean; onReportPress?: (reportId: string) => void;
}

export function KBMessageBubble({ msg, isLastAssistant, onReportPress }: Props) {
  const [sourcesExpanded, setSourcesExpanded] = useState(false);
  const isUser = msg.role === 'user';

  // User bubble
  if (isUser) {
    return (
      <Animated.View entering={FadeInDown.duration(250)} style={styles.userRow}>
        <LinearGradient colors={['#6C63FF', '#8B5CF6']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.userBubble}>
          {/* Inner top shimmer */}
          <LinearGradient colors={['rgba(255,255,255,0.15)', 'transparent']} style={styles.userBubbleGlow} />
          <Text style={styles.userText}>{msg.content}</Text>
        </LinearGradient>
      </Animated.View>
    );
  }

  // Assistant bubble
  const hasSourceReports = msg.sourceReports.length > 0;
  return (
    <Animated.View entering={FadeInDown.duration(280)} style={styles.assistantRow}>
      <LinearGradient colors={['#7C3AED', '#6C63FF']} style={styles.avatar}>
        <Ionicons name="library-outline" size={12} color="#FFF" />
      </LinearGradient>

      <View style={styles.assistantContent}>
        <View style={styles.labelRow}>
          <Text style={styles.labelText}>Knowledge Base AI</Text>
          {hasSourceReports && (
            <View style={styles.reportsCountBadge}>
              <Ionicons name="documents-outline" size={9} color={COLORS.primary} />
              <Text style={styles.reportsCountText}>{msg.reportsCount} report{msg.reportsCount !== 1 ? 's' : ''}</Text>
            </View>
          )}
        </View>

        {/* Main bubble — matches depth card style from research-input */}
        <View style={styles.assistantBubble}>
          <LinearGradient colors={[`${COLORS.primary}20`, 'transparent']} style={styles.assistantBubbleGlow} />
          {renderContent(msg.content)}
        </View>

        <View style={styles.metaRow}>
          <ConfidenceBadge level={msg.confidence} />
          {msg.totalChunks > 0 && (
            <View style={styles.chunksBadge}>
              <Ionicons name="git-network-outline" size={9} color={COLORS.primary} />
              <Text style={styles.chunksText}>{msg.totalChunks} chunk{msg.totalChunks !== 1 ? 's' : ''}</Text>
            </View>
          )}
        </View>

        {hasSourceReports && (
          <View style={styles.sourcesSection}>
            <Pressable onPress={() => setSourcesExpanded(e => !e)} style={styles.sourcesToggle}>
              <Ionicons name="document-text-outline" size={10} color={COLORS.primary} />
              <Text style={styles.sourcesToggleText}>Sources from {msg.reportsCount} report{msg.reportsCount !== 1 ? 's' : ''}</Text>
              <Ionicons name={sourcesExpanded ? 'chevron-up' : 'chevron-down'} size={10} color={COLORS.primary} />
            </Pressable>

            {!sourcesExpanded && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.compactChipsRow} keyboardShouldPersistTaps="handled">
                {msg.sourceReports.slice(0, 4).map((src, i) => (
                  <KBSourceReportChip key={src.reportId} source={src} index={i} compact onPress={onReportPress ? () => onReportPress(src.reportId) : undefined} />
                ))}
                {msg.sourceReports.length > 4 && (
                  <Pressable onPress={() => setSourcesExpanded(true)} style={styles.moreChip}>
                    <Text style={styles.moreChipText}>+{msg.sourceReports.length - 4} more</Text>
                  </Pressable>
                )}
              </ScrollView>
            )}

            {sourcesExpanded && (
              <Animated.View entering={FadeInDown.duration(220)} style={styles.expandedChips}>
                {msg.sourceReports.map((src, i) => (
                  <KBSourceReportChip key={src.reportId} source={src} index={i} onPress={onReportPress ? () => onReportPress(src.reportId) : undefined} />
                ))}
              </Animated.View>
            )}
          </View>
        )}

        {isLastAssistant && msg.queryExpansion.length > 0 && (
          <QueryExpansionRow queries={msg.queryExpansion} />
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  userRow: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: SPACING.sm },
  userBubble: { maxWidth: '80%', borderRadius: RADIUS.lg, borderBottomRightRadius: 4, paddingHorizontal: SPACING.md, paddingVertical: 10, overflow: 'hidden' },
  userBubbleGlow: { position: 'absolute', top: 0, left: 0, right: 0, height: 1.5 },
  userText: { color: '#FFF', fontSize: FONTS.sizes.sm, lineHeight: 20 },

  assistantRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: SPACING.md },
  avatar: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 20 },
  assistantContent: { flex: 1, gap: 6 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  labelText: { color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600' },
  reportsCountBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: RADIUS.full, backgroundColor: `${COLORS.primary}10`, borderWidth: 1, borderColor: `${COLORS.primary}22` },
  reportsCountText: { color: COLORS.primary, fontSize: 9, fontWeight: '700' },

  // Matches the LinearGradient depth card style from research-input
  assistantBubble: { backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.lg, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: `${COLORS.primary}15`, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, gap: 4, overflow: 'hidden' },
  assistantBubbleGlow: { position: 'absolute', top: 0, left: 0, right: 0, height: 1 },

  heading1: { color: COLORS.textPrimary, fontSize: FONTS.sizes.md, fontWeight: '700', marginTop: 8, marginBottom: 4 },
  heading2: { color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '700', marginTop: 6, marginBottom: 2 },
  bodyText: { color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, lineHeight: 21 },
  bulletRow: { flexDirection: 'row', gap: 8, marginBottom: 2, paddingLeft: 4 },
  bulletDot: { color: COLORS.primary, fontSize: FONTS.sizes.sm, fontWeight: '700', lineHeight: 21, minWidth: 12 },
  bulletText: { color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, lineHeight: 21, flex: 1 },
  inlineCode: { backgroundColor: COLORS.backgroundElevated, borderRadius: 4, paddingHorizontal: 4, color: COLORS.accent, fontFamily: 'monospace', fontSize: FONTS.sizes.xs },

  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  confidenceBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 3, borderRadius: RADIUS.full, borderWidth: 1 },
  confidenceText: { fontSize: 9, fontWeight: '600' },
  chunksBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 3, borderRadius: RADIUS.full, backgroundColor: `${COLORS.primary}08`, borderWidth: 1, borderColor: `${COLORS.primary}18` },
  chunksText: { color: COLORS.primary, fontSize: 9, fontWeight: '600' },

  sourcesSection: { gap: 6 },
  sourcesToggle: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5, borderRadius: RADIUS.full, backgroundColor: `${COLORS.primary}08`, borderWidth: 1, borderColor: `${COLORS.primary}18` },
  sourcesToggleText: { color: COLORS.primary, fontSize: FONTS.sizes.xs, fontWeight: '600' },
  compactChipsRow: { flexDirection: 'row', gap: 8, paddingVertical: 2 },
  expandedChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  moreChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: RADIUS.full, backgroundColor: COLORS.backgroundElevated, borderWidth: 1, borderColor: COLORS.border, alignSelf: 'center' },
  moreChipText: { color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600' },

  queryExpRow: { gap: 4 },
  queryExpToggle: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingVertical: 3 },
  queryExpLabel: { color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontStyle: 'italic' },
  queryExpList: { gap: 4, paddingLeft: 16, borderLeftWidth: 1, borderLeftColor: `${COLORS.primary}20`, marginLeft: 4 },
  queryExpItem: { flexDirection: 'row', gap: 6 },
  queryExpIndex: { color: COLORS.primary, fontSize: FONTS.sizes.xs, fontWeight: '700', minWidth: 12 },
  queryExpText: { color: COLORS.textMuted, fontSize: FONTS.sizes.xs, flex: 1, lineHeight: 16 },
});