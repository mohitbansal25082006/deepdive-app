// src/constants/streamChatTheme.ts
// Part 49 — Stream Chat DeepDive Dark Theme
// Part 50 — Removed inlineDateSeparator styling (now handled by ChatDateSeparator)
//           Send button circle removed, all other theming preserved.
// Part 50.2 — Gallery + Giphy dark overrides.
//           Exact v8 giphy fields from TS error:
//             buttonContainer, cancel, container, giphy, giphyContainer,
//             giphyHeaderText, giphyMask, giphyMaskText, cancel,
//             title, selectionContainer, shuffleButton
//           gallery lives at messageSimple.gallery
//           imageGallery is a valid top-level key
// Part 50.4 — text_high_emphasis for poll back-button visibility on dark bg.

import type { DeepPartial, Theme } from 'stream-chat-expo';
import { COLORS, FONTS, RADIUS } from './theme';

export const streamChatTheme: DeepPartial<Theme> = {
  // ── Global colors ─────────────────────────────────────────────────────────────
  colors: {
    black:                COLORS.textPrimary,
    white:                COLORS.background,
    grey:                 COLORS.textMuted,
    grey_gainsboro:       COLORS.border,
    grey_whisper:         COLORS.backgroundCard,
    white_smoke:          COLORS.backgroundElevated,
    white_snow:           COLORS.backgroundCard,
    accent_blue:          COLORS.primary,
    accent_green:         COLORS.success,
    accent_red:           COLORS.error,
    bg_gradient_start:    COLORS.backgroundCard,
    bg_gradient_end:      COLORS.backgroundElevated,
    grey_dark:            COLORS.textSecondary,
    overlay:              'rgba(0,0,0,0.75)',
    text_high_emphasis:   COLORS.textPrimary,
    text_low_emphasis:    COLORS.textSecondary,
  },

  // ── Avatar ────────────────────────────────────────────────────────────────────
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

    // ── Gallery — inline image/GIF thumbnails in MessageList ──────────────────
    // GIFs from ChatGifPicker are sent as image attachments and rendered here.
    gallery: {
      imageContainer: {
        backgroundColor: 'transparent',
        borderRadius:    RADIUS.md,
        overflow:        'hidden',
      },
      image: {
        borderRadius: RADIUS.md,
      },
      moreImagesContainer: {
        backgroundColor: 'rgba(0,0,0,0.55)',
        borderRadius:    RADIUS.md,
      },
      moreImagesText: {
        color:      '#FFFFFF',
        fontWeight: '700',
      },
    },

    // ── Giphy — built-in /giphy slash command card ────────────────────────────
    // Valid v8 fields from TS error:
    //   buttonContainer, cancel, container, giphy (ImageStyle),
    //   giphyContainer, giphyHeaderText, title + more
    giphy: {
      // Outer card wrapper
      container: {
        backgroundColor: COLORS.backgroundCard,
        borderRadius:    RADIUS.xl,
        borderWidth:     1,
        borderColor:     COLORS.border,
        overflow:        'hidden',
      },
      // The GIF image itself
      giphy: {
        borderRadius: RADIUS.lg,
      },
      // Container holding the GIF image
      giphyContainer: {
        backgroundColor: COLORS.backgroundElevated,
      },
      // "via GIPHY" header text
      giphyHeaderText: {
        color:    COLORS.textMuted,
        fontSize: FONTS.sizes.xs,
      },
      // Action buttons row (Shuffle, Cancel, Send)
      buttonContainer: {
        backgroundColor: COLORS.backgroundElevated,
        borderTopColor:  COLORS.border,
        borderTopWidth:  1,
      },
      // Cancel button text
      cancel: {
        color: COLORS.textSecondary,
      },
      // Card title text
      title: {
        color:      COLORS.textPrimary,
        fontWeight: '700',
      },
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

  // ── Inline date separator ─────────────────────────────────────────────────────
  // Hidden — we use ChatDateSeparator component instead.
  inlineDateSeparator: {
    container: {
      backgroundColor:   'transparent',
      paddingVertical:   2,
      paddingHorizontal: 0,
      alignSelf:         'stretch',
    },
    text: {
      color:    'transparent',
      fontSize: 0,
    },
  },

  // ── Message input bar ─────────────────────────────────────────────────────────
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

  // ── Image gallery — full-screen lightbox (top-level key) ─────────────────────
  imageGallery: {
    backgroundColor: '#000000',
    footer: {
      container: {
        backgroundColor: 'rgba(0,0,0,0.85)',
      },
    },
    header: {
      container: {
        backgroundColor: 'rgba(0,0,0,0.85)',
      },
      usernameText: {
        color: COLORS.textPrimary,
      },
      dateText: {
        color: COLORS.textMuted,
      },
    },
    grid: {
      container: {
        backgroundColor: COLORS.background,
      },
      handleText: {
        color: COLORS.textPrimary,
      },
    },
  },

  // ── Reply / quoted message ────────────────────────────────────────────────────
  reply: {
    container: {
      backgroundColor: COLORS.backgroundCard,
      borderLeftColor: COLORS.primary,
      borderRadius:    RADIUS.md,
    },
  },

  // ── Poll — dark theme ─────────────────────────────────────────────────────────
  poll: {

    message: {
      container: {
        backgroundColor: COLORS.backgroundCard,
        borderRadius:    RADIUS.xl,
        borderWidth:     1,
        borderColor:     COLORS.border,
        overflow:        'hidden',
      },
      header: {
        title: {
          color:      COLORS.textPrimary,
          fontWeight: '700',
          fontSize:   FONTS.sizes.base,
        },
        subtitle: {
          color:    COLORS.textSecondary,
          fontSize: FONTS.sizes.xs,
        },
      },
      option: {
        wrapper: {
          marginVertical: 3,
          borderRadius:   RADIUS.md,
          overflow:       'hidden',
        },
        container: {
          backgroundColor:   COLORS.backgroundElevated,
          borderRadius:      RADIUS.md,
          borderWidth:       1,
          borderColor:       COLORS.border,
          paddingHorizontal: 12,
          paddingVertical:   10,
        },
        text: {
          color:    COLORS.textPrimary,
          fontSize: FONTS.sizes.sm,
        },
        progressBar: {
          borderRadius: RADIUS.sm,
          overflow:     'hidden',
          height:       4,
          marginTop:    6,
        },
        progressBarEmptyFill:  COLORS.border,
        progressBarVotedFill:  COLORS.primary,
        progressBarWinnerFill: COLORS.success,
        voteButtonContainer: {
          borderRadius:   RADIUS.full,
          borderWidth:    1.5,
          borderColor:    COLORS.border,
          width:          22,
          height:         22,
          alignItems:     'center',
          justifyContent: 'center',
        },
        voteButtonActive:   COLORS.primary,
        voteButtonInactive: COLORS.textMuted,
        votesContainer: {
          marginTop: 4,
        },
      },
      optionsWrapper: {
        marginTop: 8,
      },
    },

    results: {
      container: {
        backgroundColor: COLORS.background,
        flex:            1,
      },
      scrollView: {
        backgroundColor: COLORS.background,
      },
      title: {
        color:      COLORS.textPrimary,
        fontWeight: '800',
        fontSize:   FONTS.sizes.lg,
      },
      item: {
        container: {
          backgroundColor: COLORS.backgroundCard,
          borderRadius:    RADIUS.lg,
          borderWidth:     1,
          borderColor:     COLORS.border,
          marginVertical:  4,
          overflow:        'hidden',
        },
        headerContainer: {
          flexDirection:     'row',
          alignItems:        'center',
          justifyContent:    'space-between',
          paddingHorizontal: 14,
          paddingVertical:   10,
          borderBottomColor: `${COLORS.border}60`,
          borderBottomWidth: 1,
        },
        title: {
          color:      COLORS.textPrimary,
          fontWeight: '600',
          fontSize:   FONTS.sizes.sm,
        },
        voteCount: {
          color:      COLORS.primary,
          fontWeight: '700',
          fontSize:   FONTS.sizes.sm,
        },
      },
      vote: {
        container: {
          backgroundColor:   COLORS.backgroundElevated,
          paddingHorizontal: 14,
          paddingVertical:   8,
          borderBottomColor: `${COLORS.border}40`,
          borderBottomWidth: 1,
        },
        userName: {
          color:    COLORS.textSecondary,
          fontSize: FONTS.sizes.xs,
        },
        dateText: {
          color:    COLORS.textMuted,
          fontSize: FONTS.sizes.xs,
        },
      },
    },

    fullResults: {
      container:        { backgroundColor: COLORS.background },
      contentContainer: { backgroundColor: COLORS.background },
      headerContainer: {
        backgroundColor:   COLORS.backgroundCard,
        borderBottomColor: COLORS.border,
        borderBottomWidth: 1,
      },
      headerText: {
        color:      COLORS.textPrimary,
        fontWeight: '800',
        fontSize:   FONTS.sizes.lg,
      },
    },

    button: {
      container: {
        backgroundColor: `${COLORS.primary}15`,
        borderRadius:    RADIUS.lg,
        borderWidth:     1,
        borderColor:     `${COLORS.primary}35`,
        paddingVertical: 10,
        alignItems:      'center',
        marginTop:       8,
      },
      text: {
        color:      COLORS.primary,
        fontWeight: '700',
        fontSize:   FONTS.sizes.sm,
      },
    },

    modalHeader: {
      container: {
        backgroundColor:   COLORS.backgroundCard,
        borderBottomColor: COLORS.border,
        borderBottomWidth: 1,
      },
      title: {
        color:      COLORS.textPrimary,
        fontWeight: '800',
      },
    },

    allOptions: {
      wrapper:      { backgroundColor: COLORS.background, flex: 1 },
      listContainer: { backgroundColor: COLORS.background },
      titleContainer: {
        borderBottomColor: COLORS.border,
        borderBottomWidth: 1,
        backgroundColor:   COLORS.backgroundCard,
      },
      titleText: { color: COLORS.textPrimary, fontWeight: '800' },
    },

    inputDialog: {
      transparentContainer: { backgroundColor: 'rgba(0,0,0,0.7)' },
      container: {
        backgroundColor: COLORS.backgroundCard,
        borderRadius:    RADIUS.xl,
        borderWidth:     1,
        borderColor:     COLORS.border,
      },
      title:  { color: COLORS.textPrimary, fontWeight: '700' },
      input: {
        color:           COLORS.textPrimary,
        backgroundColor: COLORS.backgroundElevated,
        borderRadius:    RADIUS.md,
        borderWidth:     1,
        borderColor:     COLORS.border,
      },
      button:          { color: COLORS.primary, fontWeight: '700' },
      buttonContainer: { borderTopColor: COLORS.border, borderTopWidth: 1 },
    },

    answersList: {
      container:       { backgroundColor: COLORS.background, flex: 1 },
      buttonContainer: { borderTopColor: COLORS.border, borderTopWidth: 1 },
      item: {
        container: {
          backgroundColor:   COLORS.backgroundCard,
          borderRadius:      RADIUS.md,
          borderWidth:       1,
          borderColor:       COLORS.border,
          marginVertical:    4,
          paddingHorizontal: 12,
          paddingVertical:   10,
        },
        infoContainer:     {},
        userInfoContainer: {},
        answerText: { color: COLORS.textPrimary, fontSize: FONTS.sizes.sm },
      },
    },

    createContent: {
      scrollView:      { backgroundColor: COLORS.background },
      headerContainer: {
        backgroundColor:   COLORS.backgroundCard,
        borderBottomColor: COLORS.border,
        borderBottomWidth: 1,
      },
      name: {
        title: { color: COLORS.textSecondary, fontSize: FONTS.sizes.xs },
        input: {
          color:           COLORS.textPrimary,
          backgroundColor: COLORS.backgroundElevated,
          borderRadius:    RADIUS.md,
          borderWidth:     1,
          borderColor:     COLORS.border,
        },
      },
      pollOptions: {
        container: {},
        title: { color: COLORS.textSecondary, fontSize: FONTS.sizes.xs },
        optionStyle: {
          wrapper: {
            backgroundColor: COLORS.backgroundElevated,
            borderRadius:    RADIUS.md,
            borderWidth:     1,
            borderColor:     COLORS.border,
          },
          input:               { color: COLORS.textPrimary },
          validationErrorText: { color: COLORS.error },
        },
        addOption: {
          wrapper: {},
          text:    { color: COLORS.primary, fontWeight: '700' },
        },
      },
      multipleAnswers: { wrapper: {}, row: {}, title: { color: COLORS.textPrimary } },
      anonymousPoll:   { wrapper: {}, title: { color: COLORS.textPrimary } },
      maxVotes: {
        wrapper: {},
        input:          { color: COLORS.textPrimary, backgroundColor: COLORS.backgroundElevated },
        validationText: { color: COLORS.error },
      },
      suggestOption: { wrapper: {}, title: { color: COLORS.textPrimary } },
      addComment:    { wrapper: {}, title: { color: COLORS.textPrimary } },
      sendButton:    { backgroundColor: COLORS.primary, borderRadius: RADIUS.lg },
    },
  },
};