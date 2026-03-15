// app/(app)/workspace-chat.tsx
// Part 18D — Screen-focus tracking for suppressing notifications when on screen.
// Fires: notifyChatMessage, notifyReply, notifyMention (only when off-screen).

import React, {
  useState, useCallback, useRef, useEffect, useMemo,
} from 'react';
import {
  View, Text, FlatList, TouchableOpacity, ActivityIndicator,
  TextInput, StyleSheet, Platform, Alert, Keyboard,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown, SlideInUp } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';

import { useAuth }          from '../../src/context/AuthContext';
import { useWorkspaceChat } from '../../src/hooks/useWorkspaceChat';
import { useChatTyping }    from '../../src/hooks/useChatTyping';
import { usePresence }      from '../../src/hooks/usePresence';

import { ChatBubble }       from '../../src/components/workspace/ChatBubble';
import { ChatInput }        from '../../src/components/workspace/ChatInput';
import { ChatPinnedBar }    from '../../src/components/workspace/ChatPinnedBar';
import { ChatMembersPanel } from '../../src/components/workspace/ChatMembersPanel';
import { ChatFileFilter }   from '../../src/components/workspace/ChatFileFilter';

import {
  notifyMention, notifyChatMessage, notifyReply,
} from '../../src/services/workspaceNotificationService';
import {
  setActiveChatWorkspaceId,
} from '../../src/lib/screenState';

import { ChatMessage, ChatAttachment } from '../../src/types/chat';
import { COLORS, FONTS, SPACING, RADIUS } from '../../src/constants/theme';

// ─── Date helpers ─────────────────────────────────────────────────────────────

function isSameDay(a: string, b: string): boolean {
  const da = new Date(a); const db = new Date(b);
  return da.getFullYear() === db.getFullYear()
    && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}
function formatDateLabel(ds: string): string {
  const d = new Date(ds); const now = new Date();
  const yest = new Date(now); yest.setDate(yest.getDate() - 1);
  if (isSameDay(ds, now.toISOString()))  return 'Today';
  if (isSameDay(ds, yest.toISOString())) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

type ListItem =
  | { type: 'message'; message: ChatMessage; isConsecutive: boolean; showAvatar: boolean }
  | { type: 'date';    label: string; id: string }
  | { type: 'loader';  id: string };

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function WorkspaceChatScreen() {
  const { id: workspaceId, name: workspaceName, role: userRole } =
    useLocalSearchParams<{ id: string; name: string; role: string }>();

  const { user, profile } = useAuth();
  const flatListRef   = useRef<FlatList<ListItem>>(null);
  const chat          = useWorkspaceChat(workspaceId ?? null);
  const { typingText, sendTyping } = useChatTyping(workspaceId ?? null);
  const presence      = usePresence(workspaceId ?? null, true);

  const [showSearch,  setShowSearch]  = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [showFiles,   setShowFiles]   = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const searchRef = useRef<TextInput>(null);

  const isOwnerOrEditor = userRole === 'owner' || userRole === 'editor';

  // ── Part 18D: Register / deregister this screen as the active chat ──────────
  useFocusEffect(
    useCallback(() => {
      if (workspaceId) setActiveChatWorkspaceId(workspaceId);
      return () => setActiveChatWorkspaceId(null);
    }, [workspaceId]),
  );

  // ── Part 18D: Notify on incoming messages from OTHER users ──────────────────
  // We track the last known message count to detect new arrivals.
  const prevMsgCountRef = useRef(0);
  const chatRef = useRef(chat);
  useEffect(() => { chatRef.current = chat; }, [chat]);

  useEffect(() => {
    const msgs = chat.messages;
    if (msgs.length === 0) { prevMsgCountRef.current = 0; return; }
    if (msgs.length <= prevMsgCountRef.current) { prevMsgCountRef.current = msgs.length; return; }

    // Only look at genuinely new messages (after initial load)
    const newMsgs = msgs.slice(prevMsgCountRef.current);
    prevMsgCountRef.current = msgs.length;

    if (!workspaceId || !user?.id) return;

    newMsgs.forEach(msg => {
      // Skip our own messages and system messages
      if (msg.userId === user.id || msg.contentType === 'system') return;

      const senderName = msg.author?.fullName ?? msg.author?.username ?? 'Someone';
      const preview    = msg.content?.slice(0, 80) ?? '';

      // Check if this message is a reply to one of OUR messages
      if (msg.replyToId) {
        const original = chatRef.current.messages.find(m => m.id === msg.replyToId);
        if (original?.userId === user.id) {
          notifyReply({
            workspaceId,
            workspaceName: workspaceName ?? 'Workspace',
            replierName:   senderName,
            replyPreview:  preview,
            messageId:     msg.id,
          }).catch(() => {});
          return; // reply notification takes priority over generic message notif
        }
      }

      // Check if we're @mentioned
      if (msg.mentions?.includes(user.id)) {
        notifyMention({
          workspaceId,
          workspaceName: workspaceName ?? 'Workspace',
          mentionerName: senderName,
          messagePreview: preview,
        }).catch(() => {});
        return; // mention notification takes priority
      }

      // Generic new message notification
      notifyChatMessage({
        workspaceId,
        workspaceName: workspaceName ?? 'Workspace',
        senderName,
        messagePreview: preview,
      }).catch(() => {});
    });
  }, [chat.messages.length, workspaceId, workspaceName, user?.id]);

  // ── Access guard ───────────────────────────────────────────────────────────
  if (!isOwnerOrEditor) {
    return (
      <LinearGradient colors={[COLORS.background, COLORS.backgroundCard]} style={{ flex: 1 }}>
        <SafeAreaView style={styles.lockScreen}>
          <View style={styles.lockIcon}><Ionicons name="lock-closed" size={40} color={COLORS.textMuted} /></View>
          <Text style={styles.lockTitle}>Team Chat</Text>
          <Text style={styles.lockDesc}>Chat is only available to workspace owners and editors.{'\n'}Ask your workspace owner to upgrade your role.</Text>
          <TouchableOpacity onPress={() => router.back()} style={styles.lockBackBtn}>
            <Ionicons name="arrow-back-outline" size={16} color="#FFF" />
            <Text style={styles.lockBackBtnText}>Go Back</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  // ── Build list items ───────────────────────────────────────────────────────
  const listItems = useMemo<ListItem[]>(() => {
    const result: ListItem[] = [];
    if (chat.hasMore) result.push({ type: 'loader', id: 'load-more' });
    const messages = chat.searchQuery ? chat.searchResults : chat.messages;
    messages.forEach((msg, i) => {
      const prev = messages[i - 1];
      if (!prev || !isSameDay(prev.createdAt, msg.createdAt)) {
        result.push({ type: 'date', label: formatDateLabel(msg.createdAt), id: `date-${msg.id}` });
      }
      const sameAuthor  = prev && prev.userId === msg.userId && prev.contentType !== 'system';
      const closeInTime = prev && (new Date(msg.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60 * 1000);
      result.push({ type: 'message', message: msg, isConsecutive: !!(sameAuthor && closeInTime), showAvatar: !(sameAuthor && closeInTime) });
    });
    return result;
  }, [chat.messages, chat.searchResults, chat.searchQuery, chat.hasMore]);

  // ── Auto-scroll ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (chat.messages.length > 0 && !chat.searchQuery) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 80);
    }
  }, [chat.messages.length]);

  const scrollToMessage = useCallback((messageId: string) => {
    const idx = listItems.findIndex(item => item.type === 'message' && item.message.id === messageId);
    if (idx !== -1) flatListRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.5 });
  }, [listItems]);

  // ── Send (Part 18D: mentions → notifyMention already handled above via messages effect) ──
  const handleSend = useCallback((
    text: string, replyToId?: string,
    attachments?: ChatAttachment[], mentions?: string[],
  ) => {
    const effectiveReplyToId = replyToId ?? chatRef.current.replyingTo?.id;
    chatRef.current.send(text, effectiveReplyToId, attachments, mentions);
    sendTyping(false);
    Keyboard.dismiss();
  }, [sendTyping]);

  const handleSaveEdit = useCallback(async (id: string, c: string) => {
    const { error } = await chat.editMessage(id, c); if (error) Alert.alert('Error', error);
  }, [chat]);
  const handleDelete  = useCallback(async (id: string) => {
    const { error } = await chat.deleteMessage(id); if (error) Alert.alert('Error', error);
  }, [chat]);
  const handleReact   = useCallback((id: string, emoji: string) => chat.react(id, emoji), [chat]);
  const handlePin     = useCallback(async (msg: ChatMessage) => {
    const { error } = await chat.pin(msg); if (error) Alert.alert('Error', error);
  }, [chat]);
  const handleUnpin   = useCallback(async (id: string) => {
    const { error } = await chat.unpin(id); if (error) Alert.alert('Error', error);
  }, [chat]);

  const handleSearch  = useCallback((q: string) => {
    setSearchInput(q); if (q.trim().length >= 2) chat.search(q); else chat.clearSearch();
  }, [chat]);
  const closeSearch   = useCallback(() => { setShowSearch(false); setSearchInput(''); chat.clearSearch(); }, [chat]);

  const fileCount = useMemo(() =>
    chat.messages.filter(m => !m.isDeleted && m.attachments.length > 0)
      .reduce((a, m) => a + m.attachments.length, 0), [chat.messages]);

  // ── Render item ────────────────────────────────────────────────────────────
  const renderItem = useCallback(({ item }: { item: ListItem }) => {
    if (item.type === 'loader') return (
      <View style={styles.loadMoreWrap}>
        <TouchableOpacity onPress={chat.loadMore} disabled={chat.isLoadingMore} style={styles.loadMoreBtn} activeOpacity={0.7}>
          {chat.isLoadingMore ? <ActivityIndicator size="small" color={COLORS.primary} /> : (
            <><Ionicons name="chevron-up-outline" size={14} color={COLORS.primary} /><Text style={styles.loadMoreText}>Load earlier messages</Text></>
          )}
        </TouchableOpacity>
      </View>
    );
    if (item.type === 'date') return (
      <View style={styles.dateSep}><View style={styles.dateLine} /><Text style={styles.dateLbl}>{item.label}</Text><View style={styles.dateLine} /></View>
    );
    const { message, isConsecutive, showAvatar } = item;
    return (
      <ChatBubble
        message={message} isOwnMessage={message.userId === user?.id}
        isOwnerOrEditor={isOwnerOrEditor} showAvatar={showAvatar}
        isConsecutive={isConsecutive}
        onReply={chat.setReplyingTo} onEdit={chat.setEditingMessage}
        onDelete={handleDelete} onReact={handleReact} onPin={handlePin}
        onUnpin={handleUnpin} onScrollToReply={scrollToMessage}
      />
    );
  }, [user?.id, isOwnerOrEditor, chat, handleDelete, handleReact, handlePin, handleUnpin, scrollToMessage]);

  const keyExtractor = useCallback((item: ListItem) =>
    item.type === 'message' ? item.message.id : item.id, []);

  const EmptyState = () => (
    <Animated.View entering={FadeInDown.duration(500)} style={styles.emptyState}>
      <View style={styles.emptyIcon}><Ionicons name="chatbubbles-outline" size={40} color={COLORS.primary} /></View>
      <Text style={styles.emptyTitle}>Start the conversation</Text>
      <Text style={styles.emptyDesc}>Only owners and editors can see these messages.</Text>
    </Animated.View>
  );

  return (
    <LinearGradient colors={[COLORS.background, COLORS.backgroundCard]} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'left', 'right']}>

        {/* Top bar */}
        <Animated.View entering={FadeIn.duration(350)} style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={22} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <View style={styles.topCenter}>
            <View style={styles.titleRow}>
              <View style={styles.chatIcon}><Ionicons name="chatbubbles" size={16} color={COLORS.primary} /></View>
              <Text style={styles.topTitle} numberOfLines={1}>{workspaceName ?? 'Team Chat'}</Text>
            </View>
            <Text style={styles.topSub}>
              {chat.chatMembers.length} {chat.chatMembers.length === 1 ? 'member' : 'members'}
              {presence.onlineCount > 0 && ` · ${presence.onlineCount} online`}
            </Text>
          </View>
          <View style={styles.topActions}>
            {/* Files */}
            <TouchableOpacity onPress={() => setShowFiles(true)}
              style={[styles.iconBtn, fileCount > 0 && styles.iconBtnFiles]} activeOpacity={0.7}>
              <Ionicons name="folder-open-outline" size={17} color={fileCount > 0 ? COLORS.primary : COLORS.textSecondary} />
              {fileCount > 0 && <View style={styles.badge}><Text style={styles.badgeTxt}>{fileCount > 99 ? '99+' : fileCount}</Text></View>}
            </TouchableOpacity>
            {/* Search */}
            <TouchableOpacity onPress={() => { setShowSearch(v => !v); setTimeout(() => searchRef.current?.focus(), 100); }}
              style={[styles.iconBtn, showSearch && styles.iconBtnActive]} activeOpacity={0.7}>
              <Ionicons name={showSearch ? 'search' : 'search-outline'} size={17} color={showSearch ? COLORS.primary : COLORS.textSecondary} />
            </TouchableOpacity>
            {/* Members */}
            <TouchableOpacity onPress={() => setShowMembers(true)} style={styles.iconBtn} activeOpacity={0.7}>
              <Ionicons name="people-outline" size={17} color={COLORS.textSecondary} />
              {chat.chatMembers.length > 0 && <View style={styles.badge}><Text style={styles.badgeTxt}>{chat.chatMembers.length > 9 ? '9+' : chat.chatMembers.length}</Text></View>}
            </TouchableOpacity>
          </View>
        </Animated.View>

        {/* Search bar */}
        {showSearch && (
          <Animated.View entering={SlideInUp.duration(220)} style={styles.searchBar}>
            <Ionicons name="search-outline" size={15} color={COLORS.textMuted} />
            <TextInput ref={searchRef} value={searchInput} onChangeText={handleSearch}
              placeholder="Search messages…" placeholderTextColor={COLORS.textMuted}
              style={styles.searchInput} returnKeyType="search" autoCapitalize="none" autoCorrect={false} />
            {searchInput.length > 0 && (
              <TouchableOpacity onPress={() => { setSearchInput(''); chat.clearSearch(); }}>
                <Ionicons name="close-circle" size={15} color={COLORS.textMuted} />
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={closeSearch} style={styles.cancelBtn}>
              <Text style={styles.cancelTxt}>Cancel</Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* Search results banner */}
        {chat.searchQuery && (
          <View style={styles.searchBanner}>
            <Ionicons name="search-outline" size={12} color={COLORS.primary} />
            <Text style={styles.searchBannerTxt}>
              {chat.isSearching ? 'Searching…' : `${chat.searchResults.length} result${chat.searchResults.length !== 1 ? 's' : ''} for "${chat.searchQuery}"`}
            </Text>
            <TouchableOpacity onPress={closeSearch}><Text style={styles.clearTxt}>Clear</Text></TouchableOpacity>
          </View>
        )}

        {/* Pinned bar */}
        <ChatPinnedBar pinnedMessages={chat.pinnedMessages} isEditorOrOwner={isOwnerOrEditor}
          onTapMessage={msg => scrollToMessage(msg.id)} onUnpin={handleUnpin} />

        {/* Message list */}
        {chat.isLoading ? (
          <View style={styles.loadWrap}><ActivityIndicator size="large" color={COLORS.primary} /><Text style={styles.loadTxt}>Loading messages…</Text></View>
        ) : chat.error ? (
          <View style={styles.errWrap}>
            <Ionicons name="alert-circle-outline" size={36} color={COLORS.error} />
            <Text style={styles.errTxt}>{chat.error}</Text>
            <TouchableOpacity onPress={chat.refresh} style={styles.retryBtn}><Text style={styles.retryTxt}>Retry</Text></TouchableOpacity>
          </View>
        ) : (
          <FlatList
            ref={flatListRef} data={listItems} keyExtractor={keyExtractor}
            renderItem={renderItem} contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
            onScrollToIndexFailed={() => {}}
            ListEmptyComponent={<EmptyState />}
            keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive"
            removeClippedSubviews={Platform.OS === 'android'}
            maxToRenderPerBatch={20} windowSize={10}
          />
        )}

        {/* Typing indicator */}
        {typingText && (
          <Animated.View entering={FadeIn.duration(200)} style={styles.typingBar}>
            <View style={styles.typingDots}>
              {[0,1,2].map(i => <View key={i} style={styles.dot} />)}
            </View>
            <Text style={styles.typingTxt} numberOfLines={1}>{typingText}</Text>
          </Animated.View>
        )}

        {/* Unread badge */}
        {chat.unreadCount > 0 && (
          <Animated.View entering={FadeIn.duration(300)} style={styles.unreadBadge}>
            <TouchableOpacity onPress={() => flatListRef.current?.scrollToEnd({ animated: true })} style={styles.unreadBtn}>
              <Ionicons name="chevron-down" size={14} color="#FFF" />
              <Text style={styles.unreadTxt}>{chat.unreadCount} new</Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* Chat input */}
        <ChatInput
          workspaceId={workspaceId ?? ''} replyingTo={chat.replyingTo}
          editingMessage={chat.editingMessage} isSending={chat.isSending}
          chatMembers={chat.chatMembers} onSend={handleSend}
          onCancelReply={() => chat.setReplyingTo(null)}
          onCancelEdit={() => chat.setEditingMessage(null)}
          onSaveEdit={handleSaveEdit} onTyping={sendTyping}
        />
      </SafeAreaView>

      {/* Panels */}
      <ChatMembersPanel visible={showMembers} members={chat.chatMembers}
        onlineUsers={presence.onlineUsers} onClose={() => setShowMembers(false)}
        workspaceName={workspaceName ?? 'Workspace'} />

      <ChatFileFilter visible={showFiles} messages={chat.messages}
        onClose={() => setShowFiles(false)}
        onScrollToMessage={id => { setShowFiles(false); setTimeout(() => scrollToMessage(id), 300); }} />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  lockScreen:    { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACING.xl, gap: 16 },
  lockIcon:      { width: 80, height: 80, borderRadius: 24, backgroundColor: `${COLORS.textMuted}15`, alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.sm },
  lockTitle:     { color: COLORS.textPrimary, fontSize: FONTS.sizes['2xl'], fontWeight: '800' },
  lockDesc:      { color: COLORS.textSecondary, fontSize: FONTS.sizes.base, textAlign: 'center', lineHeight: 24, maxWidth: 300 },
  lockBackBtn:   { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: COLORS.primary, borderRadius: RADIUS.lg, paddingHorizontal: SPACING.xl, paddingVertical: 13, marginTop: SPACING.sm },
  lockBackBtnText:{ color: '#FFF', fontSize: FONTS.sizes.base, fontWeight: '700' },
  topBar:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.border, gap: 10 },
  backBtn:       { width: 36, height: 36, borderRadius: 11, backgroundColor: COLORS.backgroundCard, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border, flexShrink: 0 },
  topCenter:     { flex: 1 },
  titleRow:      { flexDirection: 'row', alignItems: 'center', gap: 7 },
  chatIcon:      { width: 26, height: 26, borderRadius: 8, backgroundColor: `${COLORS.primary}18`, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  topTitle:      { color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '800', flex: 1 },
  topSub:        { color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 1, paddingLeft: 33 },
  topActions:    { flexDirection: 'row', gap: 5, alignItems: 'center' },
  iconBtn:       { width: 34, height: 34, borderRadius: 10, backgroundColor: COLORS.backgroundCard, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border },
  iconBtnActive: { backgroundColor: `${COLORS.primary}15`, borderColor: `${COLORS.primary}40` },
  iconBtnFiles:  { borderColor: `${COLORS.primary}35` },
  badge:         { position: 'absolute', top: -4, right: -4, backgroundColor: COLORS.primary, borderRadius: 8, minWidth: 15, height: 15, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2, borderWidth: 1.5, borderColor: COLORS.background },
  badgeTxt:      { color: '#FFF', fontSize: 8, fontWeight: '800' },
  searchBar:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, gap: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: COLORS.backgroundCard },
  searchInput:   { flex: 1, color: COLORS.textPrimary, fontSize: FONTS.sizes.sm },
  cancelBtn:     { paddingLeft: 4 },
  cancelTxt:     { color: COLORS.primary, fontSize: FONTS.sizes.sm, fontWeight: '600' },
  searchBanner:  { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: SPACING.md, paddingVertical: 7, backgroundColor: `${COLORS.primary}10`, borderBottomWidth: 1, borderBottomColor: `${COLORS.primary}20` },
  searchBannerTxt:{ flex: 1, color: COLORS.primary, fontSize: FONTS.sizes.xs, fontWeight: '500' },
  clearTxt:      { color: COLORS.primary, fontSize: FONTS.sizes.xs, fontWeight: '700' },
  listContent:   { paddingTop: SPACING.sm, paddingBottom: SPACING.lg, flexGrow: 1 },
  loadMoreWrap:  { alignItems: 'center', paddingVertical: SPACING.md },
  loadMoreBtn:   { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.full, paddingHorizontal: SPACING.lg, paddingVertical: 8, borderWidth: 1, borderColor: COLORS.border },
  loadMoreText:  { color: COLORS.primary, fontSize: FONTS.sizes.xs, fontWeight: '600' },
  dateSep:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.xl, marginVertical: SPACING.md, gap: 10 },
  dateLine:      { flex: 1, height: 1, backgroundColor: COLORS.border },
  dateLbl:       { color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600' },
  typingBar:     { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: SPACING.xl, paddingVertical: 5, backgroundColor: COLORS.backgroundCard, borderTopWidth: 1, borderTopColor: COLORS.border },
  typingDots:    { flexDirection: 'row', alignItems: 'center', gap: 3 },
  dot:           { width: 5, height: 5, borderRadius: 3, backgroundColor: COLORS.primary },
  typingTxt:     { color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontStyle: 'italic', flex: 1 },
  unreadBadge:   { position: 'absolute', bottom: 90, alignSelf: 'center', zIndex: 100 },
  unreadBtn:     { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: COLORS.primary, borderRadius: RADIUS.full, paddingHorizontal: 14, paddingVertical: 7, shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 8 },
  unreadTxt:     { color: '#FFF', fontSize: FONTS.sizes.xs, fontWeight: '700' },
  loadWrap:      { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadTxt:       { color: COLORS.textMuted, fontSize: FONTS.sizes.sm },
  errWrap:       { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: SPACING.xl },
  errTxt:        { color: COLORS.textSecondary, textAlign: 'center', fontSize: FONTS.sizes.sm },
  retryBtn:      { backgroundColor: COLORS.primary, borderRadius: RADIUS.lg, paddingHorizontal: SPACING.xl, paddingVertical: SPACING.sm },
  retryTxt:      { color: '#FFF', fontWeight: '700' },
  emptyState:    { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACING.xl, paddingTop: 80, gap: 14 },
  emptyIcon:     { width: 80, height: 80, borderRadius: 24, backgroundColor: `${COLORS.primary}15`, alignItems: 'center', justifyContent: 'center' },
  emptyTitle:    { color: COLORS.textPrimary, fontSize: FONTS.sizes.xl, fontWeight: '800' },
  emptyDesc:     { color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, textAlign: 'center', lineHeight: 22, maxWidth: 300 },
});