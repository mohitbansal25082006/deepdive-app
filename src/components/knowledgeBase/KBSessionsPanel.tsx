// src/components/knowledgeBase/KBSessionsPanel.tsx
// Part 43 — REDESIGNED: matches research-input.tsx aesthetic.
// No springify on list items. Controlled FadeIn.duration(). All logic unchanged.

import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, Modal, Pressable, TextInput, FlatList,
  StyleSheet, TouchableWithoutFeedback, Alert, ActivityIndicator,
  KeyboardAvoidingView, Platform,
  Animated as RNAnimated, Easing as RNEasing,
} from 'react-native';
import { LinearGradient }     from 'expo-linear-gradient';
import { Ionicons }           from '@expo/vector-icons';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import {
  useKBSessions, KBSessionSummary, formatRelativeTime,
} from '../../hooks/useKBSessions';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';

const SESSION_GRADIENTS: readonly [string, string][] = [
  ['#6C63FF', '#8B5CF6'], ['#FF6584', '#FF8E53'], ['#43E97B', '#38F9D7'],
  ['#4FACFE', '#00F2FE'], ['#FA709A', '#FEE140'], ['#30CFD0', '#667EEA'],
  ['#F093FB', '#F5576C'], ['#A18CD1', '#FBC2EB'],
];
const getGradient = (i: number) => SESSION_GRADIENTS[i % SESSION_GRADIENTS.length];

// ─── Session Card ──────────────────────────────────────────────────────────────
interface SessionCardProps {
  session: KBSessionSummary; index: number; isActive: boolean;
  onSelect: () => void; onRename: (newTitle: string) => void; onDelete: () => void;
}

function SessionCard({ session, index, isActive, onSelect, onRename, onDelete }: SessionCardProps) {
  const [showActions, setShowActions] = useState(false);
  const [isEditing,   setIsEditing]   = useState(false);
  const [editTitle,   setEditTitle]   = useState(session.title);
  const editRef  = useRef<TextInput | null>(null);
  const gradient = getGradient(index);

  useEffect(() => { if (!isEditing) setEditTitle(session.title); }, [session.title, isEditing]);

  const handleStartRename = () => { setShowActions(false); setIsEditing(true); setEditTitle(session.title); setTimeout(() => editRef.current?.focus(), 80); };
  const handleConfirmRename = () => { const t = editTitle.trim(); if (t && t !== session.title) onRename(t); setIsEditing(false); };
  const handleDelete = () => {
    setShowActions(false);
    Alert.alert('Delete Chat', `Delete "${session.title}"?\n\nAll messages will be permanently removed.`,
      [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: onDelete }]);
  };

  return (
    <Animated.View entering={FadeIn.duration(250)}>
      <Pressable
        onPress={() => { if (isEditing) return; setShowActions(false); onSelect(); }}
        onLongPress={() => setShowActions(a => !a)}
        delayLongPress={400}
        style={({ pressed }) => [styles.card, isActive && styles.cardActive, pressed && !isEditing && { opacity: 0.80 }]}
      >
        {isActive && (
          <LinearGradient colors={gradient} style={styles.cardAccentBar} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} />
        )}

        {/* Icon orb — matches depth card icon orb style */}
        <LinearGradient colors={gradient} style={styles.cardAvatar}>
          <Ionicons name={session.messageCount === 0 ? 'chatbubble-outline' : 'chatbubbles'} size={14} color="#FFF" />
        </LinearGradient>

        <View style={styles.cardContent}>
          {isEditing ? (
            <TextInput ref={editRef} value={editTitle} onChangeText={setEditTitle} onBlur={handleConfirmRename} onSubmitEditing={handleConfirmRename} style={styles.editInput} returnKeyType="done" selectTextOnFocus maxLength={80} />
          ) : (
            <View style={styles.titleRow}>
              <Text style={[styles.cardTitle, isActive && styles.cardTitleActive]} numberOfLines={1}>{session.title}</Text>
              {isActive && (
                <View style={styles.activeBadge}>
                  <Text style={styles.activeBadgeText}>Active</Text>
                </View>
              )}
            </View>
          )}

          {session.lastMessagePreview
            ? <Text style={styles.cardPreview} numberOfLines={1}>{session.lastMessageRole === 'user' ? 'You: ' : 'AI: '}{session.lastMessagePreview}</Text>
            : <Text style={styles.cardPreviewEmpty}>No messages yet</Text>
          }

          <View style={styles.cardMeta}>
            <Ionicons name="time-outline" size={9} color={COLORS.textMuted} />
            <Text style={styles.cardMetaText}>{formatRelativeTime(session.updatedAt)}</Text>
            {session.messageCount > 0 && (
              <>
                <View style={styles.metaDot} />
                <Ionicons name="chatbubble-outline" size={9} color={COLORS.textMuted} />
                <Text style={styles.cardMetaText}>{session.messageCount} msg{session.messageCount !== 1 ? 's' : ''}</Text>
              </>
            )}
          </View>
        </View>

        {!showActions && !isEditing && (
          <Ionicons name="chevron-forward" size={13} color={isActive ? COLORS.primary : COLORS.textMuted} />
        )}
      </Pressable>

      {showActions && (
        <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(150)} style={styles.actionsRow}>
          <Pressable onPress={handleStartRename} style={[styles.actionBtn, styles.actionBtnRename]}>
            <Ionicons name="pencil-outline" size={12} color={COLORS.primary} />
            <Text style={[styles.actionBtnText, { color: COLORS.primary }]}>Rename</Text>
          </Pressable>
          <Pressable onPress={handleDelete} style={[styles.actionBtn, styles.actionBtnDelete]}>
            <Ionicons name="trash-outline" size={12} color={COLORS.error} />
            <Text style={[styles.actionBtnText, { color: COLORS.error }]}>Delete</Text>
          </Pressable>
          <Pressable onPress={() => setShowActions(false)} style={[styles.actionBtn, styles.actionBtnCancel]}>
            <Ionicons name="close-outline" size={12} color={COLORS.textMuted} />
            <Text style={[styles.actionBtnText, { color: COLORS.textMuted }]}>Cancel</Text>
          </Pressable>
        </Animated.View>
      )}
    </Animated.View>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────
function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <View style={styles.emptyWrap}>
      <View style={styles.emptyIconWrap}>
        <Ionicons name="chatbubbles-outline" size={28} color={COLORS.primary} />
      </View>
      <Text style={styles.emptyTitle}>No chats yet</Text>
      <Text style={styles.emptySubtitle}>Start a conversation with your Knowledge Base.</Text>
      <Pressable onPress={onNew} style={styles.emptyBtn}>
        <LinearGradient colors={['#6C63FF', '#8B5CF6']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.emptyBtnGrad}>
          <Ionicons name="add" size={14} color="#FFF" />
          <Text style={styles.emptyBtnText}>Start New Chat</Text>
        </LinearGradient>
      </Pressable>
    </View>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface Props {
  visible: boolean; activeSessionId: string | null;
  onClose: () => void; onSelectSession: (sessionId: string, title: string) => void;
  onNewSession: () => void;
}

export function KBSessionsPanel({ visible, activeSessionId, onClose, onSelectSession, onNewSession }: Props) {
  const {
    filteredSessions, sessions, isLoading, searchQuery, setSearchQuery,
    loadSessions, renameSession, deleteSession,
  } = useKBSessions();

  useEffect(() => { if (visible) loadSessions(); }, [visible]);

  const handleSelect = useCallback((s: KBSessionSummary) => { onSelectSession(s.id, s.title); onClose(); }, [onSelectSession, onClose]);
  const handleNew    = useCallback(() => { onNewSession(); onClose(); }, [onNewSession, onClose]);

  const slideAnim    = useRef(new RNAnimated.Value(-320)).current;
  const backdropAnim = useRef(new RNAnimated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    slideAnim.setValue(-320); backdropAnim.setValue(0);
    RNAnimated.parallel([
      RNAnimated.timing(slideAnim,    { toValue: 0, duration: 240, easing: RNEasing.out(RNEasing.cubic), useNativeDriver: true }),
      RNAnimated.timing(backdropAnim, { toValue: 1, duration: 180, useNativeDriver: true }),
    ]).start();
  }, [visible]);

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableWithoutFeedback onPress={onClose}>
          <RNAnimated.View style={[styles.backdrop, { opacity: backdropAnim }]} />
        </TouchableWithoutFeedback>

        <RNAnimated.View style={[styles.panel, { transform: [{ translateX: slideAnim }] }]}>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

            {/* Header */}
            <View style={styles.panelHeader}>
              <LinearGradient colors={[`${COLORS.primary}35`, 'transparent']} style={styles.panelHeaderGlow} />
              <View style={styles.panelTitleRow}>
                <LinearGradient colors={['#7C3AED', '#6C63FF']} style={styles.panelIcon}>
                  <Ionicons name="library" size={13} color="#FFF" />
                </LinearGradient>
                <View>
                  <Text style={styles.panelTitle}>Chat History</Text>
                  <Text style={styles.panelSubtitle}>{sessions.length} conversation{sessions.length !== 1 ? 's' : ''}</Text>
                </View>
              </View>
              <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={8}>
                <Ionicons name="close" size={17} color={COLORS.textMuted} />
              </Pressable>
            </View>

            {/* New chat */}
            <Pressable onPress={handleNew} style={({ pressed }) => [styles.newChatBtn, pressed && { opacity: 0.85 }]}>
              <LinearGradient colors={['#6C63FF', '#8B5CF6']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.newChatGrad}>
                <Ionicons name="add-circle-outline" size={16} color="#FFF" />
                <Text style={styles.newChatText}>New Chat</Text>
              </LinearGradient>
            </Pressable>

            {/* Search */}
            {sessions.length > 1 && (
              <View style={styles.searchRow}>
                <Ionicons name="search-outline" size={13} color={COLORS.textMuted} />
                <TextInput value={searchQuery} onChangeText={setSearchQuery} placeholder="Search chats…" placeholderTextColor={COLORS.textMuted} style={styles.searchInput} returnKeyType="search" clearButtonMode="while-editing" />
                {searchQuery.length > 0 && (
                  <Pressable onPress={() => setSearchQuery('')} hitSlop={6}>
                    <Ionicons name="close-circle" size={13} color={COLORS.textMuted} />
                  </Pressable>
                )}
              </View>
            )}

            {/* List */}
            {isLoading && sessions.length === 0 ? (
              <View style={styles.loadingWrap}><ActivityIndicator color={COLORS.primary} /><Text style={styles.loadingText}>Loading chats…</Text></View>
            ) : filteredSessions.length === 0 ? (
              searchQuery
                ? <View style={styles.noResultsWrap}><Ionicons name="search-outline" size={24} color={COLORS.textMuted} /><Text style={styles.noResultsText}>No chats match "{searchQuery}"</Text></View>
                : <EmptyState onNew={handleNew} />
            ) : (
              <FlatList
                data={filteredSessions} keyExtractor={item => item.id}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
                renderItem={({ item, index }) => (
                  <SessionCard
                    session={item} index={index} isActive={item.id === activeSessionId}
                    onSelect={() => handleSelect(item)}
                    onRename={t => renameSession(item.id, t)}
                    onDelete={() => deleteSession(item.id)}
                  />
                )}
                ItemSeparatorComponent={() => <View style={styles.separator} />}
              />
            )}

            {/* Footer */}
            <View style={styles.footer}>
              <Ionicons name="information-circle-outline" size={10} color={COLORS.textMuted} />
              <Text style={styles.footerText}>Long press a chat to rename or delete</Text>
            </View>
          </KeyboardAvoidingView>
        </RNAnimated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay:  { flex: 1, flexDirection: 'row' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  panel: { position: 'absolute', top: 0, left: 0, bottom: 0, width: '78%', backgroundColor: COLORS.backgroundCard, borderRightWidth: 1, borderRightColor: `${COLORS.primary}18`, shadowColor: '#000', shadowOffset: { width: 4, height: 0 }, shadowOpacity: 0.4, shadowRadius: 20, elevation: 20 },

  panelHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.md, paddingTop: 56, paddingBottom: SPACING.sm, borderBottomWidth: 1, borderBottomColor: `${COLORS.primary}15`, overflow: 'hidden' },
  panelHeaderGlow: { position: 'absolute', top: 0, left: 0, right: 0, height: 1.5 },
  panelTitleRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  panelIcon: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  panelTitle: { color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '800' },
  panelSubtitle: { color: COLORS.textMuted, fontSize: FONTS.sizes.xs },
  closeBtn: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.backgroundElevated, borderWidth: 1, borderColor: COLORS.border },

  newChatBtn: { marginHorizontal: SPACING.md, marginVertical: SPACING.sm, borderRadius: RADIUS.lg, overflow: 'hidden' },
  newChatGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 11, borderRadius: RADIUS.lg },
  newChatText: { color: '#FFF', fontSize: FONTS.sizes.sm, fontWeight: '700' },

  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: SPACING.md, marginBottom: SPACING.sm, paddingHorizontal: SPACING.sm, paddingVertical: 8, backgroundColor: COLORS.backgroundElevated, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: `${COLORS.primary}15` },
  searchInput: { flex: 1, color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, padding: 0 },

  listContent: { paddingHorizontal: SPACING.sm, paddingTop: SPACING.xs, paddingBottom: SPACING.xl },
  separator:   { height: 1, backgroundColor: `${COLORS.border}50`, marginHorizontal: SPACING.sm },

  card: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingHorizontal: SPACING.sm, paddingVertical: SPACING.sm, borderRadius: RADIUS.md, position: 'relative', overflow: 'hidden' },
  cardActive: { backgroundColor: `${COLORS.primary}08` },
  cardAccentBar: { position: 'absolute', left: 0, top: 8, bottom: 8, width: 3, borderRadius: 2 },
  cardAvatar: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  cardContent: { flex: 1, gap: 3 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardTitle: { color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, fontWeight: '600', flex: 1 },
  cardTitleActive: { color: COLORS.textPrimary, fontWeight: '700' },
  activeBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: RADIUS.full, backgroundColor: `${COLORS.primary}15`, borderWidth: 1, borderColor: `${COLORS.primary}28` },
  activeBadgeText: { color: COLORS.primary, fontSize: 9, fontWeight: '700' },
  cardPreview: { color: COLORS.textMuted, fontSize: FONTS.sizes.xs, lineHeight: 16 },
  cardPreviewEmpty: { color: `${COLORS.textMuted}70`, fontSize: FONTS.sizes.xs, fontStyle: 'italic' },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  cardMetaText: { color: COLORS.textMuted, fontSize: 9 },
  metaDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: COLORS.textMuted },
  editInput: { color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '600', borderBottomWidth: 1, borderBottomColor: COLORS.primary, paddingVertical: 2, flex: 1 },

  actionsRow: { flexDirection: 'row', gap: SPACING.xs, paddingHorizontal: SPACING.sm, paddingBottom: SPACING.sm, paddingTop: SPACING.xs },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 7, borderRadius: RADIUS.md, borderWidth: 1 },
  actionBtnRename: { backgroundColor: `${COLORS.primary}08`, borderColor: `${COLORS.primary}22` },
  actionBtnDelete: { backgroundColor: `${COLORS.error}08`,   borderColor: `${COLORS.error}22`   },
  actionBtnCancel: { backgroundColor: COLORS.backgroundElevated, borderColor: COLORS.border     },
  actionBtnText: { fontSize: FONTS.sizes.xs, fontWeight: '600' },

  loadingWrap:   { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACING.sm },
  loadingText:   { color: COLORS.textMuted, fontSize: FONTS.sizes.sm },
  noResultsWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, padding: SPACING.xl },
  noResultsText: { color: COLORS.textMuted, fontSize: FONTS.sizes.sm, textAlign: 'center' },

  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl, gap: SPACING.md },
  emptyIconWrap: { width: 60, height: 60, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: `${COLORS.primary}12`, borderWidth: 1, borderColor: `${COLORS.primary}20`, marginBottom: SPACING.xs },
  emptyTitle: { color: COLORS.textPrimary, fontSize: FONTS.sizes.md, fontWeight: '700', textAlign: 'center' },
  emptySubtitle: { color: COLORS.textMuted, fontSize: FONTS.sizes.sm, textAlign: 'center', lineHeight: 20 },
  emptyBtn: { alignSelf: 'stretch', borderRadius: RADIUS.lg, overflow: 'hidden', marginTop: SPACING.xs },
  emptyBtnGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 11, borderRadius: RADIUS.lg },
  emptyBtnText: { color: '#FFF', fontSize: FONTS.sizes.sm, fontWeight: '700' },

  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: SPACING.sm, paddingHorizontal: SPACING.md, borderTopWidth: 1, borderTopColor: `${COLORS.primary}12` },
  footerText: { color: COLORS.textMuted, fontSize: 9, fontStyle: 'italic' },
});