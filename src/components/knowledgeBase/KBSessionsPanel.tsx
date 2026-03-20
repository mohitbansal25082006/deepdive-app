// src/components/knowledgeBase/KBSessionsPanel.tsx
// KB History — Sessions Drawer Panel
//
// A slide-in panel (from the left) showing the full chat history:
//   • "New Chat" button
//   • Search bar (filters by title + last message preview)
//   • Session cards (title, preview, time, message count, active highlight)
//   • Inline rename: tap the title of any card → TextInput edit mode
//   • Swipe-style action row: long press → Rename / Delete buttons appear
//   • Empty state when no sessions exist
//
// Props:
//   visible          — controls Modal visibility
//   activeSessionId  — highlights the currently open session
//   onClose          — close the panel
//   onSelectSession  — called with (sessionId, sessionTitle) when card tapped
//   onNewSession     — called when "New Chat" button tapped

import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, Modal, Pressable, TextInput, FlatList,
  StyleSheet, TouchableWithoutFeedback, Alert,
  ActivityIndicator, KeyboardAvoidingView, Platform,
  Animated as RNAnimated, Easing as RNEasing,
} from 'react-native';
import { LinearGradient }          from 'expo-linear-gradient';
import { Ionicons }                from '@expo/vector-icons';
// Only FadeIn kept — used for individual session card enter animations.
// SlideInLeft/Easing removed: reanimated ignores .easing() on layout
// animations in this version and falls back to spring, causing a bounce.
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useKBSessions, KBSessionSummary, formatRelativeTime } from '../../hooks/useKBSessions';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';

// ─── Gradient palette for session avatars ─────────────────────────────────────

const SESSION_GRADIENTS: readonly [string, string][] = [
  ['#6C63FF', '#8B5CF6'],
  ['#FF6584', '#FF8E53'],
  ['#43E97B', '#38F9D7'],
  ['#4FACFE', '#00F2FE'],
  ['#FA709A', '#FEE140'],
  ['#30CFD0', '#667EEA'],
  ['#F093FB', '#F5576C'],
  ['#A18CD1', '#FBC2EB'],
];

function getGradient(index: number): readonly [string, string] {
  return SESSION_GRADIENTS[index % SESSION_GRADIENTS.length];
}

// ─── Session Card ─────────────────────────────────────────────────────────────

interface SessionCardProps {
  session:         KBSessionSummary;
  index:           number;
  isActive:        boolean;
  onSelect:        () => void;
  onRename:        (newTitle: string) => void;
  onDelete:        () => void;
}

function SessionCard({
  session, index, isActive, onSelect, onRename, onDelete,
}: SessionCardProps) {
  const [showActions, setShowActions] = useState(false);
  const [isEditing,   setIsEditing]   = useState(false);
  const [editTitle,   setEditTitle]   = useState(session.title);
  const editRef = useRef<TextInput | null>(null);
  const gradient = getGradient(index);

  const handleLongPress = useCallback(() => {
    setShowActions(a => !a);
  }, []);

  const handleStartRename = useCallback(() => {
    setShowActions(false);
    setIsEditing(true);
    setEditTitle(session.title);
    setTimeout(() => editRef.current?.focus(), 80);
  }, [session.title]);

  const handleConfirmRename = useCallback(() => {
    const trimmed = editTitle.trim();
    if (trimmed && trimmed !== session.title) {
      onRename(trimmed);
    }
    setIsEditing(false);
  }, [editTitle, session.title, onRename]);

  const handleDelete = useCallback(() => {
    setShowActions(false);
    Alert.alert(
      'Delete Chat',
      `Delete "${session.title}"?\n\nAll messages will be permanently removed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: onDelete },
      ],
    );
  }, [session.title, onDelete]);

  // Keep editTitle in sync if title changes externally (e.g. auto-rename)
  useEffect(() => {
    if (!isEditing) setEditTitle(session.title);
  }, [session.title, isEditing]);

  return (
    <Animated.View entering={FadeIn.duration(250)}>
      <Pressable
        onPress={() => {
          if (isEditing) return;
          setShowActions(false);
          onSelect();
        }}
        onLongPress={handleLongPress}
        delayLongPress={400}
        style={({ pressed }) => [
          styles.card,
          isActive && styles.cardActive,
          pressed && !isEditing && { opacity: 0.82 },
        ]}
      >
        {/* Active left accent bar */}
        {isActive && (
          <LinearGradient
            colors={gradient}
            style={styles.cardAccentBar}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
          />
        )}

        {/* Session avatar */}
        <LinearGradient
          colors={gradient}
          style={styles.cardAvatar}
        >
          <Ionicons
            name={session.messageCount === 0 ? 'chatbubble-outline' : 'chatbubbles'}
            size={15}
            color="#FFF"
          />
        </LinearGradient>

        {/* Content */}
        <View style={styles.cardContent}>
          {/* Title row */}
          {isEditing ? (
            <TextInput
              ref={editRef}
              value={editTitle}
              onChangeText={setEditTitle}
              onBlur={handleConfirmRename}
              onSubmitEditing={handleConfirmRename}
              style={styles.editInput}
              returnKeyType="done"
              selectTextOnFocus
              maxLength={80}
            />
          ) : (
            <View style={styles.titleRow}>
              <Text
                style={[styles.cardTitle, isActive && styles.cardTitleActive]}
                numberOfLines={1}
              >
                {session.title}
              </Text>
              {isActive && (
                <View style={styles.activeBadge}>
                  <Text style={styles.activeBadgeText}>Active</Text>
                </View>
              )}
            </View>
          )}

          {/* Preview */}
          {session.lastMessagePreview ? (
            <Text style={styles.cardPreview} numberOfLines={1}>
              {session.lastMessageRole === 'user' ? 'You: ' : 'AI: '}
              {session.lastMessagePreview}
            </Text>
          ) : (
            <Text style={styles.cardPreviewEmpty}>No messages yet</Text>
          )}

          {/* Meta row */}
          <View style={styles.cardMeta}>
            <Ionicons name="time-outline" size={10} color={COLORS.textMuted} />
            <Text style={styles.cardMetaText}>
              {formatRelativeTime(session.updatedAt)}
            </Text>
            {session.messageCount > 0 && (
              <>
                <View style={styles.metaDot} />
                <Ionicons name="chatbubble-outline" size={10} color={COLORS.textMuted} />
                <Text style={styles.cardMetaText}>
                  {session.messageCount} msg{session.messageCount !== 1 ? 's' : ''}
                </Text>
              </>
            )}
          </View>
        </View>

        {/* Chevron */}
        {!showActions && !isEditing && (
          <Ionicons
            name="chevron-forward"
            size={14}
            color={isActive ? COLORS.primary : COLORS.textMuted}
          />
        )}
      </Pressable>

      {/* Action row (shown on long press) */}
      {showActions && (
        <Animated.View
          entering={FadeIn.duration(180)}
          exiting={FadeOut.duration(150)}
          style={styles.actionsRow}
        >
          <Pressable
            onPress={handleStartRename}
            style={[styles.actionBtn, styles.actionBtnRename]}
          >
            <Ionicons name="pencil-outline" size={13} color={COLORS.primary} />
            <Text style={[styles.actionBtnText, { color: COLORS.primary }]}>Rename</Text>
          </Pressable>
          <Pressable
            onPress={handleDelete}
            style={[styles.actionBtn, styles.actionBtnDelete]}
          >
            <Ionicons name="trash-outline" size={13} color={COLORS.error} />
            <Text style={[styles.actionBtnText, { color: COLORS.error }]}>Delete</Text>
          </Pressable>
          <Pressable
            onPress={() => setShowActions(false)}
            style={[styles.actionBtn, styles.actionBtnCancel]}
          >
            <Ionicons name="close-outline" size={13} color={COLORS.textMuted} />
            <Text style={[styles.actionBtnText, { color: COLORS.textMuted }]}>Cancel</Text>
          </Pressable>
        </Animated.View>
      )}
    </Animated.View>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <View style={styles.emptyWrap}>
      <LinearGradient
        colors={['#6C63FF20', '#8B5CF610']}
        style={styles.emptyIcon}
      >
        <Ionicons name="chatbubbles-outline" size={32} color={COLORS.primary} />
      </LinearGradient>
      <Text style={styles.emptyTitle}>No chats yet</Text>
      <Text style={styles.emptySubtitle}>
        Start a conversation with your Knowledge Base to see it here.
      </Text>
      <Pressable onPress={onNew} style={styles.emptyBtn}>
        <LinearGradient
          colors={COLORS.gradientPrimary}
          style={styles.emptyBtnGrad}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
        >
          <Ionicons name="add" size={16} color="#FFF" />
          <Text style={styles.emptyBtnText}>Start New Chat</Text>
        </LinearGradient>
      </Pressable>
    </View>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  visible:         boolean;
  activeSessionId: string | null;
  onClose:         () => void;
  onSelectSession: (sessionId: string, title: string) => void;
  onNewSession:    () => void;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function KBSessionsPanel({
  visible,
  activeSessionId,
  onClose,
  onSelectSession,
  onNewSession,
}: Props) {
  const {
    filteredSessions,
    sessions,
    isLoading,
    searchQuery,
    setSearchQuery,
    loadSessions,
    renameSession,
    deleteSession,
  } = useKBSessions();

  // Refresh list whenever panel opens
  useEffect(() => {
    if (visible) loadSessions();
  }, [visible]);

  const handleSelect = useCallback((s: KBSessionSummary) => {
    onSelectSession(s.id, s.title);
    onClose();
  }, [onSelectSession, onClose]);

  const handleNew = useCallback(() => {
    onNewSession();
    onClose();
  }, [onNewSession, onClose]);

  const handleDelete = useCallback(async (id: string) => {
    await deleteSession(id);
    // If deleted the active session, let parent handle it
  }, [deleteSession]);

  // ── RN Animated values for smooth (non-spring) slide + fade ──────────────
  // These must be declared before the early return (rules of hooks).
  const slideAnim    = useRef(new RNAnimated.Value(-320)).current;
  const backdropAnim = useRef(new RNAnimated.Value(0)).current;

  // Re-trigger every time the panel opens
  useEffect(() => {
    if (!visible) return;
    slideAnim.setValue(-320);
    backdropAnim.setValue(0);
    RNAnimated.parallel([
      RNAnimated.timing(slideAnim, {
        toValue:         0,
        duration:        260,
        easing:          RNEasing.out(RNEasing.cubic),
        useNativeDriver: true,
      }),
      RNAnimated.timing(backdropAnim, {
        toValue:         1,
        duration:        200,
        useNativeDriver: true,
      }),
    ]).start();
  }, [visible]);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        {/* ── Backdrop (tap to close) ─────────────────────────────────── */}
        <TouchableWithoutFeedback onPress={onClose}>
          <RNAnimated.View
            style={[styles.backdrop, { opacity: backdropAnim }]}
          />
        </TouchableWithoutFeedback>

        {/* ── Slide-in panel ─────────────────────────────────────────── */}
        <RNAnimated.View
          style={[styles.panel, { transform: [{ translateX: slideAnim }] }]}
        >
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            {/* ── Panel header ───────────────────────────────────────── */}
            <View style={styles.panelHeader}>
              <View style={styles.panelTitleRow}>
                <LinearGradient
                  colors={COLORS.gradientPrimary}
                  style={styles.panelIcon}
                >
                  <Ionicons name="library" size={14} color="#FFF" />
                </LinearGradient>
                <View>
                  <Text style={styles.panelTitle}>Chat History</Text>
                  <Text style={styles.panelSubtitle}>
                    {sessions.length} conversation{sessions.length !== 1 ? 's' : ''}
                  </Text>
                </View>
              </View>
              <Pressable
                onPress={onClose}
                style={styles.closeBtn}
                hitSlop={8}
              >
                <Ionicons name="close" size={20} color={COLORS.textMuted} />
              </Pressable>
            </View>

            {/* ── New Chat button ─────────────────────────────────────── */}
            <Pressable
              onPress={handleNew}
              style={({ pressed }) => [styles.newChatBtn, pressed && { opacity: 0.85 }]}
            >
              <LinearGradient
                colors={COLORS.gradientPrimary}
                style={styles.newChatGrad}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Ionicons name="add-circle-outline" size={18} color="#FFF" />
                <Text style={styles.newChatText}>New Chat</Text>
              </LinearGradient>
            </Pressable>

            {/* ── Search bar ─────────────────────────────────────────── */}
            {sessions.length > 1 && (
              <View style={styles.searchRow}>
                <Ionicons name="search-outline" size={14} color={COLORS.textMuted} />
                <TextInput
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Search chats…"
                  placeholderTextColor={COLORS.textMuted}
                  style={styles.searchInput}
                  returnKeyType="search"
                  clearButtonMode="while-editing"
                />
                {searchQuery.length > 0 && (
                  <Pressable onPress={() => setSearchQuery('')} hitSlop={6}>
                    <Ionicons name="close-circle" size={15} color={COLORS.textMuted} />
                  </Pressable>
                )}
              </View>
            )}

            {/* ── Sessions list ───────────────────────────────────────── */}
            {isLoading && sessions.length === 0 ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator color={COLORS.primary} />
                <Text style={styles.loadingText}>Loading chats…</Text>
              </View>
            ) : filteredSessions.length === 0 ? (
              searchQuery ? (
                <View style={styles.noResultsWrap}>
                  <Ionicons name="search-outline" size={28} color={COLORS.textMuted} />
                  <Text style={styles.noResultsText}>
                    No chats match "{searchQuery}"
                  </Text>
                </View>
              ) : (
                <EmptyState onNew={handleNew} />
              )
            ) : (
              <FlatList
                data={filteredSessions}
                keyExtractor={item => item.id}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
                renderItem={({ item, index }) => (
                  <SessionCard
                    session={item}
                    index={index}
                    isActive={item.id === activeSessionId}
                    onSelect={() => handleSelect(item)}
                    onRename={newTitle => renameSession(item.id, newTitle)}
                    onDelete={() => handleDelete(item.id)}
                  />
                )}
                ItemSeparatorComponent={() => (
                  <View style={styles.separator} />
                )}
              />
            )}

            {/* ── Footer hint ─────────────────────────────────────────── */}
            <View style={styles.footer}>
              <Ionicons name="information-circle-outline" size={11} color={COLORS.textMuted} />
              <Text style={styles.footerText}>
                Long press a chat to rename or delete it
              </Text>
            </View>
          </KeyboardAvoidingView>
        </RNAnimated.View>
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const PANEL_WIDTH = '78%';

const styles = StyleSheet.create({
  // ── Modal overlay ──────────────────────────────────────────────────────────
  overlay: {
    flex: 1,
    flexDirection: 'row',
  },
  backdrop: {
    flex:            1,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },

  // ── Panel ─────────────────────────────────────────────────────────────────
  panel: {
    position:        'absolute',
    top:             0,
    left:            0,
    bottom:          0,
    width:           PANEL_WIDTH,
    backgroundColor: COLORS.backgroundCard,
    borderRightWidth: 1,
    borderRightColor: COLORS.border,
    shadowColor:     '#000',
    shadowOffset:    { width: 4, height: 0 },
    shadowOpacity:   0.35,
    shadowRadius:    16,
    elevation:       20,
  },

  // ── Header ─────────────────────────────────────────────────────────────────
  panelHeader: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal: SPACING.md,
    paddingTop:        56,   // accounts for status bar
    paddingBottom:     SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  panelTitleRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:            SPACING.sm,
  },
  panelIcon: {
    width:          32,
    height:         32,
    borderRadius:   9,
    alignItems:     'center',
    justifyContent: 'center',
  },
  panelTitle: {
    color:      COLORS.textPrimary,
    fontSize:   FONTS.sizes.base,
    fontWeight: '800',
  },
  panelSubtitle: {
    color:     COLORS.textMuted,
    fontSize:  FONTS.sizes.xs,
  },
  closeBtn: {
    width:          34,
    height:         34,
    borderRadius:   10,
    alignItems:     'center',
    justifyContent: 'center',
    backgroundColor: COLORS.backgroundElevated,
    borderWidth:    1,
    borderColor:    COLORS.border,
  },

  // ── New Chat button ────────────────────────────────────────────────────────
  newChatBtn: {
    marginHorizontal: SPACING.md,
    marginVertical:   SPACING.sm,
    borderRadius:     RADIUS.lg,
    overflow:         'hidden',
  },
  newChatGrad: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    gap:             8,
    paddingVertical: 12,
    borderRadius:   RADIUS.lg,
  },
  newChatText: {
    color:      '#FFF',
    fontSize:   FONTS.sizes.sm,
    fontWeight: '700',
  },

  // ── Search ─────────────────────────────────────────────────────────────────
  searchRow: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:                8,
    marginHorizontal:  SPACING.md,
    marginBottom:      SPACING.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical:   8,
    backgroundColor:   COLORS.backgroundElevated,
    borderRadius:      RADIUS.lg,
    borderWidth:       1,
    borderColor:       COLORS.border,
  },
  searchInput: {
    flex:      1,
    color:     COLORS.textPrimary,
    fontSize:  FONTS.sizes.sm,
    padding:   0,
  },

  // ── List ───────────────────────────────────────────────────────────────────
  listContent: {
    paddingHorizontal: SPACING.sm,
    paddingTop:        SPACING.xs,
    paddingBottom:     SPACING.xl,
  },
  separator: {
    height:           1,
    backgroundColor:  COLORS.border + '60',
    marginHorizontal: SPACING.sm,
  },

  // ── Session Card ───────────────────────────────────────────────────────────
  card: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:                SPACING.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical:   SPACING.sm,
    borderRadius:      RADIUS.md,
    position:          'relative',
    overflow:          'hidden',
  },
  cardActive: {
    backgroundColor: COLORS.primary + '10',
  },
  cardAccentBar: {
    position:  'absolute',
    left:      0,
    top:       8,
    bottom:    8,
    width:     3,
    borderRadius: 2,
  },
  cardAvatar: {
    width:          38,
    height:         38,
    borderRadius:   11,
    alignItems:     'center',
    justifyContent: 'center',
    flexShrink:     0,
  },
  cardContent: {
    flex: 1,
    gap:  3,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:            6,
  },
  cardTitle: {
    color:      COLORS.textSecondary,
    fontSize:   FONTS.sizes.sm,
    fontWeight: '600',
    flex:       1,
  },
  cardTitleActive: {
    color:      COLORS.textPrimary,
    fontWeight: '700',
  },
  activeBadge: {
    paddingHorizontal: 6,
    paddingVertical:   2,
    borderRadius:      RADIUS.full,
    backgroundColor:   COLORS.primary + '20',
    borderWidth:       1,
    borderColor:       COLORS.primary + '35',
  },
  activeBadgeText: {
    color:     COLORS.primary,
    fontSize:  9,
    fontWeight: '700',
  },
  cardPreview: {
    color:     COLORS.textMuted,
    fontSize:  FONTS.sizes.xs,
    lineHeight: 16,
  },
  cardPreviewEmpty: {
    color:     COLORS.textMuted + '80',
    fontSize:  FONTS.sizes.xs,
    fontStyle: 'italic',
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:            4,
    marginTop:     2,
  },
  cardMetaText: {
    color:     COLORS.textMuted,
    fontSize:  9,
  },
  metaDot: {
    width:           3,
    height:          3,
    borderRadius:    2,
    backgroundColor: COLORS.textMuted,
  },

  // ── Inline edit ────────────────────────────────────────────────────────────
  editInput: {
    color:             COLORS.textPrimary,
    fontSize:          FONTS.sizes.sm,
    fontWeight:        '600',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.primary,
    paddingVertical:   2,
    flex:              1,
  },

  // ── Action row ─────────────────────────────────────────────────────────────
  actionsRow: {
    flexDirection:     'row',
    gap:                SPACING.xs,
    paddingHorizontal: SPACING.sm,
    paddingBottom:     SPACING.sm,
    paddingTop:        SPACING.xs,
  },
  actionBtn: {
    flex:           1,
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    gap:             5,
    paddingVertical: 8,
    borderRadius:   RADIUS.md,
    borderWidth:    1,
  },
  actionBtnRename: {
    backgroundColor: COLORS.primary + '10',
    borderColor:     COLORS.primary + '30',
  },
  actionBtnDelete: {
    backgroundColor: COLORS.error + '10',
    borderColor:     COLORS.error + '30',
  },
  actionBtnCancel: {
    backgroundColor: COLORS.backgroundElevated,
    borderColor:     COLORS.border,
  },
  actionBtnText: {
    fontSize:   FONTS.sizes.xs,
    fontWeight: '600',
  },

  // ── Loading ─────────────────────────────────────────────────────────────────
  loadingWrap: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
    gap:            SPACING.sm,
  },
  loadingText: {
    color:     COLORS.textMuted,
    fontSize:  FONTS.sizes.sm,
  },

  // ── No results ─────────────────────────────────────────────────────────────
  noResultsWrap: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
    gap:            SPACING.sm,
    padding:        SPACING.xl,
  },
  noResultsText: {
    color:     COLORS.textMuted,
    fontSize:  FONTS.sizes.sm,
    textAlign: 'center',
  },

  // ── Empty state ─────────────────────────────────────────────────────────────
  emptyWrap: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
    padding:        SPACING.xl,
    gap:            SPACING.md,
  },
  emptyIcon: {
    width:          72,
    height:         72,
    borderRadius:   20,
    alignItems:     'center',
    justifyContent: 'center',
    marginBottom:   SPACING.xs,
  },
  emptyTitle: {
    color:      COLORS.textPrimary,
    fontSize:   FONTS.sizes.md,
    fontWeight: '700',
    textAlign:  'center',
  },
  emptySubtitle: {
    color:      COLORS.textMuted,
    fontSize:   FONTS.sizes.sm,
    textAlign:  'center',
    lineHeight: 20,
  },
  emptyBtn: {
    alignSelf:    'stretch',
    borderRadius: RADIUS.lg,
    overflow:     'hidden',
    marginTop:    SPACING.xs,
  },
  emptyBtnGrad: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    gap:             8,
    paddingVertical: 12,
    borderRadius:   RADIUS.lg,
  },
  emptyBtnText: {
    color:      '#FFF',
    fontSize:   FONTS.sizes.sm,
    fontWeight: '700',
  },

  // ── Footer ─────────────────────────────────────────────────────────────────
  footer: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'center',
    gap:                5,
    paddingVertical:   SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderTopWidth:    1,
    borderTopColor:    COLORS.border,
  },
  footerText: {
    color:     COLORS.textMuted,
    fontSize:  9,
    fontStyle: 'italic',
  },
});