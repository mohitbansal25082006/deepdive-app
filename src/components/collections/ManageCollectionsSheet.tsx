// src/components/collections/ManageCollectionsSheet.tsx
// Part 35 — Collections: Full manager bottom sheet
// ✅ Full iOS + Android compatibility pass
//
// Shows all collections, lets user:
//   • View and navigate into each collection
//   • Create a new collection (full form with color + icon picker)
//   • Edit name, description, color, icon of a collection
//   • Delete a collection with confirmation
//
// Used from History tab header button.

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
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
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
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';

// ─── Platform helpers ─────────────────────────────────────────────────────────

const IS_IOS     = Platform.OS === 'ios';
const IS_ANDROID = Platform.OS === 'android';
const { height: SCREEN_H } = Dimensions.get('window');

// Safe bottom inset — use expo-modules or a simple fallback
// If you have expo-modules-core / react-native-safe-area-context installed,
// replace these with useSafeAreaInsets(). The constants below are safe fallbacks.
const SAFE_BOTTOM = IS_IOS ? 34 : 0;   // iPhone home-indicator clearance
const SAFE_TOP    = IS_IOS ? 44 : (StatusBar.currentHeight ?? 24);

// Cross-platform shadow helper
function platformShadow(
  color   = '#000',
  opacity = 0.18,
  radius  = 8,
  offsetY = 4,
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

// Android-safe blur overlay (BlurView has no effect on Android without Hermes + reanimated-blur)
function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.overlayInner}>
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

  return (
    // Dismiss keyboard when tapping outside inputs on Android
    <TouchableWithoutFeedback onPress={IS_ANDROID ? Keyboard.dismiss : undefined}>
      <KeyboardAvoidingView
        behavior={IS_IOS ? 'padding' : 'height'}
        keyboardVerticalOffset={IS_IOS ? 0 : 20}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          // Prevent scroll-bounce fighting with the modal on Android
          overScrollMode={IS_ANDROID ? 'never' : 'auto'}
          contentContainerStyle={{ gap: SPACING.md, paddingBottom: SPACING.lg + SAFE_BOTTOM }}
        >
          {/* Live Preview */}
          <View style={styles.preview}>
            <LinearGradient colors={[color, `${color}BB`]} style={styles.previewIcon}>
              <Ionicons name={icon as any} size={28} color="#FFF" />
            </LinearGradient>
            <View style={{ flex: 1 }}>
              <Text style={styles.previewName} numberOfLines={1}>
                {name || 'Collection Name'}
              </Text>
              <Text style={styles.previewDesc} numberOfLines={1}>
                {description || 'Your collection description'}
              </Text>
            </View>
          </View>

          {/* Name */}
          <View>
            <Text style={styles.fieldLabel}>NAME *</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="e.g. Competitor Analysis"
              placeholderTextColor={COLORS.textMuted}
              style={styles.input}
              maxLength={60}
              autoFocus={!isEditing}
              // Android: show done button on keyboard
              returnKeyType="done"
              onSubmitEditing={Keyboard.dismiss}
              // Prevent auto-correct quirks
              autoCorrect={false}
              autoCapitalize="words"
            />
          </View>

          {/* Description */}
          <View>
            <Text style={styles.fieldLabel}>DESCRIPTION (OPTIONAL)</Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="What is this collection for?"
              placeholderTextColor={COLORS.textMuted}
              style={[
                styles.input,
                {
                  minHeight:        64,
                  // textAlignVertical is Android-only; iOS auto-aligns top for multiline
                  textAlignVertical: IS_ANDROID ? 'top' : undefined,
                  paddingTop:       12,
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
            <Text style={styles.fieldLabel}>COLOR</Text>
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
                  // Better touch target
                  hitSlop={{ top: 6, right: 6, bottom: 6, left: 6 }}
                >
                  {color === c && (
                    <Ionicons name="checkmark" size={14} color="#FFF" />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Icon */}
          <View>
            <Text style={styles.fieldLabel}>ICON</Text>
            <View style={styles.iconGrid}>
              {(showAllIcons ? COLLECTION_ICONS : COLLECTION_ICONS.slice(0, 10)).map(ic => (
                <TouchableOpacity
                  key={ic.id}
                  onPress={() => setIcon(ic.id)}
                  activeOpacity={0.75}
                  hitSlop={{ top: 4, right: 4, bottom: 4, left: 4 }}
                  style={[
                    styles.iconSwatch,
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
                  style={[styles.iconSwatch, { borderStyle: 'dashed' }]}
                >
                  <Ionicons name="ellipsis-horizontal" size={18} color={COLORS.textMuted} />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Buttons */}
          <View style={styles.formBtns}>
            <TouchableOpacity
              onPress={onCancel}
              activeOpacity={0.75}
              style={styles.cancelBtn}
            >
              <Text style={styles.cancelBtnText}>Cancel</Text>
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

  // ── Android hardware back-button support ─────────────────────────────────────
  useEffect(() => {
    if (!IS_ANDROID || !visible) return;

    const onBackPress = () => {
      if (view !== 'list') {
        setView('list');
        setEditTarget(null);
      } else {
        onClose();
      }
      return true; // prevent default back navigation
    };

    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, [visible, view, onClose]);

  // ── Reset on open ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (visible) {
      setView('list');
      setEditTarget(null);
      refresh();
    }
  }, [visible]);

  // ── Create ────────────────────────────────────────────────────────────────────
  const handleCreate = useCallback(async (input: CollectionInput) => {
    setIsSaving(true);
    const col = await create(input);
    setIsSaving(false);
    if (col) setView('list');
  }, [create]);

  // ── Edit ──────────────────────────────────────────────────────────────────────
  const handleUpdate = useCallback(async (input: CollectionInput) => {
    if (!editTarget) return;
    setIsSaving(true);
    await update(editTarget.id, input);
    setIsSaving(false);
    setView('list');
    setEditTarget(null);
  }, [editTarget, update]);

  // ── Delete ────────────────────────────────────────────────────────────────────
  const handleDelete = useCallback((col: Collection) => {
    Alert.alert(
      'Delete Collection',
      `Delete "${col.name}"? The items inside won't be deleted — just removed from this collection.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text:    'Delete',
          style:   'destructive',
          onPress: () => remove(col.id),
        },
      ],
      // Android: show alert anchored to the centre (default); no extra config needed
    );
  }, [remove]);

  // ── Navigate into collection ──────────────────────────────────────────────────
  const handleOpen = useCallback((col: Collection) => {
    onClose();
    // Slightly longer timeout on Android to let the modal fully dismiss
    setTimeout(() => {
      router.push({
        pathname: '/(app)/collection-detail' as any,
        params:   { collectionId: col.id },
      });
    }, IS_IOS ? 300 : 400);
  }, [onClose]);

  // ── Back action ───────────────────────────────────────────────────────────────
  const goBack = useCallback(() => {
    setView('list');
    setEditTarget(null);
  }, []);

  // ── Header title ──────────────────────────────────────────────────────────────
  const headerTitle =
    view === 'create' ? 'New Collection' :
    view === 'edit'   ? 'Edit Collection' :
    'My Collections';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      // Android: prevent modal from hijacking hardware back — handled above via BackHandler
      onRequestClose={() => {
        if (view !== 'list') goBack();
        else onClose();
      }}
      // Keep status bar colour consistent on Android
      statusBarTranslucent={IS_ANDROID}
      hardwareAccelerated={IS_ANDROID}
    >
      {/* Dim overlay — pure View fallback (BlurView unreliable on Android) */}
      <Overlay>
        {/* Tap-outside-to-dismiss */}
        <TouchableWithoutFeedback
          onPress={() => {
            Keyboard.dismiss();
            if (view !== 'list') goBack();
            else onClose();
          }}
        >
          <View style={{ flex: 1 }} />
        </TouchableWithoutFeedback>

        {/* Sheet */}
        <View style={styles.sheet}>
          {/* Drag handle */}
          <View style={styles.handle} />

          {/* ── Header ── */}
          <View style={styles.header}>
            {view !== 'list' ? (
              <TouchableOpacity
                onPress={goBack}
                hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
                activeOpacity={0.7}
                style={styles.backBtn}
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

            <Text style={styles.headerTitle} numberOfLines={1}>
              {headerTitle}
            </Text>

            {view === 'list' ? (
              <TouchableOpacity
                onPress={() => setView('create')}
                activeOpacity={0.8}
                hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                style={styles.addBtn}
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
                  <View style={styles.emptyIcon}>
                    <Ionicons name="folder-open-outline" size={40} color={COLORS.border} />
                  </View>
                  <Text style={styles.emptyTitle}>No collections yet</Text>
                  <Text style={styles.emptySubtext}>
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
                  <Text style={styles.listMeta}>
                    {collections.length} collection{collections.length !== 1 ? 's' : ''}
                  </Text>
                  {collections.map((col, i) => (
                    <Animated.View
                      key={col.id}
                      layout={Layout.springify()}
                    >
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
        </View>
      </Overlay>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // ── Overlay ──────────────────────────────────────────────────────────────────
  overlayInner: {
    flex:            1,
    backgroundColor: 'rgba(10,10,26,0.72)',
    justifyContent:  'flex-end',
  },

  // ── Sheet ────────────────────────────────────────────────────────────────────
  sheet: {
    backgroundColor:      COLORS.backgroundCard,
    borderTopLeftRadius:  28,
    borderTopRightRadius: 28,
    paddingHorizontal:    SPACING.xl,
    // Pad for home-indicator on iPhone; nothing extra on Android
    paddingBottom:        SPACING.xl + SAFE_BOTTOM,
    borderTopWidth:       1,
    borderTopColor:       COLORS.border,
    // Shadow for the rising sheet
    ...platformShadow('#000', 0.35, 20, -4, 16),
  },

  // ── Handle ───────────────────────────────────────────────────────────────────
  handle: {
    width:           40,
    height:          4,
    borderRadius:    2,
    backgroundColor: COLORS.border,
    alignSelf:       'center',
    marginVertical:  SPACING.md,
  },

  // ── Header ───────────────────────────────────────────────────────────────────
  header: {
    flexDirection:  'row',
    alignItems:     'center',
    marginBottom:   SPACING.lg,
    gap:             SPACING.sm,
  },
  backBtn: {
    width:           34,
    height:          34,
    borderRadius:    10,
    backgroundColor: COLORS.backgroundElevated,
    alignItems:      'center',
    justifyContent:  'center',
    borderWidth:     1,
    borderColor:     COLORS.border,
    flexShrink:      0,
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
    color:      COLORS.textPrimary,
    fontSize:   FONTS.sizes.lg,
    fontWeight: IS_ANDROID ? '700' : '800', // '800' has wider support on iOS
  },
  addBtn: {
    width:           34,
    height:          34,
    borderRadius:    10,
    backgroundColor: `${COLORS.primary}18`,
    alignItems:      'center',
    justifyContent:  'center',
    borderWidth:     1,
    borderColor:     `${COLORS.primary}35`,
    flexShrink:      0,
  },
  listMeta: {
    color:        COLORS.textMuted,
    fontSize:     FONTS.sizes.xs,
    marginBottom: SPACING.sm,
  },

  // ── Empty state ───────────────────────────────────────────────────────────────
  centeredState: {
    alignItems:      'center',
    paddingVertical: SPACING.xl,
    gap:              SPACING.sm,
  },
  emptyIcon: {
    width:           72,
    height:          72,
    borderRadius:    22,
    backgroundColor: COLORS.backgroundElevated,
    alignItems:      'center',
    justifyContent:  'center',
    marginBottom:    SPACING.sm,
  },
  emptyTitle: {
    color:      COLORS.textPrimary,
    fontSize:   FONTS.sizes.base,
    fontWeight: '700',
  },
  emptySubtext: {
    color:             COLORS.textMuted,
    fontSize:          FONTS.sizes.sm,
    textAlign:         'center',
    lineHeight:        20,
    paddingHorizontal: SPACING.xl,
  },
  createFirstBtn: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:                6,
    borderRadius:      RADIUS.full,
    paddingHorizontal: SPACING.xl,
    paddingVertical:   12,
  },
  createFirstBtnText: {
    color:      '#FFF',
    fontSize:   FONTS.sizes.base,
    fontWeight: '700',
  },

  // ── Form: Preview ─────────────────────────────────────────────────────────────
  preview: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:              SPACING.md,
    backgroundColor: COLORS.backgroundElevated,
    borderRadius:    RADIUS.xl,
    padding:         SPACING.md,
    borderWidth:     1,
    borderColor:     COLORS.border,
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
    color:      COLORS.textPrimary,
    fontSize:   FONTS.sizes.base,
    fontWeight: '700',
  },
  previewDesc: {
    color:     COLORS.textMuted,
    fontSize:  FONTS.sizes.xs,
    marginTop: 3,
  },

  // ── Form: Fields ──────────────────────────────────────────────────────────────
  fieldLabel: {
    color:         COLORS.textMuted,
    fontSize:      FONTS.sizes.xs,
    fontWeight:    '700',
    letterSpacing: 0.8,
    marginBottom:  SPACING.sm,
  },
  input: {
    backgroundColor:   COLORS.backgroundElevated,
    borderRadius:      RADIUS.lg,
    paddingHorizontal: SPACING.md,
    paddingVertical:   12,
    color:             COLORS.textPrimary,
    fontSize:          FONTS.sizes.base,
    borderWidth:       1,
    borderColor:       COLORS.border,
    // Prevent Android auto-elevation artefacts inside input
    elevation:         0,
  },

  // ── Form: Color grid ──────────────────────────────────────────────────────────
  colorGrid: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:            10,
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

  // ── Form: Icon grid ───────────────────────────────────────────────────────────
  iconGrid: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:            8,
  },
  iconSwatch: {
    width:           42,
    height:          42,
    borderRadius:    12,
    alignItems:      'center',
    justifyContent:  'center',
    backgroundColor: COLORS.backgroundElevated,
    borderWidth:     1,
    borderColor:     COLORS.border,
  },

  // ── Form: Buttons ─────────────────────────────────────────────────────────────
  formBtns: {
    flexDirection: 'row',
    gap:            SPACING.sm,
  },
  cancelBtn: {
    backgroundColor:   COLORS.backgroundElevated,
    borderRadius:      RADIUS.lg,
    paddingVertical:   14,
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
  saveBtn: {
    borderRadius:    RADIUS.lg,
    paddingVertical: 14,
    alignItems:      'center',
    justifyContent:  'center',
  },
  saveBtnText: {
    color:      '#FFF',
    fontWeight: '700',
    fontSize:   FONTS.sizes.base,
  },
});