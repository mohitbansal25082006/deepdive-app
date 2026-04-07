// src/components/podcast/CinematicWaveform.tsx
// Part 40 — Video Podcast Mode
//
// A wider, cinematic version of the waveform visualizer designed for the
// full-screen video player. Uses 24 bars instead of 7 for a richer look.
// Each bar has independent timing/height so the animation looks organic.
// Color reflects the active speaker.

import React, { useEffect } from 'react';
import { View }             from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  cancelAnimation,
  Easing,
} from 'react-native-reanimated';

interface BarConfig {
  baseRatio:     number;
  minRatio:      number;
  maxRatio:      number;
  cycleDuration: number;
  delay:         number;
}

// 24-bar cinematic config — symmetrical arch shape
const CINEMA_BAR_CONFIGS: BarConfig[] = [
  { baseRatio: 0.15, minRatio: 0.08, maxRatio: 0.30, cycleDuration: 1100, delay: 0   },
  { baseRatio: 0.22, minRatio: 0.12, maxRatio: 0.40, cycleDuration:  950, delay: 60  },
  { baseRatio: 0.32, minRatio: 0.18, maxRatio: 0.55, cycleDuration:  870, delay: 120 },
  { baseRatio: 0.45, minRatio: 0.28, maxRatio: 0.72, cycleDuration:  790, delay: 40  },
  { baseRatio: 0.58, minRatio: 0.38, maxRatio: 0.85, cycleDuration:  720, delay: 180 },
  { baseRatio: 0.68, minRatio: 0.48, maxRatio: 0.92, cycleDuration:  680, delay: 80  },
  { baseRatio: 0.78, minRatio: 0.55, maxRatio: 1.00, cycleDuration:  640, delay: 200 },
  { baseRatio: 0.88, minRatio: 0.65, maxRatio: 1.00, cycleDuration:  600, delay: 30  },
  { baseRatio: 0.95, minRatio: 0.72, maxRatio: 1.00, cycleDuration:  580, delay: 160 },
  { baseRatio: 1.00, minRatio: 0.78, maxRatio: 1.00, cycleDuration:  560, delay: 90  },
  { baseRatio: 1.00, minRatio: 0.78, maxRatio: 1.00, cycleDuration:  570, delay: 140 },
  { baseRatio: 0.95, minRatio: 0.72, maxRatio: 1.00, cycleDuration:  590, delay: 20  },
  { baseRatio: 0.88, minRatio: 0.65, maxRatio: 1.00, cycleDuration:  610, delay: 170 },
  { baseRatio: 0.78, minRatio: 0.55, maxRatio: 1.00, cycleDuration:  650, delay: 50  },
  { baseRatio: 0.68, minRatio: 0.48, maxRatio: 0.92, cycleDuration:  690, delay: 210 },
  { baseRatio: 0.58, minRatio: 0.38, maxRatio: 0.85, cycleDuration:  730, delay: 100 },
  { baseRatio: 0.45, minRatio: 0.28, maxRatio: 0.72, cycleDuration:  800, delay: 70  },
  { baseRatio: 0.32, minRatio: 0.18, maxRatio: 0.55, cycleDuration:  880, delay: 190 },
  { baseRatio: 0.22, minRatio: 0.12, maxRatio: 0.40, cycleDuration:  960, delay: 30  },
  { baseRatio: 0.15, minRatio: 0.08, maxRatio: 0.30, cycleDuration: 1120, delay: 110 },
  // Extra 4 bars for width — edge fillers
  { baseRatio: 0.10, minRatio: 0.06, maxRatio: 0.22, cycleDuration: 1200, delay: 50  },
  { baseRatio: 0.08, minRatio: 0.04, maxRatio: 0.18, cycleDuration: 1300, delay: 80  },
  { baseRatio: 0.10, minRatio: 0.06, maxRatio: 0.22, cycleDuration: 1200, delay: 40  },
  { baseRatio: 0.08, minRatio: 0.04, maxRatio: 0.18, cycleDuration: 1300, delay: 70  },
];

// Reorder so the extras are at the start/end (bookends)
const ORDERED_CONFIGS = [
  CINEMA_BAR_CONFIGS[21], CINEMA_BAR_CONFIGS[20],
  ...CINEMA_BAR_CONFIGS.slice(0, 20),
  CINEMA_BAR_CONFIGS[22], CINEMA_BAR_CONFIGS[23],
];

interface CinemaBarProps {
  config:    BarConfig;
  isPlaying: boolean;
  color:     string;
  maxHeight: number;
  barWidth:  number;
  opacity:   number;
}

function CinemaBar({ config, isPlaying, color, maxHeight, barWidth, opacity }: CinemaBarProps) {
  const heightRatio = useSharedValue(config.baseRatio);

  useEffect(() => {
    cancelAnimation(heightRatio);
    if (isPlaying) {
      heightRatio.value = withDelay(
        config.delay,
        withRepeat(
          withSequence(
            withTiming(config.maxRatio, {
              duration: config.cycleDuration / 2,
              easing:   Easing.inOut(Easing.sin),
            }),
            withTiming(config.minRatio, {
              duration: config.cycleDuration / 2,
              easing:   Easing.inOut(Easing.sin),
            }),
          ),
          -1,
          false,
        ),
      );
    } else {
      heightRatio.value = withTiming(config.baseRatio, { duration: 400 });
    }
  }, [isPlaying]);

  const animStyle = useAnimatedStyle(() => ({
    height: heightRatio.value * maxHeight,
  }));

  return (
    <Animated.View
      style={[
        {
          width:           barWidth,
          backgroundColor: color,
          borderRadius:    barWidth,
          alignSelf:       'center',
          opacity,
        },
        animStyle,
      ]}
    />
  );
}

export interface CinematicWaveformProps {
  isPlaying:  boolean;
  color?:     string;
  barWidth?:  number;
  barGap?:    number;
  maxHeight?: number;
  style?:     object;
}

export function CinematicWaveform({
  isPlaying,
  color     = '#6C63FF',
  barWidth  = 4,
  barGap    = 3,
  maxHeight = 80,
  style,
}: CinematicWaveformProps) {
  return (
    <View
      style={[
        {
          flexDirection:  'row',
          alignItems:     'center',
          justifyContent: 'center',
          height:         maxHeight,
          gap:            barGap,
        },
        style,
      ]}
    >
      {ORDERED_CONFIGS.map((cfg, i) => {
        // Edge bars slightly transparent
        const isEdge  = i < 2 || i >= ORDERED_CONFIGS.length - 2;
        const opacity = isEdge ? 0.4 : 1.0;
        return (
          <CinemaBar
            key={i}
            config={cfg}
            isPlaying={isPlaying}
            color={color}
            maxHeight={maxHeight}
            barWidth={barWidth}
            opacity={opacity}
          />
        );
      })}
    </View>
  );
}