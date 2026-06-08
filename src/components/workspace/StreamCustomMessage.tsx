// src/components/workspace/StreamCustomMessage.tsx
// Part 49 — Custom Message Component for Stream Chat
// Part 50 FIXES:
//   FIX 2: Removed DocumentPreviewTrigger — Stream's built-in attachment renderer
//          already shows a styled document chip for PDFs, Word, etc. Our custom
//          chip was appearing as a SECOND gray tile below Stream's own tile.
//          We now only intercept video and audio attachments (Stream has no
//          built-in player for those). Images and documents are handled entirely
//          by Stream's default MessageSimple renderer.
//
//   The "ph://" crash on iOS was also caused by our code trying to display local
//   photo-library URIs directly. By letting Stream own image/document rendering
//   (it resolves ph:// via expo-media-library internally), the crash is avoided.

import React, { memo, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import {
  MessageSimple,
  useMessageContext,
} from 'stream-chat-expo';
import type { LocalMessage } from 'stream-chat';

import { VideoPlayerBubble } from './VideoPlayerBubble';
import { AudioPlayerBubble } from './AudioPlayerBubble';
// NOTE: DocumentPreviewTrigger intentionally NOT imported — Stream renders docs natively.
import type { ChatAttachment } from '../../types/chat';
import { SPACING } from '../../constants/theme';

// ─── Attachment type classifiers ──────────────────────────────────────────────

function isVideoMime(type: string | undefined): boolean {
  return !!(type?.startsWith('video/'));
}
function isAudioMime(type: string | undefined): boolean {
  return !!(type?.startsWith('audio/'));
}

// ─── Map Stream attachment → our ChatAttachment type ─────────────────────────

function toOurAttachment(
  streamAtt: NonNullable<LocalMessage['attachments']>[number],
): ChatAttachment {
  const rawSize = streamAtt.file_size;
  const sizeNum: number | undefined =
    typeof rawSize === 'number'
      ? rawSize
      : typeof rawSize === 'string'
        ? parseInt(rawSize, 10) || undefined
        : undefined;

  const mimeType: string =
    streamAtt.mime_type ??
    (streamAtt.type as string | undefined) ??
    'application/octet-stream';

  return {
    url:  streamAtt.asset_url ?? streamAtt.image_url ?? streamAtt.thumb_url ?? '',
    name: streamAtt.title     ?? streamAtt.fallback  ?? 'Attachment',
    type: mimeType,
    size: sizeNum,
  };
}

// ─── Custom message component ─────────────────────────────────────────────────
//
// Strategy:
//   • Stream's MessageSimple handles: text, reactions, reply preview, pin badge,
//     images (with lightbox), and document file chips.
//   • We only intercept video and audio — Stream has no built-in inline player
//     for these, so our custom VideoPlayerBubble / AudioPlayerBubble are needed.
//   • Documents are intentionally left to Stream (FIX 2 — removes double chip).

export const StreamCustomMessage = memo(function StreamCustomMessage() {
  const { message, isMyMessage } = useMessageContext();

  const attachments = useMemo(
    () => (message.attachments ?? []) as NonNullable<LocalMessage['attachments']>,
    [message.attachments],
  );

  // Only intercept video and audio — everything else goes to Stream's renderer
  const videoAtts = useMemo(
    () => attachments.filter(a => isVideoMime(a.mime_type ?? (a.type as string))),
    [attachments],
  );
  const audioAtts = useMemo(
    () => attachments.filter(a => isAudioMime(a.mime_type ?? (a.type as string))),
    [attachments],
  );

  const hasCustomAtts = videoAtts.length > 0 || audioAtts.length > 0;

  // No custom attachments → delegate entirely to Stream's default renderer
  if (!hasCustomAtts) {
    return <MessageSimple />;
  }

  return (
    <View style={styles.wrapper}>
      {/* Stream handles: text, reactions, reply preview, pin badge, images, docs */}
      <MessageSimple />

      {/* Our custom players appear below the Stream bubble — video & audio only */}
      <View style={[
        styles.customAttsContainer,
        isMyMessage ? styles.customAttsOwn : styles.customAttsOther,
      ]}>
        {videoAtts.map((att, i) => (
          <VideoPlayerBubble
            key={`video-${i}`}
            attachment={toOurAttachment(att)}
            isOwnMessage={isMyMessage}
          />
        ))}
        {audioAtts.map((att, i) => (
          <AudioPlayerBubble
            key={`audio-${i}`}
            attachment={toOurAttachment(att)}
            isOwnMessage={isMyMessage}
          />
        ))}
      </View>
    </View>
  );
});

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
  },
  customAttsContainer: {
    marginTop:    SPACING.xs,
    marginBottom: SPACING.xs,
    gap:          SPACING.sm,
  },
  customAttsOwn: {
    alignItems:   'flex-end',
    paddingRight: SPACING.md,
  },
  customAttsOther: {
    alignItems:  'flex-start',
    paddingLeft: SPACING.md,
  },
});