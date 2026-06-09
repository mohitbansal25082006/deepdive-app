// src/constants/streamChatTheme.ts
// Part 49 — Stream Chat DeepDive Dark Theme
// Part 50 — Removed inlineDateSeparator styling (now handled by ChatDateSeparator component)
//           Send button circle removed, all other theming preserved.

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
  // Part 50: inlineDateSeparator is now a fully custom component (ChatDateSeparator)
  // passed via the Channel InlineDateSeparator prop. We leave minimal styling here
  // as a fallback in case the component prop doesn't apply in some contexts.
  inlineDateSeparator: {
    container: {
      backgroundColor:   'transparent',
      paddingVertical:   2,
      paddingHorizontal: 0,
      alignSelf:         'stretch',
    },
    text: {
      color:    'transparent', // hidden — ChatDateSeparator renders its own text
      fontSize: 0,
    },
  },

  // ── Input bar ─────────────────────────────────────────────────────────────────
  // Part 50: Send button circle removed (transparent background, no border radius effect)
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
    sendButton: {
      backgroundColor: 'transparent',
      width:           40,
      height:          40,
      borderRadius:    0,
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