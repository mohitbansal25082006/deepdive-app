// src/components/workspace/EmojiPickerModal.tsx
// Part 47 — Full emoji picker using rn-emoji-keyboard (~1500 emojis).
//
// Replaces the old 8-emoji quick bar in ChatInput with a full bottom-sheet
// emoji keyboard featuring:
//   • All emoji categories (smileys, people, animals, food, travel, activities, objects, symbols, flags)
//   • Skin tone selector
//   • Search bar
//   • Dark theme matching DeepDive color scheme
//   • Expandable from 50% → 80% screen height
//
// Usage:
//   <EmojiPickerModal
//     open={showPicker}
//     onEmojiSelected={(emoji) => setText(t => t + emoji)}
//     onClose={() => setShowPicker(false)}
//   />
//
// Install: npm install rn-emoji-keyboard --legacy-peer-deps

import React, { useCallback } from 'react';
import EmojiPicker, { type EmojiType } from 'rn-emoji-keyboard';
import { COLORS } from '../../constants/theme';

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  /** Whether the emoji picker bottom sheet is open */
  open: boolean;
  /** Called with the selected emoji character (e.g. "😂") — picker stays open for multiple picks */
  onEmojiSelected: (emoji: string) => void;
  /** Called when user dismisses the picker */
  onClose: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function EmojiPickerModal({ open, onEmojiSelected, onClose }: Props) {
  const handlePick = useCallback(
    (emojiData: EmojiType) => {
      onEmojiSelected(emojiData.emoji);
      // Don't auto-close so users can quickly pick multiple emojis if desired.
      // Close is handled by onClose / backdrop tap / swipe down.
    },
    [onEmojiSelected],
  );

  return (
    <EmojiPicker
      onEmojiSelected={handlePick}
      open={open}
      onClose={onClose}
      // ── Features ──────────────────────────────────────────────────────────
      enableSearchBar
      enableCategoryChangeAnimation
      enableRecentlyUsed
      allowMultipleSelections
      // ── Layout ────────────────────────────────────────────────────────────
      defaultHeight="50%"
      expandable
      expandedHeight="80%"
      // ── Dark theme matching DeepDive ─────────────────────────────────────
      theme={{
        backdrop:           'rgba(0,0,0,0.6)',
        knob:               COLORS.primary,        // top-level only
        container:          COLORS.backgroundCard,
        header:             COLORS.textPrimary,
        skinTonesContainer: COLORS.backgroundElevated,
        category: {
          // Only 4 valid keys: icon, iconActive, container, containerActive
          icon:            COLORS.textMuted,
          iconActive:      '#FFFFFF',
          container:       COLORS.backgroundCard,
          containerActive: COLORS.primary,
          // Removed: shadow (not in type), knob (top-level only)
        },
        search: {
          background:  COLORS.backgroundElevated,
          placeholder: COLORS.textMuted,           // color of placeholder text
          text:        COLORS.textPrimary,
          icon:        COLORS.textMuted,
        },
      }}
    />
  );
}