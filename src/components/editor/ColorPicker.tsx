// src/components/editor/ColorPicker.tsx
// Part 28 — Slide Canvas Editor: Color picker bottom sheet
// ─────────────────────────────────────────────────────────────────────────────
//
// Shows:
//  • Theme accent swatches (6 colors)
//  • Semantic colors (6 colors)
//  • Extended palette grid (30 colors, 5 rows × 6 cols)
//  • Custom hex input field
//  • Currently selected color preview
//
// Props:
//   visible         — controls Modal visibility
//   currentColor    — pre-selected swatch (hex)
//   onSelectColor   — called with the chosen hex string
//   onClose         — dismiss without selecting
//   title           — bottom sheet title (default: "Choose Color")
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';
import {
  THEME_ACCENT_COLORS,
  SEMANTIC_COLORS,
  EXTENDED_PALETTE,
} from '../../constants/editor';

// ─── Props ────────────────────────────────────────────────────────────────────

interface ColorPickerProps {
  visible:       boolean;
  currentColor?: string;
  onSelectColor: (color: string) => void;
  onClose:       () => void;
  title?:        string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SCREEN_H = Dimensions.get('window').height;
const SWATCH_SIZE = 36;
const COL_COUNT = 6;

/** Basic hex validation */
function isValidHex(s: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(s);
}

/** Ensure hex has leading # */
function normalizeHex(s: string): string {
  if (!s) return '';
  return s.startsWith('#') ? s : `#${s}`;
}

/** Determine if a color is "light" so we can pick contrasting border */
function isLight(hex: string): boolean {
  try {
    const c = hex.replace('#', '');
    const r = parseInt(c.substr(0, 2), 16);
    const g = parseInt(c.substr(2, 2), 16);
    const b = parseInt(c.substr(4, 2), 16);
    return (r * 299 + g * 587 + b * 114) / 1000 > 160;
  } catch { return false; }
}

// ─── Sub-component: Swatch ────────────────────────────────────────────────────

function Swatch({
  color,
  selected,
  onPress,
  size = SWATCH_SIZE,
}: {
  color:    string;
  selected: boolean;
  onPress:  (c: string) => void;
  size?:    number;
}) {
  const isLightColor = isLight(color);
  return (
    <Pressable
      onPress={() => onPress(color)}
      hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
      style={{
        width:         size,
        height:        size,
        borderRadius:  size / 2,
        backgroundColor: color,
        borderWidth:   selected ? 2.5 : isLightColor ? 1 : 0,
        borderColor:   selected
          ? COLORS.primary
          : isLightColor ? COLORS.border : 'transparent',
        alignItems:    'center',
        justifyContent:'center',
        // Outer ring when selected
        ...(selected && {
          shadowColor:   COLORS.primary,
          shadowOffset:  { width: 0, height: 0 },
          shadowOpacity: 0.7,
          shadowRadius:  6,
          elevation:     4,
        }),
      }}
    >
      {selected && (
        <Ionicons
          name="checkmark"
          size={size * 0.45}
          color={isLightColor ? '#000' : '#FFF'}
        />
      )}
    </Pressable>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ColorPicker({
  visible,
  currentColor,
  onSelectColor,
  onClose,
  title = 'Choose Color',
}: ColorPickerProps) {
  const insets = useSafeAreaInsets();

  const [selected,  setSelected]  = useState(currentColor ?? '#6C63FF');
  const [hexInput,  setHexInput]  = useState('');
  const [hexError,  setHexError]  = useState(false);

  // Sync selection when prop changes (e.g. when picker re-opens for a different target)
  useEffect(() => {
    if (visible) {
      setSelected(currentColor ?? '#6C63FF');
      setHexInput('');
      setHexError(false);
    }
  }, [visible, currentColor]);

  const handleSwatchPress = useCallback((color: string) => {
    setSelected(color);
    setHexInput('');
    setHexError(false);
  }, []);

  const handleHexChange = useCallback((text: string) => {
    const raw = normalizeHex(text.trim());
    setHexInput(raw);
    if (raw === '' || isValidHex(raw)) {
      setHexError(false);
      if (isValidHex(raw)) setSelected(raw);
    } else {
      setHexError(true);
    }
  }, []);

  const handleApply = useCallback(() => {
    if (hexInput && isValidHex(hexInput)) {
      onSelectColor(hexInput);
    } else {
      onSelectColor(selected);
    }
    onClose();
  }, [hexInput, selected, onSelectColor, onClose]);

  // ── Render ─────────────────────────────────────────────────────────────────

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
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable
            onPress={e => e.stopPropagation()}
            style={{
              backgroundColor:    COLORS.backgroundCard,
              borderTopLeftRadius:  24,
              borderTopRightRadius: 24,
              paddingBottom:        insets.bottom + SPACING.md,
              maxHeight:            SCREEN_H * 0.80,
              borderTopWidth:       1,
              borderTopColor:       COLORS.border,
            }}
          >
            {/* Handle */}
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.border, alignSelf: 'center', marginTop: 10, marginBottom: SPACING.md }} />

            {/* Header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.lg, marginBottom: SPACING.lg }}>
              <LinearGradient
                colors={['#6C63FF', '#8B5CF6']}
                style={{ width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: SPACING.sm }}
              >
                <Ionicons name="color-palette" size={17} color="#FFF" />
              </LinearGradient>
              <Text style={{ flex: 1, color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '800' }}>{title}</Text>
              <Pressable onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Ionicons name="close" size={22} color={COLORS.textMuted} />
              </Pressable>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingHorizontal: SPACING.lg, paddingBottom: SPACING.md }}
            >
              {/* Current color preview */}
              <View style={{
                flexDirection:  'row',
                alignItems:     'center',
                backgroundColor: COLORS.backgroundElevated,
                borderRadius:    RADIUS.lg,
                padding:         SPACING.md,
                marginBottom:    SPACING.lg,
                borderWidth:     1,
                borderColor:     COLORS.border,
              }}>
                <View style={{
                  width:           52,
                  height:          52,
                  borderRadius:    RADIUS.md,
                  backgroundColor: selected,
                  marginRight:     SPACING.md,
                  borderWidth:     isLight(selected) ? 1 : 0,
                  borderColor:     COLORS.border,
                }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginBottom: 4 }}>Selected</Text>
                  <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '700', letterSpacing: 1 }}>
                    {selected.toUpperCase()}
                  </Text>
                </View>
              </View>

              {/* Theme accents */}
              <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', marginBottom: SPACING.sm }}>
                Theme Accents
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginBottom: SPACING.lg }}>
                {THEME_ACCENT_COLORS.map(c => (
                  <Swatch key={c} color={c} selected={selected === c} onPress={handleSwatchPress} />
                ))}
              </View>

              {/* Semantic colors */}
              <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', marginBottom: SPACING.sm }}>
                Semantic
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginBottom: SPACING.lg }}>
                {SEMANTIC_COLORS.map(c => (
                  <Swatch key={c} color={c} selected={selected === c} onPress={handleSwatchPress} />
                ))}
              </View>

              {/* Extended palette grid */}
              <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', marginBottom: SPACING.sm }}>
                Palette
              </Text>
              {Array.from({ length: Math.ceil(EXTENDED_PALETTE.length / COL_COUNT) }, (_, row) => (
                <View key={row} style={{ flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.sm }}>
                  {EXTENDED_PALETTE.slice(row * COL_COUNT, (row + 1) * COL_COUNT).map(c => (
                    <Swatch key={c} color={c} selected={selected === c} onPress={handleSwatchPress} />
                  ))}
                </View>
              ))}

              {/* Custom hex input */}
              <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', marginTop: SPACING.sm, marginBottom: SPACING.sm }}>
                Custom Hex
              </Text>
              <View style={{
                flexDirection:   'row',
                alignItems:      'center',
                backgroundColor: COLORS.backgroundElevated,
                borderRadius:    RADIUS.lg,
                borderWidth:     1,
                borderColor:     hexError ? COLORS.error : COLORS.border,
                paddingHorizontal: SPACING.md,
                marginBottom:    SPACING.lg,
                gap:             SPACING.sm,
              }}>
                <View style={{
                  width:  28,
                  height: 28,
                  borderRadius: RADIUS.sm,
                  backgroundColor: hexInput && isValidHex(hexInput) ? hexInput : selected,
                  borderWidth: 1,
                  borderColor: COLORS.border,
                  flexShrink: 0,
                }} />
                <TextInput
                  value={hexInput}
                  onChangeText={handleHexChange}
                  placeholder="#6C63FF"
                  placeholderTextColor={COLORS.textMuted}
                  autoCapitalize="characters"
                  maxLength={7}
                  style={{
                    flex:       1,
                    color:      COLORS.textPrimary,
                    fontSize:   FONTS.sizes.base,
                    fontWeight: '600',
                    paddingVertical: SPACING.sm,
                    letterSpacing:   1,
                  }}
                />
                {hexError && (
                  <Ionicons name="alert-circle" size={18} color={COLORS.error} />
                )}
              </View>
            </ScrollView>

            {/* Footer: Cancel + Apply */}
            <View style={{ flexDirection: 'row', gap: SPACING.sm, paddingHorizontal: SPACING.lg, paddingTop: SPACING.sm }}>
              <Pressable
                onPress={onClose}
                style={{
                  flex:              1,
                  paddingVertical:   13,
                  borderRadius:      RADIUS.full,
                  backgroundColor:   COLORS.backgroundElevated,
                  alignItems:        'center',
                  borderWidth:       1,
                  borderColor:       COLORS.border,
                }}
              >
                <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.base, fontWeight: '700' }}>Cancel</Text>
              </Pressable>
              <Pressable onPress={handleApply} style={{ flex: 2 }}>
                <LinearGradient
                  colors={['#6C63FF', '#8B5CF6']}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={{ borderRadius: RADIUS.full, paddingVertical: 13, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}
                >
                  <View style={{ width: 20, height: 20, borderRadius: 6, backgroundColor: selected, borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)' }} />
                  <Text style={{ color: '#FFF', fontSize: FONTS.sizes.base, fontWeight: '800' }}>Apply Color</Text>
                </LinearGradient>
              </Pressable>
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}