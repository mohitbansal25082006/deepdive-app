// src/components/podcast/EpisodeThumbnail.tsx
// Part 40 — Video Podcast Mode
//
// Generates a title-card style thumbnail for the video player.
// Used as the initial "loading" frame before audio starts and
// as the hero image when sharing the video.
// Pure React Native — no images required.

import React from 'react';
import {
  View, Text, StyleSheet, Dimensions,
} from 'react-native';
import { LinearGradient }  from 'expo-linear-gradient';
import { Ionicons }        from '@expo/vector-icons';
import Animated, { FadeIn } from 'react-native-reanimated';

const { width: SCREEN_W } = Dimensions.get('window');

export interface EpisodeThumbnailProps {
  title:       string;
  hostName:    string;
  guestName:   string;
  durationMin: number;
  accentColor: string;
  style?:      object;
  compact?:    boolean;
}

export function EpisodeThumbnail({
  title,
  hostName,
  guestName,
  durationMin,
  accentColor,
  style,
  compact = false,
}: EpisodeThumbnailProps) {
  const size   = compact ? 56 : 80;
  const pad    = compact ? 16 : 28;
  const h1size = compact ? 15 : 22;
  const h2size = compact ? 11 : 13;

  // Generate two complementary gradient stops from accentColor
  const stops: [string, string, string] = [
    `${accentColor}EE`,
    `${accentColor}88`,
    '#0A0A1E',
  ];

  return (
    <Animated.View entering={FadeIn.duration(400)} style={[styles.root, style]}>
      <LinearGradient
        colors={stops}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.gradient, { padding: pad, borderRadius: compact ? 14 : 20 }]}
      >
        {/* Decorative circles */}
        <View style={[styles.circle1, { borderColor: `${accentColor}40`, width: size * 3.5, height: size * 3.5, borderRadius: size * 1.75, top: -size * 1.2, right: -size * 1.1 }]} />
        <View style={[styles.circle2, { borderColor: `${accentColor}25`, width: size * 2.5, height: size * 2.5, borderRadius: size * 1.25, bottom: -size * 0.8, left: -size * 0.7 }]} />

        {/* Mic icon + label */}
        <View style={[styles.iconRow, { marginBottom: compact ? 8 : 16 }]}>
          <View style={[styles.iconBubble, { width: size * 0.6, height: size * 0.6, borderRadius: size * 0.3, backgroundColor: `${accentColor}33`, borderColor: `${accentColor}66` }]}>
            <Ionicons name="mic" size={compact ? 14 : 22} color={accentColor} />
          </View>
          <View style={[styles.podcastBadge, { backgroundColor: `${accentColor}22`, borderColor: `${accentColor}55` }]}>
            <Text style={[styles.podcastBadgeText, { color: accentColor, fontSize: compact ? 9 : 11 }]}>
              DEEPDIVE PODCAST
            </Text>
          </View>
        </View>

        {/* Title */}
        <Text
          style={[styles.title, { fontSize: h1size, marginBottom: compact ? 8 : 14 }]}
          numberOfLines={compact ? 2 : 3}
        >
          {title}
        </Text>

        {/* Host / Guest row */}
        <View style={styles.hostRow}>
          <SpeakerChip name={hostName}  label="HOST"  color={accentColor} compact={compact} />
          <View style={[styles.divider, { backgroundColor: `${accentColor}40` }]} />
          <SpeakerChip name={guestName} label="GUEST" color="#FF6584" compact={compact} />
        </View>

        {/* Duration pill */}
        <View style={[styles.durationPill, { backgroundColor: 'rgba(0,0,0,0.35)', borderColor: 'rgba(255,255,255,0.12)', marginTop: compact ? 8 : 14 }]}>
          <Ionicons name="time-outline" size={compact ? 10 : 12} color="rgba(255,255,255,0.6)" />
          <Text style={[styles.durationText, { fontSize: compact ? 10 : 12 }]}>~{durationMin} min</Text>
        </View>
      </LinearGradient>
    </Animated.View>
  );
}

function SpeakerChip({ name, label, color, compact }: { name: string; label: string; color: string; compact: boolean }) {
  const initials = name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <View style={styles.speakerChip}>
      <View style={[styles.avatarBubble, { backgroundColor: `${color}25`, borderColor: `${color}50`, width: compact ? 24 : 32, height: compact ? 24 : 32, borderRadius: compact ? 8 : 10 }]}>
        <Text style={[styles.initials, { color, fontSize: compact ? 10 : 13 }]}>{initials}</Text>
      </View>
      <View>
        <Text style={[styles.speakerLabel, { fontSize: compact ? 8 : 9 }]}>{label}</Text>
        <Text style={[styles.speakerName, { fontSize: compact ? 11 : 13 }]} numberOfLines={1}>{name}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    overflow: 'hidden',
  },
  gradient: {
    overflow: 'hidden',
  },
  circle1: {
    position:   'absolute',
    borderWidth: 1,
  },
  circle2: {
    position:   'absolute',
    borderWidth: 1,
  },
  iconRow: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            10,
  },
  iconBubble: {
    alignItems:     'center',
    justifyContent: 'center',
    borderWidth:    1,
  },
  podcastBadge: {
    borderRadius:    20,
    borderWidth:     1,
    paddingVertical: 3,
    paddingHorizontal: 8,
  },
  podcastBadgeText: {
    fontWeight:    '800',
    letterSpacing: 1,
  },
  title: {
    color:      '#FFFFFF',
    fontWeight: '800',
    lineHeight: 28,
  },
  hostRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           12,
  },
  divider: {
    width:  1,
    height: 28,
  },
  speakerChip: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           8,
    flex:          1,
  },
  avatarBubble: {
    alignItems:     'center',
    justifyContent: 'center',
    borderWidth:    1,
  },
  initials: {
    fontWeight: '800',
  },
  speakerLabel: {
    color:         'rgba(255,255,255,0.45)',
    fontWeight:    '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  speakerName: {
    color:      '#FFFFFF',
    fontWeight: '700',
  },
  durationPill: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             5,
    alignSelf:       'flex-start',
    borderRadius:    20,
    borderWidth:     1,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  durationText: {
    color:      'rgba(255,255,255,0.6)',
    fontWeight: '600',
  },
});