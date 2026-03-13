// src/components/workspace/InviteModal.tsx
// FIX: Copy now writes the raw invite code string (not the deepdive:// URL).
// FIX: Regenerate Code button removed.
// FIX: Share Invite Link button removed.

import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, Modal,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';
import * as Clipboard from 'expo-clipboard';
import { Workspace } from '../../types';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';

interface Props {
  workspace:       Workspace;
  visible:         boolean;
  isOwner:         boolean;
  onClose:         () => void;
  onCodeUpdated:   (newCode: string) => void;
}

export function InviteModal({ workspace, visible, isOwner, onClose, onCodeUpdated }: Props) {
  const [copied, setCopied] = useState(false);
  const code = workspace.inviteCode ?? '';

  // ── Copy just the raw invite code ──────────────────────────────────────────
  const handleCopyCode = async () => {
    await Clipboard.setStringAsync(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Animated.View entering={FadeIn.duration(200)} style={styles.backdrop}>
        <TouchableOpacity style={{ flex: 1 }} onPress={onClose} activeOpacity={1} />

        <Animated.View entering={SlideInDown.duration(350).springify()} style={styles.sheet}>
          {/* Handle */}
          <View style={styles.handle} />

          {/* Header */}
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Invite to Workspace</Text>
              <Text style={styles.subtitle} numberOfLines={1}>
                {workspace.name}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={18} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>

          <Text style={styles.desc}>
            Share this code so others can join as a Viewer. Only Editors and Owners can add reports or leave comments.
          </Text>

          {/* Code display — tap to copy */}
          <TouchableOpacity onPress={handleCopyCode} style={styles.codeBox} activeOpacity={0.8}>
            <View style={styles.codeLeft}>
              <Text style={styles.codeLabel}>INVITE CODE</Text>
              <Text style={styles.codeText} selectable>{code}</Text>
            </View>
            <View style={[styles.copyChip, copied && styles.copyChipDone]}>
              <Ionicons
                name={copied ? 'checkmark' : 'copy-outline'}
                size={16}
                color={copied ? COLORS.success : COLORS.primary}
              />
              <Text style={[styles.copyText, { color: copied ? COLORS.success : COLORS.primary }]}>
                {copied ? 'Copied!' : 'Copy'}
              </Text>
            </View>
          </TouchableOpacity>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: COLORS.backgroundCard,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    padding: SPACING.xl,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.xl,
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: COLORS.border,
    alignSelf: 'center', marginBottom: SPACING.lg,
  },
  headerRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    marginBottom: SPACING.sm,
  },
  title:    { color: COLORS.textPrimary, fontSize: FONTS.sizes.lg, fontWeight: '800' },
  subtitle: { color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 2 },
  closeBtn: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: COLORS.backgroundElevated,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: COLORS.border,
    marginLeft: SPACING.md,
  },
  desc: {
    color: COLORS.textSecondary,
    fontSize: FONTS.sizes.sm,
    lineHeight: 20,
    marginBottom: SPACING.lg,
  },

  // Code box
  codeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.backgroundElevated,
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: `${COLORS.primary}35`,
  },
  codeLeft:  { flex: 1 },
  codeLabel: {
    color: COLORS.textMuted,
    fontSize: FONTS.sizes.xs,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: 6,
  },
  codeText: {
    color: COLORS.textPrimary,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 4,
  },
  copyChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: `${COLORS.primary}15`,
    borderRadius: RADIUS.lg,
    paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1, borderColor: `${COLORS.primary}30`,
    marginLeft: SPACING.md,
  },
  copyChipDone: {
    backgroundColor: `${COLORS.success}12`,
    borderColor: `${COLORS.success}30`,
  },
  copyText: { fontSize: FONTS.sizes.sm, fontWeight: '700' },
});