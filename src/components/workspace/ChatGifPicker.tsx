// src/components/workspace/ChatGifPicker.tsx
// Part 50.2 — GIPHY GIF Picker for Stream Chat
// Part 50.3 — Added GIF / Stickers tab toggle
// Part 50.3 FIX — Stickers now sent with type:'sticker' (custom type) instead of
//   type:'image'. This lets StreamCustomMessage intercept sticker messages and
//   render them without a bubble/background. GIFs remain type:'image'.
//
// The `onSelect` callback now receives a third argument `isSticker: boolean`
// so the caller (workspace-chat.tsx) can send the correct attachment type.
//
// ── Part 50.10 — ANDROID UI FIXES (production) ────────────────────────────────
//   (Issue 10a) The picker UI went OFF-SCREEN on Android:
//       ROOT CAUSE — <Modal presentationStyle="pageSheet"> is an iOS sheet style.
//       On Android it is not supported and produces a mis-sized / off-screen
//       surface. THE FIX — only use pageSheet on iOS; on Android present a plain
//       full-screen slide Modal and inset the top by the status-bar / safe-area
//       height. The grid already pads the bottom by insets.bottom.
//
//   (Issue 10b) Stickers / GIFs not rendering on Android DEV / PREVIEW builds
//   (they worked in Expo Go):
//       ROOT CAUSE — RN's built-in <Image> can't decode WebP / animated-WebP on
//       custom Android builds without extra Fresco modules (Expo Go bundles them).
//       THE FIX — render every cell with `expo-image` (Glide on Android), which
//       supports WebP + animated-WebP across all build types. The sticker SEND
//       URL also prefers the animated GIF original over WebP as an extra-safe
//       fallback, while display uses expo-image either way.

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
// Part 50.10: expo-image (Glide on Android) decodes WebP / animated-WebP reliably
// in dev/preview builds, unlike RN's <Image>.
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';

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

type ContentTab = 'gifs' | 'stickers';

export interface ChatGifPickerProps {
  visible:     boolean;
  onClose:     () => void;
  /**
   * Called when user taps a GIF or sticker.
   * url: best-quality URL to send
   * title: display title
   * isSticker: true if this is a sticker (should be sent with type:'sticker')
   */
  onSelect:    (url: string, title: string, isSticker: boolean) => void;
  giphyApiKey: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SCREEN_WIDTH  = Dimensions.get('window').width;
const NUM_COLS      = 2;
const COL_GAP       = 6;
const H_PAD         = 12;
const COL_WIDTH     = (SCREEN_WIDTH - H_PAD * 2 - COL_GAP * (NUM_COLS - 1)) / NUM_COLS;
const GIPHY_BASE    = 'https://api.giphy.com/v1';
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

  // Stickers: prefer WebP for transparency; GIFs: use regular animated URL.
  // expo-image renders both reliably on Android (Glide).
  const displayUrl = contentTab === 'stickers'
    ? (fw.webp ?? fw.url)
    : fw.url;

  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={() => onPress(item)}
      style={[
        gifCellStyles.container,
        { height: displayH, width: COL_WIDTH },
        contentTab === 'stickers' && gifCellStyles.stickerContainer,
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
      {/* Sticker transparent bg indicator */}
      {contentTab === 'stickers' && (
        <View style={gifCellStyles.stickerBadge}>
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
    backgroundColor: COLORS.backgroundElevated,
  },
  stickerContainer: {
    // Checkered-style hint for transparency using a subtle pattern
    backgroundColor: `${COLORS.backgroundCard}`,
    borderWidth:     1,
    borderColor:     `${COLORS.border}50`,
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
    backgroundColor: `${COLORS.primary}90`,
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
  giphyApiKey,
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
  }, [query, visible]);

  const fetchGifs = useCallback(async (
    term:  string,
    off:   number,
    reset: boolean,
    tab:   ContentTab,
  ) => {
    if (!isMounted.current) return;
    if (!giphyApiKey) {
      setError('GIPHY API key not configured.');
      return;
    }

    try {
      if (reset) { setLoading(true); setError(null); }
      else        { setLoadingMore(true); }

      const category = tab === 'stickers' ? 'stickers' : 'gifs';
      const endpoint = term.trim()
        ? `${GIPHY_BASE}/${category}/search?api_key=${giphyApiKey}&q=${encodeURIComponent(term.trim())}&limit=${PAGE_LIMIT}&offset=${off}&rating=g`
        : `${GIPHY_BASE}/${category}/trending?api_key=${giphyApiKey}&limit=${PAGE_LIMIT}&offset=${off}&rating=g`;

      const res  = await fetch(endpoint);
      const json = await res.json() as {
        data:       GiphyGif[];
        pagination: { total_count: number; count: number; offset: number };
      };

      if (!isMounted.current) return;

      const newGifs = json.data ?? [];
      const total   = json.pagination?.total_count ?? 0;
      const newOff  = off + newGifs.length;

      setGifs(prev => reset ? newGifs : [...prev, ...newGifs]);
      setOffset(newOff);
      setHasMore(newOff < total && newGifs.length === PAGE_LIMIT);
    } catch {
      if (isMounted.current) setError('Failed to load. Check your connection.');
    } finally {
      if (isMounted.current) { setLoading(false); setLoadingMore(false); }
    }
  }, [giphyApiKey]);

  const handleLoadMore = useCallback(() => {
    if (!loadingMore && !loading && hasMore) {
      fetchGifs(query, offset, false, activeTab);
    }
  }, [loadingMore, loading, hasMore, query, offset, activeTab, fetchGifs]);

  const handleGifPress = useCallback((gif: GiphyGif) => {
    const isSticker = activeTab === 'stickers';

    let url: string;
    if (isSticker) {
      // Stickers: prefer the animated GIF original (most broadly decodable on
      // Android) and fall back to WebP. Display uses expo-image either way, so
      // both render; the GIF-first order is an extra safety net for any consumer
      // that still uses RN <Image>.
      url = gif.images.original.url ?? gif.images.original.webp ?? '';
    } else {
      // GIFs: use original animated GIF
      url = gif.images.original.url;
    }

    const title = gif.title || (isSticker ? 'Sticker' : 'GIF');

    // Pass isSticker=true for stickers so caller sends correct attachment type
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
      setActiveChip(chip);
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
            <Text style={gridStyles.emptyText}>{error}</Text>
            <TouchableOpacity style={gridStyles.retryBtn} onPress={() => fetchGifs(query, 0, true, activeTab)}>
              <Text style={gridStyles.retryText}>Retry</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={{ fontSize: 32 }}>{activeTab === 'stickers' ? '🎭' : '🔍'}</Text>
            <Text style={gridStyles.emptyText}>{activeTab === 'stickers' ? 'No stickers found' : 'No GIFs found'}</Text>
            <Text style={gridStyles.emptySubText}>Try a different search term</Text>
          </>
        )}
      </View>
    );
  }, [loading, error, query, activeTab, fetchGifs]);

  const currentSuggested = activeTab === 'stickers' ? SUGGESTED_STICKERS : SUGGESTED_GIFS;

  if (!visible) return null;

  return (
    // FIX (issue 10a): pageSheet is an iOS-only presentation. On Android it
    // renders off-screen / mis-sized, so we only set it on iOS. Android uses a
    // plain full-screen slide modal.
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : undefined}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* FIX (issue 10a): inset the top by the safe-area on BOTH platforms so the
          header is never under the status bar / notch on Android full-screen. */}
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <StatusBar barStyle="light-content" />

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
            <Ionicons name="close" size={20} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            {/* GIF / Stickers tab toggle */}
            <View style={styles.tabRow}>
              <TouchableOpacity
                style={[styles.tabBtn, activeTab === 'gifs' && styles.tabBtnActive]}
                onPress={() => handleTabChange('gifs')}
                activeOpacity={0.75}
              >
                <Text style={[styles.tabBtnText, activeTab === 'gifs' && styles.tabBtnTextActive]}>
                  GIF
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tabBtn, activeTab === 'stickers' && styles.tabBtnActive]}
                onPress={() => handleTabChange('stickers')}
                activeOpacity={0.75}
              >
                <Text style={[styles.tabBtnText, activeTab === 'stickers' && styles.tabBtnTextActive]}>
                  Stickers
                </Text>
              </TouchableOpacity>
            </View>
            <View style={styles.poweredByRow}>
              <Text style={styles.poweredByText}>Powered by</Text>
              <GiphyLogo />
            </View>
          </View>
          <View style={styles.headerSpacer} />
        </View>

        {/* Search */}
        <View style={styles.searchRow}>
          <View style={styles.searchBar}>
            <Ionicons name="search-outline" size={16} color={COLORS.textMuted} style={styles.searchIcon} />
            <TextInput
              ref={inputRef}
              style={styles.searchInput}
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

        {/* Chips */}
        <View style={styles.chipsWrap}>
          <FlatList
            horizontal
            data={currentSuggested}
            keyExtractor={s => `${activeTab}_${s}`}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipsContent}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.chip, activeChip === item && styles.chipActive]}
                onPress={() => handleChipPress(item)}
                activeOpacity={0.7}
              >
                <Text style={[styles.chipText, activeChip === item && styles.chipTextActive]}>
                  {item}
                </Text>
              </TouchableOpacity>
            )}
          />
        </View>

        {/* Sticker transparent bg hint */}
        {activeTab === 'stickers' && (
          <View style={styles.stickerHint}>
            <Ionicons name="checkmark-circle-outline" size={13} color={COLORS.primary} />
            <Text style={styles.stickerHintText}>
              Stickers send with transparent background — no bubble
            </Text>
          </View>
        )}

        {/* Grid */}
        {loading ? (
          <View style={gridStyles.loadingWrap}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={gridStyles.loadingText}>
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
              // FIX: pad bottom by the safe-area inset so the last row clears the
              // Android nav/gesture bar.
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

// ─── GIPHY Logo ───────────────────────────────────────────────────────────────

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
  root:            { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACING.md, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  closeBtn: {
    width: 36, height: 36, borderRadius: 11,
    backgroundColor: COLORS.backgroundCard,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: COLORS.border,
  },
  headerSpacer:  { width: 36, height: 36 },
  headerCenter:  { flex: 1, alignItems: 'center' },
  tabRow: {
    flexDirection: 'row', backgroundColor: COLORS.backgroundElevated,
    borderRadius: RADIUS.full, borderWidth: 1, borderColor: COLORS.border,
    padding: 3, gap: 2,
  },
  tabBtn:            { paddingHorizontal: 16, paddingVertical: 6, borderRadius: RADIUS.full },
  tabBtnActive:      { backgroundColor: COLORS.primary },
  tabBtnText:        { color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, fontWeight: '700', letterSpacing: 0.3 },
  tabBtnTextActive:  { color: '#FFFFFF' },
  poweredByRow:      { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  poweredByText:     { color: COLORS.textMuted, fontSize: FONTS.sizes.xs },
  searchRow: {
    paddingHorizontal: H_PAD, paddingTop: SPACING.sm, paddingBottom: SPACING.xs,
  },
  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.backgroundElevated,
    borderRadius: RADIUS.xl, borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: 12, paddingVertical: 9, gap: 8,
  },
  searchIcon:    { flexShrink: 0 },
  searchInput:   { flex: 1, color: COLORS.textPrimary, fontSize: FONTS.sizes.base, padding: 0, margin: 0 },
  chipsWrap:     { paddingBottom: SPACING.xs },
  chipsContent:  { paddingHorizontal: H_PAD, gap: 8 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: RADIUS.full, backgroundColor: COLORS.backgroundElevated,
    borderWidth: 1, borderColor: COLORS.border,
  },
  chipActive:        { backgroundColor: `${COLORS.primary}20`, borderColor: `${COLORS.primary}60` },
  chipText:          { color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, fontWeight: '600' },
  chipTextActive:    { color: COLORS.primary },
  stickerHint: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: H_PAD, paddingBottom: SPACING.xs,
  },
  stickerHintText:   { color: COLORS.textMuted, fontSize: FONTS.sizes.xs },
});

const gridStyles = StyleSheet.create({
  list:        { paddingHorizontal: H_PAD, paddingTop: SPACING.xs },
  row:         { gap: COL_GAP, marginBottom: COL_GAP, justifyContent: 'space-between' },
  cell:        {},
  footer:      { paddingVertical: 20, alignItems: 'center' },
  empty:       { paddingTop: 60, alignItems: 'center', gap: 12 },
  emptyText:   { color: COLORS.textSecondary, fontSize: FONTS.sizes.base, fontWeight: '600' },
  emptySubText:{ color: COLORS.textMuted, fontSize: FONTS.sizes.sm },
  retryBtn:    { marginTop: 8, paddingHorizontal: 24, paddingVertical: 10, backgroundColor: COLORS.primary, borderRadius: RADIUS.lg },
  retryText:   { color: '#FFF', fontWeight: '700' },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  loadingText: { color: COLORS.textMuted, fontSize: FONTS.sizes.sm },
});