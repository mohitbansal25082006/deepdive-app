// src/components/podcast/VideoChapterOverlay.tsx
// Part 40 — Video Podcast Mode
//
// Shows the current chapter name as an animated pill overlay
// at the top of the video frame. Fades in when chapter changes,
// auto-hides after 3 seconds.

import React, { useEffect, useRef } from 'react';
import { Text, View, StyleSheet }   from 'react-native';
import { Ionicons }                 from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import type { ChapterMarker } from '../../types/podcast_v2';

export interface VideoChapterOverlayProps {
  chapters:          ChapterMarker[];
  currentTurnIndex:  number;
  accentColor:       string;
}

function getCurrentChapter(
  chapters: ChapterMarker[],
  turnIdx:  number,
): ChapterMarker | null {
  if (!chapters?.length) return null;
  // Find the last chapter whose startTurnIdx <= currentTurnIndex
  let current: ChapterMarker | null = null;
  for (const ch of chapters) {
    if (ch.startTurnIdx <= turnIdx) {
      current = ch;
    }
  }
  return current;
}

export function VideoChapterOverlay({
  chapters,
  currentTurnIndex,
  accentColor,
}: VideoChapterOverlayProps) {
  const opacity     = useSharedValue(0);
  const translateY  = useSharedValue(-8);
  const prevChapter = useRef<string | null>(null);

  const chapter = getCurrentChapter(chapters, currentTurnIndex);

  useEffect(() => {
    if (!chapter) return;
    if (chapter.id === prevChapter.current) return;
    prevChapter.current = chapter.id;

    // Animate in → hold → animate out
    opacity.value    = 0;
    translateY.value = -8;

    opacity.value = withSequence(
      withTiming(1, { duration: 300, easing: Easing.out(Easing.quad) }),
      withDelay(2600, withTiming(0, { duration: 400 })),
    );
    translateY.value = withSequence(
      withTiming(0, { duration: 300, easing: Easing.out(Easing.quad) }),
      withDelay(2600, withTiming(-4, { duration: 400 })),
    );
  }, [chapter?.id]);

  const animStyle = useAnimatedStyle(() => ({
    opacity:   opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  if (!chapter) return null;

  const chapterNum = chapters.indexOf(chapter) + 1;

  return (
    <Animated.View style={[styles.container, animStyle]}>
      <View style={[styles.pill, { backgroundColor: `${accentColor}22`, borderColor: `${accentColor}55` }]}>
        <Ionicons name="bookmark" size={11} color={accentColor} />
        <Text style={[styles.chapterNum, { color: accentColor }]}>
          CH {chapterNum}
        </Text>
        <View style={[styles.dot, { backgroundColor: `${accentColor}80` }]} />
        <Text style={styles.chapterTitle} numberOfLines={1}>
          {chapter.title}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingTop:  12,
  },
  pill: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               6,
    borderRadius:      20,
    borderWidth:       1,
    paddingVertical:   6,
    paddingHorizontal: 12,
    maxWidth:          280,
  },
  chapterNum: {
    fontSize:      10,
    fontWeight:    '800',
    letterSpacing: 1,
  },
  dot: {
    width:        4,
    height:       4,
    borderRadius: 2,
  },
  chapterTitle: {
    color:      'rgba(255,255,255,0.88)',
    fontSize:   12,
    fontWeight: '600',
    flexShrink: 1,
  },
});