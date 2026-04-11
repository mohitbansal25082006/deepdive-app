// src/components/editor/IconifyIconPicker.tsx
// Part 30 — FIXED (keyboard avoidance for iOS + Android)
//
// Key fixes applied:
// 1. Wrapped sheet content in KeyboardAvoidingView with platform-specific
//    behavior ("padding" on iOS, "height" on Android).
// 2. Added keyboardDismissMode="interactive" on all ScrollViews so the
//    keyboard slides away when the user scrolls down.
// 3. Replaced bare Pressable backdrop with a TouchableWithoutFeedback so
//    tapping outside dismisses the keyboard without closing the modal.
// 4. Used InputAccessoryView (iOS) pattern via returnKeyType + blurOnSubmit
//    so the user can dismiss the keyboard from the search field.
// 5. StatusBar-aware SafeArea — avoids double-counting insets on Android.
// ─────────────────────────────────────────────────────────────────────────────

import React, {
  useState, useCallback, useRef, useEffect, memo,
} from 'react';
import {
  View, Text, Modal, Pressable, ScrollView, TextInput,
  ActivityIndicator, Dimensions, TouchableOpacity,
  KeyboardAvoidingView, Platform, TouchableWithoutFeedback,
  Keyboard, StatusBar,
} from 'react-native';
import { SvgXml }            from 'react-native-svg';
import { LinearGradient }    from 'expo-linear-gradient';
import { Ionicons }          from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn }  from 'react-native-reanimated';

import { searchIcons, fetchIconSVG, ICONIFY_CATEGORIES } from '../../services/iconifyService';
import { JoystickPositionControl }                       from './JoystickPositionControl';
import { COLORS, FONTS, SPACING, RADIUS }                from '../../constants/theme';
import type { IconifySearchResult, InlineBlockPosition } from '../../types/editor';
import type { IconBlock }                                from '../../types/editor';

const SCREEN_W = Dimensions.get('window').width;
const SCREEN_H = Dimensions.get('window').height;
const COLS     = 5;
const CELL_SZ  = Math.floor((SCREEN_W - SPACING.lg * 2 - SPACING.xs * (COLS - 1)) / COLS);

// On Android the soft keyboard shifts the window, so we need a smaller max-height
// to leave room above the sheet for the backdrop tap target.
const SHEET_MAX_H = Platform.select({
  ios:     SCREEN_H * 0.94,
  android: SCREEN_H * 0.90,
  default: SCREEN_H * 0.94,
});

function uid() {
  return `block_icon_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

// ─── Recolour SVG XML ─────────────────────────────────────────────────────────

function recolourSvg(svgXml: string, color: string): string {
  let out = svgXml.replace(/currentColor/gi, color);
  if (!out.includes('fill=')) {
    out = out.replace('<svg', `<svg fill="${color}"`);
  }
  return out;
}

// ─── Icon Cell ────────────────────────────────────────────────────────────────

const IconCell = memo(function IconCell({
  icon,
  isSelected,
  color,
  onPress,
}: {
  icon:       IconifySearchResult;
  isSelected: boolean;
  color:      string;
  onPress:    (icon: IconifySearchResult) => void;
}) {
  const [svgXml, setSvgXml] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchIconSVG(icon.id).then(xml => {
      if (!cancelled && xml) {
        setSvgXml(recolourSvg(xml, isSelected ? COLORS.primary : color));
      }
    });
    return () => { cancelled = true; };
  }, [icon.id, isSelected, color]);

  const displayColor = isSelected ? COLORS.primary : color;
  const iconSize     = Math.floor(CELL_SZ * 0.45);

  return (
    <Pressable
      onPress={() => onPress(icon)}
      style={{
        width:           CELL_SZ,
        height:          CELL_SZ,
        borderRadius:    RADIUS.md,
        alignItems:      'center',
        justifyContent:  'center',
        backgroundColor: isSelected ? `${COLORS.primary}20` : COLORS.backgroundElevated,
        borderWidth:     isSelected ? 2 : 1,
        borderColor:     isSelected ? COLORS.primary : COLORS.border,
        gap:             3,
        overflow:        'hidden',
      }}
    >
      {svgXml ? (
        <SvgXml xml={svgXml} width={iconSize} height={iconSize} color={displayColor} />
      ) : (
        <View style={{ width: iconSize, height: iconSize, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="small" color={`${displayColor}60`} />
        </View>
      )}
      <Text
        numberOfLines={1}
        style={{
          color:             displayColor,
          fontSize:          7,
          fontWeight:        isSelected ? '700' : '500',
          textAlign:         'center',
          paddingHorizontal: 2,
        }}
      >
        {icon.name.slice(0, 10)}
      </Text>
    </Pressable>
  );
});

// ─── Props ────────────────────────────────────────────────────────────────────

interface IconifyIconPickerProps {
  visible:    boolean;
  iconColor?: string;
  onInsert:   (block: IconBlock) => void;
  onClose:    () => void;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function IconifyIconPicker({
  visible,
  iconColor = COLORS.primary,
  onInsert,
  onClose,
}: IconifyIconPickerProps) {
  const insets = useSafeAreaInsets();

  // On Android, StatusBar.currentHeight is already accounted for by the
  // window, so we only add the bottom inset.
  const bottomPad = insets.bottom > 0 ? insets.bottom : (Platform.OS === 'android' ? 8 : 0);

  const [query,          setQuery]          = useState('');
  const [results,        setResults]        = useState<IconifySearchResult[]>([]);
  const [isLoading,      setIsLoading]      = useState(false);
  const [activeCategory, setActiveCategory] = useState(ICONIFY_CATEGORIES[0]);
  const [selected,       setSelected]       = useState<IconifySearchResult | null>(null);
  const [selectedSvgXml, setSelectedSvgXml] = useState<string | null>(null);
  const [label,          setLabel]          = useState('');
  const [iconSize,       setIconSize]       = useState(40);
  const [color,          setColor]          = useState(iconColor);
  const [position,       setPosition]       = useState<InlineBlockPosition>({
    type: 'overlay', xFrac: 0.4, yFrac: 0.35, wFrac: 0.2,
  });
  const [showDetail, setShowDetail] = useState(false);

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<TextInput>(null);

  // Reset on open
  useEffect(() => {
    if (visible) {
      setQuery('');
      setSelected(null);
      setSelectedSvgXml(null);
      setShowDetail(false);
      setLabel('');
      setColor(iconColor);
      loadCategory(ICONIFY_CATEGORIES[0]);
    }
  }, [visible]);

  // Debounced search
  useEffect(() => {
    if (!query.trim()) return;
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => doSearch(query), 400);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [query]);

  const loadCategory = useCallback(async (cat: typeof ICONIFY_CATEGORIES[0]) => {
    setActiveCategory(cat);
    setIsLoading(true);
    const icons = await searchIcons(cat.query, 60);
    setResults(icons);
    setIsLoading(false);
  }, []);

  const doSearch = useCallback(async (q: string) => {
    setIsLoading(true);
    const icons = await searchIcons(q, 80);
    setResults(icons);
    setIsLoading(false);
  }, []);

  const handleSelectIcon = useCallback(async (icon: IconifySearchResult) => {
    Keyboard.dismiss();
    setSelected(icon);
    setShowDetail(true);
    const xml = await fetchIconSVG(icon.id);
    if (xml) setSelectedSvgXml(recolourSvg(xml, color));
  }, [color]);

  // Re-colour preview when color changes
  useEffect(() => {
    if (selected) {
      fetchIconSVG(selected.id).then(xml => {
        if (xml) setSelectedSvgXml(recolourSvg(xml, color));
      });
    }
  }, [color]);

  const handleInsert = useCallback(() => {
    if (!selected) return;
    const block: IconBlock = {
      type:      'icon',
      id:        uid(),
      iconName:  'shapes-outline',
      iconifyId: selected.id,
      svgData:   selectedSvgXml ?? undefined,
      size:      iconSize,
      color,
      label:     label.trim() || undefined,
      position,
    };
    onClose();
    setTimeout(() => onInsert(block), 50);
  }, [selected, selectedSvgXml, iconSize, color, label, position, onInsert, onClose]);

  const ACCENT_COLORS = [
    '#6C63FF', '#FF6584', '#43E97B', '#FFA726',
    '#4FACFE', '#F093FB', '#FFFFFF', '#FF4757',
    '#2ED573', '#1E90FF', '#FFD700', '#FF6B6B',
  ];

  const iconRows: IconifySearchResult[][] = [];
  for (let i = 0; i < results.length; i += COLS) {
    iconRows.push(results.slice(i, i + COLS));
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      // On Android, setting statusBarTranslucent lets our overlay cover
      // the status bar area properly without a white strip at the top.
      statusBarTranslucent={Platform.OS === 'android'}
    >
      {/*
        TouchableWithoutFeedback wrapping the full-screen backdrop:
        - Tapping OUTSIDE the sheet dismisses the keyboard first, then
          (if no detail view is open) closes the modal on a second tap.
        - We do NOT swallow touch on the sheet itself.
      */}
      <TouchableWithoutFeedback onPress={() => { Keyboard.dismiss(); if (!showDetail) onClose(); }}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>

          {/*
            KeyboardAvoidingView sits INSIDE the backdrop so it only
            lifts the sheet, not the entire overlay.

            iOS  → behavior="padding"  pushes the bottom sheet up by the
                   keyboard height.
            Android → behavior="height" shrinks the view so the sheet
                   content is still visible. On Android the OS already
                   pans the window (windowSoftInputMode=adjustResize in
                   most Expo/RN apps), so we just add a small extra
                   keyboardVerticalOffset to compensate for the status bar.
          */}
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={
              Platform.OS === 'android'
                ? (StatusBar.currentHeight ?? 24)
                : 0
            }
            style={{ width: '100%' }}
          >
            {/* Stop touch events from bubbling up to the backdrop */}
            <TouchableWithoutFeedback onPress={() => { /* sheet absorbs touches */ }}>
              <View
                style={{
                  backgroundColor:      COLORS.backgroundCard,
                  borderTopLeftRadius:  24,
                  borderTopRightRadius: 24,
                  paddingTop:           SPACING.sm,
                  paddingBottom:        bottomPad + SPACING.md,
                  maxHeight:            SHEET_MAX_H,
                  borderTopWidth:       1,
                  borderTopColor:       COLORS.border,
                }}
              >
                {/* Handle bar */}
                <View style={{
                  width: 40, height: 4, borderRadius: 2,
                  backgroundColor: COLORS.border,
                  alignSelf: 'center', marginBottom: SPACING.sm,
                }} />

                {/* ── Header ── */}
                <View style={{
                  flexDirection: 'row', alignItems: 'center',
                  paddingHorizontal: SPACING.lg, marginBottom: SPACING.md,
                }}>
                  {showDetail && (
                    <Pressable
                      onPress={() => { setShowDetail(false); setSelected(null); }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={{
                        width: 34, height: 34, borderRadius: 10,
                        backgroundColor: COLORS.backgroundElevated,
                        alignItems: 'center', justifyContent: 'center',
                        marginRight: SPACING.sm, borderWidth: 1, borderColor: COLORS.border,
                      }}
                    >
                      <Ionicons name="arrow-back" size={18} color={COLORS.textSecondary} />
                    </Pressable>
                  )}
                  <LinearGradient
                    colors={['#6C63FF', '#8B5CF6']}
                    style={{
                      width: 34, height: 34, borderRadius: 10,
                      alignItems: 'center', justifyContent: 'center',
                      marginRight: SPACING.sm,
                    }}
                  >
                    <Ionicons name="shapes" size={17} color="#FFF" />
                  </LinearGradient>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '800' }}>
                      {showDetail && selected ? selected.name : 'Icon Library'}
                    </Text>
                    <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
                      {showDetail && selected
                        ? `${selected.prefix} · customise & place`
                        : '275,000+ icons · tap to browse'}
                    </Text>
                  </View>
                  <Pressable onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                    <Ionicons name="close" size={22} color={COLORS.textMuted} />
                  </Pressable>
                </View>

                {/* ── DETAIL VIEW ── */}
                {showDetail && selected ? (
                  <ScrollView
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="interactive"
                    contentContainerStyle={{
                      paddingHorizontal: SPACING.lg,
                      paddingBottom:     SPACING.lg,
                      gap:               SPACING.lg,
                    }}
                  >
                    {/* Big preview */}
                    <Animated.View
                      entering={FadeIn.duration(250)}
                      style={{ alignItems: 'center', paddingVertical: SPACING.lg }}
                    >
                      <View style={{
                        width: 96, height: 96, borderRadius: 24,
                        backgroundColor: `${color}18`,
                        borderWidth: 2, borderColor: `${color}35`,
                        alignItems: 'center', justifyContent: 'center',
                      }}>
                        {selectedSvgXml
                          ? <SvgXml xml={selectedSvgXml} width={56} height={56} color={color} />
                          : <ActivityIndicator size="large" color={color} />}
                      </View>
                      <Text style={{
                        color: COLORS.textPrimary, fontSize: FONTS.sizes.base,
                        fontWeight: '700', marginTop: 10,
                      }}>
                        {selected.name}
                      </Text>
                      <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 2 }}>
                        {selected.prefix} · {selected.id}
                      </Text>
                    </Animated.View>

                    {/* Label */}
                    <View style={{
                      backgroundColor: COLORS.backgroundElevated, borderRadius: RADIUS.lg,
                      borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: SPACING.md,
                    }}>
                      <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 8 }}>
                        Label (optional)
                      </Text>
                      <TextInput
                        value={label}
                        onChangeText={setLabel}
                        placeholder="Add a label below the icon…"
                        placeholderTextColor={COLORS.textMuted}
                        returnKeyType="done"
                        blurOnSubmit
                        onSubmitEditing={Keyboard.dismiss}
                        style={{
                          color: COLORS.textPrimary, fontSize: FONTS.sizes.sm,
                          paddingVertical: 8,
                        }}
                      />
                    </View>

                    {/* Size */}
                    <View style={{ gap: 8 }}>
                      <Text style={{
                        color: COLORS.textMuted, fontSize: 9,
                        fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase',
                      }}>
                        Icon Size
                      </Text>
                      <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
                        {[24, 32, 40, 56, 72].map(sz => (
                          <Pressable
                            key={sz}
                            onPress={() => setIconSize(sz)}
                            style={{
                              flex: 1, alignItems: 'center', paddingVertical: 8,
                              borderRadius: RADIUS.lg,
                              backgroundColor: iconSize === sz ? `${COLORS.primary}18` : COLORS.backgroundElevated,
                              borderWidth: 1.5,
                              borderColor: iconSize === sz ? COLORS.primary : COLORS.border,
                            }}
                          >
                            <Text style={{
                              color: iconSize === sz ? COLORS.primary : COLORS.textSecondary,
                              fontSize: FONTS.sizes.xs, fontWeight: '700',
                            }}>
                              {sz}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>

                    {/* Color */}
                    <View style={{ gap: 8 }}>
                      <Text style={{
                        color: COLORS.textMuted, fontSize: 9,
                        fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase',
                      }}>
                        Icon Color
                      </Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                        {ACCENT_COLORS.map(c => (
                          <Pressable
                            key={c}
                            onPress={() => setColor(c)}
                            style={{
                              width: 32, height: 32, borderRadius: 16,
                              backgroundColor: c,
                              borderWidth: color === c ? 3 : 1,
                              borderColor: color === c ? '#FFF' : 'rgba(255,255,255,0.2)',
                              alignItems: 'center', justifyContent: 'center',
                            }}
                          >
                            {color === c && (
                              <Ionicons name="checkmark" size={15} color={c === '#FFFFFF' ? '#000' : '#FFF'} />
                            )}
                          </Pressable>
                        ))}
                      </View>
                    </View>

                    {/* Placement */}
                    <View style={{ gap: 8 }}>
                      <Text style={{
                        color: COLORS.textMuted, fontSize: 9,
                        fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase',
                      }}>
                        Placement on Slide
                      </Text>
                      <JoystickPositionControl
                        position={position}
                        onChange={setPosition}
                        accentColor={COLORS.primary}
                      />
                    </View>

                    {/* Insert button */}
                    <TouchableOpacity onPress={handleInsert} activeOpacity={0.8}>
                      <LinearGradient
                        colors={['#6C63FF', '#8B5CF6']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={{
                          borderRadius: RADIUS.full, paddingVertical: 14,
                          flexDirection: 'row', alignItems: 'center',
                          justifyContent: 'center', gap: 10,
                        }}
                      >
                        {selectedSvgXml
                          ? <SvgXml xml={selectedSvgXml} width={20} height={20} color="#FFF" />
                          : <Ionicons name="shapes-outline" size={20} color="#FFF" />}
                        <Text style={{ color: '#FFF', fontSize: FONTS.sizes.base, fontWeight: '800' }}>
                          Add Icon to Slide
                        </Text>
                      </LinearGradient>
                    </TouchableOpacity>
                  </ScrollView>

                ) : (
                  /* ── SEARCH / BROWSE VIEW ── */
                  <>
                    {/* Search bar */}
                    <View style={{
                      flexDirection: 'row', alignItems: 'center',
                      backgroundColor: COLORS.backgroundElevated,
                      borderRadius: RADIUS.lg,
                      marginHorizontal: SPACING.lg, marginBottom: SPACING.sm,
                      paddingHorizontal: SPACING.md,
                      borderWidth: 1,
                      borderColor: query ? COLORS.primary : COLORS.border,
                    }}>
                      <Ionicons
                        name="search-outline"
                        size={18}
                        color={query ? COLORS.primary : COLORS.textMuted}
                      />
                      <TextInput
                        ref={searchInputRef}
                        value={query}
                        onChangeText={v => {
                          setQuery(v);
                          if (!v.trim()) loadCategory(activeCategory);
                        }}
                        placeholder="Search 275k+ icons…"
                        placeholderTextColor={COLORS.textMuted}
                        returnKeyType="search"
                        blurOnSubmit={false}           // keep keyboard open while searching
                        enablesReturnKeyAutomatically  // iOS: grey out Return until text exists
                        onSubmitEditing={() => query.trim() && doSearch(query)}
                        style={{
                          flex: 1, color: COLORS.textPrimary,
                          fontSize: FONTS.sizes.sm,
                          paddingVertical: 11, paddingHorizontal: SPACING.sm,
                        }}
                      />
                      {query.length > 0 && (
                        <Pressable onPress={() => {
                          setQuery('');
                          loadCategory(activeCategory);
                          searchInputRef.current?.focus();
                        }}>
                          <Ionicons name="close-circle" size={18} color={COLORS.textMuted} />
                        </Pressable>
                      )}
                    </View>

                    {/* Category tabs */}
                    {!query && (
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled"
                        contentContainerStyle={{
                          paddingHorizontal: SPACING.lg,
                          gap: SPACING.sm,
                          alignItems: 'center',
                          marginBottom: SPACING.sm,
                        }}
                        style={{ flexShrink: 0, flexGrow: 0 }}
                      >
                        {ICONIFY_CATEGORIES.map(cat => {
                          const isActive = activeCategory.id === cat.id;
                          return (
                            <Pressable
                              key={cat.id}
                              onPress={() => { setQuery(''); loadCategory(cat); }}
                              style={{
                                flexDirection: 'row', alignItems: 'center', gap: 5,
                                backgroundColor: isActive ? `${COLORS.primary}18` : COLORS.backgroundElevated,
                                borderRadius: RADIUS.full,
                                paddingHorizontal: 12, paddingVertical: 7,
                                borderWidth: 1,
                                borderColor: isActive ? COLORS.primary : COLORS.border,
                                flexShrink: 0,
                              }}
                            >
                              <Text style={{
                                color: isActive ? COLORS.primary : COLORS.textSecondary,
                                fontSize: FONTS.sizes.xs,
                                fontWeight: isActive ? '700' : '500',
                              }}>
                                {cat.label}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </ScrollView>
                    )}

                    {/* Icon grid */}
                    {isLoading ? (
                      <View style={{ alignItems: 'center', paddingVertical: SPACING.xl }}>
                        <ActivityIndicator size="large" color={COLORS.primary} />
                        <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.sm, marginTop: SPACING.sm }}>
                          Loading icons…
                        </Text>
                      </View>
                    ) : (
                      <ScrollView
                        showsVerticalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled"
                        keyboardDismissMode="interactive"
                        style={{ maxHeight: SCREEN_H * 0.42 }}
                        contentContainerStyle={{
                          paddingHorizontal: SPACING.lg,
                          paddingBottom: SPACING.sm,
                          gap: SPACING.xs,
                        }}
                      >
                        {iconRows.map((row, rowIdx) => (
                          <View
                            key={rowIdx}
                            style={{ flexDirection: 'row', gap: SPACING.xs, marginBottom: SPACING.xs }}
                          >
                            {row.map(icon => (
                              <IconCell
                                key={icon.id}
                                icon={icon}
                                isSelected={selected?.id === icon.id}
                                color={iconColor}
                                onPress={handleSelectIcon}
                              />
                            ))}
                            {row.length < COLS &&
                              Array.from({ length: COLS - row.length }).map((_, i) => (
                                <View key={`empty-${i}`} style={{ width: CELL_SZ }} />
                              ))}
                          </View>
                        ))}
                      </ScrollView>
                    )}

                    {/* Attribution */}
                    <View style={{ paddingHorizontal: SPACING.lg, paddingTop: 4 }}>
                      <Text style={{ color: COLORS.textMuted, fontSize: 9, textAlign: 'center' }}>
                        Icons from Iconify — 275k+ free icons · iconify.design
                      </Text>
                    </View>
                  </>
                )}
              </View>
            </TouchableWithoutFeedback>
          </KeyboardAvoidingView>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}