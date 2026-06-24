// app/(app)/(tabs)/history.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Research History
//
// Part 50.8 — BOOKMARK FIX (consumer side)
//   • Removed the `pinnedOverrides` shim entirely. Bookmark state now comes
//     directly from useHistory (which maps is_pinned and owns the optimistic
//     toggle + rollback + refetch guard).
//   • handleToggleBookmark now just calls toggleBookmark(id) from the hook.
//   • bookmarkedCount is derived from the canonical reports list.
//
// ── Part 55.1 — THEME SYSTEM ──────────────────────────────────────────────────
//   The screen already read COLORS.* inline everywhere, but:
//     1. It did NOT subscribe to useTheme(). We now call useTheme() at the top so
//        the screen re-renders immediately on a theme change.
//     2. Several surface gradients were HARDCODED dark hexes
//        (['#1A1A38','#12122A'], ['#16162F','#101024'], ['#15152F','#0D0D22'],
//        ['#0E0E22','#0B0B1C'], ['#1E1E48','#14142E'], ['#1C1C40','#14142E'],
//        ['#20204A','#16163A'] …) plus a hardcoded background array and
//        'rgba(255,255,255,0.0x)' fills. Those looked broken on the light
//        variants. They are replaced with theme-derived gradients/fills:
//          surfaceCard()/surfaceDeep()/surfaceSelected()/headerBg()/stickyBg()/
//          screenBg()  and hexWithAlpha(COLORS.textPrimary, …) for translucent
//          fills, so everything is correct on dark AND light.
//     3. The `iconBtn` getter-style is kept and made fully theme-aware.
//
// Everything else (header, stats ribbon, animated depth filter, glass cards,
// compare mode, search, skeletons, empty state, scroll-to-top FAB, haptics,
// Collections / Saved / Search navigation) is unchanged.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  RefreshControl,
  Alert,
  Pressable,
  Dimensions,
  LayoutChangeEvent,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons }       from '@expo/vector-icons';
import * as Haptics       from 'expo-haptics';
import Animated, {
  FadeIn, FadeInDown, FadeOut, Layout,
  useSharedValue, useAnimatedStyle, useAnimatedScrollHandler,
  withTiming, withSpring, withSequence, runOnJS, Easing,
} from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { useHistory }     from '../../../src/hooks/useHistory';
import { Avatar }         from '../../../src/components/common/Avatar';
import { useAuth }        from '../../../src/context/AuthContext';
import { useTheme }       from '../../../src/context/ThemeContext';
import { ResearchReport } from '../../../src/types';
import { ManageCollectionsSheet }  from '../../../src/components/collections/ManageCollectionsSheet';
import { AddToCollectionSheet }    from '../../../src/components/collections/AddToCollectionSheet';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../../src/constants/theme';

const SCREEN_W = Dimensions.get('window').width;

// ─── Theme-derived surface helpers (Part 55.1) ────────────────────────────────
function hexWithAlpha(hex: string, alpha: number): string {
  if (typeof hex !== 'string' || hex[0] !== '#') return hex;
  let h = hex.slice(1);
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  if (h.length !== 6) return hex;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
const surfaceCard     = (): [string, string] => [COLORS.backgroundElevated, COLORS.backgroundCard];
const surfaceDeep     = (): [string, string] => [COLORS.backgroundCard, COLORS.background];
const surfaceSelected = (): [string, string] => [COLORS.backgroundElevated, COLORS.backgroundCard];
const screenBg        = (): [string, string, string] => [COLORS.background, COLORS.background, COLORS.backgroundCard];
const headerBg        = (): [string, string] => [COLORS.backgroundCard, COLORS.background];
const stickyBg        = (): [string, string] => [COLORS.background, COLORS.background];

// ─── Constants ────────────────────────────────────────────────────────────────

const DEPTH_COLOR: Record<string, string> = { quick: COLORS.info, deep: COLORS.primary, expert: COLORS.warning };
const DEPTH_LABEL: Record<string, string> = { quick: 'Quick', deep: 'Deep', expert: 'Expert' };
const DEPTH_ICON:  Record<string, string> = { quick: 'flash', deep: 'layers', expert: 'star' };

type FilterKey = 'all' | 'quick' | 'deep' | 'expert';

const haptic = (style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light) => {
  try { Haptics.impactAsync(style); } catch {}
};

// ─── Stat ribbon card ──────────────────────────────────────────────────────────

function StatCard({ icon, value, label, gradient, accent }: {
  icon: string; value: string; label: string; gradient: readonly [string, string]; accent: string;
}) {
  return (
    <View style={{ flex: 1, borderRadius: RADIUS.lg, overflow: 'hidden', borderWidth: 1, borderColor: `${accent}30` }}>
      <LinearGradient colors={surfaceCard()} style={{ paddingVertical: SPACING.sm, paddingHorizontal: 6, alignItems: 'center', gap: 5 }}>
        <LinearGradient colors={gradient as [string, string]} style={{ width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={icon as any} size={15} color="#FFF" />
        </LinearGradient>
        <Text
          style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.md, fontWeight: '900', lineHeight: 21 }}
          numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}
        >
          {value}
        </Text>
        <Text
          style={{ color: COLORS.textMuted, fontSize: 10, fontWeight: '700', textAlign: 'center' }}
          numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}
        >
          {label}
        </Text>
      </LinearGradient>
    </View>
  );
}

// ─── Action pill ───────────────────────────────────────────────────────────────

interface ActionPillProps {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  active?: boolean;
  badge?: number;
}

function ActionPill({ icon, label, onPress, active = false, badge }: ActionPillProps) {
  return (
    <Pressable
      onPress={() => { haptic(); onPress(); }}
      style={({ pressed }) => [{ transform: [{ scale: pressed ? 0.94 : 1 }] }]}
    >
      {active ? (
        <LinearGradient
          colors={COLORS.gradientPrimary}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: RADIUS.full, ...SHADOWS.small }}
        >
          <Ionicons name={icon} size={15} color="#FFF" />
          <Text style={{ fontSize: FONTS.sizes.sm, fontWeight: '800', color: '#FFF' }}>
            {label}{badge != null && badge > 0 ? ` · ${badge}` : ''}
          </Text>
        </LinearGradient>
      ) : (
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 6,
          paddingHorizontal: 14, paddingVertical: 9, borderRadius: RADIUS.full,
          backgroundColor: hexWithAlpha(COLORS.textPrimary, 0.05), borderWidth: 1, borderColor: COLORS.border,
        }}>
          <Ionicons name={icon} size={15} color={COLORS.textSecondary} />
          <Text style={{ fontSize: FONTS.sizes.sm, fontWeight: '600', color: COLORS.textSecondary }}>
            {label}{badge != null && badge > 0 ? ` · ${badge}` : ''}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

// ─── Animated segmented depth filter ────────────────────────────────────────────

interface SegTab { key: FilterKey; label: string; count: number; }

function FilterSegment({ tabs, active, onChange }: { tabs: SegTab[]; active: FilterKey; onChange: (k: FilterKey) => void }) {
  const [w, setW] = useState(0);
  const pad = 4;
  const segW = w > 0 ? (w - pad * 2) / tabs.length : 0;
  const idx = Math.max(0, tabs.findIndex(t => t.key === active));
  const x = useSharedValue(0);

  useEffect(() => {
    x.value = withTiming(pad + idx * segW, { duration: 220, easing: Easing.out(Easing.cubic) });
  }, [idx, segW]);

  const indStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const onLayout = (e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width);

  return (
    <View onLayout={onLayout} style={{
      flexDirection: 'row', backgroundColor: hexWithAlpha(COLORS.textPrimary, 0.04),
      borderRadius: RADIUS.full, padding: pad, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden',
    }}>
      {segW > 0 && (
        <Animated.View style={[{ position: 'absolute', top: pad, bottom: pad, left: 0, width: segW }, indStyle]}>
          <LinearGradient colors={COLORS.gradientPrimary} style={{ flex: 1, borderRadius: RADIUS.full, ...SHADOWS.small }} />
        </Animated.View>
      )}
      {tabs.map(tab => {
        const isActive = tab.key === active;
        return (
          <Pressable key={tab.key} onPress={() => { haptic(); onChange(tab.key); }} style={{ flex: 1, paddingVertical: 9, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 5, zIndex: 1 }}>
            <Text style={{ color: isActive ? '#FFF' : COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: isActive ? '800' : '600' }}>{tab.label}</Text>
            {tab.count > 0 && (
              <View style={{ backgroundColor: isActive ? 'rgba(255,255,255,0.25)' : hexWithAlpha(COLORS.textPrimary, 0.06), borderRadius: RADIUS.full, paddingHorizontal: 5, minWidth: 16, alignItems: 'center' }}>
                <Text style={{ color: isActive ? '#FFF' : COLORS.textMuted, fontSize: 9, fontWeight: '800' }}>{tab.count}</Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

// ─── Shimmer skeleton ────────────────────────────────────────────────────────────

function SkeletonCard({ index }: { index: number }) {
  const shimmer = useSharedValue(0);
  useEffect(() => {
    shimmer.value = withTiming(1, { duration: 1200 });
    const id = setInterval(() => { shimmer.value = 0; shimmer.value = withTiming(1, { duration: 1200 }); }, 1300);
    return () => clearInterval(id);
  }, []);
  const sweep = useAnimatedStyle(() => ({
    transform: [{ translateX: -SCREEN_W + shimmer.value * (SCREEN_W * 2) }],
  }));

  return (
    <View style={{
      borderRadius: RADIUS.xl, height: 138, marginBottom: SPACING.sm, overflow: 'hidden',
      borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.backgroundCard, opacity: 1 - index * 0.18,
    }}>
      <Animated.View style={[{ position: 'absolute', top: 0, bottom: 0, width: SCREEN_W }, sweep]}>
        <LinearGradient colors={['transparent', hexWithAlpha(COLORS.primary, 0.08), 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ flex: 1 }} />
      </Animated.View>
      <View style={{ padding: SPACING.md, gap: 10 }}>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: COLORS.backgroundElevated }} />
          <View style={{ flex: 1, gap: 8, justifyContent: 'center' }}>
            <View style={{ height: 12, borderRadius: 6, backgroundColor: COLORS.backgroundElevated, width: '85%' }} />
            <View style={{ height: 9, borderRadius: 5, backgroundColor: COLORS.backgroundElevated, width: '40%' }} />
          </View>
        </View>
        <View style={{ height: 9, borderRadius: 5, backgroundColor: COLORS.backgroundElevated, width: '95%' }} />
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {[60, 80, 70].map((wd, i) => <View key={i} style={{ height: 20, width: wd, borderRadius: RADIUS.full, backgroundColor: COLORS.backgroundElevated }} />)}
        </View>
      </View>
    </View>
  );
}

// ─── Report card ─────────────────────────────────────────────────────────────────

interface ReportCardProps {
  report: ResearchReport;
  index: number;
  compareMode: boolean;
  isSelected: boolean;
  selectionIndex: number;
  onOpen: () => void;
  onDelete: () => void;
  onToggleBookmark: () => void;
  onToggleSelect: () => void;
  onAddToCollection: () => void;
}

function ReportCard({
  report, index, compareMode, isSelected, selectionIndex,
  onOpen, onDelete, onToggleBookmark, onToggleSelect, onAddToCollection,
}: ReportCardProps) {
  const depthColor = DEPTH_COLOR[report.depth] ?? COLORS.primary;
  const isBookmarked = report.isPinned === true;

  const bm = useSharedValue(1);
  const bmStyle = useAnimatedStyle(() => ({ transform: [{ scale: bm.value }] }));

  const handleBookmark = () => {
    bm.value = withSequence(withSpring(1.35, { damping: 5, stiffness: 260 }), withSpring(1, { damping: 12 }));
    haptic(Haptics.ImpactFeedbackStyle.Medium);
    onToggleBookmark();
  };

  const reliColor =
    report.reliabilityScore >= 8 ? COLORS.success
    : report.reliabilityScore >= 6 ? COLORS.warning
    : COLORS.error;

  const chips: { icon: string; label: string; color: string; bg: string }[] = [
    ...((report.sections?.length ?? 0) > 0 ? [{ icon: 'layers-outline', label: `${report.sections.length} sections`, color: COLORS.primaryLight, bg: `${COLORS.primary}14` }] : []),
    ...((report.citations?.length ?? 0) > 0 ? [{ icon: 'link-outline', label: `${report.citations.length} sources`, color: COLORS.textSecondary, bg: hexWithAlpha(COLORS.textPrimary, 0.05) }] : []),
    ...(report.reliabilityScore > 0 ? [{ icon: 'shield-checkmark', label: `${report.reliabilityScore}/10`, color: reliColor, bg: `${reliColor}14` }] : []),
  ];

  return (
    <Animated.View entering={FadeInDown.duration(300).delay(Math.min(index, 8) * 32)} layout={Layout.duration(240)}>
      <Pressable
        onPress={() => { haptic(); (compareMode ? onToggleSelect : onOpen)(); }}
        onLongPress={() => { haptic(Haptics.ImpactFeedbackStyle.Medium); onAddToCollection(); }}
        style={({ pressed }) => [{ transform: [{ scale: pressed ? 0.985 : 1 }], marginBottom: SPACING.sm }]}
      >
        <View style={{
          borderRadius: RADIUS.xl, overflow: 'hidden',
          borderWidth: compareMode && isSelected ? 1.5 : 1,
          borderColor: compareMode && isSelected ? COLORS.primary : (isBookmarked ? `${COLORS.primary}40` : COLORS.border),
        }}>
          <LinearGradient
            colors={compareMode && isSelected ? surfaceSelected() : surfaceDeep()}
            style={{ padding: SPACING.md, paddingLeft: SPACING.md + 6 }}
          >
            <LinearGradient colors={[depthColor, `${depthColor}44`]} style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 }} />

            {compareMode && isSelected && selectionIndex >= 0 && (
              <View style={{ position: 'absolute', top: 10, right: 10, width: 22, height: 22, borderRadius: 11, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', ...SHADOWS.small }}>
                <Text style={{ color: '#FFF', fontSize: 11, fontWeight: '900' }}>{selectionIndex + 1}</Text>
              </View>
            )}

            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.sm }}>
              {compareMode ? (
                <View style={{
                  width: 32, height: 32, borderRadius: 16,
                  backgroundColor: isSelected ? COLORS.primary : hexWithAlpha(COLORS.textPrimary, 0.05),
                  alignItems: 'center', justifyContent: 'center', marginRight: SPACING.sm,
                  borderWidth: 1.5, borderColor: isSelected ? COLORS.primary : COLORS.border,
                }}>
                  {isSelected && <Ionicons name="checkmark" size={16} color="#FFF" />}
                </View>
              ) : (
                <LinearGradient colors={[depthColor, `${depthColor}99`]} style={{ width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginRight: SPACING.sm, ...SHADOWS.small }}>
                  <Ionicons name="document-text" size={20} color="#FFF" />
                </LinearGradient>
              )}

              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap', paddingRight: compareMode && isSelected ? 26 : 0 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: `${depthColor}1A`, borderRadius: RADIUS.full, paddingHorizontal: 9, paddingVertical: 3, borderWidth: 1, borderColor: `${depthColor}33` }}>
                  <Ionicons name={(DEPTH_ICON[report.depth] ?? 'flash') as any} size={10} color={depthColor} />
                  <Text style={{ color: depthColor, fontSize: 10, fontWeight: '800' }}>{DEPTH_LABEL[report.depth]}</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Ionicons name="calendar-outline" size={11} color={COLORS.textMuted} />
                  <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
                    {new Date(report.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </Text>
                </View>
              </View>

              {!compareMode && (
                <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', marginLeft: SPACING.sm }}>
                  <Pressable onPress={() => { haptic(); onAddToCollection(); }} hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }} style={iconBtn}>
                    <Ionicons name="folder-outline" size={16} color={COLORS.textMuted} />
                  </Pressable>
                  <Animated.View style={bmStyle}>
                    <Pressable onPress={handleBookmark} hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }} style={[iconBtn, isBookmarked && { backgroundColor: `${COLORS.primary}1A`, borderColor: `${COLORS.primary}40` }]}>
                      <Ionicons name={isBookmarked ? 'bookmark' : 'bookmark-outline'} size={16} color={isBookmarked ? COLORS.primary : COLORS.textMuted} />
                    </Pressable>
                  </Animated.View>
                  <Pressable onPress={() => { haptic(); onDelete(); }} hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }} style={iconBtn}>
                    <Ionicons name="trash-outline" size={16} color={COLORS.textMuted} />
                  </Pressable>
                </View>
              )}
            </View>

            <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.md, fontWeight: '800', lineHeight: 24, letterSpacing: -0.3, marginBottom: SPACING.sm }}>
              {report.title}
            </Text>

            {report.executiveSummary ? (
              <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, lineHeight: 18, marginBottom: SPACING.sm }} numberOfLines={2}>
                {report.executiveSummary}
              </Text>
            ) : null}

            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
              {chips.map((c, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: c.bg, borderRadius: RADIUS.full, paddingHorizontal: 9, paddingVertical: 4, borderWidth: 1, borderColor: `${c.color}22` }}>
                  <Ionicons name={c.icon as any} size={10} color={c.color} />
                  <Text style={{ color: c.color, fontSize: FONTS.sizes.xs, fontWeight: '700' }}>{c.label}</Text>
                </View>
              ))}
            </View>
          </LinearGradient>
        </View>
      </Pressable>
    </Animated.View>
  );
}

// Part 55: getter-based so RN reads the live COLORS each render (theme-aware).
const iconBtn = {
  width: 32, height: 32, borderRadius: 9,
  get backgroundColor() { return hexWithAlpha(COLORS.textPrimary, 0.05); },
  alignItems: 'center' as const, justifyContent: 'center' as const,
  borderWidth: 1,
  get borderColor() { return COLORS.border; },
};

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function HistoryScreen() {
  const { profile } = useAuth();
  // Part 55.1: subscribe so the screen recolours immediately on a theme switch.
  useTheme();
  const insets = useSafeAreaInsets();
  const { reports, loading, refreshing, refresh, deleteReport, toggleBookmark } = useHistory();

  const didInitialFocus = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!didInitialFocus.current) { didInitialFocus.current = true; return; }
      refresh();
    }, [refresh]),
  );

  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter]           = useState<FilterKey>('all');
  const [compareMode, setCompareMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const [showCollectionsManager, setShowCollectionsManager] = useState(false);
  const [collectionTarget, setCollectionTarget]             = useState<ResearchReport | null>(null);

  const scrollRef = useRef<any>(null);
  const scrollY = useSharedValue(0);
  const [showTop, setShowTop] = useState(false);
  const setTop = useCallback((v: boolean) => setShowTop(p => (p === v ? p : v)), []);
  const onScroll = useAnimatedScrollHandler({
    onScroll: e => {
      scrollY.value = e.contentOffset.y;
      runOnJS(setTop)(e.contentOffset.y > 340);
    },
  });
  const underlineStyle = useAnimatedStyle(() => ({ opacity: withTiming(scrollY.value > 6 ? 1 : 0, { duration: 160 }) }));

  const handleToggleBookmark = useCallback((report: ResearchReport) => {
    toggleBookmark(report.id);
  }, [toggleBookmark]);

  const handleDelete = useCallback((report: ResearchReport) => {
    Alert.alert('Delete Report', `Delete "${report.title}"?\nThis cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteReport(report.id) },
    ]);
  }, [deleteReport]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= 2) { Alert.alert('Maximum 2', 'You can only compare two reports at a time.'); return prev; }
      return [...prev, id];
    });
  }, []);

  const exitCompareMode = () => { setCompareMode(false); setSelectedIds([]); };

  const handleCompare = () => {
    if (selectedIds.length !== 2) { Alert.alert('Select 2 Reports', 'Please tap exactly two reports to compare.'); return; }
    router.push({ pathname: '/(app)/compare-reports' as any, params: { leftId: selectedIds[0], rightId: selectedIds[1] } });
    exitCompareMode();
  };

  const q = searchQuery.toLowerCase();
  const searchMatch = (r: ResearchReport) => r.title?.toLowerCase().includes(q) || r.query?.toLowerCase().includes(q);
  const searched = reports.filter(searchMatch);

  const filtered = searched.filter(r => (filter === 'all' ? true : r.depth === filter));
  const sorted = [...filtered].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const bookmarkedCount = reports.filter(r => r.isPinned === true).length;
  const scored = reports.filter(r => r.reliabilityScore > 0);
  const avgScore = scored.length ? (Math.round((scored.reduce((s, r) => s + r.reliabilityScore, 0) / scored.length) * 10) / 10) : 0;

  const FILTER_TABS: SegTab[] = [
    { key: 'all',    label: 'All',    count: searched.length },
    { key: 'quick',  label: 'Quick',  count: searched.filter(r => r.depth === 'quick').length },
    { key: 'deep',   label: 'Deep',   count: searched.filter(r => r.depth === 'deep').length },
    { key: 'expert', label: 'Expert', count: searched.filter(r => r.depth === 'expert').length },
  ];

  return (
    <LinearGradient colors={screenBg()} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>

        <Animated.ScrollView
          ref={scrollRef}
          onScroll={onScroll}
          scrollEventThrottle={16}
          stickyHeaderIndices={[1]}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={COLORS.primary} colors={[COLORS.primary]} progressViewOffset={12} />}
        >

          {/* ═══════════ 0 · HEADER (scrolls away) ═══════════ */}
          <Animated.View entering={FadeIn.duration(500)}>
            <LinearGradient colors={headerBg()} style={{ paddingBottom: SPACING.sm }}>
              <View pointerEvents="none" style={{ position: 'absolute', top: -40, right: -30, width: 140, height: 140, borderRadius: 70, backgroundColor: `${COLORS.primary}1A` }} />
              <View pointerEvents="none" style={{ position: 'absolute', top: 10, left: -40, width: 120, height: 120, borderRadius: 60, backgroundColor: `${COLORS.secondary}12` }} />

              <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.xl, paddingTop: SPACING.md, paddingBottom: SPACING.sm, gap: SPACING.md }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.xl, fontWeight: '900', lineHeight: 28, letterSpacing: -0.4 }} numberOfLines={1}>Research History</Text>
                  <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.sm, marginTop: 2 }}>
                    {reports.length} report{reports.length !== 1 ? 's' : ''}{bookmarkedCount > 0 ? `  ·  ${bookmarkedCount} saved` : ''}
                  </Text>
                </View>
                <View style={{ flexShrink: 0, borderRadius: 24, borderWidth: 2, borderColor: `${COLORS.primary}40`, padding: 2 }}>
                  <Avatar url={profile?.avatar_url} name={profile?.full_name} size={42} />
                </View>
              </View>

              {!compareMode && reports.length > 0 && (
                <View style={{ flexDirection: 'row', gap: SPACING.sm, paddingHorizontal: SPACING.xl, marginBottom: SPACING.sm }}>
                  <StatCard icon="documents" value={String(reports.length)} label="Reports" gradient={COLORS.gradientPrimary} accent={COLORS.primary} />
                  <StatCard icon="bookmark" value={String(bookmarkedCount)} label="Saved" gradient={COLORS.gradientSecondary} accent={COLORS.secondary} />
                  <StatCard icon="shield-checkmark" value={avgScore ? `${avgScore}` : '—'} label="Avg Score" gradient={COLORS.gradientSuccess} accent={COLORS.success} />
                </View>
              )}

              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: SPACING.xl, gap: 8 }}>
                <ActionPill icon="search-outline" label="Search" onPress={() => router.push('/(app)/global-search' as any)} />
                <ActionPill icon="albums-outline" label="Collections" onPress={() => setShowCollectionsManager(true)} active />
                <ActionPill icon={bookmarkedCount > 0 ? 'bookmark' : 'bookmark-outline'} label="Saved" badge={bookmarkedCount > 0 ? bookmarkedCount : undefined} onPress={() => router.push('/(app)/bookmarks' as any)} active={bookmarkedCount > 0} />
                <ActionPill icon="git-compare-outline" label={compareMode ? 'Exit Compare' : 'Compare'} onPress={() => (compareMode ? exitCompareMode() : (haptic(Haptics.ImpactFeedbackStyle.Medium), setCompareMode(true)))} active={compareMode} />
              </ScrollView>
            </LinearGradient>

            {compareMode && (
              <Animated.View entering={FadeInDown.duration(300)} exiting={FadeOut.duration(150)} style={{ paddingHorizontal: SPACING.xl, paddingTop: SPACING.sm }}>
                <View style={{ borderRadius: RADIUS.lg, overflow: 'hidden', borderWidth: 1, borderColor: `${COLORS.primary}40` }}>
                  <LinearGradient colors={surfaceSelected()} style={{ padding: SPACING.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Ionicons name="git-compare" size={14} color={COLORS.primary} />
                        <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.sm, fontWeight: '800' }}>Compare Mode</Text>
                      </View>
                      <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 2 }}>
                        {selectedIds.length === 0 && 'Tap two reports to compare'}
                        {selectedIds.length === 1 && 'Select one more report'}
                        {selectedIds.length === 2 && '✓ Ready to compare!'}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', gap: SPACING.sm, alignItems: 'center' }}>
                      <View style={{ flexDirection: 'row', gap: 6 }}>
                        {[0, 1].map(i => (
                          <View key={i} style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: selectedIds.length > i ? COLORS.primary : COLORS.border }} />
                        ))}
                      </View>
                      {selectedIds.length === 2 && (
                        <Pressable onPress={() => { haptic(Haptics.ImpactFeedbackStyle.Medium); handleCompare(); }}>
                          <LinearGradient colors={COLORS.gradientPrimary} style={{ borderRadius: RADIUS.md, paddingHorizontal: 14, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <Text style={{ color: '#FFF', fontSize: FONTS.sizes.sm, fontWeight: '800' }}>Compare</Text>
                            <Ionicons name="arrow-forward" size={13} color="#FFF" />
                          </LinearGradient>
                        </Pressable>
                      )}
                      <Pressable onPress={exitCompareMode} hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                        <Ionicons name="close" size={20} color={COLORS.textMuted} />
                      </Pressable>
                    </View>
                  </LinearGradient>
                </View>
              </Animated.View>
            )}
          </Animated.View>

          {/* ═══════════ 1 · STICKY  search + filter ═══════════ */}
          <View>
            <LinearGradient colors={stickyBg()} style={{ paddingHorizontal: SPACING.xl, paddingTop: SPACING.sm, paddingBottom: SPACING.sm }}>
              <View style={{
                backgroundColor: hexWithAlpha(COLORS.textPrimary, 0.05), borderRadius: RADIUS.lg,
                flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.md, height: 46,
                borderWidth: 1, borderColor: searchQuery ? `${COLORS.primary}40` : COLORS.border, marginBottom: SPACING.sm,
              }}>
                <Ionicons name="search" size={17} color={searchQuery ? COLORS.primary : COLORS.textMuted} />
                <TextInput
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Search your reports…"
                  placeholderTextColor={COLORS.textMuted}
                  style={{ flex: 1, color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, marginLeft: 10, paddingVertical: 0 }}
                />
                {searchQuery.length > 0 && (
                  <Pressable onPress={() => setSearchQuery('')} hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                    <Ionicons name="close-circle" size={17} color={COLORS.textMuted} />
                  </Pressable>
                )}
              </View>

              <FilterSegment tabs={FILTER_TABS} active={filter} onChange={setFilter} />

              {!loading && reports.length > 0 && (
                <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: SPACING.sm }}>
                  {sorted.length === reports.length ? `Showing all ${reports.length}` : `${sorted.length} of ${reports.length} reports`}
                  {compareMode ? '  ·  tap to select' : ''}
                </Text>
              )}
            </LinearGradient>
            <Animated.View style={[{ height: 1 }, underlineStyle]}>
              <LinearGradient colors={['transparent', `${COLORS.primary}55`, 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ flex: 1 }} />
            </Animated.View>
          </View>

          {/* ═══════════ 2 · CONTENT ═══════════ */}
          <View style={{ paddingHorizontal: SPACING.xl, paddingTop: SPACING.sm }}>
            {loading && reports.length === 0 && Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} index={i} />)}

            {!loading && sorted.length === 0 && (
              <Animated.View entering={FadeIn.duration(500)} style={{ alignItems: 'center', paddingTop: 60 }}>
                <LinearGradient colors={surfaceSelected()} style={{ width: 92, height: 92, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.lg, borderWidth: 1, borderColor: `${COLORS.primary}30` }}>
                  <Ionicons name={searchQuery ? 'search-outline' : 'time-outline'} size={40} color={`${COLORS.primary}AA`} />
                </LinearGradient>
                <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.lg, fontWeight: '800', textAlign: 'center' }}>
                  {searchQuery ? 'No results found' : filter !== 'all' ? `No ${DEPTH_LABEL[filter]} reports` : 'No research yet'}
                </Text>
                <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.sm, textAlign: 'center', marginTop: SPACING.sm, lineHeight: 20, paddingHorizontal: SPACING.xl }}>
                  {searchQuery ? 'Try a different search term' : filter !== 'all' ? 'Switch filters or start a new deep dive' : 'Start your first research on the Home tab'}
                </Text>
                {(filter !== 'all' || searchQuery) && (
                  <Pressable onPress={() => { setFilter('all'); setSearchQuery(''); haptic(); }} style={{ marginTop: SPACING.lg }}>
                    <View style={{ backgroundColor: `${COLORS.primary}1A`, borderRadius: RADIUS.full, paddingHorizontal: SPACING.xl, paddingVertical: 12, borderWidth: 1, borderColor: `${COLORS.primary}40` }}>
                      <Text style={{ color: COLORS.primary, fontWeight: '800', fontSize: FONTS.sizes.base }}>Clear filters</Text>
                    </View>
                  </Pressable>
                )}
                {filter === 'all' && !searchQuery && (
                  <Pressable onPress={() => { haptic(); router.push('/(app)/(tabs)/home'); }} style={{ marginTop: SPACING.lg }}>
                    <LinearGradient colors={COLORS.gradientPrimary} style={{ borderRadius: RADIUS.full, paddingHorizontal: SPACING.xl, paddingVertical: 13, flexDirection: 'row', alignItems: 'center', gap: 8, ...SHADOWS.medium }}>
                      <Ionicons name="telescope-outline" size={18} color="#FFF" />
                      <Text style={{ color: '#FFF', fontWeight: '800', fontSize: FONTS.sizes.base }}>Start Research</Text>
                    </LinearGradient>
                  </Pressable>
                )}
              </Animated.View>
            )}

            {sorted.map((report, i) => (
              <ReportCard
                key={report.id}
                report={report}
                index={i}
                compareMode={compareMode}
                isSelected={selectedIds.includes(report.id)}
                selectionIndex={selectedIds.indexOf(report.id)}
                onToggleSelect={() => toggleSelect(report.id)}
                onOpen={() => router.push({ pathname: '/(app)/research-report' as any, params: { reportId: report.id } })}
                onDelete={() => handleDelete(report)}
                onToggleBookmark={() => handleToggleBookmark(report)}
                onAddToCollection={() => setCollectionTarget(report)}
              />
            ))}
          </View>
        </Animated.ScrollView>

        {showTop && (
          <Animated.View entering={FadeIn.duration(220)} exiting={FadeOut.duration(180)} style={{ position: 'absolute', right: 20, bottom: insets.bottom + 96 }}>
            <Pressable onPress={() => { haptic(); scrollRef.current?.scrollTo({ y: 0, animated: true }); }} style={({ pressed }) => [{ transform: [{ scale: pressed ? 0.9 : 1 }] }]}>
              <LinearGradient colors={COLORS.gradientPrimary} style={{ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', ...SHADOWS.large }}>
                <Ionicons name="arrow-up" size={22} color="#FFF" />
              </LinearGradient>
            </Pressable>
          </Animated.View>
        )}
      </SafeAreaView>

      <ManageCollectionsSheet visible={showCollectionsManager} onClose={() => setShowCollectionsManager(false)} />

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