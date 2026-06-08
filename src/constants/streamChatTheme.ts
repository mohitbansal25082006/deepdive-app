// src/constants/streamChatTheme.ts
// Part 49 — Stream Chat DeepDive Dark Theme
// Part 50 FIXES:
//   FIX 1.1: Date chip ("Today") was getting squeezed — added alignSelf, minWidth,
//             flexShrink:0 so the pill never collapses.
//   FIX 1.2: Blue circle behind the send button removed — Stream's default theme
//             wraps the send icon in a coloured circle via sendButtonContainer. We
//             override both sendButton AND the container background to transparent,
//             then give the icon its own tinted background only (no double ring).
//   UNCHANGED: All other keys remain from the verified Part 49 implementation.

import type { DeepPartial, Theme } from 'stream-chat-expo';
import { COLORS, FONTS, RADIUS } from './theme';

export const streamChatTheme: DeepPartial<Theme> = {
  // ── Colors ───────────────────────────────────────────────────────────────────
  colors: {
    black:             COLORS.textPrimary,
    white:             COLORS.background,
    grey:              COLORS.textMuted,
    grey_gainsboro:    COLORS.border,
    grey_whisper:      COLORS.backgroundCard,
    white_smoke:       COLORS.backgroundElevated,
    white_snow:        COLORS.backgroundCard,
    accent_blue:       COLORS.primary,
    accent_green:      COLORS.success,
    accent_red:        COLORS.error,
    bg_gradient_start: COLORS.backgroundCard,
    bg_gradient_end:   COLORS.backgroundElevated,
    grey_dark:         COLORS.textSecondary,
    overlay:           'rgba(0,0,0,0.75)',
  },

  // ── Avatar ───────────────────────────────────────────────────────────────────
  avatar: {
    BASE_AVATAR_SIZE: 32,
  },

  // ── Message bubble ────────────────────────────────────────────────────────────
  messageSimple: {
    content: {
      containerInner: {
        backgroundColor:         COLORS.primary,
        borderRadius:            RADIUS.xl,
        borderBottomRightRadius: 4,
      },
      receiverMessageBackgroundColor: COLORS.backgroundElevated,
      senderMessageBackgroundColor:   COLORS.primary,
    },
  },

  // ── Message list ──────────────────────────────────────────────────────────────
  messageList: {
    contentContainer: {
      backgroundColor: COLORS.background,
    },
    typingIndicatorContainer: {
      borderTopColor: COLORS.border,
    },
  },

  // ── Date separator ────────────────────────────────────────────────────────────
  // FIX 1.1: Stream renders the date chip inside a flex row that squeezes it.
  // alignSelf:'center' keeps it centred without stretching; minWidth ensures the
  // pill is never narrower than its text; flexShrink:0 prevents it from collapsing.
  inlineDateSeparator: {
    container: {
      backgroundColor:  COLORS.backgroundCard,
      borderRadius:     RADIUS.full,
      borderWidth:      1,
      borderColor:      COLORS.border,
      paddingVertical:  4,
      paddingHorizontal: 14,
      alignSelf:        'center',   // ← FIX: don't stretch to fill row
      minWidth:         64,         // ← FIX: never collapse below "Today" width
      flexShrink:       0,          // ← FIX: don't shrink under flex pressure
      alignItems:       'center',
    },
    text: {
      color:      COLORS.textMuted,
      fontSize:   11,
      fontWeight: '600',
      textAlign:  'center',         // ← centre text inside the pill
    },
  },

  // ── Input bar ─────────────────────────────────────────────────────────────────
  // FIX 1.2: Stream wraps the send icon in a circle via the sendButton style.
  // Setting backgroundColor:'transparent' on BOTH sendButton (the touchable) and
  // messageInput.container removes the unwanted blue ring. The icon itself is
  // already coloured via colors.accent_blue above, so no further styling needed.
  messageInput: {
    container: {
      backgroundColor: COLORS.backgroundCard,
      borderTopColor:  COLORS.border,
      borderTopWidth:  1,
    },
    inputBoxContainer: {
      backgroundColor:   COLORS.backgroundElevated,
      borderRadius:      RADIUS.xl,
      borderWidth:       1,
      borderColor:       COLORS.border,
      paddingHorizontal: 4,
    },
    // FIX 1.2 — remove the blue circle that wraps the send arrow.
    // Stream's default style gives this a solid accent_blue background with
    // borderRadius:20 creating the circle. We clear it entirely.
    sendButton: {
      backgroundColor: 'transparent',  // ← FIX: no circle
      width:           40,
      height:          40,
      borderRadius:    0,              // ← FIX: no circular clip
      alignItems:      'center',
      justifyContent:  'center',
    },
  },

  // ── Image gallery ─────────────────────────────────────────────────────────────
  imageGallery: {
    backgroundColor: '#000000',
  },

  // ── Reply / quoted message preview ────────────────────────────────────────────
  reply: {
    container: {
      backgroundColor: COLORS.backgroundCard,
      borderLeftColor: COLORS.primary,
      borderRadius:    RADIUS.md,
    },
  },
};