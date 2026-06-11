// app/(app)/workspace-chat.tsx
// Part 49 — Stream Chat
// Part 50 — Custom date separator, files fix, members sidebar, search modal
// Part 50.1 — Poll creator, voice recording, members sidebar role fix
// Part 50.2 — GIF picker
// Part 50.3 — Custom reactions, AI bot, sticker fix, thread removed
// Part 50.4 — Bot scoped to workspace reports (bot file), GIF dimension fix
// Part 50.4 FIX — Removed Gallery={SingleImageGallery} that broke images/videos
// Part 50.6 — IMAGE/VIDEO BUBBLE RESIZING FIX (staging preserved)
//
// ─── THE BUG ─────────────────────────────────────────────────────────────────
//   Sent images only sized correctly AFTER leaving the chat and re-entering,
//   and sent videos never sized correctly at all. GIFs always sized correctly.
//
//   ROOT CAUSE:
//     Images/videos were attached via `uploadNewFile({ uri, name, type, size })`
//     — note it NEVER passed the asset's pixel `width`/`height`. Stream's RN
//     Gallery sizes the message bubble (both width AND height) from the
//     attachment's `original_width`/`original_height`. Without them, the
//     OPTIMISTIC local message renders at a wrong/default size. Stream's server
//     later re-enriches IMAGE attachments with dimensions, so on a fresh channel
//     fetch (leaving + returning) images finally size correctly — exactly the
//     reported symptom. Videos are NOT re-enriched server-side, so they never
//     size to the content.
//
//     GIFs avoided this because `handleGifSelect` builds the attachment by hand
//     WITH `original_width`/`original_height` and sends via channel.sendMessage,
//     so the aspect ratio is known on the very first render.
//
// ─── THE FIX (keeps the message-box staging UX so you can add a caption) ──────
//   We still stage media in the composer via `uploadNewFile` (image/video shows
//   a preview, you can attach text, then send together). We guarantee the
//   dimensions reach the attachment TWO ways:
//
//     1. Pass `width`/`height` to `uploadNewFile`. Stream stores these in the
//        attachment's local metadata and maps them to
//        `original_width`/`original_height` on the optimistic + sent attachment.
//        This is what makes the bubble correct immediately (incl. the receiver).
//
//     2. `doSendMessageRequest` safety net. Right before the message is sent,
//        we fill `original_width`/`original_height` on any image/video
//        attachment still missing them, using dimensions captured at pick-time
//        (matched by file name, with a single-item fallback). This covers any
//        case where the SDK's local-metadata path doesn't populate video dims.
//
//   The gallery theme (streamChatTheme.ts) is intentionally UNCHANGED. GIFs
//   already render correctly through the same Gallery + theme, proving the theme
//   is right *when dimensions are present* — the dimensions were the only
//   missing piece. Documents/audio still use the normal staging flow untouched.

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

// ─── Part 50.6: Media dimension registry type ─────────────────────────────────
// Captured at pick-time and consumed by doSendMessageRequest as a safety net.
type MediaDims = { width: number; height: number; kind: 'image' | 'video' };

// ─── Part 50.3: Custom Reaction Set (10 reactions) ────────────────────────────

const CUSTOM_REACTIONS: ReactionData[] = [
  { type: 'thumbsup', Icon: () => <Text style={reactionStyles.emoji}>👍</Text> },
  { type: 'love',     Icon: () => <Text style={reactionStyles.emoji}>❤️</Text> },
  { type: 'haha',     Icon: () => <Text style={reactionStyles.emoji}>😂</Text> },
  { type: 'wow',      Icon: () => <Text style={reactionStyles.emoji}>😮</Text> },
  { type: 'sad',      Icon: () => <Text style={reactionStyles.emoji}>😢</Text> },
  { type: 'fire',     Icon: () => <Text style={reactionStyles.emoji}>🔥</Text> },
  { type: 'party',    Icon: () => <Text style={reactionStyles.emoji}>🎉</Text> },
  { type: 'idea',     Icon: () => <Text style={reactionStyles.emoji}>💡</Text> },
  { type: 'eyes',     Icon: () => <Text style={reactionStyles.emoji}>👀</Text> },
  { type: 'check',    Icon: () => <Text style={reactionStyles.emoji}>✅</Text> },
];

const reactionStyles = StyleSheet.create({
  emoji: { fontSize: 20 },
});

// ─── messageActions filter ───────────────────────────────────────────────────
// Removes 'threadReply' for all messages.
// Removes 'editMessage' for any message that has attachments (Stream SDK crash).

const MESSAGE_ACTIONS_NO_THREAD = (params: any) => {
  const actions        = defaultMessageActions(params);
  const message        = params?.message as any;
  const hasAttachments = ((message?.attachments ?? []) as any[]).length > 0;

  return actions.filter((action: any) => {
    if (action?.actionType === 'threadReply') return false;
    if (hasAttachments && action?.actionType === 'editMessage') return false;
    return true;
  });
};

// ─── Part 50.X: Sticker Attachment Component ─────────────────────────────────
// Renders stickers (custom type:'sticker') transparently inside Stream's
// MessageSimple bubble. All gesture handling stays with MessageSimple.
// Passed as Attachment prop on <Channel>.

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
        backgroundColor: 'transparent',
      }}
      resizeMode="contain"
    />
  );
}

// CustomAttachment: passed to <Channel Attachment={...} />
// ONLY intercepts type:'sticker'. Everything else — images, GIFs, videos,
// files, audio — goes to Stream's default Attachment renderer unchanged.
// This is critical: Stream's default Attachment handles video thumbnails,
// file chips, audio players, etc. We must not break those.
function CustomAttachment(props: any) {
  const att = props.attachment ?? props;
  if (att?.type === 'sticker') {
    return <StickerAttachment attachment={att} />;
  }
  // Pass everything else to Stream's default Attachment
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
    { icon: 'images-outline' as const, label: 'GIF & Stickers', sub: 'Search & send from GIPHY',    color: '#FF6B9D', onPress: onGif    },
    { icon: 'bar-chart'      as const, label: 'Poll',           sub: 'Ask your team a question',     color: '#9B59B6', onPress: onPoll   },
    { icon: 'camera'         as const, label: 'Camera',         sub: 'Take a photo or video',        color: '#FF6B6B', onPress: onCamera },
    { icon: 'images'         as const, label: 'Photo Library',  sub: 'Choose from your gallery',     color: COLORS.primary, onPress: onPhotos },
    { icon: 'document-text'  as const, label: 'File',           sub: 'PDF, Word, Excel and more',    color: '#4ECDC4', onPress: onFiles  },
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
//
// Part 50.6: camera & photo-library media stage in the composer (so a caption
// can be added) via uploadNewFile, but now we PASS width/height so the resulting
// attachment carries original_width/original_height. We also register the dims
// (keyed by file name) so doSendMessageRequest can backfill them as a safety net.
// Documents still use pickFile (no aspect-ratio concern).

function CustomAttachButtonInner({
  onPollPress,
  onGifPress,
  registerMediaDims,
}: {
  onPollPress:       () => void;
  onGifPress:        () => void;
  registerMediaDims: (name: string, dims: MediaDims) => void;
}) {
  const { uploadNewFile, pickFile } = useMessageInputContext() as any;
  const [showPicker, setShowPicker] = useState(false);

  const stageAsset = useCallback(async (a: any, idx: number) => {
    const isVideo =
      a?.type === 'video' ||
      (typeof a?.mimeType === 'string' && a.mimeType.startsWith('video/'));

    const name = a.fileName ?? (isVideo
      ? `video_${Date.now()}_${idx}.mp4`
      : `image_${Date.now()}_${idx}.jpg`);
    const type = a.mimeType ?? (isVideo ? 'video/mp4' : 'image/jpeg');

    if (typeof a.width === 'number' && typeof a.height === 'number') {
      registerMediaDims(name, {
        width:  a.width,
        height: a.height,
        kind:   isVideo ? 'video' : 'image',
      });
    }

    // Pass height/width so Stream stores them in the attachment's local metadata
    // → original_width/original_height on the optimistic + sent attachment, so
    // the bubble resizes to content immediately.
    await uploadNewFile({
      uri:    a.uri,
      name,
      type,
      size:   a.fileSize,
      height: a.height,
      width:  a.width,
    });
  }, [uploadNewFile, registerMediaDims]);

  const handleCamera = useCallback(async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images', 'videos'],
      quality:    0.9,
    });
    if (!result.canceled && result.assets.length > 0) {
      await stageAsset(result.assets[0], 0);
    }
  }, [stageAsset]);

  const handlePhotos = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes:              ['images', 'videos'],
      quality:                 0.9,
      allowsMultipleSelection: true,
      selectionLimit:          10,
    });
    if (!result.canceled) {
      for (let i = 0; i < result.assets.length; i++) {
        await stageAsset(result.assets[i], i);
      }
    }
  }, [stageAsset]);

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

  // ── Part 50.6: pick-time media dimensions registry (filename → dims) ────────
  const mediaDimsRef = useRef<Map<string, MediaDims>>(new Map());

  const registerMediaDims = useCallback((name: string, dims: MediaDims) => {
    const map = mediaDimsRef.current;
    map.set(name, dims);
    // Keep the map small — prune the oldest entry once it grows past 40.
    if (map.size > 40) {
      const firstKey = map.keys().next().value;
      if (firstKey !== undefined) map.delete(firstKey);
    }
  }, []);

  // doSendMessageRequest runs after the composer uploads but before send. We
  // backfill original_width/original_height on any image/video attachment that
  // is still missing them, so the bubble sizes to content on first render.
  const doSendMessageRequest = useCallback(async (_channelId: any, messageObject: any) => {
    try {
      const atts: any[] = Array.isArray(messageObject?.attachments) ? messageObject.attachments : [];
      const map = mediaDimsRef.current;

      const missingMedia = atts.filter(
        (a) => (a?.type === 'image' || a?.type === 'video') &&
               !(typeof a.original_width === 'number' && typeof a.original_height === 'number'),
      );

      for (const att of atts) {
        if (att?.type !== 'image' && att?.type !== 'video') continue;
        const hasDims = typeof att.original_width === 'number' && typeof att.original_height === 'number';
        if (hasDims) continue;

        // 1) Match by the file name we assigned at pick time.
        const key  = (att.fallback ?? att.title ?? att.name ?? '') as string;
        let   dims = key ? map.get(key) : undefined;
        let   usedKey: string | undefined = dims ? key : undefined;

        // 2) Single-item fallback: exactly one media attachment is missing dims
        //    and exactly one stored entry of the same kind exists — use it.
        if (!dims && missingMedia.length === 1) {
          for (const [k, v] of map.entries()) {
            if (v.kind === att.type) { dims = v; usedKey = k; break; }
          }
        }

        if (dims?.width && dims?.height) {
          att.original_width  = dims.width;
          att.original_height = dims.height;
          if (usedKey) map.delete(usedKey);
        }
      }
    } catch (e) {
      console.warn('[doSendMessageRequest] dimension enrich failed:', e);
    }
    return (channel as any).sendMessage(messageObject);
  }, [channel]);

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
      setFileCount(msgs.reduce((n: number, m: any) => {
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

  // ── GIF vs Sticker send ───────────────────────────────────────────────────
  // GIFs: include original_width/original_height for correct aspect ratio.
  // Stickers: custom type:'sticker' intercepted by CustomAttachment.
  const handleGifSelect = useCallback(async (
    gifUrl:    string,
    title:     string,
    isSticker: boolean,
  ) => {
    if (!channel) return;
    try {
      if (isSticker) {
        await (channel as any).sendMessage({
          text:        '',
          attachments: [{
            type:      'sticker',
            image_url: gifUrl,
            asset_url: gifUrl,
            title:     title || 'Sticker',
          }],
        });
      } else {
        // Resolve GIF dimensions before sending so Stream's Gallery can
        // immediately show the correct aspect ratio on the receiver's side
        let gifWidth: number | undefined;
        let gifHeight: number | undefined;
        try {
          await new Promise<void>((resolve) => {
            Image.getSize(
              gifUrl,
              (w: number, h: number) => { gifWidth = w; gifHeight = h; resolve(); },
              () => resolve(),
            );
          });
        } catch { /* non-fatal — send without dimensions */ }

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
            messageActions={MESSAGE_ACTIONS_NO_THREAD}
            // Part 50.6: backfill image/video dimensions just before send so the
            // bubble resizes to content on first render (kept on top of passing
            // width/height to uploadNewFile, which handles the optimistic case).
            doSendMessageRequest={doSendMessageRequest}
            // NOTE: No Gallery prop here — Stream's built-in Gallery handles
            // both image AND video attachments. Replacing it breaks videos.
            // Image/video sizing works because we now supply original_width/
            // original_height. Theme (streamChatTheme.ts) unchanged.
            Attachment={CustomAttachment}
            AttachButton={() => (
              <CustomAttachButtonInner
                onPollPress={() => setShowPollCreator(true)}
                onGifPress={() => setShowGifPicker(true)}
                registerMediaDims={registerMediaDims}
              />
            )}
            InlineDateSeparator={ChatDateSeparator}
            DateHeader={CustomDateHeader}
            disableKeyboardCompatibleView={Platform.OS === 'android'}
            audioRecordingEnabled
          >
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