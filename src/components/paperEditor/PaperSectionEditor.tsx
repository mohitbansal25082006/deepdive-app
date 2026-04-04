// src/components/paperEditor/PaperSectionEditor.tsx
// Part 38 — Inline section editor card.
// Part 38b — Formatting toolbar fix, subsection numbering, subsection AI.
// Part 38c FIXES:
//   FIX #3 — Formatting toolbar: selection-aware wrap using selectionRef.
//   FIX #4 — "T" (Generate Title) button now shows an Alert confirming the
//             credit cost before calling onGenerateSubsectionTitle.
//   FIX #5 — "Add Subsection" opens a choice modal: Manual (free) or
//             AI Generate (2 cr). AI path shows optional description input
//             and calls onAddSubsectionWithAI. Manual path calls onAddSubsection.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useRef, useCallback, memo } from 'react';
import {
  View, Text, TextInput, Pressable, TouchableOpacity,
  ScrollView, Modal, Dimensions, KeyboardAvoidingView,
  Platform, ActivityIndicator, Alert,
  NativeSyntheticEvent, TextInputSelectionChangeEventData,
} from 'react-native';
import { LinearGradient }    from 'expo-linear-gradient';
import { Ionicons }          from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../constants/theme';
import { WordCountBadge, countWords }               from './WordCountBadge';
import { SECTION_TYPE_LABELS }                      from '../../constants/paperEditor';
import { SECTION_WORD_TARGETS }                     from '../../types/paperEditor';
import type { AcademicSection, AcademicSubsection } from '../../types';
import type { PaperAITool }                         from '../../types/paperEditor';

const SCREEN_H = Dimensions.get('window').height;
const SCREEN_W = Dimensions.get('window').width;

// ─── Accent colors ────────────────────────────────────────────────────────────

const SECTION_COLORS: Record<string, string> = {
  abstract:          '#6C63FF',
  introduction:      '#29B6F6',
  literature_review: '#43E97B',
  methodology:       '#FFA726',
  findings:          '#FF6584',
  conclusion:        '#6C63FF',
  references:        '#5A5A7A',
};

const SECTION_ICONS: Record<string, string> = {
  abstract:          'document-text-outline',
  introduction:      'compass-outline',
  literature_review: 'library-outline',
  methodology:       'construct-outline',
  findings:          'analytics-outline',
  conclusion:        'checkmark-circle-outline',
  references:        'link-outline',
};

// ─── Formatting toolbar (FIX #3: selection-aware) ────────────────────────────

const FORMAT_TOOLS = [
  { label: 'B',  prefix: '**', suffix: '**' },
  { label: 'I',  prefix: '_',  suffix: '_'  },
  { label: 'U',  prefix: '__', suffix: '__' },
  { label: '"',  prefix: '> ', suffix: ''   },
] as const;

function FormatToolbar({ onInsert }: { onInsert: (p: string, s: string) => void }) {
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 4,
      paddingHorizontal: SPACING.sm, paddingVertical: 6,
      backgroundColor: COLORS.backgroundElevated,
      borderTopWidth: 1, borderTopColor: COLORS.border,
    }}>
      {FORMAT_TOOLS.map(tool => (
        <Pressable
          key={tool.label}
          onPress={() => onInsert(tool.prefix, tool.suffix)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={{
            width: 36, height: 36, borderRadius: 9,
            backgroundColor: COLORS.backgroundCard,
            alignItems: 'center', justifyContent: 'center',
            borderWidth: 1, borderColor: COLORS.border,
          }}
        >
          <Text style={{
            color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, fontWeight: '800',
            fontStyle:           tool.label === 'I' ? 'italic'     : 'normal',
            textDecorationLine:  tool.label === 'U' ? 'underline'  : 'none',
          }}>
            {tool.label}
          </Text>
        </Pressable>
      ))}
      <View style={{ flex: 1 }} />
      <Text style={{ color: COLORS.textMuted, fontSize: 9, fontStyle: 'italic' }}>
        Markdown formatting
      </Text>
    </View>
  );
}

// ─── Full-screen editor modal ─────────────────────────────────────────────────

interface FullScreenEditorProps {
  visible:     boolean;
  title:       string;
  content:     string;
  wordCount:   number;
  target?:     { min: number; max: number };
  accentColor: string;
  onSave:      (text: string) => void;
  onClose:     () => void;
}

function FullScreenEditor({
  visible, title, content, target, accentColor, onSave, onClose,
}: FullScreenEditorProps) {
  const insets   = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);
  const [text, setText] = useState(content);
  const selRef = useRef<{ start: number; end: number }>({ start: 0, end: 0 });

  React.useEffect(() => {
    if (visible) {
      setText(content);
      selRef.current = { start: 0, end: 0 };
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [visible, content]);

  const handleInsert = useCallback((prefix: string, suffix: string) => {
    setText(prev => {
      const { start, end } = selRef.current;
      if (prefix === '> ') {
        if (start !== end) {
          const before   = prev.substring(0, start);
          const selected = prev.substring(start, end);
          const after    = prev.substring(end);
          const quoted   = selected.split('\n').map(l => `> ${l}`).join('\n');
          return `${before}${quoted}${after}`;
        }
        const lines = prev.split('\n');
        let chars = 0, tgt = lines.length - 1;
        for (let i = 0; i < lines.length; i++) {
          chars += lines[i].length + 1;
          if (chars > start) { tgt = i; break; }
        }
        lines[tgt] = `> ${lines[tgt]}`;
        return lines.join('\n');
      }
      if (start === end) {
        const before = prev.substring(0, start);
        const after  = prev.substring(end);
        return suffix ? `${before}${prefix}text${suffix}${after}` : `${before}${prefix}${after}`;
      }
      const before   = prev.substring(0, start);
      const selected = prev.substring(start, end);
      const after    = prev.substring(end);
      return `${before}${prefix}${selected}${suffix}${after}`;
    });
  }, []);

  const onSelectionChange = useCallback(
    (e: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => {
      selRef.current = e.nativeEvent.selection;
    }, [],
  );

  const words = countWords(text);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen">
      <View style={{ flex: 1, backgroundColor: COLORS.background }}>
        <View style={{
          paddingTop: insets.top + SPACING.sm, paddingHorizontal: SPACING.lg,
          paddingBottom: SPACING.sm, backgroundColor: COLORS.backgroundCard,
          borderBottomWidth: 1, borderBottomColor: COLORS.border,
          flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
        }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '800' }} numberOfLines={1}>
              {title}
            </Text>
            <WordCountBadge sectionType="" wordCount={words} compact />
          </View>
          <Pressable
            onPress={() => { onSave(text); onClose(); }}
            style={{ backgroundColor: accentColor, borderRadius: RADIUS.lg, paddingHorizontal: 16, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 5 }}
          >
            <Ionicons name="checkmark" size={16} color="#FFF" />
            <Text style={{ color: '#FFF', fontSize: FONTS.sizes.sm, fontWeight: '800' }}>Done</Text>
          </Pressable>
          <Pressable onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={22} color={COLORS.textMuted} />
          </Pressable>
        </View>

        {target && target.max < 9999 && (
          <View style={{
            backgroundColor: `${accentColor}10`, paddingHorizontal: SPACING.lg, paddingVertical: 6,
            borderBottomWidth: 1, borderBottomColor: `${accentColor}20`,
            flexDirection: 'row', alignItems: 'center', gap: 6,
          }}>
            <Ionicons name="information-circle-outline" size={13} color={accentColor} />
            <Text style={{ color: accentColor, fontSize: 11 }}>
              Target: {target.min}–{target.max} words
              {words < target.min ? ` · Need ${target.min - words} more`
               : words > target.max ? ` · ${words - target.max} over`
               : ' · ✓ In range'}
            </Text>
          </View>
        )}

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="always">
            <TextInput
              ref={inputRef}
              value={text}
              onChangeText={setText}
              onSelectionChange={onSelectionChange}
              multiline
              textAlignVertical="top"
              style={{
                color: COLORS.textPrimary, fontSize: FONTS.sizes.base,
                lineHeight: 28, padding: SPACING.lg,
                minHeight: SCREEN_H * 0.6, fontFamily: 'System',
              }}
              placeholder="Start writing this section…"
              placeholderTextColor={COLORS.textMuted}
              scrollEnabled={false}
            />
          </ScrollView>
          <FormatToolbar onInsert={handleInsert} />
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// ─── FIX #5: Add Subsection choice modal ─────────────────────────────────────

interface AddSubsectionModalProps {
  visible:        boolean;
  accentColor:    string;
  isAIProcessing: boolean;
  onManual:       () => void;
  onAI:           (description: string) => void;
  onClose:        () => void;
}

function AddSubsectionModal({
  visible, accentColor, isAIProcessing, onManual, onAI, onClose,
}: AddSubsectionModalProps) {
  const insets = useSafeAreaInsets();
  const [description, setDescription] = useState('');
  const [showAIInput, setShowAIInput] = useState(false);

  React.useEffect(() => {
    if (!visible) { setShowAIInput(false); setDescription(''); }
  }, [visible]);

  const handleAIGenerate = () => {
    onAI(description.trim());
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' }}
      >
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View style={{
          backgroundColor: COLORS.backgroundCard,
          borderTopLeftRadius: 24, borderTopRightRadius: 24,
          paddingBottom: insets.bottom + SPACING.lg,
          paddingTop: SPACING.sm,
          borderTopWidth: 1, borderTopColor: COLORS.border,
        }}>
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.border, alignSelf: 'center', marginBottom: SPACING.md }} />

          <View style={{ paddingHorizontal: SPACING.lg, marginBottom: SPACING.md }}>
            <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '800' }}>
              Add Subsection
            </Text>
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 3 }}>
              Choose how to create the new subsection
            </Text>
          </View>

          {!showAIInput ? (
            <View style={{ paddingHorizontal: SPACING.lg, gap: SPACING.sm }}>
              {/* Manual option */}
              <TouchableOpacity
                onPress={() => { onManual(); onClose(); }}
                activeOpacity={0.85}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
                  backgroundColor: COLORS.backgroundElevated,
                  borderRadius: RADIUS.xl, padding: SPACING.md,
                  borderWidth: 1, borderColor: COLORS.border,
                }}
              >
                <View style={{
                  width: 44, height: 44, borderRadius: 13,
                  backgroundColor: `${COLORS.info}15`,
                  alignItems: 'center', justifyContent: 'center',
                  borderWidth: 1, borderColor: `${COLORS.info}25`,
                }}>
                  <Ionicons name="pencil-outline" size={21} color={COLORS.info} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '700' }}>
                    Add Manually
                  </Text>
                  <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 2 }}>
                    Create blank subsection and write your own content
                  </Text>
                </View>
                <View style={{
                  backgroundColor: `${COLORS.success}15`, borderRadius: RADIUS.full,
                  paddingHorizontal: 8, paddingVertical: 4,
                  borderWidth: 1, borderColor: `${COLORS.success}25`,
                }}>
                  <Text style={{ color: COLORS.success, fontSize: 10, fontWeight: '700' }}>FREE</Text>
                </View>
              </TouchableOpacity>

              {/* AI Generate option */}
              <TouchableOpacity
                onPress={() => setShowAIInput(true)}
                activeOpacity={0.85}
              >
                <LinearGradient
                  colors={[accentColor, `${accentColor}CC`] as [string, string]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
                    borderRadius: RADIUS.xl, padding: SPACING.md,
                    ...SHADOWS.small,
                  }}
                >
                  <View style={{
                    width: 44, height: 44, borderRadius: 13,
                    backgroundColor: 'rgba(255,255,255,0.2)',
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Ionicons name="sparkles" size={21} color="#FFF" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#FFF', fontSize: FONTS.sizes.base, fontWeight: '700' }}>
                      Generate with AI ✦
                    </Text>
                    <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: FONTS.sizes.xs, marginTop: 2 }}>
                      AI writes the title and content automatically
                    </Text>
                  </View>
                  <View style={{
                    backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: RADIUS.full,
                    paddingHorizontal: 9, paddingVertical: 4,
                    flexDirection: 'row', alignItems: 'center', gap: 3,
                  }}>
                    <Ionicons name="flash" size={10} color="#FFF" />
                    <Text style={{ color: '#FFF', fontSize: 10, fontWeight: '800' }}>2 cr</Text>
                  </View>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          ) : (
            /* AI input step */
            <View style={{ paddingHorizontal: SPACING.lg, gap: SPACING.md }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                <Pressable
                  onPress={() => setShowAIInput(false)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="arrow-back" size={18} color={COLORS.textSecondary} />
                </Pressable>
                <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '700' }}>
                  Describe the subsection (optional)
                </Text>
              </View>

              <View style={{
                backgroundColor: COLORS.backgroundElevated,
                borderRadius: RADIUS.lg, borderWidth: 1,
                borderColor: description ? accentColor : COLORS.border,
                paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
              }}>
                <TextInput
                  value={description}
                  onChangeText={setDescription}
                  placeholder="e.g. 'Impact on developing countries' or leave blank for AI to decide"
                  placeholderTextColor={COLORS.textMuted}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                  style={{
                    color: COLORS.textPrimary, fontSize: FONTS.sizes.sm,
                    minHeight: 70,
                  }}
                  autoFocus
                />
              </View>

              <View style={{
                backgroundColor: `${accentColor}10`, borderRadius: RADIUS.lg,
                padding: SPACING.sm, borderWidth: 1, borderColor: `${accentColor}20`,
                flexDirection: 'row', alignItems: 'flex-start', gap: 8,
              }}>
                <Ionicons name="sparkles" size={13} color={accentColor} style={{ marginTop: 1 }} />
                <Text style={{ color: accentColor, fontSize: FONTS.sizes.xs, flex: 1, lineHeight: 18 }}>
                  AI will generate a 3-8 word academic title and 150-280 words of content.
                  Costs 2 credits. You can edit everything afterwards.
                </Text>
              </View>

              <TouchableOpacity
                onPress={handleAIGenerate}
                disabled={isAIProcessing}
                activeOpacity={0.85}
                style={{ opacity: isAIProcessing ? 0.6 : 1 }}
              >
                <LinearGradient
                  colors={[accentColor, `${accentColor}CC`] as [string, string]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={{
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                    gap: 8, borderRadius: RADIUS.full, paddingVertical: 14,
                    ...SHADOWS.medium,
                  }}
                >
                  {isAIProcessing
                    ? <ActivityIndicator size="small" color="#FFF" />
                    : <Ionicons name="sparkles" size={17} color="#FFF" />
                  }
                  <Text style={{ color: '#FFF', fontSize: FONTS.sizes.base, fontWeight: '800' }}>
                    {isAIProcessing ? 'Generating…' : 'Generate Subsection (2 cr)'}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Subsection row ───────────────────────────────────────────────────────────

interface SubsectionRowProps {
  sub:             AcademicSubsection;
  number:          number;
  isFirst:         boolean;
  isLast:          boolean;
  accentColor:     string;
  isAIProcessing:  boolean;
  onEdit:          () => void;
  onEditTitle:     (title: string) => void;
  onMoveUp:        () => void;
  onMoveDown:      () => void;
  onDelete:        () => void;
  onOpenAITools:   () => void;
  /** FIX #4: confirm credit cost before calling this */
  onGenerateTitle: () => void;
}

function SubsectionRow({
  sub, number, isFirst, isLast, accentColor, isAIProcessing,
  onEdit, onEditTitle, onMoveUp, onMoveDown, onDelete,
  onOpenAITools, onGenerateTitle,
}: SubsectionRowProps) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleText,    setTitleText]    = useState(sub.title);
  const words = countWords(sub.content);

  React.useEffect(() => {
    if (!editingTitle) setTitleText(sub.title);
  }, [sub.title, editingTitle]);

  // FIX #4: show confirmation with credit cost before generating
  const handleTitleButtonPress = () => {
    Alert.alert(
      'Generate AI Title',
      `AI will generate a concise academic title for this subsection based on its content.\n\nCost: 1 credit`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Generate (1 cr)',
          onPress: onGenerateTitle,
        },
      ],
    );
  };

  return (
    <View style={{
      borderLeftWidth: 3,
      borderLeftColor: `${accentColor}60`,
      marginLeft: SPACING.sm,
      paddingLeft: SPACING.sm,
      marginTop: SPACING.sm,
    }}>
      {/* Title row */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 }}>
        {/* FIX #4: numbered badge */}
        <View style={{
          width: 20, height: 20, borderRadius: 6,
          backgroundColor: `${accentColor}20`,
          alignItems: 'center', justifyContent: 'center',
          borderWidth: 1, borderColor: `${accentColor}40`,
          flexShrink: 0,
        }}>
          <Text style={{ color: accentColor, fontSize: 9, fontWeight: '800' }}>{number}</Text>
        </View>

        {editingTitle ? (
          <TextInput
            value={titleText}
            onChangeText={setTitleText}
            onBlur={() => { setEditingTitle(false); onEditTitle(titleText); }}
            autoFocus
            style={{
              flex: 1, color: COLORS.textPrimary, fontSize: FONTS.sizes.sm,
              fontWeight: '700', borderBottomWidth: 1, borderBottomColor: accentColor,
              paddingBottom: 2,
            }}
          />
        ) : (
          <Pressable
            onPress={() => setEditingTitle(true)}
            style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5 }}
          >
            <Text
              style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '700', flex: 1 }}
              numberOfLines={1}
            >
              {sub.title}
            </Text>
            <Ionicons name="pencil-outline" size={11} color={COLORS.textMuted} />
          </Pressable>
        )}

        {/* Action buttons */}
        <View style={{ flexDirection: 'row', gap: 3, alignItems: 'center' }}>
          {/* FIX #4: "T" = Generate AI title — shows confirmation alert */}
          <Pressable
            onPress={handleTitleButtonPress}
            disabled={isAIProcessing}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            style={{
              width: 24, height: 24, borderRadius: 6,
              backgroundColor: `${COLORS.info}15`,
              alignItems: 'center', justifyContent: 'center',
              borderWidth: 1, borderColor: `${COLORS.info}30`,
              opacity: isAIProcessing ? 0.4 : 1,
            }}
          >
            <Text style={{ color: COLORS.info, fontSize: 8, fontWeight: '800' }}>T</Text>
          </Pressable>

          {/* AI tools */}
          <Pressable
            onPress={onOpenAITools}
            disabled={isAIProcessing}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            style={{
              width: 24, height: 24, borderRadius: 6,
              backgroundColor: `${COLORS.primary}15`,
              alignItems: 'center', justifyContent: 'center',
              borderWidth: 1, borderColor: `${COLORS.primary}30`,
              opacity: isAIProcessing ? 0.4 : 1,
            }}
          >
            <Ionicons name="sparkles" size={10} color={COLORS.primary} />
          </Pressable>

          {!isFirst && (
            <Pressable onPress={onMoveUp} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
              <Ionicons name="chevron-up" size={14} color={COLORS.textMuted} />
            </Pressable>
          )}
          {!isLast && (
            <Pressable onPress={onMoveDown} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
              <Ionicons name="chevron-down" size={14} color={COLORS.textMuted} />
            </Pressable>
          )}
          <Pressable onPress={onDelete} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
            <Ionicons name="trash-outline" size={13} color={COLORS.error} />
          </Pressable>
        </View>
      </View>

      {/* Content preview */}
      <Pressable
        onPress={onEdit}
        style={{
          backgroundColor: COLORS.backgroundElevated,
          borderRadius: RADIUS.lg, padding: SPACING.sm,
          borderWidth: 1, borderColor: COLORS.border,
        }}
      >
        {sub.content ? (
          <Text
            style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, lineHeight: 18 }}
            numberOfLines={3}
          >
            {sub.content}
          </Text>
        ) : (
          <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontStyle: 'italic' }}>
            Tap to write content…
          </Text>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 }}>
          <Ionicons name="pencil-outline" size={11} color={accentColor} />
          <Text style={{ color: accentColor, fontSize: 10, fontWeight: '600' }}>Edit</Text>
          <Text style={{ color: COLORS.textMuted, fontSize: 10, marginLeft: 'auto' }}>
            {words} words
          </Text>
        </View>
      </Pressable>
    </View>
  );
}

// ─── Main component props ─────────────────────────────────────────────────────

interface PaperSectionEditorProps {
  section:             AcademicSection;
  index:               number;
  isAIProcessing:      boolean;
  aiProcessingLabel:   string;
  onUpdateContent:     (content: string) => void;
  /** FIX #5: called for manual add */
  onAddSubsection:     () => void;
  /** FIX #5: called for AI add — description is optional user hint */
  onAddSubsectionWithAI: (description?: string) => void;
  onUpdateSubsection:  (subId: string, field: 'title' | 'content', value: string) => void;
  onRemoveSubsection:  (subId: string) => void;
  onMoveSubUp:         (subId: string) => void;
  onMoveSubDown:       (subId: string) => void;
  onOpenAITools:       (subsectionId?: string) => void;
  onGenerateSubsectionTitle?: (subsectionId: string) => void;
}

// ─── Main component ───────────────────────────────────────────────────────────

export const PaperSectionEditor = memo(function PaperSectionEditor({
  section, index, isAIProcessing, aiProcessingLabel,
  onUpdateContent, onAddSubsection, onAddSubsectionWithAI,
  onUpdateSubsection, onRemoveSubsection, onMoveSubUp, onMoveSubDown,
  onOpenAITools, onGenerateSubsectionTitle,
}: PaperSectionEditorProps) {
  const [expanded,        setExpanded]        = useState(true);
  const [editorVisible,   setEditorVisible]   = useState(false);
  const [editingSub,      setEditingSub]       = useState<{ id: string } | null>(null);
  // FIX #5: add subsection choice modal
  const [showAddModal,    setShowAddModal]     = useState(false);

  const accentColor = SECTION_COLORS[section.type] ?? COLORS.primary;
  const icon        = SECTION_ICONS[section.type]  ?? 'document-outline';
  const target      = SECTION_WORD_TARGETS[section.type];
  const wordCount   = countWords(section.content) +
    (section.subsections ?? []).reduce((a, s) => a + countWords(s.content), 0);

  const isAbstract = section.type === 'abstract';
  const isRefs     = section.type === 'references';

  const editingSubObj = editingSub
    ? (section.subsections ?? []).find(s => s.id === editingSub.id)
    : null;

  return (
    <Animated.View entering={FadeInDown.duration(350).delay(index * 50)}>
      <View style={{
        backgroundColor: COLORS.backgroundCard,
        borderRadius: RADIUS.xl, marginBottom: SPACING.md,
        borderWidth: 1,
        borderColor: isAIProcessing ? `${accentColor}50` : COLORS.border,
        overflow: 'hidden',
        ...(isAIProcessing ? SHADOWS.small : {}),
      }}>

        {/* ── Section header ── */}
        <Pressable
          onPress={() => setExpanded(e => !e)}
          style={{
            flexDirection: 'row', alignItems: 'center',
            padding: SPACING.md, gap: SPACING.sm,
            backgroundColor: isAIProcessing ? `${accentColor}08` : 'transparent',
          }}
        >
          <LinearGradient
            colors={[accentColor, `${accentColor}99`] as [string, string]}
            style={{ width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
          >
            {isAIProcessing
              ? <ActivityIndicator size="small" color="#FFF" />
              : <Ionicons name={icon as any} size={21} color="#FFF" />
            }
          </LinearGradient>

          <View style={{ flex: 1 }}>
            <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '700', marginBottom: 3 }}>
              {SECTION_TYPE_LABELS[section.type] ?? section.title}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <WordCountBadge sectionType={section.type} wordCount={wordCount} compact />
              {(section.subsections?.length ?? 0) > 0 && (
                <Text style={{ color: COLORS.textMuted, fontSize: 10 }}>
                  {section.subsections!.length} subsection{section.subsections!.length !== 1 ? 's' : ''}
                </Text>
              )}
              {isAIProcessing && (
                <Text style={{ color: accentColor, fontSize: 10, fontWeight: '600' }}>
                  {aiProcessingLabel}
                </Text>
              )}
            </View>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Pressable
              onPress={e => { e.stopPropagation(); onOpenAITools(); }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={{
                width: 32, height: 32, borderRadius: 9,
                backgroundColor: `${COLORS.primary}18`,
                alignItems: 'center', justifyContent: 'center',
                borderWidth: 1, borderColor: `${COLORS.primary}35`,
              }}
            >
              <Ionicons name="sparkles" size={15} color={COLORS.primary} />
            </Pressable>

            <View style={{
              width: 32, height: 32, borderRadius: 9,
              backgroundColor: COLORS.backgroundElevated,
              alignItems: 'center', justifyContent: 'center',
              borderWidth: 1, borderColor: COLORS.border,
            }}>
              <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={15} color={COLORS.textMuted} />
            </View>
          </View>
        </Pressable>

        {/* ── Body ── */}
        {expanded && (
          <View style={{
            paddingHorizontal: SPACING.md, paddingBottom: SPACING.md,
            borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: SPACING.md,
          }}>

            {isAbstract ? (
              <Pressable
                onPress={() => setEditorVisible(true)}
                style={{
                  backgroundColor: `${accentColor}06`, borderRadius: RADIUS.lg,
                  padding: SPACING.md, borderWidth: 1,
                  borderColor: `${accentColor}25`, borderLeftWidth: 3, borderLeftColor: accentColor,
                }}
              >
                {section.content ? (
                  <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, lineHeight: 22 }} numberOfLines={6}>
                    {section.content}
                  </Text>
                ) : (
                  <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.sm, fontStyle: 'italic' }}>
                    Tap to write the abstract (250–300 words)…
                  </Text>
                )}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8 }}>
                  <Ionicons name="pencil-outline" size={12} color={accentColor} />
                  <Text style={{ color: accentColor, fontSize: 10, fontWeight: '600' }}>Edit Abstract</Text>
                </View>
              </Pressable>

            ) : isRefs ? (
              <Pressable
                onPress={() => setEditorVisible(true)}
                style={{
                  backgroundColor: COLORS.backgroundElevated, borderRadius: RADIUS.lg,
                  padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border,
                }}
              >
                {section.content ? (
                  <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, lineHeight: 20 }} numberOfLines={8}>
                    {section.content}
                  </Text>
                ) : (
                  <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.sm, fontStyle: 'italic' }}>
                    References appear here automatically when you add citations.
                  </Text>
                )}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8 }}>
                  <Ionicons name="pencil-outline" size={12} color={COLORS.primary} />
                  <Text style={{ color: COLORS.primary, fontSize: 10, fontWeight: '600' }}>Edit References</Text>
                </View>
              </Pressable>

            ) : (
              <>
                {/* Main content */}
                <Pressable
                  onPress={() => setEditorVisible(true)}
                  style={{
                    backgroundColor: COLORS.backgroundElevated, borderRadius: RADIUS.lg,
                    padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border,
                    marginBottom: SPACING.sm,
                  }}
                >
                  {section.content ? (
                    <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, lineHeight: 20 }} numberOfLines={5}>
                      {section.content}
                    </Text>
                  ) : (
                    <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.sm, fontStyle: 'italic' }}>
                      Tap to write main section content…
                    </Text>
                  )}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8 }}>
                    <Ionicons name="pencil-outline" size={12} color={accentColor} />
                    <Text style={{ color: accentColor, fontSize: 10, fontWeight: '600' }}>Edit Main Content</Text>
                  </View>
                </Pressable>

                {/* Subsections with auto-numbering */}
                {(section.subsections ?? []).map((sub, si) => (
                  <SubsectionRow
                    key={sub.id}
                    sub={sub}
                    number={si + 1}
                    isFirst={si === 0}
                    isLast={si === (section.subsections!.length - 1)}
                    accentColor={accentColor}
                    isAIProcessing={isAIProcessing}
                    onEdit={() => setEditingSub({ id: sub.id })}
                    onEditTitle={title => onUpdateSubsection(sub.id, 'title', title)}
                    onMoveUp={() => onMoveSubUp(sub.id)}
                    onMoveDown={() => onMoveSubDown(sub.id)}
                    onDelete={() => onRemoveSubsection(sub.id)}
                    onOpenAITools={() => onOpenAITools(sub.id)}
                    onGenerateTitle={() => onGenerateSubsectionTitle?.(sub.id)}
                  />
                ))}

                {/* FIX #5: Add Subsection → choice modal */}
                <TouchableOpacity
                  onPress={() => setShowAddModal(true)}
                  activeOpacity={0.75}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 6,
                    marginTop: SPACING.sm, paddingVertical: 9, paddingHorizontal: SPACING.md,
                    borderRadius: RADIUS.lg, borderWidth: 1,
                    borderColor: `${accentColor}35`,
                    borderStyle: 'dashed',
                    backgroundColor: `${accentColor}06`,
                  }}
                >
                  <Ionicons name="add-circle-outline" size={16} color={accentColor} />
                  <Text style={{ color: accentColor, fontSize: FONTS.sizes.sm, fontWeight: '600' }}>
                    Add Subsection
                  </Text>
                  <View style={{ flex: 1 }} />
                  <View style={{
                    backgroundColor: `${COLORS.primary}15`, borderRadius: RADIUS.full,
                    paddingHorizontal: 7, paddingVertical: 3,
                    flexDirection: 'row', alignItems: 'center', gap: 3,
                  }}>
                    <Ionicons name="sparkles" size={9} color={COLORS.primary} />
                    <Text style={{ color: COLORS.primary, fontSize: 9, fontWeight: '700' }}>AI option</Text>
                  </View>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}
      </View>

      {/* Full-screen editor for main content */}
      <FullScreenEditor
        visible={editorVisible}
        title={SECTION_TYPE_LABELS[section.type] ?? section.title}
        content={section.content}
        wordCount={countWords(section.content)}
        target={target}
        accentColor={accentColor}
        onSave={onUpdateContent}
        onClose={() => setEditorVisible(false)}
      />

      {/* Full-screen editor for subsection */}
      {editingSubObj && (
        <FullScreenEditor
          visible={!!editingSub}
          title={editingSubObj.title}
          content={editingSubObj.content}
          wordCount={countWords(editingSubObj.content)}
          accentColor={accentColor}
          onSave={text => onUpdateSubsection(editingSubObj.id, 'content', text)}
          onClose={() => setEditingSub(null)}
        />
      )}

      {/* FIX #5: Add subsection choice modal */}
      <AddSubsectionModal
        visible={showAddModal}
        accentColor={accentColor}
        isAIProcessing={isAIProcessing}
        onManual={() => {
          onAddSubsection();
          setShowAddModal(false);
        }}
        onAI={(description) => {
          setShowAddModal(false);
          onAddSubsectionWithAI(description || undefined);
        }}
        onClose={() => setShowAddModal(false)}
      />
    </Animated.View>
  );
});