// src/components/workspace/SharedPodcastCard.tsx
// Part 39 FIX — Show all speaker names (2 or 3) extracted from script.turns
// Part 55.2 — Fully theme-integrated: all hardcoded colors replaced with live
//             COLORS from the theme system. No dark-only assumptions.
// Part 55.5 — Removed Download MP3, Export PDF, and Copy Script buttons.
//             Only Play/View remains.
// Part 55.6 — Title shown fully without truncation (removed numberOfLines restriction).
// Part 55.7 — Speakers line shown without truncation.
// Part 55.8 — Removed play count chip and download count chip.

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient }       from 'expo-linear-gradient';
import { Ionicons }              from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { SharedPodcast, WorkspaceRole } from '../../types';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../constants/theme';

const ACCENT = '#FF6584';

function getSpeakerNamesFromScript(item: SharedPodcast): string[] {
  const turns = item.script?.turns ?? [];
  const nameByRole = new Map<string, string>();

  for (const turn of turns) {
    const role = (turn as any).speaker as string;
    if (role && !nameByRole.has(role) && (turn as any).speakerName) {
      nameByRole.set(role, (turn as any).speakerName);
    }
  }

  const hostName   = nameByRole.get('host')   ?? item.hostName  ?? 'Host';
  const guest1Name = nameByRole.get('guest1') ?? nameByRole.get('guest') ?? item.guestName ?? 'Guest';
  const guest2Name = nameByRole.get('guest2') ?? null;

  if (guest2Name) return [hostName, guest1Name, guest2Name];
  return [hostName, guest1Name];
}

function formatSpeakerNames(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  const last = names[names.length - 1];
  const rest = names.slice(0, -1).join(', ');
  return `${rest} & ${last}`;
}

interface Props {
  item:            SharedPodcast;
  index:           number;
  userRole:        WorkspaceRole | null;
  onPlay:          (item: SharedPodcast) => void;
  onRemove:        (item: SharedPodcast) => Promise<void>;
}

function formatDate(iso: string): string {
  const d    = new Date(iso);
  const now  = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (diff < 60)     return 'Just now';
  if (diff < 3600)   return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400)  return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDuration(seconds: number): string {
  if (seconds <= 0) return '';
  const m = Math.round(seconds / 60);
  return m > 0 ? `~${m} min` : `${seconds}s`;
}

export function SharedPodcastCard({
  item,
  index,
  userRole,
  onPlay,
  onRemove,
}: Props) {
  const [isRemoving, setIsRemoving] = useState(false);

  const isEditor = userRole === 'owner' || userRole === 'editor';

  const speakerNames = getSpeakerNamesFromScript(item);
  const speakersLine = formatSpeakerNames(speakerNames);
  const is3Speaker   = speakerNames.length >= 3;

  const handleRemove = () => {
    Alert.alert(
      'Remove Podcast',
      `Remove "${item.title}" from this workspace? The episode itself won't be deleted.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove', style: 'destructive',
          onPress: async () => {
            setIsRemoving(true);
            await onRemove(item);
            setIsRemoving(false);
          },
        },
      ],
    );
  };

  const hasAudio = item.audioSegmentPaths && item.audioSegmentPaths.filter(Boolean).length > 0;

  return (
    <Animated.View entering={FadeInDown.duration(400).delay(index * 60)}>
      <TouchableOpacity
        onPress={() => onPlay(item)}
        activeOpacity={0.82}
        style={{
          backgroundColor: COLORS.backgroundCard,
          borderRadius:    RADIUS.xl,
          marginBottom:    SPACING.md,
          borderWidth:     1,
          borderColor:     `${ACCENT}22`,
          overflow:        'hidden',
          ...SHADOWS.medium,
        }}
      >
        <LinearGradient
          colors={['#FF6584', '#FF8FA3']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ height: 3, width: '100%' }}
        />

        <View style={{ padding: SPACING.md }}>
          <View style={{
            flexDirection: 'row',
            alignItems:    'flex-start',
            gap:           SPACING.md,
            marginBottom:  SPACING.sm,
          }}>
            <LinearGradient
              colors={['#FF6584', '#FF8FA3']}
              style={{
                width:          48,
                height:         48,
                borderRadius:   14,
                alignItems:     'center',
                justifyContent: 'center',
                flexShrink:     0,
                ...SHADOWS.small,
              }}
            >
              <Ionicons name="mic" size={22} color="#FFF" />
            </LinearGradient>

            <View style={{ flex: 1 }}>
              <View style={{
                flexDirection: 'row',
                alignItems:    'center',
                gap:           5,
                marginBottom:  4,
                flexWrap:      'wrap',
              }}>
                <View style={{
                  backgroundColor:   `${ACCENT}18`,
                  borderRadius:      RADIUS.full,
                  paddingHorizontal: 7,
                  paddingVertical:   2,
                  flexDirection:     'row',
                  alignItems:        'center',
                  gap:               3,
                  borderWidth:       1,
                  borderColor:       `${ACCENT}30`,
                }}>
                  <Ionicons name="mic" size={9} color={ACCENT} />
                  <Text style={{
                    color:         ACCENT,
                    fontSize:      9,
                    fontWeight:    '700',
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                  }}>
                    Podcast Episode
                  </Text>
                </View>

                {is3Speaker && (
                  <View style={{
                    backgroundColor:   `${COLORS.accent}15`,
                    borderRadius:      RADIUS.full,
                    paddingHorizontal: 6,
                    paddingVertical:   2,
                    borderWidth:       1,
                    borderColor:       `${COLORS.accent}25`,
                  }}>
                    <Text style={{ color: COLORS.accent, fontSize: 9, fontWeight: '700' }}>3 🎙</Text>
                  </View>
                )}
              </View>

              {/* Title - fully shown without truncation */}
              <Text
                style={{
                  color:      COLORS.textPrimary,
                  fontSize:   FONTS.sizes.base,
                  fontWeight: '800',
                  lineHeight: 24,
                }}
              >
                {item.title}
              </Text>

              {/* Speakers - fully shown without truncation */}
              <Text
                style={{
                  color:     COLORS.textMuted,
                  fontSize:  FONTS.sizes.xs,
                  marginTop: 4,
                }}
              >
                {speakersLine}
              </Text>
            </View>

            {isEditor && (
              <TouchableOpacity
                onPress={handleRemove}
                disabled={isRemoving}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={{
                  width:           28,
                  height:          28,
                  borderRadius:    8,
                  backgroundColor: `${COLORS.error}12`,
                  alignItems:      'center',
                  justifyContent:  'center',
                  borderWidth:     1,
                  borderColor:     `${COLORS.error}25`,
                  flexShrink:      0,
                }}
              >
                {isRemoving
                  ? <ActivityIndicator size="small" color={COLORS.error} />
                  : <Ionicons name="close-outline" size={15} color={COLORS.error} />}
              </TouchableOpacity>
            )}
          </View>

          <View style={{
            flexDirection: 'row',
            flexWrap:      'wrap',
            gap:           6,
            marginBottom:  SPACING.sm,
          }}>
            {item.durationSeconds > 0 && (
              <MetaChip icon="time-outline" label={formatDuration(item.durationSeconds)} />
            )}
            {item.wordCount > 0 && (
              <MetaChip icon="text-outline" label={`${item.wordCount.toLocaleString()} words`} />
            )}
            {!hasAudio && (
              <MetaChip
                icon="alert-circle-outline"
                label="Audio unavailable on device"
                color={COLORS.warning}
              />
            )}
          </View>

          <View style={{
            flexDirection:  'row',
            alignItems:     'center',
            justifyContent: 'space-between',
            paddingTop:     SPACING.sm,
            borderTopWidth: 1,
            borderTopColor: COLORS.border,
          }}>
            <View style={{
              flexDirection: 'row',
              alignItems:    'center',
              gap:           6,
              flex:          1,
            }}>
              <View style={{
                width:          24,
                height:         24,
                borderRadius:   8,
                backgroundColor: `${ACCENT}18`,
                alignItems:     'center',
                justifyContent: 'center',
                flexShrink:     0,
              }}>
                <Ionicons name="person-outline" size={12} color={ACCENT} />
              </View>
              <Text
                style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, flex: 1 }}
                numberOfLines={1}
              >
                {item.sharerName ?? 'Someone'} · {formatDate(item.sharedAt)}
              </Text>
            </View>

            <TouchableOpacity
              onPress={() => onPlay(item)}
              style={{
                flexDirection:     'row',
                alignItems:        'center',
                gap:               4,
                backgroundColor:   `${ACCENT}15`,
                borderRadius:      RADIUS.md,
                paddingHorizontal: 10,
                paddingVertical:   5,
                borderWidth:       1,
                borderColor:       `${ACCENT}30`,
              }}
            >
              <Ionicons name="play-circle-outline" size={13} color={ACCENT} />
              <Text style={{ color: ACCENT, fontSize: 10, fontWeight: '700' }}>
                {hasAudio ? 'Play' : 'View'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

function MetaChip({
  icon, label, color = COLORS.textMuted,
}: { icon: string; label: string; color?: string }) {
  return (
    <View style={{
      flexDirection:     'row',
      alignItems:        'center',
      gap:               4,
      backgroundColor:   COLORS.backgroundElevated,
      borderRadius:      RADIUS.full,
      paddingHorizontal: 8,
      paddingVertical:   3,
      borderWidth:       1,
      borderColor:       COLORS.border,
    }}>
      <Ionicons name={icon as any} size={10} color={color} />
      <Text style={{ color, fontSize: 10, fontWeight: '600' }}>{label}</Text>
    </View>
  );
}