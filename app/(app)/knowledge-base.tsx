// app/(app)/knowledge-base.tsx
// Part 43 — REDESIGNED: matches research-input.tsx aesthetic exactly.
// No floating orbs. No bouncing springs. Controlled FadeIn/FadeInDown entrances.
// All logic/hooks/features preserved exactly.
//
// ── ANDROID UI FIX (production) ───────────────────────────────────────────────
//   Issues fixed:
//     1. The bottom message box slipped BEHIND the Android navigation/gesture bar.
//     2. The input was not reliably clearing the keyboard on Android.
//
//   ROOT CAUSE (1): Expo SDK 54 forces edge-to-edge on Android — content draws
//   behind the system navigation bar and the app must inset it. KBInputRow had no
//   bottom safe-area padding, so it rendered under the nav bar.
//
//   ROOT CAUSE (2): On Android, KeyboardAvoidingView was disabled (behavior
//   undefined) AND softwareKeyboardLayoutMode is 'pan' globally. With nothing
//   lifting the input, the panned window left the input partly hidden.
//
//   THE FIX:
//     • Pass the safe-area bottom inset into KBInputRow so its container pads the
//       Android nav/gesture bar (only when the keyboard is closed).
//     • Use KeyboardAvoidingView with behavior 'padding' on BOTH platforms and a
//       keyboardVerticalOffset so the input rises cleanly above the keyboard. The
//       Reanimated keyboard inset from safe-area-context 5.x makes this reliable.

import React, {
  useRef, useEffect, useCallback, useState,
} from 'react';
import {
  View, Text, ScrollView, Pressable,
  StyleSheet, KeyboardAvoidingView, Platform,
  TextInput, Alert, Modal, Keyboard,
} from 'react-native';
import { LinearGradient }       from 'expo-linear-gradient';
import { Ionicons }             from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router }               from 'expo-router';
import Animated, {
  FadeIn, FadeInDown,
  useSharedValue, useAnimatedStyle,
  withRepeat, withSequence, withTiming,
}                               from 'react-native-reanimated';

import { useKnowledgeBase }     from '../../src/hooks/useKnowledgeBase';
import { useKBSessions }        from '../../src/hooks/useKBSessions';
import { KBIndexingBanner }     from '../../src/components/knowledgeBase/KBIndexingBanner';
import { KBMessageBubble }      from '../../src/components/knowledgeBase/KBMessageBubble';
import { KBEmptyState }         from '../../src/components/knowledgeBase/KBEmptyState';
import {
  KBTypingIndicator,
  KBInputRow,
}                               from '../../src/components/knowledgeBase/KBInputRow';
import { KBSessionsPanel }      from '../../src/components/knowledgeBase/KBSessionsPanel';
import { COLORS, FONTS, SPACING, RADIUS } from '../../src/constants/theme';

// ─── Subtle status dot (no float/bounce) ──────────────────────────────────────
function StatusDot({ active }: { active: boolean }) {
  const opacity = useSharedValue(1);
  useEffect(() => {
    if (active) {
      opacity.value = withRepeat(
        withSequence(withTiming(0.3, { duration: 900 }), withTiming(1, { duration: 900 })),
        -1, false,
      );
    } else {
      opacity.value = withTiming(0.5);
    }
  }, [active]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View style={[{
      width: 6, height: 6, borderRadius: 3,
      backgroundColor: active ? COLORS.accent : COLORS.textMuted,
    }, style]} />
  );
}

// ─── Rename Modal ─────────────────────────────────────────────────────────────
interface RenameModalProps {
  visible: boolean; current: string;
  onConfirm: (t: string) => void; onClose: () => void;
}
function RenameModal({ visible, current, onConfirm, onClose }: RenameModalProps) {
  const [value, setValue] = useState(current);
  useEffect(() => { if (visible) setValue(current); }, [visible, current]);
  const handleConfirm = () => {
    const t = value.trim();
    if (t && t !== current) onConfirm(t);
    onClose();
  };
  if (!visible) return null;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.renameOverlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Animated.View entering={FadeInDown.duration(200)} style={styles.renameBox}>
          <LinearGradient
            colors={[`${COLORS.primary}30`, 'transparent']}
            style={styles.renameGlow}
          />
          <View style={styles.renameHeader}>
            <View style={styles.renameIconOrb}>
              <Ionicons name="pencil-outline" size={16} color={COLORS.primary} />
            </View>
            <Text style={styles.renameTitle}>Rename Chat</Text>
          </View>
          <TextInput
            value={value}
            onChangeText={setValue}
            style={styles.renameInput}
            selectTextOnFocus autoFocus maxLength={80}
            returnKeyType="done" onSubmitEditing={handleConfirm}
            placeholderTextColor={COLORS.textMuted}
            placeholder="Chat name…"
          />
          <View style={styles.renameBtnRow}>
            <Pressable onPress={onClose} style={styles.renameCancelBtn}>
              <Text style={styles.renameCancelText}>Cancel</Text>
            </Pressable>
            <Pressable onPress={handleConfirm} style={styles.renameSaveBtn}>
              <LinearGradient colors={COLORS.gradientPrimary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.renameSaveGrad}>
                <Ionicons name="checkmark" size={14} color="#FFF" />
                <Text style={styles.renameSaveText}>Save</Text>
              </LinearGradient>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ─── Main Screen ───────────────────────────────────────────────────────────────
export default function KnowledgeBaseScreen() {
  const kb     = useKnowledgeBase();
  const kbSess = useKBSessions();
  const insets = useSafeAreaInsets();

  const [inputText,         setInputText]         = useState('');
  const [sessionsPanelOpen, setSessionsPanelOpen] = useState(false);
  const [renameModalOpen,   setRenameModalOpen]   = useState(false);

  const scrollRef = useRef<ScrollView>(null);
  const inputRef  = useRef<TextInput | null>(null);

  useEffect(() => {
    kb.setOnSessionChanged(() => kbSess.loadSessions());
    return () => kb.setOnSessionChanged(null);
  }, []);

  useEffect(() => {
    if (kb.messages.length > 0 || kb.isSending)
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, [kb.messages.length, kb.isSending]);

  const handleSend = useCallback(() => {
    const text = inputText.trim();
    if (!text || kb.isSending) return;
    setInputText('');
    kb.sendMessage(text);
  }, [inputText, kb.isSending, kb.sendMessage]);

  const handleSuggestedQuery = useCallback((q: string) => { kb.sendMessage(q); }, [kb.sendMessage]);

  const handleReportPress = useCallback((reportId: string) => {
    router.push({ pathname: '/(app)/research-report' as any, params: { reportId } });
  }, []);

  const handleFocusInput  = useCallback(() => { inputRef.current?.focus(); }, []);

  const handleClearChat   = useCallback(() => {
    if (kb.messages.length === 0) return;
    Alert.alert('Clear Messages', 'Remove all messages? The session stays in history.',
      [{ text: 'Cancel', style: 'cancel' }, { text: 'Clear', style: 'destructive', onPress: kb.clearMessages }]);
  }, [kb.messages.length, kb.clearMessages]);

  const handleNewChat     = useCallback(async () => {
    await kb.createNewSession(); kbSess.loadSessions();
  }, [kb.createNewSession, kbSess.loadSessions]);

  const handleSelectSession = useCallback(async (sessionId: string, title: string) => {
    await kb.switchSession(sessionId, title);
  }, [kb.switchSession]);

  const handleRenameConfirm = useCallback((newTitle: string) => {
    kb.renameCurrentSession(newTitle); kbSess.loadSessions();
  }, [kb.renameCurrentSession, kbSess.loadSessions]);

  const hasReports   = (kb.stats?.totalReports   ?? 0) > 0;
  const indexedCount = kb.stats?.indexedReports   ?? 0;
  const totalCount   = kb.stats?.totalReports     ?? 0;
  const hasMessages  = kb.messages.length         >  0;
  const sessionCount = kbSess.sessions.length;

  const lastAssistantIdx = [...kb.messages].reverse().findIndex(m => m.role === 'assistant');
  const lastAssistantId  = lastAssistantIdx >= 0
    ? kb.messages[kb.messages.length - 1 - lastAssistantIdx]?.id : null;

  const displayTitle = kb.activeSessionTitle.length > 22
    ? kb.activeSessionTitle.slice(0, 20) + '…'
    : kb.activeSessionTitle;

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        {/* FIX (issue 2 — black gap): On Android with SDK 54 edge-to-edge +
            softwareKeyboardLayoutMode:'pan', the OS already pans the window to
            keep the focused input above the keyboard. Using KeyboardAvoidingView
            with behavior="height" ON TOP of that DOUBLE-compensates: when the
            keyboard closes, residual height/padding lingers, leaving a black gap
            between the input bar and the bottom of the screen.
            The fix is to give Android behavior={undefined} so KeyboardAvoidingView
            acts as a plain View (the OS handles the resize), while iOS keeps
            behavior="padding". The input row's own bottomInset padding (added in
            KBInputRow) still clears the nav/gesture bar when the keyboard is
            closed — with no double compensation, there is no black gap. */}
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >

          {/* ── Header ─────────────────────────────────────────────────── */}
          <Animated.View entering={FadeIn.duration(300)} style={styles.header}>
            {/* Back */}
            <Pressable
              onPress={() => router.back()}
              style={({ pressed }) => [styles.headerBtn, pressed && { opacity: 0.65 }]}
            >
              <Ionicons name="arrow-back" size={19} color={COLORS.textSecondary} />
            </Pressable>

            {/* Center — tappable to rename */}
            <Pressable onPress={() => setRenameModalOpen(true)} style={styles.headerCenter} hitSlop={6}>
              <View style={styles.headerTitleRow}>
                <LinearGradient colors={['#7C3AED', '#6C63FF']} style={styles.headerIconOrb}>
                  <Ionicons name="library" size={12} color="#FFF" />
                </LinearGradient>
                <Text style={styles.headerTitle} numberOfLines={1}>{displayTitle}</Text>
                <Ionicons name="pencil-outline" size={11} color={COLORS.textMuted} />
              </View>
              <View style={styles.headerSubRow}>
                <StatusDot active={indexedCount > 0} />
                <Text style={styles.headerSubtitle}>
                  {indexedCount > 0
                    ? `${indexedCount} report${indexedCount !== 1 ? 's' : ''} · tap to rename`
                    : 'Building your second brain…'}
                </Text>
              </View>
            </Pressable>

            {/* Right actions */}
            <View style={styles.headerRight}>
              <Pressable
                onPress={handleNewChat}
                style={({ pressed }) => [styles.headerBtn, styles.headerBtnPrimary, pressed && { opacity: 0.75 }]}
                hitSlop={6}
              >
                <Ionicons name="add" size={17} color={COLORS.primary} />
              </Pressable>

              <Pressable
                onPress={() => { kbSess.loadSessions(); setSessionsPanelOpen(true); }}
                style={({ pressed }) => [styles.headerBtn, pressed && { opacity: 0.65 }]}
                hitSlop={6}
              >
                <Ionicons name="time-outline" size={17} color={COLORS.textMuted} />
                {sessionCount > 0 && (
                  <View style={styles.sessionBadge}>
                    <Text style={styles.sessionBadgeText}>{sessionCount > 99 ? '99+' : sessionCount}</Text>
                  </View>
                )}
              </Pressable>

              {hasMessages && (
                <Pressable
                  onPress={handleClearChat}
                  style={({ pressed }) => [styles.headerBtn, pressed && { opacity: 0.65 }]}
                  hitSlop={6}
                >
                  <Ionicons name="trash-outline" size={15} color={COLORS.textMuted} />
                </Pressable>
              )}
            </View>
          </Animated.View>

          {/* Header bottom glow strip */}
          <LinearGradient colors={[`${COLORS.primary}20`, 'transparent']} style={{ height: 1 }} />

          {/* ── Indexing Banner ─────────────────────────────────────────── */}
          <KBIndexingBanner stats={kb.stats} indexState={kb.indexState} onRetry={kb.startIndexing} />

          {/* ── Messages / Empty state ──────────────────────────────────── */}
          {!hasMessages ? (
            // FIX: tapping the empty area dismisses the keyboard on Android.
            <Pressable style={{ flex: 1 }} onPress={() => Keyboard.dismiss()} android_disableSound>
              <KBEmptyState
                hasReports={hasReports} indexedCount={indexedCount}
                totalCount={totalCount} onQueryPress={handleSuggestedQuery}
                onStartSearch={handleFocusInput}
              />
            </Pressable>
          ) : (
            <ScrollView
              ref={scrollRef} style={{ flex: 1 }}
              contentContainerStyle={styles.messageListContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
            >
              {kb.messages.map(msg => (
                <KBMessageBubble
                  key={msg.id} msg={msg}
                  isLastAssistant={msg.id === lastAssistantId}
                  onReportPress={handleReportPress}
                />
              ))}

              {kb.isSending && (
                <Animated.View entering={FadeInDown.duration(250)}>
                  <KBTypingIndicator />
                </Animated.View>
              )}

              {kb.error && !kb.isSending && (
                <Animated.View entering={FadeInDown.duration(250)} style={styles.errorBanner}>
                  <Ionicons name="warning-outline" size={14} color={COLORS.error} />
                  <Text style={styles.errorText} numberOfLines={3}>{kb.error}</Text>
                  <Pressable
                    onPress={() => {
                      const lastUser = [...kb.messages].reverse().find(m => m.role === 'user');
                      if (lastUser) kb.sendMessage(lastUser.content);
                    }}
                    style={styles.retryBtn}
                  >
                    <Text style={styles.retryText}>Retry</Text>
                  </Pressable>
                </Animated.View>
              )}
              <View style={{ height: SPACING.lg }} />
            </ScrollView>
          )}

          {/* ── Input ───────────────────────────────────────────────────── */}
          {/* FIX: pass safe-area bottom inset so the input clears the Android
              navigation/gesture bar when the keyboard is closed. */}
          <KBInputRow
            value={inputText} onChange={setInputText}
            onSend={handleSend} onFocus={handleFocusInput}
            isSending={kb.isSending} disabled={!hasReports}
            indexedCount={indexedCount} inputRef={inputRef}
            bottomInset={insets.bottom}
          />
        </KeyboardAvoidingView>
      </SafeAreaView>

      <KBSessionsPanel
        visible={sessionsPanelOpen} activeSessionId={kb.sessionId}
        onClose={() => setSessionsPanelOpen(false)}
        onSelectSession={handleSelectSession} onNewSession={handleNewChat}
      />
      <RenameModal
        visible={renameModalOpen} current={kb.activeSessionTitle}
        onConfirm={handleRenameConfirm} onClose={() => setRenameModalOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // Header
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACING.md, paddingVertical: 10,
    backgroundColor: COLORS.backgroundCard,
    borderBottomWidth: 1, borderBottomColor: `${COLORS.primary}18`,
    gap: SPACING.xs,
  },
  headerBtn: {
    width: 38, height: 38, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.backgroundElevated,
    borderWidth: 1, borderColor: COLORS.border,
    flexShrink: 0, position: 'relative',
  },
  headerBtnPrimary: {
    backgroundColor: `${COLORS.primary}12`,
    borderColor: `${COLORS.primary}30`,
  },
  headerCenter: { flex: 1, alignItems: 'center', paddingHorizontal: SPACING.xs, gap: 3 },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerIconOrb: { width: 22, height: 22, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '800', maxWidth: 150, letterSpacing: -0.2 },
  headerSubRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  headerSubtitle: { color: COLORS.textMuted, fontSize: 10 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, flexShrink: 0 },
  sessionBadge: {
    position: 'absolute', top: -4, right: -4,
    minWidth: 15, height: 15, borderRadius: 8,
    backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 3, borderWidth: 1.5,
    borderColor: COLORS.backgroundCard,
  },
  sessionBadgeText: { color: '#FFF', fontSize: 8, fontWeight: '800', lineHeight: 11 },
  // Messages
  messageListContent: { paddingHorizontal: SPACING.md, paddingTop: SPACING.md, paddingBottom: SPACING.sm },
  // Error
  errorBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    padding: SPACING.sm, borderRadius: RADIUS.lg,
    backgroundColor: `${COLORS.error}10`, borderWidth: 1,
    borderColor: `${COLORS.error}25`, marginBottom: SPACING.sm,
  },
  errorText: { color: COLORS.error, fontSize: FONTS.sizes.xs, flex: 1, lineHeight: 17 },
  retryBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.full, backgroundColor: `${COLORS.error}18`, borderWidth: 1, borderColor: `${COLORS.error}35` },
  retryText: { color: COLORS.error, fontSize: FONTS.sizes.xs, fontWeight: '700' },
  // Rename modal
  renameOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center', padding: SPACING.xl },
  renameBox: { backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.xl, borderWidth: 1, borderColor: `${COLORS.primary}28`, padding: SPACING.lg, width: '100%', gap: SPACING.md, overflow: 'hidden' },
  renameGlow: { position: 'absolute', top: 0, left: 0, right: 0, height: 1.5 },
  renameHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  renameIconOrb: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: `${COLORS.primary}15`, borderWidth: 1, borderColor: `${COLORS.primary}28` },
  renameTitle: { color: COLORS.textPrimary, fontSize: FONTS.sizes.md, fontWeight: '700' },
  renameInput: { backgroundColor: COLORS.backgroundElevated, borderRadius: RADIUS.lg, borderWidth: 1.5, borderColor: `${COLORS.primary}45`, paddingHorizontal: SPACING.md, paddingVertical: 12, color: COLORS.textPrimary, fontSize: FONTS.sizes.base },
  renameBtnRow: { flexDirection: 'row', gap: SPACING.sm },
  renameCancelBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: RADIUS.lg, backgroundColor: COLORS.backgroundElevated, borderWidth: 1, borderColor: COLORS.border },
  renameCancelText: { color: COLORS.textMuted, fontWeight: '600', fontSize: FONTS.sizes.sm },
  renameSaveBtn: { flex: 2, borderRadius: RADIUS.lg, overflow: 'hidden' },
  renameSaveGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: RADIUS.lg },
  renameSaveText: { color: '#FFF', fontWeight: '700', fontSize: FONTS.sizes.sm },
});