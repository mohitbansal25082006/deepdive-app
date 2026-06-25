// src/components/workspace/SharedDebateCard.tsx
// Part 16 — Card for displaying a shared debate in the workspace "Shared" tab.
// Part 55.2 — Fully theme-integrated: all hardcoded colors replaced with live
//             COLORS from the theme system. No dark-only assumptions.
// Part 55.5 — Removed Copy, Share, and Export PDF buttons. Only View remains.
// Part 55.6 — Title shown fully without truncation (removed numberOfLines restriction).
// Part 55.7 — Removed view count, download count, and view-only info banner.

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

const ACCENT = '#6C63FF';

interface Props {
  item:          SharedDebate;
  index:         number;
  userRole:      WorkspaceRole | null;
  onView:        (item: SharedDebate) => void;
  onRemove:      (item: SharedDebate) => Promise<void>;
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
        {pNeutral > 0 && <View style={{ flex: pNeutral, backgroundColor: `${COLORS.textMuted}50` }} />}
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

export function SharedDebateCard({
  item,
  index,
  userRole,
  onView,
  onRemove,
}: Props) {
  const [isRemoving, setIsRemoving] = useState(false);

  const isEditor = userRole === 'owner' || userRole === 'editor';

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
          <View style={{
            flexDirection:  'row',
            alignItems:     'flex-start',
            gap:            SPACING.md,
            marginBottom:   SPACING.sm,
          }}>
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

            <View style={{ flex: 1 }}>
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
                  lineHeight: 24,
                }}
              >
                {item.topic}
              </Text>

              {item.question && item.question !== item.topic && (
                <Text
                  style={{
                    color:     COLORS.textMuted,
                    fontSize:  FONTS.sizes.xs,
                    marginTop: 4,
                    fontStyle: 'italic',
                  }}
                  numberOfLines={1}
                >
                  {item.question}
                </Text>
              )}
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

          <StanceMiniBar perspectives={item.perspectives} />

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

          <View style={{
            flexDirection:   'row',
            alignItems:      'center',
            justifyContent:  'space-between',
            paddingTop:      SPACING.sm,
            borderTopWidth:  1,
            borderTopColor:  COLORS.border,
          }}>
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
      </TouchableOpacity>
    </Animated.View>
  );
}