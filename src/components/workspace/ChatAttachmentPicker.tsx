// src/components/workspace/ChatAttachmentPicker.tsx
// Part 18C — Added Audio option alongside Video

import React, { useRef } from 'react';
import {
  View, Text, TouchableOpacity, Modal, Pressable,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import Animated, { SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';

interface Props {
  visible:      boolean;
  isUploading:  boolean;
  onClose:      () => void;
  onPickImage:  () => Promise<void>;
  onPickCamera: () => Promise<void>;
  onPickVideo:  () => Promise<void>;
  onPickAudio:  () => Promise<void>;   // ← Part 18C
  onPickDoc:    () => Promise<void>;
}

export function ChatAttachmentPicker({
  visible, isUploading, onClose,
  onPickImage, onPickCamera, onPickVideo, onPickAudio, onPickDoc,
}: Props) {
  const pendingActionRef = useRef<(() => Promise<void>) | null>(null);

  const handleModalDismiss = async () => {
    if (pendingActionRef.current) {
      const action = pendingActionRef.current;
      pendingActionRef.current = null;
      setTimeout(() => action(), 80);
    }
  };

  const schedule = (action: () => Promise<void>) => {
    pendingActionRef.current = action;
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      onDismiss={handleModalDismiss}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Animated.View entering={SlideInDown.duration(260).springify()} style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>Add Attachment</Text>
          <Text style={styles.subtitle}>Choose a source to attach to your message</Text>

          {isUploading ? (
            <View style={styles.uploadingRow}>
              <ActivityIndicator color={COLORS.primary} size="small" />
              <Text style={styles.uploadingText}>Uploading attachment…</Text>
            </View>
          ) : (
            <View style={styles.options}>
              <OptionBtn icon="images-outline"         label="Photo Library" sublabel="Choose an image from your photos"     color={COLORS.primary}  onPress={() => schedule(onPickImage)}  />
              <OptionBtn icon="camera-outline"         label="Camera"        sublabel="Take a new photo"                     color="#10B981"         onPress={() => schedule(onPickCamera)} />
              <OptionBtn icon="videocam-outline"       label="Video"         sublabel="Choose a video from your library"     color="#8B5CF6"         onPress={() => schedule(onPickVideo)}  />
              <OptionBtn icon="musical-notes-outline"  label="Audio"         sublabel="Choose an audio file (MP3, AAC, WAV…)" color="#F59E0B"        onPress={() => schedule(onPickAudio)}  />
              <OptionBtn icon="document-attach-outline" label="Document"    sublabel="PDF, Word, Excel, PowerPoint, CSV"    color="#06B6D4"         onPress={() => schedule(onPickDoc)}    />
            </View>
          )}

          <TouchableOpacity onPress={onClose} style={styles.cancelBtn} activeOpacity={0.8}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

function OptionBtn({ icon, label, sublabel, color, onPress }: {
  icon: keyof typeof Ionicons.glyphMap; label: string; sublabel: string; color: string; onPress: () => void;
}) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.optionRow} activeOpacity={0.75}>
      <View style={[styles.optionIcon, { backgroundColor: `${color}18` }]}>
        <Ionicons name={icon} size={22} color={color} />
      </View>
      <View style={styles.optionText}>
        <Text style={styles.optionLabel}>{label}</Text>
        <Text style={styles.optionSublabel}>{sublabel}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  overlay:       { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet:         { backgroundColor: COLORS.backgroundCard, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: SPACING.xl, paddingTop: SPACING.sm, paddingBottom: SPACING.xl, borderTopWidth: 1, borderTopColor: COLORS.border },
  handle:        { width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.border, alignSelf: 'center', marginBottom: SPACING.md },
  title:         { color: COLORS.textPrimary, fontSize: FONTS.sizes.lg, fontWeight: '800', marginBottom: 4 },
  subtitle:      { color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginBottom: SPACING.md },
  uploadingRow:  { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: SPACING.lg },
  uploadingText: { color: COLORS.textSecondary, fontSize: FONTS.sizes.base },
  options:       { gap: 8, marginBottom: SPACING.md },
  optionRow:     { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, paddingHorizontal: SPACING.md, backgroundColor: COLORS.backgroundElevated, borderRadius: RADIUS.xl, borderWidth: 1, borderColor: COLORS.border },
  optionIcon:    { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  optionText:    { flex: 1 },
  optionLabel:   { color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '700' },
  optionSublabel:{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 2 },
  cancelBtn:     { backgroundColor: COLORS.backgroundElevated, borderRadius: RADIUS.lg, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  cancelText:    { color: COLORS.textSecondary, fontSize: FONTS.sizes.base, fontWeight: '600' },
});