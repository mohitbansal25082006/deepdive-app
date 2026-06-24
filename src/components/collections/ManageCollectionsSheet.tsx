// src/components/collections/ManageCollectionsSheet.tsx
// Part 35 — Collections: Full manager bottom sheet
// Part 50.8 — UI UPGRADE
// Part 55.2 — FULL THEME-COMPATIBILITY PASS (inline + getter-based style fix)
//
// Changes vs Part 50.8 — same two-pronged strategy as AddToCollectionSheet:
//
//   INLINE fixes (LinearGradient colors / View backgroundColor):
//     • overlayInner bg: 'rgba(10,10,26,0.72)' → getModalBackdrop(0.72) ✓
//     • sheet gradient: ['#1A1A38', '#0D0D20'] → COLORS.gradientCard ✓
//     • emptyIcon gradient: ['#22223E', '#1A1A33'] → [COLORS.backgroundElevated, COLORS.background] ✓
//
//   GETTER-BASED fixes (COLORS.x moved OUT of StyleSheet.create into dyn* objects):
//     • handle.backgroundColor: COLORS.border
//     • backBtn.backgroundColor: COLORS.backgroundElevated / borderColor: COLORS.border
//     • addBtn.backgroundColor: ${COLORS.primary}18 / borderColor: ${COLORS.primary}35
//     • headerTitle.color: COLORS.textPrimary
//     • listMeta.color: COLORS.textMuted
//     • preview.backgroundColor: COLORS.backgroundElevated / borderColor: COLORS.border
//     • previewName.color: COLORS.textPrimary
//     • previewDesc.color: COLORS.textMuted
//     • fieldLabel.color: COLORS.textMuted
//     • input.backgroundColor: COLORS.background / color: COLORS.textPrimary / borderColor: COLORS.border
//     • iconSwatch.backgroundColor: COLORS.background / borderColor: COLORS.border
//     • cancelBtn.backgroundColor: COLORS.backgroundElevated / borderColor: COLORS.border
//     • cancelBtnText.color: COLORS.textMuted
//     • emptyTitle.color: COLORS.textPrimary
//     • emptySubtext.color: COLORS.textMuted
//     • createFirstBtnText.color: #FFF (static white — kept)
//     • saveBtnText.color: #FFF (static white — kept)
//   All platform-compat logic (BackHandler, IS_IOS/IS_ANDROID, platformShadow,
//   SAFE_BOTTOM/SAFE_TOP, modal timing, KeyboardAvoidingView) is unchanged.

import React, {
  useState,
  useCallback,
  useEffect,
  useRef,
} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Modal,
  TextInput,
  Alert,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  Dimensions,
  Keyboard,
  TouchableWithoutFeedback,
  BackHandler,
} from 'react-native';
import { Ionicons }       from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  FadeIn,
  Layout,
} from 'react-native-reanimated';
import { router }         from 'expo-router';
import { useCollections } from '../../hooks/useCollections';
import { CollectionCard } from './CollectionCard';
import {
  Collection,
  CollectionInput,
  COLLECTION_COLORS,
  COLLECTION_ICONS,
}                         from '../../types/collections';
import {
  COLORS, FONTS, SPACING, RADIUS,
  getModalBackdrop,
}                         from '../../constants/theme';

// ─── Platform helpers ─────────────────────────────────────────────────────────

const IS_IOS     = Platform.OS === 'ios';
const IS_ANDROID = Platform.OS === 'android';
const { height: SCREEN_H } = Dimensions.get('window');

const SAFE_BOTTOM = IS_IOS ? 34 : 0;

function platformShadow(
  color    = '#000',
  opacity  = 0.18,
  radius   = 8,
  offsetY  = 4,
  elevation = 6,
) {
  if (IS_IOS) {
    return {
      shadowColor:   color,
      shadowOpacity: opacity,
      shadowRadius:  radius,
      shadowOffset:  { width: 0, height: offsetY },
    };
  }
  return { elevation };
}

// ─── Overlay ──────────────────────────────────────────────────────────────────
// 55.2: uses getModalBackdrop() instead of a hardcoded dark hex literal so the
// scrim adapts to every theme.

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <View style={[styles.overlayInner, { backgroundColor: getModalBackdrop(0.72) }]}>
      {children}
    </View>
  );
}

// ─── Collection Form ──────────────────────────────────────────────────────────

interface CollectionFormProps {
  initial?:  Partial<CollectionInput>;
  onSave:    (input: CollectionInput) => void;
  onCancel:  () => void;
  isSaving:  boolean;
  isEditing: boolean;
}

function CollectionForm({
  initial,
  onSave,
  onCancel,
  isSaving,
  isEditing,
}: CollectionFormProps) {
  const [name,         setName]         = useState(initial?.name        ?? '');
  const [description,  setDescription]  = useState(initial?.description ?? '');
  const [color,        setColor]        = useState(initial?.color       ?? COLLECTION_COLORS[0]);
  const [icon,         setIcon]         = useState(initial?.icon        ?? 'folder');
  const [showAllIcons, setShowAllIcons] = useState(false);

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      Alert.alert('Name required', 'Please enter a collection name.');
      return;
    }
    onSave({ name: trimmed, description: description.trim() || undefined, color, icon });
  };

  // Dynamic getter styles
  const dynPreview  = { backgroundColor: COLORS.backgroundElevated, borderColor: COLORS.border };
  const dynInput    = { backgroundColor: COLORS.background, color: COLORS.textPrimary, borderColor: COLORS.border };
  const dynCancelBtn = { backgroundColor: COLORS.backgroundElevated, borderColor: COLORS.border };
  const dynIconSwatch = { backgroundColor: COLORS.background, borderColor: COLORS.border };

  return (
    <TouchableWithoutFeedback onPress={IS_ANDROID ? Keyboard.dismiss : undefined}>
      <KeyboardAvoidingView
        behavior={IS_IOS ? 'padding' : 'height'}
        keyboardVerticalOffset={IS_IOS ? 0 : 20}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          overScrollMode={IS_ANDROID ? 'never' : 'auto'}
          contentContainerStyle={{ gap: SPACING.md, paddingBottom: SPACING.lg + SAFE_BOTTOM }}
        >
          {/* Live Preview */}
          {/* 55.2: was 'rgba(255,255,255,0.04)' → dynPreview */}
          <View style={[styles.preview, dynPreview]}>
            <LinearGradient colors={[color, `${color}99`]} style={styles.previewIcon}>
              <Ionicons name={icon as any} size={28} color="#FFF" />
            </LinearGradient>
            <View style={{ flex: 1 }}>
              <Text style={[styles.previewName, { color: COLORS.textPrimary }]} numberOfLines={1}>
                {name || 'Collection Name'}
              </Text>
              <Text style={[styles.previewDesc, { color: COLORS.textMuted }]} numberOfLines={1}>
                {description || 'Your collection description'}
              </Text>
            </View>
          </View>

          {/* Name */}
          <View>
            <Text style={[styles.fieldLabel, { color: COLORS.textMuted }]}>NAME *</Text>
            {/* 55.2: was 'rgba(0,0,0,0.25)' → dynInput */}
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="e.g. Competitor Analysis"
              placeholderTextColor={COLORS.textMuted}
              style={[styles.input, dynInput]}
              maxLength={60}
              autoFocus={!isEditing}
              returnKeyType="done"
              onSubmitEditing={Keyboard.dismiss}
              autoCorrect={false}
              autoCapitalize="words"
            />
          </View>

          {/* Description */}
          <View>
            <Text style={[styles.fieldLabel, { color: COLORS.textMuted }]}>DESCRIPTION (OPTIONAL)</Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="What is this collection for?"
              placeholderTextColor={COLORS.textMuted}
              style={[
                styles.input,
                dynInput,
                {
                  minHeight:         64,
                  textAlignVertical: IS_ANDROID ? 'top' : undefined,
                  paddingTop:        12,
                },
              ]}
              multiline
              maxLength={200}
              returnKeyType="default"
              blurOnSubmit={false}
            />
          </View>

          {/* Color */}
          <View>
            <Text style={[styles.fieldLabel, { color: COLORS.textMuted }]}>COLOR</Text>
            <View style={styles.colorGrid}>
              {COLLECTION_COLORS.map(c => (
                <TouchableOpacity
                  key={c}
                  onPress={() => setColor(c)}
                  activeOpacity={0.75}
                  style={[
                    styles.colorSwatch,
                    { backgroundColor: c },
                    color === c && styles.colorSwatchActive,
                    color === c && platformShadow(c, 0.45, 6, 3, 5),
                  ]}
                  hitSlop={{ top: 6, right: 6, bottom: 6, left: 6 }}
                >
                  {color === c && <Ionicons name="checkmark" size={14} color="#FFF" />}
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Icon */}
          <View>
            <Text style={[styles.fieldLabel, { color: COLORS.textMuted }]}>ICON</Text>
            <View style={styles.iconGrid}>
              {(showAllIcons ? COLLECTION_ICONS : COLLECTION_ICONS.slice(0, 10)).map(ic => (
                <TouchableOpacity
                  key={ic.id}
                  onPress={() => setIcon(ic.id)}
                  activeOpacity={0.75}
                  hitSlop={{ top: 4, right: 4, bottom: 4, left: 4 }}
                  style={[
                    styles.iconSwatch,
                    dynIconSwatch,
                    icon === ic.id && {
                      backgroundColor: `${color}25`,
                      borderColor:     color,
                    },
                  ]}
                >
                  <Ionicons
                    name={ic.id as any}
                    size={20}
                    color={icon === ic.id ? color : COLORS.textMuted}
                  />
                </TouchableOpacity>
              ))}
              {!showAllIcons && (
                <TouchableOpacity
                  onPress={() => setShowAllIcons(true)}
                  activeOpacity={0.75}
                  style={[styles.iconSwatch, dynIconSwatch, { borderStyle: 'dashed' }]}
                >
                  <Ionicons name="ellipsis-horizontal" size={18} color={COLORS.textMuted} />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Buttons */}
          <View style={styles.formBtns}>
            {/* 55.2: was 'rgba(255,255,255,0.05)' → dynCancelBtn */}
            <TouchableOpacity onPress={onCancel} activeOpacity={0.75} style={[styles.cancelBtn, dynCancelBtn]}>
              <Text style={[styles.cancelBtnText, { color: COLORS.textMuted }]}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleSave}
              disabled={isSaving || !name.trim()}
              activeOpacity={0.85}
              style={{ flex: 1 }}
            >
              <LinearGradient
                colors={COLORS.gradientPrimary as [string, string]}
                style={[styles.saveBtn, (!name.trim() || isSaving) && { opacity: 0.5 }]}
              >
                {isSaving ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Text style={styles.saveBtnText}>
                    {isEditing ? 'Save Changes' : 'Create Collection'}
                  </Text>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </TouchableWithoutFeedback>
  );
}

// ─── Main Sheet ───────────────────────────────────────────────────────────────

interface ManageCollectionsSheetProps {
  visible: boolean;
  onClose: () => void;
}

type SheetView = 'list' | 'create' | 'edit';

export function ManageCollectionsSheet({
  visible,
  onClose,
}: ManageCollectionsSheetProps) {
  const {
    collections,
    isLoading,
    isCreating,
    refresh,
    create,
    update,
    remove,
  } = useCollections();

  const [view,       setView]       = useState<SheetView>('list');
  const [editTarget, setEditTarget] = useState<Collection | null>(null);
  const [isSaving,   setIsSaving]   = useState(false);

  useEffect(() => {
    if (!IS_ANDROID || !visible) return;
    const onBackPress = () => {
      if (view !== 'list') { setView('list'); setEditTarget(null); }
      else onClose();
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, [visible, view, onClose]);

  useEffect(() => {
    if (visible) { setView('list'); setEditTarget(null); refresh(); }
  }, [visible]);

  const handleCreate = useCallback(async (input: CollectionInput) => {
    setIsSaving(true);
    const col = await create(input);
    setIsSaving(false);
    if (col) setView('list');
  }, [create]);

  const handleUpdate = useCallback(async (input: CollectionInput) => {
    if (!editTarget) return;
    setIsSaving(true);
    await update(editTarget.id, input);
    setIsSaving(false);
    setView('list');
    setEditTarget(null);
  }, [editTarget, update]);

  const handleDelete = useCallback((col: Collection) => {
    Alert.alert(
      'Delete Collection',
      `Delete "${col.name}"? The items inside won't be deleted — just removed from this collection.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => remove(col.id) },
      ],
    );
  }, [remove]);

  const handleOpen = useCallback((col: Collection) => {
    onClose();
    setTimeout(() => {
      router.push({
        pathname: '/(app)/collection-detail' as any,
        params:   { collectionId: col.id },
      });
    }, IS_IOS ? 300 : 400);
  }, [onClose]);

  const goBack = useCallback(() => { setView('list'); setEditTarget(null); }, []);

  const headerTitle =
    view === 'create' ? 'New Collection' :
    view === 'edit'   ? 'Edit Collection' :
    'My Collections';

  // Dynamic getter styles
  const dynHandle      = { backgroundColor: COLORS.border };
  const dynBackBtn     = { backgroundColor: COLORS.backgroundElevated, borderColor: COLORS.border };
  const dynAddBtn      = { backgroundColor: `${COLORS.primary}18`, borderColor: `${COLORS.primary}35` };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={() => { if (view !== 'list') goBack(); else onClose(); }}
      statusBarTranslucent={IS_ANDROID}
      hardwareAccelerated={IS_ANDROID}
    >
      <Overlay>
        <TouchableWithoutFeedback
          onPress={() => { Keyboard.dismiss(); if (view !== 'list') goBack(); else onClose(); }}
        >
          <View style={{ flex: 1 }} />
        </TouchableWithoutFeedback>

        <View style={styles.sheetOuter}>
          {/* 55.2: was ['#1A1A38', '#0D0D20'] — now COLORS.gradientCard (theme-aware).
              borderTopColor also uses live COLORS.primary so it matches the accent. */}
          <LinearGradient
            colors={COLORS.gradientCard as [string, string]}
            style={[styles.sheet, { borderTopColor: `${COLORS.primary}30` }]}
          >
            {/* Drag handle */}
            <View style={[styles.handle, dynHandle]} />

            {/* ── Header ── */}
            <View style={styles.header}>
              {view !== 'list' ? (
                <TouchableOpacity
                  onPress={goBack}
                  hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
                  activeOpacity={0.7}
                  style={[styles.backBtn, dynBackBtn]}
                >
                  <Ionicons name="arrow-back" size={18} color={COLORS.textSecondary} />
                </TouchableOpacity>
              ) : (
                <View style={styles.headerIconWrap}>
                  <LinearGradient
                    colors={COLORS.gradientPrimary as [string, string]}
                    style={styles.headerIconGrad}
                  >
                    <Ionicons name="folder" size={17} color="#FFF" />
                  </LinearGradient>
                </View>
              )}

              <Text style={[styles.headerTitle, { color: COLORS.textPrimary }]} numberOfLines={1}>
                {headerTitle}
              </Text>

              {view === 'list' ? (
                <TouchableOpacity
                  onPress={() => setView('create')}
                  activeOpacity={0.8}
                  hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                  style={[styles.addBtn, dynAddBtn]}
                >
                  <Ionicons name="add" size={18} color={COLORS.primary} />
                </TouchableOpacity>
              ) : (
                <View style={{ width: 34 }} />
              )}
            </View>

            {/* ── Content: List ── */}
            {view === 'list' && (
              <ScrollView
                style={{ maxHeight: SCREEN_H * 0.55 }}
                showsVerticalScrollIndicator={false}
                overScrollMode={IS_ANDROID ? 'never' : 'auto'}
                contentContainerStyle={{ paddingBottom: SAFE_BOTTOM + SPACING.lg }}
              >
                {isLoading && collections.length === 0 ? (
                  <View style={styles.centeredState}>
                    <ActivityIndicator color={COLORS.primary} />
                  </View>
                ) : collections.length === 0 ? (
                  <Animated.View entering={FadeIn.duration(400)} style={styles.centeredState}>
                    {/* 55.2: was ['#22223E', '#1A1A33'] — now theme-aware surfaces */}
                    <LinearGradient
                      colors={[COLORS.backgroundElevated, COLORS.background] as [string, string]}
                      style={[styles.emptyIcon, { borderColor: COLORS.border }]}
                    >
                      <Ionicons name="folder-open-outline" size={40} color={COLORS.textMuted} />
                    </LinearGradient>
                    <Text style={[styles.emptyTitle, { color: COLORS.textPrimary }]}>
                      No collections yet
                    </Text>
                    <Text style={[styles.emptySubtext, { color: COLORS.textMuted }]}>
                      Create your first collection to start organising your research
                    </Text>
                    <TouchableOpacity
                      onPress={() => setView('create')}
                      activeOpacity={0.85}
                      style={{ marginTop: SPACING.md }}
                    >
                      <LinearGradient
                        colors={COLORS.gradientPrimary as [string, string]}
                        style={styles.createFirstBtn}
                      >
                        <Ionicons name="add" size={16} color="#FFF" />
                        <Text style={styles.createFirstBtnText}>Create First Collection</Text>
                      </LinearGradient>
                    </TouchableOpacity>
                  </Animated.View>
                ) : (
                  <>
                    <Text style={[styles.listMeta, { color: COLORS.textMuted }]}>
                      {collections.length} collection{collections.length !== 1 ? 's' : ''}
                    </Text>
                    {collections.map((col, i) => (
                      <Animated.View key={col.id} layout={Layout.springify()}>
                        <CollectionCard
                          collection={col}
                          index={i}
                          onPress={() => handleOpen(col)}
                          showMenu
                          onEdit={() => { setEditTarget(col); setView('edit'); }}
                          onDelete={() => handleDelete(col)}
                        />
                      </Animated.View>
                    ))}
                  </>
                )}
              </ScrollView>
            )}

            {/* ── Content: Create ── */}
            {view === 'create' && (
              <Animated.View entering={FadeIn.duration(250)}>
                <CollectionForm
                  onSave={handleCreate}
                  onCancel={goBack}
                  isSaving={isSaving || isCreating}
                  isEditing={false}
                />
              </Animated.View>
            )}

            {/* ── Content: Edit ── */}
            {view === 'edit' && editTarget && (
              <Animated.View entering={FadeIn.duration(250)}>
                <CollectionForm
                  initial={{
                    name:        editTarget.name,
                    description: editTarget.description ?? '',
                    color:       editTarget.color,
                    icon:        editTarget.icon,
                  }}
                  onSave={handleUpdate}
                  onCancel={goBack}
                  isSaving={isSaving}
                  isEditing
                />
              </Animated.View>
            )}
          </LinearGradient>
        </View>
      </Overlay>
    </Modal>
  );
}

// ─── Styles (layout-only — NO COLORS references baked in) ────────────────────

const styles = StyleSheet.create({
  overlayInner: {
    flex:           1,
    justifyContent: 'flex-end',
  },
  sheetOuter: {
    borderTopLeftRadius:  28,
    borderTopRightRadius: 28,
    overflow:             'hidden',
    ...platformShadow('#000', 0.35, 20, -4, 16),
  },
  sheet: {
    paddingHorizontal: SPACING.xl,
    paddingBottom:     SPACING.xl + SAFE_BOTTOM,
    borderTopWidth:    1,
  },
  handle: {
    width:          40,
    height:         4,
    borderRadius:   2,
    alignSelf:      'center',
    marginVertical: SPACING.md,
  },
  header: {
    flexDirection:  'row',
    alignItems:     'center',
    marginBottom:   SPACING.lg,
    gap:            SPACING.sm,
  },
  backBtn: {
    width:          34,
    height:         34,
    borderRadius:   10,
    alignItems:     'center',
    justifyContent: 'center',
    borderWidth:    1,
    flexShrink:     0,
  },
  headerIconWrap: {
    flexShrink: 0,
  },
  headerIconGrad: {
    width:          34,
    height:         34,
    borderRadius:   10,
    alignItems:     'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex:       1,
    fontSize:   FONTS.sizes.lg,
    fontWeight: IS_ANDROID ? '700' : '800',
  },
  addBtn: {
    width:          34,
    height:         34,
    borderRadius:   10,
    alignItems:     'center',
    justifyContent: 'center',
    borderWidth:    1,
    flexShrink:     0,
  },
  listMeta: {
    fontSize:      FONTS.sizes.xs,
    fontWeight:    '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom:  SPACING.sm,
  },
  centeredState: {
    alignItems:      'center',
    paddingVertical: SPACING.xl,
    gap:             SPACING.sm,
  },
  emptyIcon: {
    width:          80,
    height:         80,
    borderRadius:   24,
    alignItems:     'center',
    justifyContent: 'center',
    marginBottom:   SPACING.sm,
    borderWidth:    1,
  },
  emptyTitle: {
    fontSize:   FONTS.sizes.base,
    fontWeight: '800',
  },
  emptySubtext: {
    fontSize:          FONTS.sizes.sm,
    textAlign:         'center',
    lineHeight:        20,
    paddingHorizontal: SPACING.xl,
  },
  createFirstBtn: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               6,
    borderRadius:      RADIUS.full,
    paddingHorizontal: SPACING.xl,
    paddingVertical:   12,
  },
  createFirstBtnText: {
    color:      '#FFF',
    fontSize:   FONTS.sizes.base,
    fontWeight: '700',
  },

  // Form
  preview: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           SPACING.md,
    borderRadius:  RADIUS.xl,
    padding:       SPACING.md,
    borderWidth:   1,
  },
  previewIcon: {
    width:          56,
    height:         56,
    borderRadius:   17,
    alignItems:     'center',
    justifyContent: 'center',
    flexShrink:     0,
  },
  previewName: {
    fontSize:   FONTS.sizes.base,
    fontWeight: '800',
  },
  previewDesc: {
    fontSize:  FONTS.sizes.xs,
    marginTop: 3,
  },
  fieldLabel: {
    fontSize:      FONTS.sizes.xs,
    fontWeight:    '700',
    letterSpacing: 0.8,
    marginBottom:  SPACING.sm,
  },
  input: {
    borderRadius:      RADIUS.lg,
    paddingHorizontal: SPACING.md,
    paddingVertical:   12,
    fontSize:          FONTS.sizes.base,
    borderWidth:       1,
    elevation:         0,
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           10,
  },
  colorSwatch: {
    width:          36,
    height:         36,
    borderRadius:   11,
    alignItems:     'center',
    justifyContent: 'center',
  },
  colorSwatchActive: {
    borderWidth:  2.5,
    borderColor:  '#FFF',
  },
  iconGrid: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           8,
  },
  iconSwatch: {
    width:          42,
    height:         42,
    borderRadius:   12,
    alignItems:     'center',
    justifyContent: 'center',
    borderWidth:    1,
  },
  formBtns: {
    flexDirection: 'row',
    gap:           SPACING.sm,
  },
  cancelBtn: {
    borderRadius:      RADIUS.lg,
    paddingVertical:   14,
    paddingHorizontal: SPACING.lg,
    borderWidth:       1,
    alignItems:        'center',
    justifyContent:    'center',
  },
  cancelBtnText: {
    fontWeight: '600',
    fontSize:   FONTS.sizes.base,
  },
  saveBtn: {
    borderRadius:   RADIUS.lg,
    paddingVertical: 14,
    alignItems:     'center',
    justifyContent: 'center',
  },
  saveBtnText: {
    color:      '#FFF',
    fontWeight: '700',
    fontSize:   FONTS.sizes.base,
  },
});