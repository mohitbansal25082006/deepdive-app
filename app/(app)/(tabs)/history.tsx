// app/(app)/(tabs)/history.tsx
// - Optimistic bookmark toggle: isPinned flips instantly in local state → icon fills immediately
// - Bookmarked reports look identical to normal cards — ONLY the bookmark icon fills (no gold glow, no special bg)
// - Bookmarked filter tab removed; header bookmark button navigates to /bookmarks
// - Compare mode, search, depth filter tabs all preserved

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
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown, Layout } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useHistory } from '../../../src/hooks/useHistory';
import { Avatar } from '../../../src/components/common/Avatar';
import { useAuth } from '../../../src/context/AuthContext';
import { ResearchReport } from '../../../src/types';
import { supabase } from '../../../src/lib/supabase';
import { COLORS, FONTS, SPACING, RADIUS } from '../../../src/constants/theme';

// ─── Constants ────────────────────────────────────────────────────────────────

const DEPTH_COLOR: Record<string, string> = {
  quick: COLORS.info,
  deep: COLORS.primary,
  expert: COLORS.warning,
};
const DEPTH_LABEL: Record<string, string> = {
  quick: 'Quick',
  deep: 'Deep',
  expert: 'Expert',
};

type FilterKey = 'all' | 'quick' | 'deep' | 'expert';

// ─── Report Card ──────────────────────────────────────────────────────────────

interface ReportCardProps {
  report: ResearchReport;
  index: number;
  compareMode: boolean;
  isSelected: boolean;
  onOpen: () => void;
  onDelete: () => void;
  onToggleBookmark: () => void;
  onToggleSelect: () => void;
}

function ReportCard({
  report, index, compareMode, isSelected,
  onOpen, onDelete, onToggleBookmark, onToggleSelect,
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
        onLongPress={() => { if (!compareMode) onToggleSelect(); }}
        activeOpacity={0.75}
        style={{
          // Card appearance is identical whether bookmarked or not.
          // Only the bookmark icon inside changes.
          backgroundColor: compareMode && isSelected
            ? `${COLORS.primary}15`
            : COLORS.backgroundCard,
          borderRadius: RADIUS.xl,
          padding: SPACING.md,
          marginBottom: SPACING.sm,
          borderWidth: compareMode && isSelected ? 1.5 : 1,
          borderColor: compareMode && isSelected
            ? COLORS.primary
            : COLORS.border,
        }}
      >
        {/* ── Top row ── */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: SPACING.sm }}>

          {/* Left icon / compare checkbox */}
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
              borderWidth: 1,
              borderColor: `${depthColor}30`,
            }}>
              <Ionicons
                name="document-text"
                size={20}
                color={depthColor}
              />
            </View>
          )}

          {/* Title + date */}
          <View style={{ flex: 1 }}>
            <Text
              style={{
                color: COLORS.textPrimary,
                fontSize: FONTS.sizes.base,
                fontWeight: '700',
                lineHeight: 20,
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

          {/* Action buttons — hidden in compare mode */}
          {!compareMode && (
            <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center', marginLeft: SPACING.sm }}>
              {/*
                Bookmark button:
                  FILLED  ('bookmark')         when isPinned === true  — only visual change
                  OUTLINE ('bookmark-outline') when isPinned === false
                  No background pill, no gold colour, no shadow — just icon state.
              */}
              <TouchableOpacity
                onPress={onToggleBookmark}
                hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
                style={{ padding: 5 }}
              >
                <Ionicons
                  name={isBookmarked ? 'bookmark' : 'bookmark-outline'}
                  size={21}
                  color={isBookmarked ? COLORS.primary : COLORS.textMuted}
                />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={onDelete}
                hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
                style={{ padding: 5 }}
              >
                <Ionicons name="trash-outline" size={19} color={COLORS.textMuted} />
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Executive summary */}
        {report.executiveSummary ? (
          <Text
            style={{
              color: COLORS.textSecondary,
              fontSize: FONTS.sizes.xs,
              lineHeight: 18,
              marginBottom: SPACING.sm,
            }}
            numberOfLines={2}
          >
            {report.executiveSummary}
          </Text>
        ) : null}

        {/* Chips — no "Saved" chip shown in history */}
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
          <View style={{
            backgroundColor: `${depthColor}15`,
            borderRadius: RADIUS.full,
            paddingHorizontal: 10, paddingVertical: 4,
          }}>
            <Text style={{ color: depthColor, fontSize: FONTS.sizes.xs, fontWeight: '600' }}>
              {DEPTH_LABEL[report.depth]}
            </Text>
          </View>

          {(report.sections?.length ?? 0) > 0 && (
            <View style={{
              backgroundColor: `${COLORS.primary}10`,
              borderRadius: RADIUS.full,
              paddingHorizontal: 10, paddingVertical: 4,
            }}>
              <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.xs }}>
                {report.sections.length} sections
              </Text>
            </View>
          )}

          {(report.citations?.length ?? 0) > 0 && (
            <View style={{
              backgroundColor: `${COLORS.textMuted}15`,
              borderRadius: RADIUS.full,
              paddingHorizontal: 10, paddingVertical: 4,
            }}>
              <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
                {report.citations.length} sources
              </Text>
            </View>
          )}

          {report.reliabilityScore > 0 && (
            <View style={{
              backgroundColor: `${COLORS.success}10`,
              borderRadius: RADIUS.full,
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

  // ── Local override map for optimistic bookmark state ──────────────────────
  const [pinnedOverrides, setPinnedOverrides] = useState<Record<string, boolean>>({});

  const reports: ResearchReport[] = rawReports.map((r) => ({
    ...r,
    isPinned: r.id in pinnedOverrides ? pinnedOverrides[r.id] : (r.isPinned ?? false),
  }));

  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter]           = useState<FilterKey>('all');
  const [compareMode, setCompareMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // ── Optimistic bookmark toggle ─────────────────────────────────────────────

  const handleToggleBookmark = useCallback(async (report: ResearchReport) => {
    const currentPinned = report.id in pinnedOverrides
      ? pinnedOverrides[report.id]
      : (report.isPinned ?? false);
    const newVal = !currentPinned;

    // Flip locally immediately
    setPinnedOverrides((prev) => ({ ...prev, [report.id]: newVal }));

    // Persist in background
    try {
      await supabase
        .from('research_reports')
        .update({ is_pinned: newVal })
        .eq('id', report.id);
    } catch {
      // Rollback on failure
      setPinnedOverrides((prev) => ({ ...prev, [report.id]: currentPinned }));
      Alert.alert('Error', 'Could not update bookmark. Please try again.');
    }
  }, [pinnedOverrides]);

  // ── Delete ─────────────────────────────────────────────────────────────────

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

  // ── Compare mode ───────────────────────────────────────────────────────────

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) {
        Alert.alert('Maximum 2', 'You can only compare two reports at a time.');
        return prev;
      }
      return [...prev, id];
    });
  }, []);

  const exitCompareMode = () => {
    setCompareMode(false);
    setSelectedIds([]);
  };

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

  // ── Filter ─────────────────────────────────────────────────────────────────

  const filtered = reports.filter((r) => {
    const q = searchQuery.toLowerCase();
    const matchSearch =
      r.title?.toLowerCase().includes(q) ||
      r.query?.toLowerCase().includes(q);
    if (!matchSearch) return false;
    if (filter === 'quick' || filter === 'deep' || filter === 'expert')
      return r.depth === filter;
    return true;
  });

  // Sort by date descending — no pinned-float in history view
  const sorted = [...filtered].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  const bookmarkedCount = reports.filter((r) => r.isPinned === true).length;

  const FILTER_TABS: { key: FilterKey; label: string }[] = [
    { key: 'all',    label: 'All'    },
    { key: 'quick',  label: 'Quick'  },
    { key: 'deep',   label: 'Deep'   },
    { key: 'expert', label: 'Expert' },
  ];

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <LinearGradient colors={[COLORS.background, COLORS.backgroundCard]} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }}>

        {/* ── Header ───────────────────────────────────────────────────── */}
        <Animated.View
          entering={FadeIn.duration(600)}
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: SPACING.xl,
            paddingBottom: SPACING.md,
          }}
        >
          <View>
            <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.xl, fontWeight: '800' }}>
              Research History
            </Text>
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.sm }}>
              {reports.length} report{reports.length !== 1 ? 's' : ''}
              {bookmarkedCount > 0 ? `  ·  ${bookmarkedCount} saved` : ''}
            </Text>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm }}>

            {/* Bookmarks page shortcut */}
            <TouchableOpacity
              onPress={() => router.push('/(app)/bookmarks' as any)}
              style={{
                width: 40, height: 40, borderRadius: 12,
                backgroundColor: COLORS.backgroundElevated,
                alignItems: 'center', justifyContent: 'center',
                borderWidth: 1,
                borderColor: COLORS.border,
              }}
            >
              <Ionicons
                name={bookmarkedCount > 0 ? 'bookmark' : 'bookmark-outline'}
                size={18}
                color={bookmarkedCount > 0 ? COLORS.primary : COLORS.textMuted}
              />
            </TouchableOpacity>

            {/* Compare toggle */}
            <TouchableOpacity
              onPress={() => compareMode ? exitCompareMode() : setCompareMode(true)}
              style={{
                width: 40, height: 40, borderRadius: 12,
                backgroundColor: compareMode ? `${COLORS.primary}20` : COLORS.backgroundElevated,
                alignItems: 'center', justifyContent: 'center',
                borderWidth: 1,
                borderColor: compareMode ? COLORS.primary : COLORS.border,
              }}
            >
              <Ionicons
                name="git-compare-outline"
                size={18}
                color={compareMode ? COLORS.primary : COLORS.textMuted}
              />
            </TouchableOpacity>

            <Avatar url={profile?.avatar_url} name={profile?.full_name} size={44} />
          </View>
        </Animated.View>

        {/* ── Compare banner ────────────────────────────────────────────── */}
        {compareMode && (
          <Animated.View
            entering={FadeIn.duration(300)}
            style={{ paddingHorizontal: SPACING.xl, marginBottom: SPACING.sm }}
          >
            <LinearGradient
              colors={['#1A1A40', '#12122A']}
              style={{
                borderRadius: RADIUS.lg,
                padding: SPACING.md,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderWidth: 1,
                borderColor: `${COLORS.primary}35`,
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
                  {[0, 1].map((i) => (
                    <View
                      key={i}
                      style={{
                        width: 10, height: 10, borderRadius: 5,
                        backgroundColor: selectedIds.length > i ? COLORS.primary : COLORS.border,
                      }}
                    />
                  ))}
                </View>

                {selectedIds.length === 2 && (
                  <TouchableOpacity
                    onPress={handleCompare}
                    style={{
                      backgroundColor: COLORS.primary,
                      borderRadius: RADIUS.md,
                      paddingHorizontal: 14, paddingVertical: 7,
                    }}
                  >
                    <Text style={{ color: '#FFF', fontSize: FONTS.sizes.sm, fontWeight: '700' }}>
                      Compare →
                    </Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity onPress={exitCompareMode}>
                  <Ionicons name="close" size={20} color={COLORS.textMuted} />
                </TouchableOpacity>
              </View>
            </LinearGradient>
          </Animated.View>
        )}

        {/* ── Search ───────────────────────────────────────────────────── */}
        <Animated.View
          entering={FadeInDown.duration(400).delay(100)}
          style={{ paddingHorizontal: SPACING.xl, marginBottom: SPACING.sm }}
        >
          <View style={{
            backgroundColor: COLORS.backgroundCard,
            borderRadius: RADIUS.lg,
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: SPACING.md,
            paddingVertical: 10,
            borderWidth: 1,
            borderColor: COLORS.border,
          }}>
            <Ionicons name="search" size={18} color={COLORS.textMuted} />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search reports..."
              placeholderTextColor={COLORS.textMuted}
              style={{ flex: 1, color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, marginLeft: 10 }}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={18} color={COLORS.textMuted} />
              </TouchableOpacity>
            )}
          </View>
        </Animated.View>

        {/* ── Filter tabs ───────────────────────────────────────────────── */}
        <Animated.View entering={FadeInDown.duration(400).delay(150)}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: SPACING.xl, gap: 8, paddingBottom: SPACING.sm }}
          >
            {FILTER_TABS.map((tab) => {
              const isActive = filter === tab.key;
              return (
                <TouchableOpacity
                  key={tab.key}
                  onPress={() => setFilter(tab.key)}
                  style={{
                    backgroundColor: isActive ? COLORS.primary : COLORS.backgroundCard,
                    borderRadius: RADIUS.full,
                    paddingHorizontal: 14, paddingVertical: 7,
                    borderWidth: 1,
                    borderColor: isActive ? COLORS.primary : COLORS.border,
                  }}
                >
                  <Text style={{
                    color: isActive ? '#FFF' : COLORS.textMuted,
                    fontSize: FONTS.sizes.sm,
                    fontWeight: '600',
                  }}>
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </Animated.View>

        {/* ── Report list ───────────────────────────────────────────────── */}
        <ScrollView
          contentContainerStyle={{ padding: SPACING.xl, paddingTop: SPACING.sm, paddingBottom: 110 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={COLORS.primary} />
          }
        >
          {/* Loading skeletons */}
          {loading && reports.length === 0 && (
            Array.from({ length: 3 }).map((_, i) => (
              <View
                key={i}
                style={{
                  backgroundColor: COLORS.backgroundCard,
                  borderRadius: RADIUS.xl,
                  height: 130,
                  marginBottom: SPACING.sm,
                  borderWidth: 1,
                  borderColor: COLORS.border,
                  opacity: 1 - i * 0.25,
                }}
              />
            ))
          )}

          {/* Empty state */}
          {!loading && sorted.length === 0 && (
            <Animated.View entering={FadeIn.duration(600)} style={{ alignItems: 'center', paddingTop: 80 }}>
              <View style={{
                width: 80, height: 80, borderRadius: 24,
                backgroundColor: COLORS.backgroundElevated,
                alignItems: 'center', justifyContent: 'center',
                marginBottom: SPACING.lg,
              }}>
                <Ionicons name="time-outline" size={36} color={COLORS.border} />
              </View>

              <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.lg, fontWeight: '700', textAlign: 'center' }}>
                {searchQuery ? 'No results found' : 'No research yet'}
              </Text>
              <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.sm, textAlign: 'center', marginTop: SPACING.sm, lineHeight: 20, paddingHorizontal: SPACING.xl }}>
                {searchQuery ? 'Try a different search term' : 'Start your first research on the Home tab'}
              </Text>

              {filter !== 'all' && (
                <TouchableOpacity
                  onPress={() => setFilter('all')}
                  style={{ marginTop: SPACING.lg, backgroundColor: `${COLORS.primary}20`, borderRadius: RADIUS.full, paddingHorizontal: SPACING.xl, paddingVertical: 12, borderWidth: 1, borderColor: `${COLORS.primary}40` }}
                >
                  <Text style={{ color: COLORS.primary, fontWeight: '700', fontSize: FONTS.sizes.base }}>
                    Show All Reports
                  </Text>
                </TouchableOpacity>
              )}

              {filter === 'all' && !searchQuery && (
                <TouchableOpacity onPress={() => router.push('/(app)/(tabs)/home')} style={{ marginTop: SPACING.lg }}>
                  <LinearGradient
                    colors={COLORS.gradientPrimary}
                    style={{ borderRadius: RADIUS.full, paddingHorizontal: SPACING.xl, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }}
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

          {/* Populated list */}
          {sorted.length > 0 && sorted.map((report, i) => (
            <ReportCard
              key={report.id}
              report={report}
              index={i}
              compareMode={compareMode}
              isSelected={selectedIds.includes(report.id)}
              onToggleSelect={() => toggleSelect(report.id)}
              onOpen={() => router.push({ pathname: '/(app)/research-report' as any, params: { reportId: report.id } })}
              onDelete={() => handleDelete(report)}
              onToggleBookmark={() => handleToggleBookmark(report)}
            />
          ))}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}