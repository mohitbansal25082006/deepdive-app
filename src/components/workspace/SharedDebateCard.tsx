// src/components/workspace/SharedDebateCard.tsx
// Part 16 — Card for displaying a shared debate in the workspace "Shared" tab.
//
// Shows: topic, question, agent count, sources, stance distribution,
//        sharer info, action buttons (View, PDF, Copy, Remove).
// Members can: View (opens debate viewer), Export PDF, Copy text.
// Editors/owners can also: Remove from workspace.
// Nobody can: Re-generate the debate from this card.

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

import { SharedDebate, WorkspaceRole } from '../../types';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../constants/theme';

// ─── Accent colour for debate ─────────────────────────────────────────────────

const ACCENT = '#6C63FF';

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  item:          SharedDebate;
  index:         number;
  userRole:      WorkspaceRole | null;
  onView:        (item: SharedDebate) => void;
  onRemove:      (item: SharedDebate) => Promise<void>;
  onExportPDF?:  (item: SharedDebate) => Promise<void>;
  onCopyText?:   (item: SharedDebate) => Promise<void>;
  onShareText?:  (item: SharedDebate) => Promise<void>;
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

// ─── Stance mini-bar ──────────────────────────────────────────────────────────

function StanceMiniBar({ perspectives }: { perspectives: SharedDebate['perspectives'] }) {
  if (!perspectives?.length) return null;

  const total        = perspectives.length;
  const forCount     = perspectives.filter(
    p => p.stanceType === 'for' || p.stanceType === 'strongly_for',
  ).length;
  const againstCount = perspectives.filter(
    p => p.stanceType === 'against' || p.stanceType === 'strongly_against',
  ).length;
  const neutralCount = total - forCount - againstCount;

  const pFor     = Math.round((forCount     / total) * 100);
  const pAgainst = Math.round((againstCount / total) * 100);
  const pNeutral = 100 - pFor - pAgainst;

  return (
    <View style={{ gap: 4, marginBottom: SPACING.sm }}>
      <View style={{
        flexDirection: 'row',
        height:        6,
        borderRadius:  3,
        overflow:      'hidden',
        gap:           1,
      }}>
        {pFor     > 0 && <View style={{ flex: pFor,     backgroundColor: COLORS.success }} />}
        {pNeutral > 0 && <View style={{ flex: pNeutral, backgroundColor: COLORS.textMuted + '50' }} />}
        {pAgainst > 0 && <View style={{ flex: pAgainst, backgroundColor: COLORS.secondary }} />}
      </View>
      <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
        {forCount     > 0 && <StancePill color={COLORS.success}   label={`${forCount} for`}     />}
        {neutralCount > 0 && <StancePill color={COLORS.textMuted} label={`${neutralCount} neutral`} />}
        {againstCount > 0 && <StancePill color={COLORS.secondary} label={`${againstCount} against`} />}
      </View>
    </View>
  );
}

function StancePill({ color, label }: { color: string; label: string }) {
  return (
    <View style={{
      flexDirection:     'row',
      alignItems:        'center',
      gap:               4,
      backgroundColor:   `${color}12`,
      borderRadius:      RADIUS.full,
      paddingHorizontal: 7,
      paddingVertical:   2,
    }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
      <Text style={{ color, fontSize: 9, fontWeight: '700' }}>{label}</Text>
    </View>
  );
}

// ─── Action button ────────────────────────────────────────────────────────────

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

export function SharedDebateCard({
  item,
  index,
  userRole,
  onView,
  onRemove,
  onExportPDF,
  onCopyText,
  onShareText,
}: Props) {
  const [isRemoving,     setIsRemoving]     = useState(false);
  const [isExportingPDF, setIsExportingPDF] = useState(false);
  const [isCopying,      setIsCopying]      = useState(false);
  const [isSharing,      setIsSharing]      = useState(false);
  const [copied,         setCopied]         = useState(false);

  const isEditor = userRole === 'owner' || userRole === 'editor';

  // Agent colour dots (up to 6)
  const agentColors = (item.perspectives ?? [])
    .slice(0, 6)
    .map(p => p.color)
    .filter(Boolean);

  const handleRemove = () => {
    Alert.alert(
      'Remove Debate',
      `Remove "${item.topic.slice(0, 60)}" from this workspace? The debate itself won't be deleted.`,
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

  const handleShare = async () => {
    if (!onShareText || isSharing) return;
    setIsSharing(true);
    await onShareText(item);
    setIsSharing(false);
  };

  return (
    <Animated.View entering={FadeInDown.duration(400).delay(index * 60)}>
      <TouchableOpacity
        onPress={() => onView(item)}
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
        {/* Agent colour strip at top */}
        {agentColors.length > 0 ? (
          <View style={{ flexDirection: 'row', height: 3 }}>
            {agentColors.map((color, i) => (
              <View key={i} style={{ flex: 1, backgroundColor: color }} />
            ))}
          </View>
        ) : (
          <LinearGradient
            colors={[ACCENT, '#8B5CF6']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ height: 3, width: '100%' }}
          />
        )}

        <View style={{ padding: SPACING.md }}>
          {/* Header row */}
          <View style={{
            flexDirection:  'row',
            alignItems:     'flex-start',
            gap:            SPACING.md,
            marginBottom:   SPACING.sm,
          }}>
            {/* Icon */}
            <LinearGradient
              colors={[ACCENT, '#8B5CF6']}
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
              <Ionicons name="people" size={22} color="#FFF" />
            </LinearGradient>

            {/* Title block */}
            <View style={{ flex: 1 }}>
              {/* Type badge */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 }}>
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
                  <Ionicons name="people-outline" size={9} color={ACCENT} />
                  <Text style={{
                    color: ACCENT, fontSize: 9, fontWeight: '700',
                    textTransform: 'uppercase', letterSpacing: 0.5,
                  }}>
                    AI Debate
                  </Text>
                </View>
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

          {/* Stance distribution bar */}
          <StanceMiniBar perspectives={item.perspectives} />

          {/* Agent avatar dots */}
          {agentColors.length > 0 && (
            <View style={{
              flexDirection: 'row',
              alignItems:    'center',
              gap:           SPACING.sm,
              marginBottom:  SPACING.sm,
            }}>
              <View style={{ flexDirection: 'row', gap: -4 }}>
                {agentColors.map((color, i) => (
                  <View
                    key={i}
                    style={{
                      width:           20,
                      height:          20,
                      borderRadius:    10,
                      backgroundColor: `${color}25`,
                      borderWidth:     2,
                      borderColor:     COLORS.backgroundCard,
                      alignItems:      'center',
                      justifyContent:  'center',
                      marginLeft:      i > 0 ? -5 : 0,
                      zIndex:          agentColors.length - i,
                    }}
                  >
                    <View style={{
                      width:           7,
                      height:          7,
                      borderRadius:    4,
                      backgroundColor: color,
                    }} />
                  </View>
                ))}
              </View>
              <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
                {item.perspectives?.length ?? 0} perspectives · {item.searchResultsCount} sources
              </Text>
            </View>
          )}

          {/* Stats row */}
          {(item.viewCount > 0 || item.downloadCount > 0) && (
            <View style={{
              flexDirection:  'row',
              gap:            6,
              marginBottom:   SPACING.sm,
              flexWrap:       'wrap',
            }}>
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
          )}

          {/* View-only notice */}
          <View style={{
            flexDirection:   'row',
            alignItems:      'center',
            gap:             5,
            backgroundColor: `${COLORS.info}08`,
            borderRadius:    RADIUS.md,
            paddingHorizontal: 8,
            paddingVertical:  4,
            marginBottom:    SPACING.sm,
            borderWidth:     1,
            borderColor:     `${COLORS.info}15`,
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
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
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
              {/* Export PDF */}
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

              {/* Copy text */}
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

              {/* Share text */}
              {onShareText && (
                <TouchableOpacity
                  onPress={handleShare}
                  disabled={isSharing}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={actionBtnStyle}
                >
                  {isSharing
                    ? <ActivityIndicator size="small" color={COLORS.textMuted} />
                    : <Ionicons name="share-outline" size={13} color={COLORS.textMuted} />
                  }
                </TouchableOpacity>
              )}

              {/* View button */}
              <TouchableOpacity
                onPress={() => onView(item)}
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
                <Ionicons name="open-outline" size={13} color={ACCENT} />
                <Text style={{ color: ACCENT, fontSize: 10, fontWeight: '700' }}>
                  View
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── MetaChip ─────────────────────────────────────────────────────────────────

function MetaChip({
  icon,
  label,
  color = COLORS.textMuted,
}: {
  icon:   string;
  label:  string;
  color?: string;
}) {
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