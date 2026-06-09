// src/constants/streamChatTheme.ts
// Part 49 — Stream Chat DeepDive Dark Theme
// Part 50 — Removed inlineDateSeparator styling (now handled by ChatDateSeparator)
//           Send button circle removed, all other theming preserved.
// Part 50.2 — Added poll dark-theme overrides using the EXACT key names from
//             stream-chat-react-native-core/src/contexts/themeContext/utils/theme.ts
// Part 50.4 — Added text_high_emphasis to colors so the poll back-button arrow
//             (which uses pathFill={text_high_emphasis}) is visible on dark bg.
//             Default SDK value is #080707 (near-black) — invisible on dark screens.
//
// Correct poll shape (verified from SDK source):
//
//   poll.message
//     .container               ViewStyle  — outer card wrapper
//     .header.title            TextStyle  — question text
//     .header.subtitle         TextStyle  — "X votes" subtitle
//     .option.wrapper          ViewStyle  — each option row outer
//     .option.container        ViewStyle  — each option row inner
//     .option.text             TextStyle  — option label
//     .option.progressBar      ViewStyle  — bar track
//     .option.progressBarEmptyFill   string  — unvoted track color
//     .option.progressBarVotedFill   string  — your-vote fill color
//     .option.progressBarWinnerFill  string  — leading option fill
//     .option.voteButtonContainer    ViewStyle
//     .option.voteButtonActive       string  — checkmark color when voted
//     .option.voteButtonInactive     string  — checkmark color when not voted
//     .option.votesContainer   ViewStyle  — vote-count wrapper
//     .optionsWrapper          ViewStyle  — list of options wrapper
//
//   poll.results
//     .container               ViewStyle  — full-screen wrapper
//     .scrollView              ViewStyle  — scroll area
//     .title                   TextStyle  — "Results" heading
//     .item.container          ViewStyle  — each option result row
//     .item.headerContainer    ViewStyle  — option header row
//     .item.title              TextStyle  — option text in results
//     .item.voteCount          TextStyle  — vote count in results
//     .vote.container          ViewStyle  — each individual voter row
//     .vote.dateText           TextStyle  — vote date/time
//     .vote.userName           TextStyle  — voter name
//
//   poll.fullResults
//     .container               ViewStyle
//     .contentContainer        ViewStyle
//     .headerContainer         ViewStyle
//     .headerText              TextStyle
//
//   poll.createContent   — the built-in CreatePoll screen (we use our own modal,
//                          but theme it anyway for consistency)
//   poll.button          — generic action buttons on poll card
//   poll.modalHeader     — modal-style header
//   poll.allOptions      — "show all options" expanded view
//   poll.inputDialog     — "add comment / suggest option" dialog
//   poll.answersList     — comment/answer list

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
    // Part 50.4: back-button arrow in poll modals uses text_high_emphasis as
    // its fill color. Default is #080707 (near-black) — invisible on dark bg.
    text_high_emphasis:   COLORS.textPrimary,
    // text_low_emphasis used for secondary text in poll/results screens
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

  // ── Input bar ─────────────────────────────────────────────────────────────────
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

  // ── Reply / quoted message ────────────────────────────────────────────────────
  reply: {
    container: {
      backgroundColor: COLORS.backgroundCard,
      borderLeftColor: COLORS.primary,
      borderRadius:    RADIUS.md,
    },
  },

  // ── Poll — dark theme (Part 50.2) ─────────────────────────────────────────────
  poll: {

    // ── Poll message card (inline in MessageList) ─────────────────────────────
    message: {
      // Outer card container
      container: {
        backgroundColor: COLORS.backgroundCard,
        borderRadius:    RADIUS.xl,
        borderWidth:     1,
        borderColor:     COLORS.border,
        overflow:        'hidden',
      },
      // Header section: poll question + vote count subtitle
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
      // All options share these styles
      option: {
        // Outer touchable wrapper per option row
        wrapper: {
          marginVertical:    3,
          borderRadius:      RADIUS.md,
          overflow:          'hidden',
        },
        // Inner container (background + padding)
        container: {
          backgroundColor:   COLORS.backgroundElevated,
          borderRadius:      RADIUS.md,
          borderWidth:       1,
          borderColor:       COLORS.border,
          paddingHorizontal: 12,
          paddingVertical:   10,
        },
        // Option label text
        text: {
          color:    COLORS.textPrimary,
          fontSize: FONTS.sizes.sm,
        },
        // Progress bar track background
        progressBar: {
          borderRadius:    RADIUS.sm,
          overflow:        'hidden',
          height:          4,
          marginTop:       6,
        },
        // Color strings for the three bar states
        progressBarEmptyFill:  COLORS.border,
        progressBarVotedFill:  COLORS.primary,
        progressBarWinnerFill: COLORS.success,
        // Vote button / checkmark colours
        voteButtonContainer: {
          borderRadius:    RADIUS.full,
          borderWidth:     1.5,
          borderColor:     COLORS.border,
          width:           22,
          height:          22,
          alignItems:      'center',
          justifyContent:  'center',
        },
        voteButtonActive:   COLORS.primary,   // colour when you have voted
        voteButtonInactive: COLORS.textMuted, // colour when not yet voted
        // Container for vote-count text beside each option
        votesContainer: {
          marginTop: 4,
        },
      },
      // Wrapper around the full list of options
      optionsWrapper: {
        marginTop: 8,
      },
    },

    // ── Results screen (full-screen modal) ────────────────────────────────────
    results: {
      // Outer screen wrapper
      container: {
        backgroundColor: COLORS.background,
        flex:            1,
      },
      // Scroll area
      scrollView: {
        backgroundColor: COLORS.background,
      },
      // "Results" / question heading
      title: {
        color:      COLORS.textPrimary,
        fontWeight: '800',
        fontSize:   FONTS.sizes.lg,
      },
      // Each option result row
      item: {
        container: {
          backgroundColor: COLORS.backgroundCard,
          borderRadius:    RADIUS.lg,
          borderWidth:     1,
          borderColor:     COLORS.border,
          marginVertical:  4,
          overflow:        'hidden',
        },
        // Option text + vote count header row
        headerContainer: {
          flexDirection:    'row',
          alignItems:       'center',
          justifyContent:   'space-between',
          paddingHorizontal: 14,
          paddingVertical:  10,
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
      // Each individual voter row inside an option
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

    // ── Full results header ───────────────────────────────────────────────────
    fullResults: {
      container: {
        backgroundColor: COLORS.background,
      },
      contentContainer: {
        backgroundColor: COLORS.background,
      },
      headerContainer: {
        backgroundColor:  COLORS.backgroundCard,
        borderBottomColor: COLORS.border,
        borderBottomWidth: 1,
      },
      headerText: {
        color:      COLORS.textPrimary,
        fontWeight: '800',
        fontSize:   FONTS.sizes.lg,
      },
    },

    // ── Generic poll action button ────────────────────────────────────────────
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

    // ── Modal header (e.g. "View Results" modal title bar) ────────────────────
    modalHeader: {
      container: {
        backgroundColor:  COLORS.backgroundCard,
        borderBottomColor: COLORS.border,
        borderBottomWidth: 1,
      },
      title: {
        color:      COLORS.textPrimary,
        fontWeight: '800',
      },
    },

    // ── "Show all options" expanded list ──────────────────────────────────────
    allOptions: {
      wrapper: {
        backgroundColor: COLORS.background,
        flex:            1,
      },
      listContainer: {
        backgroundColor: COLORS.background,
      },
      titleContainer: {
        borderBottomColor: COLORS.border,
        borderBottomWidth: 1,
        backgroundColor:   COLORS.backgroundCard,
      },
      titleText: {
        color:      COLORS.textPrimary,
        fontWeight: '800',
      },
    },

    // ── Comment / suggest option input dialog ─────────────────────────────────
    inputDialog: {
      transparentContainer: {
        backgroundColor: 'rgba(0,0,0,0.7)',
      },
      container: {
        backgroundColor: COLORS.backgroundCard,
        borderRadius:    RADIUS.xl,
        borderWidth:     1,
        borderColor:     COLORS.border,
      },
      title: {
        color:      COLORS.textPrimary,
        fontWeight: '700',
      },
      input: {
        color:           COLORS.textPrimary,
        backgroundColor: COLORS.backgroundElevated,
        borderRadius:    RADIUS.md,
        borderWidth:     1,
        borderColor:     COLORS.border,
      },
      button: {
        color:      COLORS.primary,
        fontWeight: '700',
      },
      buttonContainer: {
        borderTopColor: COLORS.border,
        borderTopWidth: 1,
      },
    },

    // ── Answers/comments list ─────────────────────────────────────────────────
    answersList: {
      container: {
        backgroundColor: COLORS.background,
        flex:            1,
      },
      buttonContainer: {
        borderTopColor: COLORS.border,
        borderTopWidth: 1,
      },
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
        infoContainer: {},
        userInfoContainer: {},
        answerText: {
          color:    COLORS.textPrimary,
          fontSize: FONTS.sizes.sm,
        },
      },
    },

    // ── Built-in CreatePoll screen (we use our own modal but theme for safety) ─
    createContent: {
      scrollView: {
        backgroundColor: COLORS.background,
      },
      headerContainer: {
        backgroundColor:  COLORS.backgroundCard,
        borderBottomColor: COLORS.border,
        borderBottomWidth: 1,
      },
      name: {
        title: {
          color:    COLORS.textSecondary,
          fontSize: FONTS.sizes.xs,
        },
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
        title: {
          color:    COLORS.textSecondary,
          fontSize: FONTS.sizes.xs,
        },
        optionStyle: {
          wrapper: {
            backgroundColor: COLORS.backgroundElevated,
            borderRadius:    RADIUS.md,
            borderWidth:     1,
            borderColor:     COLORS.border,
          },
          input: {
            color: COLORS.textPrimary,
          },
          validationErrorText: {
            color: COLORS.error,
          },
        },
        addOption: {
          wrapper: {},
          text: {
            color:      COLORS.primary,
            fontWeight: '700',
          },
        },
      },
      multipleAnswers: {
        wrapper: {},
        row:     {},
        title: {
          color: COLORS.textPrimary,
        },
      },
      anonymousPoll: {
        wrapper: {},
        title: {
          color: COLORS.textPrimary,
        },
      },
      maxVotes: {
        wrapper: {},
        input: {
          color:           COLORS.textPrimary,
          backgroundColor: COLORS.backgroundElevated,
        },
        validationText: {
          color: COLORS.error,
        },
      },
      suggestOption: {
        wrapper: {},
        title: {
          color: COLORS.textPrimary,
        },
      },
      addComment: {
        wrapper: {},
        title: {
          color: COLORS.textPrimary,
        },
      },
      sendButton: {
        backgroundColor: COLORS.primary,
        borderRadius:    RADIUS.lg,
      },
    },
  },
};