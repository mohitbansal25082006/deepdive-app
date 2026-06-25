// src/components/offline/OfflineScreen.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Offline Screen — Beautiful, modern offline content browser
// Part 45 — Added 'voice_debate' filter chip + OfflineVoiceDebateViewer routing
// Part 55 — FULL THEME SYSTEM with redesigned UI
// ─────────────────────────────────────────────────────────────────────────────

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
  Modal,
  Pressable,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

// Theme
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS, getModalBackdrop } from '../../constants/theme';
import { useTheme } from '../../context/ThemeContext';

// Cache utilities
import { getCacheIndex, getCachedItem, formatBytes } from '../../lib/cacheStorage';
import { getCacheStats } from '../../lib/cacheSettings';
import { useNetwork } from '../../context/NetworkContext';

// Offline Report Viewer
import { OfflineReportViewer } from './offlinereportviewer';

// Rich viewers
import { OfflinePodcastViewer } from './OfflinePodcastViewer';
import { OfflineDebateViewer } from './OfflineDebateViewer';
import { OfflineAcademicPaperViewer } from './OfflineAcademicPaperViewer';
import { OfflinePresentationViewer } from './OfflinePresentationViewer';
import { OfflineVoiceDebateViewer } from './OfflineVoiceDebateViewer';

// Offline-safe export service
import {
  exportReportOffline,
  exportPodcastOffline,
  exportDebateOffline,
  exportAcademicPaperOffline,
  exportPresentationOffline,
} from '../../services/offlineExportService';
import { exportVoiceDebateAsPDF } from '../../services/voiceDebateExport';

// Types
import type { CacheEntry, CachedContentType, CacheFilterType } from '../../types/cache';
import type {
  ResearchReport,
  Podcast,
  DebateSession,
  AcademicPaper,
  GeneratedPresentation,
} from '../../types';
import type { VoiceDebate } from '../../types/voiceDebate';

const { width: SCREEN_W } = Dimensions.get('window');

// ─── Filter config ────────────────────────────────────────────────────────────

const FILTERS: { id: CacheFilterType; label: string; icon: string; color: string; gradient: readonly [string, string] }[] = [
  { id: 'all', label: 'All', icon: 'apps-outline', color: COLORS.primary, gradient: COLORS.gradientPrimary },
  { id: 'report', label: 'Reports', icon: 'document-text-outline', color: '#6C63FF', gradient: ['#6C63FF', '#8B5CF6'] as const },
  { id: 'podcast', label: 'Podcasts', icon: 'radio-outline', color: '#FF6584', gradient: ['#FF6584', '#FF8E53'] as const },
  { id: 'debate', label: 'Debates', icon: 'chatbox-ellipses-outline', color: '#F97316', gradient: ['#F97316', '#FB923C'] as const },
  { id: 'academic_paper', label: 'Papers', icon: 'school-outline', color: '#43E97B', gradient: ['#43E97B', '#38F9D7'] as const },
  { id: 'presentation', label: 'Slides', icon: 'easel-outline', color: '#29B6F6', gradient: ['#29B6F6', '#4DD0E1'] as const },
  { id: 'voice_debate', label: 'Voice Debates', icon: 'mic-circle-outline', color: '#8B5CF6', gradient: ['#8B5CF6', '#A78BFA'] as const },
];

const TYPE_LABEL: Record<CachedContentType, string> = {
  report: 'Research Report',
  podcast: 'Podcast Episode',
  debate: 'AI Debate',
  academic_paper: 'Academic Paper',
  presentation: 'Presentation',
  voice_debate: 'Voice Debate',
};

const TYPE_ICON: Record<CachedContentType, string> = {
  report: 'document-text',
  podcast: 'radio',
  debate: 'chatbox-ellipses',
  academic_paper: 'school',
  presentation: 'easel',
  voice_debate: 'mic-circle',
};

const TYPE_COLOR: Record<CachedContentType, string> = {
  report: '#6C63FF',
  podcast: '#FF6584',
  debate: '#F97316',
  academic_paper: '#43E97B',
  presentation: '#29B6F6',
  voice_debate: '#8B5CF6',
};

// ─── Time helpers ─────────────────────────────────────────────────────────────

function formatRelativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
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
    case 'voice_debate':
      await exportVoiceDebateAsPDF(data as VoiceDebate);
      return;
    default:
      throw new Error(`Unknown content type: ${entry.type}`);
  }
}

// ─── Open item — with voice_debate fallback ──────────────────────────────────

async function loadCachedItem(entry: CacheEntry): Promise<unknown | null> {
  const data = await getCachedItem(entry.type, entry.id);
  if (data) return data;

  if (entry.type === 'voice_debate') {
    try {
      const { getCachedVoiceDebateJson } = await import('../../lib/voiceDebateCache');
      const vd = await getCachedVoiceDebateJson(entry.id);
      if (vd) return vd;
    } catch {}
  }

  return null;
}

// ─── Filter Chip ─────────────────────────────────────────────────────────────

function FilterChip({
  filter,
  isActive,
  count,
  onPress,
}: {
  filter: typeof FILTERS[0];
  isActive: boolean;
  count: number;
  onPress: () => void;
}) {
  const { isLight } = useTheme();

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: RADIUS.full,
        backgroundColor: isActive ? filter.color : (isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.06)'),
        borderWidth: 1.5,
        borderColor: isActive ? filter.color : (isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)'),
        shadowColor: isActive ? filter.color : 'transparent',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: isActive ? 0.3 : 0,
        shadowRadius: 8,
        elevation: isActive ? 4 : 0,
      }}
    >
      <Ionicons 
        name={filter.icon as any} 
        size={14} 
        color={isActive ? '#FFF' : filter.color} 
      />
      <Text
        style={{
          color: isActive ? '#FFF' : COLORS.textSecondary,
          fontSize: FONTS.sizes.xs,
          fontWeight: isActive ? '700' : '600',
        }}
      >
        {filter.label}
      </Text>
      {count > 0 && (
        <View
          style={{
            backgroundColor: isActive ? 'rgba(255,255,255,0.25)' : `${filter.color}22`,
            borderRadius: RADIUS.full,
            paddingHorizontal: 6,
            paddingVertical: 1,
            minWidth: 18,
            alignItems: 'center',
          }}
        >
          <Text
            style={{
              color: isActive ? '#FFF' : filter.color,
              fontSize: 9,
              fontWeight: '800',
            }}
          >
            {count}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ─── Cache Item Card ─────────────────────────────────────────────────────────

function CacheItemCard({
  entry,
  onPress,
  index,
}: {
  entry: CacheEntry;
  onPress: (e: CacheEntry) => void;
  index: number;
}) {
  const { isLight } = useTheme();
  const color = entry.color ?? TYPE_COLOR[entry.type] ?? COLORS.primary;
  const icon = entry.icon ?? TYPE_ICON[entry.type] ?? 'document-outline';
  const anim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: 400,
      delay: index * 30,
      useNativeDriver: true,
    }).start();
  }, []);

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.97,
      useNativeDriver: true,
      friction: 8,
      tension: 40,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      friction: 8,
      tension: 40,
    }).start();
  };

  const cardBg = isLight ? '#FFFFFF' : COLORS.backgroundCard;
  const isExpiring = Date.now() > entry.expiresAt - 86400000 * 2;

  return (
    <Animated.View
      style={{
        opacity: anim,
        transform: [
          {
            translateY: anim.interpolate({
              inputRange: [0, 1],
              outputRange: [20, 0],
            }),
          },
          { scale: scaleAnim },
        ],
        marginHorizontal: SPACING.lg,
        marginBottom: SPACING.md,
      }}
    >
      <TouchableOpacity
        onPress={() => onPress(entry)}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={1}
        style={{
          borderRadius: RADIUS.xl,
          overflow: 'hidden',
          backgroundColor: cardBg,
          borderWidth: 1,
          borderColor: isExpiring ? `${COLORS.warning}40` : COLORS.border,
          ...SHADOWS.small,
        }}
      >
        {/* Gradient accent bar */}
        <LinearGradient
          colors={[color, `${color}88`] as readonly [string, string]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{
            height: 4,
            width: '100%',
          }}
        />

        <View style={{ padding: SPACING.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
            {/* Icon with gradient background */}
            <View
              style={{
                width: 48,
                height: 48,
                borderRadius: 14,
                backgroundColor: `${color}15`,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 1,
                borderColor: `${color}25`,
                flexShrink: 0,
              }}
            >
              <LinearGradient
                colors={[color, `${color}BB`] as readonly [string, string]}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name={icon as any} size={18} color="#FFF" />
              </LinearGradient>
            </View>

            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                style={{
                  color: COLORS.textPrimary,
                  fontSize: FONTS.sizes.base,
                  fontWeight: '700',
                  lineHeight: 20,
                  marginBottom: 4,
                }}
                numberOfLines={2}
              >
                {entry.title}
              </Text>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <View
                  style={{
                    backgroundColor: `${color}15`,
                    borderRadius: RADIUS.full,
                    paddingHorizontal: 8,
                    paddingVertical: 2,
                    borderWidth: 1,
                    borderColor: `${color}25`,
                  }}
                >
                  <Text
                    style={{
                      color,
                      fontSize: 9,
                      fontWeight: '700',
                      textTransform: 'uppercase',
                      letterSpacing: 0.3,
                    }}
                  >
                    {TYPE_LABEL[entry.type]}
                  </Text>
                </View>

                {(entry.type === 'podcast' || entry.type === 'voice_debate') && entry.hasAudio && (
                  <View
                    style={{
                      backgroundColor: `${COLORS.success}15`,
                      borderRadius: RADIUS.full,
                      paddingHorizontal: 7,
                      paddingVertical: 2,
                      borderWidth: 1,
                      borderColor: `${COLORS.success}25`,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 3,
                    }}
                  >
                    <Ionicons name="headset-outline" size={9} color={COLORS.success} />
                    <Text style={{ color: COLORS.success, fontSize: 8, fontWeight: '700' }}>AUDIO</Text>
                  </View>
                )}

                {isExpiring && (
                  <View
                    style={{
                      backgroundColor: `${COLORS.warning}15`,
                      borderRadius: RADIUS.full,
                      paddingHorizontal: 7,
                      paddingVertical: 2,
                      borderWidth: 1,
                      borderColor: `${COLORS.warning}25`,
                    }}
                  >
                    <Text style={{ color: COLORS.warning, fontSize: 8, fontWeight: '700' }}>EXPIRING</Text>
                  </View>
                )}
              </View>
            </View>

            <Ionicons
              name="chevron-forward"
              size={18}
              color={COLORS.textMuted}
              style={{ marginTop: 4, flexShrink: 0 }}
            />
          </View>

          {/* Bottom row with metadata */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: SPACING.sm,
              paddingTop: SPACING.sm,
              borderTopWidth: 1,
              borderTopColor: COLORS.border,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Ionicons name="time-outline" size={12} color={COLORS.textMuted} />
                <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
                  {formatRelativeTime(entry.cachedAt)}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Ionicons name="hardware-chip-outline" size={12} color={COLORS.textMuted} />
                <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
                  {formatBytes(entry.sizeBytes)}
                </Text>
              </View>
            </View>

            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                paddingHorizontal: 8,
                paddingVertical: 3,
                borderRadius: RADIUS.full,
                backgroundColor: isExpiring ? `${COLORS.warning}12` : `${COLORS.textMuted}08`,
              }}
            >
              <View
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: isExpiring ? COLORS.warning : COLORS.textMuted,
                }}
              />
              <Text
                style={{
                  color: isExpiring ? COLORS.warning : COLORS.textMuted,
                  fontSize: FONTS.sizes.xs,
                  fontWeight: isExpiring ? '600' : '400',
                }}
              >
                {formatExpiresIn(entry.expiresAt)}
              </Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ filter, hasSearch }: { filter: CacheFilterType; hasSearch: boolean }) {
  const { isLight } = useTheme();

  const getIcon = () => {
    if (hasSearch) return 'search-outline';
    if (filter !== 'all') return 'folder-open-outline';
    return 'cloud-offline-outline';
  };

  const getTitle = () => {
    if (hasSearch) return 'No Results Found';
    if (filter !== 'all') return `No ${TYPE_LABEL[filter as CachedContentType] || filter} Cached`;
    return 'Nothing Cached Yet';
  };

  const getDescription = () => {
    if (hasSearch) return 'Try adjusting your search terms or filters';
    if (filter !== 'all') return `Download ${TYPE_LABEL[filter as CachedContentType] || filter} items while online to view them here`;
    return 'Your research reports, podcasts, debates, papers, slides and voice debates appear here when cached for offline use.';
  };

  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: SPACING.xl,
        paddingBottom: 80,
      }}
    >
      <View
        style={{
          width: 100,
          height: 100,
          borderRadius: 28,
          backgroundColor: `${COLORS.primary}10`,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: SPACING.lg,
          borderWidth: 1,
          borderColor: `${COLORS.primary}15`,
        }}
      >
        <Ionicons name={getIcon()} size={44} color={COLORS.primary} />
      </View>

      <Text
        style={{
          color: COLORS.textPrimary,
          fontSize: FONTS.sizes.xl,
          fontWeight: '800',
          textAlign: 'center',
          marginBottom: SPACING.sm,
        }}
      >
        {getTitle()}
      </Text>

      <Text
        style={{
          color: COLORS.textMuted,
          fontSize: FONTS.sizes.sm,
          textAlign: 'center',
          lineHeight: 22,
          maxWidth: SCREEN_W * 0.8,
        }}
      >
        {getDescription()}
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
  const { isLight } = useTheme();
  const { recheckNetwork, isConnecting } = useNetwork();

  const [entries, setEntries] = useState<CacheEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<CacheFilterType>('all');
  const [search, setSearch] = useState('');
  const [totalBytes, setTotalBytes] = useState(0);
  const [totalItems, setTotalItems] = useState(0);

  // Viewer state
  const [viewerEntry, setViewerEntry] = useState<CacheEntry | null>(null);
  const [viewerData, setViewerData] = useState<unknown>(null);
  const [viewerLoading, setViewerLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

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

  const loadEntries = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      else setRefreshing(true);
      try {
        const [idx, stats] = await Promise.all([getCacheIndex(), getCacheStats()]);
        setEntries(idx);
        setTotalBytes(stats.totalBytes);
        setTotalItems(stats.totalItems);
      } catch {}
      finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    []
  );

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  const displayEntries = entries.filter(e => {
    const matchType = filter === 'all' || e.type === filter;
    const s = search.toLowerCase().trim();
    const matchSearch =
      !s || e.title.toLowerCase().includes(s) || (e.subtitle ?? '').toLowerCase().includes(s);
    return matchType && matchSearch;
  });

  const countByType = entries.reduce(
    (acc, e) => {
      acc[e.type] = (acc[e.type] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  // ── Open item ────────────────────────────────────────────────────────────────

  const handleOpenItem = useCallback(
    async (entry: CacheEntry) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setViewerLoading(true);
      try {
        const data = await loadCachedItem(entry);
        if (!data) {
          Alert.alert(
            'Cache Miss',
            'This item is no longer in the cache. It may have expired or been deleted.',
            [{ text: 'OK', onPress: () => loadEntries(true) }]
          );
          return;
        }
        setViewerEntry(entry);
        setViewerData(data);
      } catch {
        Alert.alert('Error', 'Could not open this cached item.');
      } finally {
        setViewerLoading(false);
      }
    },
    [loadEntries]
  );

  // ── Export ────────────────────────────────────────────────────────────────────

  const handleExport = useCallback(async () => {
    if (!viewerEntry || !viewerData || exporting) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setExporting(true);
    try {
      await exportOffline(viewerEntry, viewerData);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      Alert.alert(
        'Export Failed',
        `Could not export this ${TYPE_LABEL[viewerEntry.type]?.toLowerCase() ?? 'item'}.\n\n${msg}`,
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
          <OfflineReportViewer
            report={viewerData as ResearchReport}
            onClose={closeViewer}
            onExport={handleExport}
            exporting={exporting}
          />
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
      case 'voice_debate':
        return (
          <OfflineVoiceDebateViewer
            voiceDebate={viewerData as VoiceDebate}
            entry={viewerEntry}
            onClose={closeViewer}
            onExport={handleExport}
            exporting={exporting}
          />
        );
      default:
        return null;
    }
  }

  // ── List view ─────────────────────────────────────────────────────────────────

  const bgGradient: readonly [string, string] = isLight
    ? ['#F0F2F8', '#FFFFFF']
    : [COLORS.background, COLORS.backgroundCard];

  return (
    <LinearGradient colors={bgGradient} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        {viewerLoading && (
          <View
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 99,
              backgroundColor: getModalBackdrop(0.85),
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <View
              style={{
                backgroundColor: COLORS.backgroundCard,
                borderRadius: RADIUS.xl,
                padding: SPACING.xl,
                alignItems: 'center',
                borderWidth: 1,
                borderColor: COLORS.border,
                ...SHADOWS.large,
              }}
            >
              <ActivityIndicator size="large" color={COLORS.primary} />
              <Text
                style={{
                  color: COLORS.textSecondary,
                  marginTop: SPACING.md,
                  fontSize: FONTS.sizes.sm,
                  fontWeight: '600',
                }}
              >
                Loading from cache…
              </Text>
            </View>
          </View>
        )}

        {/* Header */}
        <View
          style={{
            paddingHorizontal: SPACING.lg,
            paddingTop: SPACING.sm,
            paddingBottom: SPACING.md,
            borderBottomWidth: 1,
            borderBottomColor: COLORS.border,
            backgroundColor: isLight ? 'rgba(255,255,255,0.8)' : 'rgba(10,10,26,0.8)',
            backdropFilter: 'blur(20px)',
          }}
        >
          {/* Status Bar */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: SPACING.md,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Animated.View style={{ transform: [{ scale: pulse }] }}>
                <View
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 5,
                    backgroundColor: COLORS.error,
                    borderWidth: 2,
                    borderColor: `${COLORS.error}40`,
                  }}
                />
              </Animated.View>
              <View>
                <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.lg, fontWeight: '800' }}>
                  Offline Mode
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
                    {totalItems > 0
                      ? `${totalItems} items · ${formatBytes(totalBytes)}`
                      : 'No cached content'}
                  </Text>
                  {totalItems > 0 && (
                    <View
                      style={{
                        width: 4,
                        height: 4,
                        borderRadius: 2,
                        backgroundColor: COLORS.textMuted,
                      }}
                    />
                  )}
                  {totalItems > 0 && (
                    <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
                      {Math.round(totalBytes / 1024 / 1024)} MB
                    </Text>
                  )}
                </View>
              </View>
            </View>

            <TouchableOpacity
              onPress={async () => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                await recheckNetwork();
                onRetry?.();
              }}
              disabled={isConnecting}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                backgroundColor: `${COLORS.primary}12`,
                borderRadius: RADIUS.full,
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderWidth: 1,
                borderColor: `${COLORS.primary}25`,
                opacity: isConnecting ? 0.6 : 1,
              }}
            >
              {isConnecting ? (
                <ActivityIndicator size="small" color={COLORS.primary} />
              ) : (
                <Ionicons name="refresh-outline" size={16} color={COLORS.primary} />
              )}
              <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.xs, fontWeight: '700' }}>
                {isConnecting ? 'Checking…' : 'Retry'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Workspace notice */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              backgroundColor: `${COLORS.warning}08`,
              borderRadius: RADIUS.lg,
              paddingHorizontal: SPACING.md,
              paddingVertical: 8,
              marginBottom: SPACING.sm,
              borderWidth: 1,
              borderColor: `${COLORS.warning}15`,
            }}
          >
            <Ionicons name="people-outline" size={14} color={COLORS.warning} />
            <Text style={{ color: COLORS.warning, fontSize: FONTS.sizes.xs, flex: 1, fontWeight: '500' }}>
              Workspace &amp; Teams require an internet connection
            </Text>
          </View>

          {/* Search */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: isLight ? '#FFFFFF' : COLORS.backgroundElevated,
              borderRadius: RADIUS.lg,
              paddingHorizontal: SPACING.md,
              borderWidth: 1,
              borderColor: COLORS.border,
              height: 44,
              ...SHADOWS.small,
            }}
          >
            <Ionicons
              name="search-outline"
              size={18}
              color={COLORS.textMuted}
              style={{ marginRight: 10 }}
            />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search cached content…"
              placeholderTextColor={COLORS.textMuted}
              style={{
                flex: 1,
                color: COLORS.textPrimary,
                fontSize: FONTS.sizes.sm,
                fontWeight: '400',
              }}
            />
            {search.length > 0 && (
              <TouchableOpacity
                onPress={() => setSearch('')}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close-circle" size={18} color={COLORS.textMuted} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Filter chips */}
        <View
          style={{
            paddingVertical: SPACING.md,
            borderBottomWidth: 1,
            borderBottomColor: COLORS.border,
            backgroundColor: isLight ? 'rgba(255,255,255,0.5)' : 'rgba(10,10,26,0.5)',
          }}
        >
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: SPACING.lg, gap: 8 }}
            data={FILTERS}
            keyExtractor={f => f.id}
            renderItem={({ item: f }) => {
              const isActive = filter === f.id;
              const count = f.id === 'all' ? totalItems : (countByType[f.id] ?? 0);
              return (
                <FilterChip
                  filter={f}
                  isActive={isActive}
                  count={count}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setFilter(f.id);
                  }}
                />
              );
            }}
          />
        </View>

        {/* Content list */}
        {loading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text
              style={{
                color: COLORS.textMuted,
                marginTop: SPACING.md,
                fontSize: FONTS.sizes.sm,
              }}
            >
              Loading cached content…
            </Text>
          </View>
        ) : (
          <FlatList
            data={displayEntries}
            keyExtractor={e => `${e.type}-${e.id}`}
            contentContainerStyle={{
              paddingTop: SPACING.md,
              paddingBottom: insets.bottom + 100,
              flexGrow: 1,
            }}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => loadEntries(true)}
                tintColor={COLORS.primary}
                colors={[COLORS.primary]}
              />
            }
            ListEmptyComponent={<EmptyState filter={filter} hasSearch={search.trim().length > 0} />}
            renderItem={({ item, index }) => (
              <CacheItemCard entry={item} onPress={handleOpenItem} index={index} />
            )}
          />
        )}

        {/* Bottom bar */}
        <View
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            paddingHorizontal: SPACING.lg,
            paddingVertical: SPACING.md,
            paddingBottom: insets.bottom + SPACING.md,
            borderTopWidth: 1,
            borderTopColor: COLORS.border,
            backgroundColor: isLight
              ? 'rgba(245,246,251,0.95)'
              : 'rgba(10,10,26,0.95)',
            backdropFilter: 'blur(20px)',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="cloud-offline-outline" size={16} color={COLORS.primary} />
            <Text
              style={{
                color: COLORS.textMuted,
                fontSize: FONTS.sizes.xs,
                fontWeight: '500',
              }}
            >
              {totalItems > 0 ? `${totalItems} items cached` : 'No cached items'}
            </Text>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: COLORS.success,
              }}
            />
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
              DeepDive AI
            </Text>
          </View>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}