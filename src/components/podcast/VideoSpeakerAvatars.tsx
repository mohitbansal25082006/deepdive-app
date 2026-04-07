// src/components/podcast/VideoSpeakerAvatars.tsx
// Part 40 — Video Podcast Mode
//
// Full-width speaker avatar row for the video player.
// Active speaker gets a glowing border ring, scale-up animation,
// and a pulsing outer glow effect. Works for 2 and 3 speakers.

import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withRepeat,
  withSequence,
  cancelAnimation,
  Easing,
} from 'react-native-reanimated';

export interface SpeakerInfo {
  name:     string;
  label:    string;
  color:    string;
  isActive: boolean;
}

export interface VideoSpeakerAvatarsProps {
  speakers: SpeakerInfo[];
  style?:   object;
}

function VideoAvatar({ speaker }: { speaker: SpeakerInfo }) {
  const scale     = useSharedValue(speaker.isActive ? 1.0 : 0.82);
  const glow      = useSharedValue(speaker.isActive ? 1   : 0);
  const ringScale = useSharedValue(1);

  useEffect(() => {
    scale.value = withSpring(speaker.isActive ? 1.0 : 0.82, { damping: 14, stiffness: 120 });
    glow.value  = withTiming(speaker.isActive ? 1 : 0, { duration: 300 });

    if (speaker.isActive) {
      // Subtle pulsing ring
      cancelAnimation(ringScale);
      ringScale.value = withRepeat(
        withSequence(
          withTiming(1.12, { duration: 900, easing: Easing.inOut(Easing.sin) }),
          withTiming(1.00, { duration: 900, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        false,
      );
    } else {
      cancelAnimation(ringScale);
      ringScale.value = withTiming(1, { duration: 300 });
    }
  }, [speaker.isActive]);

  const avatarStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity:   glow.value * 0.45,
    transform: [{ scale: ringScale.value }],
  }));

  const ringStyle = useAnimatedStyle(() => ({
    borderColor: speaker.isActive ? speaker.color : 'transparent',
    transform:   [{ scale: ringScale.value }],
  }));

  const initials = speaker.name
    .split(' ')
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <View style={styles.avatarWrapper}>
      {/* Outer glow */}
      <Animated.View
        style={[
          styles.glowRing,
          {
            backgroundColor: speaker.color,
            width:            80,
            height:           80,
            borderRadius:     40,
          },
          glowStyle,
        ]}
      />

      {/* Animated border ring */}
      <Animated.View
        style={[
          styles.borderRing,
          {
            width:        72,
            height:       72,
            borderRadius: 22,
            borderColor:  speaker.isActive ? speaker.color : 'transparent',
          },
          ringStyle,
        ]}
      >
        {/* Avatar bubble */}
        <Animated.View
          style={[
            styles.bubble,
            {
              backgroundColor: `${speaker.color}25`,
              width:            60,
              height:           60,
              borderRadius:     18,
            },
            avatarStyle,
          ]}
        >
          <Text style={[styles.initials, { color: speaker.isActive ? speaker.color : `${speaker.color}80` }]}>
            {initials}
          </Text>
        </Animated.View>
      </Animated.View>

      {/* Name + label */}
      <Text style={[styles.name, { color: speaker.isActive ? '#FFFFFF' : 'rgba(255,255,255,0.45)' }]} numberOfLines={1}>
        {speaker.name}
      </Text>
      <View style={[styles.labelPill, { backgroundColor: speaker.isActive ? `${speaker.color}30` : 'transparent', borderColor: speaker.isActive ? `${speaker.color}60` : 'transparent' }]}>
        <Text style={[styles.labelText, { color: speaker.isActive ? speaker.color : 'rgba(255,255,255,0.3)' }]}>
          {speaker.label}
        </Text>
      </View>

      {/* "Speaking" indicator */}
      {speaker.isActive && (
        <View style={styles.speakingRow}>
          {[0, 1, 2].map(i => (
            <SpeakingDot key={i} delay={i * 150} color={speaker.color} />
          ))}
        </View>
      )}
    </View>
  );
}

function SpeakingDot({ delay, color }: { delay: number; color: string }) {
  const scale = useSharedValue(0.6);

  useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(1.0, { duration: 400, easing: Easing.inOut(Easing.sin) }),
        withTiming(0.6, { duration: 400, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View
      style={[
        {
          width:           5,
          height:          5,
          borderRadius:    2.5,
          backgroundColor: color,
          marginHorizontal: 1,
        },
        style,
      ]}
    />
  );
}

export function VideoSpeakerAvatars({ speakers, style }: VideoSpeakerAvatarsProps) {
  return (
    <View style={[styles.row, style]}>
      {speakers.map((sp, i) => (
        <VideoAvatar key={i} speaker={sp} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection:  'row',
    justifyContent: 'center',
    alignItems:     'flex-start',
    gap:            28,
  },
  avatarWrapper: {
    alignItems: 'center',
    gap:        5,
  },
  glowRing: {
    position:   'absolute',
    alignSelf:  'center',
    top:        -4,
    // Removed invalid filterShadowColor property
  },
  borderRing: {
    borderWidth:    2.5,
    alignItems:     'center',
    justifyContent: 'center',
  },
  bubble: {
    alignItems:     'center',
    justifyContent: 'center',
  },
  initials: {
    fontSize:   18,
    fontWeight: '800',
  },
  name: {
    fontSize:   13,
    fontWeight: '700',
    marginTop:  2,
    maxWidth:   90,
    textAlign:  'center',
  },
  labelPill: {
    borderRadius:      10,
    borderWidth:       1,
    paddingVertical:   2,
    paddingHorizontal: 7,
  },
  labelText: {
    fontSize:      9,
    fontWeight:    '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  speakingRow: {
    flexDirection: 'row',
    alignItems:    'center',
    marginTop:     2,
    height:        10,
  },
});