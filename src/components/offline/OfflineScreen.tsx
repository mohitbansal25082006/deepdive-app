// src/components/offline/OfflineScreen.tsx
// Part 22 — FIXED.
//
// ROOT CAUSE OF NAVIGATION NOT WORKING:
//   The previous version sat as an Animated.View overlay with pointerEvents='auto'
//   which intercepted ALL touch events including router.push calls from item taps.
//   The Stack navigator underneath was still mounted but unreachable.
//
// FIX STRATEGY:
//   The OfflineScreen is now rendered AS A FULL SCREEN ROUTE, not as an overlay.
//   app/(app)/_layout.tsx conditionally renders either the Stack (online) or the
//   OfflineScreen (offline). When the user taps an item, router.push() fires
//   normally into the Stack which is mounted but hidden — on iOS/Android the
//   navigation queue processes it correctly because the Stack never unmounted.
//
//   For the "open item" action we use a different approach:
//   Instead of router.push (which would navigate away from the offline screen
//   and into screens that may try to hit Supabase), we render the cached data
//   INLINE using a preview modal that reads straight from the file system cache.
//   This is the same pattern used by apps like Pocket, Instapaper, and Spotify's
//   offline mode — show a self-contained reader without navigating away.
//
// DOWNLOAD IN OFFLINE MODE:
//   For PDFs/exports, we read the local file and trigger expo-sharing directly.
//   No network calls are made.

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
  Platform,
  Share,
  ScrollView,
  Modal,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import {
  getCacheIndex,
  getCachedItem,
  formatBytes,
} from '../../lib/cacheStorage';
import { getCacheStats } from '../../lib/cacheSettings';
import { useNetwork } from '../../context/NetworkContext';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';
import type { CacheEntry, CachedContentType, CacheFilterType } from '../../types/cache';
import type {
  ResearchReport,
  Podcast,
  DebateSession,
  AcademicPaper,
  GeneratedPresentation,
} from '../../types';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

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
  report:         'Research Report',
  podcast:        'Podcast Episode',
  debate:         'AI Debate',
  academic_paper: 'Academic Paper',
  presentation:   'Presentation',
};

// ─── Time helpers ─────────────────────────────────────────────────────────────

function formatRelativeTime(ms: number): string {
  const diff  = Date.now() - ms;
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins < 1)    return 'Just now';
  if (mins < 60)   return `${mins}m ago`;
  if (hours < 24)  return `${hours}h ago`;
  if (days < 7)    return `${days}d ago`;
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

// ─── Inline Report Viewer ─────────────────────────────────────────────────────
// Renders a research report from cache without any Supabase calls.

function ReportViewer({
  report,
  onClose,
  onExport,
  exporting,
}: {
  report: ResearchReport;
  onClose: () => void;
  onExport: () => void;
  exporting: boolean;
}) {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<'report' | 'findings' | 'sources'>('report');

  const reliabilityColor =
    report.reliabilityScore >= 8 ? COLORS.success :
    report.reliabilityScore >= 6 ? COLORS.warning :
    COLORS.error;

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      {/* Header */}
      <View style={{
        paddingTop:        insets.top + SPACING.sm,
        paddingHorizontal: SPACING.lg,
        paddingBottom:     SPACING.sm,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.border,
        flexDirection:     'row',
        alignItems:        'center',
        gap:               10,
      }}>
        <TouchableOpacity
          onPress={onClose}
          style={{
            width: 36, height: 36, borderRadius: 10,
            backgroundColor: COLORS.backgroundElevated,
            alignItems: 'center', justifyContent: 'center',
            borderWidth: 1, borderColor: COLORS.border,
          }}
        >
          <Ionicons name="arrow-back" size={18} color={COLORS.textSecondary} />
        </TouchableOpacity>

        <View style={{ flex: 1 }}>
          <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '700' }} numberOfLines={1}>
            {report.title}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <View style={{ backgroundColor: `${COLORS.info}20`, borderRadius: RADIUS.sm, paddingHorizontal: 6, paddingVertical: 1 }}>
              <Text style={{ color: COLORS.info, fontSize: 9, fontWeight: '700' }}>OFFLINE CACHE</Text>
            </View>
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
              {report.sourcesCount} sources · {report.reliabilityScore}/10
            </Text>
          </View>
        </View>

        <TouchableOpacity
          onPress={onExport}
          disabled={exporting}
          style={{
            width: 36, height: 36, borderRadius: 10,
            backgroundColor: `${COLORS.primary}18`,
            alignItems: 'center', justifyContent: 'center',
            borderWidth: 1, borderColor: `${COLORS.primary}30`,
          }}
        >
          {exporting
            ? <ActivityIndicator size="small" color={COLORS.primary} />
            : <Ionicons name="download-outline" size={17} color={COLORS.primary} />
          }
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={{ flexDirection: 'row', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm, gap: SPACING.sm }}>
        {(['report', 'findings', 'sources'] as const).map(tab => (
          <TouchableOpacity
            key={tab}
            onPress={() => setActiveTab(tab)}
            style={{
              flex: 1, paddingVertical: 8, borderRadius: RADIUS.md,
              backgroundColor: activeTab === tab ? COLORS.primary : COLORS.backgroundElevated,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: activeTab === tab ? '#FFF' : COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600' }}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Content */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: SPACING.lg, paddingBottom: insets.bottom + 80 }}
        showsVerticalScrollIndicator={false}
      >
        {activeTab === 'report' && (
          <>
            {/* Executive summary */}
            <LinearGradient
              colors={['#1A1A35', '#12122A']}
              style={{
                borderRadius: RADIUS.xl, padding: SPACING.lg,
                marginBottom: SPACING.lg,
                borderWidth: 1, borderColor: `${COLORS.primary}25`,
              }}
            >
              <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.xs, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: SPACING.sm }}>
                Executive Summary
              </Text>
              <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, lineHeight: 22 }}>
                {report.executiveSummary}
              </Text>
            </LinearGradient>

            {/* Sections */}
            {report.sections.map((section, i) => (
              <View key={section.id ?? i} style={{
                backgroundColor: COLORS.backgroundCard,
                borderRadius: RADIUS.lg,
                padding: SPACING.md,
                marginBottom: SPACING.sm,
                borderWidth: 1, borderColor: COLORS.border,
                borderLeftWidth: 3, borderLeftColor: COLORS.primary,
              }}>
                <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '700', marginBottom: SPACING.sm }}>
                  {section.title}
                </Text>
                <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, lineHeight: 22 }}>
                  {section.content}
                </Text>
                {section.bullets?.length ? (
                  <View style={{ marginTop: SPACING.sm }}>
                    {section.bullets.map((b, bi) => (
                      <View key={bi} style={{ flexDirection: 'row', gap: 8, marginBottom: 4 }}>
                        <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.sm }}>•</Text>
                        <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, flex: 1, lineHeight: 20 }}>{b}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
            ))}
          </>
        )}

        {activeTab === 'findings' && (
          <>
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: SPACING.md }}>
              Key Findings
            </Text>
            {report.keyFindings.map((f, i) => (
              <View key={i} style={{
                backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.lg,
                padding: SPACING.md, marginBottom: SPACING.sm,
                flexDirection: 'row', alignItems: 'flex-start',
                borderWidth: 1, borderColor: COLORS.border,
                borderLeftWidth: 3, borderLeftColor: COLORS.primary,
              }}>
                <View style={{
                  width: 24, height: 24, borderRadius: 12,
                  backgroundColor: `${COLORS.primary}20`,
                  alignItems: 'center', justifyContent: 'center', marginRight: SPACING.sm, flexShrink: 0,
                }}>
                  <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.xs, fontWeight: '700' }}>{i + 1}</Text>
                </View>
                <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, lineHeight: 20, flex: 1 }}>{f}</Text>
              </View>
            ))}

            {report.futurePredictions?.length > 0 && (
              <>
                <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: SPACING.md, marginTop: SPACING.lg }}>
                  Future Predictions
                </Text>
                {report.futurePredictions.map((p, i) => (
                  <View key={i} style={{
                    backgroundColor: `${COLORS.warning}10`, borderRadius: RADIUS.lg,
                    padding: SPACING.md, marginBottom: SPACING.sm,
                    flexDirection: 'row', alignItems: 'flex-start',
                    borderWidth: 1, borderColor: `${COLORS.warning}25`,
                  }}>
                    <Ionicons name="telescope-outline" size={16} color={COLORS.warning} style={{ marginRight: SPACING.sm, marginTop: 2, flexShrink: 0 }} />
                    <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, lineHeight: 20, flex: 1 }}>{p}</Text>
                  </View>
                ))}
              </>
            )}
          </>
        )}

        {activeTab === 'sources' && (
          <>
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: SPACING.md }}>
              {report.citations.length} Sources
            </Text>
            {report.citations.map((c, i) => (
              <View key={c.id ?? i} style={{
                backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.lg,
                padding: SPACING.md, marginBottom: SPACING.sm,
                borderWidth: 1, borderColor: COLORS.border,
              }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 4 }}>
                  <View style={{
                    width: 22, height: 22, borderRadius: 6,
                    backgroundColor: `${COLORS.primary}20`,
                    alignItems: 'center', justifyContent: 'center', marginRight: 8, flexShrink: 0,
                  }}>
                    <Text style={{ color: COLORS.primary, fontSize: 10, fontWeight: '700' }}>{i + 1}</Text>
                  </View>
                  <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '600', flex: 1, lineHeight: 20 }}>
                    {c.title}
                  </Text>
                </View>
                <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.xs, marginBottom: 4 }}>
                  {c.source}{c.date ? ` · ${c.date}` : ''}
                </Text>
                <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, lineHeight: 16 }}>
                  {c.snippet}
                </Text>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

// ─── Generic text viewer (for podcasts, debates, papers, slides) ──────────────

function GenericViewer({
  entry,
  data,
  onClose,
  onExport,
  exporting,
}: {
  entry:     CacheEntry;
  data:      unknown;
  onClose:   () => void;
  onExport:  () => void;
  exporting: boolean;
}) {
  const insets  = useSafeAreaInsets();
  const color   = entry.color ?? COLORS.primary;

  // Build a readable summary from the cached data
  const getSummary = (): string => {
    if (!data) return 'No data available.';
    const obj = data as Record<string, unknown>;

    switch (entry.type) {
      case 'podcast': {
        const p = (obj as unknown) as Podcast;
        const turns = p.script?.turns ?? [];
        const preview = turns.slice(0, 6).map(t =>
          `${t.speakerName?.toUpperCase() ?? 'SPEAKER'}:\n${t.text}`
        ).join('\n\n');
        return `${p.description ?? ''}\n\n${preview}${turns.length > 6 ? `\n\n... and ${turns.length - 6} more turns` : ''}`;
      }
      case 'debate': {
        const d = (obj as unknown) as DebateSession;
        const persp = (d.perspectives ?? []).slice(0, 3).map(p =>
          `${p.agentName} (${p.stanceLabel}):\n${p.summary?.slice(0, 200) ?? ''}...`
        ).join('\n\n');
        const verdict = d.moderator?.balancedVerdict
          ? `\nModerator Verdict:\n"${d.moderator.balancedVerdict}"`
          : '';
        return `Question: ${d.question}\n\n${persp}${verdict}`;
      }
      case 'academic_paper': {
        const ap = (obj as unknown) as AcademicPaper;
        const secs = (ap.sections ?? []).slice(0, 4).map(s =>
          `${s.title}\n${s.content?.slice(0, 300) ?? ''}...`
        ).join('\n\n');
        return `Abstract:\n${ap.abstract}\n\n${secs}`;
      }
      case 'presentation': {
        const pr = (obj as unknown) as GeneratedPresentation;
        const slides = (pr.slides ?? []).slice(0, 5).map(s =>
          `Slide ${s.slideNumber}: ${s.title}${s.body ? '\n' + s.body.slice(0, 150) : ''}`
        ).join('\n\n');
        return `${pr.subtitle ?? ''}\n\nTotal: ${pr.totalSlides} slides\n\n${slides}`;
      }
      default:
        return JSON.stringify(data, null, 2).slice(0, 2000);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      {/* Header */}
      <View style={{
        paddingTop:        insets.top + SPACING.sm,
        paddingHorizontal: SPACING.lg,
        paddingBottom:     SPACING.sm,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.border,
        flexDirection:     'row',
        alignItems:        'center',
        gap:               10,
      }}>
        <TouchableOpacity
          onPress={onClose}
          style={{
            width: 36, height: 36, borderRadius: 10,
            backgroundColor: COLORS.backgroundElevated,
            alignItems: 'center', justifyContent: 'center',
            borderWidth: 1, borderColor: COLORS.border,
          }}
        >
          <Ionicons name="arrow-back" size={18} color={COLORS.textSecondary} />
        </TouchableOpacity>

        <View style={{
          width: 32, height: 32, borderRadius: 10,
          backgroundColor: `${color}18`,
          alignItems: 'center', justifyContent: 'center',
          borderWidth: 1, borderColor: `${color}30`, flexShrink: 0,
        }}>
          <Ionicons name={entry.icon as any ?? 'document-outline'} size={15} color={color} />
        </View>

        <View style={{ flex: 1 }}>
          <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '700' }} numberOfLines={1}>
            {entry.title}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <View style={{ backgroundColor: `${COLORS.info}20`, borderRadius: RADIUS.sm, paddingHorizontal: 6, paddingVertical: 1 }}>
              <Text style={{ color: COLORS.info, fontSize: 9, fontWeight: '700' }}>OFFLINE CACHE</Text>
            </View>
            <Text style={{ color: color, fontSize: 9, fontWeight: '700' }}>
              {TYPE_LABEL[entry.type].toUpperCase()}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          onPress={onExport}
          disabled={exporting}
          style={{
            width: 36, height: 36, borderRadius: 10,
            backgroundColor: `${color}18`,
            alignItems: 'center', justifyContent: 'center',
            borderWidth: 1, borderColor: `${color}30`,
          }}
        >
          {exporting
            ? <ActivityIndicator size="small" color={color} />
            : <Ionicons name="download-outline" size={17} color={color} />
          }
        </TouchableOpacity>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: SPACING.lg, paddingBottom: insets.bottom + 80 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Type-specific header info */}
        <View style={{
          backgroundColor: `${color}10`,
          borderRadius: RADIUS.xl, padding: SPACING.lg,
          marginBottom: SPACING.lg,
          borderWidth: 1, borderColor: `${color}25`,
        }}>
          <Text style={{ color: color, fontSize: FONTS.sizes.xs, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>
            {TYPE_LABEL[entry.type]}
          </Text>
          <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.md, fontWeight: '800', marginBottom: 4 }}>
            {entry.title}
          </Text>
          <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
            Cached {formatRelativeTime(entry.cachedAt)} · {formatBytes(entry.sizeBytes)}
          </Text>
        </View>

        {/* Content preview */}
        <View style={{
          backgroundColor: COLORS.backgroundCard,
          borderRadius: RADIUS.xl, padding: SPACING.lg,
          borderWidth: 1, borderColor: COLORS.border,
        }}>
          <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, lineHeight: 22 }}>
            {getSummary()}
          </Text>
        </View>

        {entry.type === 'podcast' && (
          <View style={{
            marginTop: SPACING.md,
            backgroundColor: `${COLORS.warning}10`,
            borderRadius: RADIUS.lg,
            padding: SPACING.md,
            borderWidth: 1, borderColor: `${COLORS.warning}25`,
            flexDirection: 'row', alignItems: 'flex-start', gap: 8,
          }}>
            <Ionicons name="information-circle-outline" size={16} color={COLORS.warning} style={{ flexShrink: 0, marginTop: 1 }} />
            <Text style={{ color: COLORS.warning, fontSize: FONTS.sizes.xs, lineHeight: 18, flex: 1 }}>
              Audio playback requires internet. The transcript is available offline. Tap Download to export the script as PDF.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ─── Item card ────────────────────────────────────────────────────────────────

function CacheItemCard({
  entry,
  onPress,
  index,
}: {
  entry:   CacheEntry;
  onPress: (entry: CacheEntry) => void;
  index:   number;
}) {
  const color = entry.color ?? COLORS.primary;
  const anim  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1, duration: 280, delay: index * 35, useNativeDriver: true,
    }).start();
  }, []);

  return (
    <Animated.View style={{
      opacity:   anim,
      transform: [{ translateY: anim.interpolate({ inputRange: [0,1], outputRange: [14,0] }) }],
    }}>
      <TouchableOpacity
        onPress={() => onPress(entry)}
        activeOpacity={0.78}
        style={{
          backgroundColor:  COLORS.backgroundCard,
          borderRadius:     RADIUS.xl,
          marginHorizontal: SPACING.lg,
          marginBottom:     SPACING.sm,
          borderWidth:      1,
          borderColor:      COLORS.border,
          overflow:         'hidden',
        }}
      >
        <View style={{ height: 3, backgroundColor: color }} />
        <View style={{ padding: SPACING.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
            <View style={{
              width: 40, height: 40, borderRadius: 12,
              backgroundColor: `${color}18`,
              alignItems: 'center', justifyContent: 'center',
              borderWidth: 1, borderColor: `${color}30`, flexShrink: 0,
            }}>
              <Ionicons name={entry.icon as any ?? 'document-outline'} size={18} color={color} />
            </View>

            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '700', lineHeight: 20, marginBottom: 2 }} numberOfLines={2}>
                {entry.title}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{
                  backgroundColor: `${color}18`, borderRadius: RADIUS.full,
                  paddingHorizontal: 7, paddingVertical: 2,
                  borderWidth: 1, borderColor: `${color}30`,
                }}>
                  <Text style={{ color, fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    {TYPE_LABEL[entry.type]}
                  </Text>
                </View>
                {entry.subtitle && (
                  <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }} numberOfLines={1}>
                    {entry.subtitle}
                  </Text>
                )}
              </View>
            </View>

            <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} style={{ marginTop: 2, flexShrink: 0 }} />
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="time-outline" size={11} color={COLORS.textMuted} />
              <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
                {formatRelativeTime(entry.cachedAt)}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
                {formatBytes(entry.sizeBytes)}
              </Text>
              <Text style={{
                color:    Date.now() > entry.expiresAt - 86400000 * 3 ? COLORS.warning : COLORS.textMuted,
                fontSize: FONTS.sizes.xs,
              }}>
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
      <View style={{
        width: 80, height: 80, borderRadius: 24,
        backgroundColor: `${COLORS.primary}12`,
        alignItems: 'center', justifyContent: 'center',
        marginBottom: SPACING.lg,
        borderWidth: 1, borderColor: `${COLORS.primary}25`,
      }}>
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
  const insets   = useSafeAreaInsets();
  const { recheckNetwork, isConnecting } = useNetwork();

  const [entries,    setEntries]    = useState<CacheEntry[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter,     setFilter]     = useState<CacheFilterType>('all');
  const [search,     setSearch]     = useState('');
  const [totalBytes, setTotalBytes] = useState(0);
  const [totalItems, setTotalItems] = useState(0);

  // Viewer state
  const [viewerEntry,    setViewerEntry]    = useState<CacheEntry | null>(null);
  const [viewerData,     setViewerData]     = useState<unknown>(null);
  const [viewerLoading,  setViewerLoading]  = useState(false);
  const [exporting,      setExporting]      = useState(false);

  // Offline pulse animation
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.2,  duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1.0,  duration: 900, useNativeDriver: true }),
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
    finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadEntries(); }, [loadEntries]);

  const displayEntries = entries.filter(e => {
    const matchType   = filter === 'all' || e.type === filter;
    const searchLower = search.toLowerCase().trim();
    const matchSearch = !searchLower ||
      e.title.toLowerCase().includes(searchLower) ||
      (e.subtitle ?? '').toLowerCase().includes(searchLower);
    return matchType && matchSearch;
  });

  const countByType = entries.reduce((acc, e) => {
    acc[e.type] = (acc[e.type] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // ── OPEN ITEM — reads from cache file, shows inline viewer ────────────────
  const handleOpenItem = useCallback(async (entry: CacheEntry) => {
    setViewerLoading(true);
    try {
      const data = await getCachedItem(entry.type, entry.id);
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
    } catch (err) {
      Alert.alert('Error', 'Could not open this cached item.');
    } finally {
      setViewerLoading(false);
    }
  }, [loadEntries]);

  // ── EXPORT / DOWNLOAD while offline ──────────────────────────────────────
  // Generates a PDF from the cached data without any network calls.
  const handleExport = useCallback(async () => {
    if (!viewerEntry || !viewerData || exporting) return;
    setExporting(true);

    try {
      let html = '';

      if (viewerEntry.type === 'report') {
        const report = viewerData as ResearchReport;
        const sectionsHtml = report.sections.map(s => `
          <div style="margin-bottom:24px;padding:20px;border:1px solid #e0e0e0;border-radius:8px">
            <h2 style="color:#1a1a2e;font-size:16px;margin-bottom:12px">${s.title}</h2>
            <p style="color:#444;line-height:1.8;font-size:13px">${s.content}</p>
          </div>`).join('');
        html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>${report.title}</title></head>
          <body style="font-family:Arial,sans-serif;padding:40px;max-width:800px;margin:0 auto">
            <div style="background:linear-gradient(135deg,#6C63FF,#8B5CF6);color:white;padding:40px;border-radius:12px;margin-bottom:32px">
              <h1 style="font-size:24px;margin-bottom:8px">${report.title}</h1>
              <p style="opacity:0.8;font-size:13px">${report.sourcesCount} sources · Reliability: ${report.reliabilityScore}/10 · Cached Offline</p>
            </div>
            <div style="background:#f8f7ff;padding:20px;border-radius:8px;border-left:4px solid #6C63FF;margin-bottom:32px">
              <h2 style="font-size:14px;color:#6C63FF;margin-bottom:8px">Executive Summary</h2>
              <p style="color:#444;line-height:1.8;font-size:13px">${report.executiveSummary}</p>
            </div>
            ${sectionsHtml}
            <p style="text-align:center;color:#999;font-size:11px;margin-top:40px">Generated offline by DeepDive AI</p>
          </body></html>`;
      } else if (viewerEntry.type === 'podcast') {
        const pod = viewerData as Podcast;
        const turnsHtml = (pod.script?.turns ?? []).map(t => `
          <div style="margin-bottom:14px;padding:14px;background:${t.speaker==='host'?'#f0eeff':'#fff0f4'};border-radius:8px;border-left:4px solid ${t.speaker==='host'?'#6C63FF':'#FF6584'}">
            <strong style="color:${t.speaker==='host'?'#6C63FF':'#FF6584'};font-size:11px;text-transform:uppercase">${t.speakerName}</strong>
            <p style="margin-top:6px;color:#333;font-size:13px;line-height:1.7">${t.text}</p>
          </div>`).join('');
        html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/></head>
          <body style="font-family:Arial,sans-serif;padding:40px;max-width:800px;margin:0 auto">
            <h1 style="color:#1a1a2e">${pod.title}</h1>
            <p style="color:#888;margin-bottom:32px">${pod.description}</p>
            ${turnsHtml}
            <p style="text-align:center;color:#999;font-size:11px;margin-top:40px">Generated offline by DeepDive AI</p>
          </body></html>`;
      } else if (viewerEntry.type === 'debate') {
        const deb = viewerData as DebateSession;
        const perspHtml = (deb.perspectives ?? []).map(p => `
          <div style="margin-bottom:20px;padding:20px;border:1px solid #e0e0e0;border-radius:8px;border-top:4px solid ${p.color}">
            <h3 style="color:${p.color};margin-bottom:8px">${p.agentName}</h3>
            <p style="font-style:italic;color:#555;margin-bottom:12px">"${p.stanceLabel}"</p>
            <p style="color:#444;line-height:1.7;font-size:13px">${p.summary}</p>
          </div>`).join('');
        html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/></head>
          <body style="font-family:Arial,sans-serif;padding:40px;max-width:800px;margin:0 auto">
            <h1 style="color:#1a1a2e">${deb.topic}</h1>
            <p style="font-style:italic;color:#6C63FF;margin-bottom:32px">${deb.question}</p>
            ${perspHtml}
            ${deb.moderator?.balancedVerdict ? `<div style="padding:20px;background:#f0eeff;border-radius:8px;border-left:4px solid #6C63FF;margin-top:24px"><strong>Moderator Verdict:</strong><p style="margin-top:8px;font-style:italic">"${deb.moderator.balancedVerdict}"</p></div>` : ''}
            <p style="text-align:center;color:#999;font-size:11px;margin-top:40px">Generated offline by DeepDive AI</p>
          </body></html>`;
      } else if (viewerEntry.type === 'academic_paper') {
        const paper = viewerData as AcademicPaper;
        const secsHtml = (paper.sections ?? []).map(s => `
          <div style="margin-bottom:24px">
            <h2 style="color:#1a1a2e;border-bottom:2px solid #6C63FF;padding-bottom:6px;margin-bottom:12px">${s.title}</h2>
            <p style="color:#444;line-height:2;font-size:13px">${s.content}</p>
          </div>`).join('');
        html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/></head>
          <body style="font-family:'Times New Roman',serif;padding:60px;max-width:800px;margin:0 auto">
            <h1 style="text-align:center;color:#1a1a2e;margin-bottom:8px">${paper.title}</h1>
            <p style="text-align:center;color:#888;margin-bottom:32px">${paper.citationStyle.toUpperCase()} · ~${paper.wordCount} words</p>
            <div style="background:#f8f8ff;padding:20px;border-radius:8px;margin-bottom:32px">
              <h2>Abstract</h2><p style="line-height:1.8">${paper.abstract}</p>
            </div>
            ${secsHtml}
            <p style="text-align:center;color:#999;font-size:11px;margin-top:40px">Generated offline by DeepDive AI</p>
          </body></html>`;
      } else {
        // Presentation — export as simple HTML list
        const pres = viewerData as GeneratedPresentation;
        const slidesHtml = (pres.slides ?? []).map(s => `
          <div style="margin-bottom:16px;padding:16px;background:#f8f7ff;border-radius:8px;border-left:4px solid #6C63FF">
            <strong style="color:#6C63FF">Slide ${s.slideNumber}: ${s.title}</strong>
            ${s.body ? `<p style="margin-top:8px;color:#444;font-size:13px">${s.body}</p>` : ''}
          </div>`).join('');
        html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/></head>
          <body style="font-family:Arial,sans-serif;padding:40px;max-width:800px;margin:0 auto">
            <h1 style="color:#1a1a2e">${pres.title}</h1>
            <p style="color:#888;margin-bottom:32px">${pres.subtitle} · ${pres.totalSlides} slides</p>
            ${slidesHtml}
            <p style="text-align:center;color:#999;font-size:11px;margin-top:40px">Generated offline by DeepDive AI</p>
          </body></html>`;
      }

      const { uri } = await Print.printToFileAsync({ html, base64: false });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: `Download: ${viewerEntry.title}`,
          UTI: 'com.adobe.pdf',
        });
      }
    } catch (err) {
      Alert.alert('Export Error', 'Could not generate PDF. Please try again.');
    } finally {
      setExporting(false);
    }
  }, [viewerEntry, viewerData, exporting]);

  const handleRetry = useCallback(async () => {
    await recheckNetwork();
    onRetry?.();
  }, [recheckNetwork, onRetry]);

  // ── VIEWER MODE — show inline viewer instead of list ──────────────────────
  if (viewerEntry && viewerData) {
    if (viewerEntry.type === 'report') {
      return (
        <LinearGradient colors={[COLORS.background, COLORS.backgroundCard]} style={{ flex: 1 }}>
          <ReportViewer
            report={viewerData as ResearchReport}
            onClose={() => { setViewerEntry(null); setViewerData(null); }}
            onExport={handleExport}
            exporting={exporting}
          />
        </LinearGradient>
      );
    }
    return (
      <LinearGradient colors={[COLORS.background, COLORS.backgroundCard]} style={{ flex: 1 }}>
        <GenericViewer
          entry={viewerEntry}
          data={viewerData}
          onClose={() => { setViewerEntry(null); setViewerData(null); }}
          onExport={handleExport}
          exporting={exporting}
        />
      </LinearGradient>
    );
  }

  // ── LIST VIEW ──────────────────────────────────────────────────────────────
  return (
    <LinearGradient colors={[COLORS.background, COLORS.backgroundCard]} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>

        {/* Viewer loading overlay */}
        {viewerLoading && (
          <View style={{
            position: 'absolute', inset: 0, zIndex: 99,
            backgroundColor: 'rgba(10,10,26,0.8)',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={{ color: COLORS.textMuted, marginTop: SPACING.sm, fontSize: FONTS.sizes.sm }}>
              Loading from cache…
            </Text>
          </View>
        )}

        {/* Header */}
        <View style={{
          paddingHorizontal: SPACING.lg,
          paddingTop:        SPACING.sm,
          paddingBottom:     SPACING.sm,
          borderBottomWidth: 1,
          borderBottomColor: COLORS.border,
        }}>
          {/* Offline indicator + retry */}
          <View style={{
            flexDirection: 'row', alignItems: 'center',
            justifyContent: 'space-between', marginBottom: SPACING.md,
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Animated.View style={{ transform: [{ scale: pulse }] }}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.error }} />
              </Animated.View>
              <View>
                <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.md, fontWeight: '800' }}>
                  You're Offline
                </Text>
                <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
                  {totalItems > 0
                    ? `${totalItems} cached items · ${formatBytes(totalBytes)}`
                    : 'No cached content available'}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              onPress={handleRetry}
              disabled={isConnecting}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 6,
                backgroundColor: `${COLORS.primary}18`,
                borderRadius: RADIUS.full, paddingHorizontal: 14, paddingVertical: 8,
                borderWidth: 1, borderColor: `${COLORS.primary}35`,
                opacity: isConnecting ? 0.6 : 1,
              }}
            >
              {isConnecting
                ? <ActivityIndicator size="small" color={COLORS.primary} />
                : <Ionicons name="refresh-outline" size={14} color={COLORS.primary} />
              }
              <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.xs, fontWeight: '700' }}>
                {isConnecting ? 'Checking…' : 'Retry'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Workspace notice */}
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 8,
            backgroundColor: `${COLORS.warning}10`,
            borderRadius: RADIUS.lg, paddingHorizontal: SPACING.md, paddingVertical: 8,
            marginBottom: SPACING.sm,
            borderWidth: 1, borderColor: `${COLORS.warning}25`,
          }}>
            <Ionicons name="people-outline" size={14} color={COLORS.warning} />
            <Text style={{ color: COLORS.warning, fontSize: FONTS.sizes.xs, flex: 1 }}>
              Workspace &amp; Teams features require an internet connection
            </Text>
          </View>

          {/* Search */}
          <View style={{
            flexDirection: 'row', alignItems: 'center',
            backgroundColor: COLORS.backgroundElevated,
            borderRadius: RADIUS.lg, paddingHorizontal: SPACING.md,
            borderWidth: 1, borderColor: COLORS.border, height: 40,
          }}>
            <Ionicons name="search-outline" size={16} color={COLORS.textMuted} style={{ marginRight: 8 }} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search cached content…"
              placeholderTextColor={COLORS.textMuted}
              style={{ flex: 1, color: COLORS.textPrimary, fontSize: FONTS.sizes.sm }}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close-circle" size={16} color={COLORS.textMuted} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Filter chips */}
        <View style={{ paddingVertical: SPACING.sm }}>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: SPACING.lg, gap: 8 }}
            data={FILTERS}
            keyExtractor={f => f.id}
            renderItem={({ item: f }) => {
              const isActive = filter === f.id;
              const count    = f.id === 'all' ? totalItems : (countByType[f.id] ?? 0);
              return (
                <TouchableOpacity
                  onPress={() => setFilter(f.id)}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 5,
                    backgroundColor: isActive ? f.color : COLORS.backgroundCard,
                    borderRadius: RADIUS.full, paddingHorizontal: 12, paddingVertical: 7,
                    borderWidth: 1, borderColor: isActive ? f.color : COLORS.border,
                  }}
                >
                  <Ionicons name={f.icon as any} size={13} color={isActive ? '#FFF' : f.color} />
                  <Text style={{ color: isActive ? '#FFF' : COLORS.textSecondary, fontSize: FONTS.sizes.xs, fontWeight: '700' }}>
                    {f.label}
                  </Text>
                  {count > 0 && (
                    <View style={{
                      backgroundColor: isActive ? 'rgba(255,255,255,0.25)' : `${f.color}22`,
                      borderRadius: RADIUS.full, paddingHorizontal: 5, paddingVertical: 1,
                      minWidth: 18, alignItems: 'center',
                    }}>
                      <Text style={{ color: isActive ? '#FFF' : f.color, fontSize: 9, fontWeight: '800' }}>
                        {count}
                      </Text>
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
            <Text style={{ color: COLORS.textMuted, marginTop: SPACING.sm, fontSize: FONTS.sizes.sm }}>
              Loading cached content…
            </Text>
          </View>
        ) : (
          <FlatList
            data={displayEntries}
            keyExtractor={e => `${e.type}-${e.id}`}
            contentContainerStyle={{
              paddingTop:    SPACING.sm,
              paddingBottom: insets.bottom + 80,
              flexGrow:      1,
            }}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => loadEntries(true)}
                tintColor={COLORS.primary}
              />
            }
            ListEmptyComponent={
              <EmptyState filter={filter} hasSearch={search.trim().length > 0} />
            }
            renderItem={({ item, index }) => (
              <CacheItemCard entry={item} onPress={handleOpenItem} index={index} />
            )}
          />
        )}

        {/* Bottom bar */}
        <View style={{
          position: 'absolute', bottom: insets.bottom, left: 0, right: 0,
          paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm,
          borderTopWidth: 1, borderTopColor: COLORS.border,
          backgroundColor: 'rgba(10,10,26,0.96)',
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
          <Ionicons name="cloud-offline-outline" size={13} color={COLORS.textMuted} />
          <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, textAlign: 'center' }}>
            DeepDive AI · Offline Mode · {formatBytes(totalBytes)} cached
          </Text>
        </View>

      </SafeAreaView>
    </LinearGradient>
  );
}