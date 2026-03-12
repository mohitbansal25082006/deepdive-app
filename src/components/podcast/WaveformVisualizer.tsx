// src/components/podcast/WaveformVisualizer.tsx
// FIX: Easing.sine → Easing.sin (Reanimated's Easing type uses 'sin' not 'sine')

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

const BAR_CONFIGS: BarConfig[] = [
  { baseRatio: 0.30, minRatio: 0.15, maxRatio: 0.55, cycleDuration: 900, delay: 0   },
  { baseRatio: 0.55, minRatio: 0.35, maxRatio: 0.80, cycleDuration: 700, delay: 120 },
  { baseRatio: 0.75, minRatio: 0.50, maxRatio: 1.00, cycleDuration: 800, delay: 60  },
  { baseRatio: 1.00, minRatio: 0.65, maxRatio: 1.00, cycleDuration: 600, delay: 200 },
  { baseRatio: 0.85, minRatio: 0.55, maxRatio: 1.00, cycleDuration: 750, delay: 40  },
  { baseRatio: 0.60, minRatio: 0.35, maxRatio: 0.85, cycleDuration: 680, delay: 160 },
  { baseRatio: 0.35, minRatio: 0.15, maxRatio: 0.60, cycleDuration: 850, delay: 80  },
];

interface WaveBarProps {
  config:    BarConfig;
  isPlaying: boolean;
  color:     string;
  maxHeight: number;
  barWidth:  number;
}

function WaveBar({ config, isPlaying, color, maxHeight, barWidth }: WaveBarProps) {
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
              // FIX: was Easing.sine — correct name is Easing.sin
              easing: Easing.inOut(Easing.sin),
            }),
            withTiming(config.minRatio, {
              duration: config.cycleDuration / 2,
              // FIX: was Easing.sine — correct name is Easing.sin
              easing: Easing.inOut(Easing.sin),
            }),
          ),
          -1,
          false
        )
      );
    } else {
      heightRatio.value = withTiming(config.baseRatio, { duration: 350 });
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
          borderRadius:    barWidth / 2,
          alignSelf:       'flex-end',
        },
        animStyle,
      ]}
    />
  );
}

export interface WaveformVisualizerProps {
  isPlaying:  boolean;
  color?:     string;
  barWidth?:  number;
  barGap?:    number;
  maxHeight?: number;
  style?:     object;
}

export function WaveformVisualizer({
  isPlaying,
  color     = '#6C63FF',
  barWidth  = 5,
  barGap    = 4,
  maxHeight = 40,
  style,
}: WaveformVisualizerProps) {
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems:    'flex-end',
          height:        maxHeight,
          gap:           barGap,
        },
        style,
      ]}
    >
      {BAR_CONFIGS.map((cfg, i) => (
        <WaveBar
          key={i}
          config={cfg}
          isPlaying={isPlaying}
          color={color}
          maxHeight={maxHeight}
          barWidth={barWidth}
        />
      ))}
    </View>
  );
}