// app/(app)/workspace-chat.tsx
// Part 49 — Stream Chat
// Part 50 — Custom date separator, files fix, members sidebar, search modal
// Part 50.1 — Poll creator, voice recording, members sidebar role fix
// Part 50.2 — GIF picker
// Part 50.3 — Custom reactions, AI bot, sticker fix, thread removed
// Part 50.4 — GIF auto-sizing, reaction visibility fix
// Part 50.X FINAL FIX — Sticker rendering via Attachment prop on Channel.
//   All sticker actions (reactions, delete, pin, markUnread) now work because
//   MessageSimple handles ALL gestures natively. We only customise the visual.

import React, {
  useCallback, useEffect, useRef, useState, useMemo,
} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Platform,
  StatusBar,
  Modal,
  Pressable,
  KeyboardAvoidingView,
  Image,
} from 'react-native';
import { Ionicons }          from '@expo/vector-icons';
import Animated, {
  FadeIn,
  SlideInDown,
  SlideOutDown,
  Easing,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import * as ImagePicker      from 'expo-image-picker';

// Stream SDK
import {
  Chat,
  Channel,
  MessageList,
  MessageInput,
  AttachButton,
  useMessageInputContext,
  messageActions as defaultMessageActions,
} from 'stream-chat-expo';

import type { ReactionData } from 'stream-chat-expo';

import { useAuth }               from '../../src/context/AuthContext';
import { useStreamChat }         from '../../src/hooks/useStreamChat';
import { StreamCustomMessage }   from '../../src/components/workspace/StreamCustomMessage';
import { ChatFileFilter }        from '../../src/components/workspace/ChatFileFilter';
import { ChatDateSeparator }     from '../../src/components/workspace/ChatDateSeparator';
import {
  ChatMembersSidebar,
  ChatMemberInfo,
  WorkspaceMemberRoles,
} from '../../src/components/workspace/ChatMembersSidebar';
import { ChatSearchModal }       from '../../src/components/workspace/ChatSearchModal';
import { ChatPollCreator }       from '../../src/components/workspace/ChatPollCreator';
import { ChatGifPicker }         from '../../src/components/workspace/ChatGifPicker';
import {
  notifyMention, notifyChatMessage, notifyReply,
} from '../../src/services/workspaceNotificationService';
import { setActiveChatWorkspaceId } from '../../src/lib/screenState';
import {
  playSendSound, playReceiveSound, prewarmChatSounds,
} from '../../src/services/chatSoundService';
import { COLORS, FONTS, SPACING, RADIUS } from '../../src/constants/theme';
import { ChatMessage } from '../../src/types/chat';
import { supabase } from '../../src/lib/supabase';

const TOP_BAR_HEIGHT = 56;

// ─── Part 50.3: Custom Reaction Set (10 reactions) ────────────────────────────

const CUSTOM_REACTIONS: ReactionData[] = [
  { type: 'thumbsup',  Icon: () => <Text style={reactionStyles.emoji}>👍</Text> },
  { type: 'love',      Icon: () => <Text style={reactionStyles.emoji}>❤️</Text> },
  { type: 'haha',      Icon: () => <Text style={reactionStyles.emoji}>😂</Text> },
  { type: 'wow',       Icon: () => <Text style={reactionStyles.emoji}>😮</Text> },
  { type: 'sad',       Icon: () => <Text style={reactionStyles.emoji}>😢</Text> },
  { type: 'fire',      Icon: () => <Text style={reactionStyles.emoji}>🔥</Text> },
  { type: 'party',     Icon: () => <Text style={reactionStyles.emoji}>🎉</Text> },
  { type: 'idea',      Icon: () => <Text style={reactionStyles.emoji}>💡</Text> },
  { type: 'eyes',      Icon: () => <Text style={reactionStyles.emoji}>👀</Text> },
  { type: 'check',     Icon: () => <Text style={reactionStyles.emoji}>✅</Text> },
];

const reactionStyles = StyleSheet.create({
  emoji: { fontSize: 20 },
});

// ─── messageActions filter ───────────────────────────────────────────────────
// Removes 'threadReply' for all messages.
// Removes 'editMessage' for any message that has attachments.
//
// ROOT CAUSE of "setState during render" crash:
//   Stream's _MessageComposer#set__editedMessage() is called inside a useMemo
//   hook during the render phase of useCreateMessageComposer. This violates
//   React's rule that setState must not be called during rendering.
//   The crash fires whenever the user taps "Edit" on any message that contains
//   an attachment (image, GIF, sticker, file, audio — any type).
//   It was previously seen on GIF/sticker messages and is now confirmed on
//   image messages too (SendButton variant in the stack trace).
//
// FIX: Disable editMessage for all messages with attachments.
//   Plain text messages (no attachments) can still be edited normally.
//   Delete, react, pin, markUnread all still work for attachment messages.

const MESSAGE_ACTIONS_NO_THREAD = (params: any) => {
  const actions = defaultMessageActions(params);
  const message = params?.message as any;
  const hasAttachments = ((message?.attachments ?? []) as any[]).length > 0;

  return actions.filter((action: any) => {
    // Never show Thread Reply
    if (action?.actionType === 'threadReply') return false;
    // Editing attachment messages crashes Stream's MessageComposer (SDK bug)
    if (hasAttachments && action?.actionType === 'editMessage') return false;
    return true;
  });
};

// ─── Part 50.X: Sticker Attachment Component ─────────────────────────────────
// Renders inside Stream's MessageSimple bubble system — all gesture handling,
// overlay, reactions, delete, pin, markUnread work natively via MessageSimple.
//
// Stream's Attachment component receives each attachment object and a `type`
// prop. We intercept type === 'sticker' and render a transparent image.
// All other types fall through to Stream's default Attachment rendering.
//
// This is passed as <Channel Attachment={CustomAttachment} />.

const STICKER_SIZE = 160;

function StickerAttachment({ attachment }: { attachment: any }) {
  const url: string =
    attachment.image_url ?? attachment.asset_url ?? attachment.url ?? '';
  if (!url) return null;
  return (
    <Image
      source={{ uri: url }}
      style={{
        width:           STICKER_SIZE,
        height:          STICKER_SIZE,
        // No background — sticker renders transparently inside the bubble
        backgroundColor: 'transparent',
      }}
      resizeMode="contain"
    />
  );
}

// CustomAttachment: passed to <Channel Attachment={...} />
// Stream calls this for each attachment. We handle 'sticker', pass rest to default.
function CustomAttachment(props: any) {
  // Stream v8 passes props.attachment (singular) for each attachment item
  const att = props.attachment ?? props;
  if (att?.type === 'sticker') {
    return <StickerAttachment attachment={att} />;
  }
  // For all other types, use Stream's default Attachment component
  const { Attachment: DefaultAttachment } = require('stream-chat-expo');
  if (DefaultAttachment) {
    return <DefaultAttachment {...props} />;
  }
  return null;
}

// ─── Animated sheet constants ─────────────────────────────────────────────────
const SHEET_ENTER = SlideInDown.duration(280).easing(Easing.out(Easing.cubic));
const SHEET_EXIT  = SlideOutDown.duration(220).easing(Easing.in(Easing.quad));

// ─── Attachment Picker Sheet ──────────────────────────────────────────────────

interface AttachPickerSheetProps {
  visible:  boolean;
  onClose:  () => void;
  onCamera: () => void;
  onPhotos: () => void;
  onFiles:  () => void;
  onPoll:   () => void;
  onGif:    () => void;
}

function AttachPickerSheet({
  visible, onClose, onCamera, onPhotos, onFiles, onPoll, onGif,
}: AttachPickerSheetProps) {
  const insets = useSafeAreaInsets();

  const options = [
    { icon: 'images-outline' as const, label: 'GIF & Stickers', sub: 'Search & send from GIPHY',      color: '#FF6B9D', onPress: onGif    },
    { icon: 'bar-chart'      as const, label: 'Poll',           sub: 'Ask your team a question',       color: '#9B59B6', onPress: onPoll   },
    { icon: 'camera'         as const, label: 'Camera',         sub: 'Take a photo or video',          color: '#FF6B6B', onPress: onCamera },
    { icon: 'images'         as const, label: 'Photo Library',  sub: 'Choose from your gallery',       color: COLORS.primary, onPress: onPhotos },
    { icon: 'document-text'  as const, label: 'File',           sub: 'PDF, Word, Excel and more',      color: '#4ECDC4', onPress: onFiles  },
  ];

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View entering={FadeIn.duration(200)} style={pickerStyles.backdrop}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
      </Animated.View>
      <Animated.View
        entering={SHEET_ENTER}
        exiting={SHEET_EXIT}
        style={[pickerStyles.sheet, { paddingBottom: Math.max(insets.bottom, 20) }]}
      >
        <View style={pickerStyles.handleWrap}><View style={pickerStyles.handle} /></View>
        <Text style={pickerStyles.title}>Add Attachment</Text>
        <View style={pickerStyles.optionList}>
          {options.map((opt, idx) => (
            <TouchableOpacity
              key={idx}
              style={[pickerStyles.optionRow, idx === options.length - 1 && { borderBottomWidth: 0 }]}
              activeOpacity={0.65}
              onPress={() => { onClose(); setTimeout(opt.onPress, 200); }}
            >
              <View style={[pickerStyles.optionIconWrap, { backgroundColor: `${opt.color}18`, borderColor: `${opt.color}30` }]}>
                <Ionicons name={opt.icon} size={22} color={opt.color} />
              </View>
              <View style={pickerStyles.optionText}>
                <Text style={pickerStyles.optionLabel}>{opt.label}</Text>
                <Text style={pickerStyles.optionSub}>{opt.sub}</Text>
              </View>
              <View style={pickerStyles.chevronWrap}>
                <Ionicons name="chevron-forward" size={14} color={COLORS.textMuted} />
              </View>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity style={pickerStyles.cancelBtn} onPress={onClose} activeOpacity={0.7}>
          <Text style={pickerStyles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </Animated.View>
    </Modal>
  );
}

const pickerStyles = StyleSheet.create({
  backdrop:       { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    backgroundColor: COLORS.backgroundCard,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    borderTopWidth: 1, borderColor: COLORS.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.3, shadowRadius: 24, elevation: 32,
  },
  handleWrap:     { alignItems: 'center', paddingTop: 12, paddingBottom: 4 },
  handle:         { width: 44, height: 4, borderRadius: 2, backgroundColor: COLORS.border },
  title: {
    color: COLORS.textPrimary, fontSize: FONTS.sizes.lg, fontWeight: '800',
    textAlign: 'center', paddingTop: SPACING.sm, paddingBottom: SPACING.md, letterSpacing: 0.2,
  },
  optionList:     { paddingHorizontal: SPACING.xl, paddingBottom: 4 },
  optionRow:      { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  optionIconWrap: { width: 48, height: 48, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 1, flexShrink: 0 },
  optionText:     { flex: 1 },
  optionLabel:    { color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '700' },
  optionSub:      { color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, marginTop: 2 },
  chevronWrap:    { width: 28, height: 28, borderRadius: 8, backgroundColor: COLORS.backgroundElevated, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  cancelBtn:      { marginHorizontal: SPACING.xl, marginTop: SPACING.sm, paddingVertical: 14, borderRadius: RADIUS.lg, backgroundColor: COLORS.backgroundElevated, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center' },
  cancelText:     { color: COLORS.textSecondary, fontSize: FONTS.sizes.base, fontWeight: '700' },
});

// ─── Custom Attach Button ─────────────────────────────────────────────────────

function CustomAttachButtonInner({ onPollPress, onGifPress }: { onPollPress: () => void; onGifPress: () => void }) {
  const { uploadNewFile, pickFile } = useMessageInputContext() as any;
  const [showPicker, setShowPicker] = useState(false);

  const handleCamera = useCallback(async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images', 'videos'], quality: 0.9 });
    if (!result.canceled && result.assets.length > 0) {
      const a = result.assets[0];
      await uploadNewFile({ uri: a.uri, name: a.fileName ?? `photo_${Date.now()}.jpg`, type: a.mimeType ?? 'image/jpeg', size: a.fileSize });
    }
  }, [uploadNewFile]);

  const handlePhotos = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: 0.9, allowsMultipleSelection: true, selectionLimit: 10 });
    if (!result.canceled) {
      for (const a of result.assets) {
        await uploadNewFile({ uri: a.uri, name: a.fileName ?? `image_${Date.now()}.jpg`, type: a.mimeType ?? 'image/jpeg', size: a.fileSize });
      }
    }
  }, [uploadNewFile]);

  const handleFiles = useCallback(async () => { await pickFile(); }, [pickFile]);

  return (
    <>
      <AttachButton handleOnPress={() => setShowPicker(true)} />
      <AttachPickerSheet
        visible={showPicker}
        onClose={() => setShowPicker(false)}
        onCamera={handleCamera}
        onPhotos={handlePhotos}
        onFiles={handleFiles}
        onPoll={onPollPress}
        onGif={onGifPress}
      />
    </>
  );
}

// ─── Custom sticky date header ────────────────────────────────────────────────

function CustomDateHeader({ dateString }: { dateString?: string | number }) {
  if (!dateString) return null;
  return (
    <View style={cdhStyles.wrap}>
      <View style={cdhStyles.pill}>
        <Text style={cdhStyles.text}>{String(dateString)}</Text>
      </View>
    </View>
  );
}

const cdhStyles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingTop: 8, width: '100%' },
  pill: {
    backgroundColor: `${COLORS.primary}40`, borderRadius: 20,
    borderWidth: 1.5, borderColor: `${COLORS.primary}80`,
    paddingVertical: 5, paddingHorizontal: 16,
    shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25, shadowRadius: 6, elevation: 4,
  },
  text: { color: COLORS.textPrimary, fontSize: 11, fontWeight: '700', letterSpacing: 0.4 },
});

// ─── Screen ───────────────────────────────────────────────────────────────────

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

  const [showFiles,       setShowFiles]       = useState(false);
  const [showMembers,     setShowMembers]     = useState(false);
  const [showSearch,      setShowSearch]      = useState(false);
  const [showPollCreator, setShowPollCreator] = useState(false);
  const [showGifPicker,   setShowGifPicker]   = useState(false);
  const [fileCount,       setFileCount]       = useState(0);
  const [targetMsgId,     setTargetMsgId]     = useState<string | undefined>(undefined);
  const [streamMembers,   setStreamMembers]   = useState<ChatMemberInfo[]>([]);
  const [onlineCount,     setOnlineCount]     = useState(0);
  const [workspaceMemberRoles, setWorkspaceMemberRoles] = useState<WorkspaceMemberRoles>({});

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

  const workspaceMemberRolesRef = useRef<WorkspaceMemberRoles>({});
  useEffect(() => { workspaceMemberRolesRef.current = workspaceMemberRoles; }, [workspaceMemberRoles]);

  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;
    const fetchRoles = async () => {
      try {
        const { data, error: err } = await supabase.from('workspace_members').select('user_id, role').eq('workspace_id', workspaceId);
        if (err || !data || cancelled) return;
        const roleMap: WorkspaceMemberRoles = {};
        data.forEach((row: any) => { if (row.user_id) roleMap[row.user_id] = row.role as 'owner' | 'editor' | 'viewer'; });
        setWorkspaceMemberRoles(roleMap);
      } catch { /* non-fatal */ }
    };
    fetchRoles();
    return () => { cancelled = true; };
  }, [workspaceId]);

  useEffect(() => {
    if (!client || !workspaceId || !user?.id) return;
    const handleNewMessage = (event: any) => {
      const msg = event.message;
      if (!msg || msg.user?.id === user.id) return;
      if (msg.user?.id === 'deepdive-bot') return; // suppress bot notification
      if (isFocusedRef.current) playReceiveSound().catch(() => {});
      const senderName  = (msg.user?.name as string | undefined) ?? 'Someone';
      const preview     = ((msg.text as string | undefined) ?? '').slice(0, 80);
      const mentioned   = (msg.mentioned_users ?? []).map((u: any) => u.id as string);
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
      // Exclude: deleted messages, GIFs (image/gif), stickers — not real file attachments.
      setFileCount(msgs.reduce((n: number, m: any) => {
        // Skip deleted messages — they have no attachments worth counting
        if (m.deleted_at || m.type === 'deleted') return n;
        const atts = (m.attachments ?? []) as any[];
        const realFiles = atts.filter((a: any) =>
          a.type !== 'sticker' &&
          a.mime_type !== 'image/gif' &&
          a.type !== 'image/gif'
        );
        return n + realFiles.length;
      }, 0));
    };
    countFiles();
    // Listen to all events that change attachment count:
    // message.new    → new file sent
    // message.deleted → file message deleted (count goes down)
    // message.updated → message edited (attachments may change)
    const u1 = channel.on('message.new',     countFiles);
    const u2 = channel.on('message.deleted', countFiles);
    const u3 = channel.on('message.updated', countFiles);
    return () => { u1.unsubscribe(); u2.unsubscribe(); u3.unsubscribe(); };
  }, [channel]);



  const buildMembersRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (!channel) return;
    const buildMembers = () => {
      const rawMembers  = (channel.state as any).members  ?? {};
      const rawWatchers = (channel.state as any).watchers ?? {};
      const onlineIds   = new Set(Object.keys(rawWatchers));
      const rolesNow    = workspaceMemberRolesRef.current;
      const list: ChatMemberInfo[] = Object.values(rawMembers).map((m: any) => {
        const uid = m.user_id ?? m.user?.id ?? '';
        return {
          userId:    uid,
          name:      m.user?.name  ?? '',
          username:  m.user?.name  ?? null,
          avatarUrl: m.user?.image ?? null,
          role:      (rolesNow[uid] as ChatMemberInfo['role']) ?? 'editor',
          isOnline:  onlineIds.has(uid),
        };
      }).filter((m: ChatMemberInfo) => m.userId);
      setStreamMembers(list);
      setOnlineCount(list.filter((m: ChatMemberInfo) => m.isOnline).length);
    };
    buildMembersRef.current = buildMembers;
    buildMembers();
    const s1 = channel.on('user.watching.start', buildMembers);
    const s2 = channel.on('user.watching.stop',  buildMembers);
    const s3 = channel.on('member.added',        buildMembers);
    const s4 = channel.on('member.removed',      buildMembers);
    return () => { s1.unsubscribe(); s2.unsubscribe(); s3.unsubscribe(); s4.unsubscribe(); };
  }, [channel]);

  useEffect(() => {
    if (buildMembersRef.current) buildMembersRef.current();
  }, [workspaceMemberRoles]);

  const handleGoToMessage = useCallback((messageId: string) => {
    setTargetMsgId(messageId);
    setShowSearch(false);
    setShowFiles(false);
    setTimeout(() => setTargetMsgId(undefined), 2000);
  }, []);

  // ── Part 50.3 FIX 3: GIF vs Sticker send ─────────────────────────────────
  // GIFs → type:'image'  (renders in Stream Gallery with bubble — correct)
  // Stickers → type:'sticker' (intercepted by StreamCustomMessage, no bubble)
  const handleGifSelect = useCallback(async (
    gifUrl:    string,
    title:     string,
    isSticker: boolean,
  ) => {
    if (!channel) return;
    try {
      if (isSticker) {
        // Sticker: custom type so StreamCustomMessage can intercept it
        await (channel as any).sendMessage({
          text:        '',
          attachments: [{
            type:      'sticker',      // custom — NOT 'image'
            image_url: gifUrl,
            asset_url: gifUrl,
            title:     title || 'Sticker',
          }],
        });
      } else {
        // GIF: standard image type — renders in Stream Gallery bubble.
        // Include original_width/original_height so Stream's Gallery can
        // compute the correct aspect ratio and show the full GIF without
        // cropping tall/short GIFs. We fetch dimensions from the GIPHY URL.
        let gifWidth: number | undefined;
        let gifHeight: number | undefined;
        try {
          await new Promise<void>((resolve) => {
            (require('react-native') as any).Image.getSize(
              gifUrl,
              (w: number, h: number) => { gifWidth = w; gifHeight = h; resolve(); },
              () => resolve(), // ignore errors — send without dimensions
            );
          });
        } catch { /* non-fatal */ }

        await (channel as any).sendMessage({
          text:        '',
          attachments: [{
            type:            'image',
            image_url:       gifUrl,
            asset_url:       gifUrl,
            title:           title || 'GIF',
            mime_type:       'image/gif',
            original_width:  gifWidth,
            original_height: gifHeight,
          }],
        });
      }
    } catch (e) {
      console.warn('[ChatGifPicker] Failed to send:', e);
    }
  }, [channel]);

  // ── Access guard ──────────────────────────────────────────────────────────
  if (!isOwnerOrEditor) {
    return (
      <View style={[styles.lockRoot, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={styles.lockScreen}>
          <View style={styles.lockIcon}><Ionicons name="lock-closed" size={40} color={COLORS.textMuted} /></View>
          <Text style={styles.lockTitle}>Team Chat</Text>
          <Text style={styles.lockDesc}>Chat is only available to owners and editors.{'\n'}Ask your workspace owner to upgrade your role.</Text>
          <TouchableOpacity onPress={() => router.back()} style={styles.lockBackBtn}>
            <Ionicons name="arrow-back-outline" size={16} color="#FFF" />
            <Text style={styles.lockBackBtnText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (!isReady || !channel || !client) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <TopBar workspaceName={workspaceName ?? 'Team Chat'} onBack={() => router.back()} onFiles={() => {}} onSearch={() => {}} onMembers={() => {}} fileCount={0} onlineCount={0} memberCount={0} />
        <View style={styles.loadWrap}>
          {error ? (
            <>
              <Ionicons name="alert-circle-outline" size={40} color={COLORS.error} />
              <Text style={styles.errTxt}>{error}</Text>
              <TouchableOpacity onPress={refresh} style={styles.retryBtn}><Text style={styles.retryTxt}>Retry</Text></TouchableOpacity>
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

  const channelTopInset    = insets.top + TOP_BAR_HEIGHT;
  const channelBottomInset = insets.bottom;

  const ChatWrapper      = Platform.OS === 'ios' ? KeyboardAvoidingView : View;
  const chatWrapperProps: any = Platform.OS === 'ios'
    ? { style: styles.chatContainer, behavior: 'padding', keyboardVerticalOffset: channelTopInset }
    : { style: [styles.chatContainer, { paddingBottom: insets.bottom }] };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />

      <View style={[styles.topBarSafeArea, { paddingTop: insets.top }]}>
        <TopBarWithPresence
          workspaceName={workspaceName ?? 'Team Chat'}
          channel={channel}
          onBack={() => router.back()}
          onFiles={() => setShowFiles(true)}
          onSearch={() => setShowSearch(true)}
          onMembers={() => setShowMembers(true)}
          fileCount={fileCount}
        />
      </View>

      <ChatWrapper {...chatWrapperProps}>
        <Chat client={client as any}>
          <Channel
            channel={channel}
            keyboardVerticalOffset={Platform.OS === 'ios' ? channelTopInset : 0}
            MessageSimple={StreamCustomMessage}
            topInset={channelTopInset}
            bottomInset={channelBottomInset}
            supportedReactions={CUSTOM_REACTIONS}
            reactionListPosition="bottom"
            // Part 50.4: GIF auto-sizing — no fixed height on gallery imageContainer
            // so tall/short GIFs render at their natural aspect ratio (not cropped).
            // Part 50.5: GIF sizing handled via original_width/original_height
            // in the attachment object sent with each GIF. Stream's Gallery
            // component uses those fields to compute the correct aspect ratio,
            // so tall/short GIFs display at their natural size without cropping.
            // Part 50.3: Remove Thread Reply from message actions
            messageActions={MESSAGE_ACTIONS_NO_THREAD}
            Attachment={CustomAttachment}
            AttachButton={() => (
              <CustomAttachButtonInner
                onPollPress={() => setShowPollCreator(true)}
                onGifPress={() => setShowGifPicker(true)}
              />
            )}
            InlineDateSeparator={ChatDateSeparator}
            DateHeader={CustomDateHeader}
            disableKeyboardCompatibleView={Platform.OS === 'android'}
            audioRecordingEnabled
          >
            {/*
              Part 50.3 FIX 1: No onThreadSelect prop on MessageList.
              Not providing onThreadSelect means tapping "Thread Reply" action
              (which we've already removed from messageActions) does nothing.
              No Thread component is rendered anywhere in this screen.
            */}
            <MessageList targetedMessage={targetMsgId} />
            <MessageInput />
          </Channel>
        </Chat>
      </ChatWrapper>

      <ChatFileFilterStream
        visible={showFiles}
        channel={channel}
        onClose={() => setShowFiles(false)}
        onScrollToMessage={handleGoToMessage}
      />

      <ChatMembersSidebar
        visible={showMembers}
        members={streamMembers}
        onlineCount={onlineCount}
        onClose={() => setShowMembers(false)}
        workspaceMemberRoles={workspaceMemberRoles}
      />

      <ChatSearchModal
        visible={showSearch}
        channel={channel}
        onClose={() => setShowSearch(false)}
        onGoToMessage={handleGoToMessage}
      />

      {client && channel && (
        <ChatPollCreator
          visible={showPollCreator}
          onClose={() => setShowPollCreator(false)}
          client={client}
          channel={channel}
        />
      )}

      {/* Part 50.2/50.3 — GIF & Sticker Picker */}
      <ChatGifPicker
        visible={showGifPicker}
        onClose={() => setShowGifPicker(false)}
        onSelect={handleGifSelect}
        giphyApiKey={process.env.EXPO_PUBLIC_GIPHY_API_KEY ?? ''}
      />
    </View>
  );
}

// ─── Top bar ──────────────────────────────────────────────────────────────────

interface TopBarProps {
  workspaceName: string;
  onBack:        () => void;
  onFiles:       () => void;
  onSearch:      () => void;
  onMembers:     () => void;
  fileCount:     number;
  onlineCount:   number;
  memberCount:   number;
}

function TopBar({ workspaceName, onBack, onFiles, onSearch, onMembers, fileCount, onlineCount, memberCount }: TopBarProps) {
  return (
    <Animated.View entering={FadeIn.duration(350)} style={styles.topBar}>
      <TouchableOpacity onPress={onBack} style={styles.backBtn}>
        <Ionicons name="chevron-back" size={22} color={COLORS.textPrimary} />
      </TouchableOpacity>
      <View style={styles.topCenter}>
        <View style={styles.titleRow}>
          <View style={styles.chatIcon}><Ionicons name="chatbubbles" size={16} color={COLORS.primary} /></View>
          <Text style={styles.topTitle} numberOfLines={1}>{workspaceName}</Text>
        </View>
        <Text style={styles.topSub}>
          {memberCount > 0 && `${memberCount} members`}
          {onlineCount > 0 && memberCount > 0 && ' · '}
          {onlineCount > 0 && `${onlineCount} online`}
        </Text>
      </View>
      <View style={styles.topActions}>
        <TouchableOpacity onPress={onSearch} style={styles.iconBtn} activeOpacity={0.7}>
          <Ionicons name="search-outline" size={17} color={COLORS.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity onPress={onFiles} style={[styles.iconBtn, fileCount > 0 && styles.iconBtnFiles]} activeOpacity={0.7}>
          <Ionicons name="folder-open-outline" size={17} color={fileCount > 0 ? COLORS.primary : COLORS.textSecondary} />
          {fileCount > 0 && <View style={styles.badge}><Text style={styles.badgeTxt}>{fileCount > 99 ? '99+' : fileCount}</Text></View>}
        </TouchableOpacity>
        <TouchableOpacity onPress={onMembers} style={styles.iconBtn} activeOpacity={0.7}>
          <Ionicons name="people-outline" size={17} color={COLORS.textSecondary} />
          {onlineCount > 0 && <View style={[styles.badge, { backgroundColor: COLORS.success }]}><Text style={styles.badgeTxt}>{onlineCount}</Text></View>}
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

interface TopBarWithPresenceProps extends Omit<TopBarProps, 'onlineCount' | 'memberCount'> { channel: any; }

function TopBarWithPresence({ channel, ...rest }: TopBarWithPresenceProps) {
  const [watcherCount, setWatcherCount] = useState<number>((channel.state as any).watcher_count ?? 0);
  const memberCount = useMemo(() => Object.keys((channel.state as any).members ?? {}).length, []);
  useEffect(() => {
    const update = () => setWatcherCount((channel.state as any).watcher_count ?? 0);
    const s1 = channel.on('user.watching.start', update);
    const s2 = channel.on('user.watching.stop',  update);
    return () => { s1.unsubscribe(); s2.unsubscribe(); };
  }, [channel]);
  return <TopBar {...rest} onlineCount={watcherCount} memberCount={memberCount} />;
}

// ─── ChatFileFilter adapter ───────────────────────────────────────────────────

function ChatFileFilterStream({ visible, channel, onClose, onScrollToMessage }: {
  visible: boolean; channel: any; onClose: () => void; onScrollToMessage: (id: string) => void;
}) {
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
          size: typeof a.file_size === 'number' ? a.file_size : typeof a.file_size === 'string' ? parseInt(a.file_size, 10) || undefined : undefined,
        })),
        mentions:  [],
        isEdited:  !!(m.message_text_updated_at),
        isDeleted: !!(m.deleted_at),
        isPinned:  !!(m.pinned),
        reactions: [],
        author: m.user ? { id: m.user.id ?? '', username: m.user.name ?? null, fullName: m.user.name ?? null, avatarUrl: m.user.image ?? null } : null,
        createdAt: m.created_at ?? new Date().toISOString(),
        updatedAt: m.updated_at ?? new Date().toISOString(),
      }));
  }, [channel?.state?.messages, visible]);

  return <ChatFileFilter visible={visible} messages={messages} onClose={onClose} onScrollToMessage={onScrollToMessage} />;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:             { flex: 1, backgroundColor: COLORS.background },
  lockRoot:         { flex: 1, backgroundColor: COLORS.background },
  topBarSafeArea:   { backgroundColor: COLORS.background, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  topBar:           { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, gap: 10, height: TOP_BAR_HEIGHT },
  chatContainer:    { flex: 1 },
  backBtn:          { width: 36, height: 36, borderRadius: 11, backgroundColor: COLORS.backgroundCard, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border, flexShrink: 0 },
  topCenter:        { flex: 1 },
  titleRow:         { flexDirection: 'row', alignItems: 'center', gap: 7 },
  chatIcon:         { width: 26, height: 26, borderRadius: 8, backgroundColor: `${COLORS.primary}18`, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  topTitle:         { color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '800', flex: 1 },
  topSub:           { color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 1, paddingLeft: 33 },
  topActions:       { flexDirection: 'row', gap: 5, alignItems: 'center' },
  iconBtn:          { width: 34, height: 34, borderRadius: 10, backgroundColor: COLORS.backgroundCard, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border },
  iconBtnFiles:     { borderColor: `${COLORS.primary}35` },
  badge:            { position: 'absolute', top: -4, right: -4, backgroundColor: COLORS.primary, borderRadius: 8, minWidth: 15, height: 15, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2, borderWidth: 1.5, borderColor: COLORS.background },
  badgeTxt:         { color: '#FFF', fontSize: 8, fontWeight: '800' },
  lockScreen:       { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACING.xl, gap: 16 },
  lockIcon:         { width: 80, height: 80, borderRadius: 24, backgroundColor: `${COLORS.textMuted}15`, alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.sm },
  lockTitle:        { color: COLORS.textPrimary, fontSize: FONTS.sizes['2xl'], fontWeight: '800' },
  lockDesc:         { color: COLORS.textSecondary, fontSize: FONTS.sizes.base, textAlign: 'center', lineHeight: 24, maxWidth: 300 },
  lockBackBtn:      { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: COLORS.primary, borderRadius: RADIUS.lg, paddingHorizontal: SPACING.xl, paddingVertical: 13, marginTop: SPACING.sm },
  lockBackBtnText:  { color: '#FFF', fontSize: FONTS.sizes.base, fontWeight: '700' },
  loadWrap:         { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  loadTxt:          { color: COLORS.textMuted, fontSize: FONTS.sizes.sm },
  errTxt:           { color: COLORS.textSecondary, textAlign: 'center', fontSize: FONTS.sizes.sm, maxWidth: 280 },
  retryBtn:         { backgroundColor: COLORS.primary, borderRadius: RADIUS.lg, paddingHorizontal: SPACING.xl, paddingVertical: SPACING.sm },
  retryTxt:         { color: '#FFF', fontWeight: '700' },
});