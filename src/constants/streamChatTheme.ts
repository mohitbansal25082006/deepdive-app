// src/constants/streamChatTheme.ts
// Part 49 — Stream Chat DeepDive Dark Theme
// Part 50 — Removed inlineDateSeparator, send button styling.
// Part 50.2 — Gallery + Giphy dark overrides.
// Part 50.4 CHANGES:
//   1. Reaction overlay: dark-readable background colors so emoji reactions
//      are clearly visible on the dark chat background.
//   2. Gallery: GIF auto-sizing — removed fixed height constraints so vertical
//      long/short GIFs scale to their natural aspect ratio and show fully.

import type { DeepPartial, Theme } from 'stream-chat-expo';
import { COLORS, FONTS, RADIUS } from './theme';

export const streamChatTheme: DeepPartial<Theme> = {
  // ── Global colors ─────────────────────────────────────────────────────────────
  colors: {
    black:              COLORS.textPrimary,
    white:              COLORS.background,
    grey:               COLORS.textMuted,
    grey_gainsboro:     COLORS.border,
    grey_whisper:       COLORS.backgroundCard,
    white_smoke:        COLORS.backgroundElevated,
    white_snow:         COLORS.backgroundCard,
    accent_blue:        COLORS.primary,
    accent_green:       COLORS.success,
    accent_red:         COLORS.error,
    bg_gradient_start:  COLORS.backgroundCard,
    bg_gradient_end:    COLORS.backgroundElevated,
    grey_dark:          COLORS.textSecondary,
    overlay:            'rgba(0,0,0,0.75)',
    text_high_emphasis: COLORS.textPrimary,
    text_low_emphasis:  COLORS.textSecondary,
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
    // Fix: images must resize correctly without needing a remount.
    //
    // ROOT CAUSE of image sizing only working after remount:
    //   Stream's Gallery component reads original_width/original_height from the
    //   attachment to compute aspectRatio for the image container. For uploaded
    //   images, these fields are added by Stream's CDN server-side AFTER the
    //   message is first received — so on first render the dimensions are missing
    //   and Stream falls back to a fixed default height. The message.updated event
    //   fires with the real dimensions but the Gallery's memoized container height
    //   doesn't update. On remount, Stream re-reads the stored message (now with
    //   dimensions) and sizes correctly.
    //
    // FIX: Override the image style to use width:'100%' and aspectRatio:1 as
    //   fallback, with resizeMode:'contain'. This forces the Image component to
    //   always size itself from its actual loaded pixels rather than relying on
    //   the pre-computed container height from attachment metadata. The container
    //   has no fixed height so it grows to fit the image naturally.
    gallery: {
      imageContainer: {
        backgroundColor: 'transparent',
        borderRadius:    RADIUS.md,
        overflow:        'hidden',
        // No fixed height — container sizes to the image content
      },
      image: {
        borderRadius: RADIUS.md,
        width:        '100%' as any,
        // aspectRatio not forced — image loads at its natural size
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
    giphy: {
      container: {
        backgroundColor: COLORS.backgroundCard,
        borderRadius:    RADIUS.xl,
        borderWidth:     1,
        borderColor:     COLORS.border,
        overflow:        'hidden',
      },
      giphy: {
        borderRadius: RADIUS.lg,
      },
      giphyContainer: {
        backgroundColor: COLORS.backgroundElevated,
      },
      giphyHeaderText: {
        color:    COLORS.textMuted,
        fontSize: FONTS.sizes.xs,
      },
      buttonContainer: {
        backgroundColor: COLORS.backgroundElevated,
        borderTopColor:  COLORS.border,
        borderTopWidth:  1,
      },
      cancel: {
        color: COLORS.textSecondary,
      },
      title: {
        color:      COLORS.textPrimary,
        fontWeight: '700',
      },
    },

    // ── Part 50.4: Reaction picker overlay — dark-readable ───────────────────
    // The default Stream reaction picker uses near-white backgrounds which are
    // invisible on dark themes. Override with a solid dark card background so
    // emojis are clearly visible.
    reactionListTop: {
      container: {
        backgroundColor:  COLORS.backgroundCard,
        borderRadius:     RADIUS.full,
        borderWidth:      1,
        borderColor:      COLORS.border,
        paddingHorizontal: 4,
        paddingVertical:   2,
        // Drop shadow for depth on dark bg
        shadowColor:      '#000',
        shadowOffset:     { width: 0, height: 2 },
        shadowOpacity:    0.4,
        shadowRadius:     8,
        elevation:        8,
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

  // ── Inline date separator — hidden, using custom ChatDateSeparator ────────────
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

  // ── Image gallery — full-screen lightbox ─────────────────────────────────────
  imageGallery: {
    backgroundColor: '#000000',
    footer: {
      container: { backgroundColor: 'rgba(0,0,0,0.85)' },
    },
    header: {
      container:    { backgroundColor: 'rgba(0,0,0,0.85)' },
      usernameText: { color: COLORS.textPrimary },
      dateText:     { color: COLORS.textMuted },
    },
    grid: {
      container:  { backgroundColor: COLORS.background },
      handleText: { color: COLORS.textPrimary },
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
        title:    { color: COLORS.textPrimary, fontWeight: '700', fontSize: FONTS.sizes.base },
        subtitle: { color: COLORS.textSecondary, fontSize: FONTS.sizes.xs },
      },
      option: {
        wrapper:   { marginVertical: 3, borderRadius: RADIUS.md, overflow: 'hidden' },
        container: { backgroundColor: COLORS.backgroundElevated, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 12, paddingVertical: 10 },
        text:      { color: COLORS.textPrimary, fontSize: FONTS.sizes.sm },
        progressBar:             { borderRadius: RADIUS.sm, overflow: 'hidden', height: 4, marginTop: 6 },
        progressBarEmptyFill:    COLORS.border,
        progressBarVotedFill:    COLORS.primary,
        progressBarWinnerFill:   COLORS.success,
        voteButtonContainer:     { borderRadius: RADIUS.full, borderWidth: 1.5, borderColor: COLORS.border, width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
        voteButtonActive:        COLORS.primary,
        voteButtonInactive:      COLORS.textMuted,
        votesContainer:          { marginTop: 4 },
      },
      optionsWrapper: { marginTop: 8 },
    },

    results: {
      container:  { backgroundColor: COLORS.background, flex: 1 },
      scrollView: { backgroundColor: COLORS.background },
      title:      { color: COLORS.textPrimary, fontWeight: '800', fontSize: FONTS.sizes.lg },
      item: {
        container: { backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, marginVertical: 4, overflow: 'hidden' },
        headerContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10, borderBottomColor: `${COLORS.border}60`, borderBottomWidth: 1 },
        title:     { color: COLORS.textPrimary, fontWeight: '600', fontSize: FONTS.sizes.sm },
        voteCount: { color: COLORS.primary, fontWeight: '700', fontSize: FONTS.sizes.sm },
      },
      vote: {
        container: { backgroundColor: COLORS.backgroundElevated, paddingHorizontal: 14, paddingVertical: 8, borderBottomColor: `${COLORS.border}40`, borderBottomWidth: 1 },
        userName:  { color: COLORS.textSecondary, fontSize: FONTS.sizes.xs },
        dateText:  { color: COLORS.textMuted, fontSize: FONTS.sizes.xs },
      },
    },

    fullResults: {
      container:        { backgroundColor: COLORS.background },
      contentContainer: { backgroundColor: COLORS.background },
      headerContainer:  { backgroundColor: COLORS.backgroundCard, borderBottomColor: COLORS.border, borderBottomWidth: 1 },
      headerText:       { color: COLORS.textPrimary, fontWeight: '800', fontSize: FONTS.sizes.lg },
    },

    button: {
      container: { backgroundColor: `${COLORS.primary}15`, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: `${COLORS.primary}35`, paddingVertical: 10, alignItems: 'center', marginTop: 8 },
      text:      { color: COLORS.primary, fontWeight: '700', fontSize: FONTS.sizes.sm },
    },

    modalHeader: {
      container: { backgroundColor: COLORS.backgroundCard, borderBottomColor: COLORS.border, borderBottomWidth: 1 },
      title:     { color: COLORS.textPrimary, fontWeight: '800' },
    },

    allOptions: {
      wrapper:        { backgroundColor: COLORS.background, flex: 1 },
      listContainer:  { backgroundColor: COLORS.background },
      titleContainer: { borderBottomColor: COLORS.border, borderBottomWidth: 1, backgroundColor: COLORS.backgroundCard },
      titleText:      { color: COLORS.textPrimary, fontWeight: '800' },
    },

    inputDialog: {
      transparentContainer: { backgroundColor: 'rgba(0,0,0,0.7)' },
      container: { backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.xl, borderWidth: 1, borderColor: COLORS.border },
      title:           { color: COLORS.textPrimary, fontWeight: '700' },
      input:           { color: COLORS.textPrimary, backgroundColor: COLORS.backgroundElevated, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border },
      button:          { color: COLORS.primary, fontWeight: '700' },
      buttonContainer: { borderTopColor: COLORS.border, borderTopWidth: 1 },
    },

    answersList: {
      container:       { backgroundColor: COLORS.background, flex: 1 },
      buttonContainer: { borderTopColor: COLORS.border, borderTopWidth: 1 },
      item: {
        container:         { backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, marginVertical: 4, paddingHorizontal: 12, paddingVertical: 10 },
        infoContainer:     {},
        userInfoContainer: {},
        answerText:        { color: COLORS.textPrimary, fontSize: FONTS.sizes.sm },
      },
    },

    createContent: {
      scrollView:      { backgroundColor: COLORS.background },
      headerContainer: { backgroundColor: COLORS.backgroundCard, borderBottomColor: COLORS.border, borderBottomWidth: 1 },
      name: {
        title: { color: COLORS.textSecondary, fontSize: FONTS.sizes.xs },
        input: { color: COLORS.textPrimary, backgroundColor: COLORS.backgroundElevated, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border },
      },
      pollOptions: {
        container: {},
        title:     { color: COLORS.textSecondary, fontSize: FONTS.sizes.xs },
        optionStyle: {
          wrapper:             { backgroundColor: COLORS.backgroundElevated, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border },
          input:               { color: COLORS.textPrimary },
          validationErrorText: { color: COLORS.error },
        },
        addOption: { wrapper: {}, text: { color: COLORS.primary, fontWeight: '700' } },
      },
      multipleAnswers: { wrapper: {}, row: {}, title: { color: COLORS.textPrimary } },
      anonymousPoll:   { wrapper: {}, title: { color: COLORS.textPrimary } },
      maxVotes: {
        wrapper:        {},
        input:          { color: COLORS.textPrimary, backgroundColor: COLORS.backgroundElevated },
        validationText: { color: COLORS.error },
      },
      suggestOption: { wrapper: {}, title: { color: COLORS.textPrimary } },
      addComment:    { wrapper: {}, title: { color: COLORS.textPrimary } },
      sendButton:    { backgroundColor: COLORS.primary, borderRadius: RADIUS.lg },
    },
  },
};