// src/components/paperEditor/VersionHistoryPanel.tsx
// Part 38 — Version history bottom sheet.
// Lists up to 10 past snapshots. Tap any version to preview metadata.
// Restore button overwrites the current paper with the chosen version.
// UPDATE: Added rename and delete per version card.
// UPDATE: Fixed keyboard covering rename input on iPhone and Android —
//         KeyboardAvoidingView lifts the sheet, ScrollView auto-scrolls
//         the active card above the keyboard.
// ─────────────────────────────────────────────────────────────────────────────

import React, { memo, useState, useRef, useCallback } from 'react';
import {
  View, Text, Modal, Pressable, ScrollView,
  TouchableOpacity, ActivityIndicator, Alert, Dimensions,
  TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { LinearGradient }    from 'expo-linear-gradient';
import { Ionicons }          from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';
import type { PaperVersion }              from '../../types/paperEditor';

const SCREEN_H = Dimensions.get('window').height;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRelativeTime(isoString: string): string {
  const diff  = Date.now() - new Date(isoString).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins < 1)   return 'Just now';
  if (mins < 60)  return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7)   return `${days}d ago`;
  return new Date(isoString).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatAbsoluteTime(isoString: string): string {
  return new Date(isoString).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ─── Inline rename input ──────────────────────────────────────────────────────

interface RenameInputProps {
  initialValue: string;
  onSave:       (value: string) => void;
  onCancel:     () => void;
}

function RenameInput({ initialValue, onSave, onCancel }: RenameInputProps) {
  const [value, setValue] = useState(initialValue);

  const handleSave = () => {
    const trimmed = value.trim();
    if (!trimmed) { onCancel(); return; }
    onSave(trimmed);
  };

  return (
    <View style={{ gap: 8 }}>
      <View style={{
        flexDirection:     'row',
        alignItems:        'center',
        backgroundColor:   COLORS.backgroundCard,
        borderRadius:      RADIUS.lg,
        borderWidth:       1.5,
        borderColor:       COLORS.primary,
        paddingHorizontal: SPACING.sm,
        height:            40,
      }}>
        <Ionicons name="pencil-outline" size={14} color={COLORS.primary} style={{ marginRight: 6 }} />
        <TextInput
          value={value}
          onChangeText={setValue}
          autoFocus
          placeholder="Version name…"
          placeholderTextColor={COLORS.textMuted}
          style={{
            flex:       1,
            color:      COLORS.textPrimary,
            fontSize:   FONTS.sizes.sm,
            fontWeight: '600',
          }}
          onSubmitEditing={handleSave}
          returnKeyType="done"
          maxLength={80}
          blurOnSubmit={false}
        />
      </View>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TouchableOpacity
          onPress={onCancel}
          activeOpacity={0.8}
          style={{
            flex:            1,
            paddingVertical: 9,
            borderRadius:    RADIUS.full,
            alignItems:      'center',
            backgroundColor: COLORS.backgroundElevated,
            borderWidth:     1,
            borderColor:     COLORS.border,
          }}
        >
          <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, fontWeight: '700' }}>
            Cancel
          </Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={handleSave} activeOpacity={0.8} style={{ flex: 1 }}>
          <LinearGradient
            colors={[COLORS.primary, '#8B5CF6']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={{ paddingVertical: 9, borderRadius: RADIUS.full, alignItems: 'center' }}
          >
            <Text style={{ color: '#FFF', fontSize: FONTS.sizes.sm, fontWeight: '800' }}>
              Save Name
            </Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Version card ─────────────────────────────────────────────────────────────

interface VersionCardProps {
  version:      PaperVersion;
  index:        number;
  isRestoring:  boolean;
  isDeleting:   boolean;
  onRestore:    () => void;
  onRename:     (newLabel: string) => void;
  onDelete:     () => void;
  /** Called when rename opens so the parent can scroll this card into view */
  onRenameOpen: (yAbsolute: number, cardHeight: number) => void;
}

const VersionCard = memo(function VersionCard({
  version,
  index,
  isRestoring,
  isDeleting,
  onRestore,
  onRename,
  onDelete,
  onRenameOpen,
}: VersionCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [renaming, setRenaming] = useState(false);

  const cardRef = useRef<View>(null);

  const colors = [
    ['#6C63FF', '#8B5CF6'],
    ['#43E97B', '#38F9D7'],
    ['#FFA726', '#FF7043'],
    ['#29B6F6', '#0288D1'],
    ['#FF6584', '#F093FB'],
  ] as const;
  const gradient = colors[index % colors.length];

  const handleSaveRename = (newLabel: string) => {
    setRenaming(false);
    onRename(newLabel);
  };

  const handleStartRename = () => {
    setRenaming(true);
    // Wait a frame for the input to render and expand the card,
    // then measure absolute screen position and notify parent to scroll.
    setTimeout(() => {
      cardRef.current?.measureInWindow((_x, y, _w, h) => {
        onRenameOpen(y, h);
      });
    }, 100);
  };

  return (
    <Animated.View entering={FadeInDown.duration(280).delay(index * 40)}>
      <View
        ref={cardRef}
        style={{
          backgroundColor: COLORS.backgroundElevated,
          borderRadius:    RADIUS.xl,
          marginBottom:    SPACING.sm,
          borderWidth:     1,
          borderColor:     COLORS.border,
          overflow:        'hidden',
        }}
      >
        {/* Main row */}
        <Pressable
          onPress={() => { setExpanded(e => !e); setRenaming(false); }}
          style={{ flexDirection: 'row', alignItems: 'center', padding: SPACING.md, gap: SPACING.sm }}
        >
          <LinearGradient
            colors={gradient}
            style={{
              width:          40,
              height:         40,
              borderRadius:   11,
              alignItems:     'center',
              justifyContent: 'center',
              flexShrink:     0,
            }}
          >
            <Text style={{ color: '#FFF', fontSize: 11, fontWeight: '900' }}>
              v{version.versionNumber}
            </Text>
          </LinearGradient>

          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '700' }}
              numberOfLines={1}
            >
              {version.versionLabel || `Version ${version.versionNumber}`}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}>
              <Text style={{ color: COLORS.textMuted, fontSize: 10 }}>
                {formatRelativeTime(version.createdAt)}
              </Text>
              <View style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: COLORS.textMuted }} />
              <Text style={{ color: COLORS.textMuted, fontSize: 10 }}>
                ~{version.wordCount.toLocaleString()} words
              </Text>
            </View>
          </View>

          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={15}
            color={COLORS.textMuted}
          />
        </Pressable>

        {/* Expanded detail */}
        {expanded && (
          <View style={{
            paddingHorizontal: SPACING.md,
            paddingBottom:     SPACING.md,
            borderTopWidth:    1,
            borderTopColor:    COLORS.border,
            paddingTop:        SPACING.sm,
            gap:               SPACING.sm,
          }}>
            {/* Metadata */}
            <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
              {[
                { label: 'Saved', value: formatAbsoluteTime(version.createdAt), icon: 'calendar-outline' },
                { label: 'Words', value: `~${version.wordCount.toLocaleString()}`, icon: 'text-outline' },
              ].map(item => (
                <View key={item.label} style={{
                  flex:            1,
                  backgroundColor: COLORS.backgroundCard,
                  borderRadius:    RADIUS.lg,
                  padding:         SPACING.sm,
                  alignItems:      'center',
                  borderWidth:     1,
                  borderColor:     COLORS.border,
                }}>
                  <Ionicons name={item.icon as any} size={14} color={COLORS.textMuted} />
                  <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.xs, fontWeight: '700', marginTop: 4 }}>
                    {item.value}
                  </Text>
                  <Text style={{ color: COLORS.textMuted, fontSize: 9, marginTop: 1 }}>
                    {item.label}
                  </Text>
                </View>
              ))}
            </View>

            {/* Rename input OR action buttons */}
            {renaming ? (
              <RenameInput
                initialValue={version.versionLabel || `Version ${version.versionNumber}`}
                onSave={handleSaveRename}
                onCancel={() => setRenaming(false)}
              />
            ) : (
              <>
                {/* Rename + Delete */}
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity
                    onPress={handleStartRename}
                    activeOpacity={0.8}
                    style={{
                      flex:            1,
                      flexDirection:   'row',
                      alignItems:      'center',
                      justifyContent:  'center',
                      gap:             6,
                      paddingVertical: 9,
                      borderRadius:    RADIUS.full,
                      backgroundColor: `${COLORS.info}15`,
                      borderWidth:     1,
                      borderColor:     `${COLORS.info}35`,
                    }}
                  >
                    <Ionicons name="pencil-outline" size={14} color={COLORS.info} />
                    <Text style={{ color: COLORS.info, fontSize: FONTS.sizes.sm, fontWeight: '700' }}>
                      Rename
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={onDelete}
                    disabled={isDeleting}
                    activeOpacity={0.8}
                    style={{
                      flex:            1,
                      flexDirection:   'row',
                      alignItems:      'center',
                      justifyContent:  'center',
                      gap:             6,
                      paddingVertical: 9,
                      borderRadius:    RADIUS.full,
                      backgroundColor: `${COLORS.error}15`,
                      borderWidth:     1,
                      borderColor:     `${COLORS.error}30`,
                      opacity:         isDeleting ? 0.5 : 1,
                    }}
                  >
                    {isDeleting
                      ? <ActivityIndicator size="small" color={COLORS.error} />
                      : <Ionicons name="trash-outline" size={14} color={COLORS.error} />
                    }
                    <Text style={{ color: COLORS.error, fontSize: FONTS.sizes.sm, fontWeight: '700' }}>
                      {isDeleting ? 'Deleting…' : 'Delete'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Restore */}
                <TouchableOpacity
                  onPress={onRestore}
                  disabled={isRestoring}
                  activeOpacity={0.8}
                  style={{ opacity: isRestoring ? 0.6 : 1 }}
                >
                  <LinearGradient
                    colors={gradient}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    style={{
                      flexDirection:   'row',
                      alignItems:      'center',
                      justifyContent:  'center',
                      gap:             8,
                      borderRadius:    RADIUS.full,
                      paddingVertical: 11,
                    }}
                  >
                    {isRestoring
                      ? <ActivityIndicator size="small" color="#FFF" />
                      : <Ionicons name="refresh-circle-outline" size={17} color="#FFF" />
                    }
                    <Text style={{ color: '#FFF', fontSize: FONTS.sizes.sm, fontWeight: '800' }}>
                      {isRestoring ? 'Restoring…' : 'Restore This Version'}
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>

                <Text style={{ color: COLORS.textMuted, fontSize: 9, textAlign: 'center', lineHeight: 14 }}>
                  A snapshot of your current paper will be saved before restoring.
                </Text>
              </>
            )}
          </View>
        )}
      </View>
    </Animated.View>
  );
});

// ─── Props ────────────────────────────────────────────────────────────────────

interface VersionHistoryPanelProps {
  visible:       boolean;
  versions:      PaperVersion[];
  isLoading:     boolean;
  isRestoring:   boolean;
  currentWords:  number;
  onRestore:     (versionId: string) => void;
  onSaveCurrent: (label: string) => void;
  onRename:      (versionId: string, newLabel: string) => Promise<boolean>;
  onDelete:      (versionId: string) => Promise<boolean>;
  onClose:       () => void;
}

// ─── Main modal ───────────────────────────────────────────────────────────────

export const VersionHistoryPanel = memo(function VersionHistoryPanel({
  visible,
  versions,
  isLoading,
  isRestoring,
  currentWords,
  onRestore,
  onSaveCurrent,
  onRename,
  onDelete,
  onClose,
}: VersionHistoryPanelProps) {
  const insets    = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const sheetRef  = useRef<View>(null);

  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [deletingId,  setDeletingId]  = useState<string | null>(null);

  // ── Scroll the renaming card above the keyboard ───────────────────────────
  // yAbsolute = card top in screen coordinates (from measureInWindow).
  // We find the sheet's top edge in screen coords, subtract to get the card's
  // offset inside the ScrollView content, then scroll to it with a 60px buffer
  // so the card clears the fixed header inside the sheet.
  const handleRenameOpen = useCallback((yAbsolute: number, _cardHeight: number) => {
    sheetRef.current?.measureInWindow((_x, sheetY) => {
      const offsetInsideScroll = yAbsolute - sheetY;
      const target = Math.max(0, offsetInsideScroll - 60);
      scrollRef.current?.scrollTo({ y: target, animated: true });
    });
  }, []);

  const handleRestore = (versionId: string, label: string) => {
    Alert.alert(
      'Restore Version',
      `Restore "${label}"?\n\nYour current paper will be saved as a snapshot first.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore',
          onPress: () => {
            setRestoringId(versionId);
            onRestore(versionId);
          },
        },
      ],
    );
  };

  const handleRename = async (versionId: string, newLabel: string) => {
    const ok = await onRename(versionId, newLabel);
    if (!ok) Alert.alert('Rename Failed', 'Could not rename this version. Please try again.');
  };

  const handleDelete = (versionId: string, label: string) => {
    Alert.alert(
      'Delete Version',
      `Delete "${label}"?\n\nThis snapshot will be permanently removed and cannot be recovered.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text:  'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeletingId(versionId);
            const ok = await onDelete(versionId);
            setDeletingId(null);
            if (!ok) Alert.alert('Delete Failed', 'Could not delete this version. Please try again.');
          },
        },
      ],
    );
  };

  const handleSaveSnapshot = () => {
    const label = `Manual snapshot · ${new Date().toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    })}`;
    onSaveCurrent(label);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      {/*
        Backdrop — tapping it closes the sheet.
        KAV sits INSIDE the backdrop so it only resizes the sheet,
        not the entire screen overlay.
      */}
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' }}
        onPress={onClose}
      >
        {/*
          KeyboardAvoidingView:
          • iOS   → "padding": adds bottom padding equal to keyboard height,
                    pushing the sheet up without clipping content.
          • Android → "height": shrinks the view's height so the sheet fits
                    in the remaining space above the keyboard.
          keyboardVerticalOffset on iOS accounts for the safe-area bottom
          so the sheet doesn't overshoot on notched iPhones.
        */}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? insets.bottom : 0}
        >
          <Pressable
            ref={sheetRef}
            onPress={e => e.stopPropagation()}
            style={{
              backgroundColor:      COLORS.backgroundCard,
              borderTopLeftRadius:  24,
              borderTopRightRadius: 24,
              // Safe-area bottom + extra breathing room above home indicator
              paddingBottom:        insets.bottom + SPACING.md,
              maxHeight:            SCREEN_H * 0.85,
              borderTopWidth:       1,
              borderTopColor:       COLORS.border,
            }}
          >
            {/* Handle bar */}
            <View style={{
              width:           40,
              height:          4,
              borderRadius:    2,
              backgroundColor: COLORS.border,
              alignSelf:       'center',
              marginTop:       SPACING.sm,
              marginBottom:    SPACING.md,
            }} />

            {/* Header */}
            <View style={{
              flexDirection:     'row',
              alignItems:        'center',
              paddingHorizontal: SPACING.lg,
              marginBottom:      SPACING.md,
            }}>
              <LinearGradient
                colors={[COLORS.info, '#0288D1']}
                style={{
                  width:          36,
                  height:         36,
                  borderRadius:   10,
                  alignItems:     'center',
                  justifyContent: 'center',
                  marginRight:    SPACING.sm,
                }}
              >
                <Ionicons name="time" size={18} color="#FFF" />
              </LinearGradient>
              <View style={{ flex: 1 }}>
                <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '800' }}>
                  Version History
                </Text>
                <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
                  {versions.length} snapshot{versions.length !== 1 ? 's' : ''} · up to 10 stored
                </Text>
              </View>
              <Pressable onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={22} color={COLORS.textMuted} />
              </Pressable>
            </View>

            {/* Save snapshot button */}
            <View style={{ paddingHorizontal: SPACING.lg, marginBottom: SPACING.md }}>
              <TouchableOpacity
                onPress={handleSaveSnapshot}
                activeOpacity={0.8}
                style={{
                  flexDirection:   'row',
                  alignItems:      'center',
                  justifyContent:  'center',
                  gap:             8,
                  paddingVertical: 11,
                  borderRadius:    RADIUS.full,
                  backgroundColor: `${COLORS.info}15`,
                  borderWidth:     1,
                  borderColor:     `${COLORS.info}35`,
                }}
              >
                <Ionicons name="camera-outline" size={16} color={COLORS.info} />
                <Text style={{ color: COLORS.info, fontSize: FONTS.sizes.sm, fontWeight: '700' }}>
                  Save Current Paper as Snapshot
                </Text>
              </TouchableOpacity>
            </View>

            {/* Scrollable version list */}
            <ScrollView
              ref={scrollRef}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: SPACING.lg, paddingBottom: SPACING.lg }}
              // "handled" lets taps inside TextInput reach the input correctly
              keyboardShouldPersistTaps="handled"
            >
              {isLoading ? (
                <View style={{ alignItems: 'center', paddingVertical: SPACING.xl }}>
                  <ActivityIndicator color={COLORS.primary} />
                  <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.sm, marginTop: SPACING.sm }}>
                    Loading versions…
                  </Text>
                </View>
              ) : versions.length === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: SPACING.xl, gap: SPACING.md }}>
                  <LinearGradient
                    colors={[COLORS.backgroundElevated, COLORS.backgroundCard]}
                    style={{
                      width:          72,
                      height:         72,
                      borderRadius:   20,
                      alignItems:     'center',
                      justifyContent: 'center',
                      borderWidth:    1,
                      borderColor:    COLORS.border,
                    }}
                  >
                    <Ionicons name="time-outline" size={34} color={COLORS.textMuted} />
                  </LinearGradient>
                  <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '700' }}>
                    No Versions Yet
                  </Text>
                  <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.sm, textAlign: 'center', lineHeight: 20 }}>
                    Snapshots are created automatically before every AI edit.{'\n'}
                    You can also save one manually above.
                  </Text>
                </View>
              ) : (
                <>
                  <Text style={{
                    color:         COLORS.textMuted,
                    fontSize:      FONTS.sizes.xs,
                    fontWeight:    '700',
                    textTransform: 'uppercase',
                    letterSpacing: 1,
                    marginBottom:  SPACING.sm,
                  }}>
                    Snapshots (newest first)
                  </Text>

                  {versions.map((version, i) => (
                    <VersionCard
                      key={version.id}
                      version={version}
                      index={i}
                      isRestoring={isRestoring && restoringId === version.id}
                      isDeleting={deletingId === version.id}
                      onRestore={() => handleRestore(
                        version.id,
                        version.versionLabel || `Version ${version.versionNumber}`,
                      )}
                      onRename={(newLabel) => handleRename(version.id, newLabel)}
                      onDelete={() => handleDelete(
                        version.id,
                        version.versionLabel || `Version ${version.versionNumber}`,
                      )}
                      onRenameOpen={handleRenameOpen}
                    />
                  ))}

                  <Text style={{
                    color:      COLORS.textMuted,
                    fontSize:   10,
                    textAlign:  'center',
                    marginTop:  SPACING.sm,
                    lineHeight: 16,
                  }}>
                    Maximum 10 snapshots stored · Oldest are pruned automatically
                  </Text>
                </>
              )}
            </ScrollView>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
});