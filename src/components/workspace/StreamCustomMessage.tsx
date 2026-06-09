// src/components/workspace/StreamCustomMessage.tsx
// Part 49 — Custom Message Component for Stream Chat
// Part 50 FIXES: Removed DocumentPreviewTrigger (Stream renders docs natively)
// Part 50D FIX — Double video (black screen) removed:
//
//   ROOT CAUSE: stream-chat-expo v7+ uses expo-video to render video attachments
//   natively inside MessageSimple. Our custom VideoPlayerBubble was rendering
//   BELOW MessageSimple as a second player, producing two video tiles per message:
//     1. Stream's native expo-video thumbnail (with play button) — from MessageSimple
//     2. Our VideoPlayerBubble (black screen) — from the custom code below
//
//   FIX: Remove VideoPlayerBubble entirely. Stream v8 handles video via expo-video
//   natively and the result is already good (thumbnail + play → fullscreen).
//   Our VideoPlayerBubble is now ONLY kept for audio (stream-chat-expo's audio
//   handler may not render inline waveform/seek controls as richly as ours).
//
//   BEFORE: intercept video + audio → render MessageSimple + custom players below
//   AFTER:  intercept audio only   → render MessageSimple (handles video+images+docs)
//                                     + AudioPlayerBubble below for audio only

import React, { memo, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import {
  MessageSimple,
  useMessageContext,
} from 'stream-chat-expo';
import type { LocalMessage } from 'stream-chat';

// VideoPlayerBubble intentionally NOT imported — Stream renders video natively
// via expo-video inside MessageSimple (v7+). Using VideoPlayerBubble caused
// a double-video: Stream's native tile + our black-screen tile.
import { AudioPlayerBubble } from './AudioPlayerBubble';
import type { ChatAttachment } from '../../types/chat';
import { SPACING } from '../../constants/theme';

// ─── Attachment type classifier ───────────────────────────────────────────────

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
// Delegation strategy (stream-chat-expo v8):
//   • MessageSimple (Stream) handles:
//       - Text content
//       - Reactions, reply preview, pin badge
//       - Images → lightbox
//       - Videos → expo-video inline player (thumbnail + fullscreen)
//       - Documents → file chip (PDF, Word, Excel, etc.)
//   • AudioPlayerBubble (ours) handles:
//       - audio/* attachments only
//       - Richer inline waveform + seek bar + rate control
//       - Stream's default audio chip is basic; ours is better UX
//
// Nothing else is intercepted. All other attachment types go straight to Stream.

export const StreamCustomMessage = memo(function StreamCustomMessage() {
  const { message, isMyMessage } = useMessageContext();

  const attachments = useMemo(
    () => (message.attachments ?? []) as NonNullable<LocalMessage['attachments']>,
    [message.attachments],
  );

  // Only intercept audio — everything else (video, images, docs) → Stream
  const audioAtts = useMemo(
    () => attachments.filter(a => isAudioMime(a.mime_type ?? (a.type as string))),
    [attachments],
  );

  const hasCustomAtts = audioAtts.length > 0;

  // No audio attachments → delegate entirely to Stream's default renderer
  if (!hasCustomAtts) {
    return <MessageSimple />;
  }

  return (
    <View style={styles.wrapper}>
      {/* Stream handles everything: text, reactions, images, video, docs */}
      <MessageSimple />

      {/* Our AudioPlayerBubble for richer inline audio playback */}
      <View style={[
        styles.customAttsContainer,
        isMyMessage ? styles.customAttsOwn : styles.customAttsOther,
      ]}>
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