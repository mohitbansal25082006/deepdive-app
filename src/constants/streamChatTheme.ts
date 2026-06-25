// src/constants/streamChatTheme.ts
// Part 49 — Stream Chat DeepDive Dark Theme
// Part 55 — THEME SYSTEM: buildStreamChatTheme() factory reads current COLORS.
// Part 55.2 — Fully theme-integrated: all hardcoded colors replaced with live
//             COLORS from the theme system. No dark-only assumptions.

import type { DeepPartial, Theme } from 'stream-chat-expo';
import { COLORS, FONTS, RADIUS } from './theme';

export function buildStreamChatTheme(): DeepPartial<Theme> {
  return {
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

    avatar: {
      BASE_AVATAR_SIZE: 32,
    },

    messageSimple: {
      content: {
        containerInner: {
          backgroundColor:         'transparent',
          borderRadius:            RADIUS.xl,
          borderBottomRightRadius: 4,
          overflow:                'hidden',
        },
        receiverMessageBackgroundColor: COLORS.backgroundElevated,
        senderMessageBackgroundColor:   COLORS.primary,
      },

      gallery: {
        galleryContainer: {
          flex:            1,
          backgroundColor: 'transparent',
        },
        imageContainer: {
          flex:            1,
          backgroundColor: 'transparent',
          borderRadius:    RADIUS.md,
          overflow:        'hidden',
        },
        image: {
          flex:       1,
          borderRadius: RADIUS.md,
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

    messageList: {
      contentContainer: {
        backgroundColor: COLORS.background,
      },
      typingIndicatorContainer: {
        borderTopColor: COLORS.border,
      },
    },

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

    reply: {
      container: {
        backgroundColor: COLORS.backgroundCard,
        borderLeftColor: COLORS.primary,
        borderRadius:    RADIUS.md,
      },
    },

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
}

export const streamChatTheme: DeepPartial<Theme> = buildStreamChatTheme();