// app/(app)/workspace-chat.tsx
// Part 17 — Advanced Workspace Chat Screen
// Accessible ONLY by workspace owners and editors.
// Features:
//   • Real-time message list with cursor pagination (load older)
//   • Optimistic sends with auto-scroll to bottom
//   • Reply threading (inline preview + scroll-to-original)
//   • Edit / delete messages
//   • Emoji reactions with picker
//   • Pin / unpin messages with cycling banner
//   • Live typing indicators
//   • Read receipts (watermark)
//   • Full-text message search with result highlighting
//   • Members panel (slide-in)
//   • Date separators between messages
//   • Consecutive-message collapsing (no repeated avatars)
//   • Access guard — viewers see a locked screen

import React, {
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
} from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  StyleSheet,
  Platform,
  Alert,
  Keyboard,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons }       from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown, SlideInUp } from 'react-native-reanimated';
import { SafeAreaView }   from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';

import { useAuth }              from '../../src/context/AuthContext';
import { useWorkspaceChat }     from '../../src/hooks/useWorkspaceChat';
import { useChatTyping }        from '../../src/hooks/useChatTyping';
import { usePresence }          from '../../src/hooks/usePresence';

import { ChatBubble }           from '../../src/components/workspace/ChatBubble';
import { ChatInput }            from '../../src/components/workspace/ChatInput';
import { ChatPinnedBar }        from '../../src/components/workspace/ChatPinnedBar';
import { ChatMembersPanel }     from '../../src/components/workspace/ChatMembersPanel';

import { ChatMessage }          from '../../src/types/chat';
import { COLORS, FONTS, SPACING, RADIUS } from '../../src/constants/theme';

// ─── Date separator helper ────────────────────────────────────────────────────

function isSameDay(a: string, b: string): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth()    === db.getMonth()    &&
    da.getDate()     === db.getDate()
  );
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  if (isSameDay(dateStr, now.toISOString()))        return 'Today';
  if (isSameDay(dateStr, yesterday.toISOString()))  return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

// ─── List item types ──────────────────────────────────────────────────────────

type ListItem =
  | { type: 'message'; message: ChatMessage; isConsecutive: boolean; showAvatar: boolean }
  | { type: 'date';    label: string; id: string }
  | { type: 'loader';  id: string };

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function WorkspaceChatScreen() {
  const { id: workspaceId, name: workspaceName, role: userRole } =
    useLocalSearchParams<{ id: string; name: string; role: string }>();

  const { user } = useAuth();
  const flatListRef = useRef<FlatList<ListItem>>(null);

  // ── Chat hook ───────────────────────────────────────────────────────────────
  const chat = useWorkspaceChat(workspaceId ?? null);

  // ── Typing hook ─────────────────────────────────────────────────────────────
  const { typingText, sendTyping } = useChatTyping(workspaceId ?? null);

  // ── Presence (other members viewing this chat) ──────────────────────────────
  const presence = usePresence(workspaceId ?? null, true);

  // ── Local UI state ──────────────────────────────────────────────────────────
  const [showSearch,   setShowSearch]   = useState(false);
  const [showMembers,  setShowMembers]  = useState(false);
  const [searchInput,  setSearchInput]  = useState('');
  const searchInputRef = useRef<TextInput>(null);

  const isOwnerOrEditor = userRole === 'owner' || userRole === 'editor';

  // Access guard — viewers cannot enter chat
  if (!isOwnerOrEditor) {
    return (
      <LinearGradient colors={[COLORS.background, COLORS.backgroundCard]} style={{ flex: 1 }}>
        <SafeAreaView style={styles.lockScreen}>
          <View style={styles.lockIcon}>
            <Ionicons name="lock-closed" size={40} color={COLORS.textMuted} />
          </View>
          <Text style={styles.lockTitle}>Team Chat</Text>
          <Text style={styles.lockDesc}>
            Chat is only available to workspace owners and editors.
            Ask your workspace owner to upgrade your role.
          </Text>
          <TouchableOpacity onPress={() => router.back()} style={styles.lockBackBtn}>
            <Ionicons name="arrow-back-outline" size={16} color="#FFF" />
            <Text style={styles.lockBackBtnText}>Go Back</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  // ── Build flat list items with date separators + consecutive grouping ───────

  const listItems = useMemo<ListItem[]>(() => {
    const result: ListItem[] = [];

    if (chat.hasMore) {
      result.push({ type: 'loader', id: 'load-more' });
    }

    const messages = chat.searchQuery
      ? chat.searchResults
      : chat.messages;

    messages.forEach((msg, i) => {
      const prev = messages[i - 1];

      // Date separator
      if (!prev || !isSameDay(prev.createdAt, msg.createdAt)) {
        result.push({
          type:  'date',
          label: formatDateLabel(msg.createdAt),
          id:    `date-${msg.id}`,
        });
      }

      // Consecutive: same sender, within 5 minutes
      const sameAuthor = prev && prev.userId === msg.userId && prev.contentType !== 'system';
      const closeInTime = prev && (
        new Date(msg.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60 * 1000
      );
      const isConsecutive = !!(sameAuthor && closeInTime);

      result.push({
        type:         'message',
        message:      msg,
        isConsecutive,
        showAvatar:   !isConsecutive || i === 0,
      });
    });

    return result;
  }, [chat.messages, chat.searchResults, chat.searchQuery, chat.hasMore]);

  // ── Auto-scroll to bottom on new message ────────────────────────────────────

  useEffect(() => {
    if (chat.messages.length > 0 && !chat.searchQuery) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 80);
    }
  }, [chat.messages.length]);

  // ── Scroll to a specific message (for reply jumps) ──────────────────────────

  const scrollToMessage = useCallback((messageId: string) => {
    const msgItem = listItems.findIndex(
      item => item.type === 'message' && item.message.id === messageId
    );
    if (msgItem !== -1) {
      flatListRef.current?.scrollToIndex({ index: msgItem, animated: true, viewPosition: 0.5 });
    }
  }, [listItems]);

  // ── Handle send ──────────────────────────────────────────────────────────────

  // chatRef keeps a stable pointer to the latest chat object so handleSend
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  // never captures a stale send() or stale replyingTo.
  const chatRef = useRef(chat);
  useEffect(() => { chatRef.current = chat; }, [chat]);

  const handleSend = useCallback((
    text: string,
    replyToId?: string,
    attachments?: import('../../src/types/chat').ChatAttachment[],
  ) => {
    const livChat = chatRef.current;
    const effectiveReplyToId = replyToId ?? livChat.replyingTo?.id;
    livChat.send(text, effectiveReplyToId, attachments);
    sendTyping(false);
    Keyboard.dismiss();
  }, [sendTyping]);

  // ── Handle save edit ─────────────────────────────────────────────────────────

  const handleSaveEdit = useCallback(async (messageId: string, newContent: string) => {
    const { error } = await chat.editMessage(messageId, newContent);
    if (error) Alert.alert('Error', error);
  }, [chat]);

  // ── Handle delete ─────────────────────────────────────────────────────────────

  const handleDelete = useCallback(async (messageId: string) => {
    const { error } = await chat.deleteMessage(messageId);
    if (error) Alert.alert('Error', error);
  }, [chat]);

  // ── Handle react ─────────────────────────────────────────────────────────────

  const handleReact = useCallback((messageId: string, emoji: string) => {
    chat.react(messageId, emoji);
  }, [chat]);

  // ── Handle pin ───────────────────────────────────────────────────────────────

  const handlePin = useCallback(async (message: ChatMessage) => {
    const { error } = await chat.pin(message);
    if (error) Alert.alert('Error', error);
  }, [chat]);

  const handleUnpin = useCallback(async (messageId: string) => {
    const { error } = await chat.unpin(messageId);
    if (error) Alert.alert('Error', error);
  }, [chat]);

  // ── Search ────────────────────────────────────────────────────────────────────

  const handleSearch = useCallback((query: string) => {
    setSearchInput(query);
    if (query.trim().length >= 2) {
      chat.search(query);
    } else {
      chat.clearSearch();
    }
  }, [chat]);

  const closeSearch = useCallback(() => {
    setShowSearch(false);
    setSearchInput('');
    chat.clearSearch();
  }, [chat]);

  // ── Render list item ──────────────────────────────────────────────────────────

  const renderItem = useCallback(({ item }: { item: ListItem }) => {
    if (item.type === 'loader') {
      return (
        <View style={styles.loadMoreWrap}>
          <TouchableOpacity
            onPress={chat.loadMore}
            disabled={chat.isLoadingMore}
            style={styles.loadMoreBtn}
            activeOpacity={0.7}
          >
            {chat.isLoadingMore ? (
              <ActivityIndicator size="small" color={COLORS.primary} />
            ) : (
              <>
                <Ionicons name="chevron-up-outline" size={14} color={COLORS.primary} />
                <Text style={styles.loadMoreText}>Load earlier messages</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      );
    }

    if (item.type === 'date') {
      return (
        <View style={styles.dateSeparator}>
          <View style={styles.dateLine} />
          <Text style={styles.dateLabel}>{item.label}</Text>
          <View style={styles.dateLine} />
        </View>
      );
    }

    // Message
    const { message, isConsecutive, showAvatar } = item;
    return (
      <ChatBubble
        message={message}
        isOwnMessage={message.userId === user?.id}
        isOwnerOrEditor={isOwnerOrEditor}
        showAvatar={showAvatar}
        isConsecutive={isConsecutive}
        onReply={chat.setReplyingTo}
        onEdit={chat.setEditingMessage}
        onDelete={handleDelete}
        onReact={handleReact}
        onPin={handlePin}
        onUnpin={handleUnpin}
        onScrollToReply={scrollToMessage}
      />
    );
  }, [
    user?.id, isOwnerOrEditor, chat, handleDelete,
    handleReact, handlePin, handleUnpin, scrollToMessage,
  ]);

  const keyExtractor = useCallback((item: ListItem) => {
    if (item.type === 'message') return item.message.id;
    return item.id;
  }, []);

  // ── Empty state ───────────────────────────────────────────────────────────────

  const EmptyState = () => (
    <Animated.View entering={FadeInDown.duration(500)} style={styles.emptyState}>
      <View style={styles.emptyIcon}>
        <Ionicons name="chatbubbles-outline" size={40} color={COLORS.primary} />
      </View>
      <Text style={styles.emptyTitle}>Start the conversation</Text>
      <Text style={styles.emptyDesc}>
        This is the beginning of your team chat. Only owners and editors can see these messages.
      </Text>
    </Animated.View>
  );

  return (
    <LinearGradient colors={[COLORS.background, COLORS.backgroundCard]} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'left', 'right']}>

        {/* ── Top bar ── */}
        <Animated.View entering={FadeIn.duration(350)} style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={22} color={COLORS.textPrimary} />
          </TouchableOpacity>

          <View style={styles.topBarCenter}>
            <View style={styles.topBarTitleRow}>
              <View style={styles.chatIconWrap}>
                <Ionicons name="chatbubbles" size={16} color={COLORS.primary} />
              </View>
              <Text style={styles.topBarTitle} numberOfLines={1}>
                {workspaceName ?? 'Team Chat'}
              </Text>
            </View>
            <Text style={styles.topBarSub}>
              {chat.chatMembers.length} {chat.chatMembers.length === 1 ? 'member' : 'members'}
              {presence.onlineCount > 0 && ` · ${presence.onlineCount} online`}
            </Text>
          </View>

          <View style={styles.topBarActions}>
            <TouchableOpacity
              onPress={() => { setShowSearch(v => !v); setTimeout(() => searchInputRef.current?.focus(), 100); }}
              style={[styles.iconBtn, showSearch && styles.iconBtnActive]}
            >
              <Ionicons
                name={showSearch ? 'search' : 'search-outline'}
                size={18}
                color={showSearch ? COLORS.primary : COLORS.textSecondary}
              />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setShowMembers(true)}
              style={styles.iconBtn}
            >
              <Ionicons name="people-outline" size={18} color={COLORS.textSecondary} />
              {chat.chatMembers.length > 0 && (
                <View style={styles.iconBtnBadge}>
                  <Text style={styles.iconBtnBadgeText}>
                    {chat.chatMembers.length > 9 ? '9+' : chat.chatMembers.length}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </Animated.View>

        {/* ── Search bar ── */}
        {showSearch && (
          <Animated.View entering={SlideInUp.duration(220)} style={styles.searchBar}>
            <Ionicons name="search-outline" size={16} color={COLORS.textMuted} />
            <TextInput
              ref={searchInputRef}
              value={searchInput}
              onChangeText={handleSearch}
              placeholder="Search messages…"
              placeholderTextColor={COLORS.textMuted}
              style={styles.searchInput}
              returnKeyType="search"
              autoCapitalize="none"
              autoCorrect={false}
            />
            {searchInput.length > 0 && (
              <TouchableOpacity onPress={() => { setSearchInput(''); chat.clearSearch(); }}>
                <Ionicons name="close-circle" size={16} color={COLORS.textMuted} />
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={closeSearch} style={styles.searchClose}>
              <Text style={styles.searchCloseText}>Cancel</Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* Search results banner */}
        {chat.searchQuery && (
          <View style={styles.searchResultsBanner}>
            <Ionicons name="search-outline" size={12} color={COLORS.primary} />
            <Text style={styles.searchResultsText}>
              {chat.isSearching
                ? 'Searching…'
                : `${chat.searchResults.length} result${chat.searchResults.length !== 1 ? 's' : ''} for "${chat.searchQuery}"`
              }
            </Text>
            <TouchableOpacity onPress={closeSearch}>
              <Text style={styles.searchResultsClear}>Clear</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Pinned messages bar ── */}
        <ChatPinnedBar
          pinnedMessages={chat.pinnedMessages}
          isEditorOrOwner={isOwnerOrEditor}
          onTapMessage={(msg) => scrollToMessage(msg.id)}
          onUnpin={handleUnpin}
        />

        {/* ── Message list ── */}
        {chat.isLoading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loadingText}>Loading messages…</Text>
          </View>
        ) : chat.error ? (
          <View style={styles.errorWrap}>
            <Ionicons name="alert-circle-outline" size={36} color={COLORS.error} />
            <Text style={styles.errorText}>{chat.error}</Text>
            <TouchableOpacity onPress={chat.refresh} style={styles.retryBtn}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={listItems}
            keyExtractor={keyExtractor}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
            onScrollToIndexFailed={() => {}}
            ListEmptyComponent={<EmptyState />}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            removeClippedSubviews={Platform.OS === 'android'}
            maxToRenderPerBatch={20}
            windowSize={10}
          />
        )}

        {/* ── Typing indicator ── */}
        {typingText && (
          <Animated.View entering={FadeIn.duration(200)} style={styles.typingBar}>
            <TypingDots />
            <Text style={styles.typingText} numberOfLines={1}>{typingText}</Text>
          </Animated.View>
        )}

        {/* ── Unread badge (scroll to bottom) ── */}
        {chat.unreadCount > 0 && (
          <Animated.View entering={FadeIn.duration(300)} style={styles.unreadBadge}>
            <TouchableOpacity
              onPress={() => flatListRef.current?.scrollToEnd({ animated: true })}
              style={styles.unreadBadgeBtn}
            >
              <Ionicons name="chevron-down" size={14} color="#FFF" />
              <Text style={styles.unreadBadgeText}>{chat.unreadCount} new</Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* ── Chat input ── */}
        <ChatInput
          workspaceId={workspaceId ?? ''}
          replyingTo={chat.replyingTo}
          editingMessage={chat.editingMessage}
          isSending={chat.isSending}
          onSend={handleSend}
          onCancelReply={() => chat.setReplyingTo(null)}
          onCancelEdit={() => chat.setEditingMessage(null)}
          onSaveEdit={handleSaveEdit}
          onTyping={sendTyping}
        />

      </SafeAreaView>

      {/* ── Members panel ── */}
      <ChatMembersPanel
        visible={showMembers}
        members={chat.chatMembers}
        onlineUsers={presence.onlineUsers}
        onClose={() => setShowMembers(false)}
        workspaceName={workspaceName ?? 'Workspace'}
      />
    </LinearGradient>
  );
}

// ─── Typing dots animation ────────────────────────────────────────────────────

function TypingDots() {
  return (
    <View style={typingDotsStyle.wrap}>
      {[0, 1, 2].map(i => (
        <View key={i} style={typingDotsStyle.dot} />
      ))}
    </View>
  );
}

const typingDotsStyle = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  dot:  { width: 5, height: 5, borderRadius: 3, backgroundColor: COLORS.primary },
});

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Lock screen (viewers)
  lockScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
    gap: 16,
  },
  lockIcon: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: `${COLORS.textMuted}15`,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.sm,
  },
  lockTitle: {
    color: COLORS.textPrimary,
    fontSize: FONTS.sizes['2xl'],
    fontWeight: '800',
  },
  lockDesc: {
    color: COLORS.textSecondary,
    fontSize: FONTS.sizes.base,
    textAlign: 'center',
    lineHeight: 24,
    maxWidth: 300,
  },
  lockBackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.xl,
    paddingVertical: 13,
    marginTop: SPACING.sm,
  },
  lockBackBtnText: {
    color: '#FFF',
    fontSize: FONTS.sizes.base,
    fontWeight: '700',
  },

  // Top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: 10,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: COLORS.backgroundCard,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    flexShrink: 0,
  },
  topBarCenter: { flex: 1 },
  topBarTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  chatIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: `${COLORS.primary}18`,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  topBarTitle: {
    color: COLORS.textPrimary,
    fontSize: FONTS.sizes.base,
    fontWeight: '800',
    flex: 1,
  },
  topBarSub: {
    color: COLORS.textMuted,
    fontSize: FONTS.sizes.xs,
    marginTop: 1,
    paddingLeft: 33, // align with title (icon width + gap)
  },
  topBarActions: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: COLORS.backgroundCard,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  iconBtnActive: {
    backgroundColor: `${COLORS.primary}15`,
    borderColor: `${COLORS.primary}40`,
  },
  iconBtnBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 2,
    borderColor: COLORS.background,
  },
  iconBtnBadgeText: {
    color: '#FFF',
    fontSize: 8,
    fontWeight: '800',
  },

  // Search bar
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.backgroundCard,
  },
  searchInput: {
    flex: 1,
    color: COLORS.textPrimary,
    fontSize: FONTS.sizes.sm,
  },
  searchClose: { paddingLeft: 4 },
  searchCloseText: {
    color: COLORS.primary,
    fontSize: FONTS.sizes.sm,
    fontWeight: '600',
  },

  // Search results banner
  searchResultsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: SPACING.md,
    paddingVertical: 7,
    backgroundColor: `${COLORS.primary}10`,
    borderBottomWidth: 1,
    borderBottomColor: `${COLORS.primary}20`,
  },
  searchResultsText: {
    flex: 1,
    color: COLORS.primary,
    fontSize: FONTS.sizes.xs,
    fontWeight: '500',
  },
  searchResultsClear: {
    color: COLORS.primary,
    fontSize: FONTS.sizes.xs,
    fontWeight: '700',
  },

  // Message list
  listContent: {
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.lg,
    flexGrow: 1,
  },

  // Load more
  loadMoreWrap: {
    alignItems: 'center',
    paddingVertical: SPACING.md,
  },
  loadMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.backgroundCard,
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.lg,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  loadMoreText: {
    color: COLORS.primary,
    fontSize: FONTS.sizes.xs,
    fontWeight: '600',
  },

  // Date separator
  dateSeparator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    marginVertical: SPACING.md,
    gap: 10,
  },
  dateLine: { flex: 1, height: 1, backgroundColor: COLORS.border },
  dateLabel: {
    color: COLORS.textMuted,
    fontSize: FONTS.sizes.xs,
    fontWeight: '600',
    textAlign: 'center',
  },

  // Typing indicator
  typingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: SPACING.xl,
    paddingVertical: 5,
    backgroundColor: COLORS.backgroundCard,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  typingText: {
    color: COLORS.textMuted,
    fontSize: FONTS.sizes.xs,
    fontStyle: 'italic',
    flex: 1,
  },

  // Unread badge
  unreadBadge: {
    position: 'absolute',
    bottom: 90,
    alignSelf: 'center',
    zIndex: 100,
  },
  unreadBadgeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.full,
    paddingHorizontal: 14,
    paddingVertical: 7,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  unreadBadgeText: {
    color: '#FFF',
    fontSize: FONTS.sizes.xs,
    fontWeight: '700',
  },

  // Loading / error / empty
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    color: COLORS.textMuted,
    fontSize: FONTS.sizes.sm,
  },
  errorWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: SPACING.xl,
  },
  errorText: {
    color: COLORS.textSecondary,
    textAlign: 'center',
    fontSize: FONTS.sizes.sm,
  },
  retryBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.sm,
  },
  retryText: { color: '#FFF', fontWeight: '700' },

  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
    paddingTop: 80,
    gap: 14,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: `${COLORS.primary}15`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    color: COLORS.textPrimary,
    fontSize: FONTS.sizes.xl,
    fontWeight: '800',
  },
  emptyDesc: {
    color: COLORS.textSecondary,
    fontSize: FONTS.sizes.sm,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 300,
  },
});