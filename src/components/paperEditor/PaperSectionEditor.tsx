// src/components/paperEditor/PaperSectionEditor.tsx
// Part 38 — Inline section editor card.
// Part 38b/c — Formatting toolbar, subsection AI, add-subsection modal.
// Part 41.8 — Section management controls.
// Part 41.8 FIX — Complete header redesign:
//   ISSUE 1: Title was squeezed because the title view and 5+ buttons shared
//            a single flex row. Fixed by splitting the header into two rows:
//            Row 1: icon + title (full width) + collapse chevron.
//            Row 2: dedicated action bar with labelled pill buttons.
//   ISSUE 2: Rename was unreliable (inline TextInput in a Pressable caused
//            immediate blur). Fixed with a small rename Modal that has a
//            proper TextInput without interference.
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
import {
  SECTION_TYPE_LABELS,
  SECTION_TYPE_COLORS,
  SECTION_TYPE_ICONS,
  SECTION_TYPE_OPTIONS,
} from '../../constants/paperEditor';
import { SECTION_WORD_TARGETS } from '../../types/paperEditor';
import type { AcademicSection, AcademicSubsection } from '../../types';
import type { PaperAITool, SectionInsertPosition, NewSectionConfig } from '../../types/paperEditor';

const SCREEN_H = Dimensions.get('window').height;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getSectionAccent(type: string): string {
  return SECTION_TYPE_COLORS[type] ?? COLORS.primary;
}
function getSectionIcon(type: string): string {
  return SECTION_TYPE_ICONS[type] ?? 'document-text-outline';
}
function getSectionDisplayLabel(section: AcademicSection): string {
  return SECTION_TYPE_LABELS[section.type] ?? section.title;
}

// ─── Rename Modal ─────────────────────────────────────────────────────────────
// Separate modal to avoid the inline-TextInput-blur-immediately bug
// that happened when the TextInput was inside the collapse Pressable.

interface RenameSectionModalProps {
  visible:     boolean;
  currentName: string;
  accentColor: string;
  onConfirm:   (newTitle: string) => void;
  onClose:     () => void;
}

function RenameSectionModal({ visible, currentName, accentColor, onConfirm, onClose }: RenameSectionModalProps) {
  const insets  = useSafeAreaInsets();
  const [text, setText] = useState(currentName);
  const inputRef        = useRef<TextInput>(null);

  React.useEffect(() => {
    if (visible) {
      setText(currentName);
      // Small delay so the modal animation completes before focusing
      setTimeout(() => inputRef.current?.focus(), 220);
    }
  }, [visible, currentName]);

  const handleConfirm = () => {
    const trimmed = text.trim();
    if (trimmed) onConfirm(trimmed);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: SPACING.xl }}
      >
        <Pressable style={{ position: 'absolute', inset: 0 }} onPress={onClose} />
        <View style={{
          backgroundColor: COLORS.backgroundCard,
          borderRadius: RADIUS.xl,
          padding: SPACING.lg,
          width: '100%',
          borderWidth: 1, borderColor: COLORS.border,
          gap: SPACING.md,
          ...SHADOWS.large,
        }}>
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm }}>
            <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: `${accentColor}20`, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: `${accentColor}35` }}>
              <Ionicons name="pencil" size={17} color={accentColor} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '800' }}>Rename Section</Text>
              <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 2 }}>Enter a new title for this section</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={20} color={COLORS.textMuted} />
            </Pressable>
          </View>

          {/* Input */}
          <View style={{
            backgroundColor: COLORS.backgroundElevated,
            borderRadius: RADIUS.lg,
            borderWidth: 1.5,
            borderColor: text.trim() ? accentColor : COLORS.border,
            paddingHorizontal: SPACING.md,
          }}>
            <TextInput
              ref={inputRef}
              value={text}
              onChangeText={setText}
              onSubmitEditing={handleConfirm}
              returnKeyType="done"
              maxLength={80}
              style={{
                color:    COLORS.textPrimary,
                fontSize: FONTS.sizes.base,
                fontWeight: '600',
                height:   52,
              }}
              placeholderTextColor={COLORS.textMuted}
              placeholder="Section title…"
              selectTextOnFocus
            />
          </View>

          {/* Char count */}
          <Text style={{ color: COLORS.textMuted, fontSize: 10, textAlign: 'right', marginTop: -SPACING.sm }}>
            {text.trim().length} / 80
          </Text>

          {/* Actions */}
          <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
            <Pressable
              onPress={onClose}
              style={{ flex: 1, paddingVertical: 12, borderRadius: RADIUS.full, backgroundColor: COLORS.backgroundElevated, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border }}
            >
              <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, fontWeight: '700' }}>Cancel</Text>
            </Pressable>
            <TouchableOpacity
              onPress={handleConfirm}
              disabled={!text.trim()}
              activeOpacity={0.85}
              style={{ flex: 2, opacity: text.trim() ? 1 : 0.4 }}
            >
              <LinearGradient
                colors={[accentColor, `${accentColor}CC`] as [string, string]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={{ paddingVertical: 12, borderRadius: RADIUS.full, alignItems: 'center', ...SHADOWS.small }}
              >
                <Text style={{ color: '#FFF', fontSize: FONTS.sizes.sm, fontWeight: '800' }}>Rename</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Formatting toolbar ───────────────────────────────────────────────────────

const FORMAT_TOOLS = [
  { label: 'B', prefix: '**', suffix: '**' },
  { label: 'I', prefix: '_',  suffix: '_'  },
  { label: 'U', prefix: '__', suffix: '__' },
  { label: '"', prefix: '> ', suffix: ''   },
] as const;

function FormatToolbar({ onInsert }: { onInsert: (p: string, s: string) => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: SPACING.sm, paddingVertical: 6, backgroundColor: COLORS.backgroundElevated, borderTopWidth: 1, borderTopColor: COLORS.border }}>
      {FORMAT_TOOLS.map(tool => (
        <Pressable key={tool.label} onPress={() => onInsert(tool.prefix, tool.suffix)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ width: 36, height: 36, borderRadius: 9, backgroundColor: COLORS.backgroundCard, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border }}>
          <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, fontWeight: '800', fontStyle: tool.label === 'I' ? 'italic' : 'normal', textDecorationLine: tool.label === 'U' ? 'underline' : 'none' }}>{tool.label}</Text>
        </Pressable>
      ))}
      <View style={{ flex: 1 }} />
      <Text style={{ color: COLORS.textMuted, fontSize: 9, fontStyle: 'italic' }}>Markdown</Text>
    </View>
  );
}

// ─── Full-screen editor modal ─────────────────────────────────────────────────

interface FullScreenEditorProps {
  visible: boolean; title: string; content: string;
  wordCount: number; target?: { min: number; max: number };
  accentColor: string; onSave: (text: string) => void; onClose: () => void;
}

function FullScreenEditor({ visible, title, content, target, accentColor, onSave, onClose }: FullScreenEditorProps) {
  const insets   = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);
  const [text, setText] = useState(content);
  const selRef = useRef<{ start: number; end: number }>({ start: 0, end: 0 });

  React.useEffect(() => {
    if (visible) { setText(content); selRef.current = { start: 0, end: 0 }; setTimeout(() => inputRef.current?.focus(), 200); }
  }, [visible, content]);

  const handleInsert = useCallback((prefix: string, suffix: string) => {
    setText(prev => {
      const { start, end } = selRef.current;
      if (prefix === '> ') {
        if (start !== end) {
          return `${prev.substring(0, start)}${prev.substring(start, end).split('\n').map(l => `> ${l}`).join('\n')}${prev.substring(end)}`;
        }
        const lines = prev.split('\n'); let chars = 0, tgt = lines.length - 1;
        for (let i = 0; i < lines.length; i++) { chars += lines[i].length + 1; if (chars > start) { tgt = i; break; } }
        lines[tgt] = `> ${lines[tgt]}`; return lines.join('\n');
      }
      if (start === end) return suffix ? `${prev.substring(0, start)}${prefix}text${suffix}${prev.substring(end)}` : `${prev.substring(0, start)}${prefix}${prev.substring(end)}`;
      return `${prev.substring(0, start)}${prefix}${prev.substring(start, end)}${suffix}${prev.substring(end)}`;
    });
  }, []);

  const onSelectionChange = useCallback((e: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => { selRef.current = e.nativeEvent.selection; }, []);
  const words = countWords(text);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen">
      <View style={{ flex: 1, backgroundColor: COLORS.background }}>
        <View style={{ paddingTop: insets.top + SPACING.sm, paddingHorizontal: SPACING.lg, paddingBottom: SPACING.sm, backgroundColor: COLORS.backgroundCard, borderBottomWidth: 1, borderBottomColor: COLORS.border, flexDirection: 'row', alignItems: 'center', gap: SPACING.sm }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '800' }} numberOfLines={1}>{title}</Text>
            <WordCountBadge sectionType="" wordCount={words} compact />
          </View>
          <Pressable onPress={() => { onSave(text); onClose(); }} style={{ backgroundColor: accentColor, borderRadius: RADIUS.lg, paddingHorizontal: 16, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Ionicons name="checkmark" size={16} color="#FFF" />
            <Text style={{ color: '#FFF', fontSize: FONTS.sizes.sm, fontWeight: '800' }}>Done</Text>
          </Pressable>
          <Pressable onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={22} color={COLORS.textMuted} />
          </Pressable>
        </View>
        {target && target.max < 9999 && (
          <View style={{ backgroundColor: `${accentColor}10`, paddingHorizontal: SPACING.lg, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: `${accentColor}20`, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="information-circle-outline" size={13} color={accentColor} />
            <Text style={{ color: accentColor, fontSize: 11 }}>Target: {target.min}–{target.max} words{words < target.min ? ` · Need ${target.min - words} more` : words > target.max ? ` · ${words - target.max} over` : ' · ✓ In range'}</Text>
          </View>
        )}
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="always">
            <TextInput ref={inputRef} value={text} onChangeText={setText} onSelectionChange={onSelectionChange} multiline textAlignVertical="top" style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, lineHeight: 28, padding: SPACING.lg, minHeight: SCREEN_H * 0.6 }} placeholder="Start writing this section…" placeholderTextColor={COLORS.textMuted} scrollEnabled={false} />
          </ScrollView>
          <FormatToolbar onInsert={handleInsert} />
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// ─── Add Section Modal ────────────────────────────────────────────────────────

interface AddSectionModalProps {
  visible: boolean; insertAfter: string | null; isAIProcessing: boolean;
  onManual: (config: NewSectionConfig, position: SectionInsertPosition) => void;
  onAI:    (config: NewSectionConfig, position: SectionInsertPosition) => void;
  onClose: () => void;
}

function AddSectionModal({ visible, insertAfter, isAIProcessing, onManual, onAI, onClose }: AddSectionModalProps) {
  const insets = useSafeAreaInsets();
  const [selectedType, setSelectedType] = useState('custom');
  const [customTitle,  setCustomTitle]  = useState('');
  const [description,  setDescription]  = useState('');
  const [mode,         setMode]         = useState<'pick' | 'configure'>('pick');
  React.useEffect(() => { if (!visible) { setMode('pick'); setSelectedType('custom'); setCustomTitle(''); setDescription(''); } }, [visible]);
  const position: SectionInsertPosition = insertAfter ? { where: 'after', targetSectionId: insertAfter } : { where: 'end' };
  const selectedOption = SECTION_TYPE_OPTIONS.find(o => o.type === selectedType);
  const handleManual = () => { onManual({ type: selectedType, title: customTitle || selectedOption?.label || 'New Section', description, useAI: false }, position); onClose(); };
  const handleAI     = () => { onAI({ type: selectedType, title: customTitle || selectedOption?.label || 'New Section', description, useAI: true }, position); onClose(); };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View style={{ backgroundColor: COLORS.backgroundCard, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: insets.bottom + SPACING.lg, paddingTop: SPACING.sm, borderTopWidth: 1, borderTopColor: COLORS.border, maxHeight: SCREEN_H * 0.9 }}>
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.border, alignSelf: 'center', marginBottom: SPACING.md }} />
          <View style={{ paddingHorizontal: SPACING.lg, marginBottom: SPACING.md, flexDirection: 'row', alignItems: 'center' }}>
            {mode === 'configure' && <Pressable onPress={() => setMode('pick')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ marginRight: SPACING.sm }}><Ionicons name="arrow-back" size={20} color={COLORS.textSecondary} /></Pressable>}
            <View style={{ flex: 1 }}>
              <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '800' }}>{mode === 'pick' ? 'Add Section' : `Configure: ${selectedOption?.label ?? 'Section'}`}</Text>
              <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 3 }}>{mode === 'pick' ? 'Choose a section type to add' : 'Set title and how to create it'}</Text>
            </View>
          </View>
          {mode === 'pick' ? (
            <ScrollView style={{ maxHeight: SCREEN_H * 0.55 }} contentContainerStyle={{ paddingHorizontal: SPACING.lg, paddingBottom: SPACING.md, gap: SPACING.sm }} showsVerticalScrollIndicator={false}>
              {SECTION_TYPE_OPTIONS.map(option => (
                <TouchableOpacity key={option.type} onPress={() => { setSelectedType(option.type); setMode('configure'); }} activeOpacity={0.8} style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.md, backgroundColor: COLORS.backgroundElevated, borderRadius: RADIUS.xl, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border }}>
                  <View style={{ width: 44, height: 44, borderRadius: 13, backgroundColor: `${option.color}18`, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: `${option.color}30` }}><Ionicons name={option.icon as any} size={21} color={option.color} /></View>
                  <View style={{ flex: 1 }}><Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '700' }}>{option.label}</Text><Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 2 }}>{option.description}</Text></View>
                  <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
                </TouchableOpacity>
              ))}
            </ScrollView>
          ) : (
            <View style={{ paddingHorizontal: SPACING.lg, gap: SPACING.md }}>
              <View>
                <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Section Title</Text>
                <View style={{ backgroundColor: COLORS.backgroundElevated, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: customTitle ? (selectedOption?.color ?? COLORS.primary) : COLORS.border, paddingHorizontal: SPACING.md }}>
                  <TextInput value={customTitle} onChangeText={setCustomTitle} placeholder={selectedOption?.label ?? 'Section title'} placeholderTextColor={COLORS.textMuted} style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, height: 44 }} autoFocus />
                </View>
              </View>
              <View>
                <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>What to cover (optional — used by AI)</Text>
                <View style={{ backgroundColor: COLORS.backgroundElevated, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm }}>
                  <TextInput value={description} onChangeText={setDescription} placeholder="e.g. 'discuss policy implications of findings'" placeholderTextColor={COLORS.textMuted} multiline numberOfLines={3} textAlignVertical="top" style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, minHeight: 60 }} />
                </View>
              </View>
              <View style={{ gap: SPACING.sm }}>
                <TouchableOpacity onPress={handleManual} activeOpacity={0.85} style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.md, backgroundColor: COLORS.backgroundElevated, borderRadius: RADIUS.xl, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border }}>
                  <View style={{ width: 44, height: 44, borderRadius: 13, backgroundColor: `${COLORS.info}15`, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: `${COLORS.info}25` }}><Ionicons name="pencil-outline" size={21} color={COLORS.info} /></View>
                  <View style={{ flex: 1 }}><Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '700' }}>Add Manually</Text><Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 2 }}>Create blank section and write your own content</Text></View>
                  <View style={{ backgroundColor: `${COLORS.success}15`, borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: `${COLORS.success}25` }}><Text style={{ color: COLORS.success, fontSize: 10, fontWeight: '700' }}>FREE</Text></View>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleAI} disabled={isAIProcessing} activeOpacity={0.85} style={{ opacity: isAIProcessing ? 0.6 : 1 }}>
                  <LinearGradient colors={[selectedOption?.color ?? COLORS.primary, `${selectedOption?.color ?? COLORS.primary}CC`] as [string, string]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.md, borderRadius: RADIUS.xl, padding: SPACING.md, ...SHADOWS.small }}>
                    <View style={{ width: 44, height: 44, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }}>{isAIProcessing ? <ActivityIndicator size="small" color="#FFF" /> : <Ionicons name="sparkles" size={21} color="#FFF" />}</View>
                    <View style={{ flex: 1 }}><Text style={{ color: '#FFF', fontSize: FONTS.sizes.base, fontWeight: '700' }}>Generate with AI ✦</Text><Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: FONTS.sizes.xs, marginTop: 2 }}>AI writes title, body (400–600 words) + 2–3 subsections</Text></View>
                    <View style={{ backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: RADIUS.full, paddingHorizontal: 9, paddingVertical: 4, flexDirection: 'row', alignItems: 'center', gap: 3 }}><Ionicons name="flash" size={10} color="#FFF" /><Text style={{ color: '#FFF', fontSize: 10, fontWeight: '800' }}>4 cr</Text></View>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Add Subsection modal ─────────────────────────────────────────────────────

interface AddSubsectionModalProps {
  visible: boolean; accentColor: string; isAIProcessing: boolean;
  onManual: () => void; onAI: (description: string) => void; onClose: () => void;
}

function AddSubsectionModal({ visible, accentColor, isAIProcessing, onManual, onAI, onClose }: AddSubsectionModalProps) {
  const insets = useSafeAreaInsets();
  const [description, setDescription] = useState('');
  const [showAIInput, setShowAIInput] = useState(false);
  React.useEffect(() => { if (!visible) { setShowAIInput(false); setDescription(''); } }, [visible]);
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View style={{ backgroundColor: COLORS.backgroundCard, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: insets.bottom + SPACING.lg, paddingTop: SPACING.sm, borderTopWidth: 1, borderTopColor: COLORS.border }}>
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.border, alignSelf: 'center', marginBottom: SPACING.md }} />
          <View style={{ paddingHorizontal: SPACING.lg, marginBottom: SPACING.md }}><Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '800' }}>Add Subsection</Text></View>
          {!showAIInput ? (
            <View style={{ paddingHorizontal: SPACING.lg, gap: SPACING.sm }}>
              <TouchableOpacity onPress={() => { onManual(); onClose(); }} activeOpacity={0.85} style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.md, backgroundColor: COLORS.backgroundElevated, borderRadius: RADIUS.xl, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border }}>
                <View style={{ width: 44, height: 44, borderRadius: 13, backgroundColor: `${COLORS.info}15`, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: `${COLORS.info}25` }}><Ionicons name="pencil-outline" size={21} color={COLORS.info} /></View>
                <View style={{ flex: 1 }}><Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '700' }}>Add Manually</Text><Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 2 }}>Create blank subsection — free</Text></View>
                <View style={{ backgroundColor: `${COLORS.success}15`, borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: `${COLORS.success}25` }}><Text style={{ color: COLORS.success, fontSize: 10, fontWeight: '700' }}>FREE</Text></View>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowAIInput(true)} activeOpacity={0.85}>
                <LinearGradient colors={[accentColor, `${accentColor}CC`] as [string, string]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.md, borderRadius: RADIUS.xl, padding: SPACING.md, ...SHADOWS.small }}>
                  <View style={{ width: 44, height: 44, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }}><Ionicons name="sparkles" size={21} color="#FFF" /></View>
                  <View style={{ flex: 1 }}><Text style={{ color: '#FFF', fontSize: FONTS.sizes.base, fontWeight: '700' }}>Generate with AI ✦</Text><Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: FONTS.sizes.xs, marginTop: 2 }}>AI writes the title and content</Text></View>
                  <View style={{ backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: RADIUS.full, paddingHorizontal: 9, paddingVertical: 4, flexDirection: 'row', alignItems: 'center', gap: 3 }}><Ionicons name="flash" size={10} color="#FFF" /><Text style={{ color: '#FFF', fontSize: 10, fontWeight: '800' }}>2 cr</Text></View>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={{ paddingHorizontal: SPACING.lg, gap: SPACING.md }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Pressable onPress={() => setShowAIInput(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}><Ionicons name="arrow-back" size={18} color={COLORS.textSecondary} /></Pressable><Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '700' }}>Describe the subsection (optional)</Text></View>
              <View style={{ backgroundColor: COLORS.backgroundElevated, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: description ? accentColor : COLORS.border, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm }}><TextInput value={description} onChangeText={setDescription} placeholder="e.g. 'Impact on developing countries'" placeholderTextColor={COLORS.textMuted} multiline numberOfLines={3} textAlignVertical="top" style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, minHeight: 70 }} autoFocus /></View>
              <TouchableOpacity onPress={() => { onAI(description.trim()); }} disabled={isAIProcessing} activeOpacity={0.85} style={{ opacity: isAIProcessing ? 0.6 : 1 }}>
                <LinearGradient colors={[accentColor, `${accentColor}CC`] as [string, string]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: RADIUS.full, paddingVertical: 14, ...SHADOWS.medium }}>
                  {isAIProcessing ? <ActivityIndicator size="small" color="#FFF" /> : <Ionicons name="sparkles" size={17} color="#FFF" />}
                  <Text style={{ color: '#FFF', fontSize: FONTS.sizes.base, fontWeight: '800' }}>{isAIProcessing ? 'Generating…' : 'Generate Subsection (2 cr)'}</Text>
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
  sub: AcademicSubsection; number: number; isFirst: boolean; isLast: boolean;
  accentColor: string; isAIProcessing: boolean;
  onEdit: () => void; onEditTitle: (title: string) => void;
  onMoveUp: () => void; onMoveDown: () => void; onDelete: () => void;
  onOpenAITools: () => void; onGenerateTitle: () => void;
}

function SubsectionRow({ sub, number, isFirst, isLast, accentColor, isAIProcessing, onEdit, onEditTitle, onMoveUp, onMoveDown, onDelete, onOpenAITools, onGenerateTitle }: SubsectionRowProps) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleText,    setTitleText]    = useState(sub.title);
  const words = countWords(sub.content);
  React.useEffect(() => { if (!editingTitle) setTitleText(sub.title); }, [sub.title, editingTitle]);
  const handleTitleButtonPress = () => Alert.alert('Generate AI Title', `AI will generate a concise academic title for this subsection.\n\nCost: 1 credit`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Generate (1 cr)', onPress: onGenerateTitle }]);

  return (
    <View style={{ borderLeftWidth: 3, borderLeftColor: `${accentColor}60`, marginLeft: SPACING.sm, paddingLeft: SPACING.sm, marginTop: SPACING.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 }}>
        <View style={{ width: 20, height: 20, borderRadius: 6, backgroundColor: `${accentColor}20`, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: `${accentColor}40`, flexShrink: 0 }}>
          <Text style={{ color: accentColor, fontSize: 9, fontWeight: '800' }}>{number}</Text>
        </View>
        {editingTitle ? (
          <TextInput value={titleText} onChangeText={setTitleText} onBlur={() => { setEditingTitle(false); onEditTitle(titleText); }} autoFocus style={{ flex: 1, color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '700', borderBottomWidth: 1, borderBottomColor: accentColor, paddingBottom: 2 }} />
        ) : (
          <Pressable onPress={() => setEditingTitle(true)} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '700', flex: 1 }} numberOfLines={1}>{sub.title}</Text>
            <Ionicons name="pencil-outline" size={11} color={COLORS.textMuted} />
          </Pressable>
        )}
        <View style={{ flexDirection: 'row', gap: 3, alignItems: 'center' }}>
          <Pressable onPress={handleTitleButtonPress} disabled={isAIProcessing} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }} style={{ width: 24, height: 24, borderRadius: 6, backgroundColor: `${COLORS.info}15`, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: `${COLORS.info}30`, opacity: isAIProcessing ? 0.4 : 1 }}>
            <Text style={{ color: COLORS.info, fontSize: 8, fontWeight: '800' }}>T</Text>
          </Pressable>
          <Pressable onPress={onOpenAITools} disabled={isAIProcessing} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }} style={{ width: 24, height: 24, borderRadius: 6, backgroundColor: `${COLORS.primary}15`, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: `${COLORS.primary}30`, opacity: isAIProcessing ? 0.4 : 1 }}>
            <Ionicons name="sparkles" size={10} color={COLORS.primary} />
          </Pressable>
          {!isFirst && <Pressable onPress={onMoveUp} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}><Ionicons name="chevron-up" size={14} color={COLORS.textMuted} /></Pressable>}
          {!isLast  && <Pressable onPress={onMoveDown} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}><Ionicons name="chevron-down" size={14} color={COLORS.textMuted} /></Pressable>}
          <Pressable onPress={onDelete} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}><Ionicons name="trash-outline" size={13} color={COLORS.error} /></Pressable>
        </View>
      </View>
      <Pressable onPress={onEdit} style={{ backgroundColor: COLORS.backgroundElevated, borderRadius: RADIUS.lg, padding: SPACING.sm, borderWidth: 1, borderColor: COLORS.border }}>
        {sub.content ? <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, lineHeight: 18 }} numberOfLines={3}>{sub.content}</Text>
          : <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontStyle: 'italic' }}>Tap to write content…</Text>}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 }}>
          <Ionicons name="pencil-outline" size={11} color={accentColor} />
          <Text style={{ color: accentColor, fontSize: 10, fontWeight: '600' }}>Edit</Text>
          <Text style={{ color: COLORS.textMuted, fontSize: 10, marginLeft: 'auto' }}>{words} words</Text>
        </View>
      </Pressable>
    </View>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface PaperSectionEditorProps {
  section: AcademicSection; index: number; totalSections: number;
  isFirst: boolean; isLast: boolean;
  isAIProcessing: boolean; aiProcessingLabel: string;
  onUpdateContent:      (content: string) => void;
  onAddSubsection:      () => void;
  onAddSubsectionWithAI:(description?: string) => void;
  onUpdateSubsection:   (subId: string, field: 'title' | 'content', value: string) => void;
  onRemoveSubsection:   (subId: string) => void;
  onMoveSubUp:          (subId: string) => void;
  onMoveSubDown:        (subId: string) => void;
  onOpenAITools:        (subsectionId?: string) => void;
  onGenerateSubsectionTitle?: (subsectionId: string) => void;
  onAddSectionAfter:    (config: NewSectionConfig, position: SectionInsertPosition) => void;
  onAddSectionWithAI:   (config: NewSectionConfig, position: SectionInsertPosition) => void;
  onDeleteSection:      () => void;
  onMoveSectionUp:      () => void;
  onMoveSectionDown:    () => void;
  onRenameSection:      (title: string) => void;
}

// ─── Main component ───────────────────────────────────────────────────────────

export const PaperSectionEditor = memo(function PaperSectionEditor({
  section, index, totalSections, isFirst, isLast,
  isAIProcessing, aiProcessingLabel,
  onUpdateContent, onAddSubsection, onAddSubsectionWithAI,
  onUpdateSubsection, onRemoveSubsection, onMoveSubUp, onMoveSubDown,
  onOpenAITools, onGenerateSubsectionTitle,
  onAddSectionAfter, onAddSectionWithAI, onDeleteSection,
  onMoveSectionUp, onMoveSectionDown, onRenameSection,
}: PaperSectionEditorProps) {
  const [expanded,        setExpanded]        = useState(true);
  const [editorVisible,   setEditorVisible]   = useState(false);
  const [editingSub,      setEditingSub]       = useState<{ id: string } | null>(null);
  const [showAddSub,      setShowAddSub]       = useState(false);
  const [showAddSection,  setShowAddSection]   = useState(false);
  // FIX: rename uses a dedicated modal instead of inline TextInput
  const [showRenameModal, setShowRenameModal]  = useState(false);

  const accentColor = getSectionAccent(section.type);
  const icon        = getSectionIcon(section.type);
  const target      = SECTION_WORD_TARGETS[section.type] ?? SECTION_WORD_TARGETS['custom'] ?? { min: 300, max: 800 };
  const wordCount   = countWords(section.content) + (section.subsections ?? []).reduce((a, s) => a + countWords(s.content), 0);

  const isAbstract  = section.type === 'abstract';
  const isRefs      = section.type === 'references';
  const isProtected = isAbstract;

  const editingSubObj = editingSub ? (section.subsections ?? []).find(s => s.id === editingSub.id) : null;

  return (
    <Animated.View entering={FadeInDown.duration(350).delay(index * 50)}>
      <View style={{
        backgroundColor: COLORS.backgroundCard,
        borderRadius: RADIUS.xl, marginBottom: SPACING.sm,
        borderWidth: 1,
        borderColor: isAIProcessing ? `${accentColor}60` : COLORS.border,
        overflow: 'hidden',
        ...(isAIProcessing ? SHADOWS.small : {}),
      }}>

        {/* ══════════════════════════════════════════════════════════════════
            REDESIGNED HEADER — Two rows
            Row 1: icon | title (flex) | collapse chevron
            Row 2: action pills — AI ✦ | Rename | ↑ | ↓ | Delete
        ══════════════════════════════════════════════════════════════════ */}
        <Pressable
          onPress={() => setExpanded(e => !e)}
          style={{
            padding: SPACING.md,
            backgroundColor: isAIProcessing ? `${accentColor}08` : 'transparent',
          }}
        >
          {/* Row 1: Icon + Title + Chevron */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: 8 }}>
            {/* Gradient icon */}
            <LinearGradient
              colors={[accentColor, `${accentColor}99`] as [string, string]}
              style={{ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
            >
              {isAIProcessing
                ? <ActivityIndicator size="small" color="#FFF" />
                : <Ionicons name={icon as any} size={19} color="#FFF" />
              }
            </LinearGradient>

            {/* Title — gets all remaining space, never squeezed */}
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '800', lineHeight: 20 }}
                numberOfLines={2}
                ellipsizeMode="tail"
              >
                {getSectionDisplayLabel(section)}
              </Text>
              {/* Word count + subsection count below title */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3, flexWrap: 'wrap' }}>
                <WordCountBadge sectionType={section.type} wordCount={wordCount} compact />
                {(section.subsections?.length ?? 0) > 0 && (
                  <Text style={{ color: COLORS.textMuted, fontSize: 10 }}>
                    {section.subsections!.length} sub{section.subsections!.length !== 1 ? 's' : ''}
                  </Text>
                )}
                {isAIProcessing && (
                  <Text style={{ color: accentColor, fontSize: 10, fontWeight: '600' }} numberOfLines={1}>
                    {aiProcessingLabel}
                  </Text>
                )}
              </View>
            </View>

            {/* Collapse chevron — always rightmost, never competes with title */}
            <View style={{
              width: 32, height: 32, borderRadius: 9,
              backgroundColor: COLORS.backgroundElevated,
              alignItems: 'center', justifyContent: 'center',
              borderWidth: 1, borderColor: COLORS.border, flexShrink: 0,
            }}>
              <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={15} color={COLORS.textMuted} />
            </View>
          </View>

          {/* Row 2: Action pills — stopPropagation so they don't toggle collapse */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>

            {/* AI ✦ */}
            <Pressable
              onPress={e => { e.stopPropagation(); onOpenAITools(); }}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: RADIUS.full, backgroundColor: `${COLORS.primary}15`, borderWidth: 1, borderColor: `${COLORS.primary}30` }}
            >
              <Ionicons name="sparkles" size={12} color={COLORS.primary} />
              <Text style={{ color: COLORS.primary, fontSize: 11, fontWeight: '700' }}>AI ✦</Text>
            </Pressable>

            {/* Rename */}
            <Pressable
              onPress={e => { e.stopPropagation(); setShowRenameModal(true); }}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: RADIUS.full, backgroundColor: `${accentColor}12`, borderWidth: 1, borderColor: `${accentColor}30` }}
            >
              <Ionicons name="pencil-outline" size={12} color={accentColor} />
              <Text style={{ color: accentColor, fontSize: 11, fontWeight: '700' }}>Rename</Text>
            </Pressable>

            {/* Spacer push remaining buttons to the right */}
            <View style={{ flex: 1 }} />

            {/* Move up */}
            {!isFirst && (
              <Pressable
                onPress={e => { e.stopPropagation(); onMoveSectionUp(); }}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                style={{ width: 32, height: 32, borderRadius: 9, backgroundColor: COLORS.backgroundElevated, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border }}
              >
                <Ionicons name="arrow-up" size={14} color={COLORS.textMuted} />
              </Pressable>
            )}

            {/* Move down */}
            {!isLast && (
              <Pressable
                onPress={e => { e.stopPropagation(); onMoveSectionDown(); }}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                style={{ width: 32, height: 32, borderRadius: 9, backgroundColor: COLORS.backgroundElevated, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border }}
              >
                <Ionicons name="arrow-down" size={14} color={COLORS.textMuted} />
              </Pressable>
            )}

            {/* Delete / lock */}
            <Pressable
              onPress={e => { e.stopPropagation(); onDeleteSection(); }}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              style={{
                width: 32, height: 32, borderRadius: 9,
                backgroundColor: isProtected ? COLORS.backgroundElevated : `${COLORS.error}10`,
                alignItems: 'center', justifyContent: 'center',
                borderWidth: 1, borderColor: isProtected ? COLORS.border : `${COLORS.error}30`,
              }}
            >
              <Ionicons
                name={isProtected ? 'lock-closed-outline' : 'trash-outline'}
                size={13}
                color={isProtected ? COLORS.textMuted : COLORS.error}
              />
            </Pressable>
          </View>
        </Pressable>

        {/* ── Body ── */}
        {expanded && (
          <View style={{ paddingHorizontal: SPACING.md, paddingBottom: SPACING.md, borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: SPACING.md }}>
            {isAbstract ? (
              <Pressable onPress={() => setEditorVisible(true)} style={{ backgroundColor: `${accentColor}06`, borderRadius: RADIUS.lg, padding: SPACING.md, borderWidth: 1, borderColor: `${accentColor}25`, borderLeftWidth: 3, borderLeftColor: accentColor }}>
                {section.content ? <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, lineHeight: 22 }} numberOfLines={6}>{section.content}</Text>
                  : <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.sm, fontStyle: 'italic' }}>Tap to write the abstract (250–300 words)…</Text>}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8 }}>
                  <Ionicons name="pencil-outline" size={12} color={accentColor} />
                  <Text style={{ color: accentColor, fontSize: 10, fontWeight: '600' }}>Edit Abstract</Text>
                </View>
              </Pressable>
            ) : isRefs ? (
              <Pressable onPress={() => setEditorVisible(true)} style={{ backgroundColor: COLORS.backgroundElevated, borderRadius: RADIUS.lg, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border }}>
                {section.content ? <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, lineHeight: 20 }} numberOfLines={8}>{section.content}</Text>
                  : <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.sm, fontStyle: 'italic' }}>References appear here automatically when you add citations.</Text>}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8 }}>
                  <Ionicons name="pencil-outline" size={12} color={COLORS.primary} />
                  <Text style={{ color: COLORS.primary, fontSize: 10, fontWeight: '600' }}>Edit References</Text>
                </View>
              </Pressable>
            ) : (
              <>
                <Pressable onPress={() => setEditorVisible(true)} style={{ backgroundColor: COLORS.backgroundElevated, borderRadius: RADIUS.lg, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.sm }}>
                  {section.content ? <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, lineHeight: 20 }} numberOfLines={5}>{section.content}</Text>
                    : <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.sm, fontStyle: 'italic' }}>Tap to write main section content…</Text>}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8 }}>
                    <Ionicons name="pencil-outline" size={12} color={accentColor} />
                    <Text style={{ color: accentColor, fontSize: 10, fontWeight: '600' }}>Edit Main Content</Text>
                  </View>
                </Pressable>

                {(section.subsections ?? []).map((sub, si) => (
                  <SubsectionRow key={sub.id} sub={sub} number={si + 1}
                    isFirst={si === 0} isLast={si === (section.subsections!.length - 1)}
                    accentColor={accentColor} isAIProcessing={isAIProcessing}
                    onEdit={() => setEditingSub({ id: sub.id })}
                    onEditTitle={title => onUpdateSubsection(sub.id, 'title', title)}
                    onMoveUp={() => onMoveSubUp(sub.id)} onMoveDown={() => onMoveSubDown(sub.id)}
                    onDelete={() => onRemoveSubsection(sub.id)} onOpenAITools={() => onOpenAITools(sub.id)}
                    onGenerateTitle={() => onGenerateSubsectionTitle?.(sub.id)}
                  />
                ))}

                <TouchableOpacity onPress={() => setShowAddSub(true)} activeOpacity={0.75}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: SPACING.sm, paddingVertical: 9, paddingHorizontal: SPACING.md, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: `${accentColor}35`, borderStyle: 'dashed', backgroundColor: `${accentColor}06` }}>
                  <Ionicons name="add-circle-outline" size={16} color={accentColor} />
                  <Text style={{ color: accentColor, fontSize: FONTS.sizes.sm, fontWeight: '600' }}>Add Subsection</Text>
                  <View style={{ flex: 1 }} />
                  <View style={{ backgroundColor: `${COLORS.primary}15`, borderRadius: RADIUS.full, paddingHorizontal: 7, paddingVertical: 3, flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                    <Ionicons name="sparkles" size={9} color={COLORS.primary} />
                    <Text style={{ color: COLORS.primary, fontSize: 9, fontWeight: '700' }}>AI option</Text>
                  </View>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}
      </View>

      {/* Insert section button between sections */}
      <TouchableOpacity
        onPress={() => setShowAddSection(true)}
        activeOpacity={0.75}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 7, marginBottom: SPACING.sm, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: `${COLORS.primary}30`, borderStyle: 'dashed', backgroundColor: `${COLORS.primary}05` }}
      >
        <Ionicons name="add" size={14} color={COLORS.primary} />
        <Text style={{ color: COLORS.primary, fontSize: 11, fontWeight: '600' }}>Insert section here</Text>
        <View style={{ backgroundColor: `${COLORS.primary}15`, borderRadius: RADIUS.full, paddingHorizontal: 6, paddingVertical: 2, flexDirection: 'row', alignItems: 'center', gap: 2, marginLeft: 4 }}>
          <Ionicons name="sparkles" size={9} color={COLORS.primary} />
          <Text style={{ color: COLORS.primary, fontSize: 9, fontWeight: '700' }}>AI</Text>
        </View>
      </TouchableOpacity>

      {/* ── Modals ── */}

      <FullScreenEditor
        visible={editorVisible}
        title={getSectionDisplayLabel(section)}
        content={section.content}
        wordCount={countWords(section.content)}
        target={target}
        accentColor={accentColor}
        onSave={onUpdateContent}
        onClose={() => setEditorVisible(false)}
      />

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

      <AddSubsectionModal
        visible={showAddSub}
        accentColor={accentColor}
        isAIProcessing={isAIProcessing}
        onManual={() => { onAddSubsection(); setShowAddSub(false); }}
        onAI={description => { setShowAddSub(false); onAddSubsectionWithAI(description || undefined); }}
        onClose={() => setShowAddSub(false)}
      />

      <AddSectionModal
        visible={showAddSection}
        insertAfter={section.id}
        isAIProcessing={isAIProcessing}
        onManual={(config, position) => onAddSectionAfter(config, position)}
        onAI={(config, position) => onAddSectionWithAI(config, position)}
        onClose={() => setShowAddSection(false)}
      />

      {/* FIX: Dedicated rename modal — no blur-immediately issue */}
      <RenameSectionModal
        visible={showRenameModal}
        currentName={section.title}
        accentColor={accentColor}
        onConfirm={newTitle => onRenameSection(newTitle)}
        onClose={() => setShowRenameModal(false)}
      />
    </Animated.View>
  );
});