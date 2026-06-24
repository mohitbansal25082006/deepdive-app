// app/(app)/global-search.tsx
// Part 35 — Personal search hub
// Part 37 — Community tab, researcher search, action choice modal
// Part 37 FIX 2 — Web browser no longer blocks/freezes navigation.
// Part 50.8 — UI UPGRADE (visual only)
// Part 55.2 — FULL THEME-COMPATIBILITY PASS
//
// ⚠️ NAVIGATION / FREEZE FIX IS PRESERVED EXACTLY:
//   • openUrlNonBlocking() still uses Linking.openURL (fire-and-forget) inside
//     requestAnimationFrame — never awaited. This is the Part 37 FIX 2 that
//     keeps the JS thread free so navigation + modal dismissal don't freeze.
//   • ActionChoiceModal still closes FIRST, then opens the URL on the next
//     frame. All navigate* helpers are unchanged.
//   • SearchResultCard navigation is still via the onPress callback (no
//     router.push inside the card).
//
// Part 55.2 changes: ALL hardcoded dark hex literals replaced with live
// COLORS tokens. Every text color now uses theme-aware tokens.

import React, { useRef, useCallback, useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList, Pressable,
  ActivityIndicator, StyleSheet, Keyboard, Linking, Alert, Modal, Dimensions,
  LayoutChangeEvent,
} from 'react-native';
import { LinearGradient }   from 'expo-linear-gradient';
import { Ionicons }         from '@expo/vector-icons';
import Animated, {
  FadeIn, FadeOut, FadeInDown,
  useSharedValue, useAnimatedStyle, withTiming, Easing,
} from 'react-native-reanimated';
import { SafeAreaView }     from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';

import { useGlobalSearch }          from '../../src/hooks/useGlobalSearch';
import { searchPublicResearchers }  from '../../src/services/globalSearchService';
import { SearchResultCard }         from '../../src/components/search/SearchResultCard';
import {
  SearchFilterBar, SearchAdvancedFilters,
}                                   from '../../src/components/search/SearchFilters';
import { Avatar }                   from '../../src/components/common/Avatar';
import {
  SearchResult, CommunitySearchResult,
  PublicResearcherResult, SearchScope, SearchContentType,
}                                   from '../../src/types/search';
import {
  CONTENT_TYPE_META, SEARCH_MODE_META, SEARCH_SCOPE_META,
  COMMUNITY_SEARCH_PLACEHOLDER_EXAMPLES, PUBLIC_REPORTS_BASE_URL,
}                                   from '../../src/constants/search';
import { 
  COLORS, FONTS, SPACING, RADIUS, SHADOWS,
  getAuroraGradient,
} from '../../src/constants/theme';

const SCREEN_W = Dimensions.get('window').width;

const SUGGESTED_QUERIES = [
  'quantum computing', 'AI in healthcare', 'electric vehicles 2025',
  'climate change solutions', 'cryptocurrency regulation', 'remote work productivity',
];

const DEPTH_COLORS: Record<string, string> = {
  quick: COLORS.success, deep: COLORS.primary, expert: COLORS.warning,
};
const DEPTH_LABELS: Record<string, string> = {
  quick: 'Quick', deep: 'Deep Dive', expert: 'Expert',
};

// ─── Open URL — FIRE AND FORGET, never blocks JS thread ──────────────────────

function openUrlNonBlocking(url: string): void {
  requestAnimationFrame(() => {
    Linking.openURL(url).catch(() => {
      Alert.alert('Cannot open', 'Unable to open this link.');
    });
  });
}

// ─── Personal result navigation ───────────────────────────────────────────────

function navigateToPersonalResult(result: SearchResult) {
  const meta = result.metadata ?? {};
  switch (result.contentType) {
    case 'report':
      router.push({ pathname: '/(app)/research-report' as any, params: { reportId: result.id } });
      break;
    case 'podcast':
      router.push({ pathname: '/(app)/podcast-player' as any, params: { podcastId: result.id } });
      break;
    case 'debate':
      router.push({ pathname: '/(app)/debate-detail' as any, params: { sessionId: result.id } });
      break;
    case 'presentation': {
      const rid = meta.reportId as string | null | undefined;
      router.push({
        pathname: '/(app)/slide-preview' as any,
        params:   rid && rid !== 'undefined' ? { reportId: rid, presentationId: result.id } : { presentationId: result.id },
      });
      break;
    }
    case 'academic_paper': {
      const rid = meta.reportId as string | null | undefined;
      router.push({
        pathname: '/(app)/academic-paper' as any,
        params:   rid && rid !== 'undefined' ? { reportId: rid, paperId: result.id } : { paperId: result.id },
      });
      break;
    }
  }
}

// ─── Community report actions ─────────────────────────────────────────────────

function openCommunityReportInBrowser(result: CommunitySearchResult): void {
  if (!result.shareId) { Alert.alert('Cannot open', 'No share link available.'); return; }
  openUrlNonBlocking(`${PUBLIC_REPORTS_BASE_URL}/r/${result.shareId}`);
}

function openCommunityReportInApp(result: CommunitySearchResult): void {
  if (!result.reportId) { Alert.alert('Cannot open', 'Report not available in app.'); return; }
  router.push({
    pathname: '/(app)/feed-report-view' as any,
    params: {
      reportId:        result.reportId,
      authorName:      result.authorFullName  ?? result.authorUsername ?? '',
      authorUsername:  result.authorUsername  ?? '',
      authorAvatarUrl: result.authorAvatarUrl ?? '',
    },
  });
}

// ─── Researcher actions ───────────────────────────────────────────────────────

function openResearcherInApp(r: PublicResearcherResult): void {
  if (!r.username && !r.id) { Alert.alert('Cannot open', 'This researcher has no profile URL.'); return; }
  router.push({
    pathname: '/(app)/user-profile' as any,
    params:   r.username
      ? { username: r.username }
      : { username: r.id },
  });
}

function openResearcherOnWeb(r: PublicResearcherResult): void {
  if (!r.username) { Alert.alert('Cannot open', 'This researcher has no public web profile yet.'); return; }
  openUrlNonBlocking(`${PUBLIC_REPORTS_BASE_URL}/u/${r.username}`);
}

// ─── Action Choice Modal ──────────────────────────────────────────────────────

type ActionChoiceTarget =
  | { kind: 'report';     result: CommunitySearchResult }
  | { kind: 'researcher'; result: PublicResearcherResult };

function ActionChoiceModal({
  target,
  onClose,
}: {
  target:  ActionChoiceTarget | null;
  onClose: () => void;
}) {
  if (!target) return null;

  const isReport  = target.kind === 'report';
  const title     = isReport
    ? (target.result as CommunitySearchResult).title
    : ((target.result as PublicResearcherResult).full_name
        ?? (target.result as PublicResearcherResult).username
        ?? 'Researcher');

  const handleInApp = () => {
    onClose();
    requestAnimationFrame(() => {
      if (isReport) openCommunityReportInApp(target.result as CommunitySearchResult);
      else          openResearcherInApp(target.result as PublicResearcherResult);
    });
  };

  const handleOnWeb = () => {
    onClose();
    requestAnimationFrame(() => {
      if (isReport) openCommunityReportInBrowser(target.result as CommunitySearchResult);
      else          openResearcherOnWeb(target.result as PublicResearcherResult);
    });
  };

  return (
    <Modal
      visible
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={[styles.modalScrim, { backgroundColor: getModalBackdrop(0.6) }]} onPress={onClose}>
        <Pressable onPress={e => e.stopPropagation()} style={styles.modalSheetOuter}>
          <LinearGradient
            colors={COLORS.gradientCard as [string, string]}
            style={[styles.modalSheet, { borderTopColor: `${COLORS.primary}30` }]}
          >
            <View style={[styles.modalHandle, { backgroundColor: COLORS.border }]} />

            <View style={styles.modalTitleRow}>
              <LinearGradient
                colors={isReport ? COLORS.gradientPrimary : [COLORS.success, `${COLORS.success}AA`]}
                style={styles.modalTitleIcon}
              >
                <Ionicons name={isReport ? 'document-text' : 'person'} size={16} color="#FFF" />
              </LinearGradient>
              <View style={{ flex: 1 }}>
                <Text style={[styles.modalTitle, { color: COLORS.textPrimary }]} numberOfLines={2}>{title}</Text>
                <Text style={[styles.modalSubtitle, { color: COLORS.textMuted }]}>
                  {isReport ? 'How would you like to open this report?' : 'How would you like to view this profile?'}
                </Text>
              </View>
            </View>

            {/* Open in App */}
            <TouchableOpacity onPress={handleInApp} activeOpacity={0.8} style={styles.modalOptionPrimary}>
              <LinearGradient colors={COLORS.gradientPrimary} style={styles.modalOptionGradient}>
                <Ionicons name="phone-portrait-outline" size={20} color="#FFF" />
                <View style={styles.modalOptionText}>
                  <Text style={[styles.modalOptionLabel, { color: '#FFF' }]}>
                    {isReport ? 'Open in App' : 'View Profile in App'}
                  </Text>
                  <Text style={[styles.modalOptionDesc, { color: 'rgba(255,255,255,0.6)' }]}>
                    {isReport
                      ? 'Read the full report inside DeepDive'
                      : 'View researcher profile inside DeepDive'}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.6)" />
              </LinearGradient>
            </TouchableOpacity>

            {/* Open in Browser */}
            <TouchableOpacity onPress={handleOnWeb} activeOpacity={0.8} style={[styles.modalOptionSecondary, { borderColor: COLORS.border }]}>
              <View style={[styles.modalOptionSecondaryIcon, { backgroundColor: `${COLORS.success}18`, borderColor: `${COLORS.success}35` }]}>
                <Ionicons name="globe-outline" size={18} color={COLORS.success} />
              </View>
              <View style={styles.modalOptionText}>
                <Text style={[styles.modalOptionLabel, { color: COLORS.textPrimary }]}>
                  {isReport ? 'Open in Browser' : 'View on Web'}
                </Text>
                <Text style={[styles.modalOptionDesc, { color: COLORS.textMuted }]}>
                  {isReport
                    ? 'Opens the public report page in your browser'
                    : 'Opens the public researcher page in your browser'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity onPress={onClose} style={styles.modalCancel} activeOpacity={0.7}>
              <Text style={[styles.modalCancelText, { color: COLORS.textMuted }]}>Cancel</Text>
            </TouchableOpacity>
          </LinearGradient>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Community Report Card ────────────────────────────────────────────────────

function CommunityResultCard({
  result, index, query, onPress,
}: {
  result: CommunitySearchResult; index: number;
  query: string; onPress: (r: CommunitySearchResult) => void;
}) {
  const dc = DEPTH_COLORS[result.depth] ?? COLORS.primary;
  const dl = DEPTH_LABELS[result.depth] ?? result.depth;
  const authorName = result.authorFullName ?? result.authorUsername ?? 'Researcher';

  return (
    <Animated.View entering={FadeInDown.duration(300).delay(Math.min(index, 8) * 40)}>
      <Pressable
        onPress={() => onPress(result)}
        style={({ pressed }) => [{ transform: [{ scale: pressed ? 0.985 : 1 }], marginBottom: SPACING.sm }]}
      >
        <View style={[styles.communityCard, { borderColor: `${dc}33` }]}>
          <LinearGradient colors={COLORS.gradientCard as [string, string]} style={styles.communityCardGradient}>
            <LinearGradient colors={[dc, `${dc}44`]} style={styles.communityAccentBar} />
            <View style={styles.communityCardBody}>
              <View style={styles.communityTitleRow}>
                <Text style={[styles.communityTitle, { color: COLORS.textPrimary }]} numberOfLines={2}>
                  {result.title || 'Untitled Report'}
                </Text>
                <View style={[styles.openChip, { backgroundColor: `${COLORS.primary}12`, borderColor: `${COLORS.primary}25` }]}>
                  <Ionicons name="apps-outline" size={10} color={COLORS.primary} />
                  <Text style={[styles.openChipText, { color: COLORS.primary }]}>Open</Text>
                </View>
              </View>
              {!!result.executiveSummary && (
                <Text style={[styles.communityPreview, { color: COLORS.textSecondary }]} numberOfLines={2}>
                  {result.executiveSummary}
                </Text>
              )}
              {result.tags.length > 0 && (
                <View style={styles.communityTagRow}>
                  {result.tags.slice(0, 3).map(t => (
                    <View key={t} style={[styles.communityTag, { backgroundColor: `${COLORS.primary}10`, borderColor: `${COLORS.primary}20` }]}>
                      <Text style={[styles.communityTagText, { color: COLORS.primary }]}>#{t}</Text>
                    </View>
                  ))}
                  {result.tags.length > 3 && (
                    <Text style={[styles.communityTagMore, { color: COLORS.textMuted }]}>+{result.tags.length - 3}</Text>
                  )}
                </View>
              )}
              <View style={styles.communityFooter}>
                {(result.authorUsername || result.authorFullName) && (
                  <View style={[styles.communityAuthorChip, { backgroundColor: 'rgba(255,255,255,0.05)', borderColor: COLORS.border }]}>
                    <Avatar url={result.authorAvatarUrl} name={authorName} size={16} />
                    <Text style={[styles.communityAuthorText, { color: COLORS.textSecondary }]} numberOfLines={1}>
                      {result.authorUsername ? `@${result.authorUsername}` : authorName}
                    </Text>
                  </View>
                )}
                <View style={[styles.depthBadge, { backgroundColor: `${dc}15`, borderColor: `${dc}30` }]}>
                  <Text style={[styles.depthBadgeText, { color: dc }]}>{dl}</Text>
                </View>
                {result.viewCount > 0 && (
                  <View style={styles.viewCount}>
                    <Ionicons name="eye-outline" size={11} color={COLORS.textMuted} />
                    <Text style={[styles.viewCountText, { color: COLORS.textMuted }]}>
                      {result.viewCount >= 1000
                        ? `${(result.viewCount / 1000).toFixed(1)}k`
                        : result.viewCount}
                    </Text>
                  </View>
                )}
                {(result.semanticScore ?? 0) > 0 && (
                  <View style={[styles.semanticDot, { backgroundColor: `${COLORS.success}12`, borderColor: `${COLORS.success}25` }]}>
                    <Ionicons name="git-network-outline" size={9} color={COLORS.success} />
                    <Text style={[styles.semanticDotText, { color: COLORS.success }]}>
                      {Math.round((result.semanticScore ?? 0) * 100)}%
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </LinearGradient>
        </View>
      </Pressable>
    </Animated.View>
  );
}

// ─── Researcher Result Card ───────────────────────────────────────────────────

function ResearcherResultCard({
  researcher, index, onPress,
}: {
  researcher: PublicResearcherResult; index: number;
  onPress: (r: PublicResearcherResult) => void;
}) {
  const name = researcher.full_name ?? researcher.username ?? 'Researcher';
  return (
    <Animated.View entering={FadeInDown.duration(300).delay(Math.min(index, 6) * 40)}>
      <Pressable
        onPress={() => onPress(researcher)}
        style={({ pressed }) => [{ transform: [{ scale: pressed ? 0.985 : 1 }], marginBottom: SPACING.sm }]}
      >
        <View style={[styles.researcherCard, { borderColor: COLORS.border }]}>
          <LinearGradient colors={COLORS.gradientCard as [string, string]} style={styles.researcherCardGradient}>
            <View style={[styles.researcherAvatarRing, { borderColor: `${COLORS.primary}40` }]}>
              <Avatar url={researcher.avatar_url} name={name} size={44} />
            </View>
            <View style={styles.researcherInfo}>
              <Text style={[styles.researcherName, { color: COLORS.textPrimary }]} numberOfLines={1}>{name}</Text>
              {researcher.username && (
                <Text style={[styles.researcherUsername, { color: COLORS.primary }]}>@{researcher.username}</Text>
              )}
              <View style={styles.researcherStats}>
                <View style={styles.researcherStat}>
                  <Ionicons name="people-outline" size={10} color={COLORS.textMuted} />
                  <Text style={[styles.researcherStatText, { color: COLORS.textMuted }]}>
                    {researcher.follower_count >= 1000
                      ? `${(researcher.follower_count / 1000).toFixed(1)}k`
                      : researcher.follower_count} followers
                  </Text>
                </View>
                <View style={styles.researcherStat}>
                  <Ionicons name="document-text-outline" size={10} color={COLORS.textMuted} />
                  <Text style={[styles.researcherStatText, { color: COLORS.textMuted }]}>
                    {researcher.public_report_count} public reports
                  </Text>
                </View>
              </View>
            </View>
            <View style={[styles.openChip, { backgroundColor: `${COLORS.primary}12`, borderColor: `${COLORS.primary}25` }]}>
              <Ionicons name="apps-outline" size={10} color={COLORS.primary} />
              <Text style={[styles.openChipText, { color: COLORS.primary }]}>Open</Text>
            </View>
          </LinearGradient>
        </View>
      </Pressable>
    </Animated.View>
  );
}

// ─── Animated scope toggle ────────────────────────────────────────────────────

function ScopeToggle({ scope, onChange }: { scope: SearchScope; onChange: (s: SearchScope) => void }) {
  const scopes: SearchScope[] = ['personal', 'community'];
  const [w, setW] = useState(0);
  const pad = 3;
  const segW = w > 0 ? (w - pad * 2) / scopes.length : 0;
  const idx = Math.max(0, scopes.indexOf(scope));
  const x = useSharedValue(0);

  useEffect(() => {
    x.value = withTiming(pad + idx * segW, { duration: 220, easing: Easing.out(Easing.cubic) });
  }, [idx, segW]);

  const indStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const onLayout = (e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width);

  return (
    <View onLayout={onLayout} style={[styles.scopeToggleWrap, { backgroundColor: COLORS.backgroundElevated, borderColor: COLORS.border }]}>
      {segW > 0 && (
        <Animated.View style={[{ position: 'absolute', top: pad, bottom: pad, left: 0, width: segW }, indStyle]}>
          <LinearGradient
            colors={scope === 'community' ? [COLORS.success, `${COLORS.success}CC`] : COLORS.gradientPrimary}
            style={{ flex: 1, borderRadius: RADIUS.md, ...SHADOWS.small }}
          />
        </Animated.View>
      )}
      {scopes.map(s => {
        const meta   = SEARCH_SCOPE_META[s];
        const active = scope === s;
        return (
          <TouchableOpacity
            key={s} onPress={() => onChange(s)} activeOpacity={0.8}
            style={styles.scopeTab}
          >
            <Ionicons name={meta.icon as any} size={13} color={active ? '#FFF' : COLORS.textMuted} />
            <Text style={[styles.scopeTabText, { color: active ? '#FFF' : COLORS.textMuted }]}>{meta.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptySearchState({ scope, onSuggest }: { scope: SearchScope; onSuggest: (q: string) => void }) {
  const isCom = scope === 'community';
  const suggs = isCom ? COMMUNITY_SEARCH_PLACEHOLDER_EXAMPLES : SUGGESTED_QUERIES;
  return (
    <Animated.View entering={FadeIn.duration(400)} style={styles.emptyWrap}>
      <LinearGradient 
        colors={COLORS.gradientCard as [string, string]} 
        style={[styles.emptyCard, { borderColor: isCom ? `${COLORS.success}25` : `${COLORS.primary}25` }]}
      >
        <LinearGradient colors={isCom ? [COLORS.success, `${COLORS.success}AA`] : COLORS.gradientPrimary} style={styles.emptyIconCircle}>
          <Ionicons name={isCom ? 'globe-outline' : 'search'} size={28} color="#FFF" />
        </LinearGradient>
        <Text style={[styles.emptyTitle, { color: COLORS.textPrimary }]}>{isCom ? 'Search All Research' : 'Search Everything'}</Text>
        <Text style={[styles.emptySubtext, { color: COLORS.textMuted }]}>
          {isCom
            ? 'Discover public reports & researchers from the DeepDive community'
            : 'Search across all your reports, podcasts, debates, slides, and papers'}
        </Text>
        {isCom && (
          <View style={[styles.communityInfoRow, { backgroundColor: `${COLORS.success}10` }]}>
            <Ionicons name="shield-checkmark-outline" size={12} color={COLORS.success} />
            <Text style={[styles.communityInfoText, { color: COLORS.success }]}>Only public reports & verified researchers</Text>
          </View>
        )}
        {!isCom && (
          <View style={styles.modeInfoRow}>
            {(['keyword', 'semantic', 'hybrid'] as const).map(m => {
              const meta = SEARCH_MODE_META[m];
              return (
                <View key={m} style={[styles.modeInfoChip, { borderColor: `${meta.color}30`, backgroundColor: `${meta.color}10` }]}>
                  <Ionicons name={meta.icon as any} size={11} color={meta.color} />
                  <Text style={[styles.modeInfoLabel, { color: meta.color }]}>{meta.label}</Text>
                </View>
              );
            })}
          </View>
        )}
      </LinearGradient>
      <Text style={[styles.suggestLabel, { color: COLORS.textMuted }]}>{isCom ? 'Popular searches' : 'Try searching for'}</Text>
      <View style={styles.suggestRow}>
        {suggs.map(q => (
          <TouchableOpacity key={q} onPress={() => onSuggest(q)} activeOpacity={0.75} style={[styles.suggestChip, { borderColor: isCom ? `${COLORS.success}25` : `${COLORS.primary}25` }]}>
            <Ionicons
              name={isCom ? 'globe-outline' : 'search-outline'}
              size={11}
              color={isCom ? COLORS.success : COLORS.primary}
            />
            <Text style={[styles.suggestChipText, { color: COLORS.textSecondary }]}>{q}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </Animated.View>
  );
}

function NoResultsState({ query, scope }: { query: string; scope: SearchScope }) {
  return (
    <Animated.View entering={FadeIn.duration(400)} style={styles.emptyWrap}>
      <LinearGradient 
        colors={[COLORS.backgroundElevated, COLORS.background]} 
        style={[styles.noResultsIcon, { borderColor: `${COLORS.primary}30` }]}
      >
        <Ionicons name="search-outline" size={40} color={`${COLORS.primary}AA`} />
      </LinearGradient>
      <Text style={[styles.noResultsTitle, { color: COLORS.textPrimary }]}>No results found</Text>
      <Text style={[styles.noResultsSubtext, { color: COLORS.textMuted }]}>
        No {scope === 'community' ? 'public content' : 'content'} matched{' '}
        <Text style={{ color: COLORS.textPrimary, fontWeight: '700' }}>"{query}"</Text>
        {scope === 'personal'
          ? '\nTry different keywords or switch to Hybrid / Semantic mode'
          : '\nTry different keywords — the community is growing every day'}
      </Text>
      {scope === 'community' && (
        <TouchableOpacity onPress={() => router.push('/(app)/explore-researchers' as any)} style={[styles.exploreBtn, { backgroundColor: `${COLORS.primary}15`, borderColor: `${COLORS.primary}30` }]}>
          <Ionicons name="people-outline" size={14} color={COLORS.primary} />
          <Text style={[styles.exploreBtnText, { color: COLORS.primary }]}>Explore Researchers</Text>
        </TouchableOpacity>
      )}
    </Animated.View>
  );
}

function ResultsBar({ count, isSemanticReady, searchMode, query, scope }: {
  count: number; isSemanticReady: boolean; searchMode: string; query: string; scope: SearchScope;
}) {
  return (
    <Animated.View entering={FadeIn.duration(300)} style={styles.resultsBar}>
      <Text style={[styles.resultsCount, { color: COLORS.textMuted }]} numberOfLines={1}>
        <Text style={{ color: COLORS.primary, fontWeight: '800' }}>{count}</Text>
        {' '}{scope === 'community' ? 'public result' : 'result'}{count !== 1 ? 's' : ''} for{' '}
        <Text style={{ color: COLORS.textPrimary, fontWeight: '600' }}>"{query}"</Text>
      </Text>
      <View style={styles.resultsRight}>
        {scope === 'community' && (
          <View style={[styles.semanticBadge, { backgroundColor: `${COLORS.success}10`, borderColor: `${COLORS.success}30` }]}>
            <Ionicons name="globe-outline" size={10} color={COLORS.success} />
            <Text style={[styles.semanticBadgeText, { color: COLORS.success }]}>Community</Text>
          </View>
        )}
        {scope === 'personal' && searchMode !== 'keyword' && isSemanticReady && (
          <View style={[styles.semanticBadge, { backgroundColor: `${COLORS.success}12`, borderColor: `${COLORS.success}30` }]}>
            <Ionicons name="git-network-outline" size={10} color={COLORS.success} />
            <Text style={[styles.semanticBadgeText, { color: COLORS.success }]}>Semantic</Text>
          </View>
        )}
      </View>
    </Animated.View>
  );
}

function ContentBreakdown({ results }: { results: SearchResult[] }) {
  const counts: Partial<Record<SearchContentType, number>> = {};
  for (const r of results) { const ct = r.contentType as SearchContentType; counts[ct] = (counts[ct] ?? 0) + 1; }
  const types = (Object.entries(counts) as [SearchContentType, number][]).filter(([, c]) => c > 0);
  if (types.length <= 1) return null;
  return (
    <Animated.View entering={FadeIn.duration(300)} style={styles.breakdownBar}>
      {types.map(([type, count]) => {
        const meta = CONTENT_TYPE_META[type as SearchContentType];
        if (!meta) return null;
        return (
          <View key={type} style={[styles.breakdownChip, { backgroundColor: `${meta.color}15`, borderColor: `${meta.color}30` }]}>
            <Ionicons name={meta.icon as any} size={10} color={meta.color} />
            <Text style={[styles.breakdownText, { color: meta.color }]}>{count} {meta.pluralLabel}</Text>
          </View>
        );
      })}
    </Animated.View>
  );
}

function SuggestionsOverlay({ suggestions, communityRecentQueries, scope, onSelect, onClearHistory }: {
  suggestions: { query: string; useCount: number }[];
  communityRecentQueries: string[];
  scope: SearchScope; onSelect: (q: string) => void; onClearHistory: () => void;
}) {
  const isCom  = scope === 'community';
  const items  = isCom
    ? communityRecentQueries.map(q => ({ query: q, useCount: 1 }))
    : suggestions;
  if (!items.length) return null;
  return (
    <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)} style={styles.suggestionsOverlayOuter}>
      <LinearGradient 
        colors={[COLORS.backgroundElevated, COLORS.backgroundCard]} 
        style={[styles.suggestionsOverlay, { borderColor: `${COLORS.primary}25` }]}
      >
        <View style={styles.suggestionsHeader}>
          <Text style={[styles.suggestionsTitle, { color: COLORS.textMuted }]}>{isCom ? 'Recent community searches' : 'Recent Searches'}</Text>
          {!isCom && (
            <TouchableOpacity onPress={onClearHistory} hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}>
              <Text style={[styles.clearHistoryText, { color: COLORS.error }]}>Clear</Text>
            </TouchableOpacity>
          )}
        </View>
        {items.slice(0, 6).map((item, i) => (
          <TouchableOpacity key={item.query + i} onPress={() => onSelect(item.query)} activeOpacity={0.75} style={[styles.suggestionRow, { borderBottomColor: `${COLORS.border}60` }]}>
            <Ionicons name={isCom ? 'globe-outline' : 'time-outline'} size={15} color={COLORS.textMuted} />
            <Text style={[styles.suggestionText, { color: COLORS.textSecondary }]} numberOfLines={1}>{item.query}</Text>
            <Ionicons name="arrow-up-outline" size={14} color={COLORS.textMuted} style={{ transform: [{ rotate: '45deg' }] }} />
          </TouchableOpacity>
        ))}
      </LinearGradient>
    </Animated.View>
  );
}

// ─── Shimmer skeleton ──────────────────────────────────────────────────────────

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
    <View style={[styles.skeleton, { opacity: 1 - index * 0.18, height: 96 + (index % 2) * 18, backgroundColor: COLORS.backgroundCard, borderColor: COLORS.border }]}>
      <Animated.View style={[{ position: 'absolute', top: 0, bottom: 0, width: SCREEN_W }, sweep]}>
        <LinearGradient colors={['transparent', `${COLORS.primary}08`, 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ flex: 1 }} />
      </Animated.View>
      <View style={{ padding: SPACING.md, gap: 10, flexDirection: 'row' }}>
        <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: COLORS.backgroundElevated }} />
        <View style={{ flex: 1, gap: 8, justifyContent: 'center' }}>
          <View style={{ height: 11, borderRadius: 6, backgroundColor: COLORS.backgroundElevated, width: '80%' }} />
          <View style={{ height: 9, borderRadius: 5, backgroundColor: COLORS.backgroundElevated, width: '45%' }} />
        </View>
      </View>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function GlobalSearchScreen() {
  const params = useLocalSearchParams<{ initialQuery?: string; initialScope?: SearchScope }>();

  const {
    query, searchScope,
    results, isSearching, isSemanticReady, filters, totalCount,
    error, hasSearched, suggestions, showSuggestions,
    communityResults, communityIsSearching, communityIsSemanticReady,
    communityTotalCount, communityError, communityHasSearched, communityRecentQueries,
    setQuery, setSearchScope, setFilters, resetFilters,
    search, clearResults, clearHistory, onFocusInput, onBlurInput,
  } = useGlobalSearch();

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [actionTarget, setActionTarget] = useState<ActionChoiceTarget | null>(null);

  const [researcherResults,  setResearcherResults]  = useState<PublicResearcherResult[]>([]);
  const [researchersLoading, setResearchersLoading] = useState(false);
  const researcherDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (params.initialQuery?.trim()) setQuery(params.initialQuery.trim());
    if (params.initialScope === 'community') setSearchScope('community');
    setTimeout(() => inputRef.current?.focus(), 150);
  }, []);

  useEffect(() => {
    if (searchScope !== 'community') { setResearcherResults([]); return; }
    if (!query.trim() || query.trim().length < 2) { setResearcherResults([]); return; }
    if (researcherDebounce.current) clearTimeout(researcherDebounce.current);
    researcherDebounce.current = setTimeout(async () => {
      setResearchersLoading(true);
      try {
        const r = await searchPublicResearchers(query.trim(), 4);
        setResearcherResults(r);
      } catch { setResearcherResults([]); }
      finally { setResearchersLoading(false); }
    }, 400);
    return () => { if (researcherDebounce.current) clearTimeout(researcherDebounce.current); };
  }, [query, searchScope]);

  const isCommunity       = searchScope === 'community';
  const activeIsSearching = isCommunity ? communityIsSearching  : isSearching;
  const activeHasSearched = isCommunity ? communityHasSearched  : hasSearched;
  const activeTotalCount  = isCommunity ? communityTotalCount   : totalCount;
  const activeError       = isCommunity ? communityError        : error;
  const activeSemReady    = isCommunity ? communityIsSemanticReady : isSemanticReady;

  const handlePersonalPress = useCallback((result: SearchResult) => {
    Keyboard.dismiss();
    navigateToPersonalResult(result);
  }, []);

  const handleCommunityPress = useCallback((result: CommunitySearchResult) => {
    Keyboard.dismiss();
    setActionTarget({ kind: 'report', result });
  }, []);

  const handleResearcherPress = useCallback((researcher: PublicResearcherResult) => {
    Keyboard.dismiss();
    setActionTarget({ kind: 'researcher', result: researcher });
  }, []);

  const handleScopeChange = useCallback((s: SearchScope) => {
    setSearchScope(s);
    setResearcherResults([]);
    setTimeout(() => inputRef.current?.focus(), 80);
  }, [setSearchScope]);

  const handleSuggestionSelect = useCallback((q: string) => {
    setQuery(q); Keyboard.dismiss(); search(q);
  }, [setQuery, search]);

  const handleSubmit = useCallback(() => { Keyboard.dismiss(); search(); }, [search]);

  const activeFilterCount = [
    filters.contentType !== 'all',
    !!filters.dateFrom || !!filters.dateTo,
    !!filters.depth,
    filters.sortBy !== 'relevance',
    filters.searchMode !== 'hybrid',
  ].filter(Boolean).length;

  const renderPersonal = useCallback(({ item, index }: { item: SearchResult; index: number }) => (
    <SearchResultCard result={item} index={index} query={query} onPress={handlePersonalPress} />
  ), [query, handlePersonalPress]);

  const renderCommunity = useCallback(({ item, index }: { item: CommunitySearchResult; index: number }) => (
    <CommunityResultCard result={item} index={index} query={query} onPress={handleCommunityPress} />
  ), [query, handleCommunityPress]);

  const communityDisplayTotal = communityTotalCount + researcherResults.length;

  return (
    <LinearGradient colors={[COLORS.background, ...getAuroraGradient()] as [string, string, string]} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>

        {/* Header */}
        <LinearGradient colors={COLORS.gradientCard as [string, string]} style={[styles.header, { borderBottomColor: COLORS.border }]}>
          <View style={styles.headerRow}>
            <Pressable onPress={() => router.back()}
              hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
              style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.7 : 1, backgroundColor: COLORS.backgroundElevated, borderColor: COLORS.border }]}>
              <Ionicons name="arrow-back" size={20} color={COLORS.textSecondary} />
            </Pressable>
            <View style={[styles.inputWrap, { backgroundColor: COLORS.backgroundElevated, borderColor: query ? (isCommunity ? `${COLORS.success}50` : `${COLORS.primary}50`) : COLORS.border }]}>
              <Ionicons
                name={isCommunity ? 'globe-outline' : 'search'}
                size={18}
                color={isCommunity ? COLORS.success : (query ? COLORS.primary : COLORS.textMuted)}
                style={styles.inputIcon}
              />
              <TextInput
                ref={inputRef}
                value={query}
                onChangeText={setQuery}
                onFocus={onFocusInput}
                onBlur={onBlurInput}
                onSubmitEditing={handleSubmit}
                placeholder={isCommunity ? 'Search public research & researchers…' : 'Search all your content…'}
                placeholderTextColor={COLORS.textMuted}
                returnKeyType="search"
                style={[styles.input, { color: COLORS.textPrimary }]}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {(activeIsSearching || researchersLoading) ? (
                <ActivityIndicator
                  size="small"
                  color={isCommunity ? COLORS.success : COLORS.primary}
                  style={{ marginRight: 4 }}
                />
              ) : query.length > 0 ? (
                <TouchableOpacity onPress={clearResults} hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                  <Ionicons name="close-circle" size={18} color={COLORS.textMuted} />
                </TouchableOpacity>
              ) : null}
            </View>
          </View>

          {/* Scope toggle */}
          <View style={styles.scopeRow}>
            <ScopeToggle scope={searchScope} onChange={handleScopeChange} />
          </View>
        </LinearGradient>

        {/* Filter bar — personal only */}
        {!isCommunity && (
          <View style={[styles.filterBarWrap, { borderBottomColor: COLORS.border }]}>
            <SearchFilterBar
              filters={filters} onChange={setFilters}
              onOpenAdvanced={() => setShowAdvanced(true)}
              activeFilterCount={activeFilterCount}
            />
          </View>
        )}

        {/* Community info strip */}
        {isCommunity && (
          <View style={[styles.communityInfoStrip, { backgroundColor: `${COLORS.success}08`, borderBottomColor: `${COLORS.success}20` }]}>
            <Ionicons name="globe-outline" size={12} color={COLORS.success} />
            <Text style={[styles.communityInfoStripText, { color: COLORS.textMuted }]}>Searching public reports & researchers</Text>
            <TouchableOpacity onPress={() => router.push('/(app)/explore-researchers' as any)}
              hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}>
              <Text style={[styles.communityInfoStripLink, { color: COLORS.success }]}>Browse →</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Suggestions overlay */}
        {showSuggestions && (isCommunity ? communityRecentQueries.length > 0 : suggestions.length > 0) && (
          <SuggestionsOverlay
            suggestions={suggestions}
            communityRecentQueries={communityRecentQueries}
            scope={searchScope}
            onSelect={handleSuggestionSelect}
            onClearHistory={clearHistory}
          />
        )}

        {/* Error */}
        {activeError && !activeIsSearching && (
          <Animated.View entering={FadeIn.duration(300)} style={[styles.errorBanner, { backgroundColor: `${COLORS.error}10`, borderColor: `${COLORS.error}30` }]}>
            <Ionicons name="alert-circle-outline" size={15} color={COLORS.error} />
            <Text style={[styles.errorText, { color: COLORS.error }]}>{activeError}</Text>
          </Animated.View>
        )}

        {/* Content */}
        {activeHasSearched && !activeIsSearching ? (
          (isCommunity
            ? communityResults.length === 0 && researcherResults.length === 0
            : activeTotalCount === 0)
            ? (
              <Pressable style={{ flex: 1 }} onPress={Keyboard.dismiss}>
                <NoResultsState query={query} scope={searchScope} />
              </Pressable>
            )
            : (
              <>
                <ResultsBar
                  count={isCommunity ? communityDisplayTotal : activeTotalCount}
                  isSemanticReady={activeSemReady}
                  searchMode={filters.searchMode} query={query} scope={searchScope}
                />
                {!isCommunity && <ContentBreakdown results={results} />}

                {isCommunity ? (
                  <FlatList
                    data={communityResults}
                    renderItem={renderCommunity}
                    keyExtractor={item => `comm-${item.shareId || item.reportId}`}
                    contentContainerStyle={styles.listContent}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="on-drag"
                    onScrollBeginDrag={Keyboard.dismiss}
                    initialNumToRender={10} maxToRenderPerBatch={8} windowSize={5}
                    ListHeaderComponent={
                      researcherResults.length > 0 ? (
                        <View style={styles.researcherSection}>
                          <View style={styles.sectionHeader}>
                            <Ionicons name="people-outline" size={14} color={COLORS.primary} />
                            <Text style={[styles.sectionHeaderText, { color: COLORS.textMuted }]}>Researchers</Text>
                            <Text style={[styles.sectionHeaderCount, { backgroundColor: `${COLORS.primary}15`, color: COLORS.primary }]}>{researcherResults.length}</Text>
                          </View>
                          {researcherResults.map((r, i) => (
                            <ResearcherResultCard
                              key={r.id} researcher={r} index={i} onPress={handleResearcherPress}
                            />
                          ))}
                          {communityResults.length > 0 && (
                            <View style={styles.sectionDivider}>
                              <View style={[styles.sectionDividerLine, { backgroundColor: COLORS.border }]} />
                              <View style={styles.sectionHeader}>
                                <Ionicons name="document-text-outline" size={14} color={COLORS.primary} />
                                <Text style={[styles.sectionHeaderText, { color: COLORS.textMuted }]}>Public Reports</Text>
                                <Text style={[styles.sectionHeaderCount, { backgroundColor: `${COLORS.primary}15`, color: COLORS.primary }]}>{communityResults.length}</Text>
                              </View>
                            </View>
                          )}
                        </View>
                      ) : communityResults.length > 0 ? (
                        <View style={styles.sectionHeader}>
                          <Ionicons name="document-text-outline" size={14} color={COLORS.primary} />
                          <Text style={[styles.sectionHeaderText, { color: COLORS.textMuted }]}>Public Reports</Text>
                          <Text style={[styles.sectionHeaderCount, { backgroundColor: `${COLORS.primary}15`, color: COLORS.primary }]}>{communityResults.length}</Text>
                        </View>
                      ) : null
                    }
                  />
                ) : (
                  <FlatList
                    data={results}
                    renderItem={renderPersonal}
                    keyExtractor={item => `${item.contentType}-${item.id}`}
                    contentContainerStyle={styles.listContent}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="on-drag"
                    onScrollBeginDrag={Keyboard.dismiss}
                    initialNumToRender={10} maxToRenderPerBatch={8} windowSize={5}
                  />
                )}
              </>
            )
        ) : !activeHasSearched && !activeIsSearching ? (
          <Pressable style={{ flex: 1 }} onPress={Keyboard.dismiss}>
            <EmptySearchState scope={searchScope} onSuggest={handleSuggestionSelect} />
          </Pressable>
        ) : activeIsSearching ? (
          <Pressable style={{ flex: 1 }} onPress={Keyboard.dismiss}>
            <Animated.View entering={FadeIn.duration(300)} style={styles.loadingWrap}>
              {[0, 1, 2, 3].map(i => <SkeletonCard key={i} index={i} />)}
            </Animated.View>
          </Pressable>
        ) : null}

      </SafeAreaView>

      {/* Advanced filters */}
      <SearchAdvancedFilters
        visible={showAdvanced} filters={filters} onChange={setFilters}
        onReset={() => { resetFilters(); setShowAdvanced(false); }}
        onClose={() => setShowAdvanced(false)}
      />

      {/* Action choice modal */}
      <ActionChoiceModal
        target={actionTarget}
        onClose={() => setActionTarget(null)}
      />
    </LinearGradient>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getModalBackdrop(opacity: number = 0.6): string {
  const bg = COLORS.background;
  const hex = bg.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16) || 0;
  const g = parseInt(hex.substring(2, 4), 16) || 0;
  const b = parseInt(hex.substring(4, 6), 16) || 0;
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header: {
    paddingBottom: SPACING.sm,
    borderBottomWidth: 1,
  },
  headerRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACING.lg, paddingTop: SPACING.sm, paddingBottom: SPACING.sm,
    gap: SPACING.sm,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, flexShrink: 0,
  },
  inputWrap: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.md, height: 46,
    borderWidth: 1, gap: 8,
  },
  inputIcon: { flexShrink: 0 },
  input: { flex: 1, fontSize: FONTS.sizes.base, paddingVertical: 0 },
  scopeRow: {
    paddingHorizontal: SPACING.lg, paddingTop: 2,
  },
  scopeToggleWrap: {
    flexDirection: 'row',
    borderRadius: RADIUS.lg, padding: 3, gap: 3,
    borderWidth: 1, overflow: 'hidden',
  },
  scopeTab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 9, borderRadius: RADIUS.md, zIndex: 1,
  },
  scopeTabText: { fontSize: FONTS.sizes.sm, fontWeight: '700' },
  filterBarWrap: {
    paddingVertical: SPACING.sm, borderBottomWidth: 1,
  },
  communityInfoStrip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: SPACING.lg, paddingVertical: 8,
    borderBottomWidth: 1,
  },
  communityInfoStripText: { flex: 1, fontSize: FONTS.sizes.xs },
  communityInfoStripLink: { fontSize: FONTS.sizes.xs, fontWeight: '700' },
  suggestionsOverlayOuter: {
    position: 'absolute', top: 140, left: SPACING.lg, right: SPACING.lg, zIndex: 100,
    borderRadius: RADIUS.xl, overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 20, elevation: 10,
  },
  suggestionsOverlay: {
    borderWidth: 1, padding: SPACING.md,
  },
  suggestionsHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.sm,
  },
  suggestionsTitle: {
    fontSize: FONTS.sizes.xs, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase',
  },
  clearHistoryText: { fontSize: FONTS.sizes.xs, fontWeight: '700' },
  suggestionRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    paddingVertical: 10, borderBottomWidth: 1,
  },
  suggestionText: { flex: 1, fontSize: FONTS.sizes.sm },
  resultsBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm, gap: SPACING.sm,
  },
  resultsCount: { fontSize: FONTS.sizes.sm, flex: 1 },
  resultsRight: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 },
  semanticBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1,
  },
  semanticBadgeText: { fontSize: FONTS.sizes.xs, fontWeight: '700' },
  breakdownBar: {
    flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: SPACING.lg, gap: 6, paddingBottom: SPACING.sm,
  },
  breakdownChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1,
  },
  breakdownText: { fontSize: FONTS.sizes.xs, fontWeight: '600' },
  listContent: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.sm, paddingBottom: 80 },
  researcherSection: { marginBottom: SPACING.sm },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: SPACING.sm },
  sectionHeaderText: {
    fontSize: FONTS.sizes.xs, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8,
  },
  sectionHeaderCount: {
    fontSize: 10, fontWeight: '700', paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: RADIUS.full, overflow: 'hidden',
  },
  sectionDivider: { marginTop: SPACING.md },
  sectionDividerLine: { height: 1, marginBottom: SPACING.sm },
  researcherCard: {
    borderRadius: RADIUS.xl, borderWidth: 1, overflow: 'hidden', ...SHADOWS.small,
  },
  researcherCardGradient: {
    flexDirection: 'row', alignItems: 'center',
    padding: SPACING.md, gap: SPACING.sm,
  },
  researcherAvatarRing: {
    borderRadius: 24, borderWidth: 2, padding: 2, flexShrink: 0,
  },
  researcherInfo: { flex: 1, minWidth: 0 },
  researcherName: { fontSize: FONTS.sizes.base, fontWeight: '800', lineHeight: 20 },
  researcherUsername: { fontSize: FONTS.sizes.xs, marginTop: 1 },
  researcherStats: { flexDirection: 'row', gap: 10, marginTop: 4, flexWrap: 'wrap' },
  researcherStat: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  researcherStatText: { fontSize: 10 },
  openChip: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    borderRadius: RADIUS.full,
    paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, flexShrink: 0,
  },
  openChipText: { fontSize: 10, fontWeight: '700' },
  communityCard: {
    borderRadius: RADIUS.xl, borderWidth: 1, overflow: 'hidden', ...SHADOWS.small,
  },
  communityCardGradient: {
    paddingLeft: 6,
  },
  communityAccentBar: {
    position: 'absolute', left: 0, top: 0, bottom: 0, width: 4,
  },
  communityCardBody: { padding: SPACING.md, gap: SPACING.sm },
  communityTitleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  communityTitle: { fontSize: FONTS.sizes.base, fontWeight: '800', lineHeight: 22, letterSpacing: -0.2 },
  communityPreview: { fontSize: FONTS.sizes.sm, lineHeight: 20 },
  communityTagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, alignItems: 'center' },
  communityTag: {
    borderRadius: RADIUS.full,
    paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1,
  },
  communityTagText: { fontSize: 10, fontWeight: '600' },
  communityTagMore: { fontSize: 10, fontWeight: '600' },
  communityFooter: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  communityAuthorChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: RADIUS.full, paddingHorizontal: 7, paddingVertical: 3,
    borderWidth: 1, maxWidth: 140,
  },
  communityAuthorText: { fontSize: 10, fontWeight: '600', flexShrink: 1 },
  depthBadge: { borderRadius: RADIUS.full, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1 },
  depthBadgeText: { fontSize: 10, fontWeight: '700' },
  viewCount: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  viewCountText: { fontSize: 10, fontWeight: '600' },
  semanticDot: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    borderRadius: RADIUS.full, paddingHorizontal: 5, paddingVertical: 2,
    borderWidth: 1,
  },
  semanticDotText: { fontSize: 9, fontWeight: '700' },
  modalScrim: { flex: 1, justifyContent: 'flex-end' },
  modalSheetOuter: { borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: 'hidden' },
  modalSheet: {
    paddingHorizontal: SPACING.lg, paddingBottom: 36, paddingTop: SPACING.sm,
    borderTopWidth: 1,
  },
  modalHandle: {
    width: 40, height: 4, borderRadius: 2,
    alignSelf: 'center', marginBottom: SPACING.lg,
  },
  modalTitleRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.lg },
  modalTitleIcon: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  modalTitle: { fontSize: FONTS.sizes.base, fontWeight: '800', lineHeight: 22 },
  modalSubtitle: { fontSize: FONTS.sizes.xs, marginTop: 2 },
  modalOptionPrimary: { borderRadius: RADIUS.xl, overflow: 'hidden', marginBottom: SPACING.sm },
  modalOptionGradient: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, padding: SPACING.md },
  modalOptionSecondary: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md, padding: SPACING.md,
    borderRadius: RADIUS.xl,
    borderWidth: 1, marginBottom: SPACING.sm,
  },
  modalOptionSecondaryIcon: {
    width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, flexShrink: 0,
  },
  modalOptionText: { flex: 1 },
  modalOptionLabel: { fontSize: FONTS.sizes.base, fontWeight: '800' },
  modalOptionDesc: { fontSize: FONTS.sizes.xs, marginTop: 2 },
  modalCancel: { alignItems: 'center', paddingVertical: SPACING.md, marginTop: SPACING.xs },
  modalCancelText: { fontSize: FONTS.sizes.base, fontWeight: '600' },
  emptyWrap: { flex: 1, padding: SPACING.xl, paddingTop: SPACING.lg },
  emptyCard: {
    borderRadius: RADIUS.xl, padding: SPACING.xl, alignItems: 'center',
    borderWidth: 1, marginBottom: SPACING.xl, gap: SPACING.sm,
  },
  emptyIconCircle: { width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.sm, ...SHADOWS.medium },
  emptyTitle: { fontSize: FONTS.sizes.xl, fontWeight: '900', textAlign: 'center' },
  emptySubtext: { fontSize: FONTS.sizes.sm, textAlign: 'center', lineHeight: 20 },
  communityInfoRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: SPACING.xs,
    borderRadius: RADIUS.full, paddingHorizontal: 12, paddingVertical: 5,
  },
  communityInfoText: { fontSize: FONTS.sizes.xs, fontWeight: '600' },
  modeInfoRow: { flexDirection: 'row', gap: 8, marginTop: SPACING.sm, flexWrap: 'wrap', justifyContent: 'center' },
  modeInfoChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: RADIUS.full,
    paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1,
  },
  modeInfoLabel: { fontSize: FONTS.sizes.xs, fontWeight: '700' },
  suggestLabel: {
    fontSize: FONTS.sizes.xs, fontWeight: '700',
    letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: SPACING.md,
  },
  suggestRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  suggestChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: RADIUS.full, paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1,
  },
  suggestChipText: { fontSize: FONTS.sizes.sm },
  noResultsIcon: {
    width: 92, height: 92, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center', alignSelf: 'center',
    marginBottom: SPACING.md, marginTop: SPACING.xl * 2,
    borderWidth: 1,
  },
  noResultsTitle: { fontSize: FONTS.sizes.lg, fontWeight: '800', textAlign: 'center', marginBottom: SPACING.sm },
  noResultsSubtext: { fontSize: FONTS.sizes.sm, textAlign: 'center', lineHeight: 22 },
  exploreBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: SPACING.lg, alignSelf: 'center',
    borderRadius: RADIUS.full,
    paddingHorizontal: 18, paddingVertical: 9, borderWidth: 1,
  },
  exploreBtnText: { fontWeight: '700', fontSize: FONTS.sizes.sm },
  loadingWrap: { padding: SPACING.lg, gap: SPACING.sm },
  skeleton: { borderRadius: RADIUS.xl, borderWidth: 1, overflow: 'hidden' },
  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    marginHorizontal: SPACING.lg, marginVertical: SPACING.sm,
    borderRadius: RADIUS.lg,
    padding: SPACING.md, borderWidth: 1,
  },
  errorText: { flex: 1, fontSize: FONTS.sizes.sm },
});