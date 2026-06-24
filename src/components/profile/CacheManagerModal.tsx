// src/components/profile/CacheManagerModal.tsx
// Part 45 FIX — Two bugs fixed:
//
// FIX 1 — SelectiveCacheSheet not opening:
//   Root cause: SelectiveCacheSheet (a Modal) was rendered *inside*
//   CacheManagerModal's own Modal. On iOS, nested Modals do not work —
//   the inner Modal never becomes visible.
//   Fix: Close the cache manager first, then open SelectiveCacheSheet
//   as a sibling (both rendered at the same level in the parent component).
//   CacheManagerModal now accepts an `onOpenSelectiveCache` prop instead of
//   managing the sheet itself. The parent (profile.tsx) owns both modals and
//   sequences them correctly.
//
// FIX 2 — Profile tab freezes after closing Cache Manager:
//   Root cause: BlurView from expo-blur leaves a touch-blocking overlay when
//   the Modal animates out. The BlurView's native layer doesn't unmount
//   synchronously with the Modal's JS animation.
//   Fix: Replace BlurView backdrop with a plain View using a semi-transparent
//   background color. This matches every other modal in the project.
//
// Part 55.2 — Theme-compatibility pass:
//   • Backdrop changed from hardcoded 'rgba(10,10,26,0.72)' to
//     getModalBackdrop() — correct in both dark and light themes.
//   • Header icon gradient changed from hardcoded ['#29B6F6', '#0085D2'] to
//     COLORS.gradientPrimary so it follows the active theme's brand color
//     instead of always being blue regardless of theme.
//
// All features from Part 45 preserved: voice debate toggle, voice_debate type
// row, "Cache Specific Items" button, usage ring badges, items tab filters.

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
import {
  updateSettings,
  setAudioCache,
  setVoiceDebateCache,
  isAudioCacheEnabled,
  isVoiceDebateCacheEnabled,
} from '../../lib/cacheSettings';
import { COLORS, FONTS, SPACING, RADIUS, getModalBackdrop } from '../../constants/theme';
import type { CachedContentType, CacheFilterType } from '../../types/cache';

// BUG 2 FIX: Static imports — replacing dynamic await import() in handleCacheAll
// that caused black screen crashes on Hermes (React Native production JS engine)
import {
  autoCacheReport,
  autoCachePodcast,
  autoCacheDebate,
  autoCacheAcademicPaper,
  autoCachePresentation,
}                              from '../../lib/autoCacheMiddleware';
import { mapRowToPodcast }     from '../../services/podcastOrchestrator';
import { supabase }             from '../../lib/supabase';

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

function UsageRing({ percent, usedLabel, limitLabel }: {
  percent: number; usedLabel: string; limitLabel: string;
}) {
  const SIZE       = 100;
  const clampedPct = Math.min(100, Math.max(0, percent));
  const color      = clampedPct > 85 ? COLORS.error : clampedPct > 65 ? COLORS.warning : COLORS.primary;
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: SIZE, height: SIZE, borderRadius: SIZE / 2, borderWidth: 8, borderColor: COLORS.backgroundElevated, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ position: 'absolute', width: SIZE - 8, height: SIZE - 8, borderRadius: (SIZE - 8) / 2, borderWidth: 8, borderColor: 'transparent', borderTopColor: color, borderRightColor: clampedPct > 25 ? color : 'transparent', borderBottomColor: clampedPct > 50 ? color : 'transparent', borderLeftColor: clampedPct > 75 ? color : 'transparent', transform: [{ rotate: `${(clampedPct / 100) * 360 - 90}deg` }] }} />
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
    <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: SPACING.sm, marginTop: SPACING.lg }}>
      {title}
    </Text>
  );
}

function TypeRow({ type, count, bytes, audioCount, audioBytesForType, formatBytes, onDelete, isDeleting }: {
  type: CachedContentType; count: number; bytes: number;
  audioCount?: number; audioBytesForType?: number;
  formatBytes: (b: number) => string; onDelete: () => void; isDeleting: boolean;
}) {
  const cfg = TYPE_CONFIG[type];
  if (count === 0) return null;
  const handleDelete = () => {
    Alert.alert(`Clear ${cfg.label}`, `Delete all ${count} cached ${cfg.label.toLowerCase()} from this device?\n\nYour data remains in the cloud.`,
      [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete All', style: 'destructive', onPress: onDelete }]);
  };
  const hasAudioStat = (type === 'podcast' || type === 'voice_debate') && (audioCount ?? 0) > 0;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.sm, borderWidth: 1, borderColor: COLORS.border }}>
      <View style={{ width: 38, height: 38, borderRadius: 11, backgroundColor: `${cfg.color}18`, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: `${cfg.color}30`, flexShrink: 0 }}>
        <Ionicons name={cfg.icon as any} size={17} color={cfg.color} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '600' }}>{cfg.label}</Text>
        <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 2 }} numberOfLines={2}>
          {count} item{count !== 1 ? 's' : ''} · {formatBytes(bytes)}
          {hasAudioStat ? ` · ${audioCount} with audio (${formatBytes(audioBytesForType ?? 0)})` : ''}
        </Text>
      </View>
      <TouchableOpacity onPress={handleDelete} disabled={isDeleting} style={{ backgroundColor: `${COLORS.error}10`, borderRadius: RADIUS.md, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: `${COLORS.error}25`, flexShrink: 0 }}>
        {isDeleting ? <ActivityIndicator size="small" color={COLORS.error} /> : <Text style={{ color: COLORS.error, fontSize: FONTS.sizes.xs, fontWeight: '700' }}>Clear</Text>}
      </TouchableOpacity>
    </View>
  );
}

function ManualCacheSection({ onCacheAll, isCachingAll, onSelectiveCache }: {
  onCacheAll: () => Promise<void>; isCachingAll: boolean; onSelectiveCache: () => void;
}) {
  return (
    <View>
      <SectionHeader title="Manual Cache" />
      <TouchableOpacity onPress={onSelectiveCache} activeOpacity={0.75}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.sm, borderWidth: 1, borderColor: `${COLORS.primary}30` }}>
        <LinearGradient colors={COLORS.gradientPrimary as [string, string]} style={{ width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Ionicons name="checkmark-done-outline" size={18} color="#FFF" />
        </LinearGradient>
        <View style={{ flex: 1 }}>
          <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '700' }}>Cache Specific Items</Text>
          <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 2, lineHeight: 16 }}>
            Hand-pick exactly which reports, podcasts, debates, papers, slides or voice debates to cache
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
      </TouchableOpacity>
      <View style={{ backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.lg, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.sm }}>
        <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '600', marginBottom: 4 }}>Cache All Recent Content</Text>
        <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, lineHeight: 16, marginBottom: SPACING.md }}>
          Download your 10 most recent reports, podcasts, debates, papers and presentations. Large if audio caching is enabled.
        </Text>
        <TouchableOpacity onPress={onCacheAll} disabled={isCachingAll}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: `${COLORS.primary}15`, borderRadius: RADIUS.lg, paddingVertical: 10, borderWidth: 1, borderColor: `${COLORS.primary}30`, opacity: isCachingAll ? 0.6 : 1 }}>
          {isCachingAll ? <ActivityIndicator size="small" color={COLORS.primary} /> : <Ionicons name="cloud-download-outline" size={16} color={COLORS.primary} />}
          <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.sm, fontWeight: '700' }}>{isCachingAll ? 'Caching…' : 'Cache Now'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function ItemRow({ entry, onDelete, isDeleting, formatBytes }: {
  entry: import('../../types/cache').CacheEntry; onDelete: () => void; isDeleting: boolean; formatBytes: (b: number) => string;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const cfg = TYPE_CONFIG[entry.type];
  const isAudioType = entry.type === 'podcast' || entry.type === 'voice_debate';
  const handlePress = () => {
    if (confirmDelete) { onDelete(); setConfirmDelete(false); }
    else { setConfirmDelete(true); setTimeout(() => setConfirmDelete(false), 2500); }
  };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.md, padding: SPACING.sm, marginBottom: 6, borderWidth: 1, borderColor: COLORS.border }}>
      <View style={{ width: 30, height: 30, borderRadius: 9, backgroundColor: `${cfg.color}15`, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Ionicons name={(entry.icon ?? cfg.icon) as any} size={13} color={cfg.color} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, lineHeight: 16 }} numberOfLines={2}>{entry.title}</Text>
        {isAudioType && entry.hasAudio && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 }}>
            <Ionicons name="headset-outline" size={9} color={COLORS.success} />
            <Text style={{ color: COLORS.success, fontSize: 9, fontWeight: '700' }}>Audio cached</Text>
          </View>
        )}
      </View>
      <Text style={{ color: COLORS.textMuted, fontSize: 10, flexShrink: 0 }}>{formatBytes(entry.sizeBytes)}</Text>
      <TouchableOpacity onPress={handlePress} disabled={isDeleting} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: confirmDelete ? `${COLORS.error}20` : COLORS.backgroundElevated, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: confirmDelete ? `${COLORS.error}40` : COLORS.border, flexShrink: 0 }}>
        {isDeleting ? <ActivityIndicator size="small" color={COLORS.error} /> : <Ionicons name={confirmDelete ? 'checkmark' : 'trash-outline'} size={13} color={confirmDelete ? COLORS.error : COLORS.textMuted} />}
      </TouchableOpacity>
    </View>
  );
}

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

  const [activeTab,          setActiveTab]          = useState<'overview' | 'items'>('overview');
  const [audioCacheOn,       setAudioCacheOn]       = useState(false);
  const [voiceDebateCacheOn, setVoiceDebateCacheOn] = useState(false);
  const [isCachingAll,       setIsCachingAll]       = useState(false);

  useEffect(() => {
    if (visible) {
      refresh();
      Promise.all([isAudioCacheEnabled(), isVoiceDebateCacheEnabled()])
        .then(([audio, vd]) => { setAudioCacheOn(audio); setVoiceDebateCacheOn(vd); })
        .catch(() => {});
    }
  }, [visible]);

  const handleToggleAudioCache = useCallback(async (val: boolean) => {
    setAudioCacheOn(val); await setAudioCache(val);
  }, []);

  const handleToggleVoiceDebateCache = useCallback(async (val: boolean) => {
    setVoiceDebateCacheOn(val); await setVoiceDebateCache(val);
  }, []);

  const handleCacheAll = useCallback(async () => {
    if (isCachingAll) return;
    setIsCachingAll(true);
    try {
      // supabase imported statically (see top of file)
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { Alert.alert('Error', 'Not signed in.'); return; }
      // autoCacheReport, autoCachePodcast etc. are now static imports at top of file
      const [reports, podcasts, debates, papers] = await Promise.allSettled([
        supabase.from('research_reports').select('*').eq('user_id', user.id).eq('status', 'completed').order('created_at', { ascending: false }).limit(10),
        supabase.from('podcasts').select('*').eq('user_id', user.id).eq('status', 'completed').order('created_at', { ascending: false }).limit(10),
        supabase.from('debate_sessions').select('*').eq('user_id', user.id).eq('status', 'completed').order('created_at', { ascending: false }).limit(10),
        supabase.from('academic_papers').select('*').eq('user_id', user.id).order('generated_at', { ascending: false }).limit(10),
      ]);
      const cacheJobs: Promise<void>[] = [];
      if (reports.status === 'fulfilled' && reports.value.data) {
        for (const row of reports.value.data) {
          cacheJobs.push(autoCacheReport({ id: row.id, userId: row.user_id, query: row.query, depth: row.depth, focusAreas: row.focus_areas ?? [], title: row.title ?? row.query, executiveSummary: row.executive_summary ?? '', sections: row.sections ?? [], keyFindings: row.key_findings ?? [], futurePredictions: row.future_predictions ?? [], citations: row.citations ?? [], statistics: row.statistics ?? [], searchQueries: row.search_queries ?? [], sourcesCount: row.sources_count ?? 0, reliabilityScore: row.reliability_score ?? 0, status: row.status, agentLogs: row.agent_logs ?? [], knowledgeGraph: row.knowledge_graph ?? undefined, infographicData: row.infographic_data ?? undefined, sourceImages: row.source_images ?? [], researchMode: row.research_mode ?? 'standard', createdAt: row.created_at, completedAt: row.completed_at } as any));
        }
      }
      if (podcasts.status === 'fulfilled' && podcasts.value.data) {
        // mapRowToPodcast is now a static import at top of file
        for (const row of podcasts.value.data) cacheJobs.push(autoCachePodcast(mapRowToPodcast(row)));
      }
      if (debates.status === 'fulfilled' && debates.value.data) {
        for (const row of debates.value.data) cacheJobs.push(autoCacheDebate(row as any));
      }
      if (papers.status === 'fulfilled' && papers.value.data) {
        for (const row of papers.value.data) cacheJobs.push(autoCacheAcademicPaper(row as any));
      }
      await Promise.allSettled(cacheJobs);
      await refresh();
      Alert.alert('Done', 'Recent content has been cached for offline use.');
    } catch { Alert.alert('Error', 'Some content could not be cached. Please try again.'); }
    finally { setIsCachingAll(false); }
  }, [isCachingAll, refresh]);

  const handleDeleteAll = () => {
    if (!stats || stats.totalItems === 0) return;
    Alert.alert('Clear All Cache', `Delete all ${stats.totalItems} cached items (${formatBytes(stats.totalBytes)}) from this device?\n\nYour data remains safely in the cloud.`,
      [{ text: 'Cancel', style: 'cancel' }, { text: 'Clear All Cache', style: 'destructive', onPress: deleteAll }]);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      {/* FIX 2: Plain View backdrop — no BlurView (prevents freeze on dismiss).
          Part 55.2: backdrop tint now derives from the active theme's
          background via getModalBackdrop() instead of a hardcoded indigo hex,
          so light themes get a correctly-tinted scrim instead of an
          incongruous dark-purple one. */}
      <View style={{ flex: 1, backgroundColor: getModalBackdrop(0.72), justifyContent: 'flex-end' }}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <View style={{ backgroundColor: COLORS.backgroundCard, borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: SHEET_MAX_H, borderTopWidth: 1, borderTopColor: COLORS.border, paddingBottom: insets.bottom }}>
          <View style={{ alignItems: 'center', paddingTop: SPACING.sm, marginBottom: SPACING.sm }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.border }} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.xl, paddingBottom: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
            <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10, marginRight: SPACING.sm }}>
              {/* Part 55.2: was hardcoded ['#29B6F6', '#0085D2'] (always blue) —
                  now follows the active theme's brand gradient. */}
              <LinearGradient colors={COLORS.gradientPrimary as [string, string]} style={{ width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Ionicons name="cloud-offline-outline" size={16} color="#FFF" />
              </LinearGradient>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.md, fontWeight: '800' }} numberOfLines={1}>Cache Manager</Text>
                <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }} numberOfLines={1}>{summary || 'Loading…'}</Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: COLORS.backgroundElevated, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border, flexShrink: 0 }}>
              <Ionicons name="close" size={17} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>
          <View style={{ flexDirection: 'row', paddingHorizontal: SPACING.xl, paddingVertical: SPACING.sm, gap: SPACING.sm }}>
            {(['overview', 'items'] as const).map(tab => (
              <TouchableOpacity key={tab} onPress={() => setActiveTab(tab)}
                style={{ flex: 1, paddingVertical: 8, borderRadius: RADIUS.md, backgroundColor: activeTab === tab ? COLORS.primary : COLORS.backgroundElevated, alignItems: 'center', borderWidth: 1, borderColor: activeTab === tab ? COLORS.primary : COLORS.border }}>
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
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: SPACING.xl, paddingBottom: SPACING.xl }} keyboardShouldPersistTaps="handled">
              {activeTab === 'overview' && (
                <>
                  {stats && (
                    <View style={{ alignItems: 'center', paddingVertical: SPACING.lg }}>
                      <UsageRing percent={stats.percentUsed} usedLabel={formatBytes(stats.totalBytes)} limitLabel={formatBytes(stats.limitBytes)} />
                      {(stats.podcastsWithAudio ?? 0) > 0 && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: SPACING.sm, backgroundColor: `${COLORS.success}12`, borderRadius: RADIUS.full, paddingHorizontal: 12, paddingVertical: 5, borderWidth: 1, borderColor: `${COLORS.success}25` }}>
                          <Ionicons name="headset-outline" size={12} color={COLORS.success} />
                          <Text style={{ color: COLORS.success, fontSize: FONTS.sizes.xs, fontWeight: '600' }}>{stats.podcastsWithAudio} podcast{stats.podcastsWithAudio === 1 ? '' : 's'} with audio · {formatBytes(stats.audioBytesTotal ?? 0)}</Text>
                        </View>
                      )}
                      {(stats.voiceDebatesWithAudio ?? 0) > 0 && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: SPACING.xs, backgroundColor: '#8B5CF615', borderRadius: RADIUS.full, paddingHorizontal: 12, paddingVertical: 5, borderWidth: 1, borderColor: '#8B5CF625' }}>
                          <Ionicons name="mic-circle-outline" size={12} color="#8B5CF6" />
                          <Text style={{ color: '#8B5CF6', fontSize: FONTS.sizes.xs, fontWeight: '600' }}>{stats.voiceDebatesWithAudio} voice debate{stats.voiceDebatesWithAudio === 1 ? '' : 's'} with audio · {formatBytes(stats.voiceDebateAudioBytes ?? 0)}</Text>
                        </View>
                      )}
                    </View>
                  )}
                  <SectionHeader title="By Content Type" />
                  {CONTENT_TYPES.map(type => (
                    <TypeRow key={type} type={type} count={stats?.byType[type]?.count ?? 0} bytes={stats?.byType[type]?.bytes ?? 0}
                      audioCount={type === 'podcast' ? (stats?.podcastsWithAudio ?? 0) : type === 'voice_debate' ? (stats?.voiceDebatesWithAudio ?? 0) : undefined}
                      audioBytesForType={type === 'podcast' ? (stats?.audioBytesTotal ?? 0) : type === 'voice_debate' ? (stats?.voiceDebateAudioBytes ?? 0) : undefined}
                      formatBytes={formatBytes} onDelete={() => deleteByType(type)} isDeleting={isDeleting} />
                  ))}
                  <ManualCacheSection onCacheAll={handleCacheAll} isCachingAll={isCachingAll} onSelectiveCache={onOpenSelectiveCache} />
                  <SectionHeader title="Storage Limit" />
                  {limitPresets.map(preset => {
                    const isSelected = settings?.limitBytes === preset.bytes;
                    return (
                      <TouchableOpacity key={preset.bytes} onPress={() => setLimit(preset.bytes)}
                        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: isSelected ? `${COLORS.primary}12` : COLORS.backgroundCard, borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.sm, borderWidth: 1.5, borderColor: isSelected ? COLORS.primary : COLORS.border }}>
                        <Text style={{ color: isSelected ? COLORS.primary : COLORS.textSecondary, fontSize: FONTS.sizes.base, fontWeight: isSelected ? '700' : '500' }}>{preset.display}</Text>
                        {isSelected && (<LinearGradient colors={COLORS.gradientPrimary as [string, string]} style={{ width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="checkmark" size={13} color="#FFF" /></LinearGradient>)}
                      </TouchableOpacity>
                    );
                  })}
                  <SectionHeader title="Settings" />
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.sm, borderWidth: 1, borderColor: COLORS.border }}>
                    <View style={{ flex: 1, minWidth: 0, marginRight: SPACING.md }}>
                      <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '600' }}>Auto-Cache Content</Text>
                      <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 2 }}>Automatically save new reports, podcasts, debates, papers and slides for offline use</Text>
                    </View>
                    <Switch value={settings?.autoCache ?? true} onValueChange={toggleAutoCache} trackColor={{ false: COLORS.border, true: `${COLORS.primary}80` }} thumbColor={settings?.autoCache ? COLORS.primary : COLORS.textMuted} />
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.sm, borderWidth: 1, borderColor: audioCacheOn ? `${COLORS.success}40` : COLORS.border }}>
                    <View style={{ flex: 1, minWidth: 0, marginRight: SPACING.md }}>
                      <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '600' }}>Cache Podcast Audio</Text>
                      <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, lineHeight: 16 }}>Download audio segments for full offline playback. Each podcast may use 5–25 MB.</Text>
                    </View>
                    <Switch value={audioCacheOn} onValueChange={handleToggleAudioCache} trackColor={{ false: COLORS.border, true: `${COLORS.success}80` }} thumbColor={audioCacheOn ? COLORS.success : COLORS.textMuted} />
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.sm, borderWidth: 1, borderColor: voiceDebateCacheOn ? '#8B5CF640' : COLORS.border }}>
                    <View style={{ flex: 1, minWidth: 0, marginRight: SPACING.md }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2, flexWrap: 'wrap' }}>
                        <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '600' }}>Cache Voice Debate Audio</Text>
                        <View style={{ backgroundColor: '#8B5CF615', borderRadius: RADIUS.full, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: '#8B5CF630' }}>
                          <Text style={{ color: '#8B5CF6', fontSize: 9, fontWeight: '700' }}>NEW</Text>
                        </View>
                      </View>
                      <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, lineHeight: 16 }}>Download voice debate audio for full offline playback. Each debate may use 10–80 MB. Large storage impact.</Text>
                    </View>
                    <Switch value={voiceDebateCacheOn} onValueChange={handleToggleVoiceDebateCache} trackColor={{ false: COLORS.border, true: '#8B5CF680' }} thumbColor={voiceDebateCacheOn ? '#8B5CF6' : COLORS.textMuted} />
                  </View>
                  <View style={{ backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.sm, borderWidth: 1, borderColor: COLORS.border }}>
                    <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '600', marginBottom: SPACING.sm }}>Cache Expiry</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      {EXPIRY_OPTIONS.map(opt => {
                        const isSelected = settings?.expiryDays === opt.days;
                        return (
                          <TouchableOpacity key={opt.days} onPress={async () => { await updateSettings({ expiryDays: opt.days }); await refresh(); }}
                            style={{ backgroundColor: isSelected ? `${COLORS.primary}15` : COLORS.backgroundElevated, borderRadius: RADIUS.full, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: isSelected ? COLORS.primary : COLORS.border }}>
                            <Text style={{ color: isSelected ? COLORS.primary : COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: isSelected ? '700' : '500' }}>{opt.label}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                  <TouchableOpacity onPress={handleDeleteAll} disabled={isDeleting || (stats?.totalItems ?? 0) === 0}
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: SPACING.sm, backgroundColor: `${COLORS.error}10`, borderRadius: RADIUS.lg, padding: SPACING.md, borderWidth: 1, borderColor: `${COLORS.error}25`, opacity: (stats?.totalItems ?? 0) === 0 ? 0.4 : 1 }}>
                    {isDeleting ? <ActivityIndicator size="small" color={COLORS.error} /> : <Ionicons name="trash-outline" size={16} color={COLORS.error} />}
                    <Text style={{ color: COLORS.error, fontSize: FONTS.sizes.sm, fontWeight: '700' }}>Clear All Cache</Text>
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
                        <TouchableOpacity key={f} onPress={() => setFilter(f)}
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: isActive ? cfg.color : COLORS.backgroundElevated, borderRadius: RADIUS.full, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: isActive ? cfg.color : COLORS.border }}>
                          <Text style={{ color: isActive ? '#FFF' : COLORS.textSecondary, fontSize: FONTS.sizes.xs, fontWeight: '600' }}>
                            {f === 'all' ? 'All' : TYPE_CONFIG[f as CachedContentType].label}
                          </Text>
                          {count > 0 && (
                            <View style={{ backgroundColor: isActive ? 'rgba(255,255,255,0.25)' : `${cfg.color}20`, borderRadius: RADIUS.full, paddingHorizontal: 5, paddingVertical: 1, minWidth: 18, alignItems: 'center' }}>
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
                      <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.sm, marginTop: SPACING.sm, textAlign: 'center' }}>No items cached for this type</Text>
                    </View>
                  ) : (
                    <>
                      <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginBottom: SPACING.sm }}>Tap the trash icon once to arm, again to confirm delete</Text>
                      {filteredEntries.map(entry => (
                        <ItemRow key={`${entry.type}-${entry.id}`} entry={entry} formatBytes={formatBytes} onDelete={() => deleteItem(entry.type, entry.id)} isDeleting={isDeleting} />
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