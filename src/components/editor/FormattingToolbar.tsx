// src/components/editor/FormattingToolbar.tsx
// Part 28 — Slide Canvas Editor: Formatting toolbar
// ─────────────────────────────────────────────────────────────────────────────
//
// A slim toolbar that floats above the keyboard when a text field is active.
//
// On iOS  → rendered inside InputAccessoryView (natively attached to keyboard)
// Android → rendered as an absolutely positioned bar that moves with keyboard
//
// Controls:
//   Bold · Italic · Font Size ▲/▼ · Align L/C/R · Color · AI Rewrite ✦
//
// The toolbar is stateless — all state lives in the useSlideEditor hook.
// Each button calls a prop callback and the hook updates state.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  InputAccessoryView,
  Platform,
  KeyboardAvoidingView,
  Keyboard,
  StyleSheet,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons }       from '@expo/vector-icons';

import { COLORS, FONTS, SPACING, RADIUS }   from '../../constants/theme';
import { AI_REWRITE_OPTIONS }               from '../../constants/editor';
import type { EditableFieldKey, FieldFormatting, TextAlignment, AIRewriteStyle } from '../../types/editor';

// ─── Constants ────────────────────────────────────────────────────────────────

export const TOOLBAR_ACCESSORY_ID = 'slide_editor_toolbar';
const TOOLBAR_H = 46;

// ─── Props ────────────────────────────────────────────────────────────────────

interface FormattingToolbarProps {
  /** Which field is currently being edited (null = toolbar hidden) */
  activeField:       EditableFieldKey | null;
  /** Current formatting for that field */
  formatting:        FieldFormatting;
  /** Whether the AI rewrite button is loading */
  isAIProcessing:    boolean;
  /** Called when user taps Bold */
  onToggleBold:      () => void;
  /** Called when user taps Italic */
  onToggleItalic:    () => void;
  /** Called when user taps Font Up */
  onFontSizeUp:      () => void;
  /** Called when user taps Font Down */
  onFontSizeDown:    () => void;
  /** Called with new alignment value */
  onSetAlignment:    (align: TextAlignment) => void;
  /** Called when user taps Color swatch */
  onOpenColorPicker: () => void;
  /** Called when user taps ✦ AI rewrite option */
  onAIRewrite:       (style: AIRewriteStyle) => void;
  /** Called when user taps Done */
  onDone:            () => void;
  /** Accent color for active-state highlights */
  accentColor?:      string;
}

// ─── Sub-component: Toolbar Button ────────────────────────────────────────────

function TBtn({
  onPress, active, disabled, children, width = 38,
}: {
  onPress:   () => void;
  active?:   boolean;
  disabled?: boolean;
  children:  React.ReactNode;
  width?:    number;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
      style={{
        width,
        height:          TOOLBAR_H,
        alignItems:      'center',
        justifyContent:  'center',
        backgroundColor: active ? `${COLORS.primary}20` : 'transparent',
        borderRadius:    RADIUS.sm,
        opacity:         disabled ? 0.35 : 1,
      }}
    >
      {children}
    </Pressable>
  );
}

// ─── Sub-component: Separator ─────────────────────────────────────────────────

function Sep() {
  return (
    <View style={{ width: 1, height: 22, backgroundColor: COLORS.border, marginHorizontal: 2 }} />
  );
}

// ─── Toolbar Content (rendered inside both iOS accessory and Android bar) ──────

function ToolbarContent({
  activeField,
  formatting,
  isAIProcessing,
  onToggleBold,
  onToggleItalic,
  onFontSizeUp,
  onFontSizeDown,
  onSetAlignment,
  onOpenColorPicker,
  onAIRewrite,
  onDone,
  accentColor = COLORS.primary,
}: FormattingToolbarProps) {
  const alignment = formatting.alignment ?? 'left';

  return (
    <View
      style={{
        flexDirection:   'row',
        alignItems:      'center',
        backgroundColor: Platform.OS === 'ios'
          ? 'rgba(18,18,42,0.97)'
          : COLORS.backgroundCard,
        borderTopWidth:  1,
        borderTopColor:  COLORS.border,
        height:          TOOLBAR_H,
        paddingHorizontal: SPACING.sm,
      }}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}
        keyboardShouldPersistTaps="always"
      >
        {/* Bold */}
        <TBtn onPress={onToggleBold} active={formatting.bold}>
          <Text style={{ color: formatting.bold ? accentColor : COLORS.textSecondary, fontSize: 15, fontWeight: '900' }}>B</Text>
        </TBtn>

        {/* Italic */}
        <TBtn onPress={onToggleItalic} active={formatting.italic}>
          <Text style={{ color: formatting.italic ? accentColor : COLORS.textSecondary, fontSize: 15, fontWeight: '700', fontStyle: 'italic' }}>I</Text>
        </TBtn>

        <Sep />

        {/* Font size down */}
        <TBtn onPress={onFontSizeDown}>
          <View style={{ alignItems: 'center', justifyContent: 'flex-end', height: 22, flexDirection: 'row', gap: 1 }}>
            <Text style={{ color: COLORS.textSecondary, fontSize: 9, fontWeight: '700', lineHeight: 11 }}>A</Text>
            <Ionicons name="arrow-down" size={9} color={COLORS.textMuted} />
          </View>
        </TBtn>

        {/* Font scale indicator */}
        <View style={{ paddingHorizontal: 4, alignItems: 'center' }}>
          <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600' }}>
            {formatting.fontScale ? `${Math.round(formatting.fontScale * 100)}%` : '100%'}
          </Text>
        </View>

        {/* Font size up */}
        <TBtn onPress={onFontSizeUp}>
          <View style={{ alignItems: 'center', justifyContent: 'flex-end', height: 22, flexDirection: 'row', gap: 1 }}>
            <Text style={{ color: COLORS.textSecondary, fontSize: 13, fontWeight: '700', lineHeight: 15 }}>A</Text>
            <Ionicons name="arrow-up" size={9} color={COLORS.textMuted} />
          </View>
        </TBtn>

        <Sep />

        {/* Alignment */}
        {(['left', 'center', 'right'] as TextAlignment[]).map(a => (
          <TBtn key={a} onPress={() => onSetAlignment(a)} active={alignment === a} width={34}>
            <Ionicons
              name={a === 'left' ? 'reorder-four-outline' : a === 'center' ? 'reorder-two-outline' : 'reorder-four-outline'}
              size={16}
              color={alignment === a ? accentColor : COLORS.textSecondary}
            />
          </TBtn>
        ))}

        <Sep />

        {/* Color picker */}
        <TBtn onPress={onOpenColorPicker} width={36}>
          <View style={{ position: 'relative', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="text-outline" size={16} color={COLORS.textSecondary} />
            <View style={{
              position:        'absolute',
              bottom:          -2,
              width:           16,
              height:          3,
              borderRadius:    1.5,
              backgroundColor: formatting.color ?? accentColor,
            }} />
          </View>
        </TBtn>

        <Sep />

        {/* AI Rewrite options */}
        {AI_REWRITE_OPTIONS.map(opt => (
          <Pressable
            key={opt.id}
            onPress={() => onAIRewrite(opt.id)}
            disabled={isAIProcessing}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            style={{ opacity: isAIProcessing ? 0.5 : 1 }}
          >
            <LinearGradient
              colors={opt.gradient}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={{
                flexDirection:   'row',
                alignItems:      'center',
                gap:             4,
                borderRadius:    RADIUS.full,
                paddingHorizontal: 9,
                height:          28,
                marginHorizontal: 2,
              }}
            >
              <Ionicons name={opt.icon as any} size={11} color="#FFF" />
              <Text style={{ color: '#FFF', fontSize: 10, fontWeight: '700' }}>{opt.label}</Text>
            </LinearGradient>
          </Pressable>
        ))}
      </ScrollView>

      {/* Done button — always visible on the right */}
      <Pressable
        onPress={onDone}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        style={{
          paddingHorizontal: 12,
          paddingVertical:   6,
          backgroundColor:   `${accentColor}18`,
          borderRadius:      RADIUS.full,
          borderWidth:       1,
          borderColor:       `${accentColor}35`,
          marginLeft:        SPACING.sm,
        }}
      >
        <Text style={{ color: accentColor, fontSize: FONTS.sizes.sm, fontWeight: '700' }}>Done</Text>
      </Pressable>
    </View>
  );
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export function FormattingToolbar(props: FormattingToolbarProps) {
  // On iOS: use InputAccessoryView so the toolbar is natively glued to keyboard
  if (Platform.OS === 'ios') {
    return (
      <InputAccessoryView nativeID={TOOLBAR_ACCESSORY_ID}>
        <ToolbarContent {...props} />
      </InputAccessoryView>
    );
  }

  // On Android: render inline — the parent screen uses KeyboardAvoidingView
  // so this bar will appear above the keyboard when visible
  if (!props.activeField) return null;

  return (
    <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}>
      <ToolbarContent {...props} />
    </View>
  );
}