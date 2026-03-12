// src/components/workspace/CommentInput.tsx
// Redesigned bottom comment composer — cleaner, tighter, better UX.

import React, { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';

interface Props {
  sectionTitle?:  string;
  isSending:      boolean;
  onSubmit:       (text: string) => void;
  onClearSection: () => void;
}

export function CommentInput({ sectionTitle, isSending, onSubmit, onClearSection }: Props) {
  const [text,    setText]    = useState('');
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed || isSending) return;
    onSubmit(trimmed);
    setText('');
  };

  const canSend = text.trim().length > 0 && !isSending;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <View style={[styles.container, focused && styles.containerFocused]}>

        {/* Section banner */}
        {sectionTitle ? (
          <Animated.View
            entering={FadeIn.duration(180)}
            exiting={FadeOut.duration(180)}
            style={styles.sectionBanner}
          >
            <Ionicons name="bookmark" size={11} color={COLORS.primary} />
            <Text style={styles.sectionBannerText} numberOfLines={1}>
              {sectionTitle}
            </Text>
            <TouchableOpacity
              onPress={onClearSection}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={{ marginLeft: 'auto' }}
            >
              <Ionicons name="close-circle" size={15} color={COLORS.textMuted} />
            </TouchableOpacity>
          </Animated.View>
        ) : null}

        {/* Input row */}
        <View style={styles.inputRow}>
          <View style={[styles.inputWrap, focused && styles.inputWrapFocused]}>
            <TextInput
              ref={inputRef}
              value={text}
              onChangeText={setText}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder={
                sectionTitle
                  ? `Comment on this section…`
                  : 'Add a comment…'
              }
              placeholderTextColor={COLORS.textMuted}
              style={styles.input}
              multiline
              maxLength={2000}
            />
          </View>

          <TouchableOpacity
            onPress={handleSubmit}
            disabled={!canSend}
            activeOpacity={0.8}
            style={[styles.sendBtn, canSend ? styles.sendBtnActive : styles.sendBtnInactive]}
          >
            <Ionicons
              name={isSending ? 'hourglass-outline' : 'send'}
              size={17}
              color={canSend ? '#FFF' : COLORS.textMuted}
            />
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.backgroundCard,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  containerFocused: {
    borderTopColor: `${COLORS.primary}40`,
  },

  // Section banner
  sectionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: `${COLORS.primary}12`,
    borderRadius: RADIUS.md,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: `${COLORS.primary}25`,
  },
  sectionBannerText: {
    color: COLORS.primary,
    fontSize: FONTS.sizes.xs,
    fontWeight: '600',
    flex: 1,
  },

  // Input row
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  inputWrap: {
    flex: 1,
    backgroundColor: COLORS.backgroundElevated,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    paddingVertical: 9,
    minHeight: 42,
    maxHeight: 110,
  },
  inputWrapFocused: {
    borderColor: `${COLORS.primary}50`,
    backgroundColor: `${COLORS.primary}06`,
  },
  input: {
    color: COLORS.textPrimary,
    fontSize: FONTS.sizes.sm,
    lineHeight: 20,
    padding: 0,
  },

  // Send button
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  sendBtnActive: {
    backgroundColor: COLORS.primary,
  },
  sendBtnInactive: {
    backgroundColor: COLORS.backgroundElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
});