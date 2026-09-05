// src/components/workspace/ChatGifPicker.tsx
// Part 50.2 — GIPHY GIF Picker for Stream Chat
// Part 55.2 — Fully theme-integrated: all hardcoded colors replaced with live
//             COLORS from the theme system. Uses getModalBackdrop for backdrop.
// Part 59 — GIPHY key moved server-side.
//
//   GIPHY passes its key as a URL query parameter, which makes it the worst
//   offender of the four: anyone watching the device's network traffic — or
//   just running `strings` on the bundle — had the credential. All requests now
//   go through the `search-gateway` Edge Function.
//
//   `giphyApiKey` is kept as an OPTIONAL, IGNORED prop so workspace-chat.tsx
//   compiles without edits. Remove the prop from the call site when convenient
//   (see PART59_SETUP.md); leaving it does no harm beyond inlining an empty
//   string.

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  memo,
} from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Platform,
  StatusBar,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, FONTS, SPACING, RADIUS, getModalBackdrop } from '../../constants/theme';
import { callGateway, GatewayError } from '../../services/apiGateway';

// ─── Types ────────────────────────────────────────────────────────────────────

interface GiphyImage {
  url:   string;
  webp?: string;
  width:  string;
  height: string;
}

interface GiphyGif {
  id:    string;
  title: string;
  images: {
    fixed_width:              GiphyImage;
    fixed_width_downsampled?: GiphyImage;
    fixed_width_small?:       GiphyImage;
    original:                 GiphyImage;
    preview_gif?:             GiphyImage;
    downsized?:               GiphyImage;
  };
}

interface GiphyResponse {
  data:       GiphyGif[];
  pagination: { total_count: number; count: number; offset: number };
}

/** Envelope returned by the search-gateway. */
interface GatewayEnvelope<T> { data: T; }

type ContentTab = 'gifs' | 'stickers';

export interface ChatGifPickerProps {
  visible:     boolean;
  onClose:     () => void;
  onSelect:    (url: string, title: string, isSticker: boolean) => void;
  /**
   * @deprecated Part 59 — the key lives on the server now. Accepted and ignored
   * so existing call sites keep compiling.
   */
  giphyApiKey?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SCREEN_WIDTH  = Dimensions.get('window').width;
const NUM_COLS      = 2;
const COL_GAP       = 6;
const H_PAD         = 12;
const COL_WIDTH     = (SCREEN_WIDTH - H_PAD * 2 - COL_GAP * (NUM_COLS - 1)) / NUM_COLS;
const DEBOUNCE_MS   = 300;
const PAGE_LIMIT    = 24;

const SUGGESTED_GIFS = [
  'Trending 🔥', 'Funny 😂', 'Reaction 😮', 'Happy 😄',
  'Sad 😢', 'Wow 🤩', 'Clap 👏', 'Think 🤔',
];

const SUGGESTED_STICKERS = [
  'Trending 🔥', 'Love ❤️', 'Star ⭐', 'Fire 🔥',
  'Thumbs Up 👍', 'Party 🎉', 'Laugh 😂', 'Sad 😢',
];

// ─── GIF / Sticker Cell ───────────────────────────────────────────────────────

interface GifCellProps {
  item:       GiphyGif;
  colIndex:   number;
  contentTab: ContentTab;
  onPress:    (gif: GiphyGif) => void;
}

const GifCell = memo(function GifCell({ item, colIndex, contentTab, onPress }: GifCellProps) {
  const fw = item.images.fixed_width;
  const rawW = parseFloat(fw.width)  || 200;
  const rawH = parseFloat(fw.height) || 150;
  const scaledH = (rawH / rawW) * COL_WIDTH;
  const displayH = colIndex % 2 === 0
    ? Math.max(80, scaledH)
    : Math.max(80, scaledH * 0.92);

  const displayUrl = contentTab === 'stickers'
    ? (fw.webp ?? fw.url)
    : fw.url;

  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={() => onPress(item)}
      style={[
        gifCellStyles.container,
        { height: displayH, width: COL_WIDTH, backgroundColor: COLORS.backgroundElevated },
        contentTab === 'stickers' && { backgroundColor: COLORS.backgroundCard, borderColor: `${COLORS.border}50`, borderWidth: 1 },
      ]}
    >
      <ExpoImage
        source={{ uri: displayUrl }}
        style={[gifCellStyles.image, { height: displayH }]}
        contentFit={contentTab === 'stickers' ? 'contain' : 'cover'}
        autoplay
        transition={150}
        cachePolicy="memory-disk"
      />
      {contentTab === 'stickers' && (
        <View style={[gifCellStyles.stickerBadge, { backgroundColor: `${COLORS.primary}90` }]}>
          <Text style={gifCellStyles.stickerBadgeText}>PNG</Text>
        </View>
      )}
    </TouchableOpacity>
  );
});

const gifCellStyles = StyleSheet.create({
  container: {
    borderRadius:    RADIUS.md,
    overflow:        'hidden',
  },
  image: {
    width:        '100%',
    borderRadius: RADIUS.md,
  },
  stickerBadge: {
    position:        'absolute',
    bottom:          4,
    right:           4,
    borderRadius:    4,
    paddingHorizontal: 4,
    paddingVertical:   1,
  },
  stickerBadgeText: {
    color:      '#FFF',
    fontSize:   8,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
});

// ─── Main Component ───────────────────────────────────────────────────────────

export function ChatGifPicker({
  visible,
  onClose,
  onSelect,
}: ChatGifPickerProps) {
  const insets = useSafeAreaInsets();

  const [activeTab,   setActiveTab]   = useState<ContentTab>('gifs');
  const [query,       setQuery]       = useState('');
  const [gifs,        setGifs]        = useState<GiphyGif[]>([]);
  const [loading,     setLoading]     = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [offset,      setOffset]      = useState(0);
  const [hasMore,     setHasMore]     = useState(true);
  const [activeChip,  setActiveChip]  = useState<string | null>(null);

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef      = useRef<TextInput>(null);
  const isMounted     = useRef(false);

  // ── Part 59: fetch through the gateway ──────────────────────────────────────
  const fetchGifs = useCallback(async (
    term:  string,
    off:   number,
    reset: boolean,
    tab:   ContentTab,
  ) => {
    if (!isMounted.current) return;

    try {
      if (reset) { setLoading(true); setError(null); }
      else        { setLoadingMore(true); }

      const trimmed = term.trim();

      const envelope = await callGateway<GatewayEnvelope<GiphyResponse>>(
        'search-gateway',
        {
          provider: 'giphy',
          op:       trimmed ? 'search' : 'trending',
          params: {
            kind:   tab === 'stickers' ? 'stickers' : 'gifs',
            q:      trimmed,
            limit:  PAGE_LIMIT,
            offset: off,
          },
        },
      );

      if (!isMounted.current) return;

      const json    = envelope?.data;
      const newGifs = json?.data ?? [];
      const total   = json?.pagination?.total_count ?? 0;
      const newOff  = off + newGifs.length;

      setGifs(prev => reset ? newGifs : [...prev, ...newGifs]);
      setOffset(newOff);
      setHasMore(newOff < total && newGifs.length === PAGE_LIMIT);
    } catch (err) {
      if (!isMounted.current) return;

      if (err instanceof GatewayError && err.isNotConfigured) {
        setError('GIFs are turned off for this workspace.');
      } else if (err instanceof GatewayError && err.isRateLimited) {
        setError('Too many requests. Give it a second and try again.');
      } else {
        setError('Could not load GIFs. Check your connection.');
      }
    } finally {
      if (isMounted.current) { setLoading(false); setLoadingMore(false); }
    }
  }, []);

  useEffect(() => {
    if (visible) {
      isMounted.current = true;
      setQuery('');
      setActiveChip(null);
      fetchGifs('', 0, true, activeTab);
    } else {
      isMounted.current = false;
    }
    return () => { isMounted.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    setQuery('');
    setActiveChip(null);
    setGifs([]);
    if (inputRef.current) inputRef.current.clear();
    fetchGifs('', 0, true, activeTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  useEffect(() => {
    if (!visible) return;
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      fetchGifs(query, 0, true, activeTab);
    }, DEBOUNCE_MS);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, visible]);

  const handleLoadMore = useCallback(() => {
    if (!loadingMore && !loading && hasMore) {
      fetchGifs(query, offset, false, activeTab);
    }
  }, [loadingMore, loading, hasMore, query, offset, activeTab, fetchGifs]);

  const handleGifPress = useCallback((gif: GiphyGif) => {
    const isSticker = activeTab === 'stickers';

    let url: string;
    if (isSticker) {
      url = gif.images.original.url ?? gif.images.original.webp ?? '';
    } else {
      url = gif.images.original.url;
    }

    const title = gif.title || (isSticker ? 'Sticker' : 'GIF');
    onSelect(url, title, isSticker);
    onClose();
  }, [activeTab, onSelect, onClose]);

  const handleChipPress = useCallback((chip: string) => {
    if (chip.startsWith('Trending')) {
      setQuery('');
      setActiveChip(chip);
      if (inputRef.current) inputRef.current.clear();
      fetchGifs('', 0, true, activeTab);
    } else {
      const term = chip.split(' ')[0];
      setQuery(term);
      setActiveChip(term);
    }
  }, [activeTab, fetchGifs]);

  const handleClear = useCallback(() => {
    setQuery('');
    setActiveChip(null);
    fetchGifs('', 0, true, activeTab);
  }, [activeTab, fetchGifs]);

  const handleTabChange = useCallback((tab: ContentTab) => {
    if (tab === activeTab) return;
    setActiveTab(tab);
  }, [activeTab]);

  const renderItem = useCallback(({ item, index }: { item: GiphyGif; index: number }) => (
    <View style={gridStyles.cell}>
      <GifCell
        item={item}
        colIndex={index % NUM_COLS}
        contentTab={activeTab}
        onPress={handleGifPress}
      />
    </View>
  ), [activeTab, handleGifPress]);

  const keyExtractor = useCallback((item: GiphyGif, index: number) =>
    `${activeTab}_${item.id}_${index}`, [activeTab]);

  const ListFooter = useCallback(() => {
    if (!loadingMore) return <View style={{ height: 20 }} />;
    return <View style={gridStyles.footer}><ActivityIndicator size="small" color={COLORS.primary} /></View>;
  }, [loadingMore]);

  const ListEmpty = useCallback(() => {
    if (loading) return null;
    return (
      <View style={gridStyles.empty}>
        {error ? (
          <>
            <Ionicons name="alert-circle-outline" size={36} color={COLORS.error} />
            <Text style={[gridStyles.emptyText, { color: COLORS.textSecondary }]}>{error}</Text>
            <TouchableOpacity style={[gridStyles.retryBtn, { backgroundColor: COLORS.primary }]} onPress={() => fetchGifs(query, 0, true, activeTab)}>
              <Text style={[gridStyles.retryText, { color: '#FFF' }]}>Try again</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={{ fontSize: 32 }}>{activeTab === 'stickers' ? '🎭' : '🔍'}</Text>
            <Text style={[gridStyles.emptyText, { color: COLORS.textSecondary }]}>{activeTab === 'stickers' ? 'No stickers found' : 'No GIFs found'}</Text>
            <Text style={[gridStyles.emptySubText, { color: COLORS.textMuted }]}>Try a different search term</Text>
          </>
        )}
      </View>
    );
  }, [loading, error, query, activeTab, fetchGifs]);

  const currentSuggested = activeTab === 'stickers' ? SUGGESTED_STICKERS : SUGGESTED_GIFS;

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : undefined}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={[styles.root, { backgroundColor: COLORS.background, paddingTop: insets.top }]}>
        <StatusBar barStyle="light-content" />

        <View style={[styles.header, { borderBottomColor: COLORS.border }]}>
          <TouchableOpacity onPress={onClose} style={[styles.closeBtn, { backgroundColor: COLORS.backgroundCard, borderColor: COLORS.border }]} activeOpacity={0.7}>
            <Ionicons name="close" size={20} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <View style={[styles.tabRow, { backgroundColor: COLORS.backgroundElevated, borderColor: COLORS.border }]}>
              <TouchableOpacity
                style={[styles.tabBtn, activeTab === 'gifs' && { backgroundColor: COLORS.primary }]}
                onPress={() => handleTabChange('gifs')}
                activeOpacity={0.75}
              >
                <Text style={[styles.tabBtnText, { color: activeTab === 'gifs' ? '#FFFFFF' : COLORS.textSecondary }]}>
                  GIF
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tabBtn, activeTab === 'stickers' && { backgroundColor: COLORS.primary }]}
                onPress={() => handleTabChange('stickers')}
                activeOpacity={0.75}
              >
                <Text style={[styles.tabBtnText, { color: activeTab === 'stickers' ? '#FFFFFF' : COLORS.textSecondary }]}>
                  Stickers
                </Text>
              </TouchableOpacity>
            </View>
            <View style={styles.poweredByRow}>
              <Text style={[styles.poweredByText, { color: COLORS.textMuted }]}>Powered by</Text>
              <GiphyLogo />
            </View>
          </View>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.searchRow}>
          <View style={[styles.searchBar, { backgroundColor: COLORS.backgroundElevated, borderColor: COLORS.border }]}>
            <Ionicons name="search-outline" size={16} color={COLORS.textMuted} style={styles.searchIcon} />
            <TextInput
              ref={inputRef}
              style={[styles.searchInput, { color: COLORS.textPrimary }]}
              placeholder={activeTab === 'stickers' ? 'Search stickers…' : 'Search GIPHY…'}
              placeholderTextColor={COLORS.textMuted}
              value={query}
              onChangeText={setQuery}
              returnKeyType="search"
              autoCorrect={false}
              autoCapitalize="none"
              selectionColor={COLORS.primary}
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={handleClear} activeOpacity={0.7}>
                <Ionicons name="close-circle" size={16} color={COLORS.textMuted} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        <View style={styles.chipsWrap}>
          <FlatList
            horizontal
            data={currentSuggested}
            keyExtractor={s => `${activeTab}_${s}`}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipsContent}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[
                  styles.chip,
                  { backgroundColor: COLORS.backgroundElevated, borderColor: COLORS.border },
                  activeChip === item && { backgroundColor: `${COLORS.primary}20`, borderColor: `${COLORS.primary}60` },
                ]}
                onPress={() => handleChipPress(item)}
                activeOpacity={0.7}
              >
                <Text style={[styles.chipText, { color: COLORS.textSecondary }, activeChip === item && { color: COLORS.primary }]}>
                  {item}
                </Text>
              </TouchableOpacity>
            )}
          />
        </View>

        {activeTab === 'stickers' && (
          <View style={styles.stickerHint}>
            <Ionicons name="checkmark-circle-outline" size={13} color={COLORS.primary} />
            <Text style={[styles.stickerHintText, { color: COLORS.textMuted }]}>
              Stickers send with transparent background — no bubble
            </Text>
          </View>
        )}

        {loading ? (
          <View style={gridStyles.loadingWrap}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={[gridStyles.loadingText, { color: COLORS.textMuted }]}>
              {query
                ? `Searching "${query}"…`
                : activeTab === 'stickers' ? 'Loading trending stickers…' : 'Loading trending GIFs…'}
            </Text>
          </View>
        ) : (
          <FlatList
            data={gifs}
            keyExtractor={keyExtractor}
            numColumns={NUM_COLS}
            renderItem={renderItem}
            contentContainerStyle={[
              gridStyles.list,
              { paddingBottom: insets.bottom + 16 },
            ]}
            columnWrapperStyle={gridStyles.row}
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.4}
            ListEmptyComponent={ListEmpty}
            ListFooterComponent={ListFooter}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            initialNumToRender={12}
            maxToRenderPerBatch={12}
            windowSize={5}
          />
        )}
      </View>
    </Modal>
  );
}

// ─── GIPHY Logo (attribution is required by their TOS) ────────────────────────

function GiphyLogo() {
  const letters = [
    { char: 'G', color: '#00CDAC' },
    { char: 'I', color: '#FFC926' },
    { char: 'P', color: '#9C4FFF' },
    { char: 'H', color: '#FF6666' },
    { char: 'Y', color: '#00CDAC' },
  ];
  return (
    <View style={logoStyles.row}>
      {letters.map((l, i) => (
        <Text key={i} style={[logoStyles.letter, { color: l.color }]}>{l.char}</Text>
      ))}
    </View>
  );
}

const logoStyles = StyleSheet.create({
  row:    { flexDirection: 'row', alignItems: 'center', marginLeft: 4 },
  letter: { fontSize: 13, fontWeight: '900', letterSpacing: -0.5 },
});

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:            { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACING.md, paddingVertical: 12,
    borderBottomWidth: 1,
  },
  closeBtn: {
    width: 36, height: 36, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
  },
  headerSpacer:  { width: 36, height: 36 },
  headerCenter:  { flex: 1, alignItems: 'center' },
  tabRow: {
    flexDirection: 'row',
    borderRadius: RADIUS.full,
    borderWidth: 1,
    padding: 3, gap: 2,
  },
  tabBtn:            { paddingHorizontal: 16, paddingVertical: 6, borderRadius: RADIUS.full },
  tabBtnText:        { fontSize: FONTS.sizes.sm, fontWeight: '700', letterSpacing: 0.3 },
  poweredByRow:      { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  poweredByText:     { fontSize: FONTS.sizes.xs },
  searchRow: {
    paddingHorizontal: H_PAD, paddingTop: SPACING.sm, paddingBottom: SPACING.xs,
  },
  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: RADIUS.xl, borderWidth: 1,
    paddingHorizontal: 12, paddingVertical: 9, gap: 8,
  },
  searchIcon:    { flexShrink: 0 },
  searchInput:   { flex: 1, fontSize: FONTS.sizes.base, padding: 0, margin: 0 },
  chipsWrap:     { paddingBottom: SPACING.xs },
  chipsContent:  { paddingHorizontal: H_PAD, gap: 8 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: RADIUS.full, borderWidth: 1,
  },
  chipText:          { fontSize: FONTS.sizes.sm, fontWeight: '600' },
  stickerHint: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: H_PAD, paddingBottom: SPACING.xs,
  },
  stickerHintText:   { fontSize: FONTS.sizes.xs },
});

const gridStyles = StyleSheet.create({
  list:        { paddingHorizontal: H_PAD, paddingTop: SPACING.xs },
  row:         { gap: COL_GAP, marginBottom: COL_GAP, justifyContent: 'space-between' },
  cell:        {},
  footer:      { paddingVertical: 20, alignItems: 'center' },
  empty:       { paddingTop: 60, alignItems: 'center', gap: 12 },
  emptyText:   { fontSize: FONTS.sizes.base, fontWeight: '600' },
  emptySubText:{ fontSize: FONTS.sizes.sm },
  retryBtn:    { marginTop: 8, paddingHorizontal: 24, paddingVertical: 10, borderRadius: RADIUS.lg },
  retryText:   { fontWeight: '700' },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  loadingText: { fontSize: FONTS.sizes.sm },
});