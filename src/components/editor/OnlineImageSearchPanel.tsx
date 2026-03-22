// src/components/editor/OnlineImageSearchPanel.tsx
// Part 30 — FIXED
// Bug fixes:
//   1. FlatList inside ScrollView caused gesture conflicts — replaced with
//      a simple ScrollView + map() for the image grid so taps always register
//   2. Panel state (selected, query, results) now resets every time it opens
//   3. onInsert now closes the panel first then calls the callback to avoid
//      double-close race between onInsert+onClose
//   4. position state resets on open so stale positions don't persist
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, Modal, Pressable, ScrollView, TextInput,
  ActivityIndicator, Image, Dimensions, TouchableOpacity,
} from 'react-native';
import { LinearGradient }    from 'expo-linear-gradient';
import { Ionicons }          from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { searchOnlineImages, getImageSuggestions } from '../../services/imageSearchService';
import { JoystickPositionControl }                 from './JoystickPositionControl';
import { COLORS, FONTS, SPACING, RADIUS }          from '../../constants/theme';
import type { OnlineImageResult, InlineBlockPosition } from '../../types/editor';
import type { ImageBlock }                             from '../../types/editor';

const SCREEN_W = Dimensions.get('window').width;
const SCREEN_H = Dimensions.get('window').height;
// 3 columns with gap
const THUMB_GAP = SPACING.sm;
const THUMB_W   = Math.floor((SCREEN_W - SPACING.lg * 2 - THUMB_GAP * 2) / 3);
const THUMB_H   = Math.round(THUMB_W * 0.65);

// ─── Props ────────────────────────────────────────────────────────────────────

interface OnlineImageSearchPanelProps {
  visible:      boolean;
  slideTitle?:  string;
  slideLayout?: string;
  onInsert:     (block: ImageBlock) => void;
  onClose:      () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function OnlineImageSearchPanel({
  visible,
  slideTitle,
  slideLayout,
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
  const [position,    setPosition]    = useState<InlineBlockPosition>({
    type: 'overlay', xFrac: 0.05, yFrac: 0.1, wFrac: 0.9,
  });

  const inputRef = useRef<TextInput>(null);

  // Reset all state every time panel opens
  useEffect(() => {
    if (visible) {
      setQuery('');
      setResults([]);
      setIsLoading(false);
      setError(null);
      setHasSearched(false);
      setSelected(null);
      setCaption('');
      setPosition({ type: 'overlay', xFrac: 0.05, yFrac: 0.1, wFrac: 0.9 });
    }
  }, [visible]);

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
        setError('No images found. Try a different search term.');
      }
    } catch {
      setError('Search failed. Please check your internet connection.');
    } finally {
      setIsLoading(false);
    }
  }, [query]);

  // ── Insert selected image ───────────────────────────────────────────────────

  const handleInsert = useCallback(() => {
    if (!selected) return;

    const ar = (selected.width && selected.height)
      ? selected.width / selected.height
      : 16 / 9;

    const block: ImageBlock = {
      type:         'image',
      id:           `img_online_${Date.now()}`,
      uri:          selected.url,      // FIX: set uri to the URL directly so
                                       // SlideCard renders it without needing
                                       // the onlineUrl fallback
      onlineUrl:    selected.url,      // also set onlineUrl for PPTX/PDF export
      sourceQuery:  query,
      caption:      caption.trim() || undefined,
      aspectRatio:  ar,
      position:     { ...position },   // copy to avoid mutation
    };

    // FIX: call onInsert FIRST so the editor state is updated before the
    // panel closes. Closing first caused a stale closure where the editor
    // reference in handleOnlineImageInsert was no longer valid.
    onInsert(block);
    onClose();
  }, [selected, caption, position, query, onInsert, onClose]);

  // ── Render ──────────────────────────────────────────────────────────────────

  // Build rows of 3 for the image grid (avoids FlatList-inside-ScrollView issues)
  const imageRows: OnlineImageResult[][] = [];
  for (let i = 0; i < results.length; i += 3) {
    imageRows.push(results.slice(i, i + 3));
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}
        onPress={onClose}
      >
        <Pressable
          onPress={e => e.stopPropagation()}
          style={{
            backgroundColor:      COLORS.backgroundCard,
            borderTopLeftRadius:  24,
            borderTopRightRadius: 24,
            paddingTop:           SPACING.sm,
            paddingBottom:        insets.bottom + SPACING.md,
            maxHeight:            SCREEN_H * 0.94,
            borderTopWidth:       1,
            borderTopColor:       COLORS.border,
          }}
        >
          {/* Handle */}
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.border, alignSelf: 'center', marginBottom: SPACING.sm }} />

          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.lg, marginBottom: SPACING.md }}>
            <LinearGradient
              colors={['#4FACFE', '#00F2FE']}
              style={{ width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: SPACING.sm }}
            >
              <Ionicons name="search" size={17} color="#FFF" />
            </LinearGradient>
            <View style={{ flex: 1 }}>
              <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '800' }}>Search Online Images</Text>
              <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>Powered by Google Images · tap image to select</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Ionicons name="close" size={22} color={COLORS.textMuted} />
            </Pressable>
          </View>

          {/* Scrollable body */}
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingHorizontal: SPACING.lg, paddingBottom: SPACING.lg, gap: SPACING.md }}
          >
            {/* Search bar */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm }}>
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
                  placeholder="e.g. quantum computing concept…"
                  placeholderTextColor={COLORS.textMuted}
                  returnKeyType="search"
                  onSubmitEditing={() => handleSearch()}
                  style={{ flex: 1, color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, paddingVertical: 11, paddingHorizontal: SPACING.sm }}
                />
                {query.length > 0 && (
                  <Pressable onPress={() => { setQuery(''); setResults([]); setHasSearched(false); setSelected(null); }}>
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

            {/* Suggestion chips — only shown before first search */}
            {!hasSearched && (
              <>
                <Text style={{ color: COLORS.textMuted, fontSize: 9, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' }}>
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
                <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.sm, marginTop: SPACING.sm }}>Searching…</Text>
              </View>
            )}

            {/* Image grid — plain View rows to avoid FlatList-in-ScrollView conflicts */}
            {!isLoading && results.length > 0 && (
              <>
                <Text style={{ color: COLORS.textMuted, fontSize: 9, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' }}>
                  {results.length} Results · Tap to select
                </Text>

                {selected && (
                  <View style={{ backgroundColor: `${COLORS.primary}12`, borderRadius: RADIUS.lg, padding: SPACING.sm, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: `${COLORS.primary}30` }}>
                    <Ionicons name="checkmark-circle" size={14} color={COLORS.primary} />
                    <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.xs, fontWeight: '600', flex: 1 }} numberOfLines={1}>
                      Selected: {selected.title}
                    </Text>
                    <Pressable onPress={() => setSelected(null)}>
                      <Ionicons name="close" size={14} color={COLORS.primary} />
                    </Pressable>
                  </View>
                )}

                {/* 3-column grid using View rows */}
                {imageRows.map((row, rowIdx) => (
                  <View key={rowIdx} style={{ flexDirection: 'row', gap: THUMB_GAP }}>
                    {row.map(item => {
                      const isItemSelected = selected?.url === item.url;
                      return (
                        <TouchableOpacity
                          key={item.url}
                          onPress={() => setSelected(isItemSelected ? null : item)}
                          activeOpacity={0.8}
                          style={{
                            width:        THUMB_W,
                            height:       THUMB_H,
                            borderRadius: RADIUS.md,
                            overflow:     'hidden',
                            borderWidth:  isItemSelected ? 2.5 : 1,
                            borderColor:  isItemSelected ? COLORS.primary : COLORS.border,
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
                        </TouchableOpacity>
                      );
                    })}
                    {/* Fill empty spots in last row */}
                    {row.length < 3 && Array.from({ length: 3 - row.length }).map((_, i) => (
                      <View key={`empty-${i}`} style={{ width: THUMB_W }} />
                    ))}
                  </View>
                ))}
              </>
            )}

            {/* Selected image: caption + placement + insert */}
            {selected && (
              <>
                <View style={{ height: 1, backgroundColor: COLORS.border }} />

                {/* Large preview */}
                <View style={{ borderRadius: RADIUS.xl, overflow: 'hidden', aspectRatio: 16 / 9, borderWidth: 1.5, borderColor: `${COLORS.primary}50` }}>
                  <Image
                    source={{ uri: selected.url }}
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
                <Text style={{ color: COLORS.textMuted, fontSize: 9, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' }}>
                  Placement on Slide
                </Text>
                <JoystickPositionControl
                  position={position}
                  onChange={setPosition}
                  supportsHeight
                  accentColor="#4FACFE"
                />

                {/* Attribution notice */}
                <View style={{ backgroundColor: `${COLORS.warning}10`, borderRadius: RADIUS.lg, padding: SPACING.sm, flexDirection: 'row', gap: 6, borderWidth: 1, borderColor: `${COLORS.warning}20` }}>
                  <Ionicons name="information-circle-outline" size={13} color={COLORS.warning} />
                  <Text style={{ color: COLORS.textMuted, fontSize: 9, flex: 1, lineHeight: 13 }}>
                    Ensure you have rights to use this image. Consider using royalty-free sources.
                  </Text>
                </View>

                {/* Insert button */}
                <TouchableOpacity onPress={handleInsert} activeOpacity={0.8}>
                  <LinearGradient
                    colors={['#4FACFE', '#00F2FE']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={{ borderRadius: RADIUS.full, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                  >
                    <Ionicons name="image" size={18} color="#FFF" />
                    <Text style={{ color: '#FFF', fontSize: FONTS.sizes.base, fontWeight: '800' }}>Add Image to Slide</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}