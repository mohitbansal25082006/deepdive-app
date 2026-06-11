// src/constants/streamChatTheme.ts
// Part 49 — Stream Chat DeepDive Dark Theme
// Part 50 — Removed inlineDateSeparator, send button styling.
// Part 50.2 — Gallery + Giphy dark overrides.
// Part 50.3 — Reaction overlay dark-readable backgrounds.
// Part 50.4 FIX 3 — Correct image sizing: no purple gap, no black gap.
//
// HISTORY OF THE IMAGE BUG:
//
//   Attempt 1 (50.4 original): Custom SingleImageGallery component.
//     Result: Videos disappeared. Custom Gallery only handled images prop,
//     not the videos prop Stream also passes.
//
//   Attempt 2 (50.4 fix 1): aspectRatio: 4/3 on imageContainer, containerInner purple.
//     Result: Purple empty block on left half of message.
//     Cause: containerInner had COLORS.primary background; portrait images
//     (taller than 4:3) left leftover horizontal space filled with purple.
//
//   Attempt 3 (50.4 fix 2): containerInner transparent, width:'100%' on imageContainer.
//     Result: Black empty block on right side of images.
//     Cause: Stream internally computes imageContainer width from attachment
//     original_width/original_height. When those aren't set (before CDN
//     enrichment), Stream falls back to ~half screen width. Our width:'100%'
//     on imageContainer is a style override but Stream's JS-computed width
//     takes precedence via inline style and the image renders at its
//     intrinsic pixel ratio within a smaller container, leaving black on right.
//
// CORRECT FIX (Attempt 4):
//
//   The fundamental issue is that we're fighting Stream's internal size
//   calculation. Instead of trying to set explicit widths, we use flex layout:
//
//   1. `containerInner` → backgroundColor: 'transparent'
//      Keeps the fix from Attempt 3. No purple showing through.
//
//   2. `gallery` → flex: 1
//      The gallery wrapper stretches to fill containerInner width.
//
//   3. `imageContainer` → flex: 1, no explicit width, no aspectRatio
//      Stretches to fill the gallery. flex:1 overrides Stream's computed
//      width because it participates in flex layout AFTER Stream sets up
//      the flex container. The image fills whatever space is given.
//
//   4. `image` → flex: 1, resizeMode: 'cover'
//      Fills imageContainer fully. cover crops if needed but never shows
//      empty space — the image always fills edge to edge.
//
//   WHY flex:1 WORKS OVER width:'100%':
//     Stream's Gallery renders imageContainer inside a flex row container.
//     In React Native flex layout, flex:1 means "take all remaining space
//     in the flex direction" which wins over a width computed by the parent.
//     width:'100%' is percentage of parent, but Stream's parent has a
//     computed pixel width that limits it. flex:1 ignores the parent's
//     computed constraint and fills available space instead.
//
//   RESULT: Images always fill the full message bubble width cleanly.
//   Portrait photos are tall and full-width. Landscape photos are wide
//   and full-width. No purple, no black, no empty space anywhere.

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
      // transparent: image messages should have no background behind the image.
      // Text bubble color comes from senderMessageBackgroundColor below (Stream
      // applies that to a separate inner wrapper around the text content only).
      containerInner: {
        backgroundColor:         'transparent',
        borderRadius:            RADIUS.xl,
        borderBottomRightRadius: 4,
        overflow:                'hidden',
      },
      receiverMessageBackgroundColor: COLORS.backgroundElevated,
      senderMessageBackgroundColor:   COLORS.primary,
    },

    // ── Gallery — inline image/GIF/video thumbnails ───────────────────────────
    //
    // We do NOT replace Gallery via Channel prop — Stream's Gallery handles
    // both images and videos together.
    //
    // flex:1 chain (gallery → imageContainer → image) ensures the image
    // always fills the full bubble width regardless of Stream's internal
    // size computations from attachment metadata.
    gallery: {
      // The outer gallery wrapper: stretch to fill containerInner
      galleryContainer: {
        flex:            1,
        backgroundColor: 'transparent',
      },
      // The container around each individual image
      imageContainer: {
        flex:            1,
        backgroundColor: 'transparent',
        borderRadius:    RADIUS.md,
        overflow:        'hidden',
        // No width, no aspectRatio — flex:1 handles sizing
      },
      // The image itself
      image: {
        flex:       1,
        borderRadius: RADIUS.md,
        // cover: fills the container without letterboxing or empty space
        resizeMode: 'cover' as any,
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

    // ── Reaction picker overlay — dark-readable ───────────────────────────────
    reactionListTop: {
      container: {
        backgroundColor:   COLORS.backgroundCard,
        borderRadius:      RADIUS.full,
        borderWidth:       1,
        borderColor:       COLORS.border,
        paddingHorizontal: 4,
        paddingVertical:   2,
        shadowColor:       '#000',
        shadowOffset:      { width: 0, height: 2 },
        shadowOpacity:     0.4,
        shadowRadius:      8,
        elevation:         8,
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
        wrapper:                 { marginVertical: 3, borderRadius: RADIUS.md, overflow: 'hidden' },
        container:               { backgroundColor: COLORS.backgroundElevated, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 12, paddingVertical: 10 },
        text:                    { color: COLORS.textPrimary, fontSize: FONTS.sizes.sm },
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
        container:       { backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, marginVertical: 4, overflow: 'hidden' },
        headerContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10, borderBottomColor: `${COLORS.border}60`, borderBottomWidth: 1 },
        title:           { color: COLORS.textPrimary, fontWeight: '600', fontSize: FONTS.sizes.sm },
        voteCount:       { color: COLORS.primary, fontWeight: '700', fontSize: FONTS.sizes.sm },
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
      container:            { backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.xl, borderWidth: 1, borderColor: COLORS.border },
      title:                { color: COLORS.textPrimary, fontWeight: '700' },
      input:                { color: COLORS.textPrimary, backgroundColor: COLORS.backgroundElevated, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border },
      button:               { color: COLORS.primary, fontWeight: '700' },
      buttonContainer:      { borderTopColor: COLORS.border, borderTopWidth: 1 },
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