// app/(app)/global-search.tsx
// Part 35 — FIXED
//
// Key fixes:
//   1. Navigation no longer happens from inside a modal → screen is opened as
//      a regular slide_from_bottom screen (not a modal presentation) so that
//      router.push() to any content screen works without freezing.
//   2. handleResultPress() correctly builds params for ALL content types,
//      including presentations (needs reportId) and academic papers (needs reportId).
//   3. Academic paper navigation guards against undefined reportId.
//   4. TS7053: Cast `type` to SearchContentType when indexing CONTENT_TYPE_META.

import React, { useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  Keyboard,
} from 'react-native';
import { LinearGradient }   from 'expo-linear-gradient';
import { Ionicons }         from '@expo/vector-icons';
import Animated, {
  FadeIn,
  FadeOut,
}                           from 'react-native-reanimated';
import { SafeAreaView }     from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';

import { useGlobalSearch }  from '../../src/hooks/useGlobalSearch';
import { SearchResultCard } from '../../src/components/search/SearchResultCard';
import {
  SearchFilterBar,
  SearchAdvancedFilters,
}                           from '../../src/components/search/SearchFilters';
import { SearchResult }     from '../../src/types/search';
import {
  CONTENT_TYPE_META,
  SEARCH_PLACEHOLDER_EXAMPLES,
  SEARCH_MODE_META,
}                           from '../../src/constants/search';
import { SearchContentType } from '../../src/types/search';
import { COLORS, FONTS, SPACING, RADIUS } from '../../src/constants/theme';

// ─── Navigation handler ───────────────────────────────────────────────────────
// This is the SINGLE place all navigation from search happens.
// Having it here (not in SearchResultCard) prevents modal freeze.

function navigateToResult(result: SearchResult) {
  const meta = result.metadata ?? {};

  switch (result.contentType) {
    case 'report':
      router.push({
        pathname: '/(app)/research-report' as any,
        params:   { reportId: result.id },
      });
      break;

    case 'podcast':
      router.push({
        pathname: '/(app)/podcast-player' as any,
        params:   { podcastId: result.id },
      });
      break;

    case 'debate':
      router.push({
        pathname: '/(app)/debate-detail' as any,
        params:   { sessionId: result.id },
      });
      break;

    case 'presentation': {
      // FIX: slide-preview needs reportId, and optionally presentationId
      const reportId = meta.reportId as string | null | undefined;
      if (reportId && reportId !== 'undefined') {
        router.push({
          pathname: '/(app)/slide-preview' as any,
          params:   { reportId, presentationId: result.id },
        });
      } else {
        // No reportId — still open by presentationId alone; slide-preview handles this
        router.push({
          pathname: '/(app)/slide-preview' as any,
          params:   { presentationId: result.id },
        });
      }
      break;
    }

    case 'academic_paper': {
      // FIX: academic-paper needs reportId to load via the hook's loadByReportId
      const reportId = meta.reportId as string | null | undefined;
      if (reportId && reportId !== 'undefined') {
        router.push({
          pathname: '/(app)/academic-paper' as any,
          params:   { reportId, paperId: result.id },
        });
      } else {
        // Fallback: open with only paperId — screen guards against undefined reportId
        router.push({
          pathname: '/(app)/academic-paper' as any,
          params:   { paperId: result.id },
        });
      }
      break;
    }
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const SUGGESTED_QUERIES = [
  'quantum computing', 'AI in healthcare', 'electric vehicles 2025',
  'climate change solutions', 'cryptocurrency regulation', 'remote work productivity',
];

function EmptySearchState({ onSuggest }: { onSuggest: (q: string) => void }) {
  return (
    <Animated.View entering={FadeIn.duration(400)} style={styles.emptyWrap}>
      <LinearGradient colors={['#1A1A35', '#12122A']} style={styles.emptyCard}>
        <LinearGradient colors={COLORS.gradientPrimary} style={styles.emptyIconCircle}>
          <Ionicons name="search" size={28} color="#FFF" />
        </LinearGradient>
        <Text style={styles.emptyTitle}>Search Everything</Text>
        <Text style={styles.emptySubtext}>
          Search across all your reports, podcasts, debates, slides, and papers in one place
        </Text>
        <View style={styles.modeInfoRow}>
          {(['keyword', 'semantic', 'hybrid'] as const).map(mode => {
            const meta = SEARCH_MODE_META[mode];
            return (
              <View key={mode} style={[styles.modeInfoChip, { borderColor: `${meta.color}30`, backgroundColor: `${meta.color}10` }]}>
                <Ionicons name={meta.icon as any} size={11} color={meta.color} />
                <Text style={[styles.modeInfoLabel, { color: meta.color }]}>{meta.label}</Text>
              </View>
            );
          })}
        </View>
      </LinearGradient>

      <Text style={styles.suggestLabel}>Try searching for</Text>
      <View style={styles.suggestRow}>
        {SUGGESTED_QUERIES.map(q => (
          <TouchableOpacity key={q} onPress={() => onSuggest(q)} activeOpacity={0.75} style={styles.suggestChip}>
            <Ionicons name="search-outline" size={11} color={COLORS.primary} />
            <Text style={styles.suggestChipText}>{q}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </Animated.View>
  );
}

function NoResultsState({ query }: { query: string }) {
  return (
    <Animated.View entering={FadeIn.duration(400)} style={styles.emptyWrap}>
      <View style={styles.noResultsIcon}>
        <Ionicons name="search-outline" size={40} color={COLORS.border} />
      </View>
      <Text style={styles.noResultsTitle}>No results found</Text>
      <Text style={styles.noResultsSubtext}>
        No content matched{' '}
        <Text style={{ color: COLORS.textPrimary, fontWeight: '700' }}>"{query}"</Text>
        {'\n'}Try different keywords or switch to Hybrid / Semantic mode
      </Text>
    </Animated.View>
  );
}

function ResultsBar({ count, isSemanticReady, searchMode, query }: {
  count: number; isSemanticReady: boolean; searchMode: string; query: string;
}) {
  return (
    <Animated.View entering={FadeIn.duration(300)} style={styles.resultsBar}>
      <Text style={styles.resultsCount}>
        <Text style={{ color: COLORS.primary, fontWeight: '800' }}>{count}</Text>
        {' '}result{count !== 1 ? 's' : ''} for{' '}
        <Text style={{ color: COLORS.textPrimary, fontWeight: '600' }}>"{query}"</Text>
      </Text>
      <View style={styles.resultsRight}>
        {searchMode !== 'keyword' && isSemanticReady && (
          <View style={styles.semanticBadge}>
            <Ionicons name="git-network-outline" size={10} color={COLORS.success} />
            <Text style={styles.semanticBadgeText}>Semantic</Text>
          </View>
        )}
        {searchMode !== 'keyword' && !isSemanticReady && (
          <View style={[styles.semanticBadge, { borderColor: `${COLORS.warning}30`, backgroundColor: `${COLORS.warning}10` }]}>
            <Ionicons name="git-network-outline" size={10} color={COLORS.warning} />
            <Text style={[styles.semanticBadgeText, { color: COLORS.warning }]}>Keyword only</Text>
          </View>
        )}
      </View>
    </Animated.View>
  );
}

function SuggestionsOverlay({ suggestions, onSelect, onClearHistory }: {
  suggestions: { query: string; useCount: number }[];
  onSelect: (q: string) => void;
  onClearHistory: () => void;
}) {
  if (suggestions.length === 0) return null;
  return (
    <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)} style={styles.suggestionsOverlay}>
      <View style={styles.suggestionsHeader}>
        <Text style={styles.suggestionsTitle}>Recent Searches</Text>
        <TouchableOpacity onPress={onClearHistory} hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}>
          <Text style={styles.clearHistoryText}>Clear</Text>
        </TouchableOpacity>
      </View>
      {suggestions.slice(0, 6).map((item, i) => (
        <TouchableOpacity key={item.query + i} onPress={() => onSelect(item.query)} activeOpacity={0.75} style={styles.suggestionRow}>
          <Ionicons name="time-outline" size={15} color={COLORS.textMuted} />
          <Text style={styles.suggestionText} numberOfLines={1}>{item.query}</Text>
          <Ionicons name="arrow-up-outline" size={14} color={COLORS.textMuted} style={{ transform: [{ rotate: '45deg' }] }} />
        </TouchableOpacity>
      ))}
    </Animated.View>
  );
}

function ContentBreakdown({ results }: { results: SearchResult[] }) {
  const counts: Partial<Record<SearchContentType, number>> = {};
  for (const r of results) {
    const ct = r.contentType as SearchContentType;
    counts[ct] = (counts[ct] ?? 0) + 1;
  }
  const types = (Object.entries(counts) as [SearchContentType, number][]).filter(([, c]) => c > 0);
  if (types.length <= 1) return null;
  return (
    <Animated.View entering={FadeIn.duration(300)} style={styles.breakdownBar}>
      {types.map(([type, count]) => {
        // FIX TS7053: cast key to SearchContentType before indexing CONTENT_TYPE_META
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

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function GlobalSearchScreen() {
  const params = useLocalSearchParams<{ initialQuery?: string }>();

  const {
    query, results, isSearching, isSemanticReady,
    filters, totalCount, error, hasSearched,
    suggestions, showSuggestions,
    setQuery, setFilters, resetFilters,
    search, clearResults, clearHistory,
    onFocusInput, onBlurInput,
  } = useGlobalSearch();

  const [showAdvanced, setShowAdvanced] = React.useState(false);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (params.initialQuery?.trim()) {
      setQuery(params.initialQuery.trim());
    }
    setTimeout(() => inputRef.current?.focus(), 150);
  }, []);

  // FIX: navigation handled HERE, not inside SearchResultCard
  // This prevents the modal-stack freeze.
  const handleResultPress = useCallback((result: SearchResult) => {
    Keyboard.dismiss();
    navigateToResult(result);
  }, []);

  const handleSuggestionSelect = useCallback((q: string) => {
    setQuery(q);
    Keyboard.dismiss();
    search(q);
  }, [setQuery, search]);

  const handleSubmit = useCallback(() => {
    Keyboard.dismiss();
    search();
  }, [search]);

  const activeFilterCount = [
    filters.contentType !== 'all',
    !!filters.dateFrom || !!filters.dateTo,
    !!filters.depth,
    filters.sortBy !== 'relevance',
    filters.searchMode !== 'hybrid',
  ].filter(Boolean).length;

  const renderItem = useCallback(({ item, index }: { item: SearchResult; index: number }) => (
    <SearchResultCard
      result={item}
      index={index}
      query={query}
      onPress={handleResultPress}  // ← pass handler down
    />
  ), [query, handleResultPress]);

  const keyExtractor = useCallback(
    (item: SearchResult) => `${item.contentType}-${item.id}`, [],
  );

  return (
    <LinearGradient colors={[COLORS.background, COLORS.backgroundCard]} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>

        {/* ── Header ──────────────────────────────────────────────────── */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
            style={styles.backBtn}
          >
            <Ionicons name="arrow-back" size={20} color={COLORS.textSecondary} />
          </TouchableOpacity>

          <View style={styles.inputWrap}>
            <Ionicons name="search" size={18} color={COLORS.textMuted} style={styles.inputIcon} />
            <TextInput
              ref={inputRef}
              value={query}
              onChangeText={setQuery}
              onFocus={onFocusInput}
              onBlur={onBlurInput}
              onSubmitEditing={handleSubmit}
              placeholder="Search all your content..."
              placeholderTextColor={COLORS.textMuted}
              returnKeyType="search"
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {isSearching ? (
              <ActivityIndicator size="small" color={COLORS.primary} style={{ marginRight: 4 }} />
            ) : query.length > 0 ? (
              <TouchableOpacity
                onPress={clearResults}
                hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
              >
                <Ionicons name="close-circle" size={18} color={COLORS.textMuted} />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        {/* ── Filter Bar ──────────────────────────────────────────────── */}
        <View style={styles.filterBarWrap}>
          <SearchFilterBar
            filters={filters}
            onChange={setFilters}
            onOpenAdvanced={() => setShowAdvanced(true)}
            activeFilterCount={activeFilterCount}
          />
        </View>

        {/* ── Suggestions overlay ─────────────────────────────────────── */}
        {showSuggestions && suggestions.length > 0 && (
          <SuggestionsOverlay
            suggestions={suggestions}
            onSelect={handleSuggestionSelect}
            onClearHistory={clearHistory}
          />
        )}

        {/* ── Error ───────────────────────────────────────────────────── */}
        {error && !isSearching && (
          <Animated.View entering={FadeIn.duration(300)} style={styles.errorBanner}>
            <Ionicons name="alert-circle-outline" size={15} color={COLORS.error} />
            <Text style={styles.errorText}>{error}</Text>
          </Animated.View>
        )}

        {/* ── Content ─────────────────────────────────────────────────── */}
        {hasSearched && !isSearching ? (
          totalCount === 0 ? (
            <NoResultsState query={query} />
          ) : (
            <>
              <ResultsBar
                count={totalCount} isSemanticReady={isSemanticReady}
                searchMode={filters.searchMode} query={query}
              />
              <ContentBreakdown results={results} />
              <FlatList
                data={results}
                renderItem={renderItem}
                keyExtractor={keyExtractor}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                onScrollBeginDrag={Keyboard.dismiss}
                initialNumToRender={10}
                maxToRenderPerBatch={8}
                windowSize={5}
              />
            </>
          )
        ) : !hasSearched && !isSearching ? (
          <EmptySearchState onSuggest={handleSuggestionSelect} />
        ) : isSearching ? (
          <Animated.View entering={FadeIn.duration(300)} style={styles.loadingWrap}>
            {[0, 1, 2, 3].map(i => (
              <View key={i} style={[styles.skeleton, { opacity: 1 - i * 0.2, height: 100 + (i % 2) * 20 }]} />
            ))}
          </Animated.View>
        ) : null}

      </SafeAreaView>

      <SearchAdvancedFilters
        visible={showAdvanced}
        filters={filters}
        onChange={setFilters}
        onReset={() => { resetFilters(); setShowAdvanced(false); }}
        onClose={() => setShowAdvanced(false)}
      />
    </LinearGradient>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm,
    gap: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: COLORS.backgroundElevated,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: COLORS.border, flexShrink: 0,
  },
  inputWrap: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.backgroundElevated,
    borderRadius: RADIUS.lg, paddingHorizontal: SPACING.md, paddingVertical: 10,
    borderWidth: 1, borderColor: COLORS.borderFocus, gap: 8,
  },
  inputIcon: { flexShrink: 0 },
  input: { flex: 1, color: COLORS.textPrimary, fontSize: FONTS.sizes.base },
  filterBarWrap: {
    paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  suggestionsOverlay: {
    position: 'absolute', top: 110, left: SPACING.lg, right: SPACING.lg, zIndex: 100,
    backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.xl,
    borderWidth: 1, borderColor: COLORS.border, padding: SPACING.md,
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 20, elevation: 10,
  },
  suggestionsHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.sm,
  },
  suggestionsTitle: {
    color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '700',
    letterSpacing: 0.8, textTransform: 'uppercase',
  },
  clearHistoryText: { color: COLORS.error, fontSize: FONTS.sizes.xs, fontWeight: '600' },
  suggestionRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: `${COLORS.border}60`,
  },
  suggestionText: { flex: 1, color: COLORS.textSecondary, fontSize: FONTS.sizes.sm },
  resultsBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm,
  },
  resultsCount: { color: COLORS.textMuted, fontSize: FONTS.sizes.sm },
  resultsRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  semanticBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: `${COLORS.success}12`, borderRadius: RADIUS.full,
    paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: `${COLORS.success}30`,
  },
  semanticBadgeText: { color: COLORS.success, fontSize: FONTS.sizes.xs, fontWeight: '700' },
  breakdownBar: {
    flexDirection: 'row', flexWrap: 'wrap',
    paddingHorizontal: SPACING.lg, gap: 6, paddingBottom: SPACING.sm,
  },
  breakdownChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1,
  },
  breakdownText: { fontSize: FONTS.sizes.xs, fontWeight: '600' },
  listContent: {
    paddingHorizontal: SPACING.lg, paddingTop: SPACING.sm, paddingBottom: 80,
  },
  emptyWrap: { flex: 1, padding: SPACING.xl, paddingTop: SPACING.lg },
  emptyCard: {
    borderRadius: RADIUS.xl, padding: SPACING.xl, alignItems: 'center',
    borderWidth: 1, borderColor: `${COLORS.primary}25`, marginBottom: SPACING.xl, gap: SPACING.sm,
  },
  emptyIconCircle: {
    width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.sm,
  },
  emptyTitle: { color: COLORS.textPrimary, fontSize: FONTS.sizes.xl, fontWeight: '800', textAlign: 'center' },
  emptySubtext: { color: COLORS.textMuted, fontSize: FONTS.sizes.sm, textAlign: 'center', lineHeight: 20 },
  modeInfoRow: { flexDirection: 'row', gap: 8, marginTop: SPACING.sm, flexWrap: 'wrap', justifyContent: 'center' },
  modeInfoChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1,
  },
  modeInfoLabel: { fontSize: FONTS.sizes.xs, fontWeight: '700' },
  suggestLabel: {
    color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '700',
    letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: SPACING.md,
  },
  suggestRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  suggestChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.full,
    paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1, borderColor: `${COLORS.primary}25`,
  },
  suggestChipText: { color: COLORS.textSecondary, fontSize: FONTS.sizes.sm },
  noResultsIcon: {
    width: 80, height: 80, borderRadius: 24, backgroundColor: COLORS.backgroundElevated,
    alignItems: 'center', justifyContent: 'center', alignSelf: 'center',
    marginBottom: SPACING.md, marginTop: SPACING.xl * 2,
  },
  noResultsTitle: {
    color: COLORS.textPrimary, fontSize: FONTS.sizes.lg, fontWeight: '700',
    textAlign: 'center', marginBottom: SPACING.sm,
  },
  noResultsSubtext: { color: COLORS.textMuted, fontSize: FONTS.sizes.sm, textAlign: 'center', lineHeight: 22 },
  loadingWrap: { padding: SPACING.lg, gap: SPACING.sm },
  skeleton: {
    backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.xl, borderWidth: 1, borderColor: COLORS.border,
  },
  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    marginHorizontal: SPACING.lg, marginVertical: SPACING.sm,
    backgroundColor: `${COLORS.error}10`, borderRadius: RADIUS.lg,
    padding: SPACING.md, borderWidth: 1, borderColor: `${COLORS.error}30`,
  },
  errorText: { flex: 1, color: COLORS.error, fontSize: FONTS.sizes.sm },
});