// src/components/knowledgeBase/KBInputRow.tsx
// Part 26 — Personal AI Knowledge Base
//
// The bottom input bar for the KB chat screen.
// Includes:
//   • Text input with placeholder cycling through example queries
//   • Mic button — tap to record, tap again to stop & transcribe via Whisper
//   • Recording banner (red pulsing dot + duration + cancel)
//   • Transcribing state (spinner in mic button)
//   • Send button (disabled while sending or empty)
//   • Typing indicator (animated dots in a bubble)
//   • "KB Active" pill showing indexed report count
//
// Both KBTypingIndicator and KBInputRow are exported from this file.

import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet,
  Animated as RNAnimated, ActivityIndicator, Alert, Vibration,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons }       from '@expo/vector-icons';
import {
  startRecording,
  stopRecording,
  cancelRecording,
  transcribeAudio,
  formatDuration,
} from '../../services/voiceResearch';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';

// ─── Placeholder cycling ──────────────────────────────────────────────────────

const PLACEHOLDERS = [
  'What have I researched about AI?',
  'Compare findings across my reports…',
  'What statistics did I find about markets?',
  'Summarize my research on climate tech…',
  'What predictions appear in my reports?',
  'Find contradictions across my research…',
];

// ─── Typing Indicator ─────────────────────────────────────────────────────────

export function KBTypingIndicator() {
  const dots = [
    useRef(new RNAnimated.Value(0)).current,
    useRef(new RNAnimated.Value(0)).current,
    useRef(new RNAnimated.Value(0)).current,
  ];

  useEffect(() => {
    const animations = dots.map((dot, i) =>
      RNAnimated.loop(
        RNAnimated.sequence([
          RNAnimated.delay(i * 160),
          RNAnimated.timing(dot, { toValue: 1, duration: 380, useNativeDriver: true }),
          RNAnimated.timing(dot, { toValue: 0, duration: 380, useNativeDriver: true }),
        ]),
      ),
    );
    animations.forEach(a => a.start());
    return () => animations.forEach(a => a.stop());
  }, []);

  return (
    <View style={typingStyles.wrap}>
      <LinearGradient colors={COLORS.gradientPrimary} style={typingStyles.avatar}>
        <Ionicons name="library-outline" size={11} color="#FFF" />
      </LinearGradient>
      <View style={typingStyles.labelWrap}>
        <Text style={typingStyles.label}>Knowledge Base AI</Text>
        <View style={typingStyles.bubble}>
          <Text style={typingStyles.searchingText}>Searching your reports</Text>
          {dots.map((dot, i) => (
            <RNAnimated.View
              key={i}
              style={[
                typingStyles.dot,
                {
                  opacity: dot,
                  transform: [{
                    translateY: dot.interpolate({ inputRange: [0, 1], outputRange: [0, -5] }),
                  }],
                },
              ]}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

const typingStyles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems:    'flex-end',
    gap:            10,
    marginBottom:  SPACING.sm,
  },
  avatar: {
    width: 28, height: 28, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  labelWrap: { gap: 4 },
  label: { color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600' },
  bubble: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: COLORS.backgroundElevated,
    borderRadius: RADIUS.lg, borderBottomLeftRadius: 4,
    paddingHorizontal: SPACING.sm, paddingVertical: 10,
    borderWidth: 1, borderColor: COLORS.border,
  },
  searchingText: { color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontStyle: 'italic' },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.primary },
});

// ─── Input Row ────────────────────────────────────────────────────────────────

interface InputRowProps {
  value:        string;
  onChange:     (text: string) => void;
  onSend:       () => void;
  onFocus?:     () => void;
  isSending:    boolean;
  disabled:     boolean;
  indexedCount: number;
  inputRef?:    React.RefObject<TextInput | null>;
}

export function KBInputRow({
  value,
  onChange,
  onSend,
  onFocus,
  isSending,
  disabled,
  indexedCount,
  inputRef,
}: InputRowProps) {
  // ── Placeholder cycling ──────────────────────────────────────────────────
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  const placeholderAnim = useRef(new RNAnimated.Value(1)).current;

  useEffect(() => {
    const interval = setInterval(() => {
      RNAnimated.timing(placeholderAnim, { toValue: 0, duration: 300, useNativeDriver: true })
        .start(() => {
          setPlaceholderIdx(i => (i + 1) % PLACEHOLDERS.length);
          RNAnimated.timing(placeholderAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
        });
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  // ── Voice state ──────────────────────────────────────────────────────────
  const [isRecording,   setIsRecording]   = useState(false);
  const [isTranscribing,setIsTranscribing]= useState(false);
  const [recordingMs,   setRecordingMs]   = useState(0);

  // Pulsing animation for the recording dot
  const pulseAnim = useRef(new RNAnimated.Value(1)).current;

  useEffect(() => {
    if (isRecording) {
      const pulse = RNAnimated.loop(
        RNAnimated.sequence([
          RNAnimated.timing(pulseAnim, { toValue: 1.35, duration: 550, useNativeDriver: true }),
          RNAnimated.timing(pulseAnim, { toValue: 1.0,  duration: 550, useNativeDriver: true }),
        ]),
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isRecording]);

  const handleMicPress = useCallback(async () => {
    if (isTranscribing) return;

    if (isRecording) {
      // ── Stop and transcribe ────────────────────────────────────────────
      setIsRecording(false);
      setRecordingMs(0);
      setIsTranscribing(true);
      try {
        const uri = await stopRecording();
        if (uri) {
          const text = await transcribeAudio(uri);
          if (text) {
            onChange(text);
            Vibration.vibrate(40);
          }
        }
      } catch {
        Alert.alert(
          'Transcription Failed',
          'Could not transcribe audio. Please type your query instead.',
        );
      } finally {
        setIsTranscribing(false);
      }
    } else {
      // ── Start recording ────────────────────────────────────────────────
      const started = await startRecording(ms => setRecordingMs(ms));
      if (started) {
        setIsRecording(true);
        Vibration.vibrate(40);
      } else {
        Alert.alert(
          'Microphone Access',
          'Please grant microphone permission to use voice input.',
        );
      }
    }
  }, [isRecording, isTranscribing, onChange]);

  const handleCancelRecording = useCallback(() => {
    cancelRecording();
    setIsRecording(false);
    setRecordingMs(0);
  }, []);

  // ── Derived ───────────────────────────────────────────────────────────────
  const canSend    = value.trim().length > 0 && !isSending && !disabled && !isRecording;
  const inputBusy  = isSending || isRecording || isTranscribing;

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <View style={inputStyles.container}>

      {/* ── Recording banner ──────────────────────────────────────────────── */}
      {isRecording && (
        <View style={inputStyles.recordingBanner}>
          <View style={inputStyles.recordingLeft}>
            <RNAnimated.View
              style={[
                inputStyles.recordingDot,
                { transform: [{ scale: pulseAnim }] },
              ]}
            />
            <Text style={inputStyles.recordingText}>
              Recording  {formatDuration(recordingMs)}
            </Text>
          </View>
          <Pressable onPress={handleCancelRecording} style={inputStyles.cancelBtn} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={COLORS.error} />
            <Text style={inputStyles.cancelText}>Cancel</Text>
          </Pressable>
        </View>
      )}

      {/* ── Transcribing banner ───────────────────────────────────────────── */}
      {isTranscribing && (
        <View style={inputStyles.transcribingBanner}>
          <ActivityIndicator size="small" color={COLORS.primary} />
          <Text style={inputStyles.transcribingText}>Transcribing audio…</Text>
        </View>
      )}

      {/* ── KB status pill ────────────────────────────────────────────────── */}
      {!isRecording && !isTranscribing && indexedCount > 0 && (
        <View style={inputStyles.statusPill}>
          <View style={inputStyles.statusDot} />
          <Text style={inputStyles.statusText}>
            {indexedCount} report{indexedCount !== 1 ? 's' : ''}
          </Text>
        </View>
      )}

      {/* ── Input row ─────────────────────────────────────────────────────── */}
      <View style={inputStyles.row}>

        {/* Library icon */}
        <View style={inputStyles.libIcon}>
          <Ionicons name="library-outline" size={16} color={COLORS.primary} />
        </View>

        {/* Text input */}
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={onChange}
          placeholder={
            isRecording
              ? 'Listening…'
              : isTranscribing
              ? 'Transcribing…'
              : PLACEHOLDERS[placeholderIdx]
          }
          placeholderTextColor={
            isRecording ? COLORS.error : isTranscribing ? COLORS.primary : COLORS.textMuted
          }
          style={[
            inputStyles.input,
            isRecording   && inputStyles.inputRecording,
            isTranscribing && inputStyles.inputTranscribing,
          ]}
          onSubmitEditing={onSend}
          returnKeyType="send"
          blurOnSubmit={false}
          multiline={false}
          editable={!inputBusy && !disabled}
          onFocus={onFocus}
        />

        {/* ── Mic button ────────────────────────────────────────────────── */}
        <Pressable
          onPress={handleMicPress}
          disabled={disabled || isSending}
          hitSlop={6}
          style={({ pressed }) => [
            inputStyles.micBtn,
            isRecording    && inputStyles.micBtnRecording,
            isTranscribing && inputStyles.micBtnTranscribing,
            (disabled || isSending) && { opacity: 0.35 },
            pressed && { opacity: 0.7 },
          ]}
        >
          {isTranscribing ? (
            <ActivityIndicator size="small" color={COLORS.primary} />
          ) : isRecording ? (
            /* Stop icon while recording */
            <Ionicons name="stop" size={16} color="#FFF" />
          ) : (
            <Ionicons name="mic-outline" size={18} color={COLORS.primary} />
          )}
        </Pressable>

        {/* ── Send button ───────────────────────────────────────────────── */}
        <Pressable
          onPress={onSend}
          disabled={!canSend}
          style={{ opacity: canSend ? 1 : 0.35 }}
        >
          <LinearGradient
            colors={canSend ? COLORS.gradientPrimary : ['#2A2A4A', '#1A1A35']}
            style={inputStyles.sendBtn}
          >
            {isSending
              ? <ActivityIndicator size="small" color="#FFF" />
              : <Ionicons name="arrow-up" size={18} color="#FFF" />
            }
          </LinearGradient>
        </Pressable>
      </View>

      {/* ── Hint ──────────────────────────────────────────────────────────── */}
      {!isRecording && !isTranscribing && (
        <Text style={inputStyles.hint}>
          🎙 Tap mic to speak  ·  Searches {indexedCount} report{indexedCount !== 1 ? 's' : ''} with semantic AI
        </Text>
      )}

    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const inputStyles = StyleSheet.create({
  container: {
    paddingHorizontal: SPACING.md,
    paddingTop:        SPACING.sm,
    paddingBottom:     SPACING.sm,
    borderTopWidth:    1,
    borderTopColor:    COLORS.border,
    backgroundColor:   COLORS.backgroundCard,
    gap:               6,
  },

  // ── Recording banner ────────────────────────────────────────────────────────
  recordingBanner: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'space-between',
    paddingHorizontal: SPACING.sm,
    paddingVertical:   7,
    backgroundColor:   COLORS.error + '12',
    borderRadius:    RADIUS.md,
    borderWidth:     1,
    borderColor:     COLORS.error + '30',
  },
  recordingLeft: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:            8,
  },
  recordingDot: {
    width:           8,
    height:          8,
    borderRadius:    4,
    backgroundColor: COLORS.error,
  },
  recordingText: {
    color:      COLORS.error,
    fontSize:   FONTS.sizes.sm,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  cancelBtn: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:            4,
    paddingHorizontal: 8,
    paddingVertical:   4,
    borderRadius:  RADIUS.full,
    backgroundColor: COLORS.error + '18',
  },
  cancelText: {
    color:      COLORS.error,
    fontSize:   FONTS.sizes.xs,
    fontWeight: '600',
  },

  // ── Transcribing banner ─────────────────────────────────────────────────────
  transcribingBanner: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:              8,
    paddingHorizontal: SPACING.sm,
    paddingVertical:   7,
    backgroundColor:   COLORS.primary + '10',
    borderRadius:    RADIUS.md,
    borderWidth:     1,
    borderColor:     COLORS.primary + '25',
  },
  transcribingText: {
    color:     COLORS.primary,
    fontSize:  FONTS.sizes.sm,
    fontStyle: 'italic',
  },

  // ── Status pill ─────────────────────────────────────────────────────────────
  statusPill: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:                5,
    alignSelf:         'flex-start',
    paddingHorizontal: 8,
    paddingVertical:   3,
    borderRadius:      RADIUS.full,
    backgroundColor:   COLORS.success + '10',
    borderWidth:       1,
    borderColor:       COLORS.success + '25',
  },
  statusDot: {
    width: 5, height: 5, borderRadius: 3,
    backgroundColor: COLORS.success,
  },
  statusText: { color: COLORS.success, fontSize: 9, fontWeight: '700' },

  // ── Input row ───────────────────────────────────────────────────────────────
  row: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:            SPACING.sm,
  },
  libIcon: {
    width: 36, height: 36, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.primary + '15',
    borderWidth: 1, borderColor: COLORS.primary + '25',
    flexShrink: 0,
  },
  input: {
    flex:              1,
    backgroundColor:   COLORS.backgroundElevated,
    borderRadius:      RADIUS.full,
    paddingHorizontal: SPACING.md,
    paddingVertical:   10,
    color:             COLORS.textPrimary,
    fontSize:          FONTS.sizes.sm,
    borderWidth:       1,
    borderColor:       COLORS.border,
  },
  inputRecording: {
    borderColor:     COLORS.error + '60',
    backgroundColor: COLORS.error + '08',
  },
  inputTranscribing: {
    borderColor:     COLORS.primary + '60',
    backgroundColor: COLORS.primary + '08',
  },

  // ── Mic button ──────────────────────────────────────────────────────────────
  micBtn: {
    width:          42,
    height:         42,
    borderRadius:   21,
    alignItems:     'center',
    justifyContent: 'center',
    backgroundColor: COLORS.backgroundElevated,
    borderWidth:    1,
    borderColor:    COLORS.border,
    flexShrink:     0,
  },
  micBtnRecording: {
    backgroundColor: COLORS.error,
    borderColor:     COLORS.error,
  },
  micBtnTranscribing: {
    backgroundColor: COLORS.primary + '15',
    borderColor:     COLORS.primary + '40',
  },

  // ── Send button ─────────────────────────────────────────────────────────────
  sendBtn: {
    width: 42, height: 42, borderRadius: 21,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },

  // ── Hint ────────────────────────────────────────────────────────────────────
  hint: {
    color:     COLORS.textMuted,
    fontSize:  9,
    textAlign: 'center',
    lineHeight: 14,
  },
});