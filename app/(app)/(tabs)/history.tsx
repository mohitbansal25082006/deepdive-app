// app/(app)/(tabs)/history.tsx
// Part 3 update: bookmarks, filter tabs, compare mode (select 2 → compare).
// Subscription references removed.

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

type FilterKey = 'all' | 'bookmarked' | 'quick' | 'deep' | 'expert';

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
  const depthColor  = DEPTH_COLOR[report.depth] ?? COLORS.primary;
  const isBookmarked = report.isPinned ?? false;

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
          backgroundColor: compareMode && isSelected
            ? `${COLORS.primary}15`
            : COLORS.backgroundCard,
          borderRadius: RADIUS.xl,
          padding: SPACING.md,
          marginBottom: SPACING.sm,
          borderWidth: compareMode && isSelected ? 1.5 : 1,
          borderColor: compareMode && isSelected ? COLORS.primary : COLORS.border,
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
              borderWidth: 1, borderColor: `${depthColor}30`,
            }}>
              <Ionicons name="document-text" size={20} color={depthColor} />
            </View>
          )}

          {/* Title + date */}
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              {isBookmarked && (
                <Ionicons name="bookmark" size={13} color={COLORS.warning} />
              )}
              <Text
                style={{
                  color: COLORS.textPrimary,
                  fontSize: FONTS.sizes.base,
                  fontWeight: '700',
                  lineHeight: 20,
                  flex: 1,
                }}
                numberOfLines={2}
              >
                {report.title}
              </Text>
            </View>
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 4 }}>
              {new Date(report.createdAt).toLocaleDateString('en-US', {
                month: 'short', day: 'numeric', year: 'numeric',
              })}
            </Text>
          </View>

          {/* Action buttons (not shown in compare mode) */}
          {!compareMode && (
            <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center', marginLeft: SPACING.sm }}>
              <TouchableOpacity
                onPress={onToggleBookmark}
                hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
              >
                <Ionicons
                  name={isBookmarked ? 'bookmark' : 'bookmark-outline'}
                  size={21}
                  color={isBookmarked ? COLORS.warning : COLORS.textMuted}
                />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={onDelete}
                hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
              >
                <Ionicons name="trash-outline" size={19} color={COLORS.textMuted} />
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Executive summary preview */}
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

        {/* Chips */}
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
  const { reports, loading, refreshing, refresh, deleteReport } = useHistory();

  const [searchQuery, setSearchQuery]   = useState('');
  const [filter, setFilter]             = useState<FilterKey>('all');
  const [compareMode, setCompareMode]   = useState(false);
  const [selectedIds, setSelectedIds]   = useState<string[]>([]);

  // ── Bookmark toggle ────────────────────────────────────────────────────────

  const handleToggleBookmark = useCallback(async (report: ResearchReport) => {
    const newVal = !(report.isPinned ?? false);
    await supabase
      .from('research_reports')
      .update({ is_pinned: newVal })
      .eq('id', report.id);
    refresh();
  }, [refresh]);

  // ── Delete ─────────────────────────────────────────────────────────────────

  const handleDelete = useCallback((report: ResearchReport) => {
    Alert.alert(
      'Delete Report',
      `Delete "${report.title}"?\nThis cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteReport(report.id),
        },
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

  // ── Filter + sort ──────────────────────────────────────────────────────────

  const filtered = reports.filter((r) => {
    const q = searchQuery.toLowerCase();
    const matchSearch =
      r.title?.toLowerCase().includes(q) ||
      r.query?.toLowerCase().includes(q);
    if (!matchSearch) return false;
    if (filter === 'bookmarked') return r.isPinned === true;
    if (filter === 'quick' || filter === 'deep' || filter === 'expert')
      return r.depth === filter;
    return true;
  });

  // Pinned reports bubble to top
  const sorted = [...filtered].sort((a, b) => {
    if ((a.isPinned ?? false) === (b.isPinned ?? false)) return 0;
    return (a.isPinned ?? false) ? -1 : 1;
  });

  const bookmarkedCount = reports.filter((r) => r.isPinned).length;

  // ── Filter tab definitions ─────────────────────────────────────────────────

  const FILTER_TABS: { key: FilterKey; label: string; count?: number }[] = [
    { key: 'all',        label: 'All' },
    { key: 'bookmarked', label: 'Bookmarked', count: bookmarkedCount },
    { key: 'quick',      label: 'Quick' },
    { key: 'deep',       label: 'Deep' },
    { key: 'expert',     label: 'Expert' },
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
            <Text style={{
              color: COLORS.textPrimary,
              fontSize: FONTS.sizes.xl,
              fontWeight: '800',
            }}>
              Research History
            </Text>
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.sm }}>
              {reports.length} report{reports.length !== 1 ? 's' : ''}
              {bookmarkedCount > 0 ? `  ·  ${bookmarkedCount} bookmarked` : ''}
            </Text>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm }}>
            {/* Bookmarks shortcut */}
            <TouchableOpacity
              onPress={() => router.push('/(app)/bookmarks' as any)}
              style={{
                width: 40, height: 40, borderRadius: 12,
                backgroundColor: bookmarkedCount > 0
                  ? `${COLORS.warning}15`
                  : COLORS.backgroundElevated,
                alignItems: 'center', justifyContent: 'center',
                borderWidth: 1,
                borderColor: bookmarkedCount > 0
                  ? `${COLORS.warning}35`
                  : COLORS.border,
              }}
            >
              <Ionicons
                name="bookmark"
                size={18}
                color={bookmarkedCount > 0 ? COLORS.warning : COLORS.textMuted}
              />
            </TouchableOpacity>

            {/* Compare toggle */}
            <TouchableOpacity
              onPress={() => compareMode ? exitCompareMode() : setCompareMode(true)}
              style={{
                width: 40, height: 40, borderRadius: 12,
                backgroundColor: compareMode
                  ? `${COLORS.primary}20`
                  : COLORS.backgroundElevated,
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

            <Avatar
              url={profile?.avatar_url}
              name={profile?.full_name}
              size={44}
            />
          </View>
        </Animated.View>

        {/* ── Compare mode banner ───────────────────────────────────────── */}
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
                <Text style={{
                  color: COLORS.primary,
                  fontSize: FONTS.sizes.sm,
                  fontWeight: '700',
                }}>
                  Compare Mode
                </Text>
                <Text style={{
                  color: COLORS.textMuted,
                  fontSize: FONTS.sizes.xs,
                  marginTop: 2,
                }}>
                  {selectedIds.length === 0 && 'Tap two reports to compare'}
                  {selectedIds.length === 1 && 'Select one more report'}
                  {selectedIds.length === 2 && '✓ Ready to compare!'}
                </Text>
              </View>

              <View style={{ flexDirection: 'row', gap: SPACING.sm, alignItems: 'center' }}>
                {/* Progress dots */}
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {[0, 1].map((i) => (
                    <View
                      key={i}
                      style={{
                        width: 10, height: 10, borderRadius: 5,
                        backgroundColor: selectedIds.length > i
                          ? COLORS.primary
                          : COLORS.border,
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
                    <Text style={{
                      color: '#FFF',
                      fontSize: FONTS.sizes.sm,
                      fontWeight: '700',
                    }}>
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
              style={{
                flex: 1,
                color: COLORS.textPrimary,
                fontSize: FONTS.sizes.sm,
                marginLeft: 10,
              }}
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
            contentContainerStyle={{
              paddingHorizontal: SPACING.xl,
              gap: 8,
              paddingBottom: SPACING.sm,
            }}
          >
            {FILTER_TABS.map((tab) => {
              const isActive      = filter === tab.key;
              const isBookmarkTab = tab.key === 'bookmarked';
              const activeColor   = isBookmarkTab ? COLORS.warning : COLORS.primary;

              return (
                <TouchableOpacity
                  key={tab.key}
                  onPress={() => setFilter(tab.key)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 5,
                    backgroundColor: isActive ? activeColor : COLORS.backgroundCard,
                    borderRadius: RADIUS.full,
                    paddingHorizontal: 14, paddingVertical: 7,
                    borderWidth: 1,
                    borderColor: isActive ? activeColor : COLORS.border,
                  }}
                >
                  {isBookmarkTab && (
                    <Ionicons
                      name="bookmark"
                      size={12}
                      color={isActive ? '#000' : COLORS.warning}
                    />
                  )}
                  <Text style={{
                    color: isActive
                      ? isBookmarkTab ? '#000' : '#FFF'
                      : COLORS.textMuted,
                    fontSize: FONTS.sizes.sm,
                    fontWeight: '600',
                  }}>
                    {tab.label}
                  </Text>
                  {tab.count !== undefined && tab.count > 0 && (
                    <View style={{
                      backgroundColor: isActive
                        ? 'rgba(0,0,0,0.25)'
                        : `${COLORS.warning}25`,
                      borderRadius: RADIUS.full,
                      paddingHorizontal: 6, paddingVertical: 1,
                      minWidth: 18,
                      alignItems: 'center',
                    }}>
                      <Text style={{
                        color: isActive
                          ? isBookmarkTab ? '#000' : '#FFF'
                          : COLORS.warning,
                        fontSize: 10,
                        fontWeight: '700',
                      }}>
                        {tab.count}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </Animated.View>

        {/* ── Report list ───────────────────────────────────────────────── */}
        <ScrollView
          contentContainerStyle={{
            padding: SPACING.xl,
            paddingTop: SPACING.sm,
            paddingBottom: 110,
          }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refresh}
              tintColor={COLORS.primary}
            />
          }
        >
          {/* Loading skeleton */}
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
            <Animated.View
              entering={FadeIn.duration(600)}
              style={{ alignItems: 'center', paddingTop: 80 }}
            >
              <View style={{
                width: 80, height: 80, borderRadius: 24,
                backgroundColor: COLORS.backgroundElevated,
                alignItems: 'center', justifyContent: 'center',
                marginBottom: SPACING.lg,
              }}>
                <Ionicons
                  name={filter === 'bookmarked' ? 'bookmark-outline' : 'time-outline'}
                  size={36}
                  color={COLORS.border}
                />
              </View>

              <Text style={{
                color: COLORS.textPrimary,
                fontSize: FONTS.sizes.lg,
                fontWeight: '700',
                textAlign: 'center',
              }}>
                {filter === 'bookmarked'
                  ? 'No bookmarks yet'
                  : searchQuery
                  ? 'No results found'
                  : 'No research yet'}
              </Text>

              <Text style={{
                color: COLORS.textMuted,
                fontSize: FONTS.sizes.sm,
                textAlign: 'center',
                marginTop: SPACING.sm,
                lineHeight: 20,
                paddingHorizontal: SPACING.xl,
              }}>
                {filter === 'bookmarked'
                  ? 'Tap the bookmark icon on any report to save it here'
                  : searchQuery
                  ? 'Try a different search term'
                  : 'Start your first research on the Home tab'}
              </Text>

              {/* Show All / Start Research buttons */}
              {filter !== 'all' && (
                <TouchableOpacity
                  onPress={() => setFilter('all')}
                  style={{
                    marginTop: SPACING.lg,
                    backgroundColor: `${COLORS.primary}20`,
                    borderRadius: RADIUS.full,
                    paddingHorizontal: SPACING.xl,
                    paddingVertical: 12,
                    borderWidth: 1,
                    borderColor: `${COLORS.primary}40`,
                  }}
                >
                  <Text style={{
                    color: COLORS.primary,
                    fontWeight: '700',
                    fontSize: FONTS.sizes.base,
                  }}>
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
                      borderRadius: RADIUS.full,
                      paddingHorizontal: SPACING.xl,
                      paddingVertical: 12,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <Ionicons name="telescope-outline" size={18} color="#FFF" />
                    <Text style={{
                      color: '#FFF',
                      fontWeight: '700',
                      fontSize: FONTS.sizes.base,
                    }}>
                      Start Research
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>
              )}
            </Animated.View>
          )}

          {/* Populated list */}
          {sorted.length > 0 && (
            <>
              {/* Bookmarked section header */}
              {filter === 'all' && sorted.some((r) => r.isPinned) && (
                <View style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: SPACING.sm,
                }}>
                  <Ionicons name="bookmark" size={13} color={COLORS.warning} />
                  <Text style={{
                    color: COLORS.warning,
                    fontSize: FONTS.sizes.xs,
                    fontWeight: '700',
                    letterSpacing: 0.8,
                    textTransform: 'uppercase',
                  }}>
                    Bookmarked
                  </Text>
                </View>
              )}

              {sorted.map((report, i) => {
                // Divider between pinned and regular sections
                const showDivider =
                  filter === 'all' &&
                  i > 0 &&
                  (sorted[i - 1].isPinned ?? false) &&
                  !(report.isPinned ?? false);

                return (
                  <React.Fragment key={report.id}>
                    {showDivider && (
                      <View style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 8,
                        marginBottom: SPACING.sm,
                        marginTop: SPACING.xs,
                      }}>
                        <View style={{ flex: 1, height: 1, backgroundColor: COLORS.border }} />
                        <Text style={{
                          color: COLORS.textMuted,
                          fontSize: FONTS.sizes.xs,
                          fontWeight: '600',
                          textTransform: 'uppercase',
                          letterSpacing: 0.8,
                        }}>
                          Recent
                        </Text>
                        <View style={{ flex: 1, height: 1, backgroundColor: COLORS.border }} />
                      </View>
                    )}

                    <ReportCard
                      report={report}
                      index={i}
                      compareMode={compareMode}
                      isSelected={selectedIds.includes(report.id)}
                      onToggleSelect={() => toggleSelect(report.id)}
                      onOpen={() =>
                        router.push({
                          pathname: '/(app)/research-report' as any,
                          params: { reportId: report.id },
                        })
                      }
                      onDelete={() => handleDelete(report)}
                      onToggleBookmark={() => handleToggleBookmark(report)}
                    />
                  </React.Fragment>
                );
              })}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}