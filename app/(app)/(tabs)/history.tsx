// app/(app)/(tabs)/history.tsx
// Part 35 — UPDATED: Added Global Search button + Collections button to header.
// Header redesigned for mobile: avatar pinned to title row (never scrolls),
// action buttons rendered as labelled pill chips in a horizontal ScrollView below.
// All Part 28/34 functionality preserved (bookmark toggle, compare mode, filter tabs).

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons }       from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown, Layout } from 'react-native-reanimated';
import { SafeAreaView }   from 'react-native-safe-area-context';
import { router }         from 'expo-router';
import { useHistory }     from '../../../src/hooks/useHistory';
import { Avatar }         from '../../../src/components/common/Avatar';
import { useAuth }        from '../../../src/context/AuthContext';
import { ResearchReport } from '../../../src/types';
import { supabase }       from '../../../src/lib/supabase';
import { ManageCollectionsSheet }  from '../../../src/components/collections/ManageCollectionsSheet';
import { AddToCollectionSheet }    from '../../../src/components/collections/AddToCollectionSheet';
import { COLORS, FONTS, SPACING, RADIUS } from '../../../src/constants/theme';

// ─── Constants ────────────────────────────────────────────────────────────────

const DEPTH_COLOR: Record<string, string> = {
  quick:  COLORS.info,
  deep:   COLORS.primary,
  expert: COLORS.warning,
};
const DEPTH_LABEL: Record<string, string> = {
  quick: 'Quick', deep: 'Deep', expert: 'Expert',
};
type FilterKey = 'all' | 'quick' | 'deep' | 'expert';

// ─── Action Pill ──────────────────────────────────────────────────────────────
// Labelled chip used in the horizontal action bar beneath the title row.

interface ActionPillProps {
  icon:    React.ComponentProps<typeof Ionicons>['name'];
  label:   string;
  onPress: () => void;
  active?: boolean;
  badge?:  number;
}

function ActionPill({ icon, label, onPress, active = false, badge }: ActionPillProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      style={{
        flexDirection:     'row',
        alignItems:        'center',
        gap:               6,
        paddingHorizontal: 13,
        paddingVertical:   9,
        borderRadius:      RADIUS.full,
        backgroundColor:   active ? `${COLORS.primary}18` : COLORS.backgroundElevated,
        borderWidth:       1,
        borderColor:       active ? `${COLORS.primary}45` : COLORS.border,
        flexShrink:        0,
      }}
    >
      <Ionicons
        name={icon}
        size={15}
        color={active ? COLORS.primary : COLORS.textMuted}
      />
      <Text
        style={{
          fontSize:   FONTS.sizes.sm,
          fontWeight: active ? '700' : '500',
          color:      active ? COLORS.primary : COLORS.textMuted,
        }}
      >
        {label}{badge != null && badge > 0 ? ` · ${badge}` : ''}
      </Text>
    </TouchableOpacity>
  );
}

// ─── Report Card ──────────────────────────────────────────────────────────────

interface ReportCardProps {
  report:            ResearchReport;
  index:             number;
  compareMode:       boolean;
  isSelected:        boolean;
  onOpen:            () => void;
  onDelete:          () => void;
  onToggleBookmark:  () => void;
  onToggleSelect:    () => void;
  onAddToCollection: () => void;
}

function ReportCard({
  report, index, compareMode, isSelected,
  onOpen, onDelete, onToggleBookmark, onToggleSelect, onAddToCollection,
}: ReportCardProps) {
  const depthColor   = DEPTH_COLOR[report.depth] ?? COLORS.primary;
  const isBookmarked = report.isPinned === true;

  return (
    <Animated.View
      entering={FadeInDown.duration(400).delay(index * 50)}
      layout={Layout.springify()}
    >
      <TouchableOpacity
        onPress={compareMode ? onToggleSelect : onOpen}
        onLongPress={onAddToCollection}
        activeOpacity={0.75}
        style={{
          backgroundColor: compareMode && isSelected
            ? `${COLORS.primary}15`
            : COLORS.backgroundCard,
          borderRadius: RADIUS.xl,
          padding:      SPACING.md,
          marginBottom: SPACING.sm,
          borderWidth:  compareMode && isSelected ? 1.5 : 1,
          borderColor:  compareMode && isSelected ? COLORS.primary : COLORS.border,
        }}
      >
        {/* ── Top row ── */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: SPACING.sm }}>

          {compareMode ? (
            <View style={{
              width: 26, height: 26, borderRadius: 13,
              backgroundColor: isSelected ? COLORS.primary : COLORS.backgroundElevated,
              alignItems: 'center', justifyContent: 'center',
              marginRight: SPACING.sm, marginTop: 2,
              borderWidth: 1.5,
              borderColor: isSelected ? COLORS.primary : COLORS.border,
            }}>
              {isSelected && <Ionicons name="checkmark" size={14} color="#FFF" />}
            </View>
          ) : (
            <View style={{
              width: 44, height: 44, borderRadius: 12,
              backgroundColor: `${depthColor}15`,
              alignItems: 'center', justifyContent: 'center',
              marginRight: SPACING.sm,
              borderWidth: 1, borderColor: `${depthColor}30`,
            }}>
              <Ionicons name="document-text" size={20} color={depthColor} />
            </View>
          )}

          <View style={{ flex: 1 }}>
            <Text
              style={{
                color: COLORS.textPrimary, fontSize: FONTS.sizes.base,
                fontWeight: '700', lineHeight: 20,
              }}
              numberOfLines={2}
            >
              {report.title}
            </Text>
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 4 }}>
              {new Date(report.createdAt).toLocaleDateString('en-US', {
                month: 'short', day: 'numeric', year: 'numeric',
              })}
            </Text>
          </View>

          {!compareMode && (
            <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', marginLeft: SPACING.sm }}>
              <TouchableOpacity
                onPress={onAddToCollection}
                hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
                style={{
                  width: 30, height: 30, borderRadius: 8,
                  backgroundColor: COLORS.backgroundElevated,
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                <Ionicons name="folder-outline" size={16} color={COLORS.textMuted} />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={onToggleBookmark}
                hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
                style={{
                  width: 30, height: 30, borderRadius: 8,
                  backgroundColor: isBookmarked ? `${COLORS.primary}15` : COLORS.backgroundElevated,
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                <Ionicons
                  name={isBookmarked ? 'bookmark' : 'bookmark-outline'}
                  size={16}
                  color={isBookmarked ? COLORS.primary : COLORS.textMuted}
                />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={onDelete}
                hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
                style={{
                  width: 30, height: 30, borderRadius: 8,
                  backgroundColor: COLORS.backgroundElevated,
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                <Ionicons name="trash-outline" size={16} color={COLORS.textMuted} />
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Executive summary */}
        {report.executiveSummary ? (
          <Text
            style={{
              color: COLORS.textSecondary, fontSize: FONTS.sizes.xs,
              lineHeight: 18, marginBottom: SPACING.sm,
            }}
            numberOfLines={2}
          >
            {report.executiveSummary}
          </Text>
        ) : null}

        {/* Chips */}
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
          <View style={{
            backgroundColor: `${depthColor}15`, borderRadius: RADIUS.full,
            paddingHorizontal: 10, paddingVertical: 4,
          }}>
            <Text style={{ color: depthColor, fontSize: FONTS.sizes.xs, fontWeight: '600' }}>
              {DEPTH_LABEL[report.depth]}
            </Text>
          </View>
          {(report.sections?.length ?? 0) > 0 && (
            <View style={{
              backgroundColor: `${COLORS.primary}10`, borderRadius: RADIUS.full,
              paddingHorizontal: 10, paddingVertical: 4,
            }}>
              <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.xs }}>
                {report.sections.length} sections
              </Text>
            </View>
          )}
          {(report.citations?.length ?? 0) > 0 && (
            <View style={{
              backgroundColor: `${COLORS.textMuted}15`, borderRadius: RADIUS.full,
              paddingHorizontal: 10, paddingVertical: 4,
            }}>
              <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
                {report.citations.length} sources
              </Text>
            </View>
          )}
          {report.reliabilityScore > 0 && (
            <View style={{
              backgroundColor: `${COLORS.success}10`, borderRadius: RADIUS.full,
              paddingHorizontal: 10, paddingVertical: 4,
            }}>
              <Text style={{ color: COLORS.success, fontSize: FONTS.sizes.xs }}>
                {report.reliabilityScore}/10 ✓
              </Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function HistoryScreen() {
  const { profile } = useAuth();
  const { reports: rawReports, loading, refreshing, refresh, deleteReport } = useHistory();

  const [pinnedOverrides, setPinnedOverrides] = useState<Record<string, boolean>>({});
  const reports: ResearchReport[] = rawReports.map(r => ({
    ...r,
    isPinned: r.id in pinnedOverrides ? pinnedOverrides[r.id] : (r.isPinned ?? false),
  }));

  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter]           = useState<FilterKey>('all');
  const [compareMode, setCompareMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const [showCollectionsManager, setShowCollectionsManager] = useState(false);
  const [collectionTarget, setCollectionTarget]             = useState<ResearchReport | null>(null);

  // ── Bookmark ────────────────────────────────────────────────────────────────
  const handleToggleBookmark = useCallback(async (report: ResearchReport) => {
    const currentPinned = report.id in pinnedOverrides
      ? pinnedOverrides[report.id]
      : (report.isPinned ?? false);
    const newVal = !currentPinned;
    setPinnedOverrides(prev => ({ ...prev, [report.id]: newVal }));
    try {
      await supabase
        .from('research_reports')
        .update({ is_pinned: newVal })
        .eq('id', report.id);
    } catch {
      setPinnedOverrides(prev => ({ ...prev, [report.id]: currentPinned }));
      Alert.alert('Error', 'Could not update bookmark.');
    }
  }, [pinnedOverrides]);

  // ── Delete ──────────────────────────────────────────────────────────────────
  const handleDelete = useCallback((report: ResearchReport) => {
    Alert.alert(
      'Delete Report',
      `Delete "${report.title}"?\nThis cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteReport(report.id) },
      ],
    );
  }, [deleteReport]);

  // ── Compare ─────────────────────────────────────────────────────────────────
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= 2) {
        Alert.alert('Maximum 2', 'You can only compare two reports at a time.');
        return prev;
      }
      return [...prev, id];
    });
  }, []);

  const exitCompareMode = () => { setCompareMode(false); setSelectedIds([]); };

  const handleCompare = () => {
    if (selectedIds.length !== 2) {
      Alert.alert('Select 2 Reports', 'Please tap exactly two reports to compare.');
      return;
    }
    router.push({
      pathname: '/(app)/compare-reports' as any,
      params: { leftId: selectedIds[0], rightId: selectedIds[1] },
    });
    exitCompareMode();
  };

  // ── Filter ──────────────────────────────────────────────────────────────────
  const filtered = reports.filter(r => {
    const q = searchQuery.toLowerCase();
    const matchSearch = r.title?.toLowerCase().includes(q) || r.query?.toLowerCase().includes(q);
    if (!matchSearch) return false;
    if (filter === 'quick' || filter === 'deep' || filter === 'expert') return r.depth === filter;
    return true;
  });

  const sorted = [...filtered].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  const bookmarkedCount = reports.filter(r => r.isPinned === true).length;

  const FILTER_TABS: { key: FilterKey; label: string }[] = [
    { key: 'all',    label: 'All'    },
    { key: 'quick',  label: 'Quick'  },
    { key: 'deep',   label: 'Deep'   },
    { key: 'expert', label: 'Expert' },
  ];

  return (
    <LinearGradient colors={[COLORS.background, COLORS.backgroundCard]} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }}>

        {/* ════════════════════════════════════════════════════════════════
            HEADER
            ─ Row 1: Title (flex: 1) + Avatar (fixed, never scrolls)
            ─ Row 2: Action pills in a horizontal ScrollView
            ─ Thin divider
        ════════════════════════════════════════════════════════════════ */}
        <Animated.View entering={FadeIn.duration(600)}>

          {/* Row 1 — title + avatar */}
          <View
            style={{
              flexDirection:     'row',
              alignItems:        'center',
              paddingHorizontal: SPACING.xl,
              paddingTop:        SPACING.md,
              paddingBottom:     SPACING.sm,
              gap:               SPACING.md,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  color:      COLORS.textPrimary,
                  fontSize:   FONTS.sizes.xl,
                  fontWeight: '800',
                  lineHeight: 26,
                }}
                numberOfLines={1}
              >
                Research History
              </Text>
              <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.sm, marginTop: 2 }}>
                {reports.length} report{reports.length !== 1 ? 's' : ''}
                {bookmarkedCount > 0 ? `  ·  ${bookmarkedCount} saved` : ''}
              </Text>
            </View>

            {/* Avatar — always pinned, never scrolls */}
            <View style={{ flexShrink: 0 }}>
              <Avatar url={profile?.avatar_url} name={profile?.full_name} size={42} />
            </View>
          </View>

          {/* Row 2 — scrollable action pills */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{
              paddingHorizontal: SPACING.xl,
              paddingBottom:     SPACING.md,
              gap:               8,
            }}
          >
            <ActionPill
              icon="search-outline"
              label="Search"
              onPress={() => router.push('/(app)/global-search' as any)}
            />

            <ActionPill
              icon="folder-outline"
              label="Collections"
              onPress={() => setShowCollectionsManager(true)}
              active
            />

            <ActionPill
              icon={bookmarkedCount > 0 ? 'bookmark' : 'bookmark-outline'}
              label="Saved"
              badge={bookmarkedCount > 0 ? bookmarkedCount : undefined}
              onPress={() => router.push('/(app)/bookmarks' as any)}
              active={bookmarkedCount > 0}
            />

            <ActionPill
              icon="git-compare-outline"
              label={compareMode ? 'Exit Compare' : 'Compare'}
              onPress={() => (compareMode ? exitCompareMode() : setCompareMode(true))}
              active={compareMode}
            />
          </ScrollView>

          {/* Divider */}
          <View
            style={{
              height:            1,
              backgroundColor:   COLORS.border,
              marginHorizontal:  SPACING.xl,
              marginBottom:      SPACING.sm,
              opacity:           0.5,
            }}
          />
        </Animated.View>

        {/* ── Compare banner ──────────────────────────────────────────── */}
        {compareMode && (
          <Animated.View
            entering={FadeIn.duration(300)}
            style={{ paddingHorizontal: SPACING.xl, marginBottom: SPACING.sm }}
          >
            <LinearGradient
              colors={['#1A1A40', '#12122A']}
              style={{
                borderRadius:  RADIUS.lg,
                padding:       SPACING.md,
                flexDirection: 'row',
                alignItems:    'center',
                justifyContent:'space-between',
                borderWidth:   1,
                borderColor:   `${COLORS.primary}35`,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.sm, fontWeight: '700' }}>
                  Compare Mode
                </Text>
                <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 2 }}>
                  {selectedIds.length === 0 && 'Tap two reports to compare'}
                  {selectedIds.length === 1 && 'Select one more report'}
                  {selectedIds.length === 2 && '✓ Ready to compare!'}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', gap: SPACING.sm, alignItems: 'center' }}>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {[0, 1].map(i => (
                    <View
                      key={i}
                      style={{
                        width:           10,
                        height:          10,
                        borderRadius:    5,
                        backgroundColor: selectedIds.length > i ? COLORS.primary : COLORS.border,
                      }}
                    />
                  ))}
                </View>
                {selectedIds.length === 2 && (
                  <TouchableOpacity
                    onPress={handleCompare}
                    style={{
                      backgroundColor:  COLORS.primary,
                      borderRadius:     RADIUS.md,
                      paddingHorizontal: 14,
                      paddingVertical:  7,
                    }}
                  >
                    <Text style={{ color: '#FFF', fontSize: FONTS.sizes.sm, fontWeight: '700' }}>
                      Compare →
                    </Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  onPress={exitCompareMode}
                  hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                >
                  <Ionicons name="close" size={20} color={COLORS.textMuted} />
                </TouchableOpacity>
              </View>
            </LinearGradient>
          </Animated.View>
        )}

        {/* ── Search bar ───────────────────────────────────────────────── */}
        <Animated.View
          entering={FadeInDown.duration(400).delay(100)}
          style={{ paddingHorizontal: SPACING.xl, marginBottom: SPACING.sm }}
        >
          <TouchableOpacity
            onPress={() => router.push('/(app)/global-search' as any)}
            activeOpacity={0.8}
            style={{
              backgroundColor:   COLORS.backgroundCard,
              borderRadius:      RADIUS.lg,
              flexDirection:     'row',
              alignItems:        'center',
              paddingHorizontal: SPACING.md,
              paddingVertical:   10,
              borderWidth:       1,
              borderColor:       COLORS.border,
            }}
          >
            <Ionicons name="search" size={17} color={COLORS.textMuted} />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search reports…"
              placeholderTextColor={COLORS.textMuted}
              style={{
                flex:       1,
                color:      COLORS.textPrimary,
                fontSize:   FONTS.sizes.sm,
                marginLeft: 10,
              }}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity
                onPress={() => setSearchQuery('')}
                hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
              >
                <Ionicons name="close-circle" size={17} color={COLORS.textMuted} />
              </TouchableOpacity>
            )}
          </TouchableOpacity>
        </Animated.View>

        {/* ── Depth filter tabs ─────────────────────────────────────────── */}
        <Animated.View entering={FadeInDown.duration(400).delay(150)}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{
              paddingHorizontal: SPACING.xl,
              gap:               8,
              paddingBottom:     SPACING.sm,
            }}
          >
            {FILTER_TABS.map(tab => {
              const isActive = filter === tab.key;
              return (
                <TouchableOpacity
                  key={tab.key}
                  onPress={() => setFilter(tab.key)}
                  style={{
                    backgroundColor:   isActive ? COLORS.primary : COLORS.backgroundCard,
                    borderRadius:      RADIUS.full,
                    paddingHorizontal: 14,
                    paddingVertical:   7,
                    borderWidth:       1,
                    borderColor:       isActive ? COLORS.primary : COLORS.border,
                  }}
                >
                  <Text
                    style={{
                      color:      isActive ? '#FFF' : COLORS.textMuted,
                      fontSize:   FONTS.sizes.sm,
                      fontWeight: '600',
                    }}
                  >
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </Animated.View>

        {/* ── Report list ───────────────────────────────────────────────── */}
        <ScrollView
          contentContainerStyle={{
            padding:       SPACING.xl,
            paddingTop:    SPACING.sm,
            paddingBottom: 110,
          }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={COLORS.primary} />
          }
        >
          {/* Loading skeletons */}
          {loading && reports.length === 0 &&
            Array.from({ length: 3 }).map((_, i) => (
              <View
                key={i}
                style={{
                  backgroundColor: COLORS.backgroundCard,
                  borderRadius:    RADIUS.xl,
                  height:          130,
                  marginBottom:    SPACING.sm,
                  borderWidth:     1,
                  borderColor:     COLORS.border,
                  opacity:         1 - i * 0.25,
                }}
              />
            ))
          }

          {/* Empty state */}
          {!loading && sorted.length === 0 && (
            <Animated.View entering={FadeIn.duration(600)} style={{ alignItems: 'center', paddingTop: 80 }}>
              <View
                style={{
                  width: 80, height: 80, borderRadius: 24,
                  backgroundColor: COLORS.backgroundElevated,
                  alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.lg,
                }}
              >
                <Ionicons name="time-outline" size={36} color={COLORS.border} />
              </View>
              <Text
                style={{
                  color: COLORS.textPrimary, fontSize: FONTS.sizes.lg,
                  fontWeight: '700', textAlign: 'center',
                }}
              >
                {searchQuery ? 'No results found' : 'No research yet'}
              </Text>
              <Text
                style={{
                  color: COLORS.textMuted, fontSize: FONTS.sizes.sm,
                  textAlign: 'center', marginTop: SPACING.sm,
                  lineHeight: 20, paddingHorizontal: SPACING.xl,
                }}
              >
                {searchQuery
                  ? 'Try a different search term'
                  : 'Start your first research on the Home tab'}
              </Text>
              {filter !== 'all' && (
                <TouchableOpacity
                  onPress={() => setFilter('all')}
                  style={{
                    marginTop:       SPACING.lg,
                    backgroundColor: `${COLORS.primary}20`,
                    borderRadius:    RADIUS.full,
                    paddingHorizontal: SPACING.xl,
                    paddingVertical: 12,
                    borderWidth:     1,
                    borderColor:     `${COLORS.primary}40`,
                  }}
                >
                  <Text style={{ color: COLORS.primary, fontWeight: '700', fontSize: FONTS.sizes.base }}>
                    Show All Reports
                  </Text>
                </TouchableOpacity>
              )}
              {filter === 'all' && !searchQuery && (
                <TouchableOpacity
                  onPress={() => router.push('/(app)/(tabs)/home')}
                  style={{ marginTop: SPACING.lg }}
                >
                  <LinearGradient
                    colors={COLORS.gradientPrimary}
                    style={{
                      borderRadius:      RADIUS.full,
                      paddingHorizontal: SPACING.xl,
                      paddingVertical:   12,
                      flexDirection:     'row',
                      alignItems:        'center',
                      gap:               8,
                    }}
                  >
                    <Ionicons name="telescope-outline" size={18} color="#FFF" />
                    <Text style={{ color: '#FFF', fontWeight: '700', fontSize: FONTS.sizes.base }}>
                      Start Research
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>
              )}
            </Animated.View>
          )}

          {/* Report cards */}
          {sorted.map((report, i) => (
            <ReportCard
              key={report.id}
              report={report}
              index={i}
              compareMode={compareMode}
              isSelected={selectedIds.includes(report.id)}
              onToggleSelect={() => toggleSelect(report.id)}
              onOpen={() =>
                router.push({
                  pathname: '/(app)/research-report' as any,
                  params:   { reportId: report.id },
                })
              }
              onDelete={() => handleDelete(report)}
              onToggleBookmark={() => handleToggleBookmark(report)}
              onAddToCollection={() => setCollectionTarget(report)}
            />
          ))}
        </ScrollView>
      </SafeAreaView>

      {/* ── Sheets ──────────────────────────────────────────────────────── */}
      <ManageCollectionsSheet
        visible={showCollectionsManager}
        onClose={() => setShowCollectionsManager(false)}
      />

      {collectionTarget && (
        <AddToCollectionSheet
          visible={!!collectionTarget}
          contentType="report"
          contentId={collectionTarget.id}
          contentTitle={collectionTarget.title}
          onClose={() => setCollectionTarget(null)}
        />
      )}
    </LinearGradient>
  );
}