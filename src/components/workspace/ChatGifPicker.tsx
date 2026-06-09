// src/components/workspace/ChatGifPicker.tsx
// Part 50.2 — GIPHY GIF Picker for Stream Chat
//
// Architecture:
//   - Opens as a full-screen Modal over the chat screen
//   - Shows TRENDING gifs on open (no search term)
//   - Debounced search as user types (300ms)
//   - 2-column masonry-style grid (alternating heights for visual interest)
//   - Tapping a GIF calls onSelect(gifUrl, title) → caller sends it via channel.sendMessage
//   - "Powered by GIPHY" attribution strip (required by GIPHY Terms of Service)
//   - Dark-themed to match DeepDive dark UI
//   - No new native packages required — pure JS (fetch + Image/Animated)
//
// Usage:
//   <ChatGifPicker
//     visible={showGifPicker}
//     onClose={() => setShowGifPicker(false)}
//     onSelect={(gifUrl, title) => sendGif(gifUrl, title)}
//     giphyApiKey={process.env.EXPO_PUBLIC_GIPHY_API_KEY ?? ''}
//   />

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  memo,
} from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Platform,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

interface GiphyImage {
  url: string;
  width: string;
  height: string;
}

interface GiphyGif {
  id:    string;
  title: string;
  images: {
    fixed_width:          GiphyImage; // 200px wide — used for display
    fixed_width_downsampled?: GiphyImage;
    original:             GiphyImage; // full quality — sent as attachment
    preview_gif?:         GiphyImage;
  };
}

export interface ChatGifPickerProps {
  visible:      boolean;
  onClose:      () => void;
  /** Called when user taps a GIF. gifUrl is the original-quality URL. */
  onSelect:     (gifUrl: string, title: string) => void;
  giphyApiKey:  string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SCREEN_WIDTH  = Dimensions.get('window').width;
const NUM_COLS      = 2;
const COL_GAP       = 6;
const H_PAD         = 12;
const COL_WIDTH     = (SCREEN_WIDTH - H_PAD * 2 - COL_GAP * (NUM_COLS - 1)) / NUM_COLS;
const GIPHY_BASE    = 'https://api.giphy.com/v1/gifs';
const DEBOUNCE_MS   = 300;
const PAGE_LIMIT    = 24;

// Suggested search terms shown as chips below the search bar
const SUGGESTED = [
  'Trending 🔥', 'Funny 😂', 'Reaction 😮', 'Happy 😄',
  'Sad 😢', 'Wow 🤩', 'Clap 👏', 'Think 🤔',
];

// ─── GIF Cell ─────────────────────────────────────────────────────────────────

interface GifCellProps {
  item:     GiphyGif;
  colIndex: number;
  onPress:  (gif: GiphyGif) => void;
}

const GifCell = memo(function GifCell({ item, colIndex, onPress }: GifCellProps) {
  const fw = item.images.fixed_width;
  const rawW = parseFloat(fw.width)  || 200;
  const rawH = parseFloat(fw.height) || 150;
  // Scale to COL_WIDTH, add slight height variation per column for masonry feel
  const scaledH = (rawH / rawW) * COL_WIDTH;
  // Alternate odd/even column heights slightly to create visual rhythm
  const displayH = colIndex % 2 === 0
    ? Math.max(80, scaledH)
    : Math.max(80, scaledH * 0.92);

  const opacity = useRef(new Animated.Value(0)).current;

  const onLoad = useCallback(() => {
    Animated.timing(opacity, {
      toValue:         1,
      duration:        200,
      useNativeDriver: true,
    }).start();
  }, [opacity]);

  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={() => onPress(item)}
      style={[gifCellStyles.container, { height: displayH, width: COL_WIDTH }]}
    >
      {/* Skeleton placeholder */}
      <View style={[gifCellStyles.skeleton, { height: displayH }]} />
      <Animated.Image
        source={{ uri: fw.url }}
        style={[gifCellStyles.image, { height: displayH, opacity }]}
        onLoad={onLoad}
        resizeMode="cover"
      />
    </TouchableOpacity>
  );
});

const gifCellStyles = StyleSheet.create({
  container: {
    borderRadius:    RADIUS.md,
    overflow:        'hidden',
    backgroundColor: COLORS.backgroundElevated,
  },
  skeleton: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.backgroundElevated,
  },
  image: {
    width:  '100%',
    borderRadius: RADIUS.md,
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

  const [query,      setQuery]      = useState('');
  const [gifs,       setGifs]       = useState<GiphyGif[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [loadingMore,setLoadingMore]= useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [offset,     setOffset]     = useState(0);
  const [hasMore,    setHasMore]    = useState(true);
  const [activeChip, setActiveChip] = useState<string | null>(null);

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef      = useRef<TextInput>(null);
  const isMounted     = useRef(false);

  // Reset and fetch when picker opens
  useEffect(() => {
    if (visible) {
      isMounted.current = true;
      setQuery('');
      setActiveChip(null);
      fetchGifs('', 0, true);
    } else {
      isMounted.current = false;
    }
    return () => { isMounted.current = false; };
  }, [visible]);

  // Debounced search
  useEffect(() => {
    if (!visible) return;
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      fetchGifs(query, 0, true);
    }, DEBOUNCE_MS);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [query, visible]);

  const fetchGifs = useCallback(async (
    term:       string,
    off:        number,
    reset:      boolean,
  ) => {
    if (!isMounted.current) return;
    if (!giphyApiKey) {
      setError('GIPHY API key not configured. Add EXPO_PUBLIC_GIPHY_API_KEY to .env');
      return;
    }

    try {
      if (reset) {
        setLoading(true);
        setError(null);
      } else {
        setLoadingMore(true);
      }

      // GIPHY Terms: use "search" endpoint for queries, "trending" for empty
      const endpoint = term.trim()
        ? `${GIPHY_BASE}/search?api_key=${giphyApiKey}&q=${encodeURIComponent(term.trim())}&limit=${PAGE_LIMIT}&offset=${off}&rating=g`
        : `${GIPHY_BASE}/trending?api_key=${giphyApiKey}&limit=${PAGE_LIMIT}&offset=${off}&rating=g`;

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
    } catch (e) {
      if (isMounted.current) setError('Failed to load GIFs. Check your connection.');
    } finally {
      if (isMounted.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [giphyApiKey]);

  const handleLoadMore = useCallback(() => {
    if (!loadingMore && !loading && hasMore) {
      fetchGifs(query, offset, false);
    }
  }, [loadingMore, loading, hasMore, query, offset, fetchGifs]);

  const handleGifPress = useCallback((gif: GiphyGif) => {
    const url = gif.images.original.url;
    onSelect(url, gif.title || 'GIF');
    onClose();
  }, [onSelect, onClose]);

  const handleChipPress = useCallback((chip: string) => {
    if (chip === 'Trending 🔥') {
      setQuery('');
      setActiveChip(chip);
      inputRef.current?.clear();
      fetchGifs('', 0, true);
    } else {
      // Extract the text part before the emoji
      const term = chip.split(' ')[0];
      setQuery(term);
      setActiveChip(chip);
    }
  }, [fetchGifs]);

  const handleClear = useCallback(() => {
    setQuery('');
    setActiveChip(null);
    fetchGifs('', 0, true);
  }, [fetchGifs]);

  // ── Render items in 2-col grid (FlatList with numColumns) ──────────────────
  const renderItem = useCallback(({ item, index }: { item: GiphyGif; index: number }) => (
    <View style={gridStyles.cell}>
      <GifCell
        item={item}
        colIndex={index % NUM_COLS}
        onPress={handleGifPress}
      />
    </View>
  ), [handleGifPress]);

  const keyExtractor = useCallback((item: GiphyGif, index: number) =>
    `${item.id}_${index}`, []);

  const ListFooter = useCallback(() => {
    if (!loadingMore) return <View style={{ height: 20 }} />;
    return (
      <View style={gridStyles.footer}>
        <ActivityIndicator size="small" color={COLORS.primary} />
      </View>
    );
  }, [loadingMore]);

  const ListEmpty = useCallback(() => {
    if (loading) return null;
    return (
      <View style={gridStyles.empty}>
        {error ? (
          <>
            <Ionicons name="alert-circle-outline" size={36} color={COLORS.error} />
            <Text style={gridStyles.emptyText}>{error}</Text>
            <TouchableOpacity
              style={gridStyles.retryBtn}
              onPress={() => fetchGifs(query, 0, true)}
            >
              <Text style={gridStyles.retryText}>Retry</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={{ fontSize: 32 }}>🔍</Text>
            <Text style={gridStyles.emptyText}>No GIFs found</Text>
            <Text style={gridStyles.emptySubText}>Try a different search term</Text>
          </>
        )}
      </View>
    );
  }, [loading, error, query, fetchGifs]);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={[styles.root, { paddingTop: Platform.OS === 'ios' ? insets.top : 0 }]}>
        <StatusBar barStyle="light-content" />

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
            <Ionicons name="close" size={20} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>GIF</Text>
            {/* GIPHY attribution — required by GIPHY TOS */}
            <View style={styles.poweredByRow}>
              <Text style={styles.poweredByText}>Powered by</Text>
              <GiphyLogo />
            </View>
          </View>
          {/* Invisible spacer — mirrors close button width to keep title centred */}
          <View style={styles.headerSpacer} />
        </View>

        {/* ── Search bar ──────────────────────────────────────────────────── */}
        <View style={styles.searchRow}>
          <View style={styles.searchBar}>
            <Ionicons name="search-outline" size={16} color={COLORS.textMuted} style={styles.searchIcon} />
            <TextInput
              ref={inputRef}
              style={styles.searchInput}
              placeholder="Search GIPHY…"
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

        {/* ── Suggested chips ─────────────────────────────────────────────── */}
        <View style={styles.chipsWrap}>
          <FlatList
            horizontal
            data={SUGGESTED}
            keyExtractor={s => s}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipsContent}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[
                  styles.chip,
                  activeChip === item && styles.chipActive,
                ]}
                onPress={() => handleChipPress(item)}
                activeOpacity={0.7}
              >
                <Text style={[
                  styles.chipText,
                  activeChip === item && styles.chipTextActive,
                ]}>
                  {item}
                </Text>
              </TouchableOpacity>
            )}
          />
        </View>

        {/* ── GIF Grid ────────────────────────────────────────────────────── */}
        {loading ? (
          <View style={gridStyles.loadingWrap}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={gridStyles.loadingText}>
              {query ? `Searching "${query}"…` : 'Loading trending GIFs…'}
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

// ─── GIPHY Logo (text-based, matches their branding requirement) ──────────────
// GIPHY's branding guidelines allow a styled text "GIPHY" in their brand colors
// as an attribution mark when the official image asset is not used.

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
  row: { flexDirection: 'row', alignItems: 'center', marginLeft: 4 },
  letter: {
    fontSize:   13,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
});

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex:            1,
    backgroundColor: COLORS.background,
  },

  // Header
  header: {
    flexDirection:    'row',
    alignItems:       'center',
    paddingHorizontal: SPACING.md,
    paddingVertical:   12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  closeBtn: {
    width:           36,
    height:          36,
    borderRadius:    11,
    backgroundColor: COLORS.backgroundCard,
    alignItems:      'center',
    justifyContent:  'center',
    borderWidth:     1,
    borderColor:     COLORS.border,
  },
  // Invisible spacer — same width as closeBtn, no background/border
  headerSpacer: {
    width:  36,
    height: 36,
  },
  headerCenter: {
    flex:       1,
    alignItems: 'center',
  },
  headerTitle: {
    color:         COLORS.textPrimary,
    fontSize:      FONTS.sizes.lg,
    fontWeight:    '800',
    letterSpacing: 0.5,
  },
  poweredByRow: {
    flexDirection:  'row',
    alignItems:     'center',
    marginTop:      2,
  },
  poweredByText: {
    color:    COLORS.textMuted,
    fontSize: FONTS.sizes.xs,
  },

  // Search
  searchRow: {
    paddingHorizontal: H_PAD,
    paddingTop:        SPACING.sm,
    paddingBottom:     SPACING.xs,
  },
  searchBar: {
    flexDirection:    'row',
    alignItems:       'center',
    backgroundColor:  COLORS.backgroundElevated,
    borderRadius:     RADIUS.xl,
    borderWidth:      1,
    borderColor:      COLORS.border,
    paddingHorizontal: 12,
    paddingVertical:   9,
    gap:              8,
  },
  searchIcon: {
    flexShrink: 0,
  },
  searchInput: {
    flex:      1,
    color:     COLORS.textPrimary,
    fontSize:  FONTS.sizes.base,
    padding:   0,
    margin:    0,
  },

  // Chips
  chipsWrap: {
    paddingBottom: SPACING.xs,
  },
  chipsContent: {
    paddingHorizontal: H_PAD,
    gap:               8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical:   6,
    borderRadius:      RADIUS.full,
    backgroundColor:   COLORS.backgroundElevated,
    borderWidth:       1,
    borderColor:       COLORS.border,
  },
  chipActive: {
    backgroundColor: `${COLORS.primary}20`,
    borderColor:     `${COLORS.primary}60`,
  },
  chipText: {
    color:      COLORS.textSecondary,
    fontSize:   FONTS.sizes.sm,
    fontWeight: '600',
  },
  chipTextActive: {
    color: COLORS.primary,
  },
});

const gridStyles = StyleSheet.create({
  list: {
    paddingHorizontal: H_PAD,
    paddingTop:        SPACING.xs,
  },
  row: {
    gap:           COL_GAP,
    marginBottom:  COL_GAP,
    justifyContent: 'space-between',
  },
  cell: {
    // Cell width is handled in GifCell itself via COL_WIDTH
  },
  footer: {
    paddingVertical: 20,
    alignItems:      'center',
  },
  empty: {
    paddingTop: 60,
    alignItems: 'center',
    gap:        12,
  },
  emptyText: {
    color:    COLORS.textSecondary,
    fontSize: FONTS.sizes.base,
    fontWeight: '600',
  },
  emptySubText: {
    color:    COLORS.textMuted,
    fontSize: FONTS.sizes.sm,
  },
  retryBtn: {
    marginTop:         8,
    paddingHorizontal: 24,
    paddingVertical:   10,
    backgroundColor:   COLORS.primary,
    borderRadius:      RADIUS.lg,
  },
  retryText: {
    color:      '#FFF',
    fontWeight: '700',
  },
  loadingWrap: {
    flex:            1,
    alignItems:      'center',
    justifyContent:  'center',
    gap:             14,
  },
  loadingText: {
    color:    COLORS.textMuted,
    fontSize: FONTS.sizes.sm,
  },
});