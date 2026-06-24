// src/components/collections/AddToCollectionSheet.tsx
// Part 35 — Collections: Bottom sheet to add/remove a content item from collections.
// Part 50.8 — UI UPGRADE (gradient/glass system)
// Part 55.2 — FULL THEME-COMPATIBILITY PASS (inline + getter-based style fix)
//
// WHY BOTH INLINE FIXES AND GETTER FIXES ARE NEEDED
//   • Hardcoded hex literals in LinearGradient colors/style props → fixed INLINE
//     by replacing with live COLORS.x / getModalBackdrop() calls.
//   • COLORS.x references that were inside StyleSheet.create() → those are
//     evaluated ONCE at import time and never re-evaluated on theme switch.
//     They are moved OUT of StyleSheet into per-render getter objects (prefixed
//     "dyn") merged via array-style in JSX. Layout-only values stay in StyleSheet.
//
// Changes vs Part 50.8:
//   INLINE (LinearGradient colors / backgroundColor on View):
//     • overlay bg: 'rgba(10,10,26,0.70)' → getModalBackdrop(0.70) ✓ (already done in 50.8)
//     • sheet gradient: ['#1A1A38', '#0D0D20'] → COLORS.gradientCard ✓
//     • rowIcon unselected gradient: ['#22223E', '#1A1A33'] → [COLORS.backgroundElevated, COLORS.background] ✓
//     • emptyIconWrap gradient: ['#22223E', '#1A1A33'] → [COLORS.backgroundElevated, COLORS.background] ✓
//   GETTER-BASED (moved out of StyleSheet.create):
//     • collectionRow.backgroundColor: COLORS.backgroundElevated → dynCollectionRow
//     • collectionRow.borderColor: COLORS.border → dynCollectionRow
//     • quickForm.backgroundColor: COLORS.backgroundElevated → dynQuickForm
//     • quickForm.borderColor: ${COLORS.primary}30 → dynQuickForm
//     • quickInput.backgroundColor: COLORS.background → dynInput
//     • quickInput.color: COLORS.textPrimary → dynInput
//     • quickInput.borderColor: COLORS.border → dynInput
//     • iconSwatch.backgroundColor: COLORS.background → dynIconSwatch
//     • iconSwatch.borderColor: COLORS.border → dynIconSwatch
//     • cancelBtn.backgroundColor: COLORS.backgroundElevated → dynCancelBtn
//     • cancelBtn.borderColor: COLORS.border → dynCancelBtn
//     • cancelBtnText.color: COLORS.textMuted → dynCancelBtnText
//     • createTrigger.*: border/bg → dynCreateTrigger
//     • createTriggerText.color: COLORS.textPrimary → dynCreateTriggerText
//     • createTriggerSub.color: COLORS.textMuted → dynCreateTriggerSub
//     • sheetTitle.color: COLORS.textPrimary → dynSheetTitle
//     • sheetSubtitle.color: COLORS.textMuted → dynSheetSubtitle
//     • handle.backgroundColor: COLORS.border → dynHandle
//     • closeBtn.backgroundColor: COLORS.backgroundElevated → dynCloseBtn
//     • rowName.color: COLORS.textPrimary → dynRowName
//     • rowCount.color: COLORS.textMuted → dynRowCount
//     • checkbox.borderColor: COLORS.border → dynCheckbox
//     • memberStrip.*: COLORS.success-derived → dynMemberStrip
//     • loadingText.color, emptyText.color, emptySubtext.color → getters
//   All props, hooks, and behaviour unchanged.

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Modal,
  ActivityIndicator,
  TextInput,
  Alert,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons }       from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import {
  useCollections,
  useItemCollections,
}                         from '../../hooks/useCollections';
import {
  Collection,
  CollectionItemType,
  CollectionInput,
  COLLECTION_COLORS,
  COLLECTION_ICONS,
}                         from '../../types/collections';
import {
  COLORS, FONTS, SPACING, RADIUS, SHADOWS,
  getModalBackdrop,
}                         from '../../constants/theme';

type CollectionColor = typeof COLLECTION_COLORS[number];

interface AddToCollectionSheetProps {
  visible:      boolean;
  contentType:  CollectionItemType;
  contentId:    string;
  contentTitle: string;
  onClose:      () => void;
}

// ─── Quick Create Mini-Form ───────────────────────────────────────────────────

interface QuickCreateProps {
  onCreated:  (col: Collection) => void;
  onCreate:   (input: CollectionInput) => Promise<Collection | null>;
  isCreating: boolean;
}

function QuickCreateForm({ onCreated, onCreate, isCreating }: QuickCreateProps) {
  const [name,     setName]     = useState('');
  const [color,    setColor]    = useState<CollectionColor>(COLLECTION_COLORS[0]);
  const [icon,     setIcon]     = useState('folder');
  const [expanded, setExpanded] = useState(false);

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) { Alert.alert('Name required', 'Please enter a collection name.'); return; }
    const col = await onCreate({ name: trimmed, color, icon });
    if (col) { setName(''); setExpanded(false); onCreated(col); }
  };

  // Dynamic styles — re-read COLORS on every render
  const dynCreateTrigger = {
    backgroundColor: COLORS.backgroundElevated,
    borderColor:     `${COLORS.primary}25`,
  };
  const dynCreateTriggerIcon = {
    backgroundColor: `${COLORS.primary}18`,
    borderColor:     `${COLORS.primary}30`,
  };
  const dynQuickForm = {
    backgroundColor: COLORS.backgroundElevated,
    borderColor:     `${COLORS.primary}30`,
  };
  const dynInput = {
    backgroundColor: COLORS.background,
    color:           COLORS.textPrimary,
    borderColor:     COLORS.border,
  };
  const dynIconSwatch = {
    backgroundColor: COLORS.background,
    borderColor:     COLORS.border,
  };
  const dynCancelBtn = {
    backgroundColor: COLORS.backgroundElevated,
    borderColor:     COLORS.border,
  };

  if (!expanded) {
    return (
      <TouchableOpacity
        onPress={() => setExpanded(true)}
        activeOpacity={0.8}
        style={[styles.createTrigger, dynCreateTrigger]}
      >
        <View style={[styles.createTriggerIcon, dynCreateTriggerIcon]}>
          <Ionicons name="add" size={18} color={COLORS.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.createTriggerText, { color: COLORS.textPrimary }]}>New Collection</Text>
          <Text style={[styles.createTriggerSub, { color: COLORS.textMuted }]}>Create one to organise this item</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
      </TouchableOpacity>
    );
  }

  return (
    <Animated.View entering={FadeIn.duration(250)} style={[styles.quickForm, dynQuickForm]}>
      <View style={styles.quickFormHeader}>
        <LinearGradient colors={[color, `${color}99`]} style={styles.quickFormPreviewIcon}>
          <Ionicons name={icon as any} size={16} color="#FFF" />
        </LinearGradient>
        <Text style={[styles.quickFormTitle, { color: COLORS.textPrimary }]}>
          {name.trim() || 'New Collection'}
        </Text>
      </View>

      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Collection name..."
        placeholderTextColor={COLORS.textMuted}
        autoFocus
        style={[styles.quickInput, dynInput]}
        returnKeyType="done"
        onSubmitEditing={handleCreate}
        maxLength={60}
      />

      {/* Color swatches */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: SPACING.sm }}>
        <View style={{ flexDirection: 'row', gap: 8, paddingVertical: 4 }}>
          {COLLECTION_COLORS.map(c => (
            <TouchableOpacity
              key={c}
              onPress={() => setColor(c)}
              style={[
                styles.colorSwatch,
                { backgroundColor: c },
                color === c && styles.colorSwatchActive,
              ]}
            >
              {color === c && <Ionicons name="checkmark" size={12} color="#FFF" />}
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {/* Icon picker (compact) */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: SPACING.md }}>
        <View style={{ flexDirection: 'row', gap: 8, paddingVertical: 4 }}>
          {COLLECTION_ICONS.slice(0, 8).map(ic => (
            <TouchableOpacity
              key={ic.id}
              onPress={() => setIcon(ic.id)}
              style={[
                styles.iconSwatch,
                dynIconSwatch,
                icon === ic.id && { backgroundColor: `${color}25`, borderColor: color },
              ]}
            >
              <Ionicons
                name={ic.id as any}
                size={18}
                color={icon === ic.id ? color : COLORS.textMuted}
              />
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      <View style={styles.quickFormRow}>
        <TouchableOpacity
          onPress={() => setExpanded(false)}
          style={[styles.cancelBtn, dynCancelBtn]}
        >
          <Text style={[styles.cancelBtnText, { color: COLORS.textMuted }]}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleCreate}
          disabled={isCreating || !name.trim()}
          activeOpacity={0.85}
          style={{ flex: 1 }}
        >
          <LinearGradient
            colors={COLORS.gradientPrimary as [string, string]}
            style={[styles.createBtn, (!name.trim() || isCreating) && { opacity: 0.5 }]}
          >
            {isCreating
              ? <ActivityIndicator size="small" color="#FFF" />
              : <Text style={styles.createBtnText}>Create</Text>
            }
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

// ─── Collection Row ───────────────────────────────────────────────────────────

function CollectionRow({
  collection,
  isChecked,
  isToggling,
  onToggle,
}: {
  collection: Collection;
  isChecked:  boolean;
  isToggling: boolean;
  onToggle:   () => void;
}) {
  const color = collection.color ?? COLORS.primary;

  // Dynamic getter styles
  const dynRow = {
    backgroundColor: COLORS.backgroundElevated,
    borderColor:     COLORS.border,
  };

  return (
    <TouchableOpacity
      onPress={onToggle}
      disabled={isToggling}
      activeOpacity={0.78}
      style={[
        styles.collectionRow,
        dynRow,
        isChecked && { borderColor: `${color}55`, backgroundColor: `${color}10` },
      ]}
    >
      {/* 55.2: unselected icon gradient was ['#22223E', '#1A1A33'] — always dark.
          Now uses theme-aware surface colors so it's visible on light themes too. */}
      <LinearGradient
        colors={
          isChecked
            ? ([color, `${color}99`] as [string, string])
            : ([COLORS.backgroundElevated, COLORS.background] as [string, string])
        }
        style={styles.rowIcon}
      >
        <Ionicons name={collection.icon as any} size={18} color={isChecked ? '#FFF' : color} />
      </LinearGradient>

      <View style={styles.rowText}>
        <Text style={[styles.rowName, { color: COLORS.textPrimary }]} numberOfLines={1}>
          {collection.name}
        </Text>
        <Text style={[styles.rowCount, { color: COLORS.textMuted }]}>
          {collection.itemCount} {collection.itemCount === 1 ? 'item' : 'items'}
        </Text>
      </View>

      {isToggling
        ? <ActivityIndicator size="small" color={color} />
        : (
          <View style={[
            styles.checkbox,
            { borderColor: COLORS.border },
            isChecked && { backgroundColor: color, borderColor: color },
          ]}>
            {isChecked && <Ionicons name="checkmark" size={13} color="#FFF" />}
          </View>
        )
      }
    </TouchableOpacity>
  );
}

// ─── Main Sheet ───────────────────────────────────────────────────────────────

export function AddToCollectionSheet({
  visible,
  contentType,
  contentId,
  contentTitle,
  onClose,
}: AddToCollectionSheetProps) {
  const {
    collections,
    isLoading: loadingCollections,
    isCreating,
    refresh:   refreshCollections,
    create,
  } = useCollections();

  const {
    memberIds,
    isLoading: loadingMembership,
    toggle,
    reload:    reloadMembership,
  } = useItemCollections(contentType, contentId);

  const [togglingId, setTogglingId] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      refreshCollections();
      reloadMembership();
    }
  }, [visible]);

  const handleToggle = useCallback(async (col: Collection) => {
    if (togglingId) return;
    setTogglingId(col.id);
    const currentlyIn = memberIds.includes(col.id);
    await toggle(col.id, currentlyIn);
    setTogglingId(null);
  }, [toggle, memberIds, togglingId]);

  const handleCreated = useCallback((_col: Collection) => {
    refreshCollections();
  }, [refreshCollections]);

  const isLoading  = loadingCollections || loadingMembership;
  const memberCount = memberIds.length;

  // Dynamic getter styles for the sheet itself
  const dynHandle = { backgroundColor: COLORS.border };
  const dynCloseBtn = {
    backgroundColor: COLORS.backgroundElevated,
    borderColor:     COLORS.border,
  };
  const dynMemberStrip = {
    backgroundColor: `${COLORS.success}12`,
    borderColor:     `${COLORS.success}30`,
  };
  const dynEmptyIconWrap = {
    borderColor: COLORS.border,
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      {/* 55.2: getModalBackdrop derives its tint from COLORS.background so the
          scrim matches every theme (dark themes → deep scrim; light → pale scrim). */}
      <View style={[styles.overlay, { backgroundColor: getModalBackdrop(0.70) }]}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.sheetOuter}>
            {/* 55.2: was ['#1A1A38', '#0D0D20'] — now COLORS.gradientCard (theme-aware) */}
            <LinearGradient
              colors={COLORS.gradientCard as [string, string]}
              style={[styles.sheet, { borderTopColor: `${COLORS.primary}30` }]}
            >
              {/* Handle */}
              <View style={[styles.handle, dynHandle]} />

              {/* Header */}
              <View style={styles.sheetHeader}>
                <View style={styles.sheetHeaderLeft}>
                  <LinearGradient
                    colors={COLORS.gradientPrimary as [string, string]}
                    style={styles.sheetHeaderIcon}
                  >
                    <Ionicons name="bookmark" size={18} color="#FFF" />
                  </LinearGradient>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.sheetTitle, { color: COLORS.textPrimary }]}>
                      Add to Collection
                    </Text>
                    <Text
                      style={[styles.sheetSubtitle, { color: COLORS.textMuted }]}
                      numberOfLines={1}
                    >
                      {contentTitle}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  onPress={onClose}
                  hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
                  style={[styles.closeBtn, dynCloseBtn]}
                >
                  <Ionicons name="close" size={18} color={COLORS.textMuted} />
                </TouchableOpacity>
              </View>

              {/* Member count strip */}
              {memberCount > 0 && (
                <View style={[styles.memberStrip, dynMemberStrip]}>
                  <Ionicons name="checkmark-circle" size={13} color={COLORS.success} />
                  <Text style={[styles.memberStripText, { color: COLORS.success }]}>
                    In {memberCount} collection{memberCount !== 1 ? 's' : ''}
                  </Text>
                </View>
              )}

              {/* Collections list */}
              <ScrollView
                style={{ maxHeight: 320 }}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: SPACING.sm }}
                keyboardShouldPersistTaps="handled"
              >
                {isLoading && collections.length === 0 ? (
                  <View style={styles.loadingWrap}>
                    <ActivityIndicator color={COLORS.primary} />
                    <Text style={[styles.loadingText, { color: COLORS.textMuted }]}>
                      Loading collections…
                    </Text>
                  </View>
                ) : collections.length === 0 ? (
                  <View style={styles.emptyWrap}>
                    {/* 55.2: was ['#22223E', '#1A1A33'] — now theme-aware surfaces */}
                    <LinearGradient
                      colors={[COLORS.backgroundElevated, COLORS.background] as [string, string]}
                      style={[styles.emptyIconWrap, dynEmptyIconWrap]}
                    >
                      <Ionicons name="folder-outline" size={32} color={COLORS.textMuted} />
                    </LinearGradient>
                    <Text style={[styles.emptyText, { color: COLORS.textSecondary }]}>
                      No collections yet
                    </Text>
                    <Text style={[styles.emptySubtext, { color: COLORS.textMuted }]}>
                      Create one below to start organising
                    </Text>
                  </View>
                ) : (
                  collections.map((col, i) => (
                    <Animated.View
                      key={col.id}
                      entering={FadeInDown.duration(250).delay(Math.min(i, 8) * 40)}
                    >
                      <CollectionRow
                        collection={col}
                        isChecked={memberIds.includes(col.id)}
                        isToggling={togglingId === col.id}
                        onToggle={() => handleToggle(col)}
                      />
                    </Animated.View>
                  ))
                )}
              </ScrollView>

              {/* Quick create */}
              <QuickCreateForm
                onCreated={handleCreated}
                onCreate={create}
                isCreating={isCreating}
              />
            </LinearGradient>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// ─── Styles (layout-only — NO COLORS references) ──────────────────────────────

const styles = StyleSheet.create({
  overlay: {
    flex:           1,
    justifyContent: 'flex-end',
  },
  sheetOuter: {
    borderTopLeftRadius:  28,
    borderTopRightRadius: 28,
    overflow:             'hidden',
  },
  sheet: {
    paddingHorizontal: SPACING.xl,
    paddingBottom:     SPACING.xl + 16,
    borderTopWidth:    1,
  },
  handle: {
    width:          40,
    height:         4,
    borderRadius:   2,
    alignSelf:      'center',
    marginVertical: SPACING.md,
  },
  sheetHeader: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    marginBottom:   SPACING.md,
    gap:            SPACING.sm,
  },
  sheetHeaderLeft: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           SPACING.sm,
    flex:          1,
    minWidth:      0,
  },
  sheetHeaderIcon: {
    width:          40,
    height:         40,
    borderRadius:   12,
    alignItems:     'center',
    justifyContent: 'center',
    flexShrink:     0,
    ...SHADOWS.small,
  },
  sheetTitle: {
    fontSize:   FONTS.sizes.base,
    fontWeight: '800',
  },
  sheetSubtitle: {
    fontSize:  FONTS.sizes.xs,
    marginTop: 1,
  },
  closeBtn: {
    width:          32,
    height:         32,
    borderRadius:   10,
    alignItems:     'center',
    justifyContent: 'center',
    borderWidth:    1,
    flexShrink:     0,
  },
  memberStrip: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               6,
    alignSelf:         'flex-start',
    borderRadius:      RADIUS.full,
    paddingHorizontal: 11,
    paddingVertical:   5,
    borderWidth:       1,
    marginBottom:      SPACING.md,
  },
  memberStripText: {
    fontSize:   FONTS.sizes.xs,
    fontWeight: '700',
  },
  collectionRow: {
    flexDirection:  'row',
    alignItems:     'center',
    padding:        SPACING.md,
    borderRadius:   RADIUS.lg,
    marginBottom:   SPACING.sm,
    borderWidth:    1,
    gap:            SPACING.md,
  },
  rowIcon: {
    width:          38,
    height:         38,
    borderRadius:   11,
    alignItems:     'center',
    justifyContent: 'center',
    flexShrink:     0,
  },
  rowText: {
    flex: 1,
    gap:  2,
  },
  rowName: {
    fontSize:   FONTS.sizes.base,
    fontWeight: '700',
  },
  rowCount: {
    fontSize: FONTS.sizes.xs,
  },
  checkbox: {
    width:          22,
    height:         22,
    borderRadius:   7,
    borderWidth:    1.5,
    alignItems:     'center',
    justifyContent: 'center',
    flexShrink:     0,
  },
  createTrigger: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               SPACING.sm,
    paddingVertical:   SPACING.md,
    paddingHorizontal: SPACING.md,
    marginTop:         SPACING.xs,
    borderRadius:      RADIUS.lg,
    borderWidth:       1,
    borderStyle:       'dashed',
  },
  createTriggerIcon: {
    width:          36,
    height:         36,
    borderRadius:   11,
    alignItems:     'center',
    justifyContent: 'center',
    borderWidth:    1,
  },
  createTriggerText: {
    fontSize:   FONTS.sizes.base,
    fontWeight: '700',
  },
  createTriggerSub: {
    fontSize:  FONTS.sizes.xs,
    marginTop: 1,
  },
  quickForm: {
    borderRadius: RADIUS.xl,
    padding:      SPACING.md,
    borderWidth:  1,
    marginTop:    SPACING.sm,
  },
  quickFormHeader: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           SPACING.sm,
    marginBottom:  SPACING.sm,
  },
  quickFormPreviewIcon: {
    width:          32,
    height:         32,
    borderRadius:   10,
    alignItems:     'center',
    justifyContent: 'center',
  },
  quickFormTitle: {
    flex:       1,
    fontSize:   FONTS.sizes.base,
    fontWeight: '800',
  },
  quickInput: {
    borderRadius:      RADIUS.lg,
    paddingHorizontal: SPACING.md,
    paddingVertical:   10,
    fontSize:          FONTS.sizes.base,
    borderWidth:       1,
    marginBottom:      SPACING.sm,
  },
  colorSwatch: {
    width:          28,
    height:         28,
    borderRadius:   9,
    alignItems:     'center',
    justifyContent: 'center',
  },
  colorSwatchActive: {
    borderWidth:  2.5,
    borderColor:  '#FFF',
  },
  iconSwatch: {
    width:          36,
    height:         36,
    borderRadius:   10,
    alignItems:     'center',
    justifyContent: 'center',
    borderWidth:    1,
  },
  quickFormRow: {
    flexDirection: 'row',
    gap:           SPACING.sm,
    marginTop:     SPACING.sm,
  },
  cancelBtn: {
    borderRadius:      RADIUS.lg,
    paddingVertical:   12,
    paddingHorizontal: SPACING.lg,
    borderWidth:       1,
    alignItems:        'center',
    justifyContent:    'center',
  },
  cancelBtnText: {
    fontWeight: '600',
    fontSize:   FONTS.sizes.base,
  },
  createBtn: {
    borderRadius:   RADIUS.lg,
    paddingVertical: 12,
    alignItems:     'center',
    justifyContent: 'center',
  },
  createBtnText: {
    color:      '#FFF',
    fontWeight: '700',
    fontSize:   FONTS.sizes.base,
  },
  loadingWrap: {
    alignItems:      'center',
    paddingVertical: SPACING.xl,
    gap:             SPACING.sm,
  },
  loadingText: {
    fontSize: FONTS.sizes.sm,
  },
  emptyWrap: {
    alignItems:      'center',
    paddingVertical: SPACING.xl,
    gap:             SPACING.sm,
  },
  emptyIconWrap: {
    width:          64,
    height:         64,
    borderRadius:   20,
    alignItems:     'center',
    justifyContent: 'center',
    marginBottom:   SPACING.xs,
    borderWidth:    1,
  },
  emptyText: {
    fontSize:   FONTS.sizes.base,
    fontWeight: '700',
  },
  emptySubtext: {
    fontSize: FONTS.sizes.sm,
  },
});