// app/(app)/workspace-ai-chat.tsx
// Part 50.6 — Personal "Ask DeepDive AI" screen
// Part 50.9 — Android keyboard fix (no distortion).
// Part 50.9.1 — Tap-anywhere-to-dismiss keyboard on Android (and iOS).
// Part 50.10 — ANDROID NAV-BAR FIX (production · issue 9)
// Part 55.2 — Fully theme-integrated: all hardcoded colors replaced with live
//             COLORS from the theme system. No dark-only assumptions.

import React, {
  useCallback, useEffect, useRef, useState,
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
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';

import { useAuth } from '../../src/context/AuthContext';
import { useWorkspaceAIChat, AIChatMessage } from '../../src/hooks/useWorkspaceAIChat';
import { COLORS, FONTS, SPACING, RADIUS } from '../../src/constants/theme';

const TOP_BAR_HEIGHT = 56;

const SUGGESTIONS = [
  'Summarize the key findings across our reports',
  'What are the most important statistics?',
  'Compare the research we\'ve shared',
  'What should the team look into next?',
];

// ─── Lightweight markdown renderer ───────────────────────────────────────────

function parseInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|\*[^*\n]+\*|`[^`]+`)/g;
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  let key = 0;

  while ((m = regex.exec(text)) !== null) {
    if (m.index > lastIndex) {
      nodes.push(<Text key={key++} style={[mdStyles.paragraph, { color: COLORS.textPrimary }]}>{text.slice(lastIndex, m.index)}</Text>);
    }
    const tok = m[0];
    if (tok.startsWith('**')) {
      nodes.push(<Text key={key++} style={[mdStyles.bold, { color: COLORS.textPrimary, fontWeight: '800' }]}>{tok.slice(2, -2)}</Text>);
    } else if (tok.startsWith('`')) {
      nodes.push(<Text key={key++} style={[mdStyles.code, { color: COLORS.primary, backgroundColor: `${COLORS.primary}15` }]}>{tok.slice(1, -1)}</Text>);
    } else {
      nodes.push(<Text key={key++} style={[mdStyles.italic, { fontStyle: 'italic' }]}>{tok.slice(1, -1)}</Text>);
    }
    lastIndex = m.index + tok.length;
  }
  if (lastIndex < text.length) {
    nodes.push(<Text key={key++} style={[mdStyles.paragraph, { color: COLORS.textPrimary }]}>{text.slice(lastIndex)}</Text>);
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

        if (/^\*\(.*\)\*$/.test(trimmed)) {
          const inner = trimmed.replace(/^\*\(/, '(').replace(/\)\*$/, ')');
          return <Text key={i} style={[mdStyles.caption, { color: COLORS.textMuted, fontStyle: 'italic' }]}>{inner}</Text>;
        }

        const bullet = trimmed.match(/^([-*•])\s+(.*)$/);
        if (bullet) {
          return (
            <View key={i} style={mdStyles.bulletRow}>
              <Text style={[mdStyles.bulletDot, { color: COLORS.primary, fontWeight: '800' }]}>•</Text>
              <Text style={[mdStyles.bulletText, { color: COLORS.textPrimary }]}>{parseInline(bullet[2])}</Text>
            </View>
          );
        }

        return <Text key={i} style={[mdStyles.paragraph, { color: COLORS.textPrimary }]}>{parseInline(line)}</Text>;
      })}
    </View>
  );
}

const mdStyles = StyleSheet.create({
  paragraph: { fontSize: FONTS.sizes.base, lineHeight: 22 },
  bold: { fontWeight: '800' },
  italic: { fontStyle: 'italic' },
  code: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: FONTS.sizes.sm,
  },
  caption: { fontSize: FONTS.sizes.xs, fontStyle: 'italic', marginBottom: 6 },
  bulletRow: { flexDirection: 'row', gap: 8, marginVertical: 2 },
  bulletDot: { fontSize: FONTS.sizes.base, lineHeight: 22 },
  bulletText: { fontSize: FONTS.sizes.base, lineHeight: 22, flex: 1 },
});

// ─── Typing indicator ─────────────────────────────────────────────────────────

function TypingDots() {
  return (
    <View style={styles.typingRow}>
      {[0, 1, 2].map((i) => (
        <Animated.View
          key={i}
          entering={FadeIn.delay(i * 120).duration(200)}
          style={[styles.typingDot, { backgroundColor: COLORS.textMuted }]}
        />
      ))}
    </View>
  );
}

// ─── Message bubble ───────────────────────────────────────────────────────────

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
        <View style={[styles.bubble, styles.bubbleUser, { backgroundColor: COLORS.primary }]}>
          <Text style={[styles.userText, { color: '#FFFFFF' }]}>{message.content}</Text>
        </View>
      </Animated.View>
    );
  }

  return (
    <Animated.View entering={FadeInUp.duration(220)} style={[styles.row, styles.rowAI]}>
      <View style={[styles.aiAvatar, { backgroundColor: COLORS.primary }]}>
        <Ionicons name="sparkles" size={13} color="#FFF" />
      </View>
      <View style={styles.aiCol}>
        <View style={[
          styles.bubble,
          styles.bubbleAI,
          { backgroundColor: COLORS.backgroundCard, borderColor: COLORS.border },
          message.status === 'error' && { borderColor: `${COLORS.error}55`, backgroundColor: `${COLORS.error}10` },
        ]}>
          {message.status === 'sending' ? (
            <TypingDots />
          ) : (
            <RichText content={message.content} />
          )}
        </View>

        {(message.status === 'done' && (message.sources?.length ?? 0) > 0) && (
          <View style={styles.sourcesWrap}>
            {message.sources!.map((s, idx) => (
              <View key={`${s.reportId}_${idx}`} style={[styles.sourceChip, { backgroundColor: `${COLORS.primary}12`, borderColor: `${COLORS.primary}30` }]}>
                <Ionicons name="document-text-outline" size={11} color={COLORS.primary} />
                <Text style={[styles.sourceChipText, { color: COLORS.primary }]} numberOfLines={1}>
                  {s.reportTitle || 'Workspace Report'}
                </Text>
              </View>
            ))}
          </View>
        )}

        {message.status === 'error' && (
          <TouchableOpacity style={[styles.retryBtn, { backgroundColor: `${COLORS.primary}15`, borderColor: `${COLORS.primary}35` }]} onPress={onRetry} activeOpacity={0.7}>
            <Ionicons name="refresh" size={13} color={COLORS.primary} />
            <Text style={[styles.retryText, { color: COLORS.primary }]}>Retry</Text>
          </TouchableOpacity>
        )}
      </View>
    </Animated.View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function WorkspaceAIChatScreen() {
  const {
    id: workspaceId,
    name: workspaceName,
  } = useLocalSearchParams<{ id: string; name: string; role: string }>();

  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  const wid = workspaceId ?? '';
  const uid = user?.id ?? 'anon';

  const { messages, sending, loaded, send, retryLast, clear } = useWorkspaceAIChat(wid, uid);

  const [input, setInput] = useState('');
  const listRef = useRef<FlatList<AIChatMessage>>(null);

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

  const Wrapper = Platform.OS === 'ios' ? KeyboardAvoidingView : View;
  const wrapperProps: any = Platform.OS === 'ios'
    ? { style: { flex: 1 }, behavior: 'padding', keyboardVerticalOffset: insets.top + TOP_BAR_HEIGHT }
    : { style: { flex: 1 } };

  const renderItem = useCallback(({ item }: { item: AIChatMessage }) => (
    <MessageBubble message={item} onRetry={retryLast} />
  ), [retryLast]);

  const isEmpty = loaded && messages.length === 0;
  const inputBottomPad = insets.bottom + SPACING.sm;

  return (
    <View style={[styles.root, { backgroundColor: COLORS.background }]}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />

      <View style={[styles.topBarSafe, { backgroundColor: COLORS.background, borderBottomColor: COLORS.border, paddingTop: insets.top }]}>
        <Animated.View entering={FadeIn.duration(300)} style={styles.topBar}>
          <TouchableOpacity onPress={() => { Keyboard.dismiss(); router.back(); }} style={[styles.backBtn, { backgroundColor: COLORS.backgroundCard, borderColor: COLORS.border }]} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={22} color={COLORS.textPrimary} />
          </TouchableOpacity>

          <View style={styles.topCenter}>
            <View style={styles.titleRow}>
              <View style={[styles.titleAvatar, { backgroundColor: COLORS.primary }]}>
                <Ionicons name="sparkles" size={14} color="#FFF" />
              </View>
              <Text style={[styles.topTitle, { color: COLORS.textPrimary }]} numberOfLines={1}>DeepDive AI</Text>
            </View>
            <Text style={[styles.topSub, { color: COLORS.textMuted }]} numberOfLines={1}>
              Private · {workspaceName ?? 'Workspace'}
            </Text>
          </View>

          <TouchableOpacity
            onPress={handleClear}
            style={[styles.iconBtn, { backgroundColor: COLORS.backgroundCard, borderColor: COLORS.border }, messages.length === 0 && { opacity: 0.4 }]}
            activeOpacity={0.7}
            disabled={messages.length === 0}
          >
            <Ionicons name="trash-outline" size={17} color={COLORS.textSecondary} />
          </TouchableOpacity>
        </Animated.View>
      </View>

      <Wrapper {...wrapperProps}>
        <Pressable onPress={dismissKeyboard} style={[styles.privacyBar, { backgroundColor: COLORS.backgroundCard, borderBottomColor: COLORS.border }]} android_disableSound>
          <Ionicons name="lock-closed" size={11} color={COLORS.textMuted} />
          <Text style={[styles.privacyText, { color: COLORS.textMuted }]}>
            Only you can see this chat. Answers come from your team's shared research.
          </Text>
        </Pressable>

        {!loaded ? (
          <Pressable style={styles.center} onPress={dismissKeyboard} android_disableSound>
            <ActivityIndicator size="large" color={COLORS.primary} />
          </Pressable>
        ) : isEmpty ? (
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
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            onScrollBeginDrag={dismissKeyboard}
            onContentSizeChange={scrollToEnd}
            ListFooterComponent={
              <Pressable onPress={dismissKeyboard} android_disableSound style={styles.listFooterTap} />
            }
          />
        )}

        <View style={[styles.inputBar, { backgroundColor: COLORS.backgroundCard, borderTopColor: COLORS.border, paddingBottom: inputBottomPad }]}>
          <View style={[styles.inputWrap, { backgroundColor: COLORS.backgroundElevated, borderColor: COLORS.border }]}>
            <TextInput
              style={[styles.input, { color: COLORS.textPrimary }]}
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
            style={[
              styles.sendBtn,
              { backgroundColor: COLORS.primary },
              (!input.trim() || sending) && { backgroundColor: COLORS.backgroundElevated, borderColor: COLORS.border, borderWidth: 1 },
            ]}
            onPress={handleSend}
            disabled={!input.trim() || sending}
            activeOpacity={0.8}
          >
            {sending ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Ionicons name="arrow-up" size={20} color={!input.trim() ? COLORS.textMuted : '#FFF'} />
            )}
          </TouchableOpacity>
        </View>
      </Wrapper>
    </View>
  );
}

// ─── Empty state ─────────────────────────────────────────────────────────────

function EmptyState({ onPick, disabled }: { onPick: (s: string) => void; disabled: boolean }) {
  return (
    <Animated.View entering={FadeIn.duration(350)} style={styles.empty}>
      <View style={[styles.emptyIcon, { backgroundColor: `${COLORS.primary}15`, borderColor: `${COLORS.primary}30` }]}>
        <Ionicons name="sparkles" size={34} color={COLORS.primary} />
      </View>
      <Text style={[styles.emptyTitle, { color: COLORS.textPrimary }]}>Ask DeepDive AI</Text>
      <Text style={[styles.emptyDesc, { color: COLORS.textSecondary }]}>
        Get instant answers from your team's shared research reports — no commands needed.
        This conversation is private to you.
      </Text>

      <View style={styles.suggestWrap}>
        {SUGGESTIONS.map((s, i) => (
          <TouchableOpacity
            key={i}
            style={[styles.suggestChip, { backgroundColor: COLORS.backgroundCard, borderColor: COLORS.border }]}
            onPress={() => onPick(s)}
            activeOpacity={0.75}
            disabled={disabled}
          >
            <Ionicons name="arrow-forward-circle-outline" size={16} color={COLORS.primary} />
            <Text style={[styles.suggestText, { color: COLORS.textPrimary }]}>{s}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </Animated.View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  topBarSafe: { borderBottomWidth: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.md, gap: 10, height: TOP_BAR_HEIGHT },
  backBtn: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center', borderWidth: 1, flexShrink: 0 },
  topCenter: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  titleAvatar: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  topTitle: { fontSize: FONTS.sizes.base, fontWeight: '800' },
  topSub: { fontSize: FONTS.sizes.xs, marginTop: 1, paddingLeft: 34 },
  iconBtn: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1, flexShrink: 0 },

  privacyBar: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: SPACING.lg, paddingVertical: 8, borderBottomWidth: 1 },
  privacyText: { fontSize: FONTS.sizes.xs, flex: 1 },

  listContent: { padding: SPACING.md, paddingBottom: SPACING.lg, gap: 4 },
  listFooterTap: { height: 40, width: '100%' },

  row: { flexDirection: 'row', marginVertical: 6, maxWidth: '100%' },
  rowUser: { justifyContent: 'flex-end' },
  rowAI: { justifyContent: 'flex-start', gap: 8 },
  aiAvatar: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginTop: 2, flexShrink: 0 },
  aiCol: { flex: 1, alignItems: 'flex-start' },
  bubble: { borderRadius: RADIUS.xl, paddingHorizontal: 14, paddingVertical: 11, maxWidth: '88%' },
  bubbleUser: { borderBottomRightRadius: 6 },
  bubbleAI: { borderWidth: 1, borderBottomLeftRadius: 6, maxWidth: '100%', alignSelf: 'stretch' },
  userText: { fontSize: FONTS.sizes.base, lineHeight: 22 },

  sourcesWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  sourceChip: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: 220, borderWidth: 1, borderRadius: RADIUS.full, paddingHorizontal: 10, paddingVertical: 4 },
  sourceChipText: { fontSize: FONTS.sizes.xs, fontWeight: '600', flexShrink: 1 },

  retryBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8, paddingVertical: 6, paddingHorizontal: 12, borderRadius: RADIUS.full, borderWidth: 1 },
  retryText: { fontSize: FONTS.sizes.sm, fontWeight: '700' },

  typingRow: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 2 },
  typingDot: { width: 7, height: 7, borderRadius: 4 },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACING.xl, gap: 12 },
  emptyIcon: { width: 76, height: 76, borderRadius: 24, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.xs },
  emptyTitle: { fontSize: FONTS.sizes['2xl'], fontWeight: '800' },
  emptyDesc: { fontSize: FONTS.sizes.base, textAlign: 'center', lineHeight: 22, maxWidth: 320 },
  suggestWrap: { width: '100%', gap: 10, marginTop: SPACING.md },
  suggestChip: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: RADIUS.lg, paddingHorizontal: 14, paddingVertical: 13 },
  suggestText: { fontSize: FONTS.sizes.sm, fontWeight: '600', flex: 1 },

  inputBar: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: SPACING.md, paddingTop: 10, borderTopWidth: 1 },
  inputWrap: { flex: 1, borderRadius: RADIUS.xl, borderWidth: 1, paddingHorizontal: 14, paddingVertical: Platform.OS === 'ios' ? 10 : 4, maxHeight: 130, justifyContent: 'center' },
  input: { fontSize: FONTS.sizes.base, maxHeight: 110, padding: 0, margin: 0 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
});