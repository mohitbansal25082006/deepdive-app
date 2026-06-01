// src/components/workspace/SharedVoiceDebateCard.tsx
// Part 44 — Card for displaying a shared voice debate in the workspace "Shared" tab.
//
// Shows: topic, question, turn count, duration, speaker chips, sharer info,
//        action buttons (Play, Export PDF, Copy, Remove).
// Members can: Play (opens voice debate player), Export PDF, Copy transcript.
// Editors/owners can also: Remove from workspace.
// No re-generation from this card.

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

// ─── Accent colour for voice debates ─────────────────────────────────────────

const ACCENT = '#8B5CF6';   // purple — voice/audio

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  item:         SharedVoiceDebate;
  index:        number;
  userRole:     WorkspaceRole | null;
  onPlay:       (item: SharedVoiceDebate) => void;
  onRemove:     (item: SharedVoiceDebate) => Promise<void>;
  onExportPDF?: (item: SharedVoiceDebate) => Promise<void>;
  onCopyText?:  (item: SharedVoiceDebate) => Promise<void>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── Speaker chips from script turns ─────────────────────────────────────────

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
  return Array.from(names.values()).slice(0, 7); // cap at 7 agent names
}

// ─── MetaChip ─────────────────────────────────────────────────────────────────

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

// ─── Action button style ──────────────────────────────────────────────────────

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

// ─── Main component ───────────────────────────────────────────────────────────

export function SharedVoiceDebateCard({
  item,
  index,
  userRole,
  onPlay,
  onRemove,
  onExportPDF,
  onCopyText,
}: Props) {
  const [isRemoving,     setIsRemoving]     = useState(false);
  const [isExportingPDF, setIsExportingPDF] = useState(false);
  const [isCopying,      setIsCopying]      = useState(false);
  const [copied,         setCopied]         = useState(false);

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

  const handleCopy = async () => {
    if (!onCopyText || isCopying) return;
    setIsCopying(true);
    await onCopyText(item);
    setIsCopying(false);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
        {/* Top accent bar */}
        <LinearGradient
          colors={['#8B5CF6', '#A78BFA']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ height: 3, width: '100%' }}
        />

        <View style={{ padding: SPACING.md }}>
          {/* Header row */}
          <View style={{
            flexDirection: 'row',
            alignItems:    'flex-start',
            gap:           SPACING.md,
            marginBottom:  SPACING.sm,
          }}>
            {/* Icon */}
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

            {/* Title block */}
            <View style={{ flex: 1 }}>
              {/* Type badge */}
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

              <Text
                style={{
                  color:      COLORS.textPrimary,
                  fontSize:   FONTS.sizes.base,
                  fontWeight: '800',
                  lineHeight: 22,
                }}
                numberOfLines={2}
              >
                {item.topic}
              </Text>

              {item.question && item.question !== item.topic && (
                <Text
                  style={{
                    color:     COLORS.textMuted,
                    fontSize:  FONTS.sizes.xs,
                    marginTop: 3,
                    fontStyle: 'italic',
                  }}
                  numberOfLines={1}
                >
                  {item.question}
                </Text>
              )}
            </View>

            {/* Remove button (editors/owners only) */}
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

          {/* Meta chips */}
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
            {item.viewCount > 0 && (
              <MetaChip
                icon="eye-outline"
                label={`${item.viewCount} view${item.viewCount !== 1 ? 's' : ''}`}
                color={ACCENT}
              />
            )}
            {item.downloadCount > 0 && (
              <MetaChip
                icon="download-outline"
                label={`${item.downloadCount} download${item.downloadCount !== 1 ? 's' : ''}`}
                color={COLORS.primary}
              />
            )}
          </View>

          {/* Speaker name chips (up to 4) */}
          {speakerNames.length > 0 && (
            <View style={{
              flexDirection: 'row',
              flexWrap:      'wrap',
              gap:           5,
              marginBottom:  SPACING.sm,
            }}>
              {speakerNames.slice(0, 4).map((name, i) => (
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
              {speakerNames.length > 4 && (
                <View style={{
                  backgroundColor:   COLORS.backgroundElevated,
                  borderRadius:      RADIUS.full,
                  paddingHorizontal: 8,
                  paddingVertical:   3,
                  borderWidth:       1,
                  borderColor:       COLORS.border,
                }}>
                  <Text style={{ color: COLORS.textMuted, fontSize: 10 }}>
                    +{speakerNames.length - 4} more
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* View-only notice */}
          <View style={{
            flexDirection:     'row',
            alignItems:        'center',
            gap:               5,
            backgroundColor:   `${COLORS.info}08`,
            borderRadius:      RADIUS.md,
            paddingHorizontal: 8,
            paddingVertical:   4,
            marginBottom:      SPACING.sm,
            borderWidth:       1,
            borderColor:       `${COLORS.info}15`,
          }}>
            <Ionicons name="eye-outline" size={11} color={COLORS.info} />
            <Text style={{ color: COLORS.info, fontSize: 9, fontWeight: '600' }}>
              View &amp; export only — re-generation not available
            </Text>
          </View>

          {/* Footer row */}
          <View style={{
            flexDirection:   'row',
            alignItems:      'center',
            justifyContent:  'space-between',
            paddingTop:      SPACING.sm,
            borderTopWidth:  1,
            borderTopColor:  COLORS.border,
          }}>
            {/* Sharer info */}
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

            {/* Action buttons */}
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

              {onCopyText && (
                <TouchableOpacity
                  onPress={handleCopy}
                  disabled={isCopying}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={actionBtnStyle}
                >
                  {isCopying
                    ? <ActivityIndicator size="small" color={COLORS.textMuted} />
                    : <Ionicons
                        name={copied ? 'checkmark-circle-outline' : 'copy-outline'}
                        size={13}
                        color={copied ? COLORS.success : COLORS.textMuted}
                      />
                  }
                </TouchableOpacity>
              )}

              {/* Play button */}
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