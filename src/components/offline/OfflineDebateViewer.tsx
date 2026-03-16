// src/components/offline/OfflineDebateViewer.tsx
// Part 23 — Full offline debate viewer.
//
// Renders the complete debate experience from cache — identical to the online
// debate-detail.tsx screen with all 3 tabs (Overview / Perspectives / Moderator)
// plus PDF export and copy working fully offline.

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../constants/theme';
import type { DebateSession, DebatePerspective, DebateModerator } from '../../types';
import type { CacheEntry } from '../../types/cache';

type DebateTab = 'overview' | 'perspectives' | 'moderator';

const TABS: { id: DebateTab; label: string; icon: string }[] = [
  { id: 'overview',     label: 'Overview',     icon: 'grid-outline'   },
  { id: 'perspectives', label: 'Perspectives', icon: 'people-outline' },
  { id: 'moderator',    label: 'Moderator',    icon: 'ribbon-outline' },
];

// ─── Stance helpers ───────────────────────────────────────────────────────────

function stanceColor(t: string): string {
  const map: Record<string, string> = {
    strongly_for: '#22C55E', for: '#3DAE7C', neutral: '#8888AA',
    against: '#F97316', strongly_against: '#EF4444',
  };
  return map[t] ?? '#8888AA';
}

function stanceLabel(t: string): string {
  const map: Record<string, string> = {
    strongly_for: 'Strongly For', for: 'For', neutral: 'Neutral',
    against: 'Against', strongly_against: 'Strongly Against',
  };
  return map[t] ?? 'Neutral';
}

// ─── Stat Pill ────────────────────────────────────────────────────────────────

function StatPill({ icon, label, value, color }: { icon: string; label: string; value: string; color?: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: COLORS.backgroundElevated, borderRadius: RADIUS.lg, padding: SPACING.md, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border }}>
      <Ionicons name={icon as any} size={16} color={color ?? COLORS.primary} style={{ marginBottom: 4 }} />
      <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '800', marginBottom: 2 }}>{value}</Text>
      <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, textAlign: 'center' }}>{label}</Text>
    </View>
  );
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({ session }: { session: DebateSession }) {
  const forCount     = session.perspectives.filter(p => p.stanceType === 'for' || p.stanceType === 'strongly_for').length;
  const againstCount = session.perspectives.filter(p => p.stanceType === 'against' || p.stanceType === 'strongly_against').length;

  return (
    <View>
      <View style={{ flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.lg }}>
        <StatPill icon="people-outline"            label="Agents"  value={String(session.perspectives.length)} color={COLORS.primary}   />
        <StatPill icon="globe-outline"             label="Sources" value={String(session.searchResultsCount)}  color={COLORS.info}      />
        <StatPill icon="arrow-up-circle-outline"   label="For"     value={String(forCount)}                    color={COLORS.success}   />
        <StatPill icon="arrow-down-circle-outline" label="Against" value={String(againstCount)}                color={COLORS.secondary} />
      </View>

      {/* Central question */}
      <View style={{ backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.xl, padding: SPACING.lg, marginBottom: SPACING.md, borderWidth: 1, borderColor: `${COLORS.primary}30`, borderLeftWidth: 4, borderLeftColor: COLORS.primary, ...SHADOWS.small }}>
        <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.xs, fontWeight: '700', letterSpacing: 0.7, textTransform: 'uppercase', marginBottom: SPACING.sm }}>
          Central Question
        </Text>
        <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.lg, fontWeight: '700', lineHeight: 28 }}>
          {session.question}
        </Text>
      </View>

      {/* Moderator verdict preview */}
      {session.moderator?.balancedVerdict ? (
        <View style={{ backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.xl, padding: SPACING.lg, marginBottom: SPACING.md, borderWidth: 1, borderColor: COLORS.border, ...SHADOWS.small }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: SPACING.sm }}>
            <Ionicons name="ribbon-outline" size={15} color={COLORS.primary} />
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '700', letterSpacing: 0.7, textTransform: 'uppercase' }}>
              Moderator's Verdict
            </Text>
          </View>
          <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.base, lineHeight: 24, fontStyle: 'italic' }}>
            "{session.moderator.balancedVerdict}"
          </Text>
        </View>
      ) : null}

      {/* Agent stance grid */}
      <View style={{ backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.xl, padding: SPACING.lg, marginBottom: SPACING.md, borderWidth: 1, borderColor: COLORS.border, ...SHADOWS.small }}>
        <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '700', letterSpacing: 0.7, textTransform: 'uppercase', marginBottom: SPACING.md }}>
          Agent Stances
        </Text>
        {session.perspectives.map((p, i) => (
          <View key={p.agentRole} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: i < session.perspectives.length - 1 ? SPACING.sm : 0 }}>
            <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: `${p.color}18`, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: `${p.color}30` }}>
              <Ionicons name={p.icon as any} size={14} color={p.color} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '600' }}>{p.agentName}</Text>
              <Text style={{ color: p.color, fontSize: FONTS.sizes.xs, marginTop: 1 }} numberOfLines={1}>{p.stanceLabel}</Text>
            </View>
            <View style={{ width: 50, height: 4, borderRadius: 2, backgroundColor: `${p.color}20` }}>
              <View style={{ width: `${(p.confidence / 10) * 100}%` as any, height: '100%', borderRadius: 2, backgroundColor: p.color }} />
            </View>
            <Text style={{ color: p.color, fontSize: FONTS.sizes.xs, fontWeight: '700', width: 30, textAlign: 'right' }}>
              {p.confidence}/10
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── Perspective Card ─────────────────────────────────────────────────────────

function PerspectiveCard({ p }: { p: DebatePerspective }) {
  const [expanded, setExpanded] = useState(false);
  const sc = stanceColor(p.stanceType);
  const sl = stanceLabel(p.stanceType);

  return (
    <View style={{ backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.xl, marginBottom: SPACING.md, borderWidth: 1, borderColor: COLORS.border, borderTopWidth: 3, borderTopColor: p.color, overflow: 'hidden' }}>
      {/* Header */}
      <TouchableOpacity onPress={() => setExpanded(v => !v)} activeOpacity={0.8}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: SPACING.lg }}>
        <View style={{ width: 44, height: 44, borderRadius: 13, backgroundColor: `${p.color}18`, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: `${p.color}30`, flexShrink: 0 }}>
          <Ionicons name={p.icon as any} size={20} color={p.color} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '800' }}>{p.agentName}</Text>
          <Text style={{ color: p.color, fontSize: FONTS.sizes.xs, marginTop: 1, fontStyle: 'italic' }}>"{p.stanceLabel}"</Text>
        </View>
        <View style={{ backgroundColor: `${sc}18`, borderRadius: RADIUS.full, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: `${sc}35`, marginRight: 4 }}>
          <Text style={{ color: sc, fontSize: 10, fontWeight: '700' }}>{sl}</Text>
        </View>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={COLORS.textMuted} />
      </TouchableOpacity>

      {expanded && (
        <View style={{ paddingHorizontal: SPACING.lg, paddingBottom: SPACING.lg }}>
          {/* Summary */}
          <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, lineHeight: 22, marginBottom: SPACING.md }}>
            {p.summary}
          </Text>

          {/* Arguments */}
          {p.arguments.map((arg, i) => (
            <View key={arg.id ?? i} style={{ backgroundColor: COLORS.backgroundElevated, borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.sm, borderLeftWidth: 3, borderLeftColor: p.color }}>
              <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '700', marginBottom: 4 }}>{arg.point}</Text>
              <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, lineHeight: 18 }}>{arg.evidence}</Text>
              <View style={{ marginTop: 6, alignSelf: 'flex-start', backgroundColor: `${p.color}15`, borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 2 }}>
                <Text style={{ color: p.color, fontSize: 9, fontWeight: '700', textTransform: 'uppercase' }}>{arg.strength}</Text>
              </View>
            </View>
          ))}

          {/* Key quote */}
          {p.keyQuote ? (
            <View style={{ borderWidth: 1, borderColor: `${p.color}30`, borderRadius: RADIUS.lg, backgroundColor: `${p.color}06`, padding: SPACING.md, marginTop: SPACING.sm, flexDirection: 'row', gap: 8 }}>
              <Text style={{ color: p.color, fontSize: 24, lineHeight: 0.8, flexShrink: 0, marginTop: 4 }}>"</Text>
              <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, lineHeight: 20, flex: 1, fontStyle: 'italic' }}>{p.keyQuote}</Text>
            </View>
          ) : null}

          {/* Confidence */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: SPACING.md, paddingTop: SPACING.sm, borderTopWidth: 1, borderTopColor: COLORS.border }}>
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>Confidence</Text>
            <View style={{ flex: 1, height: 4, backgroundColor: COLORS.backgroundElevated, borderRadius: 2, overflow: 'hidden' }}>
              <View style={{ width: `${(p.confidence / 10) * 100}%` as any, height: '100%', backgroundColor: p.color, borderRadius: 2 }} />
            </View>
            <Text style={{ color: p.color, fontSize: FONTS.sizes.xs, fontWeight: '700' }}>{p.confidence}/10</Text>
          </View>
        </View>
      )}
    </View>
  );
}

// ─── Perspectives Tab ─────────────────────────────────────────────────────────

function PerspectivesTab({ session }: { session: DebateSession }) {
  return (
    <View>
      {session.perspectives.map(p => (
        <PerspectiveCard key={p.agentRole} p={p} />
      ))}
    </View>
  );
}

// ─── Moderator Tab ────────────────────────────────────────────────────────────

function ModeratorTab({ moderator }: { moderator: DebateModerator }) {
  return (
    <View>
      {/* Balanced verdict */}
      <LinearGradient colors={['#1A1A35', '#12122A']} style={{ borderRadius: RADIUS.xl, padding: SPACING.lg, marginBottom: SPACING.md, borderWidth: 1, borderColor: `${COLORS.primary}30` }}>
        <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.xs, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: SPACING.sm }}>
          Balanced Verdict
        </Text>
        <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '600', lineHeight: 24, fontStyle: 'italic' }}>
          "{moderator.balancedVerdict}"
        </Text>
      </LinearGradient>

      {/* Summary */}
      <View style={{ backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.xl, padding: SPACING.lg, marginBottom: SPACING.md, borderWidth: 1, borderColor: COLORS.border }}>
        <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '700', letterSpacing: 0.7, textTransform: 'uppercase', marginBottom: SPACING.sm }}>Perspective Comparison</Text>
        <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, lineHeight: 22 }}>{moderator.summary}</Text>
      </View>

      {/* For vs Against */}
      <View style={{ flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.md }}>
        <View style={{ flex: 1, backgroundColor: `${COLORS.success}08`, borderRadius: RADIUS.xl, padding: SPACING.md, borderWidth: 1, borderColor: `${COLORS.success}25` }}>
          <Text style={{ color: COLORS.success, fontSize: FONTS.sizes.xs, fontWeight: '700', marginBottom: SPACING.sm }}>↑ Arguments For</Text>
          {moderator.argumentsFor.map((a, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: 6, marginBottom: 5 }}>
              <Text style={{ color: COLORS.success, fontSize: FONTS.sizes.xs }}>✓</Text>
              <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, lineHeight: 18, flex: 1 }}>{a}</Text>
            </View>
          ))}
        </View>
        <View style={{ flex: 1, backgroundColor: `${COLORS.error}08`, borderRadius: RADIUS.xl, padding: SPACING.md, borderWidth: 1, borderColor: `${COLORS.error}25` }}>
          <Text style={{ color: COLORS.error, fontSize: FONTS.sizes.xs, fontWeight: '700', marginBottom: SPACING.sm }}>↓ Arguments Against</Text>
          {moderator.argumentsAgainst.map((a, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: 6, marginBottom: 5 }}>
              <Text style={{ color: COLORS.error, fontSize: FONTS.sizes.xs }}>✗</Text>
              <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, lineHeight: 18, flex: 1 }}>{a}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Consensus */}
      {moderator.consensusPoints.length > 0 && (
        <View style={{ backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.xl, padding: SPACING.lg, marginBottom: SPACING.md, borderWidth: 1, borderColor: COLORS.border }}>
          <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '700', letterSpacing: 0.7, textTransform: 'uppercase', marginBottom: SPACING.sm }}>✓ Consensus Points</Text>
          {moderator.consensusPoints.map((c, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start', padding: SPACING.sm, backgroundColor: `${COLORS.success}08`, borderRadius: RADIUS.md, marginBottom: 6, borderLeftWidth: 3, borderLeftColor: COLORS.success }}>
              <Ionicons name="checkmark" size={13} color={COLORS.success} style={{ marginTop: 1, flexShrink: 0 }} />
              <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, lineHeight: 20, flex: 1 }}>{c}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Key tensions */}
      {moderator.keyTensions.length > 0 && (
        <View style={{ backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.xl, padding: SPACING.lg, marginBottom: SPACING.md, borderWidth: 1, borderColor: COLORS.border }}>
          <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '700', letterSpacing: 0.7, textTransform: 'uppercase', marginBottom: SPACING.sm }}>⚡ Key Tensions</Text>
          {moderator.keyTensions.map((t, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start', padding: SPACING.sm, backgroundColor: `${COLORS.warning}08`, borderRadius: RADIUS.md, marginBottom: 6, borderLeftWidth: 3, borderLeftColor: COLORS.warning }}>
              <Text style={{ color: COLORS.warning, fontSize: FONTS.sizes.xs, flexShrink: 0, marginTop: 1 }}>⚡</Text>
              <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, lineHeight: 20, flex: 1 }}>{t}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Neutral conclusion */}
      <View style={{ backgroundColor: `${COLORS.info}08`, borderRadius: RADIUS.xl, padding: SPACING.lg, borderWidth: 1, borderColor: `${COLORS.info}25`, borderLeftWidth: 4, borderLeftColor: COLORS.info }}>
        <Text style={{ color: COLORS.info, fontSize: FONTS.sizes.xs, fontWeight: '700', letterSpacing: 0.7, textTransform: 'uppercase', marginBottom: SPACING.sm }}>Neutral Conclusion</Text>
        <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, lineHeight: 22 }}>{moderator.neutralConclusion}</Text>
      </View>
    </View>
  );
}

// ─── Export helpers ───────────────────────────────────────────────────────────

async function exportDebatePDF(session: DebateSession): Promise<void> {
  const { exportDebateAsPDF } = await import('../../services/debateExport');
  await exportDebateAsPDF(session);
}

async function copyDebateText(session: DebateSession): Promise<void> {
  const lines = [
    `AI DEBATE: ${session.topic}`,
    `Question: ${session.question}`,
    '',
    ...session.perspectives.map(p =>
      `${p.agentName} (${stanceLabel(p.stanceType)}):\n${p.summary}`
    ),
    '',
    session.moderator ? `MODERATOR VERDICT:\n"${session.moderator.balancedVerdict}"` : '',
  ].filter(Boolean);
  await Clipboard.setStringAsync(lines.join('\n\n'));
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface OfflineDebateViewerProps {
  session:   DebateSession;
  entry:     CacheEntry;
  onClose:   () => void;
  onExport:  () => void;
  exporting: boolean;
}

export function OfflineDebateViewer({ session, entry, onClose, onExport, exporting }: OfflineDebateViewerProps) {
  const insets    = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<DebateTab>('overview');
  const [copying,   setCopying]   = useState(false);

  const handleCopy = useCallback(async () => {
    if (copying) return;
    setCopying(true);
    try {
      await copyDebateText(session);
      Alert.alert('Copied', 'Debate summary copied to clipboard.');
    } catch {
      Alert.alert('Error', 'Could not copy.');
    } finally {
      setCopying(false);
    }
  }, [session, copying]);

  const forCount = session.perspectives.filter(p => p.stanceType === 'for' || p.stanceType === 'strongly_for').length;
  const againstCount = session.perspectives.filter(p => p.stanceType === 'against' || p.stanceType === 'strongly_against').length;
  const total = Math.max(session.perspectives.length, 1);

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      {/* Header */}
      <View style={{ paddingTop: insets.top + SPACING.sm, paddingHorizontal: SPACING.lg, paddingBottom: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.border, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <TouchableOpacity onPress={onClose}
          style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: COLORS.backgroundElevated, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border }}>
          <Ionicons name="arrow-back" size={18} color={COLORS.textSecondary} />
        </TouchableOpacity>

        <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: `${'#F97316'}18`, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Ionicons name="chatbox-ellipses-outline" size={15} color="#F97316" />
        </View>

        <View style={{ flex: 1 }}>
          <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '700' }} numberOfLines={1}>{session.topic}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <View style={{ backgroundColor: `${COLORS.info}20`, borderRadius: RADIUS.sm, paddingHorizontal: 6, paddingVertical: 1 }}>
              <Text style={{ color: COLORS.info, fontSize: 9, fontWeight: '700' }}>OFFLINE</Text>
            </View>
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
              {session.perspectives.length} agents · {session.searchResultsCount} sources
            </Text>
          </View>
        </View>

        <TouchableOpacity onPress={onExport} disabled={exporting}
          style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: `${'#F97316'}15`, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: `${'#F97316'}25` }}>
          {exporting ? <ActivityIndicator size="small" color="#F97316" /> : <Ionicons name="document-text-outline" size={16} color="#F97316" />}
        </TouchableOpacity>

        <TouchableOpacity onPress={handleCopy} disabled={copying}
          style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: COLORS.backgroundElevated, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border }}>
          {copying ? <ActivityIndicator size="small" color={COLORS.textMuted} /> : <Ionicons name="copy-outline" size={16} color={COLORS.textMuted} />}
        </TouchableOpacity>
      </View>

      {/* Stance bar */}
      <View style={{ paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
        <View style={{ height: 6, borderRadius: 3, overflow: 'hidden', flexDirection: 'row', gap: 2, marginBottom: 4 }}>
          {forCount     > 0 && <View style={{ flex: forCount,     backgroundColor: COLORS.success }} />}
          {(session.perspectives.length - forCount - againstCount) > 0 && <View style={{ flex: session.perspectives.length - forCount - againstCount, backgroundColor: COLORS.textMuted }} />}
          {againstCount > 0 && <View style={{ flex: againstCount, backgroundColor: COLORS.secondary }} />}
        </View>
        <View style={{ flexDirection: 'row', gap: 14 }}>
          {forCount > 0     && <Text style={{ color: COLORS.success,   fontSize: 10, fontWeight: '700' }}>{forCount} For</Text>}
          {againstCount > 0 && <Text style={{ color: COLORS.secondary, fontSize: 10, fontWeight: '700' }}>{againstCount} Against</Text>}
        </View>
      </View>

      {/* Tabs */}
      <View style={{ flexDirection: 'row', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
        {TABS.map(tab => {
          const isActive   = activeTab === tab.id;
          const isDisabled = tab.id === 'moderator' && !session.moderator;
          return (
            <TouchableOpacity key={tab.id} onPress={() => !isDisabled && setActiveTab(tab.id)} activeOpacity={0.8}
              style={{ flex: 1, alignItems: 'center', paddingVertical: SPACING.sm, gap: 4, opacity: isDisabled ? 0.35 : 1, borderBottomWidth: isActive ? 2 : 0, borderBottomColor: COLORS.primary, marginBottom: isActive ? -1 : 0 }}>
              <Ionicons name={tab.icon as any} size={16} color={isActive ? COLORS.primary : COLORS.textMuted} />
              <Text style={{ color: isActive ? COLORS.primary : COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: isActive ? '700' : '500' }}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Content */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 80 }} showsVerticalScrollIndicator={false}>
        {activeTab === 'overview'     && <OverviewTab session={session} />}
        {activeTab === 'perspectives' && <PerspectivesTab session={session} />}
        {activeTab === 'moderator' && session.moderator && <ModeratorTab moderator={session.moderator} />}
      </ScrollView>
    </View>
  );
}