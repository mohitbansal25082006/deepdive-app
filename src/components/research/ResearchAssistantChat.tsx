// src/components/research/ResearchAssistantChat.tsx
// Part 6 — AI Research Assistant: Full Chat Component
//
// This replaces the old FollowUpChat.tsx for the upgraded assistant.
//
// Features:
//   • Embedding status banner (progress bar while indexing, "RAG Ready" badge)
//   • Mode selector strip (7 modes, each with icon + color)
//   • Quick action chips (pre-built prompts for each mode)
//   • Message list with RAG metadata (confidence badge, # chunks retrieved)
//   • Suggested follow-up prompts after each assistant response
//   • Typing indicator with animated dots
//   • Smooth keyboard avoidance (messages scroll up, input stays visible)
//   • Error state with retry option
//
// Props:
//   assistant    — return value of useResearchAssistant()
//   reportTitle  — used in empty state

import React, { useRef, useEffect, useState } from 'react';
import {
  View, Text, TextInput, Pressable, ScrollView,
  ActivityIndicator, StyleSheet, Animated as RNAnimated,
} from 'react-native';
import { LinearGradient }   from 'expo-linear-gradient';
import { Ionicons }          from '@expo/vector-icons';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { AssistantMessage, AssistantMode } from '../../types';
import { AssistantModeSelector }           from './AssistantModeSelector';
import { QUICK_ACTIONS, MODE_CONFIG_MAP }  from '../../services/agents/researchAssistantAgent';
import { COLORS, FONTS, SPACING, RADIUS }  from '../../constants/theme';
import type { UseResearchAssistantReturn } from '../../hooks/useResearchAssistant';

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  assistant:   UseResearchAssistantReturn;
  reportTitle: string;
}

// ─── Confidence Badge ─────────────────────────────────────────────────────────

function ConfidenceBadge({ level }: { level: 'high' | 'medium' | 'low' }) {
  const colors = {
    high:   COLORS.success,
    medium: COLORS.warning,
    low:    COLORS.error,
  };
  const labels = { high: 'High', medium: 'Medium', low: 'Low' };
  const icons  = { high: 'shield-checkmark', medium: 'shield-half', low: 'shield-outline' };

  return (
    <View style={[styles.confidenceBadge, { borderColor: colors[level] + '40', backgroundColor: colors[level] + '12' }]}>
      <Ionicons name={icons[level] as any} size={9} color={colors[level]} />
      <Text style={[styles.confidenceText, { color: colors[level] }]}>
        {labels[level]} confidence
      </Text>
    </View>
  );
}

// ─── RAG Badge ────────────────────────────────────────────────────────────────

function RAGBadge({ chunkCount }: { chunkCount: number }) {
  if (chunkCount === 0) return null;
  return (
    <View style={styles.ragBadge}>
      <Ionicons name="git-network-outline" size={9} color={COLORS.primary} />
      <Text style={styles.ragBadgeText}>{chunkCount} source{chunkCount !== 1 ? 's' : ''}</Text>
    </View>
  );
}

// ─── Typing Indicator ─────────────────────────────────────────────────────────

function TypingDots() {
  const dots = [
    useRef(new RNAnimated.Value(0)).current,
    useRef(new RNAnimated.Value(0)).current,
    useRef(new RNAnimated.Value(0)).current,
  ];

  useEffect(() => {
    const animations = dots.map((dot, i) =>
      RNAnimated.loop(
        RNAnimated.sequence([
          RNAnimated.delay(i * 150),
          RNAnimated.timing(dot, { toValue: 1, duration: 350, useNativeDriver: true }),
          RNAnimated.timing(dot, { toValue: 0, duration: 350, useNativeDriver: true }),
        ])
      )
    );
    animations.forEach(a => a.start());
    return () => animations.forEach(a => a.stop());
  }, []);

  return (
    <View style={styles.typingWrap}>
      <LinearGradient colors={COLORS.gradientPrimary}
        style={styles.typingAvatar}
      >
        <Ionicons name="sparkles" size={10} color="#FFF" />
      </LinearGradient>
      <View style={styles.typingBubble}>
        {dots.map((dot, i) => (
          <RNAnimated.View
            key={i}
            style={[styles.typingDot, {
              opacity: dot,
              transform: [{ translateY: dot.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) }],
            }]}
          />
        ))}
      </View>
    </View>
  );
}

// ─── Embedding Progress Banner ────────────────────────────────────────────────

function EmbedBanner({
  isEmbedding,
  isEmbedded,
  progress,
  onRetry,
}: {
  isEmbedding: boolean;
  isEmbedded:  boolean;
  progress:    { done: number; total: number } | null;
  onRetry:     () => void;
}) {
  if (isEmbedded) {
    return (
      <View style={styles.embedBannerReady}>
        <Ionicons name="sparkles" size={12} color={COLORS.success} />
        <Text style={styles.embedBannerReadyText}>RAG Ready — Semantic search active</Text>
      </View>
    );
  }

  if (isEmbedding) {
    const pct = progress && progress.total > 0
      ? Math.round((progress.done / progress.total) * 100)
      : null;

    return (
      <View style={styles.embedBannerLoading}>
        <ActivityIndicator size="small" color={COLORS.primary} />
        <View style={{ flex: 1 }}>
          <Text style={styles.embedBannerLoadingText}>
            Indexing report for semantic search
            {pct !== null ? ` · ${pct}%` : '…'}
          </Text>
          {progress && progress.total > 0 && (
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${pct ?? 0}%` as any }]} />
            </View>
          )}
        </View>
      </View>
    );
  }

  return (
    <Pressable onPress={onRetry} style={styles.embedBannerFallback}>
      <Ionicons name="cloud-offline-outline" size={12} color={COLORS.warning} />
      <Text style={styles.embedBannerFallbackText}>Using keyword fallback mode</Text>
      <Text style={[styles.embedBannerFallbackText, { color: COLORS.primary, marginLeft: 4 }]}>
        Retry
      </Text>
    </Pressable>
  );
}

// ─── Message Bubble ───────────────────────────────────────────────────────────

function MessageBubble({
  msg,
  isLastAssistant,
  onFollowUp,
}: {
  msg:              AssistantMessage;
  isLastAssistant?: boolean;
  onFollowUp:       (text: string) => void;
}) {
  const isUser = msg.role === 'user';
  const modeCfg = msg.mode ? MODE_CONFIG_MAP[msg.mode] : null;

  return (
    <Animated.View
      entering={FadeInDown.duration(300).springify()}
      style={[
        styles.bubbleRow,
        isUser ? styles.bubbleRowUser : styles.bubbleRowAssistant,
      ]}
    >
      {/* Assistant avatar */}
      {!isUser && (
        <LinearGradient
          colors={modeCfg ? [modeCfg.color, modeCfg.color + 'AA'] : COLORS.gradientPrimary}
          style={styles.assistantAvatar}
        >
          <Ionicons
            name={(modeCfg?.icon ?? 'sparkles') as any}
            size={12}
            color="#FFF"
          />
        </LinearGradient>
      )}

      <View style={{ maxWidth: '86%', gap: 6 }}>
        {/* Assistant label row */}
        {!isUser && (
          <View style={styles.assistantLabel}>
            <Text style={styles.assistantLabelText}>DeepDive AI</Text>
            {modeCfg && modeCfg.mode !== 'general' && (
              <View style={[styles.modePill, { backgroundColor: modeCfg.color + '20', borderColor: modeCfg.color + '40' }]}>
                <Text style={[styles.modePillText, { color: modeCfg.color }]}>
                  {modeCfg.label}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Bubble */}
        <View style={[
          styles.bubble,
          isUser ? styles.bubbleUser : styles.bubbleAssistant,
        ]}>
          <Text style={[
            styles.bubbleText,
            isUser ? styles.bubbleTextUser : styles.bubbleTextAssistant,
          ]}>
            {msg.content}
          </Text>
        </View>

        {/* Metadata row (assistant only) */}
        {!isUser && (msg.confidence || (msg.retrievedChunks?.length ?? 0) > 0) && (
          <View style={styles.metaRow}>
            {msg.confidence && <ConfidenceBadge level={msg.confidence} />}
            <RAGBadge chunkCount={msg.retrievedChunks?.length ?? 0} />
            {msg.isRAGPowered && (
              <View style={styles.ragPoweredBadge}>
                <Ionicons name="git-network-outline" size={9} color={COLORS.primary} />
                <Text style={styles.ragPoweredText}>RAG</Text>
              </View>
            )}
          </View>
        )}

        {/* Suggested follow-ups (last assistant message only) */}
        {!isUser && isLastAssistant && Array.isArray(msg.suggestedFollowUps) && msg.suggestedFollowUps.length > 0 && (
          <View style={styles.followUpRow}>
            {msg.suggestedFollowUps.slice(0, 3).map((q, i) => (
              <Pressable
                key={i}
                onPress={() => onFollowUp(q)}
                style={styles.followUpChip}
              >
                <Text style={styles.followUpChipText}>{q}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>
    </Animated.View>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({
  reportTitle,
  activeMode,
  onSend,
}: {
  reportTitle: string;
  activeMode:  AssistantMode;
  onSend:      (q: string, mode?: AssistantMode) => void;
}) {
  const modeCfg = MODE_CONFIG_MAP[activeMode];

  return (
    <Animated.View entering={FadeInDown.duration(400)} style={styles.emptyWrap}>
      {/* Hero icon */}
      <LinearGradient
        colors={[modeCfg.color, modeCfg.color + 'AA']}
        style={styles.emptyIcon}
      >
        <Ionicons name={modeCfg.icon as any} size={28} color="#FFF" />
      </LinearGradient>

      <Text style={styles.emptyTitle}>
        {activeMode === 'general' ? 'Ask your research assistant' : modeCfg.label}
      </Text>
      <Text style={styles.emptySubtitle} numberOfLines={2}>
        {activeMode === 'general'
          ? `Explore "${reportTitle}" with AI-powered answers`
          : modeCfg.description}
      </Text>

      {/* Quick action chips for the active mode */}
      <View style={styles.exampleWrap}>
        {(modeCfg.examplePrompts ?? []).slice(0, 3).map((q, i) => (
          <Pressable
            key={i}
            onPress={() => onSend(q, activeMode)}
            style={styles.exampleChip}
          >
            <Ionicons name="arrow-forward-circle-outline" size={14} color={modeCfg.color} />
            <Text style={[styles.exampleChipText, { color: modeCfg.color + 'DD' }]}>{q}</Text>
          </Pressable>
        ))}
      </View>
    </Animated.View>
  );
}

// ─── Quick Actions Row ────────────────────────────────────────────────────────

function QuickActionsRow({ onSend }: { onSend: (q: string, mode: AssistantMode) => void }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.quickActionsStrip}
      keyboardShouldPersistTaps="handled"
    >
      {QUICK_ACTIONS.map(action => (
        <Pressable
          key={action.mode}
          onPress={() => onSend(action.query, action.mode)}
          style={[styles.quickChip, { borderColor: action.color + '40' }]}
        >
          <Ionicons name={action.icon as any} size={13} color={action.color} />
          <Text style={[styles.quickChipText, { color: action.color }]}>{action.label}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ResearchAssistantChat({ assistant, reportTitle }: Props) {
  const {
    messages,
    isEmbedding,
    isSending,
    isEmbedded,
    embedProgress,
    activeMode,
    error,
    sendMessage,
    setMode,
    retryEmbed,
  } = assistant;

  const [inputText, setInputText] = useState('');
  const scrollRef = useRef<ScrollView>(null);

  // Auto-scroll to bottom when messages update
  useEffect(() => {
    if (messages.length > 0 || isSending) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    }
  }, [messages.length, isSending]);

  const handleSend = (text?: string, mode?: AssistantMode) => {
    const t = (text ?? inputText).trim();
    if (!t || isSending) return;
    setInputText('');
    sendMessage(t, mode);
  };

  // Find the last assistant message index for showing follow-ups
  const lastAssistantIdx = [...messages].reverse().findIndex(m => m.role === 'assistant');
  const lastAssistantId  = lastAssistantIdx >= 0
    ? messages[messages.length - 1 - lastAssistantIdx]?.id
    : null;

  const modeCfg = MODE_CONFIG_MAP[activeMode];
  const hasMessages = messages.length > 0;

  return (
    <View style={styles.container}>

      {/* ── Embed status banner ─────────────────────────────────────────── */}
      <EmbedBanner
        isEmbedding={isEmbedding}
        isEmbedded={isEmbedded}
        progress={embedProgress}
        onRetry={retryEmbed}
      />

      {/* ── Mode selector ───────────────────────────────────────────────── */}
      <AssistantModeSelector
        activeMode={activeMode}
        onSelect={setMode}
        disabled={isSending}
      />

      {/* ── Quick actions (only when no messages) ───────────────────────── */}
      {!hasMessages && (
        <QuickActionsRow onSend={handleSend} />
      )}

      {/* ── Message list ────────────────────────────────────────────────── */}
      <ScrollView
        ref={scrollRef}
        style={styles.messageList}
        contentContainerStyle={[
          styles.messageListContent,
          !hasMessages && styles.messageListEmpty,
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        {/* Empty state */}
        {!hasMessages && (
          <EmptyState
            reportTitle={reportTitle}
            activeMode={activeMode}
            onSend={handleSend}
          />
        )}

        {/* Messages */}
        {messages.map(msg => (
          <MessageBubble
            key={msg.id}
            msg={msg}
            isLastAssistant={msg.id === lastAssistantId}
            onFollowUp={q => handleSend(q)}
          />
        ))}

        {/* Typing indicator */}
        {isSending && <TypingDots />}

        {/* Error banner */}
        {error && !isSending && (
          <Animated.View entering={FadeInDown.duration(300)} style={styles.errorBanner}>
            <Ionicons name="warning-outline" size={14} color={COLORS.error} />
            <Text style={styles.errorText} numberOfLines={3}>{error}</Text>
          </Animated.View>
        )}
      </ScrollView>

      {/* ── Input row ───────────────────────────────────────────────────── */}
      <View style={styles.inputRow}>
        {/* Active mode indicator pill */}
        <View style={[styles.inputModePill, { backgroundColor: modeCfg.color + '18', borderColor: modeCfg.color + '40' }]}>
          <Ionicons name={modeCfg.icon as any} size={11} color={modeCfg.color} />
        </View>

        <TextInput
          value={inputText}
          onChangeText={setInputText}
          placeholder={modeCfg.examplePrompts?.[0] ?? 'Ask anything about this research…'}
          placeholderTextColor={COLORS.textMuted}
          style={styles.input}
          onSubmitEditing={() => handleSend()}
          returnKeyType="send"
          blurOnSubmit={false}
          multiline={false}
          editable={!isSending}
        />

        <Pressable
          onPress={() => handleSend()}
          disabled={!inputText.trim() || isSending}
          style={{ opacity: !inputText.trim() || isSending ? 0.4 : 1 }}
        >
          <LinearGradient
            colors={inputText.trim() ? [modeCfg.color, modeCfg.color + 'BB'] : ['#2A2A4A', '#1A1A35']}
            style={styles.sendBtn}
          >
            {isSending
              ? <ActivityIndicator size="small" color="#FFF" />
              : <Ionicons name="arrow-up" size={18} color="#FFF" />
            }
          </LinearGradient>
        </Pressable>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.backgroundCard,
  },

  // ── Embed banner ────────────────────────────────────────────────────────────
  embedBannerReady: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    backgroundColor: COLORS.success + '10',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.success + '20',
  },
  embedBannerReadyText: {
    color: COLORS.success,
    fontSize: FONTS.sizes.xs,
    fontWeight: '600',
  },
  embedBannerLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: SPACING.md,
    paddingVertical: 8,
    backgroundColor: COLORS.primary + '08',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.primary + '15',
  },
  embedBannerLoadingText: {
    color: COLORS.primary,
    fontSize: FONTS.sizes.xs,
    marginBottom: 4,
  },
  progressTrack: {
    height: 3,
    backgroundColor: COLORS.border,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: 3,
    backgroundColor: COLORS.primary,
    borderRadius: 2,
  },
  embedBannerFallback: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    backgroundColor: COLORS.warning + '10',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.warning + '20',
  },
  embedBannerFallbackText: {
    color: COLORS.warning,
    fontSize: FONTS.sizes.xs,
  },

  // ── Quick actions ────────────────────────────────────────────────────────────
  quickActionsStrip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    gap: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  quickChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    backgroundColor: COLORS.backgroundElevated,
  },
  quickChipText: {
    fontSize: FONTS.sizes.xs,
    fontWeight: '600',
  },

  // ── Message list ─────────────────────────────────────────────────────────────
  messageList: {
    flex: 1,
  },
  messageListContent: {
    padding: SPACING.md,
    paddingBottom: SPACING.sm,
    gap: 12,
  },
  messageListEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
  },

  // ── Empty state ──────────────────────────────────────────────────────────────
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: SPACING.xl,
    paddingHorizontal: SPACING.lg,
  },
  emptyIcon: {
    width: 60,
    height: 60,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  emptyTitle: {
    color: COLORS.textPrimary,
    fontSize: FONTS.sizes.md,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 6,
  },
  emptySubtitle: {
    color: COLORS.textMuted,
    fontSize: FONTS.sizes.sm,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: SPACING.lg,
  },
  exampleWrap: {
    width: '100%',
    gap: 8,
  },
  exampleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: SPACING.sm,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.backgroundElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  exampleChipText: {
    fontSize: FONTS.sizes.sm,
    flex: 1,
    lineHeight: 18,
  },

  // ── Message bubbles ───────────────────────────────────────────────────────────
  bubbleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  bubbleRowUser: {
    flexDirection: 'row-reverse',
  },
  bubbleRowAssistant: {
    flexDirection: 'row',
  },
  assistantAvatar: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 20,
  },
  assistantLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  assistantLabelText: {
    color: COLORS.textMuted,
    fontSize: FONTS.sizes.xs,
    fontWeight: '600',
  },
  modePill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
    borderWidth: 1,
  },
  modePillText: {
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  bubble: {
    borderRadius: RADIUS.lg,
    padding: SPACING.sm,
  },
  bubbleUser: {
    backgroundColor: COLORS.primary,
    borderBottomRightRadius: 4,
  },
  bubbleAssistant: {
    backgroundColor: COLORS.backgroundElevated,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  bubbleText: {
    fontSize: FONTS.sizes.sm,
    lineHeight: 21,
  },
  bubbleTextUser: {
    color: '#FFFFFF',
  },
  bubbleTextAssistant: {
    color: COLORS.textPrimary,
  },

  // ── Metadata row ──────────────────────────────────────────────────────────────
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 2,
  },
  confidenceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
    borderWidth: 1,
  },
  confidenceText: {
    fontSize: 9,
    fontWeight: '600',
  },
  ragBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primary + '12',
    borderWidth: 1,
    borderColor: COLORS.primary + '30',
  },
  ragBadgeText: {
    color: COLORS.primary,
    fontSize: 9,
    fontWeight: '600',
  },
  ragPoweredBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primary + '10',
  },
  ragPoweredText: {
    color: COLORS.primary,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  // ── Suggested follow-ups ──────────────────────────────────────────────────────
  followUpRow: {
    gap: 6,
    marginTop: 4,
  },
  followUpChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primary + '10',
    borderWidth: 1,
    borderColor: COLORS.primary + '25',
  },
  followUpChipText: {
    color: COLORS.primary,
    fontSize: FONTS.sizes.xs,
    lineHeight: 17,
  },

  // ── Typing indicator ──────────────────────────────────────────────────────────
  typingWrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  typingAvatar: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.backgroundElevated,
    borderRadius: RADIUS.lg,
    borderBottomLeftRadius: 4,
    padding: SPACING.sm,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    minHeight: 38,
  },
  typingDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
  },

  // ── Error banner ──────────────────────────────────────────────────────────────
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: SPACING.sm,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.error + '12',
    borderWidth: 1,
    borderColor: COLORS.error + '30',
    marginTop: 4,
  },
  errorText: {
    color: COLORS.error,
    fontSize: FONTS.sizes.xs,
    flex: 1,
    lineHeight: 17,
  },

  // ── Input row ─────────────────────────────────────────────────────────────────
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    gap: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.backgroundCard,
  },
  inputModePill: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    flexShrink: 0,
  },
  input: {
    flex: 1,
    backgroundColor: COLORS.backgroundElevated,
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    color: COLORS.textPrimary,
    fontSize: FONTS.sizes.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    maxHeight: 80,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
});