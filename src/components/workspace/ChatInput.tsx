// src/components/workspace/ChatInput.tsx
// Part 17 — Chat message composer with image/file attachment support (FIXED)
//
// Fixes applied:
//   1. Import names updated to match fixed service: pickImage, pickFromCamera,
//      pickDocument (was: pickImage with fromCamera flag, now two separate fns)
//   2. addAndUpload now surfaces errors via Alert instead of silently failing
//   3. workspaceId prop required (was missing in original — caused upload crash)

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Alert,
  Animated as RNAnimated,
} from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

import {
  StagedAttachment,
  pickImage,
  pickFromCamera,
  pickDocument,
  uploadAttachment,
} from '../../services/chatAttachmentService';
import { ChatAttachment, ChatMessage } from '../../types/chat';
import { ChatAttachmentPicker } from './ChatAttachmentPicker';
import { StagedAttachmentsStrip } from './ChatAttachmentPreview';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';
import { useAuth } from '../../context/AuthContext';

// Quick emoji bar
const EMOJI_BAR = ['👍', '❤️', '😂', '🔥', '✅', '👀', '🎯', '💡'];

interface Props {
  workspaceId:    string;
  replyingTo:     ChatMessage | null;
  editingMessage: ChatMessage | null;
  isSending:      boolean;
  onSend:         (text: string, replyToId?: string, attachments?: ChatAttachment[]) => void;
  onCancelReply:  () => void;
  onCancelEdit:   () => void;
  onSaveEdit:     (messageId: string, newContent: string) => void;
  onTyping:       (isTyping: boolean) => void;
}

export function ChatInput({
  workspaceId,
  replyingTo,
  editingMessage,
  isSending,
  onSend,
  onCancelReply,
  onCancelEdit,
  onSaveEdit,
  onTyping,
}: Props) {
  const { user } = useAuth();
  const [text,       setText]       = useState('');
  const [focused,    setFocused]    = useState(false);
  const [showEmoji,  setShowEmoji]  = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [staged,     setStaged]     = useState<StagedAttachment[]>([]);

  const inputRef       = useRef<TextInput>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sendBtnScale   = useRef(new RNAnimated.Value(1)).current;

  // Pre-fill text in edit mode
  useEffect(() => {
    if (editingMessage) {
      setText(editingMessage.content);
      setTimeout(() => inputRef.current?.focus(), 120);
    }
  }, [editingMessage?.id]);

  // Typing broadcast
  const handleTextChange = useCallback((val: string) => {
    setText(val);
    if (val.length > 0) {
      onTyping(true);
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      typingTimerRef.current = setTimeout(() => onTyping(false), 3000);
    } else {
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      onTyping(false);
    }
  }, [onTyping]);

  useEffect(() => {
    return () => { if (typingTimerRef.current) clearTimeout(typingTimerRef.current); };
  }, []);

  // ── Attachment state helpers ─────────────────────────────────────────────────

  const isUploading = staged.some(s => s.status === 'uploading');
  const hasError    = staged.some(s => s.status === 'error');
  const uploadedAttachments: ChatAttachment[] = staged
    .filter(s => s.status === 'done' && s.remoteUrl)
    .map(s => ({
      url:  s.remoteUrl!,
      name: s.name,
      type: s.mimeType,
      size: s.size,
    }));

  // ── Upload a staged item, tracking progress in state ────────────────────────

  const startUpload = useCallback(async (item: StagedAttachment) => {
    if (!user || !workspaceId) {
      Alert.alert('Upload Error', 'You must be logged in to upload files.');
      return;
    }

    setStaged(prev =>
      prev.map(s => s.localId === item.localId
        ? { ...s, status: 'uploading', progress: 0 }
        : s,
      ),
    );

    const result = await uploadAttachment(
      item,
      workspaceId,
      user.id,
      (pct) => {
        setStaged(prev =>
          prev.map(s => s.localId === item.localId ? { ...s, progress: pct } : s),
        );
      },
    );

    if (result.error || !result.attachment) {
      setStaged(prev =>
        prev.map(s =>
          s.localId === item.localId
            ? { ...s, status: 'error', errorMsg: result.error ?? 'Upload failed' }
            : s,
        ),
      );
      Alert.alert('Upload Failed', result.error ?? 'Could not upload the file. Please try again.');
    } else {
      setStaged(prev =>
        prev.map(s =>
          s.localId === item.localId
            ? { ...s, status: 'done', progress: 100, remoteUrl: result.attachment!.url }
            : s,
        ),
      );
    }
  }, [user, workspaceId]);

  // Add a picked item to staged list and immediately start uploading
  const addAndUpload = useCallback((item: StagedAttachment) => {
    setStaged(prev => [...prev, item]);
    startUpload(item);
  }, [startUpload]);

  const handleRemoveStaged = useCallback((localId: string) => {
    setStaged(prev => prev.filter(s => s.localId !== localId));
  }, []);

  // ── Picker handlers (called AFTER modal is fully dismissed) ──────────────────

  const handlePickImage = useCallback(async () => {
    const { item, error } = await pickImage();
    if (error) Alert.alert('Photo Library', error);
    if (item) addAndUpload(item);
  }, [addAndUpload]);

  const handlePickCamera = useCallback(async () => {
    const { item, error } = await pickFromCamera();
    if (error) Alert.alert('Camera', error);
    if (item) addAndUpload(item);
  }, [addAndUpload]);

  const handlePickDoc = useCallback(async () => {
    const { item, error } = await pickDocument();
    if (error) Alert.alert('File Picker', error);
    if (item) addAndUpload(item);
  }, [addAndUpload]);

  // ── Send ─────────────────────────────────────────────────────────────────────

  const handleSend = () => {
    const trimmed    = text.trim();
    const hasContent = trimmed.length > 0 || uploadedAttachments.length > 0;
    if (!hasContent || isSending || isUploading) return;

    if (editingMessage) {
      if (trimmed !== editingMessage.content) {
        onSaveEdit(editingMessage.id, trimmed);
      } else {
        onCancelEdit();
      }
    } else {
      onSend(
        trimmed,
        replyingTo?.id,
        uploadedAttachments.length > 0 ? uploadedAttachments : undefined,
      );
      setStaged([]);
    }

    setText('');
    onTyping(false);
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);

    RNAnimated.sequence([
      RNAnimated.timing(sendBtnScale, { toValue: 0.88, duration: 80, useNativeDriver: true }),
      RNAnimated.timing(sendBtnScale, { toValue: 1,    duration: 80, useNativeDriver: true }),
    ]).start();
  };

  const canSend    = (text.trim().length > 0 || uploadedAttachments.length > 0) && !isSending && !isUploading;
  const isEditing  = !!editingMessage;
  const isReplying = !!replyingTo && !isEditing;

  return (
    <>
      {/* Staged attachments strip (above input) */}
      <StagedAttachmentsStrip attachments={staged} onRemove={handleRemoveStaged} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <View style={styles.container}>

          {/* Edit banner */}
          {isEditing && (
            <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)} style={styles.contextBanner}>
              <View style={[styles.contextBar, { backgroundColor: COLORS.warning }]} />
              <Ionicons name="pencil-outline" size={14} color={COLORS.warning} style={styles.contextIcon} />
              <View style={styles.contextContent}>
                <Text style={[styles.contextTitle, { color: COLORS.warning }]}>Editing message</Text>
                <Text style={styles.contextPreview} numberOfLines={1}>{editingMessage?.content}</Text>
              </View>
              <TouchableOpacity onPress={onCancelEdit} style={styles.contextClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={16} color={COLORS.textMuted} />
              </TouchableOpacity>
            </Animated.View>
          )}

          {/* Reply banner */}
          {isReplying && (
            <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)} style={styles.contextBanner}>
              <View style={[styles.contextBar, { backgroundColor: COLORS.primary }]} />
              <Ionicons name="return-down-forward-outline" size={14} color={COLORS.primary} style={styles.contextIcon} />
              <View style={styles.contextContent}>
                <Text style={[styles.contextTitle, { color: COLORS.primary }]}>
                  {replyingTo?.author?.fullName ?? replyingTo?.author?.username ?? 'Someone'}
                </Text>
                <Text style={styles.contextPreview} numberOfLines={1}>{replyingTo?.content}</Text>
              </View>
              <TouchableOpacity onPress={onCancelReply} style={styles.contextClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={16} color={COLORS.textMuted} />
              </TouchableOpacity>
            </Animated.View>
          )}

          {/* Emoji quick-bar */}
          {showEmoji && (
            <Animated.View entering={SlideInDown.duration(200)} exiting={SlideOutDown.duration(150)} style={styles.emojiBar}>
              {EMOJI_BAR.map((emoji) => (
                <TouchableOpacity
                  key={emoji}
                  onPress={() => { handleTextChange(text + emoji); setShowEmoji(false); }}
                  style={styles.emojiBtn}
                  activeOpacity={0.7}
                >
                  <Text style={styles.emojiBtnText}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </Animated.View>
          )}

          {/* Input row */}
          <View style={[styles.inputRow, focused && styles.inputRowFocused]}>

            {/* Emoji toggle */}
            <TouchableOpacity onPress={() => setShowEmoji(v => !v)} style={styles.sideBtn} activeOpacity={0.7}>
              <Ionicons
                name={showEmoji ? 'happy' : 'happy-outline'}
                size={22}
                color={showEmoji ? COLORS.primary : COLORS.textMuted}
              />
            </TouchableOpacity>

            {/* Attachment button (hidden in edit mode) */}
            {!isEditing && (
              <TouchableOpacity
                onPress={() => setShowPicker(true)}
                style={[styles.sideBtn, isUploading && styles.sideBtnDisabled]}
                activeOpacity={0.7}
                disabled={isUploading}
              >
                <Ionicons
                  name={staged.length > 0 ? 'attach' : 'attach-outline'}
                  size={22}
                  color={staged.length > 0 ? COLORS.primary : COLORS.textMuted}
                />
                {staged.length > 0 && (
                  <View style={styles.attachBadge}>
                    <Text style={styles.attachBadgeText}>{staged.length}</Text>
                  </View>
                )}
              </TouchableOpacity>
            )}

            {/* Text input */}
            <TextInput
              ref={inputRef}
              value={text}
              onChangeText={handleTextChange}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder={
                isEditing         ? 'Edit your message…'         :
                isReplying        ? 'Write a reply…'             :
                staged.length > 0 ? 'Add a caption (optional)…' :
                'Message…'
              }
              placeholderTextColor={COLORS.textMuted}
              style={styles.input}
              multiline
              maxLength={4000}
              returnKeyType="default"
              blurOnSubmit={false}
            />

            {/* Upload spinner indicator */}
            {isUploading && (
              <Animated.View entering={FadeIn.duration(150)} style={styles.uploadIndicator}>
                <Ionicons name="cloud-upload-outline" size={17} color={COLORS.primary} />
              </Animated.View>
            )}

            {/* Send / Save button */}
            <RNAnimated.View style={{ transform: [{ scale: sendBtnScale }] }}>
              <TouchableOpacity
                onPress={handleSend}
                disabled={!canSend}
                activeOpacity={0.8}
                style={[styles.sendBtn, canSend ? styles.sendBtnActive : styles.sendBtnInactive]}
              >
                <Ionicons
                  name={isEditing ? 'checkmark' : 'send'}
                  size={16}
                  color={canSend ? '#FFF' : COLORS.textMuted}
                />
              </TouchableOpacity>
            </RNAnimated.View>
          </View>

          {/* Error hint */}
          {hasError && (
            <Animated.View entering={FadeIn.duration(200)} style={styles.errorHint}>
              <Ionicons name="alert-circle-outline" size={12} color={COLORS.error} />
              <Text style={styles.errorHintText}>
                Some files failed to upload. Tap them to remove, then try again.
              </Text>
            </Animated.View>
          )}
        </View>
      </KeyboardAvoidingView>

      {/* Attachment picker sheet */}
      <ChatAttachmentPicker
        visible={showPicker}
        isUploading={isUploading}
        onClose={() => setShowPicker(false)}
        onPickImage={handlePickImage}
        onPickCamera={handlePickCamera}
        onPickDoc={handlePickDoc}
      />
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.backgroundCard,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  contextBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: 8,
  },
  contextBar:     { width: 3, height: '100%', borderRadius: 2, minHeight: 28, flexShrink: 0 },
  contextIcon:    { flexShrink: 0 },
  contextContent: { flex: 1 },
  contextTitle:   { fontSize: FONTS.sizes.xs, fontWeight: '700', marginBottom: 1 },
  contextPreview: { color: COLORS.textMuted, fontSize: FONTS.sizes.xs, lineHeight: 15 },
  contextClose: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: COLORS.backgroundElevated,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  emojiBar: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    gap: 4,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  emojiBtn: {
    flex: 1, height: 38, borderRadius: RADIUS.md,
    backgroundColor: COLORS.backgroundElevated,
    alignItems: 'center', justifyContent: 'center',
  },
  emojiBtnText: { fontSize: 20 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    gap: 6,
  },
  inputRowFocused: {},
  sideBtn: {
    width: 36, height: 36,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  sideBtnDisabled: { opacity: 0.35 },
  attachBadge: {
    position: 'absolute', top: 0, right: 0,
    backgroundColor: COLORS.primary,
    borderRadius: 8, minWidth: 14, height: 14,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2,
    borderWidth: 1.5, borderColor: COLORS.backgroundCard,
  },
  attachBadgeText: { color: '#FFF', fontSize: 8, fontWeight: '800' },
  input: {
    flex: 1,
    color: COLORS.textPrimary,
    fontSize: FONTS.sizes.base,
    lineHeight: 22,
    maxHeight: 120,
    paddingTop: 8, paddingBottom: 8, paddingHorizontal: 12,
    backgroundColor: COLORS.backgroundElevated,
    borderRadius: RADIUS.xl,
    borderWidth: 1, borderColor: COLORS.border,
    textAlignVertical: 'top',
  },
  uploadIndicator: {
    width: 32, height: 32,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  sendBtnActive: {
    backgroundColor: COLORS.primary,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 4,
  },
  sendBtnInactive: {
    backgroundColor: COLORS.backgroundElevated,
    borderWidth: 1, borderColor: COLORS.border,
  },
  errorHint: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: SPACING.xl, paddingBottom: SPACING.sm,
  },
  errorHintText: { color: COLORS.error, fontSize: FONTS.sizes.xs, flex: 1 },
});