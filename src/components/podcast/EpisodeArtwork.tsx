// src/components/podcast/EpisodeArtwork.tsx
// Part 39 — Episode Artwork Component
//
// Generates a unique, deterministic cover image for each episode using
// a color gradient + icon from @expo/vector-icons. No network calls needed.
// Colors derived from a hash of the episode title for consistency.

import React, { useMemo } from 'react';
import { View, Text }     from 'react-native';
import { Ionicons }       from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { RADIUS }         from '../../constants/theme';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const GRADIENT_PAIRS: [string, string][] = [
  ['#6C63FF', '#8B5CF6'],
  ['#FF6584', '#F43F5E'],
  ['#43E97B', '#10B981'],
  ['#FFA726', '#F59E0B'],
  ['#29B6F6', '#3B82F6'],
  ['#EC4899', '#8B5CF6'],
  ['#14B8A6', '#0EA5E9'],
  ['#EF4444', '#F97316'],
  ['#A855F7', '#6C63FF'],
  ['#06B6D4', '#3B82F6'],
];

const ARTWORK_ICONS: string[] = [
  'mic', 'radio', 'headset', 'musical-notes', 'volume-high',
  'chatbubbles', 'megaphone', 'film', 'tv', 'pulse',
];

function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) + hash + str.charCodeAt(i);
    hash = hash & hash; // 32-bit int
  }
  return Math.abs(hash);
}

function getArtworkForTitle(title: string): { gradient: [string, string]; icon: string } {
  const h = hashString(title || 'episode');
  const gradient = GRADIENT_PAIRS[h % GRADIENT_PAIRS.length];
  const icon     = ARTWORK_ICONS[Math.floor(h / 10) % ARTWORK_ICONS.length];
  return { gradient, icon };
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface EpisodeArtworkProps {
  title:        string;
  size?:        number;
  borderRadius?: number;
  showTitle?:   boolean;
  episodeNum?:  number;
  accentColor?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function EpisodeArtwork({
  title,
  size          = 56,
  borderRadius,
  showTitle     = false,
  episodeNum,
  accentColor,
}: EpisodeArtworkProps) {
  const { gradient, icon } = useMemo(() => {
    if (accentColor) {
      // Build a gradient pair from the accentColor
      return {
        gradient: [accentColor, accentColor + 'CC'] as [string, string],
        icon:     ARTWORK_ICONS[hashString(title) % ARTWORK_ICONS.length],
      };
    }
    return getArtworkForTitle(title);
  }, [title, accentColor]);

  const br = borderRadius ?? size * 0.2;
  const iconSize = Math.round(size * 0.42);
  const epFontSize = Math.max(8, Math.round(size * 0.18));

  return (
    <View style={{ width: size, height: size, borderRadius: br, overflow: 'hidden', flexShrink: 0 }}>
      <LinearGradient
        colors={gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
      >
        <Ionicons name={icon as any} size={iconSize} color="rgba(255,255,255,0.9)" />
        {episodeNum !== undefined && (
          <View style={{
            position: 'absolute', bottom: 4, right: 4,
            backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 4,
            paddingHorizontal: 4, paddingVertical: 1,
          }}>
            <Text style={{ color: '#FFF', fontSize: epFontSize, fontWeight: '700' }}>
              {`Ep ${episodeNum}`}
            </Text>
          </View>
        )}
      </LinearGradient>
    </View>
  );
}