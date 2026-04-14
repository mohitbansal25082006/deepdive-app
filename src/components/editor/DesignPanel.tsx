// src/components/editor/DesignPanel.tsx
// Part 41.9 — Added Font Size and Text Color sections
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  ScrollView,
  Switch,
  Dimensions,
} from 'react-native';
import { LinearGradient }     from 'expo-linear-gradient';
import { Ionicons }           from '@expo/vector-icons';
import { useSafeAreaInsets }  from 'react-native-safe-area-context';

import { COLORS, FONTS, SPACING, RADIUS }    from '../../constants/theme';
import {
  FONT_OPTIONS,
  SPACING_OPTIONS,
  THEME_ACCENT_COLORS,
  SEMANTIC_COLORS,
  EXTENDED_PALETTE,
}                                            from '../../constants/editor';
import type { FontFamily, SpacingLevel }     from '../../types/editor';
import type { PresentationThemeTokens }      from '../../types';

// ─── Constants ────────────────────────────────────────────────────────────────

const SCREEN_H   = Dimensions.get('window').height;
const SWATCH_SZ  = 32;

// Part 41.9: Font size preset options
const FONT_SIZE_OPTIONS = [
  { scale: 0.75, label: 'Tiny',   displaySize: 10 },
  { scale: 0.85, label: 'Small',  displaySize: 12 },
  { scale: 1.0,  label: 'Normal', displaySize: 15 },
  { scale: 1.2,  label: 'Large',  displaySize: 18 },
  { scale: 1.5,  label: 'XL',     displaySize: 22 },
] as const;

// Part 41.9: Text color swatches (whites, grays, darks + accents)
const TEXT_COLOR_SWATCHES: readonly string[] = [
  '#FFFFFF', '#F5F5F5', '#E0E0E0', '#BDBDBD',
  '#9E9E9E', '#757575', '#424242', '#212121',
  '#6C63FF', '#4FACFE', '#43E97B', '#FFA726',
  '#FF6584', '#F093FB', '#29B6F6', '#FF4757',
] as const;

// ─── Props ────────────────────────────────────────────────────────────────────

interface DesignPanelProps {
  visible:                  boolean;
  tokens:                   PresentationThemeTokens;
  currentBg?:               string;
  currentAccent?:           string;
  currentSpacing:           SpacingLevel;
  currentFont:              FontFamily;
  /** Part 41.9 */
  currentGlobalFontScale?:  number;
  /** Part 41.9 */
  currentGlobalTextColor?:  string;
  onSetBackground:          (color: string, applyAll: boolean) => void;
  onSetAccent:              (color: string, applyAll: boolean) => void;
  onSetSpacing:             (spacing: SpacingLevel, applyAll?: boolean) => void;
  onSetFont:                (font: FontFamily) => void;
  /** Part 41.9 */
  onSetGlobalFontScale:     (scale: number, applyAll: boolean) => void;
  /** Part 41.9: undefined = reset to default */
  onSetGlobalTextColor:     (color: string | undefined, applyAll: boolean) => void;
  onOpenColorPicker:        (scope: 'slide_bg' | 'accent' | 'global_text_color') => void;
  onClose:                  () => void;
}

// ─── Quick swatch row ─────────────────────────────────────────────────────────

function SwatchRow({
  colors,
  selected,
  onSelect,
}: {
  colors:   readonly string[];
  selected: string | undefined;
  onSelect: (c: string) => void;
}) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm }}>
      {colors.map(c => (
        <Pressable
          key={c}
          onPress={() => onSelect(c)}
          style={{
            width:           SWATCH_SZ,
            height:          SWATCH_SZ,
            borderRadius:    SWATCH_SZ / 2,
            backgroundColor: c,
            borderWidth:     selected === c ? 2.5 : 1,
            borderColor:     selected === c ? COLORS.primary : 'rgba(255,255,255,0.2)',
            alignItems:      'center',
            justifyContent:  'center',
            ...(selected === c && {
              shadowColor:   COLORS.primary,
              shadowOffset:  { width: 0, height: 0 },
              shadowOpacity: 0.6,
              shadowRadius:  5,
              elevation:     4,
            }),
          }}
        >
          {selected === c && (
            <Ionicons name="checkmark" size={14} color={c === '#FFFFFF' || c === '#F5F5F5' ? '#000' : '#FFF'} />
          )}
        </Pressable>
      ))}
    </View>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionLabel({ title, icon }: { title: string; icon: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: SPACING.sm }}>
      <Ionicons name={icon as any} size={14} color={COLORS.primary} />
      <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' }}>
        {title}
      </Text>
    </View>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function DesignPanel({
  visible,
  tokens,
  currentBg,
  currentAccent,
  currentSpacing,
  currentFont,
  currentGlobalFontScale,
  currentGlobalTextColor,
  onSetBackground,
  onSetAccent,
  onSetSpacing,
  onSetFont,
  onSetGlobalFontScale,
  onSetGlobalTextColor,
  onOpenColorPicker,
  onClose,
}: DesignPanelProps) {
  const insets = useSafeAreaInsets();

  const [bgApplyAll,         setBgApplyAll]         = useState(false);
  const [accentApplyAll,     setAccentApplyAll]      = useState(false);
  const [fontSizeApplyAll,   setFontSizeApplyAll]    = useState(false);
  const [textColorApplyAll,  setTextColorApplyAll]   = useState(false);

  const activeBg     = currentBg     ?? tokens.background;
  const activeAccent = currentAccent ?? tokens.primary;
  const activeFontScale = currentGlobalFontScale ?? 1.0;

  const handleBgSelect = useCallback((c: string) => {
    onSetBackground(c, bgApplyAll);
  }, [bgApplyAll, onSetBackground]);

  const handleAccentSelect = useCallback((c: string) => {
    onSetAccent(c, accentApplyAll);
  }, [accentApplyAll, onSetAccent]);

  const handleFontSizeSelect = useCallback((scale: number) => {
    onSetGlobalFontScale(scale, fontSizeApplyAll);
  }, [fontSizeApplyAll, onSetGlobalFontScale]);

  const handleTextColorSelect = useCallback((color: string) => {
    onSetGlobalTextColor(color, textColorApplyAll);
  }, [textColorApplyAll, onSetGlobalTextColor]);

  const handleResetTextColor = useCallback(() => {
    onSetGlobalTextColor(undefined, textColorApplyAll);
  }, [textColorApplyAll, onSetGlobalTextColor]);

  // Get label for active font scale
  const activeFontSizeLabel = FONT_SIZE_OPTIONS.find(o => Math.abs(o.scale - activeFontScale) < 0.05)?.label ?? 'Custom';

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
            paddingTop:           SPACING.sm,
            paddingBottom:        insets.bottom + SPACING.md,
            maxHeight:            SCREEN_H * 0.92,
            borderTopWidth:       1,
            borderTopColor:       COLORS.border,
          }}
        >
          {/* Handle */}
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.border, alignSelf: 'center', marginBottom: SPACING.sm }} />

          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.lg, marginBottom: SPACING.md }}>
            <LinearGradient
              colors={['#6C63FF', '#8B5CF6']}
              style={{ width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: SPACING.sm }}
            >
              <Ionicons name="color-palette" size={17} color="#FFF" />
            </LinearGradient>
            <View style={{ flex: 1 }}>
              <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '800' }}>Design Controls</Text>
              <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>Per-slide visual overrides</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Ionicons name="close" size={22} color={COLORS.textMuted} />
            </Pressable>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: SPACING.lg, paddingBottom: SPACING.lg, gap: SPACING.lg }}
          >

            {/* ── Background Color ── */}
            <View>
              <SectionLabel title="Background Color" icon="square-outline" />
              <View style={{ backgroundColor: COLORS.backgroundElevated, borderRadius: RADIUS.xl, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border, gap: SPACING.md }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.md }}>
                  <View style={{ width: 46, height: 46, borderRadius: RADIUS.md, backgroundColor: activeBg, borderWidth: 1, borderColor: COLORS.border }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '700' }}>
                      {activeBg.toUpperCase()}
                    </Text>
                    <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>Current slide background</Text>
                  </View>
                  <Pressable
                    onPress={() => onOpenColorPicker('slide_bg')}
                    style={{ backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.md, padding: SPACING.sm, borderWidth: 1, borderColor: COLORS.border }}
                  >
                    <Ionicons name="color-filter-outline" size={18} color={COLORS.primary} />
                  </Pressable>
                </View>
                <SwatchRow
                  colors={[...THEME_ACCENT_COLORS, ...['#0A0A1A', '#F8F7FF', '#F0F4F8', '#0D0D2B'] as const]}
                  selected={activeBg}
                  onSelect={handleBgSelect}
                />
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: SPACING.sm, borderTopWidth: 1, borderTopColor: COLORS.border }}>
                  <View>
                    <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, fontWeight: '600' }}>Apply to all slides</Text>
                    <Text style={{ color: COLORS.textMuted, fontSize: 10 }}>Changes every slide's background</Text>
                  </View>
                  <Switch
                    value={bgApplyAll}
                    onValueChange={setBgApplyAll}
                    trackColor={{ false: COLORS.backgroundCard, true: `${COLORS.primary}50` }}
                    thumbColor={bgApplyAll ? COLORS.primary : COLORS.textMuted}
                    ios_backgroundColor={COLORS.backgroundCard}
                  />
                </View>
              </View>
            </View>

            {/* ── Accent Color ── */}
            <View>
              <SectionLabel title="Accent Color" icon="color-fill-outline" />
              <View style={{ backgroundColor: COLORS.backgroundElevated, borderRadius: RADIUS.xl, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border, gap: SPACING.md }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.md }}>
                  <View style={{ width: 46, height: 46, borderRadius: RADIUS.md, backgroundColor: activeAccent, borderWidth: 1, borderColor: COLORS.border }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '700' }}>
                      {activeAccent.toUpperCase()}
                    </Text>
                    <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>Bars, dots, highlights</Text>
                  </View>
                  <Pressable
                    onPress={() => onOpenColorPicker('accent')}
                    style={{ backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.md, padding: SPACING.sm, borderWidth: 1, borderColor: COLORS.border }}
                  >
                    <Ionicons name="color-filter-outline" size={18} color={COLORS.primary} />
                  </Pressable>
                </View>
                <SwatchRow
                  colors={[...THEME_ACCENT_COLORS, ...SEMANTIC_COLORS]}
                  selected={activeAccent}
                  onSelect={handleAccentSelect}
                />
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: SPACING.sm, borderTopWidth: 1, borderTopColor: COLORS.border }}>
                  <View>
                    <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, fontWeight: '600' }}>Apply to all slides</Text>
                    <Text style={{ color: COLORS.textMuted, fontSize: 10 }}>Updates every slide's accent</Text>
                  </View>
                  <Switch
                    value={accentApplyAll}
                    onValueChange={setAccentApplyAll}
                    trackColor={{ false: COLORS.backgroundCard, true: `${COLORS.primary}50` }}
                    thumbColor={accentApplyAll ? COLORS.primary : COLORS.textMuted}
                    ios_backgroundColor={COLORS.backgroundCard}
                  />
                </View>
              </View>
            </View>

            {/* ── Part 41.9: Text Size ── */}
            <View>
              <SectionLabel title="Text Size" icon="text-outline" />
              <View style={{ backgroundColor: COLORS.backgroundElevated, borderRadius: RADIUS.xl, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border, gap: SPACING.md }}>
                {/* Current indicator */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.lg, padding: SPACING.sm, borderWidth: 1, borderColor: COLORS.border }}>
                  <View style={{ width: 36, height: 36, borderRadius: RADIUS.md, backgroundColor: `${COLORS.primary}15`, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: COLORS.primary, fontSize: 16, fontWeight: '900' }}>A</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '700' }}>
                      {activeFontSizeLabel} · {Math.round(activeFontScale * 100)}%
                    </Text>
                    <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
                      {activeFontScale === 1.0 ? 'Default size — no override' : `All text scaled to ${Math.round(activeFontScale * 100)}%`}
                    </Text>
                  </View>
                  {activeFontScale !== 1.0 && (
                    <Pressable
                      onPress={() => onSetGlobalFontScale(1.0, fontSizeApplyAll)}
                      style={{ backgroundColor: `${COLORS.error}15`, borderRadius: RADIUS.full, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: `${COLORS.error}30` }}
                    >
                      <Text style={{ color: COLORS.error, fontSize: FONTS.sizes.xs, fontWeight: '700' }}>Reset</Text>
                    </Pressable>
                  )}
                </View>

                {/* Size preset buttons */}
                <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
                  {FONT_SIZE_OPTIONS.map(opt => {
                    const active = Math.abs(activeFontScale - opt.scale) < 0.05;
                    return (
                      <Pressable
                        key={opt.scale}
                        onPress={() => handleFontSizeSelect(opt.scale)}
                        style={{
                          flex:            1,
                          alignItems:      'center',
                          paddingVertical: SPACING.md,
                          backgroundColor: active ? `${COLORS.primary}18` : COLORS.backgroundCard,
                          borderRadius:    RADIUS.lg,
                          borderWidth:     1.5,
                          borderColor:     active ? COLORS.primary : COLORS.border,
                          gap:             4,
                        }}
                      >
                        {/* Visual "A" at different sizes */}
                        <Text style={{
                          color:      active ? COLORS.primary : COLORS.textSecondary,
                          fontSize:   opt.displaySize,
                          fontWeight: '800',
                          lineHeight: opt.displaySize + 4,
                        }}>A</Text>
                        <Text style={{
                          color:      active ? COLORS.primary : COLORS.textMuted,
                          fontSize:   9,
                          fontWeight: active ? '700' : '500',
                          textAlign:  'center',
                        }}>{opt.label}</Text>
                        {active && (
                          <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' }}>
                            <Ionicons name="checkmark" size={8} color="#FFF" />
                          </View>
                        )}
                      </Pressable>
                    );
                  })}
                </View>

                <Text style={{ color: COLORS.textMuted, fontSize: 10, fontStyle: 'italic' }}>
                  Per-field size (set via Edit tab → formatting toolbar) overrides this.
                </Text>

                {/* Apply all toggle */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: SPACING.sm, borderTopWidth: 1, borderTopColor: COLORS.border }}>
                  <View>
                    <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, fontWeight: '600' }}>Apply to all slides</Text>
                    <Text style={{ color: COLORS.textMuted, fontSize: 10 }}>Scales text across every slide</Text>
                  </View>
                  <Switch
                    value={fontSizeApplyAll}
                    onValueChange={setFontSizeApplyAll}
                    trackColor={{ false: COLORS.backgroundCard, true: `${COLORS.primary}50` }}
                    thumbColor={fontSizeApplyAll ? COLORS.primary : COLORS.textMuted}
                    ios_backgroundColor={COLORS.backgroundCard}
                  />
                </View>
              </View>
            </View>

            {/* ── Part 41.9: Text Color ── */}
            <View>
              <SectionLabel title="Text Color" icon="brush-outline" />
              <View style={{ backgroundColor: COLORS.backgroundElevated, borderRadius: RADIUS.xl, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border, gap: SPACING.md }}>
                {/* Current preview */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.md }}>
                  <View style={{
                    width:           46,
                    height:          46,
                    borderRadius:    RADIUS.md,
                    backgroundColor: currentGlobalTextColor ?? tokens.textPrimary,
                    borderWidth:     1,
                    borderColor:     COLORS.border,
                    alignItems:      'center',
                    justifyContent:  'center',
                  }}>
                    <Text style={{ color: currentGlobalTextColor ? (currentGlobalTextColor === '#FFFFFF' || currentGlobalTextColor === '#F5F5F5' ? '#333' : '#FFF') : tokens.background, fontSize: 14, fontWeight: '800' }}>Aa</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '700' }}>
                      {currentGlobalTextColor ? currentGlobalTextColor.toUpperCase() : 'Theme default'}
                    </Text>
                    <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
                      {currentGlobalTextColor ? 'Custom text color active' : 'Using theme text colors'}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', gap: SPACING.xs }}>
                    <Pressable
                      onPress={() => onOpenColorPicker('global_text_color')}
                      style={{ backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.md, padding: SPACING.sm, borderWidth: 1, borderColor: COLORS.border }}
                    >
                      <Ionicons name="color-filter-outline" size={18} color={COLORS.primary} />
                    </Pressable>
                    {currentGlobalTextColor && (
                      <Pressable
                        onPress={handleResetTextColor}
                        style={{ backgroundColor: `${COLORS.error}15`, borderRadius: RADIUS.md, padding: SPACING.sm, borderWidth: 1, borderColor: `${COLORS.error}30` }}
                      >
                        <Ionicons name="close-outline" size={18} color={COLORS.error} />
                      </Pressable>
                    )}
                  </View>
                </View>

                {/* Color swatches */}
                <SwatchRow
                  colors={TEXT_COLOR_SWATCHES}
                  selected={currentGlobalTextColor}
                  onSelect={handleTextColorSelect}
                />

                {/* Info note */}
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: `${COLORS.info}08`, borderRadius: RADIUS.lg, padding: SPACING.sm, borderWidth: 1, borderColor: `${COLORS.info}20` }}>
                  <Ionicons name="information-circle-outline" size={13} color={COLORS.info} style={{ marginTop: 1 }} />
                  <Text style={{ color: COLORS.info, fontSize: 10, flex: 1, lineHeight: 14 }}>
                    Overrides all title and body text colors. Per-field color (Edit tab) takes priority. Does not affect accent-colored elements.
                  </Text>
                </View>

                {/* Apply all toggle */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: SPACING.sm, borderTopWidth: 1, borderTopColor: COLORS.border }}>
                  <View>
                    <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, fontWeight: '600' }}>Apply to all slides</Text>
                    <Text style={{ color: COLORS.textMuted, fontSize: 10 }}>Updates text color across every slide</Text>
                  </View>
                  <Switch
                    value={textColorApplyAll}
                    onValueChange={setTextColorApplyAll}
                    trackColor={{ false: COLORS.backgroundCard, true: `${COLORS.primary}50` }}
                    thumbColor={textColorApplyAll ? COLORS.primary : COLORS.textMuted}
                    ios_backgroundColor={COLORS.backgroundCard}
                  />
                </View>
              </View>
            </View>

            {/* ── Spacing Density ── */}
            <View>
              <SectionLabel title="Spacing Density" icon="reorder-four-outline" />
              <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
                {SPACING_OPTIONS.map(opt => {
                  const active = currentSpacing === opt.id;
                  return (
                    <Pressable
                      key={opt.id}
                      onPress={() => onSetSpacing(opt.id)}
                      style={{
                        flex:            1,
                        alignItems:      'center',
                        paddingVertical: SPACING.md,
                        paddingHorizontal: SPACING.sm,
                        backgroundColor: active ? `${COLORS.primary}18` : COLORS.backgroundElevated,
                        borderRadius:    RADIUS.xl,
                        borderWidth:     1.5,
                        borderColor:     active ? COLORS.primary : COLORS.border,
                        gap:             SPACING.sm,
                      }}
                    >
                      <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: active ? `${COLORS.primary}18` : COLORS.backgroundCard, alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name={opt.icon as any} size={18} color={active ? COLORS.primary : COLORS.textMuted} />
                      </View>
                      <Text style={{ color: active ? COLORS.primary : COLORS.textSecondary, fontSize: FONTS.sizes.xs, fontWeight: active ? '700' : '500', textAlign: 'center' }}>
                        {opt.label}
                      </Text>
                      <Text style={{ color: COLORS.textMuted, fontSize: 9, textAlign: 'center', lineHeight: 12 }}>
                        {opt.description}
                      </Text>
                      {active && (
                        <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' }}>
                          <Ionicons name="checkmark" size={10} color="#FFF" />
                        </View>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* ── Font Family ── */}
            <View>
              <SectionLabel title="Font Family" icon="text-outline" />
              <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginBottom: SPACING.sm }}>
                Applied deck-wide. Affects all slides.
              </Text>
              <View style={{ gap: SPACING.sm }}>
                {FONT_OPTIONS.map(font => {
                  const active = currentFont === font.id;
                  return (
                    <Pressable
                      key={font.id}
                      onPress={() => onSetFont(font.id)}
                      style={{
                        flexDirection:   'row',
                        alignItems:      'center',
                        gap:             SPACING.md,
                        backgroundColor: active ? `${COLORS.primary}12` : COLORS.backgroundElevated,
                        borderRadius:    RADIUS.xl,
                        padding:         SPACING.md,
                        borderWidth:     1.5,
                        borderColor:     active ? COLORS.primary : COLORS.border,
                      }}
                    >
                      <View style={{
                        width:           56,
                        height:          40,
                        borderRadius:    RADIUS.md,
                        backgroundColor: active ? `${COLORS.primary}18` : COLORS.backgroundCard,
                        alignItems:      'center',
                        justifyContent:  'center',
                        borderWidth:     1,
                        borderColor:     COLORS.border,
                        flexShrink:      0,
                      }}>
                        <Text style={{
                          color:      active ? COLORS.primary : COLORS.textSecondary,
                          fontSize:   16,
                          fontWeight: '700',
                          fontFamily: font.rnFont === 'System' ? undefined : font.rnFont,
                        }}>
                          Aa
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: active ? COLORS.textPrimary : COLORS.textSecondary, fontSize: FONTS.sizes.sm, fontWeight: '700' }}>
                          {font.label}
                        </Text>
                        <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 2 }}>
                          {font.description}
                        </Text>
                        <Text style={{ color: COLORS.textMuted, fontSize: 9, marginTop: 2 }}>
                          PPTX: {font.pptxFont}
                        </Text>
                      </View>
                      {active ? (
                        <LinearGradient
                          colors={['#6C63FF', '#8B5CF6']}
                          style={{ width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                        >
                          <Ionicons name="checkmark" size={13} color="#FFF" />
                        </LinearGradient>
                      ) : (
                        <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: COLORS.border, flexShrink: 0 }} />
                      )}
                    </Pressable>
                  );
                })}
              </View>
            </View>

          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}