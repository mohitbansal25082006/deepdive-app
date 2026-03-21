// src/components/editor/IconPicker.tsx
// Part 28 — Slide Canvas Editor: Icon picker bottom sheet
// ─────────────────────────────────────────────────────────────────────────────
//
// A searchable icon grid organized by category.
// Uses Ionicons (already in project via @expo/vector-icons).
//
// Props:
//   visible         — controls visibility
//   currentIcon     — currently selected Ionicons name
//   iconColor       — color used to preview icons
//   onSelectIcon    — called with chosen Ionicons name
//   onClose         — dismiss without selecting
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  ScrollView,
  TextInput,
  FlatList,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';
import { ICON_CATEGORIES, ALL_ICONS } from '../../constants/editor';
import type { IconCategoryItem } from '../../constants/editor';

// ─── Props ────────────────────────────────────────────────────────────────────

interface IconPickerProps {
  visible:       boolean;
  currentIcon?:  string;
  iconColor?:    string;
  onSelectIcon:  (iconName: string) => void;
  onClose:       () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SCREEN_W   = Dimensions.get('window').width;
const SCREEN_H   = Dimensions.get('window').height;
const COLS       = 4;
const CELL_SIZE  = Math.floor((SCREEN_W - SPACING.lg * 2 - SPACING.sm * (COLS - 1)) / COLS);

// ─── Sub-component: Icon Cell ─────────────────────────────────────────────────

const IconCell = React.memo(function IconCell({
  item,
  selected,
  iconColor,
  onPress,
}: {
  item:       IconCategoryItem;
  selected:   boolean;
  iconColor:  string;
  onPress:    (name: string) => void;
}) {
  return (
    <Pressable
      onPress={() => onPress(item.name)}
      style={{
        width:           CELL_SIZE,
        height:          CELL_SIZE,
        borderRadius:    RADIUS.md,
        alignItems:      'center',
        justifyContent:  'center',
        backgroundColor: selected ? `${COLORS.primary}20` : COLORS.backgroundElevated,
        borderWidth:     selected ? 2 : 1,
        borderColor:     selected ? COLORS.primary : COLORS.border,
        gap:             4,
      }}
    >
      <Ionicons
        name={item.name as any}
        size={selected ? 24 : 22}
        color={selected ? COLORS.primary : iconColor}
      />
      <Text
        numberOfLines={1}
        style={{
          color:     selected ? COLORS.primary : COLORS.textMuted,
          fontSize:  8,
          fontWeight: selected ? '700' : '500',
          textAlign: 'center',
          paddingHorizontal: 2,
        }}
      >
        {item.label}
      </Text>
    </Pressable>
  );
});

// ─── Main Component ───────────────────────────────────────────────────────────

export function IconPicker({
  visible,
  currentIcon,
  iconColor = COLORS.primary,
  onSelectIcon,
  onClose,
}: IconPickerProps) {
  const insets = useSafeAreaInsets();

  const [activeCat,  setActiveCat]  = useState('tech');
  const [query,      setQuery]      = useState('');
  const [selected,   setSelected]   = useState(currentIcon ?? '');

  // Reset state when picker opens
  const prevVisible = React.useRef(false);
  if (visible && !prevVisible.current) {
    prevVisible.current = true;
    // Can't call setState in render — use effect in mount
  }
  React.useEffect(() => {
    if (visible) {
      setSelected(currentIcon ?? '');
      setQuery('');
      setActiveCat('tech');
    } else {
      prevVisible.current = false;
    }
  }, [visible, currentIcon]);

  // Filtered icon list
  const displayIcons = useMemo<IconCategoryItem[]>(() => {
    if (query.trim()) {
      const q = query.toLowerCase();
      return ALL_ICONS.filter(
        ic => ic.name.toLowerCase().includes(q) || ic.label.toLowerCase().includes(q)
      );
    }
    return ICON_CATEGORIES.find(c => c.id === activeCat)?.icons ?? [];
  }, [query, activeCat]);

  const handleSelect = useCallback((name: string) => {
    setSelected(name);
  }, []);

  const handleApply = useCallback(() => {
    if (selected) onSelectIcon(selected);
    onClose();
  }, [selected, onSelectIcon, onClose]);

  const renderIcon = useCallback(({ item }: { item: IconCategoryItem }) => (
    <IconCell
      item={item}
      selected={item.name === selected}
      iconColor={iconColor}
      onPress={handleSelect}
    />
  ), [selected, iconColor, handleSelect]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' }}
        onPress={onClose}
      >
        <Pressable
          onPress={e => e.stopPropagation()}
          style={{
            backgroundColor:      COLORS.backgroundCard,
            borderTopLeftRadius:  24,
            borderTopRightRadius: 24,
            paddingBottom:        insets.bottom + SPACING.md,
            maxHeight:            SCREEN_H * 0.82,
            borderTopWidth:       1,
            borderTopColor:       COLORS.border,
          }}
        >
          {/* Handle */}
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.border, alignSelf: 'center', marginTop: 10, marginBottom: SPACING.md }} />

          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.lg, marginBottom: SPACING.md }}>
            <LinearGradient
              colors={['#6C63FF', '#8B5CF6']}
              style={{ width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: SPACING.sm }}
            >
              <Ionicons name="shapes" size={17} color="#FFF" />
            </LinearGradient>
            <Text style={{ flex: 1, color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '800' }}>Choose Icon</Text>
            {selected ? (
              <View style={{
                flexDirection:   'row',
                alignItems:      'center',
                gap:             8,
                backgroundColor: `${COLORS.primary}15`,
                borderRadius:    RADIUS.full,
                paddingHorizontal: 12,
                paddingVertical:  6,
                borderWidth:     1,
                borderColor:     `${COLORS.primary}35`,
                marginRight:     SPACING.sm,
              }}>
                <Ionicons name={selected as any} size={16} color={COLORS.primary} />
                <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.xs, fontWeight: '700' }}>Selected</Text>
              </View>
            ) : null}
            <Pressable onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Ionicons name="close" size={22} color={COLORS.textMuted} />
            </Pressable>
          </View>

          {/* Search bar */}
          <View style={{
            flexDirection:   'row',
            alignItems:      'center',
            backgroundColor: COLORS.backgroundElevated,
            borderRadius:    RADIUS.lg,
            marginHorizontal: SPACING.lg,
            marginBottom:     SPACING.sm,
            paddingHorizontal: SPACING.md,
            borderWidth:     1,
            borderColor:     query ? COLORS.primary : COLORS.border,
          }}>
            <Ionicons name="search-outline" size={18} color={query ? COLORS.primary : COLORS.textMuted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search icons…"
              placeholderTextColor={COLORS.textMuted}
              style={{
                flex:     1,
                color:    COLORS.textPrimary,
                fontSize: FONTS.sizes.sm,
                paddingVertical:   10,
                paddingHorizontal: SPACING.sm,
              }}
            />
            {query.length > 0 && (
              <Pressable onPress={() => setQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close-circle" size={18} color={COLORS.textMuted} />
              </Pressable>
            )}
          </View>

          {/* Category chips — hidden when searching */}
          {!query && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{
                paddingHorizontal: SPACING.lg,
                paddingVertical:   SPACING.sm,
                gap:               SPACING.sm,
              }}
            >
              {ICON_CATEGORIES.map(cat => {
                const active = activeCat === cat.id;
                return (
                  <Pressable
                    key={cat.id}
                    onPress={() => setActiveCat(cat.id)}
                    style={{
                      flexDirection:   'row',
                      alignItems:      'center',
                      gap:             5,
                      backgroundColor: active ? `${COLORS.primary}18` : COLORS.backgroundElevated,
                      borderRadius:    RADIUS.full,
                      paddingHorizontal: 12,
                      paddingVertical:  7,
                      borderWidth:     1,
                      borderColor:     active ? COLORS.primary : COLORS.border,
                    }}
                  >
                    <Text style={{ fontSize: 13 }}>{cat.emoji}</Text>
                    <Text style={{ color: active ? COLORS.primary : COLORS.textSecondary, fontSize: FONTS.sizes.xs, fontWeight: active ? '700' : '500' }}>
                      {cat.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

          {/* Icon grid */}
          {displayIcons.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: SPACING['2xl'] }}>
              <Ionicons name="search-outline" size={36} color={COLORS.textMuted} />
              <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.sm, marginTop: SPACING.sm }}>
                No icons found for "{query}"
              </Text>
            </View>
          ) : (
            <FlatList
              data={displayIcons}
              keyExtractor={item => item.name}
              renderItem={renderIcon}
              numColumns={COLS}
              contentContainerStyle={{
                paddingHorizontal: SPACING.lg,
                paddingTop:        SPACING.sm,
                gap:               SPACING.sm,
              }}
              columnWrapperStyle={{ gap: SPACING.sm }}
              showsVerticalScrollIndicator={false}
              style={{ flex: 1, maxHeight: SCREEN_H * 0.38 }}
              initialNumToRender={16}
              maxToRenderPerBatch={12}
              windowSize={3}
            />
          )}

          {/* Footer */}
          <View style={{
            flexDirection:    'row',
            gap:              SPACING.sm,
            paddingHorizontal: SPACING.lg,
            paddingTop:       SPACING.md,
          }}>
            <Pressable
              onPress={onClose}
              style={{
                flex:             1,
                paddingVertical:  13,
                borderRadius:     RADIUS.full,
                backgroundColor:  COLORS.backgroundElevated,
                alignItems:       'center',
                borderWidth:      1,
                borderColor:      COLORS.border,
              }}
            >
              <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.base, fontWeight: '700' }}>Cancel</Text>
            </Pressable>

            <Pressable
              onPress={handleApply}
              disabled={!selected}
              style={{ flex: 2, opacity: selected ? 1 : 0.4 }}
            >
              <LinearGradient
                colors={['#6C63FF', '#8B5CF6']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={{
                  borderRadius:    RADIUS.full,
                  paddingVertical: 13,
                  alignItems:      'center',
                  flexDirection:   'row',
                  justifyContent:  'center',
                  gap:             8,
                }}
              >
                {selected && <Ionicons name={selected as any} size={18} color="#FFF" />}
                <Text style={{ color: '#FFF', fontSize: FONTS.sizes.base, fontWeight: '800' }}>
                  {selected ? 'Use This Icon' : 'Select an Icon'}
                </Text>
              </LinearGradient>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}