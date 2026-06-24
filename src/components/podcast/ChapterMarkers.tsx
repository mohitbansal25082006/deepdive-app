// src/components/podcast/ChapterMarkers.tsx
// Part 39 — Chapter Markers for the podcast player progress bar.
// UPDATED: Full theme integration — dynamic colors

import React, { useMemo } from 'react';
import { View, Text }     from 'react-native';
import { COLORS, FONTS }  from '../../constants/theme';
import type { ChapterMarker } from '../../types/podcast_v2';

interface ChapterMarkersProps {
  chapters:        ChapterMarker[];
  totalDurationMs: number;
  currentPositionMs: number;
  barWidth:        number;
  barHeight?:      number;
}

export function ChapterMarkers({
  chapters,
  totalDurationMs,
  currentPositionMs,
  barWidth,
  barHeight = 5,
}: ChapterMarkersProps) {
  if (!chapters || chapters.length === 0 || totalDurationMs <= 0) return null;

  const activeChapter = useMemo(() => {
    if (!chapters.length) return null;
    const sorted = [...chapters].sort((a, b) => (a.timeMs ?? 0) - (b.timeMs ?? 0));
    let active: ChapterMarker | null = null;
    for (const ch of sorted) {
      if ((ch.timeMs ?? 0) <= currentPositionMs) active = ch;
    }
    return active;
  }, [chapters, currentPositionMs]);

  return (
    <View>
      {activeChapter && (
        <Text
          style={{
            color:     COLORS.textMuted,
            fontSize:  FONTS.sizes.xs,
            marginBottom: 4,
            fontWeight: '500',
          }}
          numberOfLines={1}
        >
          {activeChapter.title}
        </Text>
      )}

      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: barHeight, pointerEvents: 'none' }}>
        {chapters.map(ch => {
          if (!ch.timeMs || totalDurationMs <= 0) return null;
          const pct = ch.timeMs / totalDurationMs;
          const x   = pct * barWidth;
          if (x < 4 || x > barWidth - 4) return null;

          const isActive = activeChapter?.id === ch.id;

          return (
            <View
              key={ch.id}
              style={{
                position:        'absolute',
                left:            x - 1,
                top:             -3,
                width:           2,
                height:          barHeight + 6,
                borderRadius:    1,
                backgroundColor: isActive ? COLORS.primary : COLORS.textMuted + '80',
              }}
            />
          );
        })}
      </View>
    </View>
  );
}