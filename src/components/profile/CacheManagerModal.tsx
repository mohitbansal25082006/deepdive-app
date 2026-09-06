// src/components/profile/CacheManagerModal.tsx
// Part 45  — nested-modal fix + BlurView freeze fix.
// Part 55.2 — theme-aware backdrop and header gradient.
// Part 59.3 — audio toggles removed; audio is part of every podcast and voice
//             debate; "Cache Now" no longer depends on the auto-cache setting.
//
// ─── WHAT CHANGED AND WHY ───────────────────────────────────────────────────
//
// 1. The "Cache Podcast Audio" and "Cache Voice Debate Audio" switches are
//    gone. They shipped OFF, so the default meaning of "cache this podcast"
//    was "save the transcript and throw away the audio" — and after the
//    Part 59.2 path fix they made no visible difference until the OS reclaimed
//    the generation directory, at which point OFF lost the audio for good. A
//    setting whose effect only becomes apparent on the day it costs you data
//    is not a setting worth keeping.
//
// 2. "Cache Now" passed no force flag, so it inherited the autoCache gate from
//    the middleware and did nothing at all when auto-cache was off. It now
//    forces, and it includes voice debates, which it had simply never fetched.
//
// 3. On open, the modal reconciles audio: any podcast or voice debate cached
//    before this version (transcript only) gets its audio pulled in and its
//    size corrected. Without this, upgrading users would keep seeing 380 KB
//    for a 40 MB episode forever, since nothing revisits an item that is
//    already "cached".
//
// 4. The green "Audio cached" line in the Items tab now renders for every
//    audio-bearing item — and an amber "Audio pending" line for those still
//    waiting — instead of appearing only on the handful of podcasts that
//    happened to be cached while the toggle was on.

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Modal,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCache } from '../../hooks/useCache';
import { updateSettings } from '../../lib/cacheSettings';
import { COLORS, FONTS, SPACING, RADIUS, getModalBackdrop } from '../../constants/theme';
import type {
  CachedContentType,
  CacheFilterType,
  CacheEntry,
  AudioReconcileProgress,
} from '../../types/cache';
import { hasAudioTrack } from '../../types/cache';

import {
  autoCacheReport,
  autoCachePodcast,
  autoCacheDebate,
  autoCacheAcademicPaper,
  autoCacheVoiceDebate,
  reconcileCachedAudio,
} from '../../lib/autoCacheMiddleware';
import { mapRowToPodcast }     from '../../services/podcastOrchestrator';
import { mapRowToVoiceDebate } from '../../services/voiceDebateOrchestrator';
import { supabase }            from '../../lib/supabase';

const { height: SCREEN_H } = Dimensions.get('window');
const SHEET_MAX_H = SCREEN_H * 0.92;

const TYPE_CONFIG: Record<CachedContentType, { label: string; icon: string; color: string }> = {
  report:         { label: 'Research Reports', icon: 'document-text-outline',   color: '#6C63FF' },
  podcast:        { label: 'Podcast Episodes', icon: 'radio-outline',            color: '#FF6584' },
  debate:         { label: 'AI Debates',        icon: 'chatbox-ellipses-outline', color: '#F97316' },
  academic_paper: { label: 'Academic Papers',   icon: 'school-outline',           color: '#43E97B' },
  presentation:   { label: 'Presentations',     icon: 'easel-outline',            color: '#29B6F6' },
  voice_debate:   { label: 'Voice Debates',     icon: 'mic-circle-outline',       color: '#8B5CF6' },
};

const EXPIRY_OPTIONS = [
  { label: '7 days',  days: 7  },
  { label: '14 days', days: 14 },
  { label: '30 days', days: 30 },
  { label: '60 days', days: 60 },
  { label: '90 days', days: 90 },
];

const CONTENT_TYPES: CachedContentType[] = [
  'report', 'podcast', 'debate', 'academic_paper', 'presentation', 'voice_debate',
];

// ─── Usage ring ───────────────────────────────────────────────────────────────

function UsageRing({ percent, usedLabel, limitLabel }: {
  percent: number; usedLabel: string; limitLabel: string;
}) {
  const SIZE       = 100;
  const clampedPct = Math.min(100, Math.max(0, percent));
  const color      = clampedPct > 85 ? COLORS.error : clampedPct > 65 ? COLORS.warning : COLORS.primary;
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: SIZE, height: SIZE, borderRadius: SIZE / 2, borderWidth: 8, borderColor: COLORS.backgroundElevated, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{
          position: 'absolute', width: SIZE - 8, height: SIZE - 8, borderRadius: (SIZE - 8) / 2,
          borderWidth: 8, borderColor: 'transparent', borderTopColor: color,
          borderRightColor:  clampedPct > 25 ? color : 'transparent',
          borderBottomColor: clampedPct > 50 ? color : 'transparent',
          borderLeftColor:   clampedPct > 75 ? color : 'transparent',
          transform: [{ rotate: `${(clampedPct / 100) * 360 - 90}deg` }],
        }} />
        <View style={{ alignItems: 'center' }}>
          <Text style={{ color, fontSize: FONTS.sizes.md, fontWeight: '800' }}>{Math.round(clampedPct)}%</Text>
          <Text style={{ color: COLORS.textMuted, fontSize: 9 }}>used</Text>
        </View>
      </View>
      <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '700', marginTop: 8 }}>{usedLabel}</Text>
      <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 2 }}>of {limitLabel} limit</Text>
    </View>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <Text style={{
      color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '700',
      letterSpacing: 1, textTransform: 'uppercase',
      marginBottom: SPACING.sm, marginTop: SPACING.lg,
    }}>
      {title}
    </Text>
  );
}

// ─── Per-type row ─────────────────────────────────────────────────────────────

function TypeRow({
  type, count, bytes, audioCount, audioBytesForType,
  formatBytes, onDelete, isDeleting,
}: {
  type: CachedContentType; count: number; bytes: number;
  audioCount?: number; audioBytesForType?: number;
  formatBytes: (b: number) => string; onDelete: () => void; isDeleting: boolean;
}) {
  const cfg = TYPE_CONFIG[type];
  if (count === 0) return null;

  const handleDelete = () => {
    Alert.alert(
      `Clear ${cfg.label}`,
      `Delete all ${count} cached ${cfg.label.toLowerCase()} from this device?\n\nYour data remains in the cloud.`,
      [{ text: 'Cancel', style: 'cancel' },
       { text: 'Delete All', style: 'destructive', onPress: onDelete }],
    );
  };

  const showsAudio = hasAudioTrack(type) && (audioCount ?? 0) > 0;

  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.lg,
      padding: SPACING.md, marginBottom: SPACING.sm,
      borderWidth: 1, borderColor: COLORS.border,
    }}>
      <View style={{
        width: 38, height: 38, borderRadius: 11,
        backgroundColor: `${cfg.color}18`, alignItems: 'center', justifyContent: 'center',
        borderWidth: 1, borderColor: `${cfg.color}30`, flexShrink: 0,
      }}>
        <Ionicons name={cfg.icon as never} size={17} color={cfg.color} />
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '600' }}>{cfg.label}</Text>
        <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 2 }} numberOfLines={2}>
          {count} item{count !== 1 ? 's' : ''} · {formatBytes(bytes)}
          {showsAudio ? ` · incl. ${formatBytes(audioBytesForType ?? 0)} audio` : ''}
        </Text>
      </View>

      <TouchableOpacity
        onPress={handleDelete}
        disabled={isDeleting}
        style={{
          backgroundColor: `${COLORS.error}10`, borderRadius: RADIUS.md,
          paddingHorizontal: 10, paddingVertical: 6,
          borderWidth: 1, borderColor: `${COLORS.error}25`, flexShrink: 0,
        }}
      >
        {isDeleting
          ? <ActivityIndicator size="small" color={COLORS.error} />
          : <Text style={{ color: COLORS.error, fontSize: FONTS.sizes.xs, fontWeight: '700' }}>Clear</Text>}
      </TouchableOpacity>
    </View>
  );
}

// ─── Manual cache section ─────────────────────────────────────────────────────

function ManualCacheSection({ onCacheAll, isCachingAll, onSelectiveCache }: {
  onCacheAll: () => Promise<void>; isCachingAll: boolean; onSelectiveCache: () => void;
}) {
  return (
    <View>
      <SectionHeader title="Manual Cache" />

      <TouchableOpacity
        onPress={onSelectiveCache}
        activeOpacity={0.75}
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 12,
          backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.lg,
          padding: SPACING.md, marginBottom: SPACING.sm,
          borderWidth: 1, borderColor: `${COLORS.primary}30`,
        }}
      >
        <LinearGradient
          colors={COLORS.gradientPrimary as [string, string]}
          style={{ width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
        >
          <Ionicons name="checkmark-done-outline" size={18} color="#FFF" />
        </LinearGradient>
        <View style={{ flex: 1 }}>
          <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '700' }}>Cache Specific Items</Text>
          <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 2, lineHeight: 16 }}>
            Hand-pick exactly what to save. Works whether or not auto-cache is on.
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
      </TouchableOpacity>

      <View style={{
        backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.lg,
        padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.sm,
      }}>
        <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '600', marginBottom: 4 }}>
          Cache All Recent Content
        </Text>
        <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, lineHeight: 16, marginBottom: SPACING.md }}>
          Save your 10 most recent reports, podcasts, debates, papers and voice debates —
          audio included, so podcasts and voice debates play offline.
        </Text>
        <TouchableOpacity
          onPress={onCacheAll}
          disabled={isCachingAll}
          style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
            backgroundColor: `${COLORS.primary}15`, borderRadius: RADIUS.lg, paddingVertical: 10,
            borderWidth: 1, borderColor: `${COLORS.primary}30`, opacity: isCachingAll ? 0.6 : 1,
          }}
        >
          {isCachingAll
            ? <ActivityIndicator size="small" color={COLORS.primary} />
            : <Ionicons name="cloud-download-outline" size={16} color={COLORS.primary} />}
          <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.sm, fontWeight: '700' }}>
            {isCachingAll ? 'Caching…' : 'Cache Now'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Single item row ──────────────────────────────────────────────────────────

function ItemRow({ entry, onDelete, isDeleting, formatBytes }: {
  entry: CacheEntry; onDelete: () => void; isDeleting: boolean; formatBytes: (b: number) => string;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const cfg = TYPE_CONFIG[entry.type];

  // Part 59.3: every audio-bearing type reports its audio state, not just the
  // podcasts that happened to be cached while the old toggle was on.
  const isAudioType = hasAudioTrack(entry.type);
  const audioBytes  = entry.audioSizeBytes ?? 0;

  const handlePress = () => {
    if (confirmDelete) { onDelete(); setConfirmDelete(false); }
    else { setConfirmDelete(true); setTimeout(() => setConfirmDelete(false), 2500); }
  };

  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 10,
      backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.md,
      padding: SPACING.sm, marginBottom: 6,
      borderWidth: 1, borderColor: COLORS.border,
    }}>
      <View style={{
        width: 30, height: 30, borderRadius: 9,
        backgroundColor: `${cfg.color}15`, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <Ionicons name={(entry.icon ?? cfg.icon) as never} size={13} color={cfg.color} />
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, lineHeight: 16 }} numberOfLines={2}>
          {entry.title}
        </Text>

        {isAudioType && entry.hasAudio && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 }}>
            <Ionicons name="headset-outline" size={9} color={COLORS.success} />
            <Text style={{ color: COLORS.success, fontSize: 9, fontWeight: '700' }}>
              Audio cached{audioBytes > 0 ? ` · ${formatBytes(audioBytes)}` : ''}
            </Text>
          </View>
        )}

        {isAudioType && !entry.hasAudio && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 }}>
            <Ionicons name="cloud-download-outline" size={9} color={COLORS.warning} />
            <Text style={{ color: COLORS.warning, fontSize: 9, fontWeight: '700' }}>
              Audio pending
            </Text>
          </View>
        )}
      </View>

      <Text style={{ color: COLORS.textMuted, fontSize: 10, flexShrink: 0 }}>
        {formatBytes(entry.sizeBytes)}
      </Text>

      <TouchableOpacity
        onPress={handlePress}
        disabled={isDeleting}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        style={{
          width: 28, height: 28, borderRadius: 8,
          backgroundColor: confirmDelete ? `${COLORS.error}20` : COLORS.backgroundElevated,
          alignItems: 'center', justifyContent: 'center',
          borderWidth: 1, borderColor: confirmDelete ? `${COLORS.error}40` : COLORS.border,
          flexShrink: 0,
        }}
      >
        {isDeleting
          ? <ActivityIndicator size="small" color={COLORS.error} />
          : <Ionicons name={confirmDelete ? 'checkmark' : 'trash-outline'} size={13}
                      color={confirmDelete ? COLORS.error : COLORS.textMuted} />}
      </TouchableOpacity>
    </View>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

interface CacheManagerModalProps {
  visible:              boolean;
  onClose:              () => void;
  onOpenSelectiveCache: () => void;
}

export function CacheManagerModal({ visible, onClose, onOpenSelectiveCache }: CacheManagerModalProps) {
  const insets = useSafeAreaInsets();
  const {
    stats, settings, summary, isLoading, isDeleting,
    activeFilter, filteredEntries, setFilter,
    limitPresets, formatBytes,
    refresh, deleteItem, deleteByType, deleteAll, setLimit, toggleAutoCache,
  } = useCache();

  const [activeTab,    setActiveTab]    = useState<'overview' | 'items'>('overview');
  const [isCachingAll, setIsCachingAll] = useState(false);
  const [reconciling,  setReconciling]  = useState<AudioReconcileProgress | null>(null);

  // ── On open: refresh, then repair any transcript-only audio entries ───────
  //
  // Items cached before Part 59.3 have hasAudio:false and a JSON-only size.
  // Nothing else in the app revisits an already-cached item, so without this
  // sweep those entries would under-report their size and never show the audio
  // badge, permanently.

  useEffect(() => {
    if (!visible) return;

    let cancelled = false;

    (async () => {
      await refresh();
      if (cancelled) return;

      const result = await reconcileCachedAudio(p => {
        if (!cancelled) setReconciling(p.done < p.total ? p : null);
      });

      if (cancelled) return;
      setReconciling(null);

      if (result.repaired > 0 || result.resized > 0) {
        await refresh();
      }
    })();

    return () => { cancelled = true; };
  }, [visible]);

  // ── Cache All ─────────────────────────────────────────────────────────────

  const handleCacheAll = useCallback(async () => {
    if (isCachingAll) return;
    setIsCachingAll(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { Alert.alert('Error', 'Not signed in.'); return; }

      const [reports, podcasts, debates, papers, voiceDebates] = await Promise.allSettled([
        supabase.from('research_reports').select('*').eq('user_id', user.id).eq('status', 'completed').order('created_at', { ascending: false }).limit(10),
        supabase.from('podcasts').select('*').eq('user_id', user.id).eq('status', 'completed').order('created_at', { ascending: false }).limit(10),
        supabase.from('debate_sessions').select('*').eq('user_id', user.id).eq('status', 'completed').order('created_at', { ascending: false }).limit(10),
        supabase.from('academic_papers').select('*').eq('user_id', user.id).order('generated_at', { ascending: false }).limit(10),
        supabase.from('voice_debates').select('*').eq('user_id', user.id).eq('status', 'completed').order('completed_at', { ascending: false }).limit(10),
      ]);

      // Part 59.3: force:true on every call. Without it this button was a no-op
      // whenever auto-cache was switched off.
      const force = { force: true } as const;
      const jobs: Promise<void>[] = [];

      if (reports.status === 'fulfilled' && reports.value.data) {
        for (const row of reports.value.data) {
          jobs.push(autoCacheReport({
            id: row.id, userId: row.user_id, query: row.query, depth: row.depth,
            focusAreas: row.focus_areas ?? [], title: row.title ?? row.query,
            executiveSummary: row.executive_summary ?? '', sections: row.sections ?? [],
            keyFindings: row.key_findings ?? [], futurePredictions: row.future_predictions ?? [],
            citations: row.citations ?? [], statistics: row.statistics ?? [],
            searchQueries: row.search_queries ?? [], sourcesCount: row.sources_count ?? 0,
            reliabilityScore: row.reliability_score ?? 0, status: row.status,
            agentLogs: row.agent_logs ?? [], knowledgeGraph: row.knowledge_graph ?? undefined,
            infographicData: row.infographic_data ?? undefined, sourceImages: row.source_images ?? [],
            researchMode: row.research_mode ?? 'standard',
            createdAt: row.created_at, completedAt: row.completed_at,
          } as never, force));
        }
      }

      if (podcasts.status === 'fulfilled' && podcasts.value.data) {
        for (const row of podcasts.value.data) {
          jobs.push(autoCachePodcast(mapRowToPodcast(row), force));
        }
      }

      if (debates.status === 'fulfilled' && debates.value.data) {
        for (const row of debates.value.data) {
          jobs.push(autoCacheDebate(row as never, force));
        }
      }

      if (papers.status === 'fulfilled' && papers.value.data) {
        for (const row of papers.value.data) {
          jobs.push(autoCacheAcademicPaper(row as never, force));
        }
      }

      // Part 59.3: voice debates were never included here at all.
      if (voiceDebates.status === 'fulfilled' && voiceDebates.value.data) {
        for (const row of voiceDebates.value.data) {
          jobs.push(autoCacheVoiceDebate(
            mapRowToVoiceDebate(row as Record<string, unknown>), force,
          ));
        }
      }

      await Promise.allSettled(jobs);
      await refresh();
      Alert.alert('Done', 'Recent content has been cached for offline use, audio included.');
    } catch {
      Alert.alert('Error', 'Some content could not be cached. Please try again.');
    } finally {
      setIsCachingAll(false);
    }
  }, [isCachingAll, refresh]);

  const handleDeleteAll = () => {
    if (!stats || stats.totalItems === 0) return;
    Alert.alert(
      'Clear All Cache',
      `Delete all ${stats.totalItems} cached items (${formatBytes(stats.totalBytes)}) from this device?\n\nYour data remains safely in the cloud.`,
      [{ text: 'Cancel', style: 'cancel' },
       { text: 'Clear All Cache', style: 'destructive', onPress: deleteAll }],
    );
  };

  const audioItems =
    (stats?.podcastsWithAudio ?? 0) + (stats?.voiceDebatesWithAudio ?? 0);
  const audioBytes =
    (stats?.audioBytesTotal ?? 0) + (stats?.voiceDebateAudioBytes ?? 0);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: getModalBackdrop(0.72), justifyContent: 'flex-end' }}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />

        <View style={{
          backgroundColor: COLORS.backgroundCard,
          borderTopLeftRadius: 28, borderTopRightRadius: 28,
          maxHeight: SHEET_MAX_H,
          borderTopWidth: 1, borderTopColor: COLORS.border,
          paddingBottom: insets.bottom,
        }}>
          <View style={{ alignItems: 'center', paddingTop: SPACING.sm, marginBottom: SPACING.sm }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.border }} />
          </View>

          {/* Header */}
          <View style={{
            flexDirection: 'row', alignItems: 'center',
            paddingHorizontal: SPACING.xl, paddingBottom: SPACING.md,
            borderBottomWidth: 1, borderBottomColor: COLORS.border,
          }}>
            <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10, marginRight: SPACING.sm }}>
              <LinearGradient
                colors={COLORS.gradientPrimary as [string, string]}
                style={{ width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
              >
                <Ionicons name="cloud-offline-outline" size={16} color="#FFF" />
              </LinearGradient>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.md, fontWeight: '800' }} numberOfLines={1}>
                  Cache Manager
                </Text>
                <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }} numberOfLines={1}>
                  {summary || 'Loading…'}
                </Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={{
                width: 34, height: 34, borderRadius: 10,
                backgroundColor: COLORS.backgroundElevated,
                alignItems: 'center', justifyContent: 'center',
                borderWidth: 1, borderColor: COLORS.border, flexShrink: 0,
              }}
            >
              <Ionicons name="close" size={17} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Reconcile banner */}
          {reconciling && (
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 10,
              marginHorizontal: SPACING.xl, marginTop: SPACING.sm,
              paddingHorizontal: SPACING.md, paddingVertical: 8,
              backgroundColor: `${COLORS.primary}10`, borderRadius: RADIUS.md,
              borderWidth: 1, borderColor: `${COLORS.primary}25`,
            }}>
              <ActivityIndicator size="small" color={COLORS.primary} />
              <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.xs, fontWeight: '600', flex: 1 }} numberOfLines={1}>
                Checking audio · {reconciling.done + 1}/{reconciling.total}
              </Text>
            </View>
          )}

          {/* Tabs */}
          <View style={{ flexDirection: 'row', paddingHorizontal: SPACING.xl, paddingVertical: SPACING.sm, gap: SPACING.sm }}>
            {(['overview', 'items'] as const).map(tab => (
              <TouchableOpacity
                key={tab}
                onPress={() => setActiveTab(tab)}
                style={{
                  flex: 1, paddingVertical: 8, borderRadius: RADIUS.md,
                  backgroundColor: activeTab === tab ? COLORS.primary : COLORS.backgroundElevated,
                  alignItems: 'center',
                  borderWidth: 1, borderColor: activeTab === tab ? COLORS.primary : COLORS.border,
                }}
              >
                <Text style={{ color: activeTab === tab ? '#FFF' : COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '700' }}>
                  {tab === 'overview' ? 'Storage' : `Items (${stats?.totalItems ?? 0})`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {isLoading ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING['2xl'] }}>
              <ActivityIndicator size="large" color={COLORS.primary} />
            </View>
          ) : (
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: SPACING.xl, paddingBottom: SPACING.xl }}
              keyboardShouldPersistTaps="handled"
            >
              {activeTab === 'overview' && (
                <>
                  {stats && (
                    <View style={{ alignItems: 'center', paddingVertical: SPACING.lg }}>
                      <UsageRing
                        percent={stats.percentUsed}
                        usedLabel={formatBytes(stats.totalBytes)}
                        limitLabel={formatBytes(stats.limitBytes)}
                      />

                      {audioItems > 0 && (
                        <View style={{
                          flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: SPACING.sm,
                          backgroundColor: `${COLORS.success}12`, borderRadius: RADIUS.full,
                          paddingHorizontal: 12, paddingVertical: 5,
                          borderWidth: 1, borderColor: `${COLORS.success}25`,
                        }}>
                          <Ionicons name="headset-outline" size={12} color={COLORS.success} />
                          <Text style={{ color: COLORS.success, fontSize: FONTS.sizes.xs, fontWeight: '600' }}>
                            {audioItems} item{audioItems === 1 ? '' : 's'} with audio · {formatBytes(audioBytes)}
                          </Text>
                        </View>
                      )}

                      {(stats.itemsAwaitingAudio ?? 0) > 0 && (
                        <View style={{
                          flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: SPACING.xs,
                          backgroundColor: `${COLORS.warning}12`, borderRadius: RADIUS.full,
                          paddingHorizontal: 12, paddingVertical: 5,
                          borderWidth: 1, borderColor: `${COLORS.warning}25`,
                        }}>
                          <Ionicons name="cloud-download-outline" size={12} color={COLORS.warning} />
                          <Text style={{ color: COLORS.warning, fontSize: FONTS.sizes.xs, fontWeight: '600' }}>
                            {stats.itemsAwaitingAudio} awaiting audio
                          </Text>
                        </View>
                      )}
                    </View>
                  )}

                  <SectionHeader title="By Content Type" />
                  {CONTENT_TYPES.map(type => (
                    <TypeRow
                      key={type}
                      type={type}
                      count={stats?.byType[type]?.count ?? 0}
                      bytes={stats?.byType[type]?.bytes ?? 0}
                      audioCount={
                        type === 'podcast'      ? (stats?.podcastsWithAudio ?? 0)
                      : type === 'voice_debate' ? (stats?.voiceDebatesWithAudio ?? 0)
                      : undefined
                      }
                      audioBytesForType={
                        type === 'podcast'      ? (stats?.audioBytesTotal ?? 0)
                      : type === 'voice_debate' ? (stats?.voiceDebateAudioBytes ?? 0)
                      : undefined
                      }
                      formatBytes={formatBytes}
                      onDelete={() => deleteByType(type)}
                      isDeleting={isDeleting}
                    />
                  ))}

                  <ManualCacheSection
                    onCacheAll={handleCacheAll}
                    isCachingAll={isCachingAll}
                    onSelectiveCache={onOpenSelectiveCache}
                  />

                  <SectionHeader title="Storage Limit" />
                  {limitPresets.map(preset => {
                    const isSelected = settings?.limitBytes === preset.bytes;
                    return (
                      <TouchableOpacity
                        key={preset.bytes}
                        onPress={() => setLimit(preset.bytes)}
                        style={{
                          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                          backgroundColor: isSelected ? `${COLORS.primary}12` : COLORS.backgroundCard,
                          borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.sm,
                          borderWidth: 1.5, borderColor: isSelected ? COLORS.primary : COLORS.border,
                        }}
                      >
                        <Text style={{
                          color: isSelected ? COLORS.primary : COLORS.textSecondary,
                          fontSize: FONTS.sizes.base, fontWeight: isSelected ? '700' : '500',
                        }}>
                          {preset.display}
                        </Text>
                        {isSelected && (
                          <LinearGradient
                            colors={COLORS.gradientPrimary as [string, string]}
                            style={{ width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' }}
                          >
                            <Ionicons name="checkmark" size={13} color="#FFF" />
                          </LinearGradient>
                        )}
                      </TouchableOpacity>
                    );
                  })}

                  <SectionHeader title="Settings" />

                  {/* Part 59.3: this is now the ONLY caching switch. The two
                      audio toggles that used to sit below it are gone — audio
                      travels with its item. */}
                  <View style={{
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                    backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.lg,
                    padding: SPACING.md, marginBottom: SPACING.sm,
                    borderWidth: 1, borderColor: COLORS.border,
                  }}>
                    <View style={{ flex: 1, minWidth: 0, marginRight: SPACING.md }}>
                      <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '600' }}>
                        Auto-Cache Content
                      </Text>
                      <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 2, lineHeight: 16 }}>
                        Save new reports, podcasts, debates, papers, slides and voice debates
                        automatically as they finish. Manual caching always works, even with
                        this off.
                      </Text>
                    </View>
                    <Switch
                      value={settings?.autoCache ?? true}
                      onValueChange={toggleAutoCache}
                      trackColor={{ false: COLORS.border, true: `${COLORS.primary}80` }}
                      thumbColor={settings?.autoCache ? COLORS.primary : COLORS.textMuted}
                    />
                  </View>

                  <View style={{
                    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
                    backgroundColor: `${COLORS.info}0C`, borderRadius: RADIUS.lg,
                    padding: SPACING.md, marginBottom: SPACING.sm,
                    borderWidth: 1, borderColor: `${COLORS.info}22`,
                  }}>
                    <Ionicons name="headset-outline" size={16} color={COLORS.info} style={{ marginTop: 1, flexShrink: 0 }} />
                    <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, lineHeight: 17, flex: 1 }}>
                      Podcasts and voice debates are cached with their audio, so they play
                      offline and export as MP3. A podcast typically adds 5–25 MB and a voice
                      debate 10–80 MB — raise the storage limit above if you cache many.
                    </Text>
                  </View>

                  <View style={{
                    backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.lg,
                    padding: SPACING.md, marginBottom: SPACING.sm,
                    borderWidth: 1, borderColor: COLORS.border,
                  }}>
                    <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '600', marginBottom: SPACING.sm }}>
                      Cache Expiry
                    </Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      {EXPIRY_OPTIONS.map(opt => {
                        const isSelected = settings?.expiryDays === opt.days;
                        return (
                          <TouchableOpacity
                            key={opt.days}
                            onPress={async () => { await updateSettings({ expiryDays: opt.days }); await refresh(); }}
                            style={{
                              backgroundColor: isSelected ? `${COLORS.primary}15` : COLORS.backgroundElevated,
                              borderRadius: RADIUS.full, paddingHorizontal: 12, paddingVertical: 6,
                              borderWidth: 1, borderColor: isSelected ? COLORS.primary : COLORS.border,
                            }}
                          >
                            <Text style={{
                              color: isSelected ? COLORS.primary : COLORS.textMuted,
                              fontSize: FONTS.sizes.xs, fontWeight: isSelected ? '700' : '500',
                            }}>
                              {opt.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>

                  <TouchableOpacity
                    onPress={handleDeleteAll}
                    disabled={isDeleting || (stats?.totalItems ?? 0) === 0}
                    style={{
                      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                      marginTop: SPACING.sm, backgroundColor: `${COLORS.error}10`,
                      borderRadius: RADIUS.lg, padding: SPACING.md,
                      borderWidth: 1, borderColor: `${COLORS.error}25`,
                      opacity: (stats?.totalItems ?? 0) === 0 ? 0.4 : 1,
                    }}
                  >
                    {isDeleting
                      ? <ActivityIndicator size="small" color={COLORS.error} />
                      : <Ionicons name="trash-outline" size={16} color={COLORS.error} />}
                    <Text style={{ color: COLORS.error, fontSize: FONTS.sizes.sm, fontWeight: '700' }}>
                      Clear All Cache
                    </Text>
                  </TouchableOpacity>
                </>
              )}

              {activeTab === 'items' && (
                <>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: SPACING.md }}>
                    {(['all', ...CONTENT_TYPES] as CacheFilterType[]).map(f => {
                      const cfg      = f === 'all' ? { label: 'All', color: COLORS.primary } : TYPE_CONFIG[f as CachedContentType];
                      const count    = f === 'all' ? (stats?.totalItems ?? 0) : (stats?.byType[f as CachedContentType]?.count ?? 0);
                      const isActive = activeFilter === f;
                      return (
                        <TouchableOpacity
                          key={f}
                          onPress={() => setFilter(f)}
                          style={{
                            flexDirection: 'row', alignItems: 'center', gap: 5,
                            backgroundColor: isActive ? cfg.color : COLORS.backgroundElevated,
                            borderRadius: RADIUS.full, paddingHorizontal: 10, paddingVertical: 6,
                            borderWidth: 1, borderColor: isActive ? cfg.color : COLORS.border,
                          }}
                        >
                          <Text style={{ color: isActive ? '#FFF' : COLORS.textSecondary, fontSize: FONTS.sizes.xs, fontWeight: '600' }}>
                            {f === 'all' ? 'All' : TYPE_CONFIG[f as CachedContentType].label}
                          </Text>
                          {count > 0 && (
                            <View style={{
                              backgroundColor: isActive ? 'rgba(255,255,255,0.25)' : `${cfg.color}20`,
                              borderRadius: RADIUS.full, paddingHorizontal: 5, paddingVertical: 1,
                              minWidth: 18, alignItems: 'center',
                            }}>
                              <Text style={{ color: isActive ? '#FFF' : cfg.color, fontSize: 9, fontWeight: '800' }}>{count}</Text>
                            </View>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {filteredEntries.length === 0 ? (
                    <View style={{ alignItems: 'center', padding: SPACING.xl }}>
                      <Ionicons name="folder-open-outline" size={40} color={COLORS.textMuted} />
                      <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.sm, marginTop: SPACING.sm, textAlign: 'center' }}>
                        No items cached for this type
                      </Text>
                    </View>
                  ) : (
                    <>
                      <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginBottom: SPACING.sm }}>
                        Tap the trash icon once to arm, again to confirm delete
                      </Text>
                      {filteredEntries.map(entry => (
                        <ItemRow
                          key={`${entry.type}-${entry.id}`}
                          entry={entry}
                          formatBytes={formatBytes}
                          onDelete={() => deleteItem(entry.type, entry.id)}
                          isDeleting={isDeleting}
                        />
                      ))}
                    </>
                  )}
                </>
              )}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}