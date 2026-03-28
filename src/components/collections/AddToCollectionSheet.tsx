// src/components/collections/AddToCollectionSheet.tsx
// Part 35 — Collections: Bottom sheet to add/remove a content item
// from one or more collections. Shows all user collections with
// a toggle checkmark per collection.

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
import { BlurView }       from 'expo-blur';
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
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';

// Define the color type from COLLECTION_COLORS
type CollectionColor = typeof COLLECTION_COLORS[number];

// ─── Props ────────────────────────────────────────────────────────────────────

interface AddToCollectionSheetProps {
  visible:     boolean;
  contentType: CollectionItemType;
  contentId:   string;
  contentTitle:string;
  onClose:     () => void;
}

// ─── Quick Create Mini-Form ───────────────────────────────────────────────────

interface QuickCreateProps {
  onCreated: (col: Collection) => void;
  onCreate:  (input: CollectionInput) => Promise<Collection | null>;
  isCreating: boolean;
}

function QuickCreateForm({ onCreated, onCreate, isCreating }: QuickCreateProps) {
  const [name,    setName]    = useState('');
  const [color,   setColor]   = useState<CollectionColor>(COLLECTION_COLORS[0]);
  const [icon,    setIcon]    = useState('folder');
  const [expanded, setExpanded] = useState(false);

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) { Alert.alert('Name required', 'Please enter a collection name.'); return; }
    const col = await onCreate({ name: trimmed, color, icon });
    if (col) {
      setName('');
      setExpanded(false);
      onCreated(col);
    }
  };

  if (!expanded) {
    return (
      <TouchableOpacity
        onPress={() => setExpanded(true)}
        activeOpacity={0.8}
        style={styles.createTrigger}
      >
        <View style={styles.createTriggerIcon}>
          <Ionicons name="add" size={18} color={COLORS.primary} />
        </View>
        <Text style={styles.createTriggerText}>New Collection</Text>
      </TouchableOpacity>
    );
  }

  return (
    <Animated.View entering={FadeIn.duration(250)} style={styles.quickForm}>
      <Text style={styles.quickFormTitle}>New Collection</Text>

      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Collection name..."
        placeholderTextColor={COLORS.textMuted}
        autoFocus
        style={styles.quickInput}
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
          style={styles.cancelBtn}
        >
          <Text style={styles.cancelBtnText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleCreate}
          disabled={isCreating || !name.trim()}
          activeOpacity={0.85}
          style={{ flex: 1 }}
        >
          <LinearGradient
            colors={COLORS.gradientPrimary}
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
  return (
    <TouchableOpacity
      onPress={onToggle}
      disabled={isToggling}
      activeOpacity={0.78}
      style={[
        styles.collectionRow,
        isChecked && { borderColor: `${color}50`, backgroundColor: `${color}08` },
      ]}
    >
      <View style={[styles.rowIcon, { backgroundColor: `${color}20` }]}>
        <Ionicons name={collection.icon as any} size={18} color={color} />
      </View>

      <View style={styles.rowText}>
        <Text style={styles.rowName} numberOfLines={1}>
          {collection.name}
        </Text>
        <Text style={styles.rowCount}>
          {collection.itemCount} {collection.itemCount === 1 ? 'item' : 'items'}
        </Text>
      </View>

      {isToggling
        ? <ActivityIndicator size="small" color={color} />
        : (
          <View style={[
            styles.checkbox,
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

  // Refresh when sheet opens
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

  const isLoading = loadingCollections || loadingMembership;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <BlurView intensity={20} style={styles.overlay}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.sheet}>
            {/* Handle */}
            <View style={styles.handle} />

            {/* Header */}
            <View style={styles.sheetHeader}>
              <View style={styles.sheetHeaderLeft}>
                <LinearGradient
                  colors={COLORS.gradientPrimary}
                  style={styles.sheetHeaderIcon}
                >
                  <Ionicons name="bookmark" size={18} color="#FFF" />
                </LinearGradient>
                <View>
                  <Text style={styles.sheetTitle}>Add to Collection</Text>
                  <Text style={styles.sheetSubtitle} numberOfLines={1}>
                    {contentTitle}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={onClose}
                hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
                style={styles.closeBtn}
              >
                <Ionicons name="close" size={18} color={COLORS.textMuted} />
              </TouchableOpacity>
            </View>

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
                  <Text style={styles.loadingText}>Loading collections…</Text>
                </View>
              ) : collections.length === 0 ? (
                <View style={styles.emptyWrap}>
                  <Ionicons name="folder-outline" size={36} color={COLORS.border} />
                  <Text style={styles.emptyText}>No collections yet</Text>
                  <Text style={styles.emptySubtext}>Create one below to start organising</Text>
                </View>
              ) : (
                collections.map((col, i) => (
                  <Animated.View
                    key={col.id}
                    entering={FadeInDown.duration(250).delay(i * 40)}
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
          </View>
        </KeyboardAvoidingView>
      </BlurView>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {
    flex:            1,
    backgroundColor: 'rgba(10,10,26,0.70)',
    justifyContent:  'flex-end',
  },
  sheet: {
    backgroundColor:      COLORS.backgroundCard,
    borderTopLeftRadius:  28,
    borderTopRightRadius: 28,
    paddingHorizontal:    SPACING.xl,
    paddingBottom:        SPACING.xl + 16,
    borderTopWidth:       1,
    borderTopColor:       COLORS.border,
  },
  handle: {
    width:           40,
    height:          4,
    borderRadius:    2,
    backgroundColor: COLORS.border,
    alignSelf:       'center',
    marginVertical:  SPACING.md,
  },
  sheetHeader: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'space-between',
    marginBottom:    SPACING.lg,
  },
  sheetHeaderLeft: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:            SPACING.sm,
    flex:           1,
    minWidth:       0,
  },
  sheetHeaderIcon: {
    width:          40,
    height:         40,
    borderRadius:   12,
    alignItems:     'center',
    justifyContent: 'center',
    flexShrink:     0,
  },
  sheetTitle: {
    color:      COLORS.textPrimary,
    fontSize:   FONTS.sizes.base,
    fontWeight: '700',
  },
  sheetSubtitle: {
    color:    COLORS.textMuted,
    fontSize: FONTS.sizes.xs,
    marginTop: 1,
  },
  closeBtn: {
    width:           32,
    height:          32,
    borderRadius:    10,
    backgroundColor: COLORS.backgroundElevated,
    alignItems:      'center',
    justifyContent:  'center',
    borderWidth:     1,
    borderColor:     COLORS.border,
    flexShrink:      0,
  },

  // Collection row
  collectionRow: {
    flexDirection:  'row',
    alignItems:     'center',
    padding:        SPACING.md,
    backgroundColor: COLORS.backgroundElevated,
    borderRadius:   RADIUS.lg,
    marginBottom:   SPACING.sm,
    borderWidth:    1,
    borderColor:    COLORS.border,
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
    color:      COLORS.textPrimary,
    fontSize:   FONTS.sizes.base,
    fontWeight: '600',
  },
  rowCount: {
    color:    COLORS.textMuted,
    fontSize: FONTS.sizes.xs,
  },
  checkbox: {
    width:          22,
    height:         22,
    borderRadius:    6,
    borderWidth:     1.5,
    borderColor:    COLORS.border,
    alignItems:     'center',
    justifyContent: 'center',
    flexShrink:     0,
  },

  // Quick create
  createTrigger: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:             SPACING.sm,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.sm,
  },
  createTriggerIcon: {
    width:          36,
    height:         36,
    borderRadius:   11,
    backgroundColor: `${COLORS.primary}18`,
    alignItems:     'center',
    justifyContent: 'center',
    borderWidth:    1,
    borderColor:    `${COLORS.primary}30`,
    borderStyle:    'dashed',
  },
  createTriggerText: {
    color:      COLORS.primary,
    fontSize:   FONTS.sizes.base,
    fontWeight: '600',
  },
  quickForm: {
    backgroundColor: COLORS.backgroundElevated,
    borderRadius:    RADIUS.xl,
    padding:         SPACING.md,
    borderWidth:     1,
    borderColor:     `${COLORS.primary}30`,
    marginTop:       SPACING.sm,
  },
  quickFormTitle: {
    color:        COLORS.textPrimary,
    fontSize:     FONTS.sizes.base,
    fontWeight:   '700',
    marginBottom: SPACING.sm,
  },
  quickInput: {
    backgroundColor:   COLORS.backgroundCard,
    borderRadius:      RADIUS.lg,
    paddingHorizontal: SPACING.md,
    paddingVertical:   10,
    color:             COLORS.textPrimary,
    fontSize:          FONTS.sizes.base,
    borderWidth:       1,
    borderColor:       COLORS.border,
    marginBottom:      SPACING.sm,
  },
  colorSwatch: {
    width:          28,
    height:         28,
    borderRadius:    9,
    alignItems:     'center',
    justifyContent: 'center',
  },
  colorSwatchActive: {
    borderWidth: 2.5,
    borderColor: '#FFF',
  },
  iconSwatch: {
    width:          36,
    height:         36,
    borderRadius:   10,
    alignItems:     'center',
    justifyContent: 'center',
    backgroundColor: COLORS.backgroundCard,
    borderWidth:    1,
    borderColor:    COLORS.border,
  },
  quickFormRow: {
    flexDirection: 'row',
    gap:            SPACING.sm,
    marginTop:     SPACING.sm,
  },
  cancelBtn: {
    backgroundColor:   COLORS.backgroundCard,
    borderRadius:      RADIUS.lg,
    paddingVertical:   12,
    paddingHorizontal: SPACING.lg,
    borderWidth:       1,
    borderColor:       COLORS.border,
    alignItems:        'center',
    justifyContent:    'center',
  },
  cancelBtnText: {
    color:      COLORS.textMuted,
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

  // States
  loadingWrap: {
    alignItems:    'center',
    paddingVertical: SPACING.xl,
    gap:            SPACING.sm,
  },
  loadingText: {
    color:    COLORS.textMuted,
    fontSize: FONTS.sizes.sm,
  },
  emptyWrap: {
    alignItems:    'center',
    paddingVertical: SPACING.xl,
    gap:            SPACING.sm,
  },
  emptyText: {
    color:      COLORS.textSecondary,
    fontSize:   FONTS.sizes.base,
    fontWeight: '600',
  },
  emptySubtext: {
    color:    COLORS.textMuted,
    fontSize: FONTS.sizes.sm,
  },
});