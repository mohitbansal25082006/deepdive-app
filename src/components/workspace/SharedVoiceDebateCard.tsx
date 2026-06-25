// src/components/workspace/SharedVoiceDebateCard.tsx
// Part 44 — Card for displaying a shared voice debate in the workspace "Shared" tab.
// Part 55.2 — Fully theme-integrated: all hardcoded colors replaced with live
//             COLORS from the theme system. No dark-only assumptions.
// Part 55.5 — Removed Copy Text button. Only Play/Transcript and Export PDF remain.
// Part 55.6 — Title shown fully without truncation (removed numberOfLines restriction).
// Part 55.7 — Removed subtitle/question display and view-only info banner.
// Part 55.8 — All speaker chips shown without "+ more" truncation.
// Part 55.9 — Removed view count chip.

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient }    from 'expo-linear-gradient';
import { Ionicons }           from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';

import type { SharedVoiceDebate } from '../../types/voiceDebateSharing';
import type { WorkspaceRole }     from '../../types';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../constants/theme';

const ACCENT = '#8B5CF6';

interface Props {
  item:         SharedVoiceDebate;
  index:        number;
  userRole:     WorkspaceRole | null;
  onPlay:       (item: SharedVoiceDebate) => void;
  onRemove:     (item: SharedVoiceDebate) => Promise<void>;
  onExportPDF?: (item: SharedVoiceDebate) => Promise<void>;
}

function formatDate(iso: string): string {
  const d    = new Date(iso);
  const now  = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (diff < 60)    return 'Just now';
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDuration(seconds: number): string {
  if (seconds <= 0) return '';
  const m = Math.round(seconds / 60);
  return m > 0 ? `~${m} min` : `${seconds}s`;
}

function getSpeakerNames(item: SharedVoiceDebate): string[] {
  const turns = item.script?.turns ?? [];
  const names = new Map<string, string>();
  for (const turn of turns) {
    const role = (turn as any).speaker as string;
    const name = (turn as any).speakerName as string;
    if (role && name && !names.has(role)) {
      names.set(role, name);
    }
  }
  return Array.from(names.values());
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

const actionBtnStyle = {
  width:           30,
  height:          30,
  borderRadius:    8,
  backgroundColor: COLORS.backgroundElevated,
  alignItems:      'center' as const,
  justifyContent:  'center' as const,
  borderWidth:     1,
  borderColor:     COLORS.border,
};

export function SharedVoiceDebateCard({
  item,
  index,
  userRole,
  onPlay,
  onRemove,
  onExportPDF,
}: Props) {
  const [isRemoving,     setIsRemoving]     = useState(false);
  const [isExportingPDF, setIsExportingPDF] = useState(false);

  const isEditor    = userRole === 'owner' || userRole === 'editor';
  const hasAudio    = item.audioAllUploaded && item.audioStorageUrls.filter(Boolean).length > 0;
  const speakerNames = getSpeakerNames(item);

  const handleRemove = () => {
    Alert.alert(
      'Remove Voice Debate',
      `Remove "${item.topic.slice(0, 60)}" from this workspace? The voice debate itself won't be deleted.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text:  'Remove',
          style: 'destructive',
          onPress: async () => {
            setIsRemoving(true);
            await onRemove(item);
            setIsRemoving(false);
          },
        },
      ],
    );
  };

  const handleExportPDF = async () => {
    if (!onExportPDF || isExportingPDF) return;
    setIsExportingPDF(true);
    await onExportPDF(item);
    setIsExportingPDF(false);
  };

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
          colors={['#8B5CF6', '#A78BFA']}
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
              colors={['#8B5CF6', '#A78BFA']}
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
              <Ionicons name="mic-circle" size={24} color="#FFF" />
            </LinearGradient>

            <View style={{ flex: 1 }}>
              <View style={{
                flexDirection:     'row',
                alignItems:        'center',
                gap:               5,
                marginBottom:      4,
                flexWrap:          'wrap',
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
                  <Ionicons name="mic-outline" size={9} color={ACCENT} />
                  <Text style={{
                    color:         ACCENT,
                    fontSize:      9,
                    fontWeight:    '700',
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                  }}>
                    Voice Debate
                  </Text>
                </View>

                {!hasAudio && (
                  <View style={{
                    backgroundColor:   `${COLORS.warning}15`,
                    borderRadius:      RADIUS.full,
                    paddingHorizontal: 6,
                    paddingVertical:   2,
                    borderWidth:       1,
                    borderColor:       `${COLORS.warning}30`,
                  }}>
                    <Text style={{ color: COLORS.warning, fontSize: 9, fontWeight: '700' }}>
                      Audio uploading
                    </Text>
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
                {item.topic}
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
                  : <Ionicons name="close-outline" size={15} color={COLORS.error} />
                }
              </TouchableOpacity>
            )}
          </View>

          <View style={{
            flexDirection: 'row',
            flexWrap:      'wrap',
            gap:           6,
            marginBottom:  SPACING.sm,
          }}>
            {item.totalTurns > 0 && (
              <MetaChip icon="chatbubbles-outline" label={`${item.totalTurns} turns`} />
            )}
            {item.durationSeconds > 0 && (
              <MetaChip icon="time-outline" label={formatDuration(item.durationSeconds)} />
            )}
            {item.downloadCount > 0 && (
              <MetaChip
                icon="download-outline"
                label={`${item.downloadCount} download${item.downloadCount !== 1 ? 's' : ''}`}
                color={COLORS.primary}
              />
            )}
          </View>

          {/* All speaker chips - no truncation */}
          {speakerNames.length > 0 && (
            <View style={{
              flexDirection: 'row',
              flexWrap:      'wrap',
              gap:           5,
              marginBottom:  SPACING.sm,
            }}>
              {speakerNames.map((name, i) => (
                <View
                  key={i}
                  style={{
                    backgroundColor:   `${ACCENT}10`,
                    borderRadius:      RADIUS.full,
                    paddingHorizontal: 8,
                    paddingVertical:   3,
                    borderWidth:       1,
                    borderColor:       `${ACCENT}22`,
                    flexDirection:     'row',
                    alignItems:        'center',
                    gap:               4,
                  }}
                >
                  <View style={{
                    width:           6,
                    height:          6,
                    borderRadius:    3,
                    backgroundColor: ACCENT,
                    opacity:         0.7,
                  }} />
                  <Text style={{ color: ACCENT, fontSize: 10, fontWeight: '600' }}>
                    {name}
                  </Text>
                </View>
              ))}
            </View>
          )}

          <View style={{
            flexDirection:   'row',
            alignItems:      'center',
            justifyContent:  'space-between',
            paddingTop:      SPACING.sm,
            borderTopWidth:  1,
            borderTopColor:  COLORS.border,
          }}>
            <View style={{
              flexDirection: 'row',
              alignItems:    'center',
              gap:           6,
              flex:          1,
            }}>
              <View style={{
                width:           24,
                height:          24,
                borderRadius:    8,
                backgroundColor: `${ACCENT}18`,
                alignItems:      'center',
                justifyContent:  'center',
                flexShrink:      0,
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

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {onExportPDF && (
                <TouchableOpacity
                  onPress={handleExportPDF}
                  disabled={isExportingPDF}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={actionBtnStyle}
                >
                  {isExportingPDF
                    ? <ActivityIndicator size="small" color={COLORS.textMuted} />
                    : <Ionicons name="document-text-outline" size={13} color={COLORS.textMuted} />
                  }
                </TouchableOpacity>
              )}

              <TouchableOpacity
                onPress={() => onPlay(item)}
                style={{
                  flexDirection:     'row',
                  alignItems:        'center',
                  gap:               4,
                  backgroundColor:   hasAudio ? `${ACCENT}15` : `${COLORS.textMuted}10`,
                  borderRadius:      RADIUS.md,
                  paddingHorizontal: 10,
                  paddingVertical:   5,
                  borderWidth:       1,
                  borderColor:       hasAudio ? `${ACCENT}30` : COLORS.border,
                }}
              >
                <Ionicons
                  name={hasAudio ? 'play-circle-outline' : 'eye-outline'}
                  size={13}
                  color={hasAudio ? ACCENT : COLORS.textMuted}
                />
                <Text style={{
                  color:      hasAudio ? ACCENT : COLORS.textMuted,
                  fontSize:   10,
                  fontWeight: '700',
                }}>
                  {hasAudio ? 'Play' : 'Transcript'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}