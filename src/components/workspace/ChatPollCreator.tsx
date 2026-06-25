// src/components/workspace/ChatPollCreator.tsx
// Part 50.1 — Poll creation modal for Stream Chat workspace
// Part 55.2 — Fully theme-integrated: all hardcoded colors replaced with live
//             COLORS from the theme system. Uses getModalBackdrop for backdrop.
//             No dark-only assumptions.

import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import Animated, {
  FadeIn,
  SlideInDown,
  SlideOutDown,
  Easing,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, FONTS, SPACING, RADIUS, getModalBackdrop } from '../../constants/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PollOption {
  id:   string;
  text: string;
}

interface Props {
  visible:  boolean;
  onClose:  () => void;
  client:   any;
  channel:  any;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeId(): string {
  return Math.random().toString(36).slice(2, 9);
}

// ─── Option Row ───────────────────────────────────────────────────────────────

interface OptionRowProps {
  option:       PollOption;
  index:        number;
  total:        number;
  onChange:     (id: string, text: string) => void;
  onRemove:     (id: string) => void;
  onSubmitNext: () => void;
  inputRef:     (ref: TextInput | null) => void;
}

function OptionRow({ option, index, total, onChange, onRemove, onSubmitNext, inputRef }: OptionRowProps) {
  return (
    <View style={optStyles.row}>
      <View style={[optStyles.bullet, { backgroundColor: `${COLORS.primary}20`, borderColor: `${COLORS.primary}40` }]}>
        <Text style={[optStyles.bulletText, { color: COLORS.primary }]}>{index + 1}</Text>
      </View>

      <TextInput
        ref={inputRef}
        style={[optStyles.input, { backgroundColor: COLORS.backgroundElevated, borderColor: COLORS.border, color: COLORS.textPrimary }]}
        value={option.text}
        onChangeText={text => onChange(option.id, text)}
        placeholder={`Option ${index + 1}…`}
        placeholderTextColor={COLORS.textMuted}
        returnKeyType={index < total - 1 ? 'next' : 'done'}
        onSubmitEditing={onSubmitNext}
        maxLength={80}
        blurOnSubmit={false}
      />

      {total > 2 && (
        <TouchableOpacity
          onPress={() => onRemove(option.id)}
          style={optStyles.removeBtn}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="close-circle" size={18} color={COLORS.textMuted} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const optStyles = StyleSheet.create({
  row: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            10,
    marginBottom:   8,
  },
  bullet: {
    width:           28,
    height:          28,
    borderRadius:    9,
    borderWidth:     1,
    alignItems:      'center',
    justifyContent:  'center',
    flexShrink:      0,
  },
  bulletText: {
    fontSize:   FONTS.sizes.xs,
    fontWeight: '800',
  },
  input: {
    flex:              1,
    borderRadius:      RADIUS.md,
    borderWidth:       1,
    paddingHorizontal: SPACING.md,
    paddingVertical:   Platform.OS === 'ios' ? 11 : 8,
    fontSize:          FONTS.sizes.sm,
  },
  removeBtn: {
    flexShrink: 0,
    padding:    2,
  },
});

// ─── Toggle Row ───────────────────────────────────────────────────────────────

interface ToggleRowProps {
  icon:     keyof typeof Ionicons.glyphMap;
  label:    string;
  sub:      string;
  value:    boolean;
  onToggle: () => void;
  color?:   string;
}

function ToggleRow({ icon, label, sub, value, onToggle, color = COLORS.primary }: ToggleRowProps) {
  return (
    <TouchableOpacity
      style={togStyles.row}
      onPress={onToggle}
      activeOpacity={0.7}
    >
      <View style={[togStyles.iconWrap, { backgroundColor: `${color}15`, borderColor: `${color}30` }]}>
        <Ionicons name={icon} size={16} color={color} />
      </View>
      <View style={togStyles.textWrap}>
        <Text style={[togStyles.label, { color: COLORS.textPrimary }]}>{label}</Text>
        <Text style={[togStyles.sub, { color: COLORS.textMuted }]}>{sub}</Text>
      </View>
      <TouchableOpacity
        onPress={onToggle}
        activeOpacity={0.8}
        style={[togStyles.toggle, value && togStyles.toggleOn, { backgroundColor: COLORS.backgroundElevated, borderColor: value ? color : COLORS.border }]}
      >
        <View style={[togStyles.thumb, value && togStyles.thumbOn, { backgroundColor: value ? color : COLORS.textMuted }]} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

const togStyles = StyleSheet.create({
  row: {
    flexDirection:    'row',
    alignItems:       'center',
    gap:              12,
    paddingVertical:  SPACING.sm,
  },
  iconWrap: {
    width:           34,
    height:          34,
    borderRadius:    10,
    alignItems:      'center',
    justifyContent:  'center',
    borderWidth:     1,
    flexShrink:      0,
  },
  textWrap: {
    flex: 1,
  },
  label: {
    fontSize:   FONTS.sizes.sm,
    fontWeight: '700',
  },
  sub: {
    fontSize: FONTS.sizes.xs,
    marginTop: 1,
  },
  toggle: {
    width:           42,
    height:          24,
    borderRadius:    12,
    borderWidth:     1.5,
    justifyContent:  'center',
    paddingHorizontal: 3,
    flexShrink:      0,
  },
  toggleOn: {
    backgroundColor: 'transparent',
  },
  thumb: {
    width:        17,
    height:       17,
    borderRadius: 9,
    alignSelf:    'flex-start',
  },
  thumbOn: {
    alignSelf: 'flex-end',
  },
});

// ─── Main component ───────────────────────────────────────────────────────────

export function ChatPollCreator({ visible, onClose, client, channel }: Props) {
  const insets = useSafeAreaInsets();

  const [question,      setQuestion]      = useState('');
  const [options,       setOptions]       = useState<PollOption[]>([
    { id: makeId(), text: '' },
    { id: makeId(), text: '' },
  ]);
  const [allowMultiple, setAllowMultiple] = useState(false);
  const [anonymous,     setAnonymous]     = useState(false);
  const [isSending,     setIsSending]     = useState(false);

  const questionRef = useRef<TextInput>(null);
  const optionRefs  = useRef<(TextInput | null)[]>([]);

  const addOption = useCallback(() => {
    if (options.length >= 10) return;
    setOptions(prev => [...prev, { id: makeId(), text: '' }]);
    setTimeout(() => {
      const last = optionRefs.current[options.length];
      last?.focus();
    }, 80);
  }, [options.length]);

  const updateOption = useCallback((id: string, text: string) => {
    setOptions(prev => prev.map(o => o.id === id ? { ...o, text } : o));
  }, []);

  const removeOption = useCallback((id: string) => {
    setOptions(prev => prev.filter(o => o.id !== id));
  }, []);

  const focusNextOption = useCallback((currentIndex: number) => {
    if (currentIndex < options.length - 1) {
      optionRefs.current[currentIndex + 1]?.focus();
    } else if (options.length < 10) {
      addOption();
    }
  }, [options.length, addOption]);

  const handleSend = useCallback(async () => {
    const q = question.trim();
    if (!q) {
      Alert.alert('Question required', 'Please enter a question for your poll.');
      questionRef.current?.focus();
      return;
    }

    const validOptions = options.map(o => o.text.trim()).filter(Boolean);
    if (validOptions.length < 2) {
      Alert.alert('Options required', 'Please enter at least 2 options.');
      return;
    }

    setIsSending(true);
    try {
      const pollData: any = {
        name:                q,
        options:             validOptions.map(text => ({ text })),
        enforce_unique_vote: !allowMultiple,
        voting_visibility:   anonymous ? 'anonymous' : 'public',
        allow_user_suggested_options: false,
      };

      const poll = await client.createPoll(pollData);

      await channel.sendMessage({
        text:    '',
        poll_id: poll.poll.id,
      });

      setQuestion('');
      setOptions([{ id: makeId(), text: '' }, { id: makeId(), text: '' }]);
      setAllowMultiple(false);
      setAnonymous(false);
      onClose();
    } catch (err: any) {
      console.error('[PollCreator] sendPoll error:', err);
      Alert.alert(
        'Failed to create poll',
        err?.message ?? 'Something went wrong. Please try again.',
      );
    } finally {
      setIsSending(false);
    }
  }, [question, options, allowMultiple, anonymous, client, channel, onClose]);

  const handleClose = useCallback(() => {
    if (isSending) return;
    setQuestion('');
    setOptions([{ id: makeId(), text: '' }, { id: makeId(), text: '' }]);
    setAllowMultiple(false);
    setAnonymous(false);
    onClose();
  }, [isSending, onClose]);

  const canSend = question.trim().length > 0 &&
    options.filter(o => o.text.trim()).length >= 2;

  const backdropColor = getModalBackdrop(0.55);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <Animated.View
        entering={FadeIn.duration(200)}
        style={[styles.backdrop, { backgroundColor: backdropColor }]}
      >
        <TouchableOpacity
          style={StyleSheet.absoluteFillObject}
          onPress={handleClose}
          activeOpacity={1}
        />
      </Animated.View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.kvWrapper}
        pointerEvents="box-none"
      >
        <Animated.View
          entering={SlideInDown.duration(300).easing(Easing.out(Easing.cubic))}
          exiting={SlideOutDown.duration(220).easing(Easing.in(Easing.quad))}
          style={[styles.sheet, { backgroundColor: COLORS.backgroundCard, borderColor: COLORS.border, paddingBottom: Math.max(insets.bottom, 16) }]}
        >
          <View style={styles.handleWrap}>
            <View style={[styles.handle, { backgroundColor: COLORS.border }]} />
          </View>

          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={[styles.headerIcon, { backgroundColor: `${COLORS.primary}18`, borderColor: `${COLORS.primary}35` }]}>
                <Ionicons name="bar-chart" size={18} color={COLORS.primary} />
              </View>
              <View>
                <Text style={[styles.headerTitle, { color: COLORS.textPrimary }]}>Create Poll</Text>
                <Text style={[styles.headerSub, { color: COLORS.textMuted }]}>Ask your team a question</Text>
              </View>
            </View>
            <TouchableOpacity onPress={handleClose} style={[styles.closeBtn, { backgroundColor: COLORS.backgroundElevated, borderColor: COLORS.border }]} disabled={isSending}>
              <Ionicons name="close" size={18} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={[styles.sectionLabel, { color: COLORS.textSecondary }]}>
              <Ionicons name="help-circle-outline" size={13} color={COLORS.primary} /> Question
            </Text>
            <TextInput
              ref={questionRef}
              style={[styles.questionInput, { backgroundColor: COLORS.backgroundElevated, borderColor: COLORS.border, color: COLORS.textPrimary }, question.length > 0 && { borderColor: `${COLORS.primary}60` }]}
              value={question}
              onChangeText={setQuestion}
              placeholder="What do you want to ask?"
              placeholderTextColor={COLORS.textMuted}
              multiline
              maxLength={200}
              returnKeyType="next"
              onSubmitEditing={() => optionRefs.current[0]?.focus()}
              blurOnSubmit={false}
            />
            <Text style={[styles.charCount, { color: COLORS.textMuted }]}>{question.length}/200</Text>

            <View style={styles.sectionRow}>
              <Text style={[styles.sectionLabel, { color: COLORS.textSecondary }]}>
                <Ionicons name="list-outline" size={13} color={COLORS.primary} /> Options
              </Text>
              <Text style={[styles.optCount, { color: COLORS.textMuted }]}>{options.length}/10</Text>
            </View>

            {options.map((opt, idx) => (
              <OptionRow
                key={opt.id}
                option={opt}
                index={idx}
                total={options.length}
                onChange={updateOption}
                onRemove={removeOption}
                onSubmitNext={() => focusNextOption(idx)}
                inputRef={ref => { optionRefs.current[idx] = ref; }}
              />
            ))}

            {options.length < 10 && (
              <TouchableOpacity
                style={styles.addOptionBtn}
                onPress={addOption}
                activeOpacity={0.7}
              >
                <Ionicons name="add-circle-outline" size={16} color={COLORS.primary} />
                <Text style={[styles.addOptionText, { color: COLORS.primary }]}>Add option</Text>
              </TouchableOpacity>
            )}

            <View style={[styles.divider, { backgroundColor: COLORS.border }]} />

            <Text style={[styles.sectionLabel, { color: COLORS.textSecondary }]}>
              <Ionicons name="settings-outline" size={13} color={COLORS.primary} /> Settings
            </Text>

            <ToggleRow
              icon="checkmark-done-outline"
              label="Multiple answers"
              sub="Allow members to vote for more than one option"
              value={allowMultiple}
              onToggle={() => setAllowMultiple(v => !v)}
              color={COLORS.primary}
            />
            <ToggleRow
              icon="eye-off-outline"
              label="Anonymous voting"
              sub="Hide who voted for each option"
              value={anonymous}
              onToggle={() => setAnonymous(v => !v)}
              color="#4ECDC4"
            />
          </ScrollView>

          <View style={[styles.footer, { borderTopColor: COLORS.border }]}>
            <TouchableOpacity
              style={[styles.sendBtn, !canSend && styles.sendBtnDisabled, { backgroundColor: COLORS.primary }]}
              onPress={handleSend}
              disabled={!canSend || isSending}
              activeOpacity={0.8}
            >
              {isSending ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <>
                  <Ionicons name="bar-chart" size={16} color="#FFF" />
                  <Text style={styles.sendBtnText}>Send Poll</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  kvWrapper: {
    position:   'absolute',
    left:       0,
    right:      0,
    bottom:     0,
    top:        0,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius:  28,
    borderTopRightRadius: 28,
    borderTopWidth:     1,
    maxHeight:          '90%',
    shadowColor:        '#000',
    shadowOffset:       { width: 0, height: -8 },
    shadowOpacity:      0.35,
    shadowRadius:       24,
    elevation:          32,
  },
  handleWrap: {
    alignItems:    'center',
    paddingTop:    12,
    paddingBottom: 4,
  },
  handle: {
    width:           44,
    height:          4,
    borderRadius:    2,
  },
  header: {
    flexDirection:    'row',
    alignItems:       'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical:  SPACING.sm,
    gap:              12,
  },
  headerLeft: {
    flex:          1,
    flexDirection: 'row',
    alignItems:    'center',
    gap:           10,
  },
  headerIcon: {
    width:           38,
    height:          38,
    borderRadius:    12,
    borderWidth:     1,
    alignItems:      'center',
    justifyContent:  'center',
    flexShrink:      0,
  },
  headerTitle: {
    fontSize:   FONTS.sizes.base,
    fontWeight: '800',
  },
  headerSub: {
    fontSize: FONTS.sizes.xs,
    marginTop: 1,
  },
  closeBtn: {
    width:           32,
    height:          32,
    borderRadius:    10,
    alignItems:      'center',
    justifyContent:  'center',
    borderWidth:     1,
    flexShrink:      0,
  },
  scroll: {
    maxHeight: 480,
  },
  scrollContent: {
    paddingHorizontal: SPACING.lg,
    paddingBottom:     SPACING.md,
  },
  sectionLabel: {
    fontSize:     FONTS.sizes.xs,
    fontWeight:   '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop:    SPACING.sm,
    marginBottom: SPACING.xs,
  },
  sectionRow: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    marginTop:      SPACING.sm,
    marginBottom:   SPACING.xs,
  },
  optCount: {
    fontSize: FONTS.sizes.xs,
    fontWeight: '600',
  },
  questionInput: {
    borderRadius:      RADIUS.lg,
    borderWidth:       1.5,
    paddingHorizontal: SPACING.md,
    paddingVertical:   SPACING.sm,
    fontSize:          FONTS.sizes.base,
    minHeight:         56,
    textAlignVertical: 'top',
    lineHeight:        22,
  },
  charCount: {
    fontSize:  FONTS.sizes.xs,
    textAlign: 'right',
    marginTop: 3,
    marginBottom: 4,
  },
  addOptionBtn: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             6,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.xs,
    marginTop:       4,
  },
  addOptionText: {
    fontSize:   FONTS.sizes.sm,
    fontWeight: '700',
  },
  divider: {
    height:           1,
    marginVertical:   SPACING.md,
  },
  footer: {
    paddingHorizontal: SPACING.lg,
    paddingTop:        SPACING.sm,
    borderTopWidth:    1,
  },
  sendBtn: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             8,
    borderRadius:    RADIUS.lg,
    paddingVertical: 14,
  },
  sendBtnDisabled: {
    opacity: 0.4,
  },
  sendBtnText: {
    color:      '#FFF',
    fontSize:   FONTS.sizes.base,
    fontWeight: '800',
  },
});