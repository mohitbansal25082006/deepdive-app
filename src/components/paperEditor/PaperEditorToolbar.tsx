// src/components/paperEditor/PaperEditorToolbar.tsx
// Part 38 — Top toolbar for the paper editor screen.
// Shows: back, title, undo/redo, save status, credit balance, action menu.
// ─────────────────────────────────────────────────────────────────────────────

import React, { memo } from 'react';
import {
  View, Text, Pressable, ActivityIndicator,
} from 'react-native';
import { Ionicons }        from '@expo/vector-icons';
import { LinearGradient }  from 'expo-linear-gradient';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../constants/theme';

interface PaperEditorToolbarProps {
  title:           string;
  isDirty:         boolean;
  isSaving:        boolean;
  canUndo:         boolean;
  canRedo:         boolean;
  creditBalance:   number;
  totalWordCount:  number;
  lastSavedAt:     number | null;
  onBack:          () => void;
  onUndo:          () => void;
  onRedo:          () => void;
  onSave:          () => void;
  onOpenVersions:  () => void;
  onOpenCitations: () => void;
  onOpenExport:    () => void;
}

function formatSavedTime(ts: number | null): string {
  if (!ts) return '';
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 5)  return 'Saved just now';
  if (diff < 60) return `Saved ${diff}s ago`;
  return `Saved ${Math.floor(diff / 60)}m ago`;
}

export const PaperEditorToolbar = memo(function PaperEditorToolbar({
  title, isDirty, isSaving, canUndo, canRedo,
  creditBalance, totalWordCount, lastSavedAt,
  onBack, onUndo, onRedo, onSave,
  onOpenVersions, onOpenCitations, onOpenExport,
}: PaperEditorToolbarProps) {
  return (
    <View style={{
      backgroundColor: COLORS.backgroundCard,
      borderBottomWidth: 1,
      borderBottomColor: COLORS.border,
    }}>
      {/* Row 1: back + title + save status + balance */}
      <View style={{
        flexDirection:  'row',
        alignItems:     'center',
        paddingHorizontal: SPACING.md,
        paddingTop:     SPACING.sm,
        paddingBottom:  6,
        gap:            SPACING.sm,
      }}>
        <Pressable
          onPress={onBack}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={{
            width: 36, height: 36, borderRadius: 11,
            backgroundColor: COLORS.backgroundElevated,
            alignItems: 'center', justifyContent: 'center',
            borderWidth: 1, borderColor: COLORS.border,
            flexShrink: 0,
          }}
        >
          <Ionicons name="arrow-back" size={18} color={COLORS.textSecondary} />
        </Pressable>

        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '700' }}
            numberOfLines={1}
          >
            {title}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 1 }}>
            {isSaving ? (
              <>
                <ActivityIndicator size="small" color={COLORS.primary} style={{ transform: [{ scale: 0.7 }] }} />
                <Text style={{ color: COLORS.textMuted, fontSize: 10 }}>Saving…</Text>
              </>
            ) : isDirty ? (
              <>
                <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: COLORS.warning }} />
                <Text style={{ color: COLORS.warning, fontSize: 10, fontWeight: '600' }}>Unsaved changes</Text>
              </>
            ) : lastSavedAt ? (
              <>
                <Ionicons name="checkmark-circle" size={10} color={COLORS.success} />
                <Text style={{ color: COLORS.success, fontSize: 10 }}>{formatSavedTime(lastSavedAt)}</Text>
              </>
            ) : (
              <Text style={{ color: COLORS.textMuted, fontSize: 10 }}>
                ~{totalWordCount.toLocaleString()} words
              </Text>
            )}
          </View>
        </View>

        {/* Credit balance pill */}
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 4,
          backgroundColor: creditBalance <= 5 ? `${COLORS.error}18` : `${COLORS.primary}15`,
          borderRadius: RADIUS.full, paddingHorizontal: 9, paddingVertical: 4,
          borderWidth: 1, borderColor: creditBalance <= 5 ? `${COLORS.error}35` : `${COLORS.primary}30`,
          flexShrink: 0,
        }}>
          <Ionicons name="flash" size={11} color={creditBalance <= 5 ? COLORS.error : COLORS.primary} />
          <Text style={{
            color: creditBalance <= 5 ? COLORS.error : COLORS.primary,
            fontSize: FONTS.sizes.xs, fontWeight: '700',
          }}>
            {creditBalance} cr
          </Text>
        </View>

        {/* Manual save button */}
        <Pressable
          onPress={onSave}
          disabled={!isDirty || isSaving}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={{
            width: 36, height: 36, borderRadius: 11,
            backgroundColor: isDirty && !isSaving ? `${COLORS.primary}20` : COLORS.backgroundElevated,
            alignItems: 'center', justifyContent: 'center',
            borderWidth: 1,
            borderColor: isDirty && !isSaving ? COLORS.primary : COLORS.border,
            opacity: !isDirty ? 0.4 : 1,
            flexShrink: 0,
          }}
        >
          {isSaving
            ? <ActivityIndicator size="small" color={COLORS.primary} />
            : <Ionicons name="save-outline" size={17} color={isDirty ? COLORS.primary : COLORS.textMuted} />
          }
        </Pressable>
      </View>

      {/* Row 2: undo/redo + action buttons */}
      <View style={{
        flexDirection:  'row',
        alignItems:     'center',
        paddingHorizontal: SPACING.md,
        paddingBottom:  SPACING.sm,
        gap:            8,
      }}>
        {/* Undo */}
        <Pressable
          onPress={onUndo}
          disabled={!canUndo}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={{
            width: 34, height: 34, borderRadius: 10,
            backgroundColor: COLORS.backgroundElevated,
            alignItems: 'center', justifyContent: 'center',
            borderWidth: 1, borderColor: COLORS.border,
            opacity: canUndo ? 1 : 0.35,
          }}
        >
          <Ionicons name="arrow-undo-outline" size={16} color={COLORS.textSecondary} />
        </Pressable>

        {/* Redo */}
        <Pressable
          onPress={onRedo}
          disabled={!canRedo}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={{
            width: 34, height: 34, borderRadius: 10,
            backgroundColor: COLORS.backgroundElevated,
            alignItems: 'center', justifyContent: 'center',
            borderWidth: 1, borderColor: COLORS.border,
            opacity: canRedo ? 1 : 0.35,
          }}
        >
          <Ionicons name="arrow-redo-outline" size={16} color={COLORS.textSecondary} />
        </Pressable>

        <View style={{ width: 1, height: 22, backgroundColor: COLORS.border, marginHorizontal: 2 }} />

        {/* Action chips */}
        {[
          { icon: 'time-outline',       label: 'Versions',  onPress: onOpenVersions,  color: COLORS.info },
          { icon: 'link-outline',       label: 'Citations', onPress: onOpenCitations, color: COLORS.warning },
          { icon: 'share-outline',      label: 'Export',    onPress: onOpenExport,    color: COLORS.success },
        ].map(action => (
          <Pressable
            key={action.label}
            onPress={action.onPress}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 5,
              backgroundColor: `${action.color}12`,
              borderRadius: RADIUS.full,
              paddingHorizontal: 10, paddingVertical: 6,
              borderWidth: 1, borderColor: `${action.color}30`,
            }}
          >
            <Ionicons name={action.icon as any} size={13} color={action.color} />
            <Text style={{ color: action.color, fontSize: FONTS.sizes.xs, fontWeight: '700' }}>
              {action.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
});