// src/components/workspace/StreamCustomMessage.tsx
// Part 49 — Custom Message Component for Stream Chat
// Part 50.3 — Originally handled sticker rendering here
// Part 50.X FINAL FIX — Sticker rendering moved OUT of this component.
//
// ROOT CAUSE of all sticker action failures (reactions, delete, pin, markUnread):
//   We were intercepting sticker messages and returning a custom View/Pressable
//   INSTEAD of <MessageSimple />. This bypassed Stream's entire message wrapper
//   system (Message HOC → MessageWrapper → MessageSimple) which is responsible
//   for ALL gesture handling, overlay triggering, and action execution.
//   No amount of manual onLongPress/showMessageOverlay/contextMenuAnchorRef
//   wiring can fully replicate what Stream's internal system does.
//
// CORRECT ARCHITECTURE:
//   - StreamCustomMessage always returns <MessageSimple /> for ALL messages.
//   - Sticker visual customization is done via the Attachment prop on <Channel>,
//     which lets us render a transparent sticker image INSIDE Stream's message
//     bubble system. Stream's full gesture/overlay stack remains intact.
//   - The Attachment component is defined in workspace-chat.tsx and passed to
//     <Channel Attachment={CustomAttachment} />.
//
// This file is now minimal — just delegates everything to MessageSimple.

import React, { memo } from 'react';
import { MessageSimple } from 'stream-chat-expo';

export const StreamCustomMessage = memo(function StreamCustomMessage() {
  // Full delegation — Stream handles all gestures, overlay, reactions, delete.
  // Sticker appearance is customised via the Attachment prop on <Channel>.
  return <MessageSimple />;
});