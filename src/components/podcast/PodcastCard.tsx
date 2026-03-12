// src/components/podcast/PodcastCard.tsx
// Part 8 — Updated: added onShare prop and share button on completed cards.

import React                                   from 'react';
import { View, Text, TouchableOpacity, Alert } from 'react-native';
import { Ionicons }                            from '@expo/vector-icons';
import Animated, { FadeInDown, Layout }        from 'react-native-reanimated';
import { COLORS, FONTS, SPACING, RADIUS }      from '../../constants/theme';
import { Podcast }                             from '../../types';
import { WaveformVisualizer }                  from './WaveformVisualizer';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  if (seconds <= 0) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m} min`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: Podcast['status'] }) {
  if (status === 'completed') return null;

  const label =
    status === 'generating_script' ? 'Writing script...'   :
    status === 'generating_audio'  ? 'Generating audio...' :
    status === 'failed'            ? 'Failed'              :
    'Pending';

  const color = status === 'failed' ? COLORS.error : COLORS.warning;

  return (
    <View style={{
      backgroundColor:  `${color}15`,
      borderRadius:     RADIUS.full,
      paddingHorizontal: 8,
      paddingVertical:   3,
      borderWidth:       1,
      borderColor:       `${color}30`,
    }}>
      <Text style={{ color, fontSize: FONTS.sizes.xs, fontWeight: '600' }}>
        {label}
      </Text>
    </View>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface PodcastCardProps {
  podcast:  Podcast;
  index:    number;
  onPlay:   () => void;
  onShare:  () => void;   // NEW
  onDelete: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PodcastCard({
  podcast,
  index,
  onPlay,
  onShare,
  onDelete,
}: PodcastCardProps) {
  const isCompleted  = podcast.status === 'completed';
  const isFailed     = podcast.status === 'failed';
  const isGenerating =
    podcast.status === 'generating_script' ||
    podcast.status === 'generating_audio';

  const handleDeletePress = () => {
    Alert.alert(
      'Delete Episode',
      `Delete "${podcast.title}"?\n\nThis will also remove the downloaded audio files.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: onDelete },
      ]
    );
  };

  return (
    <Animated.View
      entering={FadeInDown.duration(400).delay(index * 50)}
      layout={Layout.springify()}
    >
      <TouchableOpacity
        onPress={isCompleted ? onPlay : undefined}
        onLongPress={handleDeletePress}
        activeOpacity={isCompleted ? 0.75 : 1}
        style={{
          backgroundColor: COLORS.backgroundCard,
          borderRadius:    RADIUS.xl,
          padding:         SPACING.md,
          marginBottom:    SPACING.sm,
          borderWidth:     1,
          borderColor:     isFailed
            ? `${COLORS.error}30`
            : isGenerating
            ? `${COLORS.warning}30`
            : COLORS.border,
        }}
      >
        {/* ── Top row ── */}
        <View style={{
          flexDirection: 'row',
          alignItems:    'flex-start',
          marginBottom:  SPACING.sm,
        }}>

          {/* Icon */}
          <View style={{
            width:           48,
            height:          48,
            borderRadius:    14,
            backgroundColor: `${COLORS.primary}15`,
            alignItems:      'center',
            justifyContent:  'center',
            marginRight:     SPACING.sm,
            borderWidth:     1,
            borderColor:     `${COLORS.primary}25`,
          }}>
            {isCompleted ? (
              <WaveformVisualizer
                isPlaying={false}
                color={COLORS.primary}
                barWidth={3}
                barGap={2}
                maxHeight={24}
              />
            ) : isFailed ? (
              <Ionicons
                name="alert-circle-outline"
                size={22}
                color={COLORS.error}
              />
            ) : (
              <Ionicons
                name="radio-outline"
                size={22}
                color={COLORS.warning}
              />
            )}
          </View>

          {/* Title + date */}
          <View style={{ flex: 1, marginRight: SPACING.sm }}>
            <Text
              style={{
                color:      COLORS.textPrimary,
                fontSize:   FONTS.sizes.base,
                fontWeight: '700',
                lineHeight: 20,
              }}
              numberOfLines={2}
            >
              {podcast.title}
            </Text>
            <Text style={{
              color:     COLORS.textMuted,
              fontSize:  FONTS.sizes.xs,
              marginTop: 3,
            }}>
              {formatDate(podcast.createdAt)}
            </Text>
          </View>

          {/* Action buttons */}
          <View style={{
            flexDirection: 'row',
            alignItems:    'center',
            gap:           6,
          }}>
            {/* Share — only for completed episodes */}
            {isCompleted && (
              <TouchableOpacity
                onPress={onShare}
                hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                style={{
                  width:           34,
                  height:          34,
                  borderRadius:    10,
                  backgroundColor: `${COLORS.primary}15`,
                  alignItems:      'center',
                  justifyContent:  'center',
                  borderWidth:     1,
                  borderColor:     `${COLORS.primary}25`,
                }}
              >
                <Ionicons
                  name="share-outline"
                  size={16}
                  color={COLORS.primary}
                />
              </TouchableOpacity>
            )}

            {/* Play */}
            {isCompleted && (
              <TouchableOpacity
                onPress={onPlay}
                style={{
                  width:           38,
                  height:          38,
                  borderRadius:    19,
                  backgroundColor: COLORS.primary,
                  alignItems:      'center',
                  justifyContent:  'center',
                }}
              >
                <Ionicons name="play" size={16} color="#FFF" />
              </TouchableOpacity>
            )}

            {/* Delete */}
            <TouchableOpacity
              onPress={handleDeletePress}
              hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
              style={{ padding: 4 }}
            >
              <Ionicons
                name="trash-outline"
                size={18}
                color={COLORS.textMuted}
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* Description */}
        {podcast.description ? (
          <Text
            style={{
              color:        COLORS.textSecondary,
              fontSize:     FONTS.sizes.xs,
              lineHeight:   18,
              marginBottom: SPACING.sm,
            }}
            numberOfLines={2}
          >
            {podcast.description}
          </Text>
        ) : null}

        {/* Meta chips */}
        <View style={{
          flexDirection: 'row',
          gap:           6,
          flexWrap:      'wrap',
          alignItems:    'center',
        }}>
          <StatusBadge status={podcast.status} />

          {isCompleted && podcast.durationSeconds > 0 && (
            <View style={{
              backgroundColor:  `${COLORS.primary}12`,
              borderRadius:     RADIUS.full,
              paddingHorizontal: 9,
              paddingVertical:   3,
            }}>
              <Text style={{
                color:      COLORS.primary,
                fontSize:   FONTS.sizes.xs,
                fontWeight: '600',
              }}>
                {formatDuration(podcast.durationSeconds)}
              </Text>
            </View>
          )}

          {(podcast.script?.turns?.length ?? 0) > 0 && (
            <View style={{
              backgroundColor:  `${COLORS.textMuted}15`,
              borderRadius:     RADIUS.full,
              paddingHorizontal: 9,
              paddingVertical:   3,
            }}>
              <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
                {podcast.script.turns.length} turns
              </Text>
            </View>
          )}

          <View style={{
            backgroundColor:  `${COLORS.textMuted}10`,
            borderRadius:     RADIUS.full,
            paddingHorizontal: 9,
            paddingVertical:   3,
          }}>
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
              {podcast.config.hostName} & {podcast.config.guestName}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}