// src/components/workspace/ChatInput.tsx
// Part 18C — Added audio picker + onPickAudio wired through ChatAttachmentPicker

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, StyleSheet, Alert,
  Animated as RNAnimated,
} from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import {
  StagedAttachment, pickImage, pickFromCamera,
  pickVideo, pickAudio, pickDocument, uploadAttachment,
} from '../../services/chatAttachmentService';
import { ChatAttachment, ChatMessage, ChatMember, ActiveMentionQuery } from '../../types/chat';
import { ChatAttachmentPicker } from './ChatAttachmentPicker';
import { StagedAttachmentsStrip } from './ChatAttachmentPreview';
import { MentionSuggestions } from './MentionSuggestions';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';
import { useAuth } from '../../context/AuthContext';

const EMOJI_BAR = ['👍', '❤️', '😂', '🔥', '✅', '👀', '🎯', '💡'];

interface Props {
  workspaceId:    string;
  replyingTo:     ChatMessage | null;
  editingMessage: ChatMessage | null;
  isSending:      boolean;
  chatMembers:    ChatMember[];
  onSend:         (text: string, replyToId?: string, attachments?: ChatAttachment[], mentions?: string[]) => void;
  onCancelReply:  () => void;
  onCancelEdit:   () => void;
  onSaveEdit:     (messageId: string, newContent: string) => void;
  onTyping:       (isTyping: boolean) => void;
}

function detectMentionQuery(text: string, cursorPos: number): ActiveMentionQuery | null {
  const before = text.slice(0, cursorPos);
  const atIdx  = before.lastIndexOf('@');
  if (atIdx === -1) return null;
  const between = before.slice(atIdx + 1);
  if (/\s/.test(between)) return null;
  return { query: between, atPosition: atIdx };
}

function replaceMentionToken(text: string, atPosition: number, query: string, username: string): string {
  return `${text.slice(0, atPosition)}@${username} ${text.slice(atPosition + 1 + query.length)}`;
}

export function ChatInput({
  workspaceId, replyingTo, editingMessage, isSending,
  chatMembers, onSend, onCancelReply, onCancelEdit, onSaveEdit, onTyping,
}: Props) {
  const { user } = useAuth();

  const [text,              setText]              = useState('');
  const [focused,           setFocused]           = useState(false);
  const [showEmoji,         setShowEmoji]         = useState(false);
  const [showPicker,        setShowPicker]        = useState(false);
  const [staged,            setStaged]            = useState<StagedAttachment[]>([]);
  const [activeMention,     setActiveMention]     = useState<ActiveMentionQuery | null>(null);
  const [pendingMentionIds, setPendingMentionIds] = useState<string[]>([]);

  const inputRef       = useRef<TextInput>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sendBtnScale   = useRef(new RNAnimated.Value(1)).current;
  const cursorPosRef   = useRef<number>(0);

  useEffect(() => {
    if (editingMessage) {
      setText(editingMessage.content);
      setPendingMentionIds([]);
      setTimeout(() => inputRef.current?.focus(), 120);
    }
  }, [editingMessage?.id]);

  const handleTextChange = useCallback((val: string) => {
    setText(val);
    setActiveMention(detectMentionQuery(val, cursorPosRef.current > 0 ? cursorPosRef.current : val.length));
    if (val.length > 0) {
      onTyping(true);
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      typingTimerRef.current = setTimeout(() => onTyping(false), 3000);
    } else {
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      onTyping(false);
    }
  }, [onTyping]);

  const handleSelectionChange = useCallback((e: { nativeEvent: { selection: { start: number; end: number } } }) => {
    cursorPosRef.current = e.nativeEvent.selection.end;
    setActiveMention(detectMentionQuery(text, e.nativeEvent.selection.end));
  }, [text]);

  useEffect(() => () => { if (typingTimerRef.current) clearTimeout(typingTimerRef.current); }, []);

  const handleMentionSelect = useCallback((member: ChatMember) => {
    if (!activeMention) return;
    const name = member.username ?? member.userId;
    setText(replaceMentionToken(text, activeMention.atPosition, activeMention.query, name));
    setActiveMention(null);
    setPendingMentionIds(prev => prev.includes(member.userId) ? prev : [...prev, member.userId]);
    const newCursor = activeMention.atPosition + name.length + 2;
    setTimeout(() => inputRef.current?.setNativeProps({ selection: { start: newCursor, end: newCursor } }), 50);
  }, [activeMention, text]);

  const isUploading = staged.some(s => s.status === 'uploading');
  const hasError    = staged.some(s => s.status === 'error');
  const uploadedAttachments: ChatAttachment[] = staged
    .filter(s => s.status === 'done' && s.remoteUrl)
    .map(s => ({ url: s.remoteUrl!, name: s.name, type: s.mimeType, size: s.size }));

  const startUpload = useCallback(async (item: StagedAttachment) => {
    if (!user || !workspaceId) { Alert.alert('Error', 'You must be logged in.'); return; }
    setStaged(prev => prev.map(s => s.localId === item.localId ? { ...s, status: 'uploading', progress: 0 } : s));
    const result = await uploadAttachment(item, workspaceId, user.id, pct => {
      setStaged(prev => prev.map(s => s.localId === item.localId ? { ...s, progress: pct } : s));
    });
    if (result.error || !result.attachment) {
      setStaged(prev => prev.map(s => s.localId === item.localId ? { ...s, status: 'error', errorMsg: result.error ?? 'Upload failed' } : s));
      Alert.alert('Upload Failed', result.error ?? 'Could not upload the file.');
    } else {
      setStaged(prev => prev.map(s => s.localId === item.localId ? { ...s, status: 'done', progress: 100, remoteUrl: result.attachment!.url } : s));
    }
  }, [user, workspaceId]);

  const addAndUpload = useCallback((item: StagedAttachment) => {
    setStaged(prev => [...prev, item]);
    startUpload(item);
  }, [startUpload]);

  const handleRemoveStaged = useCallback((localId: string) => setStaged(prev => prev.filter(s => s.localId !== localId)), []);
  const handlePickImage  = useCallback(async () => { const r = await pickImage();      if (r.error) Alert.alert('Photos',   r.error); if (r.item) addAndUpload(r.item); }, [addAndUpload]);
  const handlePickCamera = useCallback(async () => { const r = await pickFromCamera(); if (r.error) Alert.alert('Camera',   r.error); if (r.item) addAndUpload(r.item); }, [addAndUpload]);
  const handlePickVideo  = useCallback(async () => { const r = await pickVideo();       if (r.error) Alert.alert('Video',    r.error); if (r.item) addAndUpload(r.item); }, [addAndUpload]);
  const handlePickAudio  = useCallback(async () => { const r = await pickAudio();       if (r.error) Alert.alert('Audio',    r.error); if (r.item) addAndUpload(r.item); }, [addAndUpload]);
  const handlePickDoc    = useCallback(async () => { const r = await pickDocument();   if (r.error) Alert.alert('Document', r.error); if (r.item) addAndUpload(r.item); }, [addAndUpload]);

  const handleSend = useCallback(() => {
    const trimmed    = text.trim();
    const hasContent = trimmed.length > 0 || uploadedAttachments.length > 0;
    if (!hasContent || isSending || isUploading) return;
    if (editingMessage) {
      if (trimmed !== editingMessage.content) onSaveEdit(editingMessage.id, trimmed);
      else onCancelEdit();
    } else {
      onSend(trimmed, replyingTo?.id, uploadedAttachments.length > 0 ? uploadedAttachments : undefined, pendingMentionIds.length > 0 ? pendingMentionIds : undefined);
      setStaged([]); setPendingMentionIds([]);
    }
    setText(''); setActiveMention(null); onTyping(false);
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    RNAnimated.sequence([
      RNAnimated.timing(sendBtnScale, { toValue: 0.88, duration: 80, useNativeDriver: true }),
      RNAnimated.timing(sendBtnScale, { toValue: 1,    duration: 80, useNativeDriver: true }),
    ]).start();
  }, [text, uploadedAttachments, isSending, isUploading, editingMessage, replyingTo, pendingMentionIds, onSend, onSaveEdit, onCancelEdit, onTyping, sendBtnScale]);

  const canSend    = (text.trim().length > 0 || uploadedAttachments.length > 0) && !isSending && !isUploading;
  const isEditing  = !!editingMessage;
  const isReplying = !!replyingTo && !isEditing;

  return (
    <>
      <StagedAttachmentsStrip attachments={staged} onRemove={handleRemoveStaged} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
        <View style={styles.container}>

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

          {isReplying && (
            <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)} style={styles.contextBanner}>
              <View style={[styles.contextBar, { backgroundColor: COLORS.primary }]} />
              <Ionicons name="return-down-forward-outline" size={14} color={COLORS.primary} style={styles.contextIcon} />
              <View style={styles.contextContent}>
                <Text style={[styles.contextTitle, { color: COLORS.primary }]}>{replyingTo?.author?.fullName ?? replyingTo?.author?.username ?? 'Someone'}</Text>
                <Text style={styles.contextPreview} numberOfLines={1}>{replyingTo?.content}</Text>
              </View>
              <TouchableOpacity onPress={onCancelReply} style={styles.contextClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={16} color={COLORS.textMuted} />
              </TouchableOpacity>
            </Animated.View>
          )}

          {showEmoji && (
            <Animated.View entering={SlideInDown.duration(200)} exiting={SlideOutDown.duration(150)} style={styles.emojiBar}>
              {EMOJI_BAR.map(emoji => (
                <TouchableOpacity key={emoji} onPress={() => { handleTextChange(text + emoji); setShowEmoji(false); }} style={styles.emojiBtn} activeOpacity={0.7}>
                  <Text style={styles.emojiBtnText}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </Animated.View>
          )}

          <View style={[styles.inputRow, focused && styles.inputRowFocused]}>
            <TouchableOpacity onPress={() => setShowEmoji(v => !v)} style={styles.sideBtn} activeOpacity={0.7}>
              <Ionicons name={showEmoji ? 'happy' : 'happy-outline'} size={22} color={showEmoji ? COLORS.primary : COLORS.textMuted} />
            </TouchableOpacity>
            {!isEditing && (
              <TouchableOpacity onPress={() => setShowPicker(true)} style={[styles.sideBtn, isUploading && styles.sideBtnDisabled]} activeOpacity={0.7} disabled={isUploading}>
                <Ionicons name={staged.length > 0 ? 'attach' : 'attach-outline'} size={22} color={staged.length > 0 ? COLORS.primary : COLORS.textMuted} />
                {staged.length > 0 && <View style={styles.attachBadge}><Text style={styles.attachBadgeText}>{staged.length}</Text></View>}
              </TouchableOpacity>
            )}
            <View style={styles.inputWrap}>
              <MentionSuggestions visible={!!activeMention} query={activeMention?.query ?? ''} members={chatMembers} onSelect={handleMentionSelect} onDismiss={() => setActiveMention(null)} />
              <TextInput
                ref={inputRef}
                value={text}
                onChangeText={handleTextChange}
                onSelectionChange={handleSelectionChange}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                placeholder={isEditing ? 'Edit your message…' : isReplying ? 'Write a reply…' : staged.length > 0 ? 'Add a caption (optional)…' : 'Message… (@ to mention)'}
                placeholderTextColor={COLORS.textMuted}
                style={styles.input}
                multiline maxLength={4000} returnKeyType="default" blurOnSubmit={false}
              />
            </View>
            {isUploading && (
              <Animated.View entering={FadeIn.duration(150)} style={styles.uploadIndicator}>
                <Ionicons name="cloud-upload-outline" size={17} color={COLORS.primary} />
              </Animated.View>
            )}
            <RNAnimated.View style={{ transform: [{ scale: sendBtnScale }] }}>
              <TouchableOpacity onPress={handleSend} disabled={!canSend} activeOpacity={0.8} style={[styles.sendBtn, canSend ? styles.sendBtnActive : styles.sendBtnInactive]}>
                <Ionicons name={isEditing ? 'checkmark' : 'send'} size={16} color={canSend ? '#FFF' : COLORS.textMuted} />
              </TouchableOpacity>
            </RNAnimated.View>
          </View>

          {pendingMentionIds.length > 0 && !isEditing && (
            <Animated.View entering={FadeIn.duration(150)} style={styles.mentionHint}>
              <Ionicons name="at-outline" size={11} color={COLORS.primary} />
              <Text style={styles.mentionHintText}>{pendingMentionIds.length} mention{pendingMentionIds.length > 1 ? 's' : ''} will be notified</Text>
            </Animated.View>
          )}

          {hasError && (
            <Animated.View entering={FadeIn.duration(200)} style={styles.errorHint}>
              <Ionicons name="alert-circle-outline" size={12} color={COLORS.error} />
              <Text style={styles.errorHintText}>Some files failed to upload. Tap them to remove, then try again.</Text>
            </Animated.View>
          )}
        </View>
      </KeyboardAvoidingView>

      <ChatAttachmentPicker
        visible={showPicker}
        isUploading={isUploading}
        onClose={() => setShowPicker(false)}
        onPickImage={handlePickImage}
        onPickCamera={handlePickCamera}
        onPickVideo={handlePickVideo}
        onPickAudio={handlePickAudio}
        onPickDoc={handlePickDoc}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container:      { backgroundColor: COLORS.backgroundCard, borderTopWidth: 1, borderTopColor: COLORS.border },
  contextBanner:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.md, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: COLORS.border, gap: 8 },
  contextBar:     { width: 3, height: '100%', borderRadius: 2, minHeight: 28, flexShrink: 0 },
  contextIcon:    { flexShrink: 0 },
  contextContent: { flex: 1 },
  contextTitle:   { fontSize: FONTS.sizes.xs, fontWeight: '700', marginBottom: 1 },
  contextPreview: { color: COLORS.textMuted, fontSize: FONTS.sizes.xs, lineHeight: 15 },
  contextClose:   { width: 28, height: 28, borderRadius: 14, backgroundColor: COLORS.backgroundElevated, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  emojiBar:       { flexDirection: 'row', paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs, gap: 4, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  emojiBtn:       { flex: 1, height: 38, borderRadius: RADIUS.md, backgroundColor: COLORS.backgroundElevated, alignItems: 'center', justifyContent: 'center' },
  emojiBtnText:   { fontSize: 20 },
  inputRow:       { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, gap: 6 },
  inputRowFocused:{},
  sideBtn:        { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  sideBtnDisabled:{ opacity: 0.35 },
  attachBadge:    { position: 'absolute', top: 0, right: 0, backgroundColor: COLORS.primary, borderRadius: 8, minWidth: 14, height: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2, borderWidth: 1.5, borderColor: COLORS.backgroundCard },
  attachBadgeText:{ color: '#FFF', fontSize: 8, fontWeight: '800' },
  inputWrap:      { flex: 1, position: 'relative' },
  input:          { color: COLORS.textPrimary, fontSize: FONTS.sizes.base, lineHeight: 22, maxHeight: 120, paddingTop: 8, paddingBottom: 8, paddingHorizontal: 12, backgroundColor: COLORS.backgroundElevated, borderRadius: RADIUS.xl, borderWidth: 1, borderColor: COLORS.border, textAlignVertical: 'top' },
  uploadIndicator:{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  sendBtn:        { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  sendBtnActive:  { backgroundColor: COLORS.primary, shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.4, shadowRadius: 6, elevation: 4 },
  sendBtnInactive:{ backgroundColor: COLORS.backgroundElevated, borderWidth: 1, borderColor: COLORS.border },
  mentionHint:    { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: SPACING.xl, paddingBottom: 4 },
  mentionHintText:{ color: COLORS.primary, fontSize: FONTS.sizes.xs, fontWeight: '600' },
  errorHint:      { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: SPACING.xl, paddingBottom: SPACING.sm },
  errorHintText:  { color: COLORS.error, fontSize: FONTS.sizes.xs, flex: 1 },
});