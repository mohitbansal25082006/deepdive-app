// src/components/editor/OnlineImageSearchPanel.tsx
// Part 58.5.2 — NO LONGER A MODAL (fixes the freeze after inserting a photo)
//
//   58.5.1 nested this Modal inside the "Add Element" sheet's Modal, which
//   fixed the presentation race but created a dismissal one. On insert the
//   child was hidden and the parent unmounted in the same tick, so iOS never
//   finished dismissing the child's view controller. It stayed on the window
//   as an invisible, touch-absorbing layer — the app looked frozen when it was
//   simply covered.
//
//   The fix is to stop being a Modal. This panel now renders as an absolutely
//   positioned overlay INSIDE the sheet's existing modal, so only one native
//   modal is ever on screen and there is no view-controller lifecycle to race.
//   Everything else (backdrop, fixed height, flex ScrollView) is unchanged.
//
//   Because it is no longer a Modal, Android's hardware back button no longer
//   closes it automatically — a BackHandler is registered while visible.
//
// Part 58.5.1 — backdrop as sibling, fixed sheet height, scrolls from anywhere.
// Part 58.5   — placement carried in, complete block built, parent owns close.
// Part 58.3   — Pexels attribution.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, Pressable, ScrollView, TextInput, StyleSheet, BackHandler,
  ActivityIndicator, Image, Dimensions, TouchableOpacity, Linking, Platform,
} from 'react-native';
import Animated, { SlideInDown }  from 'react-native-reanimated';
import { LinearGradient }         from 'expo-linear-gradient';
import { Ionicons }               from '@expo/vector-icons';
import { useSafeAreaInsets }      from 'react-native-safe-area-context';

import { searchOnlineImages, getImageSuggestions } from '../../services/imageSearchService';
import { JoystickPositionControl }                 from './JoystickPositionControl';
import { COLORS, FONTS, SPACING, RADIUS }          from '../../constants/theme';
import { fitOverlayPosition }                      from '../../types/editor';
import type {
  OnlineImageResult,
  InlineBlockPosition,
  ImageBlock,
} from '../../types/editor';

const SCREEN_W = Dimensions.get('window').width;
const SCREEN_H = Dimensions.get('window').height;

const SHEET_H = Math.round(SCREEN_H * 0.92);

// 3 columns with gap
const THUMB_GAP = SPACING.sm;
const THUMB_W   = Math.floor((SCREEN_W - SPACING.lg * 2 - THUMB_GAP * 2) / 3);
const THUMB_H   = Math.round(THUMB_W * 0.65);

const DEFAULT_POSITION: InlineBlockPosition = {
  type: 'overlay', xFrac: 0.05, yFrac: 0.1, wFrac: 0.9,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function aspectRatioOf(img: OnlineImageResult | null): number {
  if (img?.width && img?.height && img.height > 0) return img.width / img.height;
  return 16 / 9;
}

function hostOf(url: string | undefined): string {
  if (!url) return '';
  const m = url.match(/^https?:\/\/([^/]+)/i);
  return m ? m[1] : '';
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface OnlineImageSearchPanelProps {
  visible:      boolean;
  slideTitle?:  string;
  slideLayout?: string;
  /**
   * Placement chosen in the "Add Element" sheet before the user tapped
   * "Search stock photos", so the joystick opens where they left it.
   */
  initialPosition?: InlineBlockPosition | null;
  /**
   * Called with the finished block. The parent hides this panel and closes the
   * sheet — this component never closes itself on insert.
   */
  onInsert: (block: ImageBlock) => void;
  onClose:  () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function OnlineImageSearchPanel({
  visible,
  slideTitle,
  slideLayout,
  initialPosition,
  onInsert,
  onClose,
}: OnlineImageSearchPanelProps) {
  const insets = useSafeAreaInsets();

  const [query,       setQuery]       = useState('');
  const [results,     setResults]     = useState<OnlineImageResult[]>([]);
  const [isLoading,   setIsLoading]   = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [selected,    setSelected]    = useState<OnlineImageResult | null>(null);
  const [caption,     setCaption]     = useState('');
  const [isInserting, setIsInserting] = useState(false);
  const [position,    setPosition]    = useState<InlineBlockPosition>(
    fitOverlayPosition(DEFAULT_POSITION),
  );

  const inputRef  = useRef<TextInput>(null);
  const scrollRef = useRef<ScrollView>(null);

  // Reset every time the panel opens, seeding placement from the sheet.
  useEffect(() => {
    if (!visible) return;
    setQuery('');
    setResults([]);
    setIsLoading(false);
    setError(null);
    setHasSearched(false);
    setSelected(null);
    setCaption('');
    setIsInserting(false);
    setPosition(fitOverlayPosition(initialPosition ?? DEFAULT_POSITION));
  }, [visible, initialPosition]);

  // Part 58.5.2 — this is no longer a Modal, so wire up Android's back button.
  useEffect(() => {
    if (!visible || Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [visible, onClose]);

  const suggestions = getImageSuggestions(slideTitle, slideLayout);

  // ── Search ──────────────────────────────────────────────────────────────────

  const handleSearch = useCallback(async (q?: string) => {
    const searchQuery = (q ?? query).trim();
    if (!searchQuery) return;

    if (q) setQuery(q);
    setIsLoading(true);
    setError(null);
    setSelected(null);

    try {
      const images = await searchOnlineImages(searchQuery, 24);
      setResults(images);
      setHasSearched(true);
      if (images.length === 0) {
        setError('No photos matched that search. Try a broader term.');
      }
    } catch {
      setError('Search failed. Check your connection and try again.');
    } finally {
      setIsLoading(false);
    }
  }, [query]);

  // ── Select an image ─────────────────────────────────────────────────────────

  const handleSelect = useCallback((item: OnlineImageResult) => {
    setSelected(prev => {
      const next = prev?.url === item.url ? null : item;
      if (next) {
        setPosition(p => fitOverlayPosition({ ...p, hFrac: undefined }, aspectRatioOf(next)));
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 120);
      }
      return next;
    });
  }, []);

  // ── Insert selected image ───────────────────────────────────────────────────

  const handleInsert = useCallback(() => {
    if (!selected || isInserting) return;
    setIsInserting(true);

    const ar       = aspectRatioOf(selected);
    const finalPos = fitOverlayPosition(position, ar);

    const block: ImageBlock = {
      type: 'image',
      id:   `img_online_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      uri:          selected.url,
      onlineUrl:    selected.url,
      thumbnailUrl: selected.mediumUrl || selected.thumbnailUrl,
      sourceUrl:    selected.sourceUrl,
      sourceQuery:  query,
      caption:      caption.trim() || undefined,
      aspectRatio:  ar,
      position:     finalPos,
      photographer:    selected.photographer,
      photographerUrl: selected.photographerUrl,
    };

    if (__DEV__) {
      console.log('[OnlineImageSearchPanel] inserting image block', {
        id: block.id, uri: block.uri, position: block.position,
      });
    }

    onInsert(block);
  }, [selected, isInserting, position, caption, query, onInsert]);

  // ── Render ──────────────────────────────────────────────────────────────────

  if (!visible) return null;

  // Rows of 3 (plain Views — a FlatList inside a ScrollView swallowed taps)
  const imageRows: OnlineImageResult[][] = [];
  for (let i = 0; i < results.length; i += 3) {
    imageRows.push(results.slice(i, i + 3));
  }

  return (
    <View style={StyleSheet.absoluteFill}>
      {/* Backdrop sits behind the sheet so it never intercepts scroll touches */}
      <Pressable
        style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.6)' }]}
        onPress={onClose}
      />

      <Animated.View
        entering={SlideInDown.duration(240)}
        style={{
          position:             'absolute',
          left:                 0,
          right:                0,
          bottom:               0,
          height:               SHEET_H,
          backgroundColor:      COLORS.backgroundCard,
          borderTopLeftRadius:  24,
          borderTopRightRadius: 24,
          paddingTop:           SPACING.sm,
          borderTopWidth:       1,
          borderTopColor:       COLORS.border,
          overflow:             'hidden',
        }}
      >
        {/* Handle */}
        <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.border, alignSelf: 'center', marginBottom: SPACING.sm }} />

        {/* Header (fixed) */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.lg, marginBottom: SPACING.md }}>
          <LinearGradient
            colors={['#4FACFE', '#00F2FE']}
            style={{ width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: SPACING.sm }}
          >
            <Ionicons name="image" size={17} color="#FFF" />
          </LinearGradient>
          <View style={{ flex: 1 }}>
            <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '800' }}>Search stock photos</Text>
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>Pexels · free to use · tap a photo to select</Text>
          </View>
          <Pressable onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="close" size={22} color={COLORS.textMuted} />
          </Pressable>
        </View>

        {/* Search bar (fixed, stays reachable while scrolling results) */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingHorizontal: SPACING.lg, paddingBottom: SPACING.md }}>
          <View style={{
            flex: 1, flexDirection: 'row', alignItems: 'center',
            backgroundColor: COLORS.backgroundElevated, borderRadius: RADIUS.lg,
            borderWidth: 1, borderColor: query ? COLORS.primary : COLORS.border,
            paddingHorizontal: SPACING.md,
          }}>
            <Ionicons name="search-outline" size={18} color={query ? COLORS.primary : COLORS.textMuted} />
            <TextInput
              ref={inputRef}
              value={query}
              onChangeText={setQuery}
              placeholder="e.g. quantum computing lab"
              placeholderTextColor={COLORS.textMuted}
              returnKeyType="search"
              onSubmitEditing={() => handleSearch()}
              style={{ flex: 1, color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, paddingVertical: 11, paddingHorizontal: SPACING.sm }}
            />
            {query.length > 0 && (
              <Pressable onPress={() => { setQuery(''); setResults([]); setHasSearched(false); setSelected(null); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close-circle" size={18} color={COLORS.textMuted} />
              </Pressable>
            )}
          </View>
          <TouchableOpacity
            onPress={() => handleSearch()}
            disabled={isLoading || !query.trim()}
            activeOpacity={0.8}
            style={{ opacity: query.trim() ? 1 : 0.4 }}
          >
            <LinearGradient
              colors={['#4FACFE', '#00F2FE']}
              style={{ width: 44, height: 44, borderRadius: RADIUS.lg, alignItems: 'center', justifyContent: 'center' }}
            >
              {isLoading
                ? <ActivityIndicator size="small" color="#FFF" />
                : <Ionicons name="arrow-forward" size={20} color="#FFF" />
              }
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* Scrollable body — flex:1 inside a fixed-height sheet */}
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          showsVerticalScrollIndicator
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          nestedScrollEnabled
          scrollEventThrottle={16}
          contentContainerStyle={{
            paddingHorizontal: SPACING.lg,
            paddingBottom:     insets.bottom + SPACING.xl,
            gap:               SPACING.md,
          }}
        >
          {/* Suggestion chips — only before the first search */}
          {!hasSearched && (
            <>
              <Text style={{ color: COLORS.textMuted, fontSize: 11 }}>
                Suggested for this slide
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: SPACING.sm }}
              >
                {suggestions.map(sug => (
                  <TouchableOpacity
                    key={sug}
                    onPress={() => handleSearch(sug)}
                    activeOpacity={0.7}
                    style={{ backgroundColor: COLORS.backgroundElevated, borderRadius: RADIUS.full, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: COLORS.border }}
                  >
                    <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, fontWeight: '500' }}>{sug}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </>
          )}

          {/* Error */}
          {error && (
            <View style={{ backgroundColor: `${COLORS.error}12`, borderRadius: RADIUS.lg, padding: SPACING.md, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: `${COLORS.error}25` }}>
              <Ionicons name="alert-circle-outline" size={16} color={COLORS.error} />
              <Text style={{ color: COLORS.error, fontSize: FONTS.sizes.xs, flex: 1 }}>{error}</Text>
            </View>
          )}

          {/* Loading */}
          {isLoading && (
            <View style={{ alignItems: 'center', paddingVertical: SPACING.xl }}>
              <ActivityIndicator size="large" color={COLORS.primary} />
              <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.sm, marginTop: SPACING.sm }}>Searching Pexels…</Text>
            </View>
          )}

          {/* Image grid */}
          {!isLoading && results.length > 0 && (
            <>
              <Text style={{ color: COLORS.textMuted, fontSize: 11 }}>
                {results.length} photos · tap to select
              </Text>

              {selected && (
                <View style={{ backgroundColor: `${COLORS.primary}12`, borderRadius: RADIUS.lg, padding: SPACING.sm, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: `${COLORS.primary}30` }}>
                  <Ionicons name="checkmark-circle" size={14} color={COLORS.primary} />
                  <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.xs, fontWeight: '600', flex: 1 }} numberOfLines={1}>
                    Selected: {selected.title}
                  </Text>
                  <Pressable onPress={() => setSelected(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="close" size={14} color={COLORS.primary} />
                  </Pressable>
                </View>
              )}

              {imageRows.map((row, rowIdx) => (
                <View key={rowIdx} style={{ flexDirection: 'row', gap: THUMB_GAP }}>
                  {row.map(item => {
                    const isItemSelected = selected?.url === item.url;
                    return (
                      <TouchableOpacity
                        key={item.url}
                        onPress={() => handleSelect(item)}
                        activeOpacity={0.8}
                        style={{
                          width:           THUMB_W,
                          height:          THUMB_H,
                          borderRadius:    RADIUS.md,
                          overflow:        'hidden',
                          borderWidth:     isItemSelected ? 2.5 : 1,
                          borderColor:     isItemSelected ? COLORS.primary : COLORS.border,
                          backgroundColor: COLORS.backgroundElevated,
                        }}
                      >
                        <Image
                          source={{ uri: item.thumbnailUrl }}
                          style={{ width: '100%', height: '100%' }}
                          resizeMode="cover"
                        />
                        {isItemSelected && (
                          <View style={{ position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' }}>
                            <Ionicons name="checkmark" size={14} color="#FFF" />
                          </View>
                        )}
                        {item.photographer && (
                          <View style={{
                            position: 'absolute', bottom: 0, left: 0, right: 0,
                            backgroundColor: 'rgba(0,0,0,0.45)',
                            paddingHorizontal: 4, paddingVertical: 2,
                          }}>
                            <Text numberOfLines={1} style={{ color: '#FFF', fontSize: 8, fontWeight: '600' }}>
                              {item.photographer}
                            </Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                  {row.length < 3 && Array.from({ length: 3 - row.length }).map((_, i) => (
                    <View key={`empty-${i}`} style={{ width: THUMB_W }} />
                  ))}
                </View>
              ))}
            </>
          )}

          {/* Selected image: preview + caption + placement + insert */}
          {selected && (
            <>
              <View style={{ height: 1, backgroundColor: COLORS.border }} />

              <View style={{ borderRadius: RADIUS.xl, overflow: 'hidden', aspectRatio: aspectRatioOf(selected), borderWidth: 1.5, borderColor: `${COLORS.primary}50`, backgroundColor: COLORS.backgroundElevated }}>
                <Image
                  source={{ uri: selected.mediumUrl || selected.url }}
                  style={{ width: '100%', height: '100%' }}
                  resizeMode="cover"
                />
              </View>

              {/* Caption */}
              <View style={{ backgroundColor: COLORS.backgroundElevated, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: SPACING.md }}>
                <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 8 }}>Caption (optional)</Text>
                <TextInput
                  value={caption}
                  onChangeText={setCaption}
                  placeholder="Add a caption…"
                  placeholderTextColor={COLORS.textMuted}
                  style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, paddingVertical: 8 }}
                />
              </View>

              {/* Placement */}
              <Text style={{ color: COLORS.textMuted, fontSize: 11 }}>
                Placement on slide
              </Text>
              <JoystickPositionControl
                position={position}
                onChange={next => setPosition(fitOverlayPosition(next, aspectRatioOf(selected)))}
                supportsHeight
                accentColor="#4FACFE"
              />

              {/* Pexels attribution (free to use, credit encouraged) */}
              {selected.photographer && (
                <TouchableOpacity
                  onPress={() => {
                    if (selected.photographerUrl) Linking.openURL(selected.photographerUrl).catch(() => {});
                  }}
                  activeOpacity={0.7}
                  style={{
                    backgroundColor: `${COLORS.primary}0C`, borderRadius: RADIUS.lg,
                    padding: SPACING.sm, flexDirection: 'row', alignItems: 'center', gap: 6,
                    borderWidth: 1, borderColor: `${COLORS.primary}20`,
                  }}
                >
                  <Ionicons name="camera-outline" size={13} color={COLORS.primary} />
                  <Text style={{ color: COLORS.textMuted, fontSize: 10, flex: 1 }}>
                    Photo by <Text style={{ color: COLORS.primary, fontWeight: '600' }}>{selected.photographer}</Text> on Pexels · free for commercial use
                  </Text>
                </TouchableOpacity>
              )}

              {__DEV__ && (
                <Text style={{ color: COLORS.textMuted, fontSize: 9 }}>
                  {hostOf(selected.url)} · {selected.width ?? '?'}×{selected.height ?? '?'} · w={((position.wFrac ?? 0) * 100).toFixed(0)}% h={((position.hFrac ?? 0) * 100).toFixed(0)}%
                </Text>
              )}

              {/* Insert */}
              <TouchableOpacity onPress={handleInsert} activeOpacity={0.8} disabled={isInserting}>
                <LinearGradient
                  colors={['#4FACFE', '#00F2FE']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={{ borderRadius: RADIUS.full, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: isInserting ? 0.7 : 1 }}
                >
                  {isInserting
                    ? <ActivityIndicator size="small" color="#FFF" />
                    : <Ionicons name="image" size={18} color="#FFF" />}
                  <Text style={{ color: '#FFF', fontSize: FONTS.sizes.base, fontWeight: '800' }}>
                    {isInserting ? 'Adding photo…' : 'Add photo to slide'}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </Animated.View>
    </View>
  );
}