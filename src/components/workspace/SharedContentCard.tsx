// src/components/workspace/SharedContentCard.tsx
// Part 14 — Card for displaying a shared presentation or academic paper
// inside the workspace "Shared" tab.

import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, Alert, ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SharedWorkspaceContent, WorkspaceRole } from '../../types';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../constants/theme';

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  item:        SharedWorkspaceContent;
  index:       number;
  userRole:    WorkspaceRole | null;
  onOpen:      (item: SharedWorkspaceContent) => void;
  onRemove:    (item: SharedWorkspaceContent) => Promise<void>;
  onExport?:   (item: SharedWorkspaceContent) => Promise<void>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1)   return 'Just now';
  if (diffMins < 60)  return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7)   return `${diffDays}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SharedContentCard({
  item, index, userRole, onOpen, onRemove, onExport,
}: Props) {
  const [isRemoving, setIsRemoving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const isPresentation = item.contentType === 'presentation';
  const isEditor = userRole === 'owner' || userRole === 'editor';
  const canRemove = isEditor;

  // Gradient based on content type
  const gradientColors: [string, string] = isPresentation
    ? ['#6C63FF', '#8B5CF6']
    : ['#10B981', '#059669'];

  const accentColor = isPresentation ? COLORS.primary : COLORS.success;
  const typeLabel   = isPresentation ? 'Presentation' : 'Academic Paper';
  const typeIcon    = isPresentation ? 'easel' : 'school';

  // Metadata chips
  const chips: { icon: string; label: string }[] = [];
  if (isPresentation) {
    if (item.metadata?.totalSlides)
      chips.push({ icon: 'layers-outline', label: `${item.metadata.totalSlides} slides` });
    if (item.metadata?.theme)
      chips.push({ icon: 'color-palette-outline', label: String(item.metadata.theme) });
  } else {
    if (item.metadata?.wordCount)
      chips.push({ icon: 'text-outline', label: `~${Number(item.metadata.wordCount).toLocaleString()} words` });
    if (item.metadata?.citationStyle)
      chips.push({ icon: 'school-outline', label: String(item.metadata.citationStyle).toUpperCase() });
    if (item.metadata?.pageEstimate)
      chips.push({ icon: 'document-outline', label: `~${item.metadata.pageEstimate} pages` });
  }

  const handleRemove = () => {
    Alert.alert(
      `Remove ${typeLabel}`,
      `Remove "${item.title}" from this workspace? It won't be deleted — just unshared.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
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

  const handleExport = async () => {
    if (!onExport) return;
    setIsExporting(true);
    await onExport(item);
    setIsExporting(false);
  };

  return (
    <Animated.View entering={FadeInDown.duration(400).delay(index * 60)}>
      <TouchableOpacity
        onPress={() => onOpen(item)}
        activeOpacity={0.82}
        style={{
          backgroundColor: COLORS.backgroundCard,
          borderRadius:    RADIUS.xl,
          marginBottom:    SPACING.md,
          borderWidth:     1,
          borderColor:     `${accentColor}22`,
          overflow:        'hidden',
          ...SHADOWS.medium,
        }}
      >
        {/* Top accent bar */}
        <LinearGradient
          colors={gradientColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ height: 3, width: '100%' }}
        />

        <View style={{ padding: SPACING.md }}>
          {/* Header row */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.md, marginBottom: SPACING.sm }}>
            {/* Icon */}
            <LinearGradient
              colors={gradientColors}
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
              <Ionicons name={typeIcon as any} size={22} color="#FFF" />
            </LinearGradient>

            {/* Title block */}
            <View style={{ flex: 1 }}>
              {/* Type badge */}
              <View style={{
                flexDirection:   'row',
                alignItems:      'center',
                gap:             4,
                marginBottom:    4,
              }}>
                <View style={{
                  backgroundColor:  `${accentColor}18`,
                  borderRadius:     RADIUS.full,
                  paddingHorizontal: 7,
                  paddingVertical:  2,
                  flexDirection:    'row',
                  alignItems:       'center',
                  gap:              3,
                  borderWidth:      1,
                  borderColor:      `${accentColor}30`,
                }}>
                  <Ionicons name={typeIcon as any} size={9} color={accentColor} />
                  <Text style={{
                    color:      accentColor,
                    fontSize:   9,
                    fontWeight: '700',
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                  }}>
                    {typeLabel}
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
                {item.title}
              </Text>

              {item.subtitle ? (
                <Text
                  style={{
                    color:     COLORS.textMuted,
                    fontSize:  FONTS.sizes.xs,
                    marginTop: 3,
                    lineHeight: 16,
                  }}
                  numberOfLines={1}
                >
                  {item.subtitle}
                </Text>
              ) : null}
            </View>

            {/* Remove button (editors/owners only) */}
            {canRemove && (
              <TouchableOpacity
                onPress={handleRemove}
                disabled={isRemoving}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={{
                  width:          28,
                  height:         28,
                  borderRadius:   8,
                  backgroundColor: `${COLORS.error}12`,
                  alignItems:     'center',
                  justifyContent: 'center',
                  borderWidth:    1,
                  borderColor:    `${COLORS.error}25`,
                  flexShrink:     0,
                }}
              >
                {isRemoving
                  ? <ActivityIndicator size="small" color={COLORS.error} />
                  : <Ionicons name="close-outline" size={15} color={COLORS.error} />
                }
              </TouchableOpacity>
            )}
          </View>

          {/* Metadata chips */}
          {chips.length > 0 && (
            <View style={{
              flexDirection: 'row',
              flexWrap:      'wrap',
              gap:           6,
              marginBottom:  SPACING.sm,
            }}>
              {chips.map(chip => (
                <View
                  key={chip.label}
                  style={{
                    flexDirection:    'row',
                    alignItems:       'center',
                    gap:              4,
                    backgroundColor:  COLORS.backgroundElevated,
                    borderRadius:     RADIUS.full,
                    paddingHorizontal: 8,
                    paddingVertical:  3,
                    borderWidth:      1,
                    borderColor:      COLORS.border,
                  }}
                >
                  <Ionicons name={chip.icon as any} size={10} color={COLORS.textMuted} />
                  <Text style={{ color: COLORS.textMuted, fontSize: 10, fontWeight: '600' }}>
                    {chip.label}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Footer row */}
          <View style={{
            flexDirection:  'row',
            alignItems:     'center',
            justifyContent: 'space-between',
            paddingTop:     SPACING.sm,
            borderTopWidth: 1,
            borderTopColor: COLORS.border,
          }}>
            {/* Sharer info */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
              <View style={{
                width:          24,
                height:         24,
                borderRadius:   8,
                backgroundColor: `${COLORS.primary}18`,
                alignItems:     'center',
                justifyContent: 'center',
                flexShrink:     0,
              }}>
                <Ionicons name="person-outline" size={12} color={COLORS.primary} />
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
              {onExport && (
                <TouchableOpacity
                  onPress={handleExport}
                  disabled={isExporting}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={{
                    flexDirection:  'row',
                    alignItems:     'center',
                    gap:            4,
                    backgroundColor: COLORS.backgroundElevated,
                    borderRadius:   RADIUS.md,
                    paddingHorizontal: 8,
                    paddingVertical: 5,
                    borderWidth:    1,
                    borderColor:    COLORS.border,
                  }}
                >
                  {isExporting
                    ? <ActivityIndicator size="small" color={COLORS.textMuted} />
                    : <Ionicons name="download-outline" size={13} color={COLORS.textMuted} />
                  }
                  <Text style={{ color: COLORS.textMuted, fontSize: 10, fontWeight: '600' }}>
                    Export
                  </Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                onPress={() => onOpen(item)}
                style={{
                  flexDirection:  'row',
                  alignItems:     'center',
                  gap:            4,
                  backgroundColor: `${accentColor}15`,
                  borderRadius:   RADIUS.md,
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  borderWidth:    1,
                  borderColor:    `${accentColor}30`,
                }}
              >
                <Ionicons name="open-outline" size={13} color={accentColor} />
                <Text style={{ color: accentColor, fontSize: 10, fontWeight: '700' }}>
                  Open
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}