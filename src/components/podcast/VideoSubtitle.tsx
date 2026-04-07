// src/components/podcast/VideoSubtitle.tsx
// Part 40 — Video Podcast Mode (Paginated Fix)
//
// Shows subtitles as paginated 2-line chunks.
// The visible "page" auto-advances as the karaoke cursor moves through words.
// This ensures:
//   • The subtitle area never overflows / overlaps other UI
//   • ALL words of a turn are eventually shown (page 1 → page 2 → ...)
//   • Karaoke highlight works correctly within the visible page
//   • Smooth crossfade between pages

import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
} from 'react-native-reanimated';

// How many words fit on one line (approximate at ~16px font, ~320px wide)
const WORDS_PER_LINE = 8;
// How many lines are visible at once (2 = cinema standard, never overflows)
const LINES_PER_PAGE = 2;
const WORDS_PER_PAGE = WORDS_PER_LINE * LINES_PER_PAGE; // 16 words per page

export interface VideoSubtitleProps {
  text:              string;
  speakerName:       string;
  speakerColor:      string;
  turnIndex:         number;
  positionMs:        number;
  segmentDurationMs: number;
  visible:           boolean;
  style?:            object;
}

export function VideoSubtitle({
  text,
  speakerName,
  speakerColor,
  turnIndex,
  positionMs,
  segmentDurationMs,
  visible,
  style,
}: VideoSubtitleProps) {
  // Split into words
  const words = useMemo(() => text.trim().split(/\s+/).filter(Boolean), [text]);

  // Which word is being spoken right now
  const wordProgress    = segmentDurationMs > 0
    ? Math.min(1, positionMs / segmentDurationMs)
    : 0;
  const activeWordIndex = Math.floor(wordProgress * words.length);

  // Which page should be visible (advance when active word reaches next page)
  const currentPage  = Math.floor(activeWordIndex / WORDS_PER_PAGE);
  const pageStartWord = currentPage * WORDS_PER_PAGE;
  const pageWords     = words.slice(pageStartWord, pageStartWord + WORDS_PER_PAGE);

  // Split page words into lines
  const lines: string[][] = [];
  for (let i = 0; i < pageWords.length; i += WORDS_PER_LINE) {
    lines.push(pageWords.slice(i, i + WORDS_PER_LINE));
  }

  // Page indicator dots
  const totalPages = Math.ceil(words.length / WORDS_PER_PAGE);
  const showDots   = totalPages > 1;

  if (!visible || !text) return null;

  return (
    <Animated.View
      key={`${turnIndex}-${currentPage}`}
      entering={FadeIn.duration(220)}
      exiting={FadeOut.duration(180)}
      style={[styles.container, style]}
    >
      {/* Speaker label */}
      <View style={[
        styles.speakerTag,
        { backgroundColor: `${speakerColor}22`, borderColor: `${speakerColor}55` },
      ]}>
        <Text style={[styles.speakerText, { color: speakerColor }]}>
          {speakerName.toUpperCase()}
        </Text>
      </View>

      {/* Fixed-height text box — exactly 2 lines, never overflows */}
      <View style={styles.textBox}>
        {lines.map((lineWords, lineIndex) => {
          const lineStartWordIndex = pageStartWord + lineIndex * WORDS_PER_LINE;
          return (
            <View key={lineIndex} style={styles.line}>
              {lineWords.map((word, wordIdx) => {
                const globalWordIdx = lineStartWordIndex + wordIdx;
                const isHighlighted = globalWordIdx <= activeWordIndex;
                const isCurrent     = globalWordIdx === activeWordIndex;

                return (
                  <Text
                    key={wordIdx}
                    style={[
                      styles.word,
                      isHighlighted && styles.wordHighlighted,
                      isCurrent     && styles.wordCurrent,
                    ]}
                  >
                    {word}{wordIdx < lineWords.length - 1 ? ' ' : ''}
                  </Text>
                );
              })}
            </View>
          );
        })}
      </View>

      {/* Page progress dots — shows there is more text coming */}
      {showDots && (
        <View style={styles.dotsRow}>
          {Array.from({ length: totalPages }).map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                {
                  backgroundColor: i === currentPage
                    ? speakerColor
                    : `${speakerColor}35`,
                  width: i === currentPage ? 16 : 5,
                },
              ]}
            />
          ))}
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems:    'center',
    paddingBottom: 4,
  },
  speakerTag: {
    borderRadius:      20,
    borderWidth:       1,
    paddingVertical:   3,
    paddingHorizontal: 10,
    marginBottom:      6,
    alignSelf:         'center',
  },
  speakerText: {
    fontSize:      10,
    fontWeight:    '800',
    letterSpacing: 1.2,
  },
  textBox: {
    alignItems:        'center',
    paddingHorizontal: 8,
    // Fixed height for exactly 2 lines (lineHeight 24 × 2 + gap 3)
    minHeight:         52,
    justifyContent:    'center',
  },
  line: {
    flexDirection:  'row',
    flexWrap:       'wrap',
    justifyContent: 'center',
    marginBottom:   3,
  },
  word: {
    fontSize:         16,
    fontWeight:       '600',
    color:            'rgba(255,255,255,0.40)',
    textShadowColor:  'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
    lineHeight:       24,
  },
  wordHighlighted: {
    color: 'rgba(255,255,255,0.82)',
  },
  wordCurrent: {
    color:      '#FFFFFF',
    fontWeight: '800',
  },
  dotsRow: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            4,
    marginTop:      6,
  },
  dot: {
    height:       5,
    borderRadius: 3,
  },
});