// app/(app)/workspace-ai-chat.tsx
// Part 50.6 — Personal "Ask DeepDive AI" screen
// Part 50.9 — Android keyboard fix (no distortion).
// Part 50.9.1 — Tap-anywhere-to-dismiss keyboard on Android (and iOS).
//
// A PRIVATE 1:1 chat with the same AI that powers the @deepdive team-chat bot —
// same RAG over the workspace's shared research reports, same answers — but here
// the member types questions directly (no @deepdive / /ai trigger needed) and the
// conversation is visible only to them (persisted locally per user + workspace).
//
// Reached from the Team Chat top bar (sparkles button, left of search).
//
// ─── KEYBOARD FIX (Part 50.9) ────────────────────────────────────────────────
//   Android → NO KeyboardAvoidingView. softwareKeyboardLayoutMode:'pan' (app.json)
//             pans the window so the focused input rises above the keyboard. iOS
//             uses KeyboardAvoidingView behavior="padding".
//
// ─── DISMISS FIX (Part 50.9.1) ───────────────────────────────────────────────
//   Every tappable non-input surface dismisses the keyboard (Pressable wrappers,
//   FlatList keyboardShouldPersistTaps="handled" + onScrollBeginDrag → dismiss).
//
// ─── Part 50.10 — ANDROID NAV-BAR FIX (production · issue 9) ──────────────────
//   Symptom: the bottom input bar sat BEHIND the Android navigation / gesture bar
//   when the keyboard was closed (SDK 54 edge-to-edge draws content behind the
//   system bars and cannot be disabled).
//   Cause: the input bar only padded its bottom by the inset inline, but the
//   floor (10) was too small for tall gesture bars and there was no explicit
//   safe-area handling on the root, so on some devices the bar still overlapped.
//   Fix:
//     • inputBottomPad now floors at SPACING.sm and uses the real inset, so the
//       resting bar always clears the nav/gesture bar.
//     • The bar keeps a base paddingTop; the inset is added to paddingBottom.
//   (When the keyboard is open, softwareKeyboardLayoutMode:'pan' lifts the whole
//    window so the inset padding simply sits above the keyboard — no overlap.)

import React, {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Platform,
  StatusBar,
  KeyboardAvoidingView,
  Keyboard,
  Pressable,
  FlatList,
  Alert,
} from 'react-native';
import { Ionicons }          from '@expo/vector-icons';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';

import { useAuth }              from '../../src/context/AuthContext';
import { useWorkspaceAIChat, AIChatMessage } from '../../src/hooks/useWorkspaceAIChat';
import { COLORS, FONTS, SPACING, RADIUS } from '../../src/constants/theme';

const TOP_BAR_HEIGHT = 56;

const SUGGESTIONS = [
  'Summarize the key findings across our reports',
  'What are the most important statistics?',
  'Compare the research we’ve shared',
  'What should the team look into next?',
];

// ─── Lightweight markdown renderer (bold / italic / code / bullets / caption) ──

function parseInline(text: string, baseStyle: any): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|\*[^*\n]+\*|`[^`]+`)/g;
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  let key = 0;

  while ((m = regex.exec(text)) !== null) {
    if (m.index > lastIndex) {
      nodes.push(<Text key={key++}>{text.slice(lastIndex, m.index)}</Text>);
    }
    const tok = m[0];
    if (tok.startsWith('**')) {
      nodes.push(<Text key={key++} style={mdStyles.bold}>{tok.slice(2, -2)}</Text>);
    } else if (tok.startsWith('`')) {
      nodes.push(<Text key={key++} style={mdStyles.code}>{tok.slice(1, -1)}</Text>);
    } else {
      nodes.push(<Text key={key++} style={mdStyles.italic}>{tok.slice(1, -1)}</Text>);
    }
    lastIndex = m.index + tok.length;
  }
  if (lastIndex < text.length) {
    nodes.push(<Text key={key++}>{text.slice(lastIndex)}</Text>);
  }
  return nodes;
}

function RichText({ content }: { content: string }) {
  const lines = content.split('\n');
  return (
    <View>
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (trimmed === '') return <View key={i} style={{ height: 6 }} />;

        // meta caption: *(from 2 workspace reports · …)*
        if (/^\*\(.*\)\*$/.test(trimmed)) {
          const inner = trimmed.replace(/^\*\(/, '(').replace(/\)\*$/, ')');
          return <Text key={i} style={mdStyles.caption}>{inner}</Text>;
        }

        // bullet line
        const bullet = trimmed.match(/^([-*•])\s+(.*)$/);
        if (bullet) {
          return (
            <View key={i} style={mdStyles.bulletRow}>
              <Text style={mdStyles.bulletDot}>•</Text>
              <Text style={mdStyles.bulletText}>{parseInline(bullet[2], null)}</Text>
            </View>
          );
        }

        return <Text key={i} style={mdStyles.paragraph}>{parseInline(line, null)}</Text>;
      })}
    </View>
  );
}

const mdStyles = StyleSheet.create({
  paragraph: { color: COLORS.textPrimary, fontSize: FONTS.sizes.base, lineHeight: 22 },
  bold:      { fontWeight: '800', color: COLORS.textPrimary },
  italic:    { fontStyle: 'italic' },
  code: {
    fontFamily:        Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize:          FONTS.sizes.sm,
    color:             COLORS.primary,
    backgroundColor:   `${COLORS.primary}15`,
  },
  caption:   { color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontStyle: 'italic', marginBottom: 6 },
  bulletRow: { flexDirection: 'row', gap: 8, marginVertical: 2 },
  bulletDot: { color: COLORS.primary, fontSize: FONTS.sizes.base, lineHeight: 22, fontWeight: '800' },
  bulletText:{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, lineHeight: 22, flex: 1 },
});

// ─── Typing indicator (3 bouncing dots) ────────────────────────────────────────

function TypingDots() {
  return (
    <View style={styles.typingRow}>
      {[0, 1, 2].map((i) => (
        <Animated.View
          key={i}
          entering={FadeIn.delay(i * 120).duration(200)}
          style={styles.typingDot}
        />
      ))}
    </View>
  );
}

// ─── Message bubble ─────────────────────────────────────────────────────────────

function MessageBubble({
  message,
  onRetry,
}: {
  message: AIChatMessage;
  onRetry: () => void;
}) {
  const isUser = message.role === 'user';

  if (isUser) {
    return (
      <Animated.View entering={FadeInUp.duration(180)} style={[styles.row, styles.rowUser]}>
        <View style={[styles.bubble, styles.bubbleUser]}>
          <Text style={styles.userText}>{message.content}</Text>
        </View>
      </Animated.View>
    );
  }

  return (
    <Animated.View entering={FadeInUp.duration(220)} style={[styles.row, styles.rowAI]}>
      <View style={styles.aiAvatar}>
        <Ionicons name="sparkles" size={13} color="#FFF" />
      </View>
      <View style={styles.aiCol}>
        <View style={[styles.bubble, styles.bubbleAI, message.status === 'error' && styles.bubbleError]}>
          {message.status === 'sending' ? (
            <TypingDots />
          ) : (
            <RichText content={message.content} />
          )}
        </View>

        {/* source chips */}
        {message.status === 'done' && (message.sources?.length ?? 0) > 0 && (
          <View style={styles.sourcesWrap}>
            {message.sources!.map((s, idx) => (
              <View key={`${s.reportId}_${idx}`} style={styles.sourceChip}>
                <Ionicons name="document-text-outline" size={11} color={COLORS.primary} />
                <Text style={styles.sourceChipText} numberOfLines={1}>
                  {s.reportTitle || 'Workspace Report'}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* retry */}
        {message.status === 'error' && (
          <TouchableOpacity style={styles.retryBtn} onPress={onRetry} activeOpacity={0.7}>
            <Ionicons name="refresh" size={13} color={COLORS.primary} />
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        )}
      </View>
    </Animated.View>
  );
}

// ─── Screen ─────────────────────────────────────────────────────────────────────

export default function WorkspaceAIChatScreen() {
  const {
    id:   workspaceId,
    name: workspaceName,
  } = useLocalSearchParams<{ id: string; name: string; role: string }>();

  const { user } = useAuth();
  const insets   = useSafeAreaInsets();

  const wid = workspaceId ?? '';
  const uid = user?.id ?? 'anon';

  const { messages, sending, loaded, send, retryLast, clear } = useWorkspaceAIChat(wid, uid);

  const [input, setInput] = useState('');
  const listRef = useRef<FlatList<AIChatMessage>>(null);

  // Part 50.9.1: dismiss the keyboard from any background tap / scroll.
  const dismissKeyboard = useCallback(() => {
    Keyboard.dismiss();
  }, []);

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => {
      try { listRef.current?.scrollToEnd({ animated: true }); } catch { /* */ }
    });
  }, []);

  useEffect(() => {
    if (messages.length > 0) scrollToEnd();
  }, [messages.length, scrollToEnd]);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    send(text);
  }, [input, sending, send]);

  const handleSuggestion = useCallback((s: string) => {
    if (sending) return;
    Keyboard.dismiss();
    send(s);
  }, [sending, send]);

  const handleClear = useCallback(() => {
    if (messages.length === 0) return;
    Keyboard.dismiss();
    Alert.alert(
      'Clear conversation',
      'This permanently clears your private chat with DeepDive AI for this workspace. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear', style: 'destructive', onPress: clear },
      ],
    );
  }, [messages.length, clear]);

  // ── Part 50.9: platform-correct wrapper ─────────────────────────────────────
  //   iOS     → KeyboardAvoidingView (padding) lifts the input above the keyboard.
  //   Android → plain View. softwareKeyboardLayoutMode:'pan' pans the window so the
  //             focused input rises above the keyboard. NO KeyboardAvoidingView.
  const Wrapper = Platform.OS === 'ios' ? KeyboardAvoidingView : View;
  const wrapperProps: any = Platform.OS === 'ios'
    ? { style: { flex: 1 }, behavior: 'padding', keyboardVerticalOffset: insets.top + TOP_BAR_HEIGHT }
    : { style: { flex: 1 } };

  const renderItem = useCallback(({ item }: { item: AIChatMessage }) => (
    <MessageBubble message={item} onRetry={retryLast} />
  ), [retryLast]);

  const isEmpty = loaded && messages.length === 0;

  // Part 50.10 (issue 9): floor the bottom pad at SPACING.sm and add the real
  // safe-area inset so the resting input bar always clears the Android
  // nav/gesture bar under SDK 54 edge-to-edge.
  const inputBottomPad = insets.bottom + SPACING.sm;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />

      {/* Top bar */}
      <View style={[styles.topBarSafe, { paddingTop: insets.top }]}>
        <Animated.View entering={FadeIn.duration(300)} style={styles.topBar}>
          <TouchableOpacity onPress={() => { Keyboard.dismiss(); router.back(); }} style={styles.backBtn} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={22} color={COLORS.textPrimary} />
          </TouchableOpacity>

          <View style={styles.topCenter}>
            <View style={styles.titleRow}>
              <View style={styles.titleAvatar}>
                <Ionicons name="sparkles" size={14} color="#FFF" />
              </View>
              <Text style={styles.topTitle} numberOfLines={1}>DeepDive AI</Text>
            </View>
            <Text style={styles.topSub} numberOfLines={1}>
              Private · {workspaceName ?? 'Workspace'}
            </Text>
          </View>

          <TouchableOpacity
            onPress={handleClear}
            style={[styles.iconBtn, messages.length === 0 && { opacity: 0.4 }]}
            activeOpacity={0.7}
            disabled={messages.length === 0}
          >
            <Ionicons name="trash-outline" size={17} color={COLORS.textSecondary} />
          </TouchableOpacity>
        </Animated.View>
      </View>

      <Wrapper {...wrapperProps}>
        {/* Part 50.9.1: tapping the privacy bar dismisses the keyboard */}
        <Pressable onPress={dismissKeyboard} style={styles.privacyBar} android_disableSound>
          <Ionicons name="lock-closed" size={11} color={COLORS.textMuted} />
          <Text style={styles.privacyText}>
            Only you can see this chat. Answers come from your team’s shared research.
          </Text>
        </Pressable>

        {!loaded ? (
          <Pressable style={styles.center} onPress={dismissKeyboard} android_disableSound>
            <ActivityIndicator size="large" color={COLORS.primary} />
          </Pressable>
        ) : isEmpty ? (
          // Part 50.9.1: empty area dismisses keyboard on background tap
          <Pressable style={{ flex: 1 }} onPress={dismissKeyboard} android_disableSound>
            <EmptyState onPick={handleSuggestion} disabled={sending} />
          </Pressable>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m.id}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            // Part 50.9.1: taps on bubbles still register; taps on blank list
            // space fall through and dismiss the keyboard. Works on Android.
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            onScrollBeginDrag={dismissKeyboard}
            onContentSizeChange={scrollToEnd}
            // An empty footer Pressable gives blank space below the last message
            // a reliable dismiss target on Android.
            ListFooterComponent={
              <Pressable onPress={dismissKeyboard} android_disableSound style={styles.listFooterTap} />
            }
          />
        )}

        {/* Input bar — FIX (issue 9): paddingBottom = insets.bottom + SPACING.sm
            so the resting bar clears the Android nav/gesture bar. */}
        <View style={[styles.inputBar, { paddingBottom: inputBottomPad }]}>
          <View style={styles.inputWrap}>
            <TextInput
              style={styles.input}
              value={input}
              onChangeText={setInput}
              placeholder="Ask DeepDive AI anything…"
              placeholderTextColor={COLORS.textMuted}
              multiline
              maxLength={2000}
              selectionColor={COLORS.primary}
              editable={!sending}
              onSubmitEditing={handleSend}
              blurOnSubmit={false}
            />
          </View>
          <TouchableOpacity
            style={[styles.sendBtn, (!input.trim() || sending) && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!input.trim() || sending}
            activeOpacity={0.8}
          >
            {sending ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Ionicons name="arrow-up" size={20} color="#FFF" />
            )}
          </TouchableOpacity>
        </View>
      </Wrapper>
    </View>
  );
}

// ─── Empty state ────────────────────────────────────────────────────────────────

function EmptyState({ onPick, disabled }: { onPick: (s: string) => void; disabled: boolean }) {
  return (
    <Animated.View entering={FadeIn.duration(350)} style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons name="sparkles" size={34} color={COLORS.primary} />
      </View>
      <Text style={styles.emptyTitle}>Ask DeepDive AI</Text>
      <Text style={styles.emptyDesc}>
        Get instant answers from your team’s shared research reports — no commands needed.
        This conversation is private to you.
      </Text>

      <View style={styles.suggestWrap}>
        {SUGGESTIONS.map((s, i) => (
          <TouchableOpacity
            key={i}
            style={styles.suggestChip}
            onPress={() => onPick(s)}
            activeOpacity={0.75}
            disabled={disabled}
          >
            <Ionicons name="arrow-forward-circle-outline" size={16} color={COLORS.primary} />
            <Text style={styles.suggestText}>{s}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </Animated.View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:        { flex: 1, backgroundColor: COLORS.background },
  center:      { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // top bar
  topBarSafe:  { backgroundColor: COLORS.background, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  topBar:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.md, gap: 10, height: TOP_BAR_HEIGHT },
  backBtn:     { width: 36, height: 36, borderRadius: 11, backgroundColor: COLORS.backgroundCard, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border, flexShrink: 0 },
  topCenter:   { flex: 1 },
  titleRow:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
  titleAvatar: { width: 26, height: 26, borderRadius: 13, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  topTitle:    { color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '800' },
  topSub:      { color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 1, paddingLeft: 34 },
  iconBtn:     { width: 34, height: 34, borderRadius: 10, backgroundColor: COLORS.backgroundCard, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border, flexShrink: 0 },

  // privacy bar
  privacyBar:  { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: SPACING.lg, paddingVertical: 8, backgroundColor: COLORS.backgroundCard, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  privacyText: { color: COLORS.textMuted, fontSize: FONTS.sizes.xs, flex: 1 },

  // list
  listContent:   { padding: SPACING.md, paddingBottom: SPACING.lg, gap: 4 },
  listFooterTap: { height: 40, width: '100%' },

  // rows + bubbles
  row:         { flexDirection: 'row', marginVertical: 6, maxWidth: '100%' },
  rowUser:     { justifyContent: 'flex-end' },
  rowAI:       { justifyContent: 'flex-start', gap: 8 },
  aiAvatar:    { width: 26, height: 26, borderRadius: 13, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', marginTop: 2, flexShrink: 0 },
  aiCol:       { flex: 1, alignItems: 'flex-start' },
  bubble:      { borderRadius: RADIUS.xl, paddingHorizontal: 14, paddingVertical: 11, maxWidth: '88%' },
  bubbleUser:  { backgroundColor: COLORS.primary, borderBottomRightRadius: 6 },
  bubbleAI:    { backgroundColor: COLORS.backgroundCard, borderWidth: 1, borderColor: COLORS.border, borderBottomLeftRadius: 6, maxWidth: '100%', alignSelf: 'stretch' },
  bubbleError: { borderColor: `${COLORS.error}55`, backgroundColor: `${COLORS.error}10` },
  userText:    { color: '#FFFFFF', fontSize: FONTS.sizes.base, lineHeight: 22 },

  // sources
  sourcesWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  sourceChip:  { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: 220, backgroundColor: `${COLORS.primary}12`, borderWidth: 1, borderColor: `${COLORS.primary}30`, borderRadius: RADIUS.full, paddingHorizontal: 10, paddingVertical: 4 },
  sourceChipText: { color: COLORS.primary, fontSize: FONTS.sizes.xs, fontWeight: '600', flexShrink: 1 },

  // retry
  retryBtn:    { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8, paddingVertical: 6, paddingHorizontal: 12, borderRadius: RADIUS.full, backgroundColor: `${COLORS.primary}15`, borderWidth: 1, borderColor: `${COLORS.primary}35` },
  retryText:   { color: COLORS.primary, fontSize: FONTS.sizes.sm, fontWeight: '700' },

  // typing
  typingRow:   { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 2 },
  typingDot:   { width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.textMuted },

  // empty state
  empty:       { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACING.xl, gap: 12 },
  emptyIcon:   { width: 76, height: 76, borderRadius: 24, backgroundColor: `${COLORS.primary}15`, borderWidth: 1, borderColor: `${COLORS.primary}30`, alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.xs },
  emptyTitle:  { color: COLORS.textPrimary, fontSize: FONTS.sizes['2xl'], fontWeight: '800' },
  emptyDesc:   { color: COLORS.textSecondary, fontSize: FONTS.sizes.base, textAlign: 'center', lineHeight: 22, maxWidth: 320 },
  suggestWrap: { width: '100%', gap: 10, marginTop: SPACING.md },
  suggestChip: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: COLORS.backgroundCard, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.lg, paddingHorizontal: 14, paddingVertical: 13 },
  suggestText: { color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '600', flex: 1 },

  // input
  inputBar:    { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: SPACING.md, paddingTop: 10, backgroundColor: COLORS.backgroundCard, borderTopWidth: 1, borderTopColor: COLORS.border },
  inputWrap:   { flex: 1, backgroundColor: COLORS.backgroundElevated, borderRadius: RADIUS.xl, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 14, paddingVertical: Platform.OS === 'ios' ? 10 : 4, maxHeight: 130, justifyContent: 'center' },
  input:       { color: COLORS.textPrimary, fontSize: FONTS.sizes.base, maxHeight: 110, padding: 0, margin: 0 },
  sendBtn:     { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  sendBtnDisabled: { backgroundColor: COLORS.backgroundElevated, borderWidth: 1, borderColor: COLORS.border },
});