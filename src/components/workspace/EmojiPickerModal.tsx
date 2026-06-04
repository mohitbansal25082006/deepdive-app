// src/components/workspace/EmojiPickerModal.tsx
// Part 47 — Full emoji picker using rn-emoji-keyboard
// Part 48  — allowMultipleSelections; no auto-close
// Part 48b — 45% height + multiple selection
// Part 48e — FIX: True multiple emoji selection.
//   The rn-emoji-keyboard library's `allowMultipleSelections` prop prevents
//   the built-in close-on-select behaviour. However, some versions still close
//   because the parent was calling onClose in onEmojiSelected.
//   Fix: onEmojiSelected never calls onClose. The picker only closes when:
//     • User taps the emoji button again (parent calls setShowEmojiPicker(false))
//     • User swipes down on the bottom sheet
//     • User taps the backdrop
//   This gives true multi-emoji selection: tap 👍 then ❤️ then 😂 without
//   the picker closing between each tap.

import React, { useCallback } from 'react';
import EmojiPicker, { type EmojiType } from 'rn-emoji-keyboard';
import { COLORS } from '../../constants/theme';

interface Props {
  open:            boolean;
  onEmojiSelected: (emoji: string) => void;
  onClose:         () => void;
}

export function EmojiPickerModal({ open, onEmojiSelected, onClose }: Props) {
  // Part 48e: Never call onClose here — let the picker stay open for
  // the next emoji tap. The parent closes it via the emoji button toggle.
  const handlePick = useCallback(
    (emojiData: EmojiType) => {
      onEmojiSelected(emojiData.emoji);
      // Intentionally NOT calling onClose here.
      // allowMultipleSelections keeps the sheet open automatically.
    },
    [onEmojiSelected],
  );

  return (
    <EmojiPicker
      onEmojiSelected={handlePick}
      open={open}
      onClose={onClose}
      // ── Part 48e: Keep picker open after every selection ──────────────
      allowMultipleSelections
      // ── Height: 45% leaves room for chat + input above ────────────────
      defaultHeight="45%"
      expandable={false}
      // ── Features ─────────────────────────────────────────────────────
      enableSearchBar
      enableCategoryChangeAnimation
      enableRecentlyUsed
      // ── Dark theme ───────────────────────────────────────────────────
      theme={{
        backdrop:           'rgba(0,0,0,0.35)',
        knob:               COLORS.primary,
        container:          COLORS.backgroundCard,
        header:             COLORS.textPrimary,
        skinTonesContainer: COLORS.backgroundElevated,
        category: {
          icon:            COLORS.textMuted,
          iconActive:      '#FFFFFF',
          container:       COLORS.backgroundCard,
          containerActive: COLORS.primary,
        },
        search: {
          background:  COLORS.backgroundElevated,
          placeholder: COLORS.textMuted,
          text:        COLORS.textPrimary,
          icon:        COLORS.textMuted,
        },
      }}
    />
  );
}