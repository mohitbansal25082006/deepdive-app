// src/components/offline/OfflineScreen.tsx
// Part 23 — FIXED: Export now uses offlineExportService which strips remote
// URLs and falls back gracefully so "Export Error" never appears offline.

import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Animated,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

// Cache utilities
import { getCacheIndex, getCachedItem, formatBytes } from '../../lib/cacheStorage';
import { getCacheStats } from '../../lib/cacheSettings';
import { useNetwork } from '../../context/NetworkContext';

// Rich viewers
import { OfflinePodcastViewer }       from './OfflinePodcastViewer';
import { OfflineDebateViewer }        from './OfflineDebateViewer';
import { OfflineAcademicPaperViewer } from './OfflineAcademicPaperViewer';
import { OfflinePresentationViewer }  from './OfflinePresentationViewer';

// ✅ NEW: offline-safe export service (no remote URL fetching)
import {
  exportReportOffline,
  exportPodcastOffline,
  exportDebateOffline,
  exportAcademicPaperOffline,
  exportPresentationOffline,
} from '../../services/offlineExportService';

import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';
import type { CacheEntry, CachedContentType, CacheFilterType } from '../../types/cache';
import type {
  ResearchReport, Podcast, DebateSession, AcademicPaper, GeneratedPresentation,
} from '../../types';

const { width: SCREEN_W } = Dimensions.get('window');

// ─── Filter config ────────────────────────────────────────────────────────────

const FILTERS: { id: CacheFilterType; label: string; icon: string; color: string }[] = [
  { id: 'all',            label: 'All',       icon: 'layers-outline',           color: COLORS.primary   },
  { id: 'report',         label: 'Reports',   icon: 'document-text-outline',    color: '#6C63FF'        },
  { id: 'podcast',        label: 'Podcasts',  icon: 'radio-outline',            color: '#FF6584'        },
  { id: 'debate',         label: 'Debates',   icon: 'chatbox-ellipses-outline', color: '#F97316'        },
  { id: 'academic_paper', label: 'Papers',    icon: 'school-outline',           color: '#43E97B'        },
  { id: 'presentation',   label: 'Slides',    icon: 'easel-outline',            color: '#29B6F6'        },
];

const TYPE_LABEL: Record<CachedContentType, string> = {
  report: 'Research Report', podcast: 'Podcast Episode',
  debate: 'AI Debate', academic_paper: 'Academic Paper', presentation: 'Presentation',
};

// ─── Time helpers ─────────────────────────────────────────────────────────────

function formatRelativeTime(ms: number): string {
  const diff  = Date.now() - ms;
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins < 1)   return 'Just now';
  if (mins < 60)  return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7)   return `${days}d ago`;
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatExpiresIn(ms: number): string {
  const diff = ms - Date.now();
  if (diff <= 0) return 'Expired';
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Expires today';
  if (days === 1) return 'Expires tomorrow';
  return `Expires in ${days}d`;
}

// ─── Offline-safe export dispatcher ──────────────────────────────────────────
// Uses offlineExportService which strips remote URLs before passing to
// expo-print, preventing WebView network errors in airplane mode.

async function exportOffline(entry: CacheEntry, data: unknown): Promise<void> {
  switch (entry.type) {
    case 'report':
      await exportReportOffline(data as ResearchReport);
      return;
    case 'podcast':
      await exportPodcastOffline(data as Podcast);
      return;
    case 'debate':
      await exportDebateOffline(data as DebateSession);
      return;
    case 'academic_paper':
      await exportAcademicPaperOffline(data as AcademicPaper);
      return;
    case 'presentation':
      await exportPresentationOffline(data as GeneratedPresentation);
      return;
    default:
      throw new Error(`Unknown content type: ${entry.type}`);
  }
}

// ─── Inline Report Viewer ─────────────────────────────────────────────────────

function ReportViewer({ report, onClose, onExport, exporting }: {
  report: ResearchReport; onClose: () => void; onExport: () => void; exporting: boolean;
}) {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<'report' | 'findings' | 'sources'>('report');

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      {/* Header */}
      <View style={{ paddingTop: insets.top + SPACING.sm, paddingHorizontal: SPACING.lg, paddingBottom: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.border, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <TouchableOpacity onPress={onClose} style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: COLORS.backgroundElevated, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border }}>
          <Ionicons name="arrow-back" size={18} color={COLORS.textSecondary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '700' }} numberOfLines={1}>{report.title}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <View style={{ backgroundColor: `${COLORS.info}20`, borderRadius: RADIUS.sm, paddingHorizontal: 6, paddingVertical: 1 }}>
              <Text style={{ color: COLORS.info, fontSize: 9, fontWeight: '700' }}>OFFLINE</Text>
            </View>
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>{report.sourcesCount} sources · {report.reliabilityScore}/10</Text>
          </View>
        </View>
        <TouchableOpacity onPress={onExport} disabled={exporting}
          style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: `${COLORS.primary}18`, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: `${COLORS.primary}30` }}>
          {exporting ? <ActivityIndicator size="small" color={COLORS.primary} /> : <Ionicons name="download-outline" size={17} color={COLORS.primary} />}
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={{ flexDirection: 'row', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm, gap: SPACING.sm }}>
        {(['report', 'findings', 'sources'] as const).map(tab => (
          <TouchableOpacity key={tab} onPress={() => setActiveTab(tab)}
            style={{ flex: 1, paddingVertical: 8, borderRadius: RADIUS.md, backgroundColor: activeTab === tab ? COLORS.primary : COLORS.backgroundElevated, alignItems: 'center' }}>
            <Text style={{ color: activeTab === tab ? '#FFF' : COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600' }}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Content */}
      <FlatList
        contentContainerStyle={{ padding: SPACING.lg, paddingBottom: insets.bottom + 80 }}
        showsVerticalScrollIndicator={false}
        data={[{ key: 'content' }]}
        keyExtractor={i => i.key}
        renderItem={() => (
          activeTab === 'report' ? (
            <View>
              <LinearGradient colors={['#1A1A35', '#12122A']} style={{ borderRadius: RADIUS.xl, padding: SPACING.lg, marginBottom: SPACING.lg, borderWidth: 1, borderColor: `${COLORS.primary}25` }}>
                <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.xs, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: SPACING.sm }}>Executive Summary</Text>
                <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, lineHeight: 22 }}>{report.executiveSummary}</Text>
              </LinearGradient>
              {report.sections.map((section, i) => (
                <View key={section.id ?? i} style={{ backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.sm, borderWidth: 1, borderColor: COLORS.border, borderLeftWidth: 3, borderLeftColor: COLORS.primary }}>
                  <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '700', marginBottom: SPACING.sm }}>{section.title}</Text>
                  <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, lineHeight: 22 }}>{section.content}</Text>
                  {section.bullets?.map((b, bi) => (
                    <View key={bi} style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                      <Text style={{ color: COLORS.primary }}>•</Text>
                      <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, flex: 1, lineHeight: 20 }}>{b}</Text>
                    </View>
                  ))}
                </View>
              ))}
            </View>
          ) : activeTab === 'findings' ? (
            <View>
              {report.keyFindings.map((f, i) => (
                <View key={i} style={{ backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.sm, flexDirection: 'row', alignItems: 'flex-start', borderWidth: 1, borderColor: COLORS.border, borderLeftWidth: 3, borderLeftColor: COLORS.primary }}>
                  <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: `${COLORS.primary}20`, alignItems: 'center', justifyContent: 'center', marginRight: SPACING.sm, flexShrink: 0 }}>
                    <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.xs, fontWeight: '700' }}>{i + 1}</Text>
                  </View>
                  <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, lineHeight: 20, flex: 1 }}>{f}</Text>
                </View>
              ))}
              {report.futurePredictions.map((p, i) => (
                <View key={i} style={{ backgroundColor: `${COLORS.warning}10`, borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.sm, flexDirection: 'row', alignItems: 'flex-start', borderWidth: 1, borderColor: `${COLORS.warning}25` }}>
                  <Ionicons name="telescope-outline" size={16} color={COLORS.warning} style={{ marginRight: SPACING.sm, marginTop: 2, flexShrink: 0 }} />
                  <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, lineHeight: 20, flex: 1 }}>{p}</Text>
                </View>
              ))}
            </View>
          ) : (
            <View>
              {report.citations.map((c, i) => (
                <View key={c.id ?? i} style={{ backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.sm, borderWidth: 1, borderColor: COLORS.border }}>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 4 }}>
                    <View style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: `${COLORS.primary}20`, alignItems: 'center', justifyContent: 'center', marginRight: 8, flexShrink: 0 }}>
                      <Text style={{ color: COLORS.primary, fontSize: 10, fontWeight: '700' }}>{i + 1}</Text>
                    </View>
                    <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '600', flex: 1, lineHeight: 20 }}>{c.title}</Text>
                  </View>
                  <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.xs, marginBottom: 4 }}>{c.source}{c.date ? ` · ${c.date}` : ''}</Text>
                  <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, lineHeight: 16 }}>{c.snippet}</Text>
                </View>
              ))}
            </View>
          )
        )}
      />
    </View>
  );
}

// ─── Item card ────────────────────────────────────────────────────────────────

function CacheItemCard({ entry, onPress, index }: {
  entry: CacheEntry; onPress: (e: CacheEntry) => void; index: number;
}) {
  const color = entry.color ?? COLORS.primary;
  const anim  = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: 1, duration: 280, delay: index * 35, useNativeDriver: true }).start();
  }, []);

  return (
    <Animated.View style={{ opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] }}>
      <TouchableOpacity onPress={() => onPress(entry)} activeOpacity={0.78}
        style={{ backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.xl, marginHorizontal: SPACING.lg, marginBottom: SPACING.sm, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden' }}>
        <View style={{ height: 3, backgroundColor: color }} />
        <View style={{ padding: SPACING.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
            <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: `${color}18`, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: `${color}30`, flexShrink: 0 }}>
              <Ionicons name={entry.icon as any ?? 'document-outline'} size={18} color={color} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '700', lineHeight: 20, marginBottom: 2 }} numberOfLines={2}>{entry.title}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{ backgroundColor: `${color}18`, borderRadius: RADIUS.full, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: `${color}30` }}>
                  <Text style={{ color, fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 }}>{TYPE_LABEL[entry.type]}</Text>
                </View>
                {entry.type === 'podcast' && entry.hasAudio && (
                  <View style={{ backgroundColor: `${COLORS.success}15`, borderRadius: RADIUS.full, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: `${COLORS.success}30`, flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                    <Ionicons name="headset-outline" size={9} color={COLORS.success} />
                    <Text style={{ color: COLORS.success, fontSize: 9, fontWeight: '700' }}>AUDIO</Text>
                  </View>
                )}
              </View>
            </View>
            <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} style={{ marginTop: 2, flexShrink: 0 }} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="time-outline" size={11} color={COLORS.textMuted} />
              <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>{formatRelativeTime(entry.cachedAt)}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>{formatBytes(entry.sizeBytes)}</Text>
              <Text style={{ color: Date.now() > entry.expiresAt - 86400000 * 3 ? COLORS.warning : COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
                {formatExpiresIn(entry.expiresAt)}
              </Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ filter, hasSearch }: { filter: CacheFilterType; hasSearch: boolean }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACING.xl, paddingBottom: 80 }}>
      <View style={{ width: 80, height: 80, borderRadius: 24, backgroundColor: `${COLORS.primary}12`, alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.lg, borderWidth: 1, borderColor: `${COLORS.primary}25` }}>
        <Ionicons name="cloud-offline-outline" size={36} color={COLORS.primary} />
      </View>
      <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.lg, fontWeight: '800', textAlign: 'center', marginBottom: SPACING.sm }}>
        {hasSearch ? 'No results found' : 'Nothing cached yet'}
      </Text>
      <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.sm, textAlign: 'center', lineHeight: 20 }}>
        {hasSearch
          ? 'Try a different search term or filter'
          : filter === 'all'
            ? 'Your research reports, podcasts, debates, papers and slides appear here when cached for offline use.'
            : `No ${filter.replace('_', ' ')} items cached on this device.`}
      </Text>
    </View>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

interface OfflineScreenProps {
  onRetry?: () => void;
}

export function OfflineScreen({ onRetry }: OfflineScreenProps) {
  const insets = useSafeAreaInsets();
  const { recheckNetwork, isConnecting } = useNetwork();

  const [entries,    setEntries]    = useState<CacheEntry[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter,     setFilter]     = useState<CacheFilterType>('all');
  const [search,     setSearch]     = useState('');
  const [totalBytes, setTotalBytes] = useState(0);
  const [totalItems, setTotalItems] = useState(0);

  // Viewer state
  const [viewerEntry,   setViewerEntry]   = useState<CacheEntry | null>(null);
  const [viewerData,    setViewerData]    = useState<unknown>(null);
  const [viewerLoading, setViewerLoading] = useState(false);
  const [exporting,     setExporting]     = useState(false);

  // Offline dot pulse
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.2, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1.0, duration: 900, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const loadEntries = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const [idx, stats] = await Promise.all([getCacheIndex(), getCacheStats()]);
      setEntries(idx);
      setTotalBytes(stats.totalBytes);
      setTotalItems(stats.totalItems);
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { loadEntries(); }, [loadEntries]);

  const displayEntries = entries.filter(e => {
    const matchType   = filter === 'all' || e.type === filter;
    const s           = search.toLowerCase().trim();
    const matchSearch = !s || e.title.toLowerCase().includes(s) || (e.subtitle ?? '').toLowerCase().includes(s);
    return matchType && matchSearch;
  });

  const countByType = entries.reduce((acc, e) => { acc[e.type] = (acc[e.type] ?? 0) + 1; return acc; }, {} as Record<string, number>);

  // ── Open item ────────────────────────────────────────────────────────────────

  const handleOpenItem = useCallback(async (entry: CacheEntry) => {
    setViewerLoading(true);
    try {
      const data = await getCachedItem(entry.type, entry.id);
      if (!data) {
        Alert.alert('Cache Miss', 'This item is no longer in the cache. It may have expired or been deleted.',
          [{ text: 'OK', onPress: () => loadEntries(true) }]);
        return;
      }
      setViewerEntry(entry);
      setViewerData(data);
    } catch {
      Alert.alert('Error', 'Could not open this cached item.');
    } finally {
      setViewerLoading(false);
    }
  }, [loadEntries]);

  // ── Export — uses offlineExportService (no remote URLs) ──────────────────────

  const handleExport = useCallback(async () => {
    if (!viewerEntry || !viewerData || exporting) return;
    setExporting(true);
    try {
      await exportOffline(viewerEntry, viewerData);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      Alert.alert(
        'Export Failed',
        `Could not export this ${TYPE_LABEL[viewerEntry.type].toLowerCase()}.\n\n${msg}`,
        [{ text: 'OK' }]
      );
    } finally {
      setExporting(false);
    }
  }, [viewerEntry, viewerData, exporting]);

  const closeViewer = useCallback(() => {
    setViewerEntry(null);
    setViewerData(null);
  }, []);

  // ── Viewer routing ────────────────────────────────────────────────────────────

  if (viewerEntry && viewerData) {
    switch (viewerEntry.type) {
      case 'report':
        return (
          <LinearGradient colors={[COLORS.background, COLORS.backgroundCard]} style={{ flex: 1 }}>
            <ReportViewer
              report={viewerData as ResearchReport}
              onClose={closeViewer}
              onExport={handleExport}
              exporting={exporting}
            />
          </LinearGradient>
        );
      case 'podcast':
        return (
          <LinearGradient colors={[COLORS.background, COLORS.backgroundCard]} style={{ flex: 1 }}>
            <OfflinePodcastViewer
              podcast={viewerData as Podcast}
              entry={viewerEntry}
              onClose={closeViewer}
              onExport={handleExport}
              exporting={exporting}
            />
          </LinearGradient>
        );
      case 'debate':
        return (
          <LinearGradient colors={[COLORS.background, COLORS.backgroundCard]} style={{ flex: 1 }}>
            <OfflineDebateViewer
              session={viewerData as DebateSession}
              entry={viewerEntry}
              onClose={closeViewer}
              onExport={handleExport}
              exporting={exporting}
            />
          </LinearGradient>
        );
      case 'academic_paper':
        return (
          <LinearGradient colors={[COLORS.background, COLORS.backgroundCard]} style={{ flex: 1 }}>
            <OfflineAcademicPaperViewer
              paper={viewerData as AcademicPaper}
              entry={viewerEntry}
              onClose={closeViewer}
              onExport={handleExport}
              exporting={exporting}
            />
          </LinearGradient>
        );
      case 'presentation':
        return (
          <OfflinePresentationViewer
            presentation={viewerData as GeneratedPresentation}
            entry={viewerEntry}
            onClose={closeViewer}
            onExport={handleExport}
            exporting={exporting}
          />
        );
    }
  }

  // ── List view ─────────────────────────────────────────────────────────────────

  return (
    <LinearGradient colors={[COLORS.background, COLORS.backgroundCard]} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>

        {viewerLoading && (
          <View style={{ position: 'absolute', inset: 0, zIndex: 99, backgroundColor: 'rgba(10,10,26,0.8)', alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={{ color: COLORS.textMuted, marginTop: SPACING.sm, fontSize: FONTS.sizes.sm }}>Loading from cache…</Text>
          </View>
        )}

        {/* Header */}
        <View style={{ paddingHorizontal: SPACING.lg, paddingTop: SPACING.sm, paddingBottom: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Animated.View style={{ transform: [{ scale: pulse }] }}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.error }} />
              </Animated.View>
              <View>
                <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.md, fontWeight: '800' }}>You're Offline</Text>
                <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
                  {totalItems > 0 ? `${totalItems} cached items · ${formatBytes(totalBytes)}` : 'No cached content available'}
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={async () => { await recheckNetwork(); onRetry?.(); }} disabled={isConnecting}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: `${COLORS.primary}18`, borderRadius: RADIUS.full, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: `${COLORS.primary}35`, opacity: isConnecting ? 0.6 : 1 }}>
              {isConnecting ? <ActivityIndicator size="small" color={COLORS.primary} /> : <Ionicons name="refresh-outline" size={14} color={COLORS.primary} />}
              <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.xs, fontWeight: '700' }}>{isConnecting ? 'Checking…' : 'Retry'}</Text>
            </TouchableOpacity>
          </View>

          {/* Workspace notice */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: `${COLORS.warning}10`, borderRadius: RADIUS.lg, paddingHorizontal: SPACING.md, paddingVertical: 8, marginBottom: SPACING.sm, borderWidth: 1, borderColor: `${COLORS.warning}25` }}>
            <Ionicons name="people-outline" size={14} color={COLORS.warning} />
            <Text style={{ color: COLORS.warning, fontSize: FONTS.sizes.xs, flex: 1 }}>Workspace & Teams features require an internet connection</Text>
          </View>

          {/* Search */}
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.backgroundElevated, borderRadius: RADIUS.lg, paddingHorizontal: SPACING.md, borderWidth: 1, borderColor: COLORS.border, height: 40 }}>
            <Ionicons name="search-outline" size={16} color={COLORS.textMuted} style={{ marginRight: 8 }} />
            <TextInput value={search} onChangeText={setSearch} placeholder="Search cached content…" placeholderTextColor={COLORS.textMuted} style={{ flex: 1, color: COLORS.textPrimary, fontSize: FONTS.sizes.sm }} />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close-circle" size={16} color={COLORS.textMuted} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Filter chips */}
        <View style={{ paddingVertical: SPACING.sm }}>
          <FlatList horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: SPACING.lg, gap: 8 }}
            data={FILTERS} keyExtractor={f => f.id}
            renderItem={({ item: f }) => {
              const isActive = filter === f.id;
              const count    = f.id === 'all' ? totalItems : (countByType[f.id] ?? 0);
              return (
                <TouchableOpacity onPress={() => setFilter(f.id)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: isActive ? f.color : COLORS.backgroundCard, borderRadius: RADIUS.full, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: isActive ? f.color : COLORS.border }}>
                  <Ionicons name={f.icon as any} size={13} color={isActive ? '#FFF' : f.color} />
                  <Text style={{ color: isActive ? '#FFF' : COLORS.textSecondary, fontSize: FONTS.sizes.xs, fontWeight: '700' }}>{f.label}</Text>
                  {count > 0 && (
                    <View style={{ backgroundColor: isActive ? 'rgba(255,255,255,0.25)' : `${f.color}22`, borderRadius: RADIUS.full, paddingHorizontal: 5, paddingVertical: 1, minWidth: 18, alignItems: 'center' }}>
                      <Text style={{ color: isActive ? '#FFF' : f.color, fontSize: 9, fontWeight: '800' }}>{count}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            }}
          />
        </View>

        {/* Content list */}
        {loading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={{ color: COLORS.textMuted, marginTop: SPACING.sm, fontSize: FONTS.sizes.sm }}>Loading cached content…</Text>
          </View>
        ) : (
          <FlatList
            data={displayEntries}
            keyExtractor={e => `${e.type}-${e.id}`}
            contentContainerStyle={{ paddingTop: SPACING.sm, paddingBottom: insets.bottom + 80, flexGrow: 1 }}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadEntries(true)} tintColor={COLORS.primary} />}
            ListEmptyComponent={<EmptyState filter={filter} hasSearch={search.trim().length > 0} />}
            renderItem={({ item, index }) => (
              <CacheItemCard entry={item} onPress={handleOpenItem} index={index} />
            )}
          />
        )}

        {/* Bottom bar */}
        <View style={{ position: 'absolute', bottom: insets.bottom, left: 0, right: 0, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm, borderTopWidth: 1, borderTopColor: COLORS.border, backgroundColor: 'rgba(10,10,26,0.96)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <Ionicons name="cloud-offline-outline" size={13} color={COLORS.textMuted} />
          <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, textAlign: 'center' }}>
            DeepDive AI · Offline Mode · {formatBytes(totalBytes)} cached
          </Text>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}