// app/(app)/knowledge-base.tsx
// Part 26 — Personal AI Knowledge Base Screen (UPDATED: Session History)
//
// New in this version:
//   • Sessions panel button in header (hamburger icon) → slides open KBSessionsPanel
//   • Active session title in header (truncated, tappable to rename)
//   • "New Chat" shortcut button in header
//   • Session count badge on the history button
//   • Rename dialog: tap header title → inline Alert.prompt (iOS) / Alert with
//     instructions (Android) to rename the current session
//   • setOnSessionChanged wired so sessions panel refreshes after auto-naming

import React, {
  useRef, useEffect, useCallback, useState,
} from 'react';
import {
  View, Text, ScrollView, Pressable,
  StyleSheet, KeyboardAvoidingView, Platform,
  TextInput, Keyboard, Alert, Modal,
} from 'react-native';
import { LinearGradient }          from 'expo-linear-gradient';
import { Ionicons }                from '@expo/vector-icons';
import { SafeAreaView }            from 'react-native-safe-area-context';
import { router }                  from 'expo-router';
import Animated, { FadeInDown }    from 'react-native-reanimated';

import { useKnowledgeBase }        from '../../src/hooks/useKnowledgeBase';
import { useKBSessions }           from '../../src/hooks/useKBSessions';
import { KBIndexingBanner }        from '../../src/components/knowledgeBase/KBIndexingBanner';
import { KBMessageBubble }         from '../../src/components/knowledgeBase/KBMessageBubble';
import { KBEmptyState }            from '../../src/components/knowledgeBase/KBEmptyState';
import {
  KBTypingIndicator,
  KBInputRow,
}                                  from '../../src/components/knowledgeBase/KBInputRow';
import { KBSessionsPanel }         from '../../src/components/knowledgeBase/KBSessionsPanel';
import { COLORS, FONTS, SPACING, RADIUS } from '../../src/constants/theme';

// ─── Rename Modal (cross-platform) ───────────────────────────────────────────

interface RenameModalProps {
  visible:    boolean;
  current:    string;
  onConfirm:  (newTitle: string) => void;
  onClose:    () => void;
}

function RenameModal({ visible, current, onConfirm, onClose }: RenameModalProps) {
  const [value, setValue] = useState(current);

  useEffect(() => {
    if (visible) setValue(current);
  }, [visible, current]);

  const handleConfirm = () => {
    const trimmed = value.trim();
    if (trimmed && trimmed !== current) onConfirm(trimmed);
    onClose();
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={renameStyles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={renameStyles.box}>
          <View style={renameStyles.header}>
            <Ionicons name="pencil-outline" size={18} color={COLORS.primary} />
            <Text style={renameStyles.title}>Rename Chat</Text>
          </View>
          <TextInput
            value={value}
            onChangeText={setValue}
            style={renameStyles.input}
            selectTextOnFocus
            autoFocus
            maxLength={80}
            returnKeyType="done"
            onSubmitEditing={handleConfirm}
            placeholderTextColor={COLORS.textMuted}
          />
          <View style={renameStyles.btnRow}>
            <Pressable onPress={onClose} style={renameStyles.cancelBtn}>
              <Text style={renameStyles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable onPress={handleConfirm} style={renameStyles.confirmBtn}>
              <LinearGradient
                colors={COLORS.gradientPrimary}
                style={renameStyles.confirmGrad}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Text style={renameStyles.confirmText}>Save</Text>
              </LinearGradient>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const renameStyles = StyleSheet.create({
  overlay: {
    flex:            1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems:      'center',
    justifyContent:  'center',
    padding:         SPACING.xl,
  },
  box: {
    backgroundColor: COLORS.backgroundCard,
    borderRadius:    RADIUS.xl,
    borderWidth:     1,
    borderColor:     COLORS.border,
    padding:         SPACING.lg,
    width:           '100%',
    gap:             SPACING.md,
  },
  header: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:            SPACING.sm,
  },
  title: {
    color:      COLORS.textPrimary,
    fontSize:   FONTS.sizes.md,
    fontWeight: '700',
  },
  input: {
    backgroundColor:   COLORS.backgroundElevated,
    borderRadius:      RADIUS.md,
    borderWidth:       1,
    borderColor:       COLORS.primary + '50',
    paddingHorizontal: SPACING.md,
    paddingVertical:   12,
    color:             COLORS.textPrimary,
    fontSize:          FONTS.sizes.base,
  },
  btnRow: {
    flexDirection: 'row',
    gap:            SPACING.sm,
  },
  cancelBtn: {
    flex:            1,
    paddingVertical: 12,
    alignItems:      'center',
    borderRadius:    RADIUS.md,
    backgroundColor: COLORS.backgroundElevated,
    borderWidth:     1,
    borderColor:     COLORS.border,
  },
  cancelText: {
    color:      COLORS.textMuted,
    fontWeight: '600',
    fontSize:   FONTS.sizes.sm,
  },
  confirmBtn: {
    flex:         1,
    borderRadius: RADIUS.md,
    overflow:     'hidden',
  },
  confirmGrad: {
    paddingVertical: 12,
    alignItems:      'center',
    borderRadius:    RADIUS.md,
  },
  confirmText: {
    color:      '#FFF',
    fontWeight: '700',
    fontSize:   FONTS.sizes.sm,
  },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function KnowledgeBaseScreen() {
  const kb      = useKnowledgeBase();
  const kbSess  = useKBSessions();

  const [inputText,        setInputText]        = useState('');
  const [sessionsPanelOpen, setSessionsPanelOpen] = useState(false);
  const [renameModalOpen,   setRenameModalOpen]   = useState(false);

  const scrollRef = useRef<ScrollView>(null);
  const inputRef  = useRef<TextInput | null>(null);

  // ── Wire sessions panel refresh callback ───────────────────────────────────
  useEffect(() => {
    kb.setOnSessionChanged(() => kbSess.loadSessions());
    return () => kb.setOnSessionChanged(null);
  }, []);

  // ── Auto-scroll on new message ─────────────────────────────────────────────
  useEffect(() => {
    if (kb.messages.length > 0 || kb.isSending) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [kb.messages.length, kb.isSending]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleSend = useCallback(() => {
    const text = inputText.trim();
    if (!text || kb.isSending) return;
    setInputText('');
    kb.sendMessage(text);
  }, [inputText, kb.isSending, kb.sendMessage]);

  const handleSuggestedQuery = useCallback((query: string) => {
    kb.sendMessage(query);
  }, [kb.sendMessage]);

  const handleReportPress = useCallback((reportId: string) => {
    router.push({
      pathname: '/(app)/research-report' as any,
      params:   { reportId },
    });
  }, []);

  const handleFocusInput = useCallback(() => {
    inputRef.current?.focus();
  }, []);

  const handleClearChat = useCallback(() => {
    if (kb.messages.length === 0) return;
    Alert.alert(
      'Clear Messages',
      'Remove all messages from this chat? The session will remain in history.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear', style: 'destructive', onPress: kb.clearMessages },
      ],
    );
  }, [kb.messages.length, kb.clearMessages]);

  const handleNewChat = useCallback(async () => {
    await kb.createNewSession();
    kbSess.loadSessions();
  }, [kb.createNewSession, kbSess.loadSessions]);

  const handleSelectSession = useCallback(async (sessionId: string, title: string) => {
    await kb.switchSession(sessionId, title);
  }, [kb.switchSession]);

  const handleRenameConfirm = useCallback((newTitle: string) => {
    kb.renameCurrentSession(newTitle);
    kbSess.loadSessions();
  }, [kb.renameCurrentSession, kbSess.loadSessions]);

  // ── Derived ────────────────────────────────────────────────────────────────
  const hasReports    = (kb.stats?.totalReports ?? 0) > 0;
  const indexedCount  = kb.stats?.indexedReports ?? 0;
  const totalCount    = kb.stats?.totalReports   ?? 0;
  const hasMessages   = kb.messages.length > 0;
  const sessionCount  = kbSess.sessions.length;

  const lastAssistantIdx = [...kb.messages].reverse().findIndex(m => m.role === 'assistant');
  const lastAssistantId  = lastAssistantIdx >= 0
    ? kb.messages[kb.messages.length - 1 - lastAssistantIdx]?.id
    : null;

  // Truncate title for header display
  const displayTitle = kb.activeSessionTitle.length > 22
    ? kb.activeSessionTitle.slice(0, 20) + '…'
    : kb.activeSessionTitle;

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >

        {/* ── Header ──────────────────────────────────────────────────── */}
        <View style={styles.header}>
          {/* Back */}
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [styles.headerBtn, pressed && { opacity: 0.65 }]}
          >
            <Ionicons name="arrow-back" size={22} color={COLORS.textPrimary} />
          </Pressable>

          {/* Title (tappable → rename) */}
          <Pressable
            onPress={() => setRenameModalOpen(true)}
            style={styles.headerCenter}
            hitSlop={6}
          >
            <View style={styles.headerTitleRow}>
              <LinearGradient colors={COLORS.gradientPrimary} style={styles.headerIconWrap}>
                <Ionicons name="library" size={13} color="#FFF" />
              </LinearGradient>
              <Text style={styles.headerTitle} numberOfLines={1}>
                {displayTitle}
              </Text>
              <Ionicons name="pencil-outline" size={12} color={COLORS.textMuted} />
            </View>
            <Text style={styles.headerSubtitle}>
              {indexedCount > 0
                ? `${indexedCount} report${indexedCount !== 1 ? 's' : ''} · tap to rename`
                : 'Building your second brain…'}
            </Text>
          </Pressable>

          {/* Right buttons */}
          <View style={styles.headerRight}>
            {/* New Chat */}
            <Pressable
              onPress={handleNewChat}
              style={({ pressed }) => [styles.headerBtn, styles.headerBtnAccent, pressed && { opacity: 0.75 }]}
              hitSlop={6}
            >
              <Ionicons name="add" size={18} color={COLORS.primary} />
            </Pressable>

            {/* History / Sessions */}
            <Pressable
              onPress={() => {
                kbSess.loadSessions();
                setSessionsPanelOpen(true);
              }}
              style={({ pressed }) => [styles.headerBtn, pressed && { opacity: 0.65 }]}
              hitSlop={6}
            >
              <Ionicons name="time-outline" size={20} color={COLORS.textMuted} />
              {/* Session count badge */}
              {sessionCount > 0 && (
                <View style={styles.sessionBadge}>
                  <Text style={styles.sessionBadgeText}>
                    {sessionCount > 99 ? '99+' : sessionCount}
                  </Text>
                </View>
              )}
            </Pressable>

            {/* Clear messages (only when messages exist) */}
            {hasMessages && (
              <Pressable
                onPress={handleClearChat}
                style={({ pressed }) => [styles.headerBtn, pressed && { opacity: 0.65 }]}
                hitSlop={6}
              >
                <Ionicons name="trash-outline" size={17} color={COLORS.textMuted} />
              </Pressable>
            )}
          </View>
        </View>

        {/* ── Indexing Banner ─────────────────────────────────────────── */}
        <KBIndexingBanner
          stats={kb.stats}
          indexState={kb.indexState}
          onRetry={kb.startIndexing}
        />

        {/* ── Message list / Empty state ───────────────────────────────── */}
        {!hasMessages ? (
          <View style={styles.emptyContainer}>
            <KBEmptyState
              hasReports={hasReports}
              indexedCount={indexedCount}
              totalCount={totalCount}
              onQueryPress={handleSuggestedQuery}
              onStartSearch={handleFocusInput}
            />
          </View>
        ) : (
          <ScrollView
            ref={scrollRef}
            style={styles.messageList}
            contentContainerStyle={styles.messageListContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={() =>
              scrollRef.current?.scrollToEnd({ animated: true })
            }
          >
            {kb.messages.map(msg => (
              <KBMessageBubble
                key={msg.id}
                msg={msg}
                isLastAssistant={msg.id === lastAssistantId}
                onReportPress={handleReportPress}
              />
            ))}

            {kb.isSending && (
              <Animated.View entering={FadeInDown.duration(300)}>
                <KBTypingIndicator />
              </Animated.View>
            )}

            {kb.error && !kb.isSending && (
              <Animated.View
                entering={FadeInDown.duration(300)}
                style={styles.errorBanner}
              >
                <Ionicons name="warning-outline" size={14} color={COLORS.error} />
                <Text style={styles.errorText} numberOfLines={3}>
                  {kb.error}
                </Text>
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

        {/* ── Input row ───────────────────────────────────────────────── */}
        <KBInputRow
          value={inputText}
          onChange={setInputText}
          onSend={handleSend}
          onFocus={handleFocusInput}
          isSending={kb.isSending}
          disabled={!hasReports}
          indexedCount={indexedCount}
          inputRef={inputRef}
        />

      </KeyboardAvoidingView>

      {/* ── Sessions Panel ───────────────────────────────────────────── */}
      <KBSessionsPanel
        visible={sessionsPanelOpen}
        activeSessionId={kb.sessionId}
        onClose={() => setSessionsPanelOpen(false)}
        onSelectSession={handleSelectSession}
        onNewSession={handleNewChat}
      />

      {/* ── Rename Modal ─────────────────────────────────────────────── */}
      <RenameModal
        visible={renameModalOpen}
        current={kb.activeSessionTitle}
        onConfirm={handleRenameConfirm}
        onClose={() => setRenameModalOpen(false)}
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: {
    flex:            1,
    backgroundColor: COLORS.background,
  },
  flex: {
    flex: 1,
  },

  // ── Header ────────────────────────────────────────────────────────────────
  header: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingHorizontal: SPACING.md,
    paddingVertical:   10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor:   COLORS.backgroundCard,
    gap:               SPACING.xs,
  },
  headerBtn: {
    width:          38,
    height:         38,
    borderRadius:   11,
    alignItems:     'center',
    justifyContent: 'center',
    backgroundColor: COLORS.backgroundElevated,
    borderWidth:    1,
    borderColor:    COLORS.border,
    flexShrink:     0,
    position:       'relative',
  },
  headerBtnAccent: {
    borderColor:     COLORS.primary + '40',
    backgroundColor: COLORS.primary + '12',
  },
  headerCenter: {
    flex:       1,
    gap:        2,
    alignItems: 'center',
    paddingHorizontal: SPACING.xs,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:            5,
  },
  headerIconWrap: {
    width:          22,
    height:         22,
    borderRadius:   6,
    alignItems:     'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color:      COLORS.textPrimary,
    fontSize:   FONTS.sizes.sm,
    fontWeight: '800',
    maxWidth:   160,
  },
  headerSubtitle: {
    color:     COLORS.textMuted,
    fontSize:  9,
    textAlign: 'center',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:            SPACING.xs,
    flexShrink:    0,
  },

  // ── Session badge ─────────────────────────────────────────────────────────
  sessionBadge: {
    position:        'absolute',
    top:             -4,
    right:           -4,
    minWidth:        16,
    height:          16,
    borderRadius:    8,
    backgroundColor: COLORS.primary,
    alignItems:      'center',
    justifyContent:  'center',
    paddingHorizontal: 3,
    borderWidth:     1.5,
    borderColor:     COLORS.backgroundCard,
  },
  sessionBadgeText: {
    color:      '#FFF',
    fontSize:   8,
    fontWeight: '800',
    lineHeight: 12,
  },

  // ── Empty container ────────────────────────────────────────────────────────
  emptyContainer: {
    flex: 1,
  },

  // ── Message list ───────────────────────────────────────────────────────────
  messageList: {
    flex:            1,
    backgroundColor: COLORS.background,
  },
  messageListContent: {
    paddingHorizontal: SPACING.md,
    paddingTop:        SPACING.md,
    paddingBottom:     SPACING.sm,
  },

  // ── Error ──────────────────────────────────────────────────────────────────
  errorBanner: {
    flexDirection:   'row',
    alignItems:      'flex-start',
    gap:              8,
    padding:         SPACING.sm,
    borderRadius:    RADIUS.md,
    backgroundColor: COLORS.error + '12',
    borderWidth:     1,
    borderColor:     COLORS.error + '30',
    marginBottom:    SPACING.sm,
  },
  errorText: {
    color:     COLORS.error,
    fontSize:  FONTS.sizes.xs,
    flex:      1,
    lineHeight: 17,
  },
  retryBtn: {
    paddingHorizontal: 10,
    paddingVertical:   4,
    borderRadius:      RADIUS.full,
    backgroundColor:   COLORS.error + '20',
    borderWidth:       1,
    borderColor:       COLORS.error + '40',
  },
  retryText: {
    color:      COLORS.error,
    fontSize:   FONTS.sizes.xs,
    fontWeight: '700',
  },
});