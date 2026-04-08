// src/components/podcast/PodcastCard.tsx
// Part 39 FIX — Show all speaker names (2 or 3) from script.turns
//
// ROOT CAUSE of "3-person podcast shows only 2 names":
//   The hosts line used `podcast.config.hostName & podcast.config.guestName`.
//   config.guestName is always the FIRST guest (legacy V1 field) and has no
//   knowledge of guest2. For V2 3-speaker podcasts, guest2's name lives only
//   inside script.turns[].speakerName where speaker === 'guest2'.
//
// FIX:
//   getSpeakerNames() extracts unique names from script.turns by role order:
//     host → guest1 (or guest) → guest2
//   Falls back to config fields for backward compat with old V1 episodes.
//   Result displayed as "Alex, Sam & Chris" for 3-speaker episodes.

import React                                   from 'react';
import { View, Text, TouchableOpacity, Alert } from 'react-native';
import { Ionicons }                            from '@expo/vector-icons';
import Animated, { FadeInDown, Layout }        from 'react-native-reanimated';
import { COLORS, FONTS, SPACING, RADIUS }      from '../../constants/theme';
import { Podcast }                             from '../../types';
import { WaveformVisualizer }                  from './WaveformVisualizer';
import { EpisodeArtwork }                      from './EpisodeArtwork';

// ─── Speaker name extraction (V1 + V2 compatible) ────────────────────────────

/**
 * Returns an array of speaker display names in order: [host, guest1, guest2?]
 * Works for both V1 (2-speaker) and V2 (3-speaker) podcasts.
 */
function getSpeakerNames(podcast: Podcast): string[] {
  const turns = podcast.script?.turns ?? [];

  // Build a map: role → first speakerName seen for that role
  const nameByRole = new Map<string, string>();
  for (const turn of turns) {
    if (!nameByRole.has(turn.speaker) && turn.speakerName) {
      nameByRole.set(turn.speaker, turn.speakerName);
    }
  }

  const hostName  = nameByRole.get('host')   ?? podcast.config.hostName  ?? 'Host';
  const guest1Name = nameByRole.get('guest1') ?? nameByRole.get('guest') ?? podcast.config.guestName ?? 'Guest';
  const guest2Name = nameByRole.get('guest2') ?? null;

  if (guest2Name) {
    return [hostName, guest1Name, guest2Name];
  }
  return [hostName, guest1Name];
}

/**
 * Format speaker names as a human-readable string.
 *   2 speakers: "Alex & Sam"
 *   3 speakers: "Alex, Sam & Chris"
 */
function formatSpeakerNames(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  // 3+: "A, B & C"
  const last = names[names.length - 1];
  const rest = names.slice(0, -1).join(', ');
  return `${rest} & ${last}`;
}

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
      backgroundColor:   `${color}15`,
      borderRadius:      RADIUS.full,
      paddingHorizontal: 8,
      paddingVertical:   3,
      borderWidth:       1,
      borderColor:       `${color}30`,
      alignSelf:         'flex-start',
    }}>
      <Text style={{ color, fontSize: FONTS.sizes.xs, fontWeight: '600' }}>
        {label}
      </Text>
    </View>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface PodcastCardProps {
  podcast:      Podcast;
  index:        number;
  onPlay:       () => void;
  onShare:      () => void;
  onDelete:     () => void;
  onLongPress?: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PodcastCard({
  podcast,
  index,
  onPlay,
  onShare,
  onDelete,
  onLongPress,
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

  const handleLongPress = onLongPress ?? handleDeletePress;

  const borderColor = isFailed
    ? `${COLORS.error}30`
    : isGenerating
    ? `${COLORS.warning}30`
    : COLORS.border;

  // ── Speaker names (V1 + V2 aware) ─────────────────────────────────────────
  const speakerNames    = getSpeakerNames(podcast);
  const speakersLine    = formatSpeakerNames(speakerNames);
  const is3Speaker      = speakerNames.length >= 3;

  return (
    <Animated.View
      entering={FadeInDown.duration(400).delay(index * 50)}
      layout={Layout.springify()}
    >
      <TouchableOpacity
        onPress={isCompleted ? onPlay : undefined}
        onLongPress={handleLongPress}
        activeOpacity={isCompleted ? 0.75 : 1}
        style={{
          backgroundColor: COLORS.backgroundCard,
          borderRadius:    RADIUS.xl,
          marginBottom:    SPACING.sm,
          borderWidth:     1,
          borderColor,
          overflow:        'hidden',
        }}
      >
        {/* ── Main content row ── */}
        <View style={{
          flexDirection: 'row',
          padding:       SPACING.md,
          gap:           SPACING.md,
        }}>

          {/* Artwork / icon column */}
          <View style={{ flexShrink: 0 }}>
            {isCompleted ? (
              <View style={{
                width:        64,
                height:       64,
                borderRadius: RADIUS.lg,
                overflow:     'hidden',
              }}>
                <EpisodeArtwork
                  title={podcast.title}
                  size={64}
                  borderRadius={RADIUS.lg}
                />
              </View>
            ) : (
              <View style={{
                width:           64,
                height:          64,
                borderRadius:    RADIUS.lg,
                backgroundColor: isFailed
                  ? `${COLORS.error}12`
                  : `${COLORS.warning}12`,
                alignItems:      'center',
                justifyContent:  'center',
                borderWidth:     1,
                borderColor:     isFailed
                  ? `${COLORS.error}25`
                  : `${COLORS.warning}25`,
              }}>
                <Ionicons
                  name={isFailed ? 'alert-circle-outline' : 'radio-outline'}
                  size={26}
                  color={isFailed ? COLORS.error : COLORS.warning}
                />
              </View>
            )}
          </View>

          {/* Text column — gets all remaining width */}
          <View style={{ flex: 1, minWidth: 0, justifyContent: 'center' }}>

            {/* Title — full width, up to 3 lines */}
            <Text
              style={{
                color:        COLORS.textPrimary,
                fontSize:     FONTS.sizes.base,
                fontWeight:   '700',
                lineHeight:   22,
                marginBottom: 4,
              }}
              numberOfLines={3}
            >
              {podcast.title}
            </Text>

            {/* Hosts — shows ALL speaker names (2 or 3) */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 }}>
              <Text
                style={{
                  color:     COLORS.textMuted,
                  fontSize:  FONTS.sizes.xs,
                  flexShrink: 1,
                }}
                numberOfLines={1}
              >
                {speakersLine}
              </Text>
              {is3Speaker && (
                <View style={{
                  backgroundColor:   `${COLORS.accent}15`,
                  borderRadius:      RADIUS.full,
                  paddingHorizontal: 5,
                  paddingVertical:   1,
                  borderWidth:       1,
                  borderColor:       `${COLORS.accent}25`,
                  flexShrink:        0,
                }}>
                  <Text style={{ color: COLORS.accent, fontSize: 9, fontWeight: '700' }}>3 🎙</Text>
                </View>
              )}
            </View>

            {/* Meta chips row */}
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <StatusBadge status={podcast.status} />

              {isCompleted && podcast.durationSeconds > 0 && (
                <View style={{
                  backgroundColor:   `${COLORS.primary}12`,
                  borderRadius:      RADIUS.full,
                  paddingHorizontal: 8,
                  paddingVertical:   2,
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

              <View style={{
                backgroundColor:   `${COLORS.textMuted}12`,
                borderRadius:      RADIUS.full,
                paddingHorizontal: 8,
                paddingVertical:   2,
              }}>
                <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
                  {formatDate(podcast.createdAt)}
                </Text>
              </View>

              {(podcast.script?.turns?.length ?? 0) > 0 && (
                <View style={{
                  backgroundColor:   `${COLORS.textMuted}12`,
                  borderRadius:      RADIUS.full,
                  paddingHorizontal: 8,
                  paddingVertical:   2,
                }}>
                  <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
                    {podcast.script.turns.length} turns
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* Description — full width under the row */}
        {podcast.description ? (
          <Text
            style={{
              color:             COLORS.textSecondary,
              fontSize:          FONTS.sizes.xs,
              lineHeight:        18,
              paddingHorizontal: SPACING.md,
              paddingBottom:     SPACING.sm,
            }}
            numberOfLines={2}
          >
            {podcast.description}
          </Text>
        ) : null}

        {/* ── Action bar ── */}
        {isCompleted && (
          <View style={{
            flexDirection:     'row',
            alignItems:        'center',
            borderTopWidth:    1,
            borderTopColor:    COLORS.border,
            paddingVertical:   10,
            paddingHorizontal: SPACING.md,
            gap:               8,
          }}>

            {/* Play — primary CTA, expands */}
            <TouchableOpacity
              onPress={onPlay}
              activeOpacity={0.8}
              style={{
                flex:            1,
                flexDirection:   'row',
                alignItems:      'center',
                justifyContent:  'center',
                gap:             6,
                backgroundColor: COLORS.primary,
                borderRadius:    RADIUS.lg,
                paddingVertical: 9,
              }}
            >
              <WaveformVisualizer
                isPlaying={false}
                color="#FFF"
                barWidth={2}
                barGap={2}
                maxHeight={14}
              />
              <Text style={{
                color:      '#FFF',
                fontSize:   FONTS.sizes.sm,
                fontWeight: '700',
              }}>
                Play
              </Text>
            </TouchableOpacity>

            {/* Share */}
            <TouchableOpacity
              onPress={onShare}
              activeOpacity={0.8}
              style={{
                width:           40,
                height:          40,
                borderRadius:    RADIUS.lg,
                backgroundColor: `${COLORS.primary}12`,
                alignItems:      'center',
                justifyContent:  'center',
                borderWidth:     1,
                borderColor:     `${COLORS.primary}25`,
              }}
            >
              <Ionicons name="share-outline" size={17} color={COLORS.primary} />
            </TouchableOpacity>

            {/* Delete */}
            <TouchableOpacity
              onPress={handleDeletePress}
              activeOpacity={0.8}
              style={{
                width:           40,
                height:          40,
                borderRadius:    RADIUS.lg,
                backgroundColor: `${COLORS.error}10`,
                alignItems:      'center',
                justifyContent:  'center',
                borderWidth:     1,
                borderColor:     `${COLORS.error}20`,
              }}
            >
              <Ionicons name="trash-outline" size={17} color={COLORS.error} />
            </TouchableOpacity>
          </View>
        )}

        {/* Non-completed delete option */}
        {!isCompleted && (
          <View style={{
            flexDirection:     'row',
            justifyContent:    'flex-end',
            paddingHorizontal: SPACING.md,
            paddingBottom:     SPACING.sm,
          }}>
            <TouchableOpacity
              onPress={handleDeletePress}
              hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, opacity: 0.6 }}
            >
              <Ionicons name="trash-outline" size={14} color={COLORS.textMuted} />
              <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>Remove</Text>
            </TouchableOpacity>
          </View>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}