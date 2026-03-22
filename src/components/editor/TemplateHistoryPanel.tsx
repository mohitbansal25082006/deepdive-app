// src/components/editor/TemplateHistoryPanel.tsx
// Part 30 — Template History bottom sheet
// Shows past snapshots and lets the user restore to any previous state.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useCallback } from 'react';
import {
  View, Text, Modal, Pressable, ScrollView,
  Alert, ActivityIndicator, Dimensions,
} from 'react-native';
import { LinearGradient }    from 'expo-linear-gradient';
import { Ionicons }          from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';
import type { TemplateHistoryEntry }      from '../../types/editor';

const SCREEN_H = Dimensions.get('window').height;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface TemplateHistoryPanelProps {
  visible:        boolean;
  presentationId: string;
  entries:        TemplateHistoryEntry[];
  isLoading:      boolean;
  onLoad:         (presentationId: string) => void;
  onRestore:      (entry: TemplateHistoryEntry) => void;
  onDelete:       (entryId: string) => void;
  onClearAll:     () => void;
  onClose:        () => void;
}

// ─── History Card ─────────────────────────────────────────────────────────────

function HistoryCard({
  entry,
  onRestore,
  onDelete,
}: {
  entry:     TemplateHistoryEntry;
  onRestore: (entry: TemplateHistoryEntry) => void;
  onDelete:  (entryId: string) => void;
}) {
  const slideCount = entry.slidesSnapshot?.length ?? 0;

  const handleDelete = useCallback(() => {
    Alert.alert(
      'Delete Snapshot',
      'Remove this history entry? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => onDelete(entry.id) },
      ],
    );
  }, [entry.id, onDelete]);

  const handleRestore = useCallback(() => {
    Alert.alert(
      'Restore Snapshot',
      entry.templateName
        ? `This will restore the state from before "${entry.templateName}" was applied.\n\nYour current slides will be replaced.`
        : 'This will restore a previous version of your presentation.\n\nYour current slides will be replaced.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text:    'Restore',
          style:   'destructive',
          onPress: () => onRestore(entry),
        },
      ],
    );
  }, [entry, onRestore]);

  return (
    <View style={{
      backgroundColor: COLORS.backgroundCard,
      borderRadius:    RADIUS.xl,
      borderWidth:     1,
      borderColor:     COLORS.border,
      overflow:        'hidden',
    }}>
      {/* Header */}
      <LinearGradient
        colors={['#6C63FF18', '#8B5CF608']}
        style={{
          flexDirection:   'row',
          alignItems:      'center',
          gap:             SPACING.sm,
          paddingHorizontal: SPACING.md,
          paddingVertical:  SPACING.sm,
          borderBottomWidth: 1,
          borderBottomColor: COLORS.border,
        }}
      >
        <View style={{
          width:           34,
          height:          34,
          borderRadius:    10,
          backgroundColor: `${COLORS.primary}18`,
          alignItems:      'center',
          justifyContent:  'center',
          flexShrink:      0,
        }}>
          <Ionicons name="time-outline" size={16} color={COLORS.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '700' }}>
            {entry.templateName ? `Before "${entry.templateName}"` : 'Before template change'}
          </Text>
          <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 1 }}>
            {timeAgo(entry.createdAt)} · {slideCount} slide{slideCount !== 1 ? 's' : ''} · {entry.fontFamily}
          </Text>
        </View>
        {/* Delete */}
        <Pressable
          onPress={handleDelete}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={{
            width:           28,
            height:          28,
            borderRadius:    14,
            backgroundColor: `${COLORS.error}15`,
            alignItems:      'center',
            justifyContent:  'center',
          }}
        >
          <Ionicons name="trash-outline" size={13} color={COLORS.error} />
        </Pressable>
      </LinearGradient>

      {/* Body */}
      <View style={{ paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, gap: 8 }}>
        {/* Slide count chips */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.backgroundElevated, borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: COLORS.border }}>
            <Ionicons name="layers-outline" size={11} color={COLORS.textMuted} />
            <Text style={{ color: COLORS.textSecondary, fontSize: 10, fontWeight: '600' }}>{slideCount} slides</Text>
          </View>
          {entry.templateId && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: `${COLORS.primary}12`, borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: `${COLORS.primary}25` }}>
              <Ionicons name="copy-outline" size={11} color={COLORS.primary} />
              <Text style={{ color: COLORS.primary, fontSize: 10, fontWeight: '600' }}>{entry.templateId}</Text>
            </View>
          )}
        </View>

        {/* Restore button */}
        <Pressable onPress={handleRestore}>
          <LinearGradient
            colors={['#6C63FF', '#8B5CF6']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{
              borderRadius:  RADIUS.full,
              paddingVertical: 10,
              flexDirection: 'row',
              alignItems:    'center',
              justifyContent: 'center',
              gap:           8,
            }}
          >
            <Ionicons name="refresh-outline" size={15} color="#FFF" />
            <Text style={{ color: '#FFF', fontSize: FONTS.sizes.sm, fontWeight: '700' }}>Restore to this version</Text>
          </LinearGradient>
        </Pressable>
      </View>
    </View>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function TemplateHistoryPanel({
  visible,
  presentationId,
  entries,
  isLoading,
  onLoad,
  onRestore,
  onDelete,
  onClearAll,
  onClose,
}: TemplateHistoryPanelProps) {
  const insets = useSafeAreaInsets();

  // Load when panel opens
  useEffect(() => {
    if (visible && presentationId) {
      onLoad(presentationId);
    }
  }, [visible, presentationId]);

  const handleClearAll = useCallback(() => {
    Alert.alert(
      'Clear All History',
      'Delete all saved snapshots for this presentation? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear All', style: 'destructive', onPress: onClearAll },
      ],
    );
  }, [onClearAll]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' }}
        onPress={onClose}
      >
        <Pressable
          onPress={e => e.stopPropagation()}
          style={{
            backgroundColor:      COLORS.backgroundCard,
            borderTopLeftRadius:  24,
            borderTopRightRadius: 24,
            paddingTop:           SPACING.sm,
            paddingBottom:        insets.bottom + SPACING.md,
            maxHeight:            SCREEN_H * 0.88,
            borderTopWidth:       1,
            borderTopColor:       COLORS.border,
          }}
        >
          {/* Handle */}
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.border, alignSelf: 'center', marginBottom: SPACING.sm }} />

          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.lg, marginBottom: SPACING.md }}>
            <LinearGradient
              colors={['#6C63FF', '#8B5CF6']}
              style={{ width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: SPACING.sm }}
            >
              <Ionicons name="time" size={17} color="#FFF" />
            </LinearGradient>
            <View style={{ flex: 1 }}>
              <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '800' }}>Template History</Text>
              <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
                {entries.length > 0
                  ? `${entries.length} saved snapshot${entries.length !== 1 ? 's' : ''}`
                  : 'Snapshots saved before each template is applied'}
              </Text>
            </View>
            {entries.length > 0 && (
              <Pressable onPress={handleClearAll} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ paddingHorizontal: 10, paddingVertical: 6, backgroundColor: `${COLORS.error}12`, borderRadius: RADIUS.full, borderWidth: 1, borderColor: `${COLORS.error}25` }}>
                <Text style={{ color: COLORS.error, fontSize: FONTS.sizes.xs, fontWeight: '600' }}>Clear All</Text>
              </Pressable>
            )}
            <Pressable onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={{ marginLeft: SPACING.sm }}>
              <Ionicons name="close" size={22} color={COLORS.textMuted} />
            </Pressable>
          </View>

          {/* Content */}
          {isLoading ? (
            <View style={{ alignItems: 'center', paddingVertical: SPACING['2xl'] }}>
              <ActivityIndicator size="large" color={COLORS.primary} />
              <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.sm, marginTop: SPACING.md }}>Loading history…</Text>
            </View>
          ) : entries.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: SPACING['2xl'], paddingHorizontal: SPACING.lg }}>
              <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: `${COLORS.primary}12`, alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.md }}>
                <Ionicons name="time-outline" size={32} color={COLORS.textMuted} />
              </View>
              <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '700', textAlign: 'center', marginBottom: SPACING.sm }}>
                No history yet
              </Text>
              <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.sm, textAlign: 'center', lineHeight: 20 }}>
                When you apply or insert a template, a snapshot is automatically saved here so you can restore to any previous version.
              </Text>
            </View>
          ) : (
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: SPACING.lg, paddingBottom: SPACING.lg, gap: SPACING.md }}
            >
              {/* Info banner */}
              <View style={{ backgroundColor: `${COLORS.info}10`, borderRadius: RADIUS.lg, padding: SPACING.md, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: `${COLORS.info}20` }}>
                <Ionicons name="information-circle-outline" size={16} color={COLORS.info} />
                <Text style={{ color: COLORS.info, fontSize: FONTS.sizes.xs, flex: 1, lineHeight: 17 }}>
                  Each entry shows the state before a template was applied. Restoring will replace your current slides.
                </Text>
              </View>

              {entries.map(entry => (
                <HistoryCard
                  key={entry.id}
                  entry={entry}
                  onRestore={onRestore}
                  onDelete={onDelete}
                />
              ))}
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}