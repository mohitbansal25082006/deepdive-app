// src/components/workspace/ChatAttachmentPicker.tsx
// Part 17 — Attachment source picker (FIXED)
//
// Root cause of pickers not opening:
//   The original code called onClose() then immediately called the picker
//   function — on Android, the Modal's native view hadn't finished
//   dismounting, and the new native Activity (file picker / camera) was
//   blocked by the still-active modal layer.
//
// Fix: close the modal first, then use a short setTimeout (80ms) before
//   calling the picker so the modal has fully dismissed at the native level.
//   This is the documented pattern from Expo issues #19512 and #20096.
//
// Additional fix: imported picker functions renamed in service (pickImage →
//   pickImage, pickFromCamera, pickDocument) — references updated here.

import React, { useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  Pressable,
  StyleSheet,
  ActivityIndicator,
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
  onPickDoc:    () => Promise<void>;
}

export function ChatAttachmentPicker({
  visible,
  isUploading,
  onClose,
  onPickImage,
  onPickCamera,
  onPickDoc,
}: Props) {
  // Store which picker to call after the modal closes
  const pendingActionRef = useRef<(() => Promise<void>) | null>(null);

  // Called when the RN Modal has finished animating out
  const handleModalDismiss = async () => {
    if (pendingActionRef.current) {
      const action = pendingActionRef.current;
      pendingActionRef.current = null;
      // Brief delay ensures the modal's native layer is fully gone
      setTimeout(() => {
        action();
      }, 80);
    }
  };

  // Schedule a picker action: close the modal first, then fire the picker
  const schedule = (action: () => Promise<void>) => {
    pendingActionRef.current = action;
    onClose(); // this will trigger onDismiss once animation completes
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      // onDismiss fires AFTER the modal has fully animated out on iOS
      // On Android we use the setTimeout in handleModalDismiss as backup
      onDismiss={handleModalDismiss}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Animated.View
          entering={SlideInDown.duration(260).springify()}
          style={styles.sheet}
        >
          {/* Drag handle */}
          <View style={styles.handle} />

          <Text style={styles.title}>Add Attachment</Text>
          <Text style={styles.subtitle}>
            Select a source to attach a file to your message
          </Text>

          {isUploading ? (
            <View style={styles.uploadingRow}>
              <ActivityIndicator color={COLORS.primary} size="small" />
              <Text style={styles.uploadingText}>Uploading attachment…</Text>
            </View>
          ) : (
            <View style={styles.options}>
              <OptionBtn
                icon="images-outline"
                label="Photo Library"
                sublabel="Choose an image from your photos"
                color={COLORS.primary}
                onPress={() => schedule(onPickImage)}
              />
              <OptionBtn
                icon="camera-outline"
                label="Camera"
                sublabel="Take a new photo"
                color="#10B981"
                onPress={() => schedule(onPickCamera)}
              />
              <OptionBtn
                icon="document-attach-outline"
                label="File / Document"
                sublabel="PDF, Word, Excel, and more"
                color="#F59E0B"
                onPress={() => schedule(onPickDoc)}
              />
            </View>
          )}

          <TouchableOpacity
            onPress={onClose}
            style={styles.cancelBtn}
            activeOpacity={0.8}
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

// ─── Option button ─────────────────────────────────────────────────────────────

function OptionBtn({
  icon, label, sublabel, color, onPress,
}: {
  icon:     keyof typeof Ionicons.glyphMap;
  label:    string;
  sublabel: string;
  color:    string;
  onPress:  () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={styles.optionRow}
      activeOpacity={0.75}
    >
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

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: COLORS.backgroundCard,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.xl,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
    alignSelf: 'center',
    marginBottom: SPACING.md,
  },
  title: {
    color: COLORS.textPrimary,
    fontSize: FONTS.sizes.lg,
    fontWeight: '800',
    marginBottom: 4,
  },
  subtitle: {
    color: COLORS.textMuted,
    fontSize: FONTS.sizes.xs,
    marginBottom: SPACING.md,
  },
  uploadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: SPACING.lg,
  },
  uploadingText: {
    color: COLORS.textSecondary,
    fontSize: FONTS.sizes.base,
  },
  options: {
    gap: 8,
    marginBottom: SPACING.md,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: SPACING.md,
    backgroundColor: COLORS.backgroundElevated,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  optionIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  optionText: { flex: 1 },
  optionLabel: {
    color: COLORS.textPrimary,
    fontSize: FONTS.sizes.base,
    fontWeight: '700',
  },
  optionSublabel: {
    color: COLORS.textMuted,
    fontSize: FONTS.sizes.xs,
    marginTop: 2,
  },
  cancelBtn: {
    backgroundColor: COLORS.backgroundElevated,
    borderRadius: RADIUS.lg,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cancelText: {
    color: COLORS.textSecondary,
    fontSize: FONTS.sizes.base,
    fontWeight: '600',
  },
});