// src/components/knowledgeBase/KBInputRow.tsx
// Part 43 — REDESIGNED: matches research-input.tsx aesthetic.
// No floating animations. All logic/exports unchanged.
//
// ── ANDROID UI FIX (production) ───────────────────────────────────────────────
//   The input container now accepts a `bottomInset` prop. On Android (SDK 54
//   edge-to-edge), the bottom message box was rendering BEHIND the navigation /
//   gesture bar. We add `bottomInset` to the container's bottom padding so the
//   resting input always clears the system nav bar. When the keyboard opens the
//   parent KeyboardAvoidingView lifts the whole bar above the keyboard, and the
//   extra inset is harmless (it just becomes a small gap, consistent with the OS).
//
// ── Part 55.1 — THEME SYSTEM ──────────────────────────────────────────────────
//   • typingStyles + styles were module-level StyleSheet.create (frozen palette).
//     Both are now makeTypingStyles() / makeStyles() factories read at render.
//   • The hardcoded avatar gradient ['#7C3AED','#6C63FF'] → kbBrandGradient().
//   • The send-button gradients ['#6C63FF','#8B5CF6'] (active) and
//     ['#2A2A4A','#1A1A35'] (disabled) → COLORS.gradientPrimary / a theme-derived
//     muted tuple (kbMutedGradient) so the disabled state is correct on light
//     themes too.
//   • Both exported components (KBTypingIndicator, KBInputRow) subscribe to
//     useTheme().

import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet,
  Animated as RNAnimated, ActivityIndicator, Alert, Vibration,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons }       from '@expo/vector-icons';
import {
  startRecording, stopRecording, cancelRecording,
  transcribeAudio, formatDuration,
} from '../../services/voiceResearch';
import { useTheme }       from '../../context/ThemeContext';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';
import { kbBrandGradient } from './kbTheme';

const PLACEHOLDERS = [
  'What have I researched about AI?',
  'Compare findings across my reports…',
  'What statistics did I find about markets?',
  'Summarize my research on climate tech…',
  'What predictions appear in my reports?',
  'Find contradictions across my research…',
];

// Part 55.1: a theme-derived "muted" gradient for disabled send buttons. Uses the
// theme's dark/surface gradient so it reads correctly on both dark and light.
function kbMutedGradient(): readonly [string, string] {
  return COLORS.gradientDark;
}

// ─── Typing Indicator ─────────────────────────────────────────────────────────
export function KBTypingIndicator() {
  // Part 55.1: subscribe so the indicator recolours on a theme switch.
  useTheme();
  const typingStyles = makeTypingStyles();
  const brand        = kbBrandGradient();

  const dots = [
    useRef(new RNAnimated.Value(0)).current,
    useRef(new RNAnimated.Value(0)).current,
    useRef(new RNAnimated.Value(0)).current,
  ];
  useEffect(() => {
    const anims = dots.map((dot, i) =>
      RNAnimated.loop(RNAnimated.sequence([
        RNAnimated.delay(i * 160),
        RNAnimated.timing(dot, { toValue: 1, duration: 380, useNativeDriver: true }),
        RNAnimated.timing(dot, { toValue: 0, duration: 380, useNativeDriver: true }),
      ])),
    );
    anims.forEach(a => a.start());
    return () => anims.forEach(a => a.stop());
  }, []);

  return (
    <View style={typingStyles.wrap}>
      <LinearGradient colors={brand as [string, string]} style={typingStyles.avatar}>
        <Ionicons name="library-outline" size={11} color="#FFF" />
      </LinearGradient>
      <View style={typingStyles.content}>
        <Text style={typingStyles.label}>Knowledge Base AI</Text>
        <View style={typingStyles.bubble}>
          <Text style={typingStyles.searchingText}>Searching your reports</Text>
          {dots.map((dot, i) => (
            <RNAnimated.View
              key={i}
              style={[typingStyles.dot, {
                opacity: dot,
                transform: [{ translateY: dot.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) }],
              }]}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

function makeTypingStyles() {
  return StyleSheet.create({
    wrap:    { flexDirection: 'row', alignItems: 'flex-end', gap: 10, marginBottom: SPACING.sm },
    avatar:  { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    content: { gap: 4 },
    label:   { color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600' },
    bubble:  {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      backgroundColor: COLORS.backgroundCard,
      borderRadius: RADIUS.lg, borderBottomLeftRadius: 4,
      paddingHorizontal: SPACING.sm, paddingVertical: 10,
      borderWidth: 1, borderColor: `${COLORS.primary}18`,
    },
    searchingText: { color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontStyle: 'italic' },
    dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.primary },
  });
}

// ─── Input Row ─────────────────────────────────────────────────────────────────
interface InputRowProps {
  value: string; onChange: (text: string) => void; onSend: () => void;
  onFocus?: () => void; isSending: boolean; disabled: boolean;
  indexedCount: number; inputRef?: React.RefObject<TextInput | null>;
  /** Android nav-bar safe-area inset, added to the container's bottom padding. */
  bottomInset?: number;
}

export function KBInputRow({
  value, onChange, onSend, onFocus,
  isSending, disabled, indexedCount, inputRef,
  bottomInset = 0,
}: InputRowProps) {
  // Part 55.1: subscribe so the input bar recolours on a theme switch.
  useTheme();
  const styles = makeStyles();
  const brand  = kbBrandGradient();
  const muted  = kbMutedGradient();

  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  const placeholderAnim = useRef(new RNAnimated.Value(1)).current;

  useEffect(() => {
    const interval = setInterval(() => {
      RNAnimated.timing(placeholderAnim, { toValue: 0, duration: 280, useNativeDriver: true }).start(() => {
        setPlaceholderIdx(i => (i + 1) % PLACEHOLDERS.length);
        RNAnimated.timing(placeholderAnim, { toValue: 1, duration: 280, useNativeDriver: true }).start();
      });
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const [isRecording,    setIsRecording]    = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recordingMs,    setRecordingMs]    = useState(0);

  const pulseAnim = useRef(new RNAnimated.Value(1)).current;
  useEffect(() => {
    if (isRecording) {
      const pulse = RNAnimated.loop(RNAnimated.sequence([
        RNAnimated.timing(pulseAnim, { toValue: 1.35, duration: 550, useNativeDriver: true }),
        RNAnimated.timing(pulseAnim, { toValue: 1.0,  duration: 550, useNativeDriver: true }),
      ]));
      pulse.start();
      return () => pulse.stop();
    } else { pulseAnim.setValue(1); }
  }, [isRecording]);

  const handleMicPress = useCallback(async () => {
    if (isTranscribing) return;
    if (isRecording) {
      setIsRecording(false); setRecordingMs(0); setIsTranscribing(true);
      try {
        const uri = await stopRecording();
        if (uri) { const text = await transcribeAudio(uri); if (text) { onChange(text); Vibration.vibrate(40); } }
      } catch { Alert.alert('Transcription Failed', 'Could not transcribe audio. Please type instead.'); }
      finally { setIsTranscribing(false); }
    } else {
      const started = await startRecording(ms => setRecordingMs(ms));
      if (started) { setIsRecording(true); Vibration.vibrate(40); }
      else Alert.alert('Microphone Access', 'Please grant microphone permission to use voice input.');
    }
  }, [isRecording, isTranscribing, onChange]);

  const handleCancelRecording = useCallback(() => {
    cancelRecording(); setIsRecording(false); setRecordingMs(0);
  }, []);

  const canSend   = value.trim().length > 0 && !isSending && !disabled && !isRecording;
  const inputBusy = isSending || isRecording || isTranscribing;

  return (
    // FIX: add bottomInset to the container's bottom padding so the bar clears the
    // Android navigation / gesture bar in edge-to-edge mode.
    <View style={[styles.container, { paddingBottom: SPACING.sm + bottomInset }]}>
      {/* Recording banner */}
      {isRecording && (
        <View style={styles.recordingBanner}>
          <View style={styles.recordingLeft}>
            <RNAnimated.View style={[styles.recordingDot, { transform: [{ scale: pulseAnim }] }]} />
            <Text style={styles.recordingText}>Recording  {formatDuration(recordingMs)}</Text>
          </View>
          <Pressable onPress={handleCancelRecording} style={styles.cancelBtn} hitSlop={8}>
            <Ionicons name="close-circle" size={15} color={COLORS.error} />
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </View>
      )}

      {/* Transcribing banner */}
      {isTranscribing && (
        <View style={styles.transcribingBanner}>
          <ActivityIndicator size="small" color={COLORS.primary} />
          <Text style={styles.transcribingText}>Transcribing audio…</Text>
        </View>
      )}

      {/* KB status pill */}
      {!isRecording && !isTranscribing && indexedCount > 0 && (
        <View style={styles.statusPill}>
          <View style={styles.statusDot} />
          <Text style={styles.statusText}>{indexedCount} report{indexedCount !== 1 ? 's' : ''} indexed</Text>
        </View>
      )}

      {/* Input row */}
      <View style={styles.row}>
        {/* Library icon */}
        <View style={styles.libIconOrb}>
          <Ionicons name="library-outline" size={15} color={COLORS.primary} />
        </View>

        <TextInput
          ref={inputRef} value={value} onChangeText={onChange}
          placeholder={isRecording ? 'Listening…' : isTranscribing ? 'Transcribing…' : PLACEHOLDERS[placeholderIdx]}
          placeholderTextColor={isRecording ? COLORS.error : isTranscribing ? COLORS.primary : COLORS.textMuted}
          style={[styles.input, isRecording && styles.inputRecording, isTranscribing && styles.inputTranscribing]}
          onSubmitEditing={onSend} returnKeyType="send" blurOnSubmit={false}
          multiline={false} editable={!inputBusy && !disabled} onFocus={onFocus}
        />

        {/* Mic */}
        <Pressable
          onPress={handleMicPress} disabled={disabled || isSending} hitSlop={6}
          style={({ pressed }) => [
            styles.micBtn,
            isRecording    && styles.micBtnRecording,
            isTranscribing && styles.micBtnTranscribing,
            (disabled || isSending) && { opacity: 0.35 },
            pressed && { opacity: 0.72 },
          ]}
        >
          {isTranscribing
            ? <ActivityIndicator size="small" color={COLORS.primary} />
            : isRecording
              ? <Ionicons name="stop" size={15} color="#FFF" />
              : <Ionicons name="mic-outline" size={16} color={COLORS.primary} />
          }
        </Pressable>

        {/* Send */}
        <Pressable onPress={onSend} disabled={!canSend} style={{ opacity: canSend ? 1 : 0.38 }}>
          <LinearGradient
            colors={(canSend ? brand : muted) as [string, string]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={styles.sendBtn}
          >
            {isSending
              ? <ActivityIndicator size="small" color="#FFF" />
              : <Ionicons name="arrow-up" size={16} color="#FFF" />
            }
          </LinearGradient>
        </Pressable>
      </View>

      {/* Hint */}
      {!isRecording && !isTranscribing && (
        <Text style={styles.hint}>
          🎙 Tap mic to speak  ·  Semantic AI across {indexedCount} report{indexedCount !== 1 ? 's' : ''}
        </Text>
      )}
    </View>
  );
}

// Part 55.1: factory reads the LIVE COLORS each render → theme-aware.
function makeStyles() {
  return StyleSheet.create({
    container: { paddingHorizontal: SPACING.md, paddingTop: SPACING.sm, paddingBottom: SPACING.sm, borderTopWidth: 1, borderTopColor: `${COLORS.primary}15`, backgroundColor: COLORS.backgroundCard, gap: 6 },
    recordingBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.sm, paddingVertical: 7, backgroundColor: `${COLORS.error}08`, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: `${COLORS.error}22` },
    recordingLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    recordingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.error },
    recordingText: { color: COLORS.error, fontSize: FONTS.sizes.sm, fontWeight: '600' },
    cancelBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: RADIUS.full, backgroundColor: `${COLORS.error}12` },
    cancelText: { color: COLORS.error, fontSize: FONTS.sizes.xs, fontWeight: '600' },
    transcribingBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: SPACING.sm, paddingVertical: 7, backgroundColor: `${COLORS.primary}08`, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: `${COLORS.primary}18` },
    transcribingText: { color: COLORS.primary, fontSize: FONTS.sizes.sm, fontStyle: 'italic' },
    statusPill: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', paddingHorizontal: 9, paddingVertical: 3, borderRadius: RADIUS.full, backgroundColor: `${COLORS.accent}08`, borderWidth: 1, borderColor: `${COLORS.accent}18` },
    statusDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: COLORS.accent },
    statusText: { color: COLORS.accent, fontSize: 9, fontWeight: '700' },
    row: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
    libIconOrb: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: `${COLORS.primary}10`, borderWidth: 1, borderColor: `${COLORS.primary}22`, flexShrink: 0 },
    input: { flex: 1, backgroundColor: COLORS.backgroundElevated, borderRadius: RADIUS.full, paddingHorizontal: SPACING.md, paddingVertical: 10, color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, borderWidth: 1, borderColor: `${COLORS.primary}15` },
    inputRecording: { borderColor: `${COLORS.error}45`, backgroundColor: `${COLORS.error}06` },
    inputTranscribing: { borderColor: `${COLORS.primary}45`, backgroundColor: `${COLORS.primary}06` },
    micBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: `${COLORS.primary}10`, borderWidth: 1, borderColor: `${COLORS.primary}22`, flexShrink: 0 },
    micBtnRecording: { backgroundColor: COLORS.error, borderColor: COLORS.error },
    micBtnTranscribing: { backgroundColor: `${COLORS.primary}12`, borderColor: `${COLORS.primary}35` },
    sendBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    hint: { color: COLORS.textMuted, fontSize: 9, textAlign: 'center', lineHeight: 13 },
  });
}