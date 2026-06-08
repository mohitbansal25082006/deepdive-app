// app/(app)/workspace-chat.tsx
// Part 49 — Stream Chat (FINAL DEFINITIVE FIX)
// Part 50 FIXES:
//
//   FIX 1.3 — Attachment picker appearing BEHIND the input / buttons:
//     Root cause: The AttachmentPicker bottom-sheet is rendered inside
//     OverlayProvider. Its height is calculated from `topInset` and `bottomInset`.
//     When these are wrong/missing, the bottom-sheet snaps to height=0 or renders
//     under the navigation bar. The OverlayProvider in app/_layout.tsx must have
//     `topInset` set to the top safe area and `bottomInset` to the bottom safe
//     area. Additionally Channel must receive matching `topInset` and `bottomInset`
//     so the MessageList shifts up when the picker opens. See app/_layout.tsx changes.
//
//     Inside this screen: Channel now receives explicit `topInset` (top bar height
//     + status bar area) and `bottomInset` (bottom safe area). This makes the picker
//     open AT the MessageInput and expand upward correctly on both iOS and Android.
//
//   FIX 2 — In-app document preview chip (the gray tile):
//     Removed DocumentPreviewTrigger from StreamCustomMessage. Stream's built-in
//     renderer already shows a document chip. The gray tile WAS our custom chip
//     appearing below Stream's chip as a duplicate. Now only video/audio get
//     custom players; everything else is Stream's native renderer.
//     See StreamCustomMessage.tsx for the component-level change.
//     ChatFileFilter kept as-is (it's the Files panel, separate from in-message preview).
//
//   FIX iOS ph:// crash — "No suitable URL request handler found for ph://":
//     This crash occurred because our old ChatAttachmentPicker passed raw ph://
//     URIs (iOS Photos library handles) to RCTNetworking which can't load them.
//     Since we removed the custom attachment picker in Part 49 and now rely on
//     Stream's built-in picker (which uses expo-image-picker / expo-media-library
//     and resolves ph:// properly), this crash no longer occurs — as long as the
//     OverlayProvider is set up with correct insets (see FIX 1.3).
//
// ═══════════════════════════════════════════════════════════════════
// CORRECT FINAL STRUCTURE (unchanged from Part 49):
//
//   View (root, flex:1)
//     View (topBarSafeArea, auto height with safe area padding)
//       TopBarWithPresence
//     View (chatContainer, flex:1)   ← gives Channel's KAV a height
//       Chat (client)
//         Channel (topInset, bottomInset set for picker)
//           MessageList
//           MessageInput
//     ChatFileFilterStream (modal, outside Channel)
// ═══════════════════════════════════════════════════════════════════

import React, {
  useCallback, useEffect, useRef, useState, useMemo,
} from 'react';
import {
  View, Text, TouchableOpacity, ActivityIndicator,
  StyleSheet, Platform, StatusBar,
} from 'react-native';
import { Ionicons }          from '@expo/vector-icons';
import Animated, { FadeIn }  from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';

// Stream SDK — NO OverlayProvider here. It lives in app/_layout.tsx.
import {
  Chat,
  Channel,
  MessageList,
  MessageInput,
} from 'stream-chat-expo';

import { useAuth }               from '../../src/context/AuthContext';
import { useStreamChat }         from '../../src/hooks/useStreamChat';
import { StreamCustomMessage }   from '../../src/components/workspace/StreamCustomMessage';
import { ChatFileFilter }        from '../../src/components/workspace/ChatFileFilter';
import {
  notifyMention, notifyChatMessage, notifyReply,
} from '../../src/services/workspaceNotificationService';
import { setActiveChatWorkspaceId } from '../../src/lib/screenState';
import {
  playSendSound, playReceiveSound, prewarmChatSounds,
} from '../../src/services/chatSoundService';
import { COLORS, FONTS, SPACING, RADIUS } from '../../src/constants/theme';
import { ChatMessage } from '../../src/types/chat';

const TOP_BAR_HEIGHT = 56;

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function WorkspaceChatScreen() {
  const {
    id:   workspaceId,
    name: workspaceName,
    role: userRole,
  } = useLocalSearchParams<{ id: string; name: string; role: string }>();

  const { user }   = useAuth();
  const insets     = useSafeAreaInsets();

  const isOwnerOrEditor = userRole === 'owner' || userRole === 'editor';

  const { client, channel, isReady, error, refresh } = useStreamChat(
    workspaceId ?? null,
    isOwnerOrEditor ? (userRole as 'owner' | 'editor') : null,
  );

  const [showFiles, setShowFiles] = useState(false);
  const [fileCount, setFileCount] = useState(0);
  const isFocusedRef = useRef(false);

  useEffect(() => { prewarmChatSounds().catch(() => {}); }, []);

  useFocusEffect(
    useCallback(() => {
      isFocusedRef.current = true;
      if (workspaceId) setActiveChatWorkspaceId(workspaceId);
      return () => {
        isFocusedRef.current = false;
        setActiveChatWorkspaceId(null);
      };
    }, [workspaceId]),
  );

  useEffect(() => {
    if (!client || !workspaceId || !user?.id) return;
    const handleNewMessage = (event: any) => {
      const msg = event.message;
      if (!msg || msg.user?.id === user.id) return;
      if (isFocusedRef.current) playReceiveSound().catch(() => {});
      const senderName = (msg.user?.name as string | undefined) ?? 'Someone';
      const preview    = ((msg.text as string | undefined) ?? '').slice(0, 80);
      const mentioned: string[] = (msg.mentioned_users ?? []).map((u: any) => u.id as string);
      if (mentioned.includes(user.id)) {
        notifyMention({ workspaceId, workspaceName: workspaceName ?? 'Workspace', mentionerName: senderName, messagePreview: preview }).catch(() => {});
        return;
      }
      if ((msg.quoted_message as any)?.user?.id === user.id) {
        notifyReply({ workspaceId, workspaceName: workspaceName ?? 'Workspace', replierName: senderName, replyPreview: preview, messageId: msg.id }).catch(() => {});
        return;
      }
      notifyChatMessage({ workspaceId, workspaceName: workspaceName ?? 'Workspace', senderName, messagePreview: preview }).catch(() => {});
    };
    const unsub = client.on('message.new', handleNewMessage);
    return () => unsub.unsubscribe();
  }, [client, workspaceId, workspaceName, user?.id]);

  useEffect(() => {
    if (!client || !user?.id) return;
    const unsub = client.on('message.new', (event: any) => {
      if (event.message?.user?.id === user.id) playSendSound().catch(() => {});
    });
    return () => unsub.unsubscribe();
  }, [client, user?.id]);

  useEffect(() => {
    if (!channel) return;
    const countFiles = () => {
      const msgs = Object.values((channel.state as any).messages as Record<string, any>);
      setFileCount(msgs.reduce((n: number, m: any) => n + (m.attachments?.length ?? 0), 0));
    };
    countFiles();
    const unsub = channel.on('message.new', countFiles);
    return () => unsub.unsubscribe();
  }, [channel]);

  // ── Access guard ──────────────────────────────────────────────────────────
  if (!isOwnerOrEditor) {
    return (
      <View style={[styles.lockRoot, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={styles.lockScreen}>
          <View style={styles.lockIcon}>
            <Ionicons name="lock-closed" size={40} color={COLORS.textMuted} />
          </View>
          <Text style={styles.lockTitle}>Team Chat</Text>
          <Text style={styles.lockDesc}>
            Chat is only available to owners and editors.{'\n'}
            Ask your workspace owner to upgrade your role.
          </Text>
          <TouchableOpacity onPress={() => router.back()} style={styles.lockBackBtn}>
            <Ionicons name="arrow-back-outline" size={16} color="#FFF" />
            <Text style={styles.lockBackBtnText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Loading / error ───────────────────────────────────────────────────────
  if (!isReady || !channel || !client) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <TopBar
          workspaceName={workspaceName ?? 'Team Chat'}
          onBack={() => router.back()}
          onFiles={() => {}}
          fileCount={0}
          onlineCount={0}
          memberCount={0}
        />
        <View style={styles.loadWrap}>
          {error ? (
            <>
              <Ionicons name="alert-circle-outline" size={40} color={COLORS.error} />
              <Text style={styles.errTxt}>{error}</Text>
              <TouchableOpacity onPress={refresh} style={styles.retryBtn}>
                <Text style={styles.retryTxt}>Retry</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <ActivityIndicator size="large" color={COLORS.primary} />
              <Text style={styles.loadTxt}>Connecting to chat…</Text>
            </>
          )}
        </View>
      </View>
    );
  }

  // ── FIX 1.3: Compute correct insets for the Channel's attachment picker ───
  //
  // topInset: the distance from the top of the SCREEN to the top of the
  //   chat area. This tells Stream how high the picker bottom-sheet can expand.
  //   = safe area top + top bar height
  //
  // bottomInset: the distance from the bottom of the channel content to the
  //   bottom of the SCREEN. This tells Stream how much to shift the MessageList
  //   when the picker is open.
  //   = safe area bottom (accounts for home indicator on iPhone, nav bar on Android)
  //
  // keyboardVerticalOffset: how much the Channel's KeyboardAvoidingView needs
  //   to offset on iOS. On Android the window resizes so it's always 0.
  const channelTopInset    = insets.top + TOP_BAR_HEIGHT;
  const channelBottomInset = insets.bottom;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />

      {/* Top bar sits above the chat area */}
      <View style={[styles.topBarSafeArea, { paddingTop: insets.top }]}>
        <TopBarWithPresence
          workspaceName={workspaceName ?? 'Team Chat'}
          channel={channel}
          onBack={() => router.back()}
          onFiles={() => setShowFiles(true)}
          fileCount={fileCount}
        />
      </View>

      {/*
        chatContainer gives Channel's KAV a parent with flex:1 so it can
        compute its height correctly (see Part 49 comment for full explanation).
      */}
      <View style={styles.chatContainer}>
        <Chat client={client as any}>
          <Channel
            channel={channel}
            keyboardVerticalOffset={
              Platform.OS === 'ios'
                ? channelTopInset
                : 0
            }
            MessageSimple={StreamCustomMessage}
            // FIX 1.3: Pass topInset and bottomInset so the AttachmentPicker
            // bottom-sheet knows how high to open and how much to shift the list.
            topInset={channelTopInset}
            bottomInset={channelBottomInset}
          >
            {/* Direct children — no View wrapper between Channel and these */}
            <MessageList />
            <MessageInput />
          </Channel>
        </Chat>
      </View>

      {/* File filter modal — outside Channel */}
      <ChatFileFilterStream
        visible={showFiles}
        channel={channel}
        onClose={() => setShowFiles(false)}
      />
    </View>
  );
}

// ─── Static top bar ───────────────────────────────────────────────────────────

interface TopBarProps {
  workspaceName: string;
  onBack:      () => void;
  onFiles:     () => void;
  fileCount:   number;
  onlineCount: number;
  memberCount: number;
}

function TopBar({ workspaceName, onBack, onFiles, fileCount, onlineCount, memberCount }: TopBarProps) {
  return (
    <Animated.View entering={FadeIn.duration(350)} style={styles.topBar}>
      <TouchableOpacity onPress={onBack} style={styles.backBtn}>
        <Ionicons name="chevron-back" size={22} color={COLORS.textPrimary} />
      </TouchableOpacity>
      <View style={styles.topCenter}>
        <View style={styles.titleRow}>
          <View style={styles.chatIcon}>
            <Ionicons name="chatbubbles" size={16} color={COLORS.primary} />
          </View>
          <Text style={styles.topTitle} numberOfLines={1}>{workspaceName}</Text>
        </View>
        <Text style={styles.topSub}>
          {memberCount > 0 && `${memberCount} members`}
          {onlineCount > 0 && memberCount > 0 && ' · '}
          {onlineCount > 0 && `${onlineCount} online`}
        </Text>
      </View>
      <View style={styles.topActions}>
        <TouchableOpacity
          onPress={onFiles}
          style={[styles.iconBtn, fileCount > 0 && styles.iconBtnFiles]}
          activeOpacity={0.7}
        >
          <Ionicons
            name="folder-open-outline"
            size={17}
            color={fileCount > 0 ? COLORS.primary : COLORS.textSecondary}
          />
          {fileCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeTxt}>{fileCount > 99 ? '99+' : fileCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

// ─── Top bar with live presence ───────────────────────────────────────────────

interface TopBarWithPresenceProps {
  workspaceName: string;
  channel:       any;
  onBack:        () => void;
  onFiles:       () => void;
  fileCount:     number;
}

function TopBarWithPresence({ workspaceName, channel, onBack, onFiles, fileCount }: TopBarWithPresenceProps) {
  const [watcherCount, setWatcherCount] = useState<number>(
    (channel.state as any).watcher_count ?? 0,
  );
  const memberCount = useMemo(
    () => Object.keys((channel.state as any).members ?? {}).length,
    [],
  );
  useEffect(() => {
    const update = () => setWatcherCount((channel.state as any).watcher_count ?? 0);
    const s1 = channel.on('user.watching.start', update);
    const s2 = channel.on('user.watching.stop',  update);
    return () => { s1.unsubscribe(); s2.unsubscribe(); };
  }, [channel]);
  return (
    <TopBar
      workspaceName={workspaceName}
      onBack={onBack}
      onFiles={onFiles}
      fileCount={fileCount}
      onlineCount={watcherCount}
      memberCount={memberCount}
    />
  );
}

// ─── ChatFileFilter adapter ───────────────────────────────────────────────────

interface ChatFileFilterStreamProps {
  visible:  boolean;
  channel:  any;
  onClose:  () => void;
}

function ChatFileFilterStream({ visible, channel, onClose }: ChatFileFilterStreamProps) {
  const messages = useMemo<ChatMessage[]>(() => {
    if (!channel?.state?.messages) return [];
    return (Object.values((channel.state as any).messages) as any[])
      .filter((m: any) => !m.deleted_at && (m.attachments?.length ?? 0) > 0)
      .map((m: any): ChatMessage => ({
        id:          m.id        ?? '',
        workspaceId: '',
        userId:      m.user?.id  ?? null,
        content:     m.text      ?? '',
        contentType: 'text',
        replyToId:   null,
        replyTo:     null,
        attachments: (m.attachments ?? []).map((a: any) => ({
          url:  a.asset_url ?? a.image_url ?? a.thumb_url ?? '',
          name: a.title     ?? a.fallback  ?? 'Attachment',
          type: a.mime_type ?? (a.type as string | undefined) ?? 'application/octet-stream',
          size: typeof a.file_size === 'number'
            ? a.file_size
            : typeof a.file_size === 'string'
              ? parseInt(a.file_size, 10) || undefined
              : undefined,
        })),
        mentions:  [],
        isEdited:  !!(m.message_text_updated_at),
        isDeleted: !!(m.deleted_at),
        isPinned:  !!(m.pinned),
        reactions: [],
        author: m.user ? {
          id:        m.user.id    ?? '',
          username:  m.user.name  ?? null,
          fullName:  m.user.name  ?? null,
          avatarUrl: m.user.image ?? null,
        } : null,
        createdAt: m.created_at ?? new Date().toISOString(),
        updatedAt: m.updated_at ?? new Date().toISOString(),
      }));
  }, [channel?.state?.messages, visible]);

  return (
    <ChatFileFilter
      visible={visible}
      messages={messages}
      onClose={onClose}
      onScrollToMessage={() => onClose()}
    />
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex:            1,
    backgroundColor: COLORS.background,
  },
  lockRoot: {
    flex:            1,
    backgroundColor: COLORS.background,
  },

  topBarSafeArea: {
    backgroundColor:   COLORS.background,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  topBar: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingHorizontal: SPACING.md,
    paddingVertical:   SPACING.sm,
    gap:               10,
    height:            TOP_BAR_HEIGHT,
  },

  // flex:1 gives Channel's KAV a parent with an explicit, computed height.
  chatContainer: {
    flex: 1,
  },

  backBtn: {
    width:           36,
    height:          36,
    borderRadius:    11,
    backgroundColor: COLORS.backgroundCard,
    alignItems:      'center',
    justifyContent:  'center',
    borderWidth:     1,
    borderColor:     COLORS.border,
    flexShrink:      0,
  },
  topCenter:  { flex: 1 },
  titleRow:   { flexDirection: 'row', alignItems: 'center', gap: 7 },
  chatIcon: {
    width:           26,
    height:          26,
    borderRadius:    8,
    backgroundColor: `${COLORS.primary}18`,
    alignItems:      'center',
    justifyContent:  'center',
    flexShrink:      0,
  },
  topTitle: {
    color:      COLORS.textPrimary,
    fontSize:   FONTS.sizes.base,
    fontWeight: '800',
    flex:       1,
  },
  topSub: {
    color:       COLORS.textMuted,
    fontSize:    FONTS.sizes.xs,
    marginTop:   1,
    paddingLeft: 33,
  },
  topActions: { flexDirection: 'row', gap: 5, alignItems: 'center' },
  iconBtn: {
    width:           34,
    height:          34,
    borderRadius:    10,
    backgroundColor: COLORS.backgroundCard,
    alignItems:      'center',
    justifyContent:  'center',
    borderWidth:     1,
    borderColor:     COLORS.border,
  },
  iconBtnFiles: { borderColor: `${COLORS.primary}35` },
  badge: {
    position:          'absolute',
    top:               -4,
    right:             -4,
    backgroundColor:   COLORS.primary,
    borderRadius:      8,
    minWidth:          15,
    height:            15,
    alignItems:        'center',
    justifyContent:    'center',
    paddingHorizontal: 2,
    borderWidth:       1.5,
    borderColor:       COLORS.background,
  },
  badgeTxt: { color: '#FFF', fontSize: 8, fontWeight: '800' },

  lockScreen: {
    flex:              1,
    alignItems:        'center',
    justifyContent:    'center',
    paddingHorizontal: SPACING.xl,
    gap:               16,
  },
  lockIcon: {
    width:           80,
    height:          80,
    borderRadius:    24,
    backgroundColor: `${COLORS.textMuted}15`,
    alignItems:      'center',
    justifyContent:  'center',
    marginBottom:    SPACING.sm,
  },
  lockTitle:       { color: COLORS.textPrimary, fontSize: FONTS.sizes['2xl'], fontWeight: '800' },
  lockDesc:        { color: COLORS.textSecondary, fontSize: FONTS.sizes.base, textAlign: 'center', lineHeight: 24, maxWidth: 300 },
  lockBackBtn:     { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: COLORS.primary, borderRadius: RADIUS.lg, paddingHorizontal: SPACING.xl, paddingVertical: 13, marginTop: SPACING.sm },
  lockBackBtnText: { color: '#FFF', fontSize: FONTS.sizes.base, fontWeight: '700' },

  loadWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  loadTxt:  { color: COLORS.textMuted, fontSize: FONTS.sizes.sm },
  errTxt:   { color: COLORS.textSecondary, textAlign: 'center', fontSize: FONTS.sizes.sm, maxWidth: 280 },
  retryBtn: { backgroundColor: COLORS.primary, borderRadius: RADIUS.lg, paddingHorizontal: SPACING.xl, paddingVertical: SPACING.sm },
  retryTxt: { color: '#FFF', fontWeight: '700' },
});