// src/components/workspace/StreamCustomMessage.tsx
// Part 49 — Custom Message Component for Stream Chat
// Part 50 — Removed DocumentPreviewTrigger (Stream renders docs natively)
// Part 50 D FIX — Double video removed (Stream v8 renders video via expo-video natively)
// Part 50.4 FIX — Double audio removed:
//
//   ROOT CAUSE: audioRecordingEnabled on <Channel> makes Stream send voice
//   messages with type='voiceRecording' and mime_type='audio/aac'. Our previous
//   code intercepted any attachment whose mime_type started with 'audio/' and
//   rendered a second AudioPlayerBubble below MessageSimple. Stream's own
//   FileAttachmentGroup ALSO renders its built-in AudioAttachment for
//   type === 'audio' and type === 'voiceRecording'. Result: two players.
//
//   FIX: Remove AudioPlayerBubble and the isAudioMime check entirely.
//   Stream v8 renders ALL audio (both type='audio' and type='voiceRecording')
//   natively inside MessageSimple → FileAttachmentGroup → AudioAttachment.
//   Our custom rendering is not needed and was causing duplication.
//
//   StreamCustomMessage now unconditionally delegates to MessageSimple for
//   all attachment types: text, images, video, audio, voice recordings, docs.
//   No attachment interception remains.

import React, { memo } from 'react';
import { MessageSimple } from 'stream-chat-expo';

// ─── Custom message component ─────────────────────────────────────────────────
//
// Full delegation strategy (stream-chat-expo v8, Part 50.4):
//   MessageSimple handles everything:
//     • Text content
//     • Reactions, reply preview, pin badge
//     • Images → lightbox
//     • Videos → expo-video inline player
//     • Audio (type='audio') → AudioAttachment (waveform + seek)
//     • Voice recordings (type='voiceRecording') → AudioAttachment
//     • Documents → file chip (PDF, Word, Excel, etc.)
//
// Nothing is intercepted. AudioPlayerBubble removed to prevent double-render.

export const StreamCustomMessage = memo(function StreamCustomMessage() {
  return <MessageSimple />;
});