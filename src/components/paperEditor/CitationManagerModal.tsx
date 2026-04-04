// src/components/paperEditor/CitationManagerModal.tsx
// Part 38 — Full citation manager modal.
// Part 38 UPDATE:
//   FIX #1  — Import from URL tab now renders correctly (removed flex:1 on
//             KeyboardAvoidingView inside bottom sheet, added explicit height).
//   UPDATE  — "Detect Unused" replaced with "AI Citation Generator" that uses
//             SerpAPI to find real sources and adds them as citations (credit-gated).
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useCallback, memo } from 'react';
import {
  View, Text, Modal, Pressable, ScrollView,
  TextInput, TouchableOpacity, ActivityIndicator,
  Alert, KeyboardAvoidingView, Platform, Dimensions,
} from 'react-native';
import { LinearGradient }    from 'expo-linear-gradient';
import { Ionicons }          from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../constants/theme';
import { CITATION_STYLE_LABELS }                    from '../../constants/paperEditor';
import type { AcademicCitationStyle, Citation }     from '../../types';
import type { ManagedCitation }                     from '../../types/paperEditor';

const SCREEN_H = Dimensions.get('window').height;

// ─── Citation style tab colours ───────────────────────────────────────────────

const STYLE_COLORS: Record<AcademicCitationStyle, string> = {
  apa:     '#6C63FF',
  mla:     '#43E97B',
  chicago: '#FFA726',
  ieee:    '#29B6F6',
};

// ─── Empty citation form ──────────────────────────────────────────────────────

const EMPTY_FORM = {
  title:   '',
  source:  '',
  url:     '',
  date:    '',
  snippet: '',
};

// ─── Citation card ────────────────────────────────────────────────────────────

interface CitationCardProps {
  citation:    ManagedCitation;
  index:       number;
  formatted:   string;
  isFirst:     boolean;
  isLast:      boolean;
  accentColor: string;
  onEdit:      () => void;
  onDelete:    () => void;
  onMoveUp:    () => void;
  onMoveDown:  () => void;
}

const CitationCard = memo(function CitationCard({
  citation, index, formatted, isFirst, isLast,
  accentColor, onEdit, onDelete, onMoveUp, onMoveDown,
}: CitationCardProps) {
  return (
    <Animated.View entering={FadeInDown.duration(300).delay(index * 30)}>
      <View style={{
        backgroundColor: COLORS.backgroundElevated,
        borderRadius:    RADIUS.xl,
        marginBottom:    SPACING.sm,
        borderWidth:     1,
        borderColor:     COLORS.border,
        overflow:        'hidden',
      }}>
        {/* Index + title row */}
        <View style={{
          flexDirection: 'row', alignItems: 'center',
          paddingHorizontal: SPACING.md, paddingTop: SPACING.sm, gap: SPACING.sm,
        }}>
          <View style={{
            width: 26, height: 26, borderRadius: 8,
            backgroundColor: `${accentColor}20`,
            alignItems: 'center', justifyContent: 'center',
            borderWidth: 1, borderColor: `${accentColor}35`,
            flexShrink: 0,
          }}>
            <Text style={{ color: accentColor, fontSize: 10, fontWeight: '800' }}>{index + 1}</Text>
          </View>

          <View style={{ flex: 1 }}>
            <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '700' }} numberOfLines={1}>
              {citation.title || 'Untitled Citation'}
            </Text>
            <Text style={{ color: COLORS.textMuted, fontSize: 10, marginTop: 1 }}>
              {citation.source}{citation.date ? ` · ${new Date(citation.date).getFullYear()}` : ''}
            </Text>
          </View>
        </View>

        {/* Formatted citation preview */}
        <View style={{
          marginHorizontal: SPACING.md, marginVertical: SPACING.sm,
          backgroundColor: `${accentColor}06`,
          borderRadius: RADIUS.lg, padding: SPACING.sm,
          borderLeftWidth: 2, borderLeftColor: `${accentColor}50`,
        }}>
          <Text style={{ color: COLORS.textSecondary, fontSize: 10, lineHeight: 16, fontStyle: 'italic' }}>
            {formatted}
          </Text>
        </View>

        {/* Action row */}
        <View style={{
          flexDirection: 'row', alignItems: 'center',
          paddingHorizontal: SPACING.md, paddingBottom: SPACING.sm,
          gap: 6,
        }}>
          {!isFirst && (
            <Pressable onPress={onMoveUp} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: COLORS.backgroundCard, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border }}>
              <Ionicons name="chevron-up" size={13} color={COLORS.textMuted} />
            </Pressable>
          )}
          {!isLast && (
            <Pressable onPress={onMoveDown} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: COLORS.backgroundCard, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border }}>
              <Ionicons name="chevron-down" size={13} color={COLORS.textMuted} />
            </Pressable>
          )}

          <View style={{ flex: 1 }} />

          <Pressable onPress={onEdit}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: RADIUS.full, backgroundColor: `${accentColor}15`, borderWidth: 1, borderColor: `${accentColor}30` }}>
            <Ionicons name="pencil-outline" size={12} color={accentColor} />
            <Text style={{ color: accentColor, fontSize: 10, fontWeight: '700' }}>Edit</Text>
          </Pressable>

          <Pressable onPress={onDelete}
            style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: `${COLORS.error}15`, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: `${COLORS.error}25` }}>
            <Ionicons name="trash-outline" size={13} color={COLORS.error} />
          </Pressable>
        </View>
      </View>
    </Animated.View>
  );
});

// ─── AI Generated Citation Card (preview before adding) ───────────────────────

interface AICitationPreviewProps {
  citation:    Omit<Citation, 'id'>;
  index:       number;
  accentColor: string;
  isAdded:     boolean;
  onAdd:       () => void;
}

const AICitationPreview = memo(function AICitationPreview({
  citation, index, accentColor, isAdded, onAdd,
}: AICitationPreviewProps) {
  return (
    <Animated.View entering={FadeInDown.duration(300).delay(index * 50)}>
      <View style={{
        backgroundColor: COLORS.backgroundElevated,
        borderRadius:    RADIUS.xl,
        marginBottom:    SPACING.sm,
        borderWidth:     1,
        borderColor:     isAdded ? `${COLORS.success}40` : COLORS.border,
        overflow:        'hidden',
      }}>
        <View style={{
          flexDirection: 'row', alignItems: 'flex-start',
          paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, gap: SPACING.sm,
        }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '700', marginBottom: 2 }} numberOfLines={2}>
              {citation.title || 'Untitled'}
            </Text>
            <Text style={{ color: COLORS.textMuted, fontSize: 10 }}>
              {citation.source}
              {citation.date ? ` · ${new Date(citation.date).getFullYear()}` : ''}
            </Text>
            {citation.url ? (
              <Text style={{ color: COLORS.info, fontSize: 9, marginTop: 2 }} numberOfLines={1}>
                {citation.url}
              </Text>
            ) : null}
            {citation.snippet ? (
              <Text style={{ color: COLORS.textSecondary, fontSize: 10, marginTop: 4, lineHeight: 14 }} numberOfLines={2}>
                {citation.snippet}
              </Text>
            ) : null}
          </View>

          <TouchableOpacity
            onPress={onAdd}
            disabled={isAdded}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 4,
              paddingHorizontal: 10, paddingVertical: 7,
              borderRadius: RADIUS.full,
              backgroundColor: isAdded ? `${COLORS.success}18` : `${accentColor}18`,
              borderWidth: 1,
              borderColor: isAdded ? `${COLORS.success}35` : `${accentColor}35`,
              flexShrink: 0,
            }}
          >
            <Ionicons
              name={isAdded ? 'checkmark-circle' : 'add-circle-outline'}
              size={13}
              color={isAdded ? COLORS.success : accentColor}
            />
            <Text style={{ color: isAdded ? COLORS.success : accentColor, fontSize: 10, fontWeight: '700' }}>
              {isAdded ? 'Added' : 'Add'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Animated.View>
  );
});

// ─── Edit / Add form modal ────────────────────────────────────────────────────

interface CitationFormProps {
  visible:     boolean;
  initial:     Partial<Citation>;
  isEditing:   boolean;
  accentColor: string;
  onSave:      (data: Omit<Citation, 'id'>) => void;
  onClose:     () => void;
}

function CitationForm({ visible, initial, isEditing, accentColor, onSave, onClose }: CitationFormProps) {
  const insets = useSafeAreaInsets();
  const [form, setForm] = useState({ ...EMPTY_FORM, ...initial });

  React.useEffect(() => {
    if (visible) setForm({ ...EMPTY_FORM, ...initial });
  }, [visible]);

  const update = (field: string, value: string) => setForm(prev => ({ ...prev, [field]: value }));

  const handleSave = () => {
    if (!form.title.trim()) {
      Alert.alert('Required', 'Please enter a citation title.');
      return;
    }
    onSave({
      title:   form.title.trim(),
      source:  form.source.trim() || 'Unknown',
      url:     form.url.trim() || '',
      snippet: form.snippet.trim() || '',
      date:    form.date.trim() || undefined,
    });
    onClose();
  };

  const fields: { key: string; label: string; placeholder: string; multiline?: boolean }[] = [
    { key: 'title',   label: 'Title *',  placeholder: 'Article / page title' },
    { key: 'source',  label: 'Source',   placeholder: 'Publisher / website name' },
    { key: 'url',     label: 'URL',      placeholder: 'https://...' },
    { key: 'date',    label: 'Date',     placeholder: 'YYYY-MM-DD (optional)' },
    { key: 'snippet', label: 'Excerpt',  placeholder: 'Brief excerpt or note (optional)', multiline: true },
  ];

  return (
    <Modal visible={visible} transparent animationType="slide">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' }}
      >
        <View style={{
          backgroundColor: COLORS.backgroundCard,
          borderTopLeftRadius: 24, borderTopRightRadius: 24,
          paddingTop: SPACING.sm,
          paddingBottom: insets.bottom + SPACING.md,
          maxHeight: SCREEN_H * 0.88,
          borderTopWidth: 1, borderTopColor: COLORS.border,
        }}>
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.border, alignSelf: 'center', marginBottom: SPACING.md }} />

          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.lg, marginBottom: SPACING.md }}>
            <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '800', flex: 1 }}>
              {isEditing ? 'Edit Citation' : 'Add Citation'}
            </Text>
            <Pressable onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={22} color={COLORS.textMuted} />
            </Pressable>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="always"
            contentContainerStyle={{ paddingHorizontal: SPACING.lg, paddingBottom: SPACING.lg, gap: SPACING.md }}
          >
            {fields.map(field => (
              <View key={field.key}>
                <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 6 }}>
                  {field.label}
                </Text>
                <TextInput
                  value={(form as any)[field.key]}
                  onChangeText={v => update(field.key, v)}
                  placeholder={field.placeholder}
                  placeholderTextColor={COLORS.textMuted}
                  multiline={field.multiline}
                  numberOfLines={field.multiline ? 3 : 1}
                  style={{
                    backgroundColor: COLORS.backgroundElevated,
                    borderRadius: RADIUS.lg,
                    paddingHorizontal: SPACING.md,
                    paddingVertical: SPACING.sm,
                    color: COLORS.textPrimary,
                    fontSize: FONTS.sizes.sm,
                    borderWidth: 1,
                    borderColor: COLORS.border,
                    minHeight: field.multiline ? 72 : 44,
                    textAlignVertical: field.multiline ? 'top' : 'center',
                  }}
                />
              </View>
            ))}

            <TouchableOpacity onPress={handleSave} activeOpacity={0.85}>
              <LinearGradient
                colors={[accentColor, `${accentColor}CC`] as [string, string]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={{ borderRadius: RADIUS.full, paddingVertical: 14, alignItems: 'center', ...SHADOWS.medium }}
              >
                <Text style={{ color: '#FFF', fontSize: FONTS.sizes.base, fontWeight: '800' }}>
                  {isEditing ? 'Save Changes' : 'Add Citation'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface CitationManagerModalProps {
  visible:              boolean;
  citations:            ManagedCitation[];
  formattedCitations:   string[];
  citationStyle:        AcademicCitationStyle;
  isImporting:          boolean;
  importError:          string | null;
  paperTopic?:          string;   // used to pre-fill AI generator query
  onClose:              () => void;
  onStyleChange:        (style: AcademicCitationStyle) => void;
  onAdd:                (citation: Omit<Citation, 'id'>) => void;
  onUpdate:             (id: string, updates: Partial<Citation>) => void;
  onDelete:             (id: string) => void;
  onMoveUp:             (id: string) => void;
  onMoveDown:           (id: string) => void;
  onImportFromUrl:      (url: string) => Promise<boolean>;
  onGenerateCitations:  (query: string) => Promise<Array<Omit<Citation, 'id'>>>;
  isGeneratingCitations: boolean;
  generateCitationsError: string | null;
}

// ─── Main modal ───────────────────────────────────────────────────────────────

export const CitationManagerModal = memo(function CitationManagerModal({
  visible, citations, formattedCitations, citationStyle,
  isImporting, importError,
  paperTopic,
  onClose, onStyleChange, onAdd, onUpdate, onDelete,
  onMoveUp, onMoveDown, onImportFromUrl,
  onGenerateCitations, isGeneratingCitations, generateCitationsError,
}: CitationManagerModalProps) {
  const insets = useSafeAreaInsets();

  type TabType = 'list' | 'import' | 'generate';
  const [tab,              setTab]              = useState<TabType>('list');
  const [importUrl,        setImportUrl]        = useState('');
  const [showAddForm,      setShowAddForm]      = useState(false);
  const [editingCit,       setEditingCit]       = useState<ManagedCitation | null>(null);

  // AI Generator state
  const [generateQuery,    setGenerateQuery]    = useState(paperTopic ?? '');
  const [generatedResults, setGeneratedResults] = useState<Array<Omit<Citation, 'id'>>>([]);
  const [addedIndices,     setAddedIndices]     = useState<Set<number>>(new Set());

  const accentColor = STYLE_COLORS[citationStyle];

  // Reset generate query when modal opens with a new topic
  React.useEffect(() => {
    if (visible && paperTopic && !generateQuery) {
      setGenerateQuery(paperTopic);
    }
  }, [visible, paperTopic]);

  // ── Import handler ────────────────────────────────────────────────────────
  const handleImport = async () => {
    if (!importUrl.trim()) return;
    const ok = await onImportFromUrl(importUrl.trim());
    if (ok) {
      setImportUrl('');
      setTab('list');
    }
  };

  // ── AI Generator handler ──────────────────────────────────────────────────
  const handleGenerate = async () => {
    if (!generateQuery.trim() || isGeneratingCitations) return;
    setGeneratedResults([]);
    setAddedIndices(new Set());
    const results = await onGenerateCitations(generateQuery.trim());
    setGeneratedResults(results);
  };

  const handleAddGenerated = useCallback((citation: Omit<Citation, 'id'>, index: number) => {
    onAdd(citation);
    setAddedIndices(prev => new Set([...prev, index]));
  }, [onAdd]);

  const handleAddAllGenerated = useCallback(() => {
    generatedResults.forEach((c, i) => {
      if (!addedIndices.has(i)) {
        onAdd(c);
      }
    });
    setAddedIndices(new Set(generatedResults.map((_, i) => i)));
  }, [generatedResults, addedIndices, onAdd]);

  // ── Delete handler ────────────────────────────────────────────────────────
  const handleDelete = (id: string, title: string) => {
    Alert.alert(
      'Delete Citation',
      `Remove "${title.slice(0, 50)}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => onDelete(id) },
      ],
    );
  };

  // ── Tab labels ────────────────────────────────────────────────────────────
  const tabs: { key: TabType; label: string }[] = [
    { key: 'list',     label: `References (${citations.length})` },
    { key: 'import',   label: 'Import URL' },
    { key: 'generate', label: '✦ AI Generate' },
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
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
            paddingBottom:        insets.bottom + SPACING.md,
            maxHeight:            SCREEN_H * 0.92,
            borderTopWidth:       1,
            borderTopColor:       COLORS.border,
          }}
        >
          {/* Handle */}
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.border, alignSelf: 'center', marginTop: SPACING.sm, marginBottom: SPACING.md }} />

          {/* ── Header ─────────────────────────────────────────────────────── */}
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.lg, marginBottom: SPACING.md }}>
            <LinearGradient colors={[COLORS.warning, '#FF8F00']} style={{ width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: SPACING.sm }}>
              <Ionicons name="link" size={18} color="#FFF" />
            </LinearGradient>
            <View style={{ flex: 1 }}>
              <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '800' }}>
                Citation Manager
              </Text>
              <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
                {citations.length} citations · {citationStyle.toUpperCase()} style
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={22} color={COLORS.textMuted} />
            </Pressable>
          </View>

          {/* ── Citation Style Selector ─────────────────────────────────────── */}
          <View style={{ paddingHorizontal: SPACING.lg, marginBottom: SPACING.md }}>
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
              Citation Style
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {(Object.keys(CITATION_STYLE_LABELS) as AcademicCitationStyle[]).map(style => {
                const active = citationStyle === style;
                const col    = STYLE_COLORS[style];
                return (
                  <Pressable
                    key={style}
                    onPress={() => onStyleChange(style)}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 5,
                      paddingHorizontal: 12, paddingVertical: 8,
                      borderRadius: RADIUS.full,
                      backgroundColor: active ? `${col}20` : COLORS.backgroundElevated,
                      borderWidth: 1.5, borderColor: active ? col : COLORS.border,
                    }}
                  >
                    {active && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: col }} />}
                    <Text style={{ color: active ? col : COLORS.textSecondary, fontSize: FONTS.sizes.xs, fontWeight: active ? '700' : '500' }}>
                      {CITATION_STYLE_LABELS[style]}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          {/* ── Tab strip ──────────────────────────────────────────────────── */}
          <View style={{
            flexDirection: 'row',
            backgroundColor: COLORS.backgroundElevated,
            borderRadius: RADIUS.xl,
            marginHorizontal: SPACING.lg,
            marginBottom: SPACING.md,
            padding: 3,
            borderWidth: 1,
            borderColor: COLORS.border,
          }}>
            {tabs.map(t => (
              <Pressable
                key={t.key}
                onPress={() => setTab(t.key)}
                style={{
                  flex: 1,
                  alignItems: 'center',
                  paddingVertical: 9,
                  borderRadius: RADIUS.lg,
                  backgroundColor: tab === t.key ? COLORS.primary : 'transparent',
                }}
              >
                <Text style={{
                  color:      tab === t.key ? '#FFF' : COLORS.textMuted,
                  fontSize:   9,
                  fontWeight: '700',
                  textAlign:  'center',
                }}>
                  {t.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* ══════════════════════════════════════════════════════════════════
              TAB: LIST
          ══════════════════════════════════════════════════════════════════ */}
          {tab === 'list' && (
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: SPACING.lg, paddingBottom: SPACING.lg }}
            >
              {/* Add manually button */}
              <TouchableOpacity
                onPress={() => setShowAddForm(true)}
                style={{
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                  gap: 5, paddingVertical: 10, borderRadius: RADIUS.lg, marginBottom: SPACING.md,
                  backgroundColor: `${accentColor}18`, borderWidth: 1, borderColor: `${accentColor}35`,
                }}
              >
                <Ionicons name="add-circle-outline" size={14} color={accentColor} />
                <Text style={{ color: accentColor, fontSize: FONTS.sizes.xs, fontWeight: '700' }}>Add Manually</Text>
              </TouchableOpacity>

              {citations.length === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: SPACING.xl, gap: SPACING.md }}>
                  <Ionicons name="link-outline" size={44} color={COLORS.textMuted} />
                  <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.sm, textAlign: 'center' }}>
                    No citations yet.{'\n'}Add manually, import from URL, or use AI Generate.
                  </Text>
                </View>
              ) : (
                citations.map((citation, i) => (
                  <CitationCard
                    key={citation.id}
                    citation={citation}
                    index={i}
                    formatted={formattedCitations[i] ?? ''}
                    isFirst={i === 0}
                    isLast={i === citations.length - 1}
                    accentColor={accentColor}
                    onEdit={() => setEditingCit(citation)}
                    onDelete={() => handleDelete(citation.id, citation.title)}
                    onMoveUp={() => onMoveUp(citation.id)}
                    onMoveDown={() => onMoveDown(citation.id)}
                  />
                ))
              )}
            </ScrollView>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              TAB: IMPORT FROM URL
              FIX: Removed flex:1 on the inner wrapper — bottom-sheet children
              must NOT use flex:1 (collapses to 0 when parent has no fixed height).
              Use a static minHeight instead and let the ScrollView fill it.
          ══════════════════════════════════════════════════════════════════ */}
          {tab === 'import' && (
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
            >
              <ScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="always"
                contentContainerStyle={{
                  paddingHorizontal: SPACING.lg,
                  paddingBottom:     SPACING.xl,
                  gap:               SPACING.md,
                  minHeight:         320,
                }}
              >
                {/* Label */}
                <Text style={{
                  color: COLORS.textMuted, fontSize: FONTS.sizes.xs,
                  fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1,
                }}>
                  Paste article or website URL
                </Text>

                {/* URL input */}
                <TextInput
                  value={importUrl}
                  onChangeText={setImportUrl}
                  placeholder="https://nature.com/articles/..."
                  placeholderTextColor={COLORS.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  returnKeyType="go"
                  onSubmitEditing={handleImport}
                  style={{
                    backgroundColor: COLORS.backgroundElevated,
                    borderRadius:    RADIUS.lg,
                    paddingHorizontal: SPACING.md,
                    paddingVertical:   SPACING.md,
                    color:           COLORS.textPrimary,
                    fontSize:        FONTS.sizes.sm,
                    borderWidth:     1,
                    borderColor:     importUrl ? COLORS.primary : COLORS.border,
                    minHeight:       48,
                  }}
                />

                {/* Error */}
                {importError ? (
                  <View style={{
                    backgroundColor: `${COLORS.error}12`, borderRadius: RADIUS.lg,
                    padding: SPACING.md, borderWidth: 1, borderColor: `${COLORS.error}30`,
                    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
                  }}>
                    <Ionicons name="alert-circle-outline" size={16} color={COLORS.error} style={{ flexShrink: 0, marginTop: 1 }} />
                    <Text style={{ color: COLORS.error, fontSize: FONTS.sizes.xs, flex: 1, lineHeight: 18 }}>
                      {importError}
                    </Text>
                  </View>
                ) : null}

                {/* Feature list */}
                <View style={{
                  backgroundColor: `${COLORS.info}10`, borderRadius: RADIUS.lg,
                  padding: SPACING.md, borderWidth: 1, borderColor: `${COLORS.info}25`, gap: 6,
                }}>
                  {[
                    'Title extracted from page metadata',
                    'Publisher / site name auto-detected',
                    'Publication year detected from URL or page',
                    'DOI extracted when present',
                  ].map((item, i) => (
                    <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Ionicons name="checkmark-circle" size={13} color={COLORS.info} />
                      <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.xs }}>{item}</Text>
                    </View>
                  ))}
                </View>

                {/* Import button */}
                <TouchableOpacity
                  onPress={handleImport}
                  disabled={!importUrl.trim() || isImporting}
                  activeOpacity={0.85}
                  style={{ opacity: !importUrl.trim() || isImporting ? 0.5 : 1 }}
                >
                  <LinearGradient
                    colors={[COLORS.warning, '#FF8F00']}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    style={{
                      borderRadius: RADIUS.full, paddingVertical: 14,
                      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                      gap: 8, ...SHADOWS.medium,
                    }}
                  >
                    {isImporting
                      ? <ActivityIndicator size="small" color="#FFF" />
                      : <Ionicons name="cloud-download-outline" size={18} color="#FFF" />
                    }
                    <Text style={{ color: '#FFF', fontSize: FONTS.sizes.base, fontWeight: '800' }}>
                      {isImporting ? 'Fetching metadata…' : 'Import Citation'}
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>

                <Text style={{ color: COLORS.textMuted, fontSize: 10, textAlign: 'center', lineHeight: 16 }}>
                  After importing, you can edit any fields manually in the References tab.
                </Text>
              </ScrollView>
            </KeyboardAvoidingView>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              TAB: AI CITATION GENERATOR
              Uses SerpAPI to find real sources and generates formatted citations.
              Costs 2 credits per generation run.
          ══════════════════════════════════════════════════════════════════ */}
          {tab === 'generate' && (
            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="always"
              contentContainerStyle={{
                paddingHorizontal: SPACING.lg,
                paddingBottom:     SPACING.xl,
                gap:               SPACING.md,
                minHeight:         320,
              }}
            >
              {/* Credit notice */}
              <View style={{
                flexDirection: 'row', alignItems: 'center', gap: 8,
                backgroundColor: `${COLORS.warning}12`,
                borderRadius: RADIUS.lg, padding: SPACING.sm,
                borderWidth: 1, borderColor: `${COLORS.warning}30`,
              }}>
                <Ionicons name="flash" size={14} color={COLORS.warning} />
                <Text style={{ color: COLORS.warning, fontSize: FONTS.sizes.xs, fontWeight: '700', flex: 1 }}>
                  2 credits · Finds 5–8 real sources using web search
                </Text>
              </View>

              {/* Query input */}
              <View>
                <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
                  Research Topic or Query
                </Text>
                <TextInput
                  value={generateQuery}
                  onChangeText={setGenerateQuery}
                  placeholder="e.g. quantum computing startups 2025"
                  placeholderTextColor={COLORS.textMuted}
                  returnKeyType="search"
                  onSubmitEditing={handleGenerate}
                  style={{
                    backgroundColor:  COLORS.backgroundElevated,
                    borderRadius:     RADIUS.lg,
                    paddingHorizontal: SPACING.md,
                    paddingVertical:   SPACING.md,
                    color:            COLORS.textPrimary,
                    fontSize:         FONTS.sizes.sm,
                    borderWidth:      1,
                    borderColor:      generateQuery ? COLORS.primary : COLORS.border,
                    minHeight:        48,
                  }}
                />
              </View>

              {/* Generate button */}
              <TouchableOpacity
                onPress={handleGenerate}
                disabled={!generateQuery.trim() || isGeneratingCitations}
                activeOpacity={0.85}
                style={{ opacity: !generateQuery.trim() || isGeneratingCitations ? 0.5 : 1 }}
              >
                <LinearGradient
                  colors={['#6C63FF', '#8B5CF6']}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={{
                    borderRadius: RADIUS.full, paddingVertical: 14,
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                    gap: 8, ...SHADOWS.medium,
                  }}
                >
                  {isGeneratingCitations
                    ? <ActivityIndicator size="small" color="#FFF" />
                    : <Ionicons name="sparkles-outline" size={18} color="#FFF" />
                  }
                  <Text style={{ color: '#FFF', fontSize: FONTS.sizes.base, fontWeight: '800' }}>
                    {isGeneratingCitations ? 'Searching & generating…' : 'Generate Citations'}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>

              {/* Generation error */}
              {generateCitationsError ? (
                <View style={{
                  backgroundColor: `${COLORS.error}12`, borderRadius: RADIUS.lg,
                  padding: SPACING.md, borderWidth: 1, borderColor: `${COLORS.error}30`,
                  flexDirection: 'row', alignItems: 'flex-start', gap: 8,
                }}>
                  <Ionicons name="alert-circle-outline" size={16} color={COLORS.error} style={{ flexShrink: 0, marginTop: 1 }} />
                  <Text style={{ color: COLORS.error, fontSize: FONTS.sizes.xs, flex: 1, lineHeight: 18 }}>
                    {generateCitationsError}
                  </Text>
                </View>
              ) : null}

              {/* Results */}
              {generatedResults.length > 0 && (
                <>
                  {/* Add All button */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, fontWeight: '700' }}>
                      {generatedResults.length} sources found
                    </Text>
                    {addedIndices.size < generatedResults.length && (
                      <TouchableOpacity
                        onPress={handleAddAllGenerated}
                        style={{
                          flexDirection: 'row', alignItems: 'center', gap: 4,
                          paddingHorizontal: 12, paddingVertical: 6,
                          borderRadius: RADIUS.full,
                          backgroundColor: `${accentColor}18`,
                          borderWidth: 1, borderColor: `${accentColor}35`,
                        }}
                      >
                        <Ionicons name="add-circle-outline" size={13} color={accentColor} />
                        <Text style={{ color: accentColor, fontSize: 10, fontWeight: '700' }}>Add All</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  {generatedResults.map((citation, i) => (
                    <AICitationPreview
                      key={`gen-${i}`}
                      citation={citation}
                      index={i}
                      accentColor={accentColor}
                      isAdded={addedIndices.has(i)}
                      onAdd={() => handleAddGenerated(citation, i)}
                    />
                  ))}
                </>
              )}

              {/* Empty state before generation */}
              {!isGeneratingCitations && generatedResults.length === 0 && !generateCitationsError && (
                <View style={{ alignItems: 'center', paddingVertical: SPACING.lg, gap: SPACING.md }}>
                  <View style={{
                    width: 56, height: 56, borderRadius: 18,
                    backgroundColor: `${COLORS.primary}15`,
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Ionicons name="search-outline" size={26} color={COLORS.primary} />
                  </View>
                  <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.sm, textAlign: 'center', lineHeight: 20 }}>
                    Enter your research topic above.{'\n'}AI will find real academic sources{'\n'}and generate ready-to-use citations.
                  </Text>
                </View>
              )}
            </ScrollView>
          )}
        </Pressable>
      </Pressable>

      {/* Add form modal */}
      <CitationForm
        visible={showAddForm}
        initial={EMPTY_FORM}
        isEditing={false}
        accentColor={accentColor}
        onSave={onAdd}
        onClose={() => setShowAddForm(false)}
      />

      {/* Edit form modal */}
      <CitationForm
        visible={!!editingCit}
        initial={editingCit ?? EMPTY_FORM}
        isEditing={true}
        accentColor={accentColor}
        onSave={data => { if (editingCit) onUpdate(editingCit.id, data); }}
        onClose={() => setEditingCit(null)}
      />
    </Modal>
  );
});